// Unit tests for digest-dashboard start handler and registerTool (in-process lifecycle).
// Uses a temp HOME and PI_DIGEST_NO_BROWSER=1 to avoid real browsers.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  startDashboard,
  teardownDashboard,
  getDashboardUrl,
  default as installExtension,
} from "../../.pi/extensions/digest-dashboard/index.ts";
import { pushEvent } from "../../.pi/extensions/digest-dashboard/store.ts";

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

function defaultPaths(home: string): { statePath: string } {
  const auraDir = path.join(home, ".pi", "aura");
  return {
    statePath: path.join(auraDir, "state.json"),
  };
}

async function httpGet(url: string): Promise<{ statusCode: number | undefined; ok: boolean }> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on("end", () => resolve({ statusCode: res.statusCode, ok: res.statusCode !== undefined && res.statusCode < 400 }));
    });
    req.on("error", () => resolve({ statusCode: undefined, ok: false }));
  });
}

describe("start-dashboard (in-process)", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let statePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-start-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    const paths = defaultPaths(tmpDir);
    statePath = paths.statePath;
    mkdirSync(path.dirname(statePath), { recursive: true });
  });

  afterEach(async () => {
    // Best-effort cleanup of any leftover server / files from a failed test.
    await teardownDashboard(statePath).catch(() => {});
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    delete process.env.PI_DIGEST_NO_BROWSER;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts an in-process server and returns a reachable URL", async () => {
    const { pi } = createFakePi();
    const ctx = createCtx();

    const result = await startDashboard(pi, ctx);

    expect(result.ok).toBe(true);
    expect(result.url).toBeDefined();
    expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

    // The URL is reachable — HTTP GET serves the shell.
    const { statusCode, ok } = await httpGet(result.url!);
    expect(ok).toBe(true);
    expect(statusCode).toBe(200);
  });

  it("serves the HTML shell at the returned URL", async () => {
    const { pi } = createFakePi();
    const ctx = createCtx();

    const result = await startDashboard(pi, ctx);
    expect(result.ok).toBe(true);

    const body = await new Promise<string>((resolve, reject) => {
      http.get(result.url!, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      }).on("error", reject);
    });

    expect(body).toContain("<div id=\"app\">");
  });

  it("does not write server-url.json on disk", async () => {
    const { pi } = createFakePi();
    const ctx = createCtx();

    await startDashboard(pi, ctx);

    const serverUrlPath = path.join(tmpDir, ".pi", "aura", "server-url.json");
    expect(existsSync(serverUrlPath)).toBe(false);
  });

  it("does not write a PID to state.json (in-process, no child)", async () => {
    const { pi } = createFakePi();
    const ctx = createCtx();

    await startDashboard(pi, ctx);

    // state.json may or may not exist (no pid is written), but if it
    // does, it must not contain a pid.
    if (existsSync(statePath)) {
      const state = JSON.parse(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        await import("node:fs").then((fs) => fs.readFileSync(statePath, "utf-8")),
      ) as { pid?: number | null };
      expect(state.pid).toBeFalsy();
    }
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

  it("getDashboardUrl returns the handle URL when running, null when stopped", async () => {
    const { pi } = createFakePi();
    const ctx = createCtx();

    expect(getDashboardUrl()).toBeNull();

    const result = await startDashboard(pi, ctx);
    expect(result.ok).toBe(true);
    expect(getDashboardUrl()).toBe(result.url);

    await teardownDashboard(statePath);
    expect(getDashboardUrl()).toBeNull();
  });

  it("stop closes the server: a GET to the URL then fails/refuses", async () => {
    const { pi } = createFakePi();
    const ctx = createCtx();

    const result = await startDashboard(pi, ctx);
    expect(result.ok).toBe(true);
    const url = result.url!;

    // Server is up.
    const before = await httpGet(url);
    expect(before.ok).toBe(true);

    await teardownDashboard(statePath);

    // Server is down — GET should fail/refuse.
    const after = await httpGet(url);
    expect(after.ok).toBe(false);
  });

  it("starts the listener, which forwards a synthetic action_click", async () => {
    const { pi, sent } = createFakePi();
    const ctx = createCtx();

    await startDashboard(pi, ctx);

    pushEvent({
      id: 0,
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
});

describe("digest-dashboard-start tool", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let statePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-tool-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    const paths = defaultPaths(tmpDir);
    statePath = paths.statePath;
    mkdirSync(path.dirname(statePath), { recursive: true });
  });

  afterEach(async () => {
    await teardownDashboard(statePath).catch(() => {});
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
    // No server-url.json on disk.
    expect(existsSync(path.join(tmpDir, ".pi", "aura", "server-url.json"))).toBe(false);
  });
});
