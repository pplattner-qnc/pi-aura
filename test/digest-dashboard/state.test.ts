// Unit tests for digest-dashboard state.ts helpers.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readState,
  appendEvent,
  writePid,
  clearPid,
} from "../../.pi/extensions/digest-dashboard/state.ts";

describe("state.ts helpers", () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-state-"));
    statePath = path.join(tmpDir, "state.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("readState returns the empty state when the file is absent", () => {
    expect(readState(statePath)).toEqual({ pid: null, server_started: null, events: [] });
  });

  it("appendEvent creates state.json as [event] when absent", async () => {
    const event = {
      id: 1,
      ts: new Date().toISOString(),
      dir: "page→agent" as const,
      type: "action_click" as const,
      payload: {
        section: "overdue",
        key: "AURA-1",
        action: "advance",
        label: "Advance AURA-1",
        instruction: "Handle AURA-1",
        aura_use_case: "task-management",
      },
    };
    await appendEvent(statePath, event);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events).toEqual([event]);
    expect(state.pid).toBeNull();
    expect(state.server_started).toBeNull();
  });

  it("writePid sets pid and server_started without touching events", async () => {
    writeFileSync(
      statePath,
      JSON.stringify({ pid: null, server_started: null, events: [{ id: 1 } ] }),
    );
    await writePid(statePath, 12345, 1_700_000_000_000);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.pid).toBe(12345);
    expect(state.server_started).toBe(1_700_000_000_000);
    expect(state.events).toEqual([{ id: 1 }]);
  });

  it("clearPid sets pid to null and preserves events", async () => {
    writeFileSync(
      statePath,
      JSON.stringify({ pid: 12345, server_started: 1, events: [{ id: 2 }] }),
    );
    await clearPid(statePath);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.pid).toBeNull();
    expect(state.events).toEqual([{ id: 2 }]);
  });

  it("readState coerces missing fields to defaults", () => {
    writeFileSync(statePath, JSON.stringify({ events: [{ id: 3 }] }));
    expect(readState(statePath)).toEqual({
      pid: null,
      server_started: null,
      events: [{ id: 3 }],
    });
  });

  it("appendEvent persists a progress event", async () => {
    const event = {
      id: 1,
      ts: new Date().toISOString(),
      dir: "agent→page" as const,
      type: "progress" as const,
      payload: {
        id: "node-1",
        label: "Fetching tasks from Aura",
        status: "running",
        startedAt: Date.now(),
        kind: "start",
      },
    };
    await appendEvent(statePath, event);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events).toEqual([event]);
  });

  it("appendEvent persists a progress event with parentId", async () => {
    const event = {
      id: 2,
      ts: new Date().toISOString(),
      dir: "agent→page" as const,
      type: "progress" as const,
      payload: {
        id: "node-2",
        label: "dev-links AURA-1",
        parentId: "node-1",
        status: "done",
        startedAt: 1000,
        endedAt: 2000,
        kind: "dev-links-row",
      },
    };
    await appendEvent(statePath, event);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events[0].type).toBe("progress");
    expect(state.events[0].payload).toEqual({
      id: "node-2",
      label: "dev-links AURA-1",
      parentId: "node-1",
      status: "done",
      startedAt: 1000,
      endedAt: 2000,
      kind: "dev-links-row",
    });
  });

  it("appendEvent persists an agent_log event", async () => {
    const event = {
      id: 3,
      ts: new Date().toISOString(),
      dir: "agent→page" as const,
      type: "agent_log" as const,
      payload: { message: "Augmenting task AURA-42…" },
    };
    await appendEvent(statePath, event);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events).toEqual([event]);
    expect(state.events[0].payload).toEqual({ message: "Augmenting task AURA-42…" });
  });

  it("appendEvent serializes concurrent progress and agent_log writes", async () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      ts: new Date().toISOString(),
      dir: "agent→page" as const,
      type: i % 2 === 0 ? ("progress" as const) : ("agent_log" as const),
      payload: i % 2 === 0
        ? { id: `node-${i}`, label: `node ${i}`, status: "running" as const, startedAt: i, kind: "start" }
        : { message: `log ${i}` },
    }));

    await Promise.all(events.map((e) => appendEvent(statePath, e)));

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events).toHaveLength(5);
    const ids = state.events.map((e: { id: number }) => e.id).sort((a: number, b: number) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it("appendEvent assigns monotonic ids server-side regardless of client-supplied id", async () => {
    // FIX 2: appendEvent must overwrite the client-supplied id with a
    // server-assigned monotonic id so multiple events with id:0 (e.g. from
    // digest-log) don't collide at id:0.
    const events = Array.from({ length: 3 }, () => ({
      id: 0,
      ts: new Date().toISOString(),
      dir: "agent→page" as const,
      type: "agent_log" as const,
      payload: { message: "log line" },
    }));

    for (const e of events) {
      await appendEvent(statePath, e);
    }

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events).toHaveLength(3);
    // All three events should have server-assigned monotonic ids 1, 2, 3 —
    // NOT the client-supplied id:0.
    const ids = state.events.map((e: { id: number }) => e.id);
    expect(ids).toEqual([1, 2, 3]);
  });
});
