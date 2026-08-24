import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readState } from "./state.ts";

export interface TeardownResult {
  ok: boolean;
  message: string;
}

// Current session cwd, used by command argument completions. Updated on session_start.
let sessionCwd: string | undefined;

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

async function startHandler(ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify("start: not yet implemented", "info");
}

export default function (pi: ExtensionAPI): void {
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
