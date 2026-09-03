// Unit tests for digest-fetch + digest-save tools:
//
// digest-fetch (slice 2 — in-process):
//   - Calls fetchAction() in-process (no spawn); injects a fake AuraClient
//     via the _setAuraClientForTesting seam.
//   - Returns { digest, report } with NO details.dir (no temp dir).
//   - Pushes progress events to the store (type: "progress").
//   - Calls store.setCurrentDigest so the dashboard serves the digest.
//   - Does NOT write ~/.pi/aura/digest.json.
//   - Returns a clear error when fetchAction throws.
//   - One-shot "dashboard not running" warning (notify + result text) when
//     the in-process server is down — but the digest is still populated.
//
// digest-save (still spawning the CLI this slice — slice 3 rewires it):
//   - Writes last-digest.json via the spawn mock.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type {
  AuraClient,
  BoardBriefing,
  BoardSummary,
  Capacity,
  PriorityQueue,
  ArtifactList,
  TaskList,
  NotificationList,
  ArtifactApprovals,
  ArtifactReview,
  Task,
} from "@pi-aura/shared/aura-client";
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
import http from "node:http";
import { EventEmitter } from "node:events";
import {
  startDashboard,
  teardownDashboard,
  default as installExtension,
  _setAuraClientForTesting,
} from "../../.pi/extensions/digest-dashboard/index.ts";
import { resetStore, getEvents, getCurrentDigest } from "../../.pi/extensions/digest-dashboard/store.ts";

// ---------------------------------------------------------------------------
// Spawn mock — kept for digest-save tests (still spawns the CLI this slice).
// ---------------------------------------------------------------------------

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
                  null, 2,
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

// ---------------------------------------------------------------------------
// Fake AuraClient — returns minimal-but-shaped fixture data (same approach
// as packages/shared/test/digest/fetchAction.test.ts).
// ---------------------------------------------------------------------------

