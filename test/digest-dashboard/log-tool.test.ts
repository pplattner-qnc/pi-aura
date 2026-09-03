// Unit tests for the digest-log tool (in-process direct-push):
// - digest-log is registered with params { message: string }
// - digest-log calls store.pushEvent directly (no HTTP fetch); the
//   agent_log event is in store.getEvents() with the right type + message.
// - The tool is always-safe: returns ok with NO server running (the event is
//   still recorded in the store).
// - A connected /events SSE client receives the agent_log state-change event.
// - digest-log never calls fetch (no HTTP self-POST).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import {
  startDashboard,
  teardownDashboard,
  default as installExtension,
} from "../../.pi/extensions/digest-dashboard/index.ts";
import { resetStore, getEvents } from "../../.pi/extensions/digest-dashboard/store.ts";

interface RegisterToolCall {
  name: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ) => Promise<unknown>;
}

function createFakePi(capture: { registerToolCalls: RegisterToolCall[] }): ExtensionAPI {
  return {
    getActiveTools: vi.fn(() => []),
    setActiveTools: vi.fn(),
    sendMessage: vi.fn(),
    registerTool: vi.fn((def) => {
      capture.registerToolCalls.push(def as RegisterToolCall);
    }),
    registerCommand: vi.fn(),
    on: vi.fn(),
  } as unknown as ExtensionAPI;
}

function createCtx(): ExtensionContext {
  return {} as ExtensionContext;
}

