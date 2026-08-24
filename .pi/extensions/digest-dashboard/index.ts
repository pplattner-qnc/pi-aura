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

function parseSubcommand(args: string): string {
  return args.trim().split(/\s+/)[0] ?? "";
}

async function stopHandler(ctx: ExtensionCommandContext): Promise<void> {
  const { statePath, serverUrlPath } = defaultAuraPaths();
  const result = await teardownDashboard(statePath, serverUrlPath);
  ctx.ui.notify(result.message, result.ok ? "info" : "error");
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

const DIGEST_TOOLS = [
  "digest-dashboard-start",
  "digest-dashboard-stop",
  "digest-fetch",
  "digest-save",
] as const;

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

async function startHandler(ctx: ExtensionCommandContext): Promise<void> {
  // The default export captures the ExtensionAPI in closure; command handlers
  // receive the same API instance via the registered handler, so we pass it
  // explicitly to keep startDashboard testable.
  // rule: tdd-worker closure capture — startDashboard needs the API; the
  // command handler uses the module-level `pi` binding defined below.
  if (!extensionApi) {
    ctx.ui.notify("Extension not initialized.", "error");
    return;
  }
  await startDashboard(extensionApi, ctx);
}

let extensionApi: ExtensionAPI | undefined;

export default function (pi: ExtensionAPI): void {
  extensionApi = pi;

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

  pi.registerCommand("digest", {
    description: "Activate the Aura digest tools and inject the aura-digest skill.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await digestCommandHandler(pi, args, ctx);
    },
  });

  pi.registerCommand("digest-dashboard", {
    description: "Aura digest interactive dashboard",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const subcommand = parseSubcommand(args);
      if (subcommand === "stop") {
        await stopHandler(ctx);
      } else if (subcommand === "start") {
        await startHandler(ctx);
      } else {
        ctx.ui.notify("Usage: /digest-dashboard start|stop", "warning");
      }
    },
  });

  pi.on("session_start", (_event: unknown, ctx: ExtensionContext) => {
    sessionCwd = ctx.cwd;
  });

  pi.on("session_shutdown", async () => {
    const { statePath, serverUrlPath } = defaultAuraPaths();
    await teardownDashboard(statePath, serverUrlPath);
  });
}
