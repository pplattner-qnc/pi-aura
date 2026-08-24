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
    return {
      ok: false,
      message: "Digest dashboard already running. Use /digest-dashboard stop first.",
    };
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
    const skillPath = path.resolve(moduleDir, "../../../skills/core/aura-digest/SKILL.md");
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
    ): Promise<AgentToolResult<{ dir?: string }>> {
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
        return {
          content: [{ type: "text", text: JSON.stringify({ digest, report }) }],
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

  pi.registerCommand("digest", {
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
