// Unit tests for digest-dashboard start handler and registerTool (slice 6).
// Uses a temp HOME and PI_DIGEST_NO_BROWSER=1 to avoid real browsers.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  startDashboard,
  teardownDashboard,
  default as installExtension,
} from "../../.pi/extensions/digest-dashboard/index.ts";
import { readState } from "../../.pi/extensions/digest-dashboard/state.ts";
import { appendEvent } from "../../.pi/extensions/digest-dashboard/state.ts";

interface SentMessage {
  message: { customType: string; content: string; details: unknown; display?: boolean };
  options: { triggerTurn?: boolean; deliverAs?: string } | undefined;
}

interface NotifyCall {
  message: string;
  severity: string;
}

function createFakePi(): {
  pi: ExtensionAPI;
  sent: SentMessage[];
  registerToolCalls: unknown[];
  registerCommandCalls: unknown[];
} {
  const sent: SentMessage[] = [];
  const registerToolCalls: unknown[] = [];
  const registerCommandCalls: unknown[] = [];

  const pi = {
    sendMessage: vi.fn((message, options) => {
      sent.push({ message, options });
    }),
    registerTool: vi.fn((def) => {
      registerToolCalls.push(def);
    }),
    registerCommand: vi.fn((name, def) => {
      registerCommandCalls.push({ name, def });
    }),
    on: vi.fn(),
  } as unknown as ExtensionAPI;

  return { pi, sent, registerToolCalls, registerCommandCalls };
}

function createCtx(notifyCalls?: NotifyCall[]): ExtensionCommandContext {
  return {
    ui: {
      notify: (message: string, severity: string) => {
        notifyCalls?.push({ message, severity });
      },
    },
  } as ExtensionCommandContext;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timeout");
    }
    await delay(intervalMs);
  }
}

function defaultPaths(home: string): { statePath: string; serverUrlPath: string } {
  const auraDir = path.join(home, ".pi", "aura");
  return {
    statePath: path.join(auraDir, "state.json"),
    serverUrlPath: path.join(auraDir, "server-url.json"),
  };
}

describe("start-dashboard", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let statePath: string;
  let serverUrlPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-start-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    const paths = defaultPaths(tmpDir);
    statePath = paths.statePath;
    serverUrlPath = paths.serverUrlPath;
    mkdirSync(path.dirname(statePath), { recursive: true });
  });

  afterEach(async () => {
    // Best-effort cleanup of any leftover server / files from a failed test.
    await teardownDashboard(statePath, serverUrlPath).catch(() => {});
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    delete process.env.PI_DIGEST_NO_BROWSER;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("spawns a detached server and writes a live PID to state.json", async () => {
    const { pi } = createFakePi();
    const notifyCalls: NotifyCall[] = [];
    const ctx = createCtx(notifyCalls);

    const result = await startDashboard(pi, ctx);

    expect(result.ok).toBe(true);
    expect(result.url).toBeDefined();
    const state = readState(statePath);
    expect(state.pid).toBeTruthy();
    expect(state.server_started).toBeGreaterThan(0);
    expect(() => process.kill(state.pid!, 0)).not.toThrow();
  });

  it("polls server-url.json and reads the server URL", async () => {
    const { pi } = createFakePi();
    const ctx = createCtx();

    const result = await startDashboard(pi, ctx);

    expect(existsSync(serverUrlPath)).toBe(true);
    const serverUrl = JSON.parse(readFileSync(serverUrlPath, "utf-8"));
    expect(serverUrl.url).toBe(result.url);

    const state = readState(statePath);
    expect(serverUrl.pid).toBe(state.pid);
  });

  it("starts the listener, which forwards a synthetic action_click", async () => {
    const { pi, sent } = createFakePi();
    const ctx = createCtx();

    await startDashboard(pi, ctx);

    appendEvent(statePath, {
      id: 1,
      ts: new Date().toISOString(),
      dir: "page→agent",
      type: "action_click",
      payload: {
        section: "overdue",
        key: "AURA-1",
        action: "advance",
        label: "Advance AURA-1",
        instruction: "Handle AURA-1",
        aura_use_case: "task-management",
      },
    });

    await waitFor(() => sent.length === 1);

    expect(sent).toHaveLength(1);
    expect(sent[0].message.customType).toBe("aura-digest-event");
    expect(sent[0].message.content).toBe("Handle AURA-1");
    expect((sent[0].message.details as { key: string }).key).toBe("AURA-1");
    expect(sent[0].options).toEqual({ triggerTurn: true, deliverAs: "steer" });
  });

  it("refuses to start a second dashboard while one is running", async () => {
    const { pi } = createFakePi();
    const ctx = createCtx();

    const first = await startDashboard(pi, ctx);
    expect(first.ok).toBe(true);

    const second = await startDashboard(pi, ctx);
    expect(second.ok).toBe(false);
    expect(second.message).toContain("already running");
  });

  it("stop cleans up: kills PID, deletes state.json and server-url.json", async () => {
    const { pi } = createFakePi();
    const ctx = createCtx();

    const startResult = await startDashboard(pi, ctx);
    expect(startResult.ok).toBe(true);

    const state = readState(statePath);
    const pid = state.pid!;

    const stopResult = await teardownDashboard(statePath, serverUrlPath);
    expect(stopResult.ok).toBe(true);
    expect(stopResult.message).toBe("Digest dashboard stopped.");
    expect(existsSync(statePath)).toBe(false);
    expect(existsSync(serverUrlPath)).toBe(false);

    await waitFor(() => {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    });
  });
});

describe("digest-dashboard-start tool", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let statePath: string;
  let serverUrlPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-tool-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    const paths = defaultPaths(tmpDir);
    statePath = paths.statePath;
    serverUrlPath = paths.serverUrlPath;
    mkdirSync(path.dirname(statePath), { recursive: true });
  });

  afterEach(async () => {
    await teardownDashboard(statePath, serverUrlPath).catch(() => {});
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    delete process.env.PI_DIGEST_NO_BROWSER;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers a digest-dashboard-start tool whose execute calls start", async () => {
    const { pi, registerToolCalls } = createFakePi();
    installExtension(pi);

    expect(registerToolCalls).toHaveLength(1);
    const toolDef = registerToolCalls[0] as {
      name: string;
      execute: (
        toolCallId: string,
        params: { openBrowser?: boolean },
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: ExtensionCommandContext,
      ) => Promise<unknown>;
    };
    expect(toolDef.name).toBe("digest-dashboard-start");

    const notifyCalls: NotifyCall[] = [];
    const ctx = createCtx(notifyCalls);
    const result = (await toolDef.execute("call-1", { openBrowser: false }, undefined, undefined, ctx)) as {
      content: Array<{ type: string; text: string }>;
      details: { url: string };
    };

    expect(result.content[0].text).toContain("running at");
    expect(result.details.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(existsSync(statePath)).toBe(true);

    const state = readState(statePath);
    expect(state.pid).toBeTruthy();
  });
});