function makeFakeAuraClient(): AuraClient {
  const briefing: BoardBriefing = {
    text: "Test briefing",
    generated_at: "2025-01-01T00:00:00Z",
  };
  const summary: BoardSummary = {
    overdue: { count: 0, items: [] },
    waiting_on_me: { count: 0, items: [] },
    waiting_on_others: { count: 0, items: [] },
  };
  const priorityQueue: PriorityQueue = {
    items: [
      {
        id: "task-1",
        human_key: "AURA-100",
        title: "Test task one",
        status: "IN_DEVELOPMENT",
        status_type: "ACTIVE",
        block: "",
        asap: false,
        blocked_by: [],
        context_path: [],
        capacity_percent: 50,
      },
    ],
    total: 1,
    unordered_count: 0,
  };
  const capacity: Capacity = {
    base_percent: 100,
    committed_percent: 40,
    free_percent: 60,
    utilization_percent: 40,
    over: false,
    tasks: [
      {
        task_id: "task-1",
        human_key: "AURA-100",
        task_title: "Test task one",
        task_status: "IN_DEVELOPMENT",
        roles: ["OWNER"],
        capacity_percent: 40,
        hierarchy_path: [],
      },
    ],
  };
  const pendingReviews: ArtifactList = {
    items: [],
    pagination: { page: 1, limit: 10, total: 0 },
  };
  const alignmentTasks: TaskList = {
    items: [],
    pagination: { page: 1, limit: 5, total: 0 },
  };
  const notifList: NotificationList = {
    items: [],
    pagination: { page: 1, limit: 50, total: 0 },
  };

  return {
    getArtifact: async () => {
      throw new Error("not used");
    },
    mcpCreateArtifact: async () => {
      throw new Error("not used");
    },
    mcpUpdateArtifact: async () => {
      throw new Error("not used");
    },
    listArtifacts: async () => pendingReviews,
    getKnowledgeNode: async () => {
      throw new Error("not used");
    },
    getKnowledgeNodeByPath: async () => {
      throw new Error("not used");
    },
    saveKnowledgeNodeBody: async () => {
      throw new Error("not used");
    },
    mcpWikiSearch: async () => {
      throw new Error("not used");
    },
    getKnowledgeTree: async () => {
      throw new Error("not used");
    },
    createKnowledgeNode: async () => {
      throw new Error("not used");
    },
    getBlueprintFiles: async () => {
      throw new Error("not used");
    },
    getKnowledgeNodeVersion: async () => {
      throw new Error("not used");
    },
    mcpCreateUploadDocument: async () => {
      throw new Error("not used");
    },
    mcpGetUploadDocument: async () => {
      throw new Error("not used");
    },
    getBoardBriefing: async () => briefing,
    getBoardSummary: async () => summary,
    listNotifications: async () => notifList,
    getMyPriorityQueue: async () => priorityQueue,
    getMyCapacity: async () => capacity,
    listTasks: async () => alignmentTasks,
    createFeedback: async () => {
      throw new Error("not used");
    },
    getArtifactApprovals: async (): Promise<ArtifactApprovals> => ({
      version: 1,
      latest_version: 1,
      decided_count: 0,
      total_required: 0,
      open_reviews: [],
      decisions: [],
    }),
    getTaskByHumanKey: async (): Promise<Task> => ({
      id: "task-1",
      human_key: "AURA-100",
      title: "Test task one",
      status: "IN_DEVELOPMENT",
      status_type: "ACTIVE",
    }),
    getArtifactReview: async (): Promise<ArtifactReview> => ({
      version: 1,
      review_state: "open",
      reviewers: [],
      review_artifacts: [],
      initiator: null,
      is_initiator: false,
    }),
    requestArtifactReview: async () => {},
    startArtifactReview: async () => {},
    submitArtifactDecision: async () => {},
    reopenArtifactReview: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function createCmdCtx(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

interface NotifyCall {
  message: string;
  severity: string;
}

function createCtxWithNotify(notifyCalls: NotifyCall[]): ExtensionContext {
  return {
    ui: {
      notify: (message: string, severity: string) => {
        notifyCalls.push({ message, severity });
      },
    },
  } as unknown as ExtensionContext;
}

function findTool(pi: ExtensionAPI, name: string): RegisterToolCall {
  const calls = (pi.registerTool as ReturnType<typeof vi.fn>).mock.calls as {
    0: RegisterToolCall;
  }[];
  const def = calls.find((call) => call[0].name === name);
  if (!def) throw new Error(`tool ${name} not registered`);
  return def[0];
}

function statePath(): string {
  return path.join(process.env.HOME!, ".pi", "aura", "state.json");
}

async function ensureTeardown(): Promise<void> {
  await teardownDashboard(statePath()).catch(() => {});
}

// ---------------------------------------------------------------------------
// digest-fetch (in-process)
// ---------------------------------------------------------------------------

describe("digest-fetch tool (in-process)", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let auraDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-fetch-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    auraDir = path.join(tmpDir, ".pi", "aura");
    mkdirSync(auraDir, { recursive: true });
    resetStore();
    _setAuraClientForTesting(makeFakeAuraClient());
  });

  afterEach(async () => {
    _setAuraClientForTesting(undefined);
    await ensureTeardown();
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    delete process.env.PI_DIGEST_NO_BROWSER;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("calls fetchAction in-process and returns { digest, report } with no details.dir", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    // Start the dashboard so no warning prefix is prepended (clean JSON).
    await startDashboard(pi, createCmdCtx());

    const result = (await tool.execute("call-1", {}, undefined, undefined, createCtx())) as {
      content: Array<{ type: string; text: string }>;
      details: Record<string, unknown>;
    };

    // The result text is JSON with digest + report keys.
    const parsed = JSON.parse(result.content[0].text) as {
      digest: { queue: Array<{ key: string }> };
      report: { fetched_at: string };
    };
    expect(parsed.digest.queue[0]!.key).toBe("AURA-100");
    expect(typeof parsed.report.fetched_at).toBe("string");

    // No dir in details (the temp dir is gone).
    expect(result.details.dir).toBeUndefined();
    expect(Object.keys(result.details)).toHaveLength(0);
  }, 15000);

  it("does not spawn a child process for fetch", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    // Start the dashboard so no warning prefix is prepended (clean JSON).
    await startDashboard(pi, createCmdCtx());

    // Set a spawn outcome that would fail if spawn were called.
    nextSpawnOutcome = {
      exitCode: 99,
      stdoutLines: [],
      stderrLines: ["spawn should not be called for fetch"],
    };

    const result = (await tool.execute("call-1", {}, undefined, undefined, createCtx())) as {
      content: Array<{ type: string; text: string }>;
    };

    // The fetch succeeded despite the hostile spawn outcome — it didn't spawn.
    const parsed = JSON.parse(result.content[0].text) as { digest: unknown };
    expect(parsed.digest).toBeDefined();

    // Verify spawn was NOT called for fetch.
    const spawnMock = vi.mocked(
      (await import("node:child_process")).spawn,
    );
    // The spawn mock is only called for "save", not "fetch".
    const fetchSpawnCalls = spawnMock.mock.calls.filter((c) => c[1]?.[1] === "fetch");
    expect(fetchSpawnCalls).toHaveLength(0);
  }, 15000);

  it("pushes progress events to the store (type: progress)", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    await tool.execute("call-1", {}, undefined, undefined, createCtx());

    const events = getEvents();
    const progressEvents = events.filter((e) => e.type === "progress");
    expect(progressEvents.length).toBeGreaterThan(0);

    // Each progress event has the right direction + payload shape.
    for (const e of progressEvents) {
      expect(e.dir).toBe("agent→page");
      expect(e.type).toBe("progress");
      const payload = e.payload as {
        id: string;
        label: string;
        status: string;
        startedAt: number;
        kind: string;
      };
      expect(typeof payload.id).toBe("string");
      expect(typeof payload.label).toBe("string");
      expect(["running", "done", "error"]).toContain(payload.status);
      expect(typeof payload.startedAt).toBe("number");
      expect(typeof payload.kind).toBe("string");
    }
  }, 15000);

  it("calls setCurrentDigest so the dashboard serves the fetched digest", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    // Start the dashboard so no warning prefix is prepended (clean JSON).
    await startDashboard(pi, createCmdCtx());

    const result = (await tool.execute("call-1", {}, undefined, undefined, createCtx())) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text) as { digest: { queue: Array<{ key: string }> } };

    // The in-memory store now holds the digest.
    const stored = getCurrentDigest() as { queue: Array<{ key: string }> } | null;
    expect(stored).not.toBeNull();
    expect(stored!.queue[0]!.key).toBe("AURA-100");

    // The stored digest matches the returned digest.
    expect(stored).toEqual(parsed.digest);
  }, 15000);

  it("does not write ~/.pi/aura/digest.json", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    await tool.execute("call-1", {}, undefined, undefined, createCtx());

    const digestPath = path.join(auraDir, "digest.json");
    expect(existsSync(digestPath)).toBe(false);
  }, 15000);

  it("returns a clear error result when fetchAction throws", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    // Override the fake client to throw.
    const throwingClient = makeFakeAuraClient();
    throwingClient.getBoardBriefing = async () => {
      throw new Error("Aura PAT missing: AURA_API_TOKEN not set");
    };
    _setAuraClientForTesting(throwingClient);

    const result = (await tool.execute("call-1", {}, undefined, undefined, createCtx())) as {
      content: Array<{ type: string; text: string }>;
      details: Record<string, unknown>;
    };

    expect(result.content[0].text).toContain("Aura PAT missing");
    expect(result.details.dir).toBeUndefined();
    expect(Object.keys(result.details)).toHaveLength(0);
  }, 15000);
});

