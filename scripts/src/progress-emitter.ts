// progress-emitter.ts — the onProgress hook for runTasks that POSTs batched
// progress events to the dashboard's /api/state.
//
// This is a separate module from aura-digest.ts so it can be unit-tested
// without importing aura-digest.ts (which has module-level side effects:
// the `main().catch()` call that invokes process.exit on error).
//
// Design:
//   - readDashboardUrl(path?) reads ~/.pi/aura/server-url.json ONCE at fetch
//     start. If absent (or malformed), the hook is a no-op for the whole run.
//   - createProgressEmitter(dashboardUrl, opts?) returns a hook function
//     compatible with the scheduler's onProgress, plus a flush() method for
//     run-end flushing. Events are batched on a ~50ms timer; near-instant
//     open→done pairs on the same node id coalesce to a single "done" event.
//   - flush() sends any pending events immediately (called at run end).
//
// Batching model: events arriving within the same ~50ms timer window are
// collected and coalesced by node id (latest status wins). When the timer
// fires, each remaining event is POSTed individually as a StateEvent to
// /api/state — the server's POST handler accepts one StateEvent at a time.
// The "batch" is the time window + coalescing, not a single HTTP body.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** A ProgressEvent-like shape — compatible with the scheduler's ProgressEvent
 *  and the dashboard's ProgressPayload. */
export interface ProgressEventLike {
  id: string;
  label: string;
  parentId?: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
  kind: string;
}

/** Shape of a progress event as POSTed to /api/state (a StateEvent wrapper). */
export interface ProgressStateEvent {
  id: number;
  ts: string;
  dir: "agent→page";
  type: "progress";
  payload: ProgressEventLike;
}

/** Options for createProgressEmitter. */
export interface ProgressEmitterOptions {
  /** Batch timer interval in ms (default 50). */
  batchMs?: number;
  /** Injectable fetch for testing. */
  fetchImpl?: typeof fetch;
}

/** The onProgress hook + run-end flush. */
export interface ProgressEmitter {
  (event: ProgressEventLike): void;
  flush(): Promise<void>;
}

/** Default path to ~/.pi/aura/server-url.json. */
export function defaultServerUrlPath(): string {
  return join(homedir(), ".pi", "aura", "server-url.json");
}

/**
 * Read the dashboard server URL from server-url.json. Returns null if the
 * file is absent or malformed — the caller treats null as "dashboard is
 * down, the hook is a no-op for the whole run."
 */
export function readDashboardUrl(serverUrlPath: string = defaultServerUrlPath()): string | null {
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

/** Build a StateEvent wrapper around a progress payload. The id is a
 *  placeholder (0) — the server assigns the real monotonic id in
 *  appendEvent (FIX 2: server-side id assignment). */
function wrapEvent(payload: ProgressEventLike): ProgressStateEvent {
  return {
    id: 0,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: "progress",
    payload,
  };
}

/**
 * Create a progress emitter hook. If `dashboardUrl` is null, the returned
 * hook is a no-op (no POSTs, no batching). Otherwise events are batched on
 * a ~50ms timer and flushed via `hook.flush()` at run end.
 *
 * Coalescing: when two events arrive for the same node id within the same
 * batch window, only the latest status is kept. A near-instant open→done
 * pair coalesces to a single "done" event.
 */
export function createProgressEmitter(
  dashboardUrl: string | null,
  opts: ProgressEmitterOptions = {},
): ProgressEmitter {
  if (dashboardUrl === null) {
    const noop: ProgressEmitter = async () => {};
    noop.flush = async () => {};
    return noop;
  }

  const batchMs = opts.batchMs ?? 50;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const apiUrl = joinUrl(dashboardUrl, "/api/state");

  // Pending events keyed by node id — coalescing keeps only the latest.
  const pending = new Map<string, ProgressEventLike>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const postEvents = async (events: ProgressEventLike[]): Promise<void> => {
    for (const payload of events) {
      const stateEvent = wrapEvent(payload);
      try {
        await fetchImpl(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stateEvent),
        });
      } catch {
        // Best-effort: a POST failure (dashboard went down mid-run) is
        // non-fatal — the digest is the source of truth, not the live tree.
      }
    }
  };

  const drain = async (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const events = [...pending.values()];
    pending.clear();
    await postEvents(events);
  };

  const hook: ProgressEmitter = (event: ProgressEventLike): void => {
    // Coalesce: keep only the latest event per node id.
    pending.set(event.id, event);
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        void drain();
      }, batchMs);
    }
  };

  let flushing = false;
  hook.flush = async (): Promise<void> => {
    if (flushing) return;
    flushing = true;
    try {
      await drain();
    } finally {
      flushing = false;
    }
  };

  return hook;
}

/** Join a base URL with a path, handling trailing slashes. */
function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}
