import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  AgentToolResult,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import type { Server } from "node:http";
import { existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { startListener, type ListenerHandle } from "./listener.ts";
import { startServer, openBrowser } from "./server.ts";
import { fetchAction, saveLastDigest } from "@pi-aura/shared/digest/aura-digest";
import type { AuraClient } from "@pi-aura/shared/aura-client";
import type { ProgressEvent } from "@pi-aura/shared/digest/scheduler";
import type { Digest } from "@pi-aura/shared/digest/types";
import { resetStore, pushEvent, setCurrentDigest, getCurrentDigest } from "./store.ts";
import type { StateEvent } from "./state.ts";
import type { ProgressPayload } from "./digest-types.ts";

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

const saveToolParameters = Type.Object({});

type SaveToolParams = Static<typeof saveToolParameters>;

const logToolParameters = Type.Object({
  message: Type.String({
    description: "A single status line to display in the dashboard's log list below the progress tree.",
  }),
});

type LogToolParams = Static<typeof logToolParameters>;

const updateToolParameters = Type.Object({
  digest: Type.Any({
    description: "The full corrected digest object (as returned by digest-fetch's digest, with summary/reviews/actions/corrections/followup applied). Replaces the in-memory current digest the dashboard serves.",
  }),
});

type UpdateToolParams = Static<typeof updateToolParameters>;

const ackToolParameters = Type.Object({
  event_id: Type.Number({
    description: "The id of the action_click event being acknowledged (from the forwarded click's details).",
  }),
});

type AckToolParams = Static<typeof ackToolParameters>;

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

// Test-injection seam for fetchAction's AuraClient. When set, digest-fetch
// calls fetchAction({ auraClient: injectedAuraClient }) instead of letting
// fetchAction construct the default client. Tests use this to inject a fake
// AuraClient (per docs/testing.md: inject a fake AuraClient, don't module-
// mock the internal collaborator). Undefined in production — fetchAction
// calls createDefaultAuraClient() internally.
let injectedAuraClient: AuraClient | undefined;

/** @internal Test-only seam to inject a fake AuraClient into digest-fetch. */
export function _setAuraClientForTesting(client: AuraClient | undefined): void {
  injectedAuraClient = client;
}

/** Translate a scheduler ProgressEvent into a progress StateEvent and push
 *  it to the in-memory store. 1 event = 1 push (no batching — the in-memory
 *  push has no network cost). The store assigns the monotonic id
 *  (overwriting the id:0 placeholder). */
function adaptProgressToStore(e: ProgressEvent): void {
  const payload: ProgressPayload = {
    id: e.id,
    label: e.label,
    parentId: e.parentId,
    status: e.status,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    kind: e.kind,
  };
  const stateEvent: StateEvent = {
    id: 0,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: "progress",
    payload,
  };
  pushEvent(stateEvent);
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

  // Delete state.json (best-effort — may linger from a pre-slice-2 session).
  try {
    if (existsSync(statePath)) {
      rmSync(statePath, { force: true });
    }
  } catch (err) {
    console.error("teardown: failed to delete", statePath, err);
  }

  // Reset the in-memory store so a fresh start is clean (no stale digest/events).
  resetStore();

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

  // Start the server in-process — no spawn, no waitForServerUrl.
  // startServer no longer needs dashboardPath/statePath (in-memory backing).
  let started;
  try {
    started = await startServer({
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
    listenerHandle = startListener({ pi });
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
  "digest-update",
  "digest-ack",
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
      "Fetch today's Aura digest data in-process. Returns the digest and report JSON. Populates the in-memory dashboard store (progress events stream live + the digest is served from /api/digest).",
    parameters: fetchToolParameters,
    async execute(
      _toolCallId: string,
      _params: FetchToolParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<Record<string, never>>> {
      // Check whether the dashboard was running before the fetch started. The
      // flag is read once here and evaluated once at the end of the success
      // path — a one-shot warning, never per-event.
      const dashboardWasDown = getDashboardUrl() === null;

      try {
        const result = await fetchAction({
          onProgress: adaptProgressToStore,
          ...(injectedAuraClient ? { auraClient: injectedAuraClient } : {}),
        });

        // Populate the in-memory current digest — ends the task-2 empty-
        // dashboard regression (/api/digest serves it; the 'change' SSE fans
        // out and the browser re-fetches).
        setCurrentDigest(result.digest);

        let text = JSON.stringify({ digest: result.digest, report: result.report });

        // One-shot end-of-run warning when the dashboard was absent. The
        // fetch still succeeds — the digest is populated in the store
        // regardless (setCurrentDigest ran). The warning is only about the
        // live tree not rendering (events won't fan out to a browser if the
        // server is down).
        if (dashboardWasDown) {
          if (ctx.ui) {
            ctx.ui.notify(
              "digest-fetch: dashboard was not running, no live tree shown",
              "warning",
            );
          }
          text = `⚠️ digest-fetch: dashboard was not running, no live tree shown.\n${text}`;
        }

        return {
          content: [{ type: "text", text }],
          details: {},
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
      "Save the current in-memory digest as the last presented digest (~/.pi/aura/last-digest.json). Run digest-fetch first.",
    parameters: saveToolParameters,
    async execute(
      _toolCallId: string,
      _params: SaveToolParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
    ): Promise<AgentToolResult<Record<string, never>>> {
      const digest = getCurrentDigest();
      if (!digest) {
        return {
          content: [{ type: "text", text: "digest-save: no current digest to save — run digest-fetch first" }],
          details: {},
        };
      }
      saveLastDigest(digest as Digest);
      return {
        content: [{ type: "text", text: "digest-save: saved last digest to ~/.pi/aura/last-digest.json" }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "digest-log",
    label: "Log a status line to the digest dashboard",
    description:
      "Push a single status line to the running digest dashboard's log list (below the progress tree). Always records the status line to the in-memory event stream; it renders in the dashboard log list when the dashboard is running. Never fails the agent call (the line is recorded regardless of whether the dashboard is open).",
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
      pushEvent({
        id: 0,
        ts: new Date().toISOString(),
        dir: "agent→page",
        type: "agent_log",
        payload: { message: params.message },
      });
      return {
        content: [{ type: "text", text: `digest-log: ok (${params.message})` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "digest-update",
    label: "Update the in-memory digest",
    description:
      "Replace the in-memory current digest the dashboard serves (used after correcting the digest — summary, review enrichments, re-ranked actions, corrections — and to set/clear the in-flight followup.currentlyWorkingOn lock before/after acting on a click). The dashboard's /api/digest re-serves this + fans out a 'change' SSE so the browser hot-reloads. No-op safe if the dashboard is not running (the store is still updated).",
    promptSnippet: "digest-update — replace the in-memory digest (corrections or the in-flight lock).",
    promptGuidelines: [
      "Use digest-update to write the corrected digest back to the in-memory store after augmenting (before digest-save).",
      "Use digest-update to set followup.currentlyWorkingOn = \"<section>/<key>\" before acting on a click, and to clear it (null) after the ack.",
    ],
    parameters: updateToolParameters,
    async execute(
      _toolCallId: string,
      params: UpdateToolParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
    ): Promise<AgentToolResult<Record<string, never>>> {
      setCurrentDigest(params.digest);
      return {
        content: [{ type: "text", text: "digest-update: in-memory digest updated" }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "digest-ack",
    label: "Acknowledge a click + clear the in-flight lock",
    description:
      "Acknowledge an action_click the agent acted on (appends an agent→page 'ack' event the dashboard uses to mark the click handled) and clear the in-flight followup.currentlyWorkingOn lock (re-enables sibling buttons). Pass the action_click event's id. A no-op for the ack if the dashboard is not running (the lock still clears).",
    promptSnippet: "digest-ack — acknowledge a click + clear the working-on lock.",
    promptGuidelines: [
      "Use digest-ack after acting on an action_click to mark it done + re-enable sibling buttons.",
    ],
    parameters: ackToolParameters,
    async execute(
      _toolCallId: string,
      params: AckToolParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
    ): Promise<AgentToolResult<Record<string, never>>> {
      pushEvent({
        id: 0,
        ts: new Date().toISOString(),
        dir: "agent→page",
        type: "ack",
        payload: { event_id: params.event_id, status: "done" },
      });
      // Clear the in-flight lock so sibling buttons re-enable.
      const current = getCurrentDigest();
      if (current && typeof current === "object" && "followup" in current) {
        const d = structuredClone(current) as { followup?: { currentlyWorkingOn?: string | null } };
        if (d.followup) {
          d.followup.currentlyWorkingOn = null;
          setCurrentDigest(d);
        }
      }
      return {
        content: [{ type: "text", text: `digest-ack: acknowledged event ${params.event_id} + cleared working-on lock` }],
        details: {},
      };
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
