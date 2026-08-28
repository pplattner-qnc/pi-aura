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

  it("recovers from an orphaned server: pid alive but server-url.json absent → kills orphan and respawns", async () => {
    // Reproduces the session_shutdown teardown race: the URL file was deleted
    // but the detached server survived, so the dashboard is alive but
    // unfindable. A subsequent start must not report "already running" — it
    // must reap the orphan and spawn a fresh, findable server.
    const { pi } = createFakePi();
    const ctx = createCtx();

    const first = await startDashboard(pi, ctx);
    expect(first.ok).toBe(true);
    const orphanPid = readState(statePath).pid!;
    expect(() => process.kill(orphanPid, 0)).not.toThrow();

    // Simulate the orphan: delete server-url.json while the server lives.
    rmSync(serverUrlPath, { force: true });
    expect(existsSync(serverUrlPath)).toBe(false);
    // state.json still records the live pid — the orphan signature.
    expect(readState(statePath).pid).toBe(orphanPid);

    const second = await startDashboard(pi, ctx);
    expect(second.ok).toBe(true);
    expect(second.url).toBeDefined();
    // A fresh server-url.json is written for the new server.
    expect(existsSync(serverUrlPath)).toBe(true);
    const newPid = readState(statePath).pid!;
    // The orphan was reaped.
    await waitFor(() => {
      try {
        process.kill(orphanPid, 0);
        return false;
      } catch {
        return true;
      }
    });
    // The new server is alive and is a different process.
    expect(() => process.kill(newPid, 0)).not.toThrow();
    expect(newPid).not.toBe(orphanPid);
  });

  it("ignores a stale server-url.json from a previous server and waits for this server's own", async () => {
    // Reproduces the stale-URL trap: a previous run left server-url.json
    // pointing at a now-dead port. startDashboard must not read that stale
    // file and return the dead URL as success — it clears the stale file and
    // waits for the new server to write its own pid-matched server-url.json.
    const { pi } = createFakePi();
    const ctx = createCtx();

    // Plant a stale server-url.json with a foreign pid + a dead port.
    mkdirSync(path.dirname(serverUrlPath), { recursive: true });
    writeFileSync(
      serverUrlPath,
      JSON.stringify({ url: "http://127.0.0.1:38777/", pid: 999999 }),
      "utf-8",
    );
    expect(existsSync(serverUrlPath)).toBe(true);

    const result = await startDashboard(pi, ctx);
    expect(result.ok).toBe(true);
    // The returned URL must NOT be the stale dead port.
    expect(result.url).not.toContain("38777");
    // server-url.json now reflects THIS server (matching pid).
    const fresh = JSON.parse(readFileSync(serverUrlPath, "utf-8")) as {
      url: string;
      pid: number;
    };
    expect(fresh.url).toBe(result.url);
    expect(fresh.pid).toBe(readState(statePath).pid);
    expect(fresh.url).not.toContain("38777");
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

    const toolDef = registerToolCalls.find(
      (call) => (call as { name: string }).name === "digest-dashboard-start",
    ) as {
      name: string;
      execute: (
        toolCallId: string,
        params: { openBrowser?: boolean },
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: ExtensionCommandContext,
      ) => Promise<unknown>;
    };
    expect(toolDef).toBeDefined();

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
