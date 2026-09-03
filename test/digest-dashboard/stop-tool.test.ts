// Unit tests for the digest-dashboard-stop tool (in-process lifecycle).
// Verifies the tool is registered and its execute delegates to teardownDashboard.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  startDashboard,
  teardownDashboard,
  getDashboardUrl,
  default as installExtension,
} from "../../.pi/extensions/digest-dashboard/index.ts";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

function createFakePi(): {
  pi: ExtensionAPI;
  registerToolCalls: unknown[];
} {
  const registerToolCalls: unknown[] = [];

  const pi = {
    sendMessage: vi.fn(),
    registerTool: vi.fn((def) => {
      registerToolCalls.push(def);
    }),
    registerCommand: vi.fn(),
    on: vi.fn(),
  } as unknown as ExtensionAPI;

  return { pi, registerToolCalls };
}

function createCtx(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

describe("digest-dashboard-stop tool", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let statePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-stop-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    const auraDir = path.join(tmpDir, ".pi", "aura");
    statePath = path.join(auraDir, "state.json");
    mkdirSync(auraDir, { recursive: true });
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

  it("is registered by the extension", () => {
    const { pi, registerToolCalls } = createFakePi();
    installExtension(pi);

    const toolDef = registerToolCalls.find(
      (call) => (call as { name: string }).name === "digest-dashboard-stop",
    );
    expect(toolDef).toBeDefined();
    expect((toolDef as { label: string }).label).toBeTruthy();
    expect((toolDef as { description: string }).description).toBeTruthy();
    expect((toolDef as { promptSnippet?: string }).promptSnippet).toBeUndefined();
    expect((toolDef as { promptGuidelines?: string[] }).promptGuidelines).toBeUndefined();
  });

  it("execute calls teardownDashboard and returns the teardown message", async () => {
    const { pi, registerToolCalls } = createFakePi();
    installExtension(pi);

    const toolDef = registerToolCalls.find(
      (call) => (call as { name: string }).name === "digest-dashboard-stop",
    ) as {
      name: string;
      execute: (
        toolCallId: string,
        params: Record<string, never>,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
      ) => Promise<{
        content: Array<{ type: string; text: string }>;
        details: Record<string, never>;
      }>;
    };
    expect(toolDef).toBeDefined();

    // Start an in-process server so teardown has something to close.
    await startDashboard(pi, createCtx());

    const result = await toolDef.execute("call-1", {}, undefined, undefined);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("Digest dashboard stopped.");
    expect(result.details).toEqual({});
    // No state.json left on disk.
    expect(existsSync(statePath)).toBe(false);
    // Server handle is null.
    expect(getDashboardUrl()).toBeNull();
  });

  it("execute when nothing is running reports no dashboard", async () => {
    const { pi, registerToolCalls } = createFakePi();
    installExtension(pi);

    const toolDef = registerToolCalls.find(
      (call) => (call as { name: string }).name === "digest-dashboard-stop",
    ) as {
      name: string;
      execute: (
        toolCallId: string,
        params: Record<string, never>,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
      ) => Promise<{
        content: Array<{ type: string; text: string }>;
        details: Record<string, never>;
      }>;
    };
    expect(toolDef).toBeDefined();

    const result = await toolDef.execute("call-1", {}, undefined, undefined);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe("No dashboard running.");
  });
});
