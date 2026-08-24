// Unit tests for digest-fetch + digest-save tools (slice 2):
// - digest-fetch returns { digest, report } + details.dir and confirms dashboard digest.json
// - digest-save writes last-digest.json
// - fetch failures return a clear error AgentToolResult without throwing

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
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
import { EventEmitter } from "node:events";
import { default as installExtension } from "../../.pi/extensions/digest-dashboard/index.ts";

interface RegisterToolCall {
  name: string;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ) => Promise<unknown>;
}

let nextSpawnOutcome: {
  exitCode: number | null;
  stdoutLines: string[];
  stderrLines: string[];
} = { exitCode: 0, stdoutLines: [], stderrLines: [] };

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  return {
    ...actual,
    spawn: vi.fn((_cmd: string, args: string[], _opts: unknown) => {
      const child = new EventEmitter() as import("node:child_process").ChildProcess;
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      Object.defineProperty(child, "stdout", { value: stdout, writable: false });
      Object.defineProperty(child, "stderr", { value: stderr, writable: false });
      Object.defineProperty(child, "exitCode", { value: null, writable: true });

      process.nextTick(() => {
        for (const line of nextSpawnOutcome.stdoutLines) {
          stdout.emit("data", Buffer.from(`${line}\n`, "utf-8"));
        }
        for (const line of nextSpawnOutcome.stderrLines) {
          stderr.emit("data", Buffer.from(`${line}\n`, "utf-8"));
        }

        // Mimic the real aura-digest.mjs save subcommand: read <dir>/digest.json
        // and write ~/.pi/aura/last-digest.json. spawn args are
        // [node, scriptPath, "save", dir], so the subcommand is args[1].
        if (args[1] === "save" && nextSpawnOutcome.exitCode === 0) {
          const dir = args[2];
          if (dir) {
            try {
              const digest = JSON.parse(fs.readFileSync(path.join(dir, "digest.json"), "utf8"));
              const auraDir = path.join(os.homedir(), ".pi", "aura");
              fs.mkdirSync(auraDir, { recursive: true });
              fs.writeFileSync(
                path.join(auraDir, "last-digest.json"),
                JSON.stringify(
                  {
                    schema_version: 1,
                    presented_at: new Date().toISOString(),
                    fetched_at: digest.meta?.generated_at ?? new Date().toISOString(),
                    digest,
                  },
                  null,
                  2,
                ) + "\n",
                "utf8",
              );
            } catch {
              // ignore mimic failures; tests set up the fixture digest.json
            }
          }
        }

        if (nextSpawnOutcome.exitCode !== null) {
          (child as { exitCode: number | null }).exitCode = nextSpawnOutcome.exitCode;
          child.emit("close", nextSpawnOutcome.exitCode);
        }
      });

      return child;
    }),
  };
});

function createFakePi(): ExtensionAPI {
  return {
    getActiveTools: vi.fn(() => []),
    setActiveTools: vi.fn(),
    sendMessage: vi.fn(),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    on: vi.fn(),
  } as unknown as ExtensionAPI;
}

function createCtx(): ExtensionContext {
  return {} as ExtensionContext;
}

function findTool(pi: ExtensionAPI, name: string): RegisterToolCall {
  const calls = (pi.registerTool as ReturnType<typeof vi.fn>).mock.calls as {
    0: RegisterToolCall;
  }[];
  const def = calls.find((call) => call[0].name === name);
  if (!def) throw new Error(`tool ${name} not registered`);
  return def[0];
}

describe("digest-fetch tool", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let auraDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-fetch-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    auraDir = path.join(tmpDir, ".pi", "aura");
    mkdirSync(auraDir, { recursive: true });
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns { digest, report } and confirms dashboard digest.json", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    writeFileSync(path.join(tmpDir, "digest.json"), JSON.stringify({ title: "digest fixture" }), "utf8");
    writeFileSync(path.join(tmpDir, "report.json"), JSON.stringify({ title: "report fixture" }), "utf8");
    writeFileSync(path.join(auraDir, "digest.json"), JSON.stringify({ title: "dashboard fixture" }), "utf8");

    nextSpawnOutcome = {
      exitCode: 0,
      stdoutLines: [`output directory: ${tmpDir}/`],
      stderrLines: [],
    };

    const result = (await tool.execute("call-1", {}, undefined, undefined, createCtx())) as {
      content: Array<{ type: string; text: string }>;
      details: { dir: string };
    };

    const parsed = JSON.parse(result.content[0].text) as { digest: unknown; report: unknown };
    expect(parsed.digest).toEqual({ title: "digest fixture" });
    expect(parsed.report).toEqual({ title: "report fixture" });
    expect(result.details.dir).toBe(tmpDir);
    expect(existsSync(path.join(auraDir, "digest.json"))).toBe(true);
  });

  it("returns a clear error result when fetch fails", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    nextSpawnOutcome = {
      exitCode: 1,
      stdoutLines: [],
      stderrLines: ["Aura PAT missing: AURA_API_TOKEN not set"],
    };

    const result = (await tool.execute("call-1", {}, undefined, undefined, createCtx())) as {
      content: Array<{ type: string; text: string }>;
      details: { dir?: string };
    };

    expect(result.content[0].text).toContain("Aura PAT missing");
    expect(result.details.dir).toBeUndefined();
  });
});

describe("digest-save tool", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let auraDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-save-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    auraDir = path.join(tmpDir, ".pi", "aura");
    mkdirSync(auraDir, { recursive: true });
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes last-digest.json and returns a confirmation", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-save");

    writeFileSync(path.join(tmpDir, "digest.json"), JSON.stringify({ title: "digest fixture" }), "utf8");
    nextSpawnOutcome = { exitCode: 0, stdoutLines: [], stderrLines: [] };

    const result = (await tool.execute(
      "call-1",
      { dir: tmpDir },
      undefined,
      undefined,
      createCtx(),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    const lastPath = path.join(auraDir, "last-digest.json");
    expect(existsSync(lastPath)).toBe(true);
    const saved = JSON.parse(readFileSync(lastPath, "utf-8"));
    expect(saved.digest).toEqual({ title: "digest fixture" });
    expect(result.content[0].text).toContain("saved");
  });
});
