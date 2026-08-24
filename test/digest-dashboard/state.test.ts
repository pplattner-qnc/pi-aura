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
});
