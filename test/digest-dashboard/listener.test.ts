// Unit tests for digest-dashboard listener.ts.
// Uses a fake pi (captures sendMessage calls) and a temp state.json.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { startListener, type ListenerHandle, type ListenerOptions } from "../../.pi/extensions/digest-dashboard/listener.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface SentMessage {
  message: { customType: string; content: string; details: unknown; display?: boolean };
  options: { triggerTurn?: boolean; deliverAs?: string } | undefined;
}

function createFakePi(): { pi: ExtensionAPI; sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  const pi = {
    sendMessage: vi.fn((message, options) => {
      sent.push({ message, options });
    }),
  } as unknown as ExtensionAPI;
  return { pi, sent };
}

function createActionEvent(id: number, overrides?: Partial<{ section: string; key: string; label: string; instruction: string }>): Record<string, unknown> {
  return {
    id,
    ts: new Date().toISOString(),
    dir: "page→agent",
    type: "action_click",
    payload: {
      section: "overdue",
      key: "AURA-1",
      action: "advance",
      label: overrides?.label ?? "Advance AURA-1",
      instruction: overrides?.instruction ?? "Handle AURA-1",
      aura_use_case: "task-management",
    },
  };
}

function writeState(statePath: string, state: { pid?: number | null; server_started?: number | null; events: Record<string, unknown>[] }): void {
  writeFileSync(statePath, JSON.stringify({ pid: null, server_started: null, ...state }, null, 2));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timeout");
    }
    await delay(intervalMs);
  }
}

describe("listener.ts", () => {
  let tmpDir: string;
  let statePath: string;
  let listener: ListenerHandle | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-listener-"));
    statePath = path.join(tmpDir, "state.json");
  });

  afterEach(async () => {
    await listener?.stop();
    listener = undefined;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("forwards a single page→agent action_click via sendMessage", async () => {
    const { pi, sent } = createFakePi();
    listener = await startListener({ pi, statePath, pollIntervalMs: 10 } as ListenerOptions);

    writeState(statePath, { events: [createActionEvent(1)] });

    await waitFor(() => sent.length === 1);

    expect(sent).toHaveLength(1);
    expect(sent[0].message.customType).toBe("aura-digest-event");
    expect(sent[0].message.content).toBe("Handle AURA-1");
    expect((sent[0].message.details as { key: string }).key).toBe("AURA-1");
    expect(sent[0].options).toEqual({ triggerTurn: true, deliverAs: "steer" });
  });

  it("forwards two action_click events in order", async () => {
    const { pi, sent } = createFakePi();
    listener = await startListener({ pi, statePath, pollIntervalMs: 10 } as ListenerOptions);

    writeState(statePath, { events: [createActionEvent(1, { instruction: "first" }), createActionEvent(2, { instruction: "second" })] });

    await waitFor(() => sent.length === 2);

    expect(sent).toHaveLength(2);
    expect(sent[0].message.content).toBe("first");
    expect(sent[1].message.content).toBe("second");
  });

  it("ignores agent→page ack events but advances the cursor", async () => {
    const { pi, sent } = createFakePi();
    listener = await startListener({ pi, statePath, pollIntervalMs: 10 } as ListenerOptions);

    writeState(statePath, {
      events: [
        createActionEvent(1, { instruction: "first" }),
        {
          id: 2,
          ts: new Date().toISOString(),
          dir: "agent→page",
          type: "ack",
          payload: { event_id: 1, status: "done" },
        },
        createActionEvent(3, { instruction: "second" }),
      ],
    });

    await waitFor(() => sent.length === 2);

    expect(sent).toHaveLength(2);
    expect(sent[0].message.content).toBe("first");
    expect(sent[1].message.content).toBe("second");
  });

  it("exits and resolves stop() when state.json is deleted", async () => {
    const { pi } = createFakePi();
    writeState(statePath, { events: [] });
    listener = await startListener({ pi, statePath, pollIntervalMs: 10 } as ListenerOptions);

    rmSync(statePath, { force: true });

    await waitFor(() => !existsSync(statePath));
    await listener.stop();

    expect(existsSync(statePath)).toBe(false);
  });

  it("does not replay events after an atomic replace of state.json", async () => {
    const { pi, sent } = createFakePi();
    listener = await startListener({ pi, statePath, pollIntervalMs: 10 } as ListenerOptions);

    writeState(statePath, { events: [createActionEvent(1, { instruction: "first" })] });
    await waitFor(() => sent.length === 1);

    // Atomic replace: write a temp file and rename it over statePath.
    const replacementPath = `${statePath}.replacement`;
    writeFileSync(replacementPath, JSON.stringify({ pid: null, server_started: null, events: [createActionEvent(1, { instruction: "first" }), createActionEvent(2, { instruction: "second" })] }, null, 2));
    rmSync(statePath, { force: true });
    await delay(20);
    // Use node's renameSync if available; otherwise writeFileSync after rm is sufficient for the test seam.
    const { renameSync } = await import("node:fs");
    renameSync(replacementPath, statePath);

    await waitFor(() => sent.length === 2);

    expect(sent).toHaveLength(2);
    expect(sent[0].message.content).toBe("first");
    expect(sent[1].message.content).toBe("second");
  });

  it("starts with the cursor at the max existing event id (no replay)", async () => {
    const { pi, sent } = createFakePi();
    writeState(statePath, {
      events: [
        createActionEvent(1, { instruction: "old" }),
        createActionEvent(2, { instruction: "older" }),
      ],
    });

    listener = await startListener({ pi, statePath, pollIntervalMs: 10 } as ListenerOptions);

    // Give fs.watch/polling a chance to fire; the old events should NOT be forwarded.
    await delay(100);
    expect(sent).toHaveLength(0);

    writeState(statePath, {
      events: [
        createActionEvent(1, { instruction: "old" }),
        createActionEvent(2, { instruction: "older" }),
        createActionEvent(3, { instruction: "new" }),
      ],
    });

    await waitFor(() => sent.length === 1);
    expect(sent).toHaveLength(1);
    expect(sent[0].message.content).toBe("new");
  });

  it("skips malformed events without throwing and advances the cursor", async () => {
    const { pi, sent } = createFakePi();
    listener = await startListener({ pi, statePath, pollIntervalMs: 10 } as ListenerOptions);

    writeState(statePath, {
      events: [
        createActionEvent(1, { instruction: "good" }),
        { id: 2, ts: new Date().toISOString(), dir: "page→agent", type: "action_click" },
        createActionEvent(3, { instruction: "also good" }),
      ],
    });

    await waitFor(() => sent.length === 2);

    expect(sent).toHaveLength(2);
    expect(sent[0].message.content).toBe("good");
    expect(sent[1].message.content).toBe("also good");
  });
});
