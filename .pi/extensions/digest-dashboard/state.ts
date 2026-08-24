// Shared helpers for ~/.pi/aura/state.json.
// Used by server.ts (POST /api/state), listener.ts (read past cursor),
// and index.ts (write/clear server PID).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { ActionClickPayload } from "./digest-types.ts";

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
  type: "action_click" | "ack" | "update_view";
  payload: ActionClickPayload | AckPayload | UpdateViewPayload;
}

export interface StateFile {
  pid: number | null;
  server_started: number | null;
  events: StateEvent[];
}

export const EMPTY_STATE: StateFile = {
  pid: null,
  server_started: null,
  events: [],
};

// Serialize read-modify-write operations per state file so concurrent
// appends within this process do not clobber each other.
const writeQueues = new Map<string, Promise<unknown>>();

function ensureDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function enqueue<T>(filePath: string, task: () => T | Promise<T>): Promise<T> {
  const pending = writeQueues.get(filePath) ?? Promise.resolve();
  const next = pending.then(task, task);
  writeQueues.set(filePath, next);
  next.finally(() => {
    if (writeQueues.get(filePath) === next) {
      writeQueues.delete(filePath);
    }
  });
  return next as Promise<T>;
}

export function readState(filePath: string): StateFile {
  if (!existsSync(filePath)) {
    return structuredClone(EMPTY_STATE);
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<StateFile>;
  return {
    pid: parsed.pid ?? null,
    server_started: parsed.server_started ?? null,
    events: parsed.events ?? [],
  };
}

export function appendEvent(filePath: string, event: StateEvent): Promise<void> {
  return enqueue(filePath, () => {
    ensureDir(filePath);
    const state = existsSync(filePath) ? readState(filePath) : structuredClone(EMPTY_STATE);
    state.events.push(event);
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  });
}

export function writePid(filePath: string, pid: number, serverStarted: number): Promise<void> {
  return enqueue(filePath, () => {
    ensureDir(filePath);
    const state = existsSync(filePath) ? readState(filePath) : structuredClone(EMPTY_STATE);
    state.pid = pid;
    state.server_started = serverStarted;
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  });
}

export function clearPid(filePath: string): Promise<void> {
  return enqueue(filePath, () => {
    ensureDir(filePath);
    const state = existsSync(filePath) ? readState(filePath) : structuredClone(EMPTY_STATE);
    state.pid = null;
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  });
}