// ---------------------------------------------------------------------------
// digest-fetch dashboard-absent warning (in-process)
// ---------------------------------------------------------------------------

describe("digest-fetch dashboard-absent warning (in-process)", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let auraDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-fetch-warning-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    auraDir = path.join(tmpDir, ".pi", "aura");
    mkdirSync(auraDir, { recursive: true });
    resetStore();
    _setAuraClientForTesting(makeFakeAuraClient());
  });

  afterEach(async () => {
    _setAuraClientForTesting(undefined);
    await ensureTeardown();
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    delete process.env.PI_DIGEST_NO_BROWSER;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("shows a single warning (notify + result text) when dashboard was not running", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    // Dashboard deliberately NOT started (dashboard down)

    const notifyCalls: NotifyCall[] = [];
    const result = (await tool.execute(
      "call-1",
      {},
      undefined,
      undefined,
      createCtxWithNotify(notifyCalls),
    )) as {
      content: Array<{ type: string; text: string }>;
      details: Record<string, unknown>;
    };

    // Fetch succeeded — no dir (in-process, no temp dir).
    expect(result.details.dir).toBeUndefined();

    // The digest JSON is still present in the result text (after the warning line)
    expect(result.content[0].text).toContain('"digest"');

    // A SINGLE warning notify was fired with "warning" severity (one-shot)
    const warningNotifies = notifyCalls.filter((n) => n.severity === "warning");
    expect(warningNotifies).toHaveLength(1);
    expect(warningNotifies[0].message).toContain("dashboard was not running");

    // The result text contains the warning line
    expect(result.content[0].text).toContain("dashboard was not running");

    // The digest was still populated in the store despite the dashboard being down.
    expect(getCurrentDigest()).not.toBeNull();
  }, 15000);

  it("shows no warning when dashboard is running", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    // Dashboard is up — start the in-process server.
    await startDashboard(pi, createCmdCtx());

    const notifyCalls: NotifyCall[] = [];
    const result = (await tool.execute(
      "call-1",
      {},
      undefined,
      undefined,
      createCtxWithNotify(notifyCalls),
    )) as {
      content: Array<{ type: string; text: string }>;
      details: Record<string, unknown>;
    };

    // No warning notify fired
    const warningNotifies = notifyCalls.filter((n) => n.severity === "warning");
    expect(warningNotifies).toHaveLength(0);

    // No warning line in the result text
    expect(result.content[0].text).not.toContain("dashboard was not running");

    // JSON is clean and parseable
    const parsed = JSON.parse(result.content[0].text) as {
      digest: { queue: Array<{ key: string }> };
      report: unknown;
    };
    expect(parsed.digest.queue[0]!.key).toBe("AURA-100");
  }, 15000);
});

