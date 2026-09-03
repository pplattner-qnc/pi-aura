import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  AgentToolResult,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { spawn } from "node:child_process";
import type { Server } from "node:http";
import { existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { startListener, type ListenerHandle } from "./listener.ts";
import { startServer, openBrowser } from "./server.ts";
import { joinUrl } from "@pi-aura/shared/digest/progress-emitter";

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

// Module-scope server handle for the in-process HTTP server.
// startDashboard stores the {server, port, url, done} here; teardownDashboard
// closes it. No spawned child, no server-url.json, no pid.
interface ServerHandle {
  server: Server;
  port: number;
  url: string;
  done: () => Promise<void>;
}

let serverHandle: ServerHandle | null = null;

/** Return the in-process dashboard URL, or null when the dashboard is stopped. */
export function getDashboardUrl(): string | null {
  return serverHandle?.url ?? null;
}

function defaultAuraPaths(): {
  auraDir: string;
  dashboardPath: string;
  statePath: string;
} {
  const auraDir = path.join(os.homedir(), ".pi", "aura");
  return {
    auraDir,
    dashboardPath: path.join(auraDir, "digest.json"),
    statePath: path.join(auraDir, "state.json"),
  };
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

export async function teardownDashboard(
  statePath: string,
): Promise<TeardownResult> {
  // Stop the in-process listener first so it does not outlive teardown.
  if (listenerHandle) {
    await listenerHandle.stop();
    listenerHandle = undefined;
  }

  // Close the in-process server deterministically.
  if (serverHandle) {
    try {
      await serverHandle.done();
    } catch (err) {
      console.error("teardown: server close error:", err);
    }
    serverHandle = null;
  } else {
    return { ok: true, message: "No dashboard running." };
  }

  // Delete state.json (events still file-backed this slice).
  try {
    if (existsSync(statePath)) {
      rmSync(statePath, { force: true });
    }
  } catch (err) {
    console.error("teardown: failed to delete", statePath, err);
  }

  return { ok: true, message: "Digest dashboard stopped." };
}

export async function startDashboard(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext | ExtensionContext,
  options: StartDashboardOptions = {},
): Promise<StartResult> {
  // Already running — no orphan-reap branch needed (no detached child).
  if (serverHandle !== null) {
    return {
      ok: false,
      message: "Digest dashboard already running. Use the digest-dashboard-stop tool first.",
    };
  }

  // Clean up any stale listener handle before starting a fresh one.
  if (listenerHandle) {
    await listenerHandle.stop();
    listenerHandle = undefined;
  }

  const { dashboardPath, statePath } = defaultAuraPaths();

  // Start the server in-process — no spawn, no writePid, no waitForServerUrl.
  let started;
  try {
    started = await startServer({
      dashboardPath,
      statePath,
      openBrowser: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Failed to start digest dashboard server: ${message}` };
  }

  serverHandle = {
    server: started.server,
    port: started.port,
    url: started.url,
    done: started.done,
  };

  if (options.openBrowser !== false && process.env.PI_DIGEST_NO_BROWSER !== "1") {
    try {
      openBrowser(started.url);
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
      url: started.url,
    };
  }

  const message = `Digest dashboard running at ${started.url}`;
  if ("ui" in ctx && ctx.ui) {
    ctx.ui.notify(message, "info");
  }

  return { ok: true, message, url: started.url };
}

const DIGEST_TOOLS: readonly string[] = [
  "digest-dashboard-start",
  "digest-dashboard-stop",
  "digest-fetch",
  "digest-save",
  "digest-log",
];

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
      const { statePath } = defaultAuraPaths();
      const result = await teardownDashboard(statePath);
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
      const dashboardWasDown = getDashboardUrl() === null;

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
      const dashboardUrl = getDashboardUrl();
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
    const { statePath } = defaultAuraPaths();
    await teardownDashboard(statePath);
  });
}
