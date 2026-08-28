import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  AgentToolResult,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { spawn } from "node:child_process";
import { existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { readState, writePid } from "./state.ts";
import { startListener, type ListenerHandle } from "./listener.ts";
import { openBrowser } from "./server.ts";

export interface TeardownResult {
  ok: boolean;
  message: string;
}

export interface StartResult {
  ok: boolean;
  message: string;
  url?: string;
}

interface StartDashboardOptions {
  openBrowser?: boolean;
}

const startToolParameters = Type.Object({
  openBrowser: Type.Optional(
    Type.Boolean({
      description: "Open the dashboard in the browser automatically (default true).",
    }),
  ),
});

type StartToolParams = Static<typeof startToolParameters>;

const fetchToolParameters = Type.Object({});

type FetchToolParams = Static<typeof fetchToolParameters>;

const saveToolParameters = Type.Object({
  dir: Type.String({
    description: "The output directory returned by digest-fetch (details.dir).",
  }),
});

type SaveToolParams = Static<typeof saveToolParameters>;

const logToolParameters = Type.Object({
  message: Type.String({
    description: "A single status line to display in the dashboard's log list below the progress tree.",
  }),
});

type LogToolParams = Static<typeof logToolParameters>;

const stopToolParameters = Type.Object({});

type StopToolParams = Static<typeof stopToolParameters>;

// Current session cwd, used by command argument completions. Updated on session_start.
let sessionCwd: string | undefined;

// In-process listener handle. Kept so stop/session_shutdown can close fs.watch.
let listenerHandle: ListenerHandle | undefined;

function defaultAuraPaths(): {
  auraDir: string;
  dashboardPath: string;
  statePath: string;
  serverUrlPath: string;
} {
  const auraDir = path.join(os.homedir(), ".pi", "aura");
  return {
    auraDir,
    dashboardPath: path.join(auraDir, "digest.json"),
    statePath: path.join(auraDir, "state.json"),
    serverUrlPath: path.join(auraDir, "server-url.json"),
  };
}

function resolveServerEntryPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "dist", "server.mjs");
}

function resolveAuraDigestScriptPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../../skills/core/aura-digest/dist/aura-digest.mjs");
}

interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function runAuraDigest(args: string[]): Promise<SpawnResult> {
  const scriptPath = resolveAuraDigestScriptPath();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });

    child.on("error", (err: Error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${err.message}` });
    });
  });
}

async function waitForServerUrl(
  serverUrlPath: string,
  child: ReturnType<typeof spawn>,
): Promise<{ url: string } | null> {
  const maxTries = 100;
  const intervalMs = 50;

  for (let i = 0; i < maxTries; i++) {
    // If the child died before writing server-url.json, give up early.
    if (child.exitCode !== null) {
      return null;
    }

    if (existsSync(serverUrlPath)) {
      try {
        const raw = readFileSync(serverUrlPath, "utf-8");
        const parsed = JSON.parse(raw) as { url?: string };
        if (parsed.url) {
          return { url: parsed.url };
        }
      } catch {
        // Ignore malformed/transient file; retry.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateProcess(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") {
      return;
    }
    throw err;
  }

  // Give the process a short grace period, then escalate to SIGKILL.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ESRCH") {
        return;
      }
      throw err;
    }
    // Wait for the SIGKILL to take effect so callers can rely on the
    // process being gone before they delete the state files that record
    // its pid. A detached/unref'd child can take a tick to be reaped.
    for (let i = 0; i < 20 && isProcessAlive(pid); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function deleteFiles(statePath: string, serverUrlPath: string): void {
  for (const filePath of [statePath, serverUrlPath]) {
    try {
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
      }
    } catch (err) {
      console.error("teardown: failed to delete", filePath, err);
    }
  }
}

export async function teardownDashboard(
  statePath: string,
  serverUrlPath: string,
): Promise<TeardownResult> {
  // Stop the in-process listener first so it does not outlive teardown.
  if (listenerHandle) {
    await listenerHandle.stop();
    listenerHandle = undefined;
  }

  if (!existsSync(statePath)) {
    return { ok: true, message: "No dashboard running." };
  }

  let state;
  try {
    state = readState(statePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deleteFiles(statePath, serverUrlPath);
    return { ok: false, message: `Could not read state: ${message}` };
  }

  const pid = state.pid;

  if (pid !== null && isProcessAlive(pid)) {
    try {
      await terminateProcess(pid);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deleteFiles(statePath, serverUrlPath);
      return {
        ok: false,
        message: `Failed to stop dashboard process: ${message}`,
      };
    }
  }

  deleteFiles(statePath, serverUrlPath);
  return { ok: true, message: "Digest dashboard stopped." };
}

export async function startDashboard(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext | ExtensionContext,
  options: StartDashboardOptions = {},
): Promise<StartResult> {
  const { statePath, serverUrlPath } = defaultAuraPaths();
  const state = readState(statePath);

  if (state.pid !== null && isProcessAlive(state.pid)) {
    // The recorded pid is alive. If server-url.json is also present, the
    // dashboard is genuinely running — no-op. If server-url.json is ABSENT,
    // the dashboard is an orphan: a prior teardown (e.g. session_shutdown)
    // deleted the URL file without reaping the detached server, so the
    // browser is still connected but digest-fetch cannot find it. Kill the
    // orphan and respawn a fresh, findable server instead of getting stuck.
    if (existsSync(serverUrlPath)) {
      return {
        ok: false,
        message: "Digest dashboard already running. Use the digest-dashboard-stop tool first.",
      };
    }
    // Orphaned: best-effort reap, then fall through to start a fresh one.
    try {
      await terminateProcess(state.pid);
    } catch {
      // Best-effort — proceed to spawn regardless.
    }
  }

  // Clean up any stale listener handle before starting a fresh one.
  if (listenerHandle) {
    await listenerHandle.stop();
    listenerHandle = undefined;
  }

  const serverEntryPath = resolveServerEntryPath();
  if (!existsSync(serverEntryPath)) {
    return {
      ok: false,
      message: `Server bundle not found at ${serverEntryPath}. Run npm run build in .pi/extensions/digest-dashboard.`,
    };
  }

  const child = spawn(process.execPath, [serverEntryPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  if (!child.pid) {
    return { ok: false, message: "Failed to spawn digest dashboard server." };
  }

  try {
    await writePid(statePath, child.pid, Date.now());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Failed to record server PID: ${message}` };
  }

  const serverUrl = await waitForServerUrl(serverUrlPath, child);

  if (!serverUrl) {
    // Best-effort cleanup of the failed child.
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
    try {
      rmSync(statePath, { force: true });
    } catch {
      // ignore
    }
    return {
      ok: false,
      message: "Digest dashboard server did not report its URL within the timeout.",
    };
  }

  if (options.openBrowser !== false && process.env.PI_DIGEST_NO_BROWSER !== "1") {
    try {
      openBrowser(serverUrl.url);
    } catch {
      // Best-effort: browser failures should not stop the dashboard.
    }
  }

  try {
    listenerHandle = startListener({ pi, statePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Server started but listener failed to start: ${message}`,
      url: serverUrl.url,
    };
  }

  const message = `Digest dashboard running at ${serverUrl.url}`;
  if ("ui" in ctx && ctx.ui) {
    ctx.ui.notify(message, "info");
  }

  return { ok: true, message, url: serverUrl.url };
}

const DIGEST_TOOLS: readonly string[] = [
  "digest-dashboard-start",
  "digest-dashboard-stop",
  "digest-fetch",
  "digest-save",
  "digest-log",
];

// Read the dashboard server URL from ~/.pi/aura/server-url.json. Returns null if
// the file is absent or malformed — the caller treats null as "dashboard is
// down, skip the log POST." Mirrors scripts/src/progress-emitter.ts
// readDashboardUrl by design (a cross-project import is blocked by this
// extension's tsconfig rootDir — see TS6059).
function readDashboardUrl(serverUrlPath: string = defaultAuraPaths().serverUrlPath): string | null {
  if (!existsSync(serverUrlPath)) return null;
  try {
    const raw = readFileSync(serverUrlPath, "utf-8");
    const parsed = JSON.parse(raw) as { url?: string };
    if (typeof parsed.url === "string" && parsed.url.length > 0) return parsed.url;
    return null;
  } catch {
    return null;
  }
}

function joinUrl(base: string, p: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const pp = p.startsWith("/") ? p : `/${p}`;
  return `${b}${pp}`;
}

export async function digestCommandHandler(
  pi: ExtensionAPI,
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  try {
    const activeTools = pi.getActiveTools();
    const merged = [...new Set([...activeTools, ...DIGEST_TOOLS])];
    pi.setActiveTools(merged);

    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const skillPath = path.resolve(moduleDir, "../../../skills/core/aura-digest/aura-digest.md");
    const skillBody = readFileSync(skillPath, "utf-8");

    pi.sendMessage(
      { customType: "aura-digest-skill", content: skillBody, display: false },
      { triggerTurn: true },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to inject aura-digest skill: ${message}`, "error");
  }
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "digest-dashboard-start",
    label: "Start Digest Dashboard",
    description:
      "Start the Aura digest dashboard in the browser. Returns the local URL. Use this when the user wants to open or refresh the interactive digest view.",
    promptSnippet: "digest-dashboard-start — opens the Aura digest dashboard in a browser.",
    promptGuidelines: [
      "Use digest-dashboard-start when the user asks to open the Aura digest dashboard.",
    ],
    parameters: startToolParameters,
    async execute(
      _toolCallId: string,
      params: StartToolParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<{ url: string }>> {
      const result = await startDashboard(pi, ctx, {
        openBrowser: params.openBrowser ?? true,
      });
      return {
        content: [{ type: "text", text: result.message }],
        details: result.url ? { url: result.url } : { url: "" },
      };
    },
  });

  pi.registerTool({
    name: "digest-dashboard-stop",
    label: "Stop Digest Dashboard",
    description:
      "Stop the Aura digest dashboard server and clean up its state files. Use this for a clean close at the end of a digest session.",
    parameters: stopToolParameters,
    async execute(
      _toolCallId: string,
      _params: StopToolParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
    ): Promise<AgentToolResult<Record<string, never>>> {
      const { statePath, serverUrlPath } = defaultAuraPaths();
      const result = await teardownDashboard(statePath, serverUrlPath);
      return {
        content: [{ type: "text", text: result.message }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "digest-fetch",
    label: "Fetch Aura digest",
    description:
      "Fetch today's Aura digest data. Returns the digest and report JSON plus the output directory. Also writes ~/.pi/aura/digest.json for the dashboard.",
    parameters: fetchToolParameters,
    async execute(
      _toolCallId: string,
      _params: FetchToolParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<{ dir?: string }>> {
      // Check whether the dashboard was running before the fetch started. The
      // flag is read once here and evaluated once at the end of the success
      // path — a one-shot warning, never per-event.
      const dashboardWasDown = readDashboardUrl() === null;

      const result = await runAuraDigest(["fetch"]);
      if (result.exitCode !== 0) {
        const errorText = result.stderr.trim() || `digest-fetch exited with code ${result.exitCode}`;
        return {
          content: [{ type: "text", text: `digest-fetch failed: ${errorText}` }],
          details: {},
        };
      }

      const match = result.stdout.match(/output directory:\s*(.+?)\/?\s*$/m);
      if (!match) {
        return {
          content: [{ type: "text", text: "digest-fetch failed: could not parse output directory from script stdout" }],
          details: {},
        };
      }

      const dir = path.normalize(match[1]);
      const digestPath = path.join(dir, "digest.json");
      const reportPath = path.join(dir, "report.json");

      try {
        const digest = JSON.parse(readFileSync(digestPath, "utf-8")) as unknown;
        const report = JSON.parse(readFileSync(reportPath, "utf-8")) as unknown;
        const dashboardPath = defaultAuraPaths().dashboardPath;
        if (!existsSync(dashboardPath)) {
          return {
            content: [{ type: "text", text: `digest-fetch failed: dashboard digest not written to ${dashboardPath}` }],
            details: {},
          };
        }

        let text = JSON.stringify({ digest, report });
        // One-shot end-of-run warning when the dashboard was absent: a pi-TUI
        // notify + a warning line prepended to the result text. The fetch
        // still succeeds — the digest is written and returned.
        if (dashboardWasDown) {
          ctx.ui.notify(
            "digest-fetch: dashboard was not running, no live tree shown",
            "warning",
          );
          text = `⚠️ digest-fetch: dashboard was not running, no live tree shown.\n${text}`;
        }

        return {
          content: [{ type: "text", text }],
          details: { dir },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `digest-fetch failed: ${message}` }],
          details: {},
        };
      }
    },
  });

  pi.registerTool({
    name: "digest-save",
    label: "Save Aura digest",
    description:
      "Save the digest from the given directory as the last presented digest (~/.pi/aura/last-digest.json). Pass the directory returned by digest-fetch.",
    parameters: saveToolParameters,
    async execute(
      _toolCallId: string,
      params: SaveToolParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
    ): Promise<AgentToolResult<Record<string, never>>> {
      const result = await runAuraDigest(["save", params.dir]);
      if (result.exitCode !== 0) {
        const errorText = result.stderr.trim() || `digest-save exited with code ${result.exitCode}`;
        return {
          content: [{ type: "text", text: `digest-save failed: ${errorText}` }],
          details: {},
        };
      }
      return {
        content: [{ type: "text", text: `digest-save: saved last digest from ${params.dir}` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "digest-log",
    label: "Log a status line to the digest dashboard",
    description:
      "Push a single status line to the running digest dashboard's log list (below the progress tree). A no-op if the dashboard is not running — it never fails the agent's call.",
    promptSnippet: "digest-log — append a status line to the live digest dashboard.",
    promptGuidelines: [
      "Use digest-log to push status lines during the augment phase so the user sees live progress in the dashboard.",
    ],
    parameters: logToolParameters,
    async execute(
      _toolCallId: string,
      params: LogToolParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
    ): Promise<AgentToolResult<Record<string, never>>> {
      const dashboardUrl = readDashboardUrl();
      if (dashboardUrl === null) {
        return {
          content: [
            { type: "text", text: "digest-log: dashboard not running, log skipped" },
          ],
          details: {},
        };
      }

      const apiUrl = joinUrl(dashboardUrl, "/api/state");
      const body = JSON.stringify({
        id: 0,
        ts: new Date().toISOString(),
        dir: "agent→page",
        type: "agent_log",
        payload: { message: params.message },
      });

      try {
        await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        return {
          content: [{ type: "text", text: `digest-log: ok (${params.message})` }],
          details: {},
        };
      } catch {
        // Best-effort: a POST failure (dashboard went down mid-run) is
        // non-fatal — the log is a nice-to-have, not a gate.
        return {
          content: [
            { type: "text", text: `digest-log: ok (post failed, non-fatal) — ${params.message}` },
          ],
          details: {},
        };
      }
    },
  });

  pi.registerCommand("aura-digest", {
    description: "Activate the Aura digest tools and inject the aura-digest skill.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await digestCommandHandler(pi, args, ctx);
    },
  });

  pi.on("session_start", (_event: unknown, ctx: ExtensionContext) => {
    sessionCwd = ctx.cwd;
    const initial = pi.getActiveTools().filter((n) => !DIGEST_TOOLS.includes(n));
    pi.setActiveTools([...new Set([...initial])]);
  });

  pi.on("session_shutdown", async () => {
    const { statePath, serverUrlPath } = defaultAuraPaths();
    await teardownDashboard(statePath, serverUrlPath);
  });
}
