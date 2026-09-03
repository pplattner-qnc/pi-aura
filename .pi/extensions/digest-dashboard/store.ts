// In-memory backing store for the digest dashboard.
// Owns currentDigest, events, SSE clients, and a subscriber set.
// Replaces the file-based (digest.json + state.json) backing.
//
// Interface contract for task 3 (in-process-fetch):
//   - setCurrentDigest(d) — task 3 calls this after fetchAction.
//   - pushEvent(event) — task 3 wires onProgress → pushEvent; task 4 wires
//     digest-log → pushEvent.
//   - subscribe(cb) — the listener uses this for action_click forwarding.
//   - registerSseClient(res) — the /events SSE handler uses this to push
//     state-change events to connected browsers.

import type { ServerResponse } from "node:http";
import type { StateEvent } from "./state.ts";

let currentDigest: unknown | null = null;
let events: StateEvent[] = [];
let nextEventId = 1;
const sseClients = new Set<ServerResponse>();
const subscribers = new Set<(e: StateEvent) => void>();

/** Set the current digest (the seam task 3 calls after fetchAction). */
export function setCurrentDigest(d: unknown | null): void {
  currentDigest = d;
  // Fan out a 'change' SSE event so the browser re-fetches /api/digest.
  // In-memory, setCurrentDigest is the analog of the old fs.watch on
  // digest.json — the browser refreshes on 'change'.
  for (const client of sseClients) {
    try {
      client.write("event: change\ndata: {}\n\n");
    } catch {
      // Client may have disconnected; ignore write errors.
    }
  }
}

/** Get the current digest (null when none has been set). */
export function getCurrentDigest(): unknown | null {
  return currentDigest;
}

/** Exposed for task 3/4 tests that need to inspect the event log. */
export function getEvents(): StateEvent[] {
  return events;
}

/**
 * Push an event to the in-memory store. Assigns a server-side monotonic id
 * (overwriting any client-supplied id, like the old appendEvent did),
 * appends to the events array, writes an SSE state-change event to each
 * connected SSE client, and notifies all subscribers.
 */
export function pushEvent(event: StateEvent): void {
  event.id = nextEventId++;
  events.push(event);

  // SSE fan-out: matches today's state-change SSE format.
  const sseData = `event: state-change\ndata: {"id":${event.id},"type":"${event.type}"}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(sseData);
    } catch {
      // Client may have disconnected; ignore write errors.
    }
  }

  // Notify subscribers (the listener).
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch {
      // A subscriber error should not stop other subscribers.
    }
  }
}

/**
 * Subscribe to the in-memory event stream. Returns an unsubscribe function.
 * Used by the listener to forward action_click events to pi.sendMessage.
 */
export function subscribe(cb: (e: StateEvent) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Register an SSE client response. Returns an unregister function — call on
 * req 'close' so the store stops writing to a dead connection.
 */
export function registerSseClient(res: ServerResponse): () => void {
  sseClients.add(res);
  return () => {
    sseClients.delete(res);
  };
}

/** Reset the store to a clean slate (for tests + teardown). */
export function resetStore(): void {
  currentDigest = null;
  events = [];
  nextEventId = 1;
  sseClients.clear();
  subscribers.clear();
}
