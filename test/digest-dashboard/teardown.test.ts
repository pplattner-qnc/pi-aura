// Unit tests for digest-dashboard teardown (slice 5).
// Uses a temp HOME and a spawned child as the fake server PID.

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
import { spawn, type ChildProcess } from "node:child_process";
import {
  teardownDashboard,
  default as installExtension,
} from "../../.pi/extensions/digest-dashboard/index.ts";

function createFakePi() {
  const events: Record<string, Array<(...args: unknown[]) => unknown>> = {};
  return {
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      events[event] = events[event] ?? [];
      events[event].push(handler);
    }),
    _events: events,
  };
}

describe("teardown-dashboard helper", () => {
  let tmpDir: string;
  let statePath: string;
  let serverUrlPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-teardown-"));
    statePath = path.join(tmpDir, "state.json");
    serverUrlPath = path.join(tmpDir, "server-url.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("kills a live PID, deletes state.json + server-url.json, and reports stopped", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"]);
    await new Promise<void>((resolve) => {
      child.on("spawn", () => resolve());
    });

    writeFileSync(
      statePath,
      JSON.stringify({ pid: child.pid, server_started: Date.now(), events: [] }),
    );
    writeFileSync(serverUrlPath, JSON.stringify({ url: "http://127.0.0.1:1234/" }));

    const result = await teardownDashboard(statePath, serverUrlPath);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Digest dashboard stopped.");
    expect(existsSync(statePath)).toBe(false);
    expect(existsSync(serverUrlPath)).toBe(false);

    // The child should exit shortly after SIGTERM/SIGKILL.
    await new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
      setTimeout(() => {
        try {
          process.kill(child.pid!, 0);
        } catch {
          resolve();
        }
      }, 2500);
    });
  });

  it("is idempotent when state.json is missing", async () => {
    const result = await teardownDashboard(statePath, serverUrlPath);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("No dashboard running.");
    expect(existsSync(statePath)).toBe(false);
  });

  it("cleans files and reports stopped when the recorded PID is already dead", async () => {
    // Spawn and wait for exit to obtain a guaranteed-dead PID.
    const child = spawn(process.execPath, ["-e", "process.exit(0)"]);
    await new Promise<void>((resolve) => child.on("exit", () => resolve()));

    writeFileSync(
      statePath,
      JSON.stringify({ pid: child.pid, server_started: Date.now(), events: [] }),
    );

    const result = await teardownDashboard(statePath, serverUrlPath);

    expect(result.ok).toBe(true);
    expect(existsSync(statePath)).toBe(false);
  });
});

describe("session_shutdown cleanup", () => {
  let tmpDir: string;
  let statePath: string;
  let serverUrlPath: string;
  let child: ChildProcess | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-shutdown-"));
    statePath = path.join(tmpDir, ".pi", "aura", "state.json");
    serverUrlPath = path.join(tmpDir, ".pi", "aura", "server-url.json");
    mkdirSync(path.dirname(statePath), { recursive: true });
  });

  afterEach(() => {
    if (child && !child.killed) {
      try {
        process.kill(child.pid!, "SIGKILL");
      } catch {
        // ignore
      }
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("kills a leaked PID and deletes files", async () => {
    child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"]);
    await new Promise<void>((resolve) => child!.on("spawn", () => resolve()));

    writeFileSync(
      statePath,
      JSON.stringify({ pid: child.pid, server_started: Date.now(), events: [] }),
    );
    writeFileSync(serverUrlPath, JSON.stringify({ url: "http://127.0.0.1:1234/" }));

    const pi = createFakePi();
    const originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    try {
      installExtension(pi as unknown as import("@earendil-works/pi-coding-agent").ExtensionAPI);
      const [shutdownHandler] = pi._events["session_shutdown"] ?? [];
      expect(shutdownHandler).toBeDefined();
      await shutdownHandler();
    } finally {
      process.env.HOME = originalHome;
    }

    expect(existsSync(statePath)).toBe(false);
    expect(existsSync(serverUrlPath)).toBe(false);
  });
});