// ---------------------------------------------------------------------------
// digest-fetch SSE test — progress events + change fan out to a connected
// /events client.
// ---------------------------------------------------------------------------

describe("digest-fetch SSE fan-out (in-process)", () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-fetch-sse-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    resetStore();
    _setAuraClientForTesting(makeFakeAuraClient());
  });

  afterEach(async () => {
    _setAuraClientForTesting(undefined);
    await ensureTeardown();
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    delete process.env.PI_DIGEST_NO_BROWSER;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("SSE client receives progress state-change events + a change event when setCurrentDigest fires", async () => {
    const pi = createFakePi();
    installExtension(pi);
    const tool = findTool(pi, "digest-fetch");

    // Start the in-process server.
    const startResult = await startDashboard(pi, createCmdCtx());
    expect(startResult.ok).toBe(true);
    const baseUrl = startResult.url!;

    // Connect to /events SSE.
    const receivedChunks: string[] = [];
    await new Promise<void>((resolve, reject) => {
      let sawProgress = false;
      let sawChange = false;

      const req = http.request(`${baseUrl}events`, { method: "GET" }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/event-stream");
        res.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf-8");
          receivedChunks.push(text);
          if (text.includes("event: state-change") && text.includes("progress")) {
            sawProgress = true;
          }
          if (text.includes("event: change")) {
            sawChange = true;
          }
          if (sawProgress && sawChange) {
            req.destroy();
            resolve();
          }
        });
      });
      req.on("error", reject);
      req.on("close", () => resolve());
      req.end();

      // Allow the SSE connection to establish, then run digest-fetch.
      setTimeout(async () => {
        await tool.execute("call-1", {}, undefined, undefined, createCtx());
      }, 50);
    });

    // The SSE client received at least one progress state-change event.
    expect(
      receivedChunks.some(
        (c) => c.includes("event: state-change") && c.includes('"type":"progress"'),
      ),
    ).toBe(true);

    // The SSE client received a 'change' event (setCurrentDigest fan-out).
    expect(receivedChunks.some((c) => c.includes("event: change"))).toBe(true);
  }, 15000);
});

// ---------------------------------------------------------------------------
// digest-save tool (still spawns the CLI this slice — slice 3 rewires it)
// ---------------------------------------------------------------------------

describe("digest-save tool", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let auraDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-save-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    process.env.PI_DIGEST_NO_BROWSER = "1";
    auraDir = path.join(tmpDir, ".pi", "aura");
    mkdirSync(auraDir, { recursive: true });
  });

  afterEach(async () => {
    await ensureTeardown();
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    delete process.env.PI_DIGEST_NO_BROWSER;
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
