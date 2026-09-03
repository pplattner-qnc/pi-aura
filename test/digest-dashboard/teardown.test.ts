// Unit tests for digest-dashboard teardown (in-process lifecycle).
// Verifies teardownDashboard closes the in-process server deterministically.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
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

function createFakePi(): ExtensionAPI {
  return {
    sendMessage: vi.fn(),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    on: vi.fn(),
  } as unknown as ExtensionAPI;
}

function createCtx(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

async function httpGet(url: string): Promise<{ ok: boolean }> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on("end", () => resolve({ ok: res.statusCode !== undefined && res.statusCode < 400 }));
    });
    req.on("error", () => resolve({ ok: false }));
  });
}

describe("teardown-dashboard helper (in-process)", () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-teardown-"));
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    statePath = path.join(tmpDir, ".pi", "aura", "state.json");
    mkdirSync(path.dirname(statePath), { recursive: true });
  });

  afterEach(async () => {
    await teardownDashboard(statePath).catch(() => {});
    delete process.env.HOME;
    delete process.env.PI_DIGEST_NO_BROWSER;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("closes the in-process server and deletes state.json", async () => {
    const pi = createFakePi();
    const ctx = createCtx();

    const startResult = await startDashboard(pi, ctx);
    expect(startResult.ok).toBe(true);
    const url = startResult.url!;
    expect(await httpGet(url)).toEqual({ ok: true });

    const result = await teardownDashboard(statePath);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Digest dashboard stopped.");
    expect(existsSync(statePath)).toBe(false);
    expect(getDashboardUrl()).toBeNull();

    // The server is closed — GET should fail/refuse.
    expect(await httpGet(url)).toEqual({ ok: false });
  });

  it("is idempotent when no dashboard is running", async () => {
    const result = await teardownDashboard(statePath);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("No dashboard running.");
    expect(existsSync(statePath)).toBe(false);
  });
});

describe("session_shutdown cleanup (in-process)", () => {
  let tmpDir: string;
  let statePath: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-shutdown-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    statePath = path.join(tmpDir, ".pi", "aura", "state.json");
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

  it("session_shutdown closes a running in-process server", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const ctx = createCtx();

    // Start the dashboard.
    const startResult = await startDashboard(pi, ctx);
    expect(startResult.ok).toBe(true);
    const url = startResult.url!;
    expect(await httpGet(url)).toEqual({ ok: true });

    // Trigger session_shutdown — the extension registers a handler for it.
    const onCalls = (pi.on as ReturnType<typeof vi.fn>).mock.calls as [
      event: string,
      handler: (...args: unknown[]) => unknown,
    ][];
    const shutdownHandler = onCalls.find(([event]) => event === "session_shutdown")?.[1];
    expect(shutdownHandler).toBeDefined();
    await shutdownHandler!();

    // The server is closed and state.json is deleted.
    expect(getDashboardUrl()).toBeNull();
    expect(existsSync(statePath)).toBe(false);
    expect(await httpGet(url)).toEqual({ ok: false });
  });
});
