// Shared types for the digest dashboard state events.
// The file-based state (state.json) backing was replaced by the in-memory
// store.ts (slice 2). Only the type definitions remain here — they are
// imported by store.ts, listener.ts, and server.ts.

import type { ActionClickPayload, ProgressPayload, AgentLogPayload } from "./digest-types.ts";

export interface AckPayload {
  event_id: number;
  status: "done" | "error";
}

export interface UpdateViewPayload {
  // Partial digest fields used to update the client view.
  [key: string]: unknown;
}

export interface StateEvent {
  id: number;
  ts: string;
  dir: "page→agent" | "agent→page";
  type: "action_click" | "ack" | "update_view" | "progress" | "agent_log";
  payload: ActionClickPayload | AckPayload | UpdateViewPayload | ProgressPayload | AgentLogPayload;
}
