// Unit tests for the digest-log tool (in-process lifecycle):
// - digest-log is registered with params { message: string }
// - With the dashboard up (in-process server running) it POSTs an agent_log
//   event to /api/state and returns ok
// - With the dashboard down (no server running) it returns ok, no
//   throw, no fetch attempted
// - Concurrent calls each POST (the server serializes; the tool just fires)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  startDashboard,
  teardownDashboard,
  default as installExtension,
} from "../../.pi/extensions/digest-dashboard/index.ts";

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

interface FetchCall {
  url: string;
  init: RequestInit;
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

describe("digest-log tool", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let auraDir: string;
  let fetchCalls: FetchCall[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-log-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    auraDir = path.join(tmpDir, ".pi", "aura");
    mkdirSync(auraDir, { recursive: true });

    fetchCalls = [];
    fetchMock = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
      fetchCalls.push({ url, init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await ensureTeardown();
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
    // The parameters schema should describe a single string "message" field.
    const params = tool!.parameters as { properties?: Record<string, unknown> };
    expect(params.properties).toBeDefined();
    expect(params.properties!.message).toBeDefined();
    expect((params.properties!.message as { type?: string }).type).toBe("string");
  });

  it("POSTs an agent_log event to /api/state and returns ok when dashboard is up", async () => {
    const capture: { registerToolCalls: RegisterToolCall[] } = { registerToolCalls: [] };
    const pi = createFakePi(capture);
    installExtension(pi);
    const tool = findTool(pi, "digest-log");

    // Start the in-process dashboard so getDashboardUrl() returns a real URL.
    const startResult = await startDashboard(pi, createCmdCtx());
    expect(startResult.ok).toBe(true);

    const result = (await tool.execute(
      "call-1",
      { message: "Verifying review states…" },
      undefined,
      undefined,
      createCtx(),
    )) as { content: Array<{ type: string; text: string }> };

    // Exactly one POST to /api/state
    expect(fetchCalls).toHaveLength(1);
    const [call] = fetchCalls;
    expect(call.url).toBe(`${startResult.url}api/state`);
    expect(call.init.method).toBe("POST");

    const body = JSON.parse(call.init.body as string) as {
      dir: string;
      type: string;
      payload: { message: string };
    };
    expect(body.dir).toBe("agent→page");
    expect(body.type).toBe("agent_log");
    expect(body.payload.message).toBe("Verifying review states…");

    // The tool returns a successful result (never throws / never fails the agent call)
    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain("ok");
  });

  it("returns ok, no throw, no fetch when dashboard is not running", async () => {
    // Dashboard deliberately NOT started (dashboard down)

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

    // No fetch should have been attempted
    expect(fetchCalls).toHaveLength(0);

    // Returns an ok result mentioning the dashboard is not running
    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain("dashboard not running");
    expect(result.content[0].text).toContain("skipped");
  });

  it("never throws even if the POST fails (best-effort)", async () => {
    const capture: { registerToolCalls: RegisterToolCall[] } = { registerToolCalls: [] };
    const pi = createFakePi(capture);
    installExtension(pi);
    const tool = findTool(pi, "digest-log");

    // Start the in-process dashboard so getDashboardUrl() returns a real URL.
    await startDashboard(pi, createCmdCtx());

    // Override the mock to reject (simulating a network error / dashboard down mid-run)
    fetchMock.mockImplementation(async () => {
      throw new Error("ECONNREFUSED");
    });

    // Should not throw — the tool catches POST failures and returns ok
    const result = (await tool.execute(
      "call-1",
      { message: "Augmenting…" },
      undefined,
      undefined,
      createCtx(),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain("ok");
  });

  it("concurrent calls each POST an agent_log event", async () => {
    const capture: { registerToolCalls: RegisterToolCall[] } = { registerToolCalls: [] };
    const pi = createFakePi(capture);
    installExtension(pi);
    const tool = findTool(pi, "digest-log");

    // Start the in-process dashboard so getDashboardUrl() returns a real URL.
    await startDashboard(pi, createCmdCtx());

    const messages = ["line 1", "line 2", "line 3"];
    await Promise.all(
      messages.map((msg) =>
        tool.execute("call-x", { message: msg }, undefined, undefined, createCtx()),
      ),
    );

    // Each concurrent call fires its own POST (the server serializes via
    // the in-memory pushEvent queue; the tool just POSTs)
    expect(fetchCalls).toHaveLength(3);

    const bodies = fetchCalls.map((c) => {
      const parsed = JSON.parse(c.init.body as string) as { payload: { message: string } };
      return parsed.payload.message;
    });
    expect(bodies.sort()).toEqual(["line 1", "line 2", "line 3"]);
  });
});