function createCmdCtx(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

function findTool(pi: ExtensionAPI, name: string): RegisterToolCall {
  const capture = (pi.registerTool as ReturnType<typeof vi.fn>).mock.calls as unknown as {
    0: RegisterToolCall;
  }[];
  const def = capture.find((call) => call[0].name === name);
  if (!def) throw new Error(`tool ${name} not registered`);
  return def[0];
}

function statePath(): string {
  return path.join(process.env.HOME!, ".pi", "aura", "state.json");
}

async function ensureTeardown(): Promise<void> {
  await teardownDashboard(statePath()).catch(() => {});
}

describe("digest-log tool (in-process direct-push)", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let auraDir: string;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-log-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    auraDir = path.join(tmpDir, ".pi", "aura");
    mkdirSync(auraDir, { recursive: true });
    resetStore();
    // Spy on fetch to assert it is never called by digest-log.
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
    await ensureTeardown();
    resetStore();
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    delete process.env.PI_DIGEST_NO_BROWSER;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("is registered with params { message: string }", () => {
    const capture: { registerToolCalls: RegisterToolCall[] } = { registerToolCalls: [] };
    const pi = createFakePi(capture);
    installExtension(pi);

    const tool = capture.registerToolCalls.find((c) => c.name === "digest-log");
    expect(tool).toBeDefined();
    const params = tool!.parameters as { properties?: Record<string, unknown> };
    expect(params.properties).toBeDefined();
    expect(params.properties!.message).toBeDefined();
    expect((params.properties!.message as { type?: string }).type).toBe("string");
  });

  it("calls pushEvent directly — the agent_log event is in getEvents() with the message; no fetch", async () => {
    const capture: { registerToolCalls: RegisterToolCall[] } = { registerToolCalls: [] };
    const pi = createFakePi(capture);
    installExtension(pi);
    const tool = findTool(pi, "digest-log");

    // No server started — the tool should still push to the store directly.
    const result = (await tool.execute(
      "call-1",
      { message: "Verifying review states…" },
      undefined,
      undefined,
      createCtx(),
    )) as { content: Array<{ type: string; text: string }> };

    // No HTTP fetch was called (in-process direct push).
    expect(fetchSpy).not.toHaveBeenCalled();

    // The agent_log event is in the store's event log.
    const events = getEvents();
    const logEvents = events.filter((e) => e.type === "agent_log");
    expect(logEvents).toHaveLength(1);

    const evt = logEvents[0]!;
    expect(evt.dir).toBe("agent→page");
    expect(evt.type).toBe("agent_log");
    const payload = evt.payload as { message: string };
    expect(payload.message).toBe("Verifying review states…");

    // The store assigned a monotonic id (not the placeholder 0).
    expect(evt.id).toBeGreaterThan(0);

    // The tool returned ok with the message.
    expect(result.content).toBeDefined();
    expect(result.content[0]!.text).toContain("ok");
    expect(result.content[0]!.text).toContain("Verifying review states…");
  });

  it("returns ok with no server running — the event is still recorded (always-safe)", async () => {
    // Dashboard deliberately NOT started (no server, no SSE clients).
    const capture: { registerToolCalls: RegisterToolCall[] } = { registerToolCalls: [] };
    const pi = createFakePi(capture);
    installExtension(pi);
    const tool = findTool(pi, "digest-log");

    const result = (await tool.execute(
      "call-1",
      { message: "Re-ranking actions…" },
      undefined,
      undefined,
      createCtx(),
    )) as { content: Array<{ type: string; text: string }> };

    // No fetch attempted (no HTTP self-POST).
    expect(fetchSpy).not.toHaveBeenCalled();

    // Returns ok (not "skipped" — the event is recorded regardless).
    expect(result.content).toBeDefined();
    expect(result.content[0]!.text).toContain("ok");
    expect(result.content[0]!.text).not.toContain("skipped");

    // The event IS in the store even though no server is running.
    const events = getEvents();
    expect(events.some((e) => e.type === "agent_log")).toBe(true);
    const logEvt = events.find((e) => e.type === "agent_log")!;
    expect((logEvt.payload as { message: string }).message).toBe("Re-ranking actions…");
  });

  it("returns ok with the server running too", async () => {
    const capture: { registerToolCalls: RegisterToolCall[] } = { registerToolCalls: [] };
    const pi = createFakePi(capture);
    installExtension(pi);
    const tool = findTool(pi, "digest-log");

    // Start the in-process dashboard.
    const startResult = await startDashboard(pi, createCmdCtx());
    expect(startResult.ok).toBe(true);

    const result = (await tool.execute(
      "call-1",
      { message: "Augmenting…" },
      undefined,
      undefined,
      createCtx(),
    )) as { content: Array<{ type: string; text: string }> };

    // No fetch — direct in-process push.
    expect(fetchSpy).not.toHaveBeenCalled();

    expect(result.content).toBeDefined();
    expect(result.content[0]!.text).toContain("ok");
    expect(result.content[0]!.text).toContain("Augmenting…");

    // Event recorded.
    const events = getEvents();
    expect(events.some((e) => e.type === "agent_log")).toBe(true);
  });

  it("multiple calls each push a distinct agent_log event", async () => {
    const capture: { registerToolCalls: RegisterToolCall[] } = { registerToolCalls: [] };
    const pi = createFakePi(capture);
    installExtension(pi);
    const tool = findTool(pi, "digest-log");

    const messages = ["line 1", "line 2", "line 3"];
    await Promise.all(
      messages.map((msg) =>
        tool.execute("call-x", { message: msg }, undefined, undefined, createCtx()),
      ),
    );

    // No fetch for any call.
    expect(fetchSpy).not.toHaveBeenCalled();

    // Each message produced a distinct agent_log event.
    const logEvents = getEvents().filter((e) => e.type === "agent_log");
    expect(logEvents).toHaveLength(3);
    const recordedMessages = logEvents.map((e) => (e.payload as { message: string }).message);
    expect(recordedMessages.sort()).toEqual(["line 1", "line 2", "line 3"]);

    // Each event got a distinct monotonic id.
    const ids = logEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// SSE fan-out: a connected /events client receives the agent_log state-change.
// ---------------------------------------------------------------------------

describe("digest-log SSE fan-out (in-process)", () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-log-sse-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    resetStore();
  });

  afterEach(async () => {
    await ensureTeardown();
    resetStore();
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    delete process.env.PI_DIGEST_NO_BROWSER;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("a connected /events SSE client receives the agent_log state-change event", async () => {
    const capture: { registerToolCalls: RegisterToolCall[] } = { registerToolCalls: [] };
    const pi = createFakePi(capture);
    installExtension(pi);
    const tool = findTool(pi, "digest-log");

    // Start the in-process server.
    const startResult = await startDashboard(pi, createCmdCtx());
    expect(startResult.ok).toBe(true);
    const baseUrl = startResult.url!;

    // Connect to /events SSE and wait for the agent_log state-change.
    const receivedChunks: string[] = [];
    await new Promise<void>((resolve, reject) => {
      let sawAgentLog = false;

      const req = http.request(`${baseUrl}events`, { method: "GET" }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/event-stream");
        res.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf-8");
          receivedChunks.push(text);
          if (text.includes("event: state-change") && text.includes("agent_log")) {
            sawAgentLog = true;
          }
          if (sawAgentLog) {
            req.destroy();
            resolve();
          }
        });
      });
      req.on("error", reject);
      req.on("close", () => resolve());
      req.end();

      // Allow the SSE connection to establish, then call digest-log.
      setTimeout(async () => {
        await tool.execute(
          "call-1",
          { message: "SSE test line" },
          undefined,
          undefined,
          createCtx(),
        );
      }, 50);
    });

    // The SSE client received a state-change event containing agent_log.
    expect(
      receivedChunks.some(
        (c) => c.includes("event: state-change") && c.includes('"type":"agent_log"'),
      ),
    ).toBe(true);
  }, 15000);
});
