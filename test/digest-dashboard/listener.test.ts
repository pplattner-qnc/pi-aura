// Unit tests for digest-dashboard listener.ts (in-memory subscription).
// The listener subscribes to the in-memory event stream (store.subscribe)
// and forwards page→agent action_click events to pi.sendMessage.
// No fs.watch, no state.json, no polling.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resetStore,
  pushEvent,
} from "../../.pi/extensions/digest-dashboard/store.ts";
import { startListener, type ListenerHandle } from "../../.pi/extensions/digest-dashboard/listener.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { StateEvent } from "../../.pi/extensions/digest-dashboard/state.ts";

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

function createActionEvent(instruction = "Handle AURA-1"): StateEvent {
  return {
    id: 0,
    ts: new Date().toISOString(),
    dir: "page→agent",
    type: "action_click",
    payload: {
      section: "overdue",
      key: "AURA-1",
      action: "advance",
      label: "Advance AURA-1",
      instruction,
      aura_use_case: "task-management",
    },
  };
}

function createAckEvent(): StateEvent {
  return {
    id: 0,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: "ack",
    payload: { event_id: 1, status: "done" },
  };
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

describe("listener.ts (in-memory subscription)", () => {
  let listener: ListenerHandle | undefined;

  beforeEach(() => {
    resetStore();
  });

  afterEach(async () => {
    await listener?.stop();
    listener = undefined;
    resetStore();
  });

  it("forwards a single page→agent action_click via sendMessage", async () => {
    const { pi, sent } = createFakePi();
    listener = startListener({ pi });

    pushEvent(createActionEvent("Handle AURA-1"));

    await waitFor(() => sent.length === 1);

    expect(sent).toHaveLength(1);
    expect(sent[0].message.customType).toBe("aura-digest-event");
    expect(sent[0].message.content).toBe("Handle AURA-1");
    expect((sent[0].message.details as { key: string }).key).toBe("AURA-1");
    expect(sent[0].options).toEqual({ triggerTurn: true, deliverAs: "steer" });
  });

  it("forwards two action_click events in order", async () => {
    const { pi, sent } = createFakePi();
    listener = startListener({ pi });

    pushEvent(createActionEvent("first"));
    pushEvent(createActionEvent("second"));

    await waitFor(() => sent.length === 2);

    expect(sent).toHaveLength(2);
    expect(sent[0].message.content).toBe("first");
    expect(sent[1].message.content).toBe("second");
  });

  it("ignores agent→page ack events", async () => {
    const { pi, sent } = createFakePi();
    listener = startListener({ pi });

    pushEvent(createActionEvent("first"));
    pushEvent(createAckEvent());
    pushEvent(createActionEvent("second"));

    await waitFor(() => sent.length === 2);

    expect(sent).toHaveLength(2);
    expect(sent[0].message.content).toBe("first");
    expect(sent[1].message.content).toBe("second");
  });

  it("ignores progress events (agent→page)", async () => {
    const { pi, sent } = createFakePi();
    listener = startListener({ pi });

    pushEvent({
      id: 0,
      ts: new Date().toISOString(),
      dir: "agent→page",
      type: "progress",
      payload: {
        id: "node-1",
        label: "Fetching tasks",
        status: "running",
        startedAt: Date.now(),
        kind: "start",
      },
    });

    await delay(100);
    expect(sent).toHaveLength(0);
  });

  it("stops forwarding after stop() unsubscribes", async () => {
    const { pi, sent } = createFakePi();
    listener = startListener({ pi });

    pushEvent(createActionEvent("before stop"));
    await waitFor(() => sent.length === 1);

    await listener.stop();
    listener = undefined;

    pushEvent(createActionEvent("after stop"));
    await delay(100);

    expect(sent).toHaveLength(1);
    expect(sent[0].message.content).toBe("before stop");
  });

  it("skips malformed action_click events (missing payload fields)", async () => {
    const { pi, sent } = createFakePi();
    listener = startListener({ pi });

    // First event: a well-formed action_click
    pushEvent(createActionEvent("good"));
    // Second event: malformed action_click (missing instruction in payload)
    pushEvent({
      id: 0,
      ts: new Date().toISOString(),
      dir: "page→agent",
      type: "action_click",
      payload: { section: "overdue" },
    });
    // Third event: another well-formed action_click
    pushEvent(createActionEvent("also good"));

    await waitFor(() => sent.length === 2);

    expect(sent).toHaveLength(2);
    expect(sent[0].message.content).toBe("good");
    expect(sent[1].message.content).toBe("also good");
  });

  it("does not replay events that were pushed before startListener subscribed", async () => {
    // Push an event BEFORE the listener starts — the listener should not
    // see it (the store's pushEvent only notifies current subscribers).
    const { pi, sent } = createFakePi();
    pushEvent(createActionEvent("pre-existing"));

    listener = startListener({ pi });

    await delay(100);
    expect(sent).toHaveLength(0);

    pushEvent(createActionEvent("new"));
    await waitFor(() => sent.length === 1);

    expect(sent).toHaveLength(1);
    expect(sent[0].message.content).toBe("new");
  });
});
