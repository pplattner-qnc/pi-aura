// Unit tests for digest-dashboard store.ts — the in-memory backing store.
// Replaces the old file-based state.ts tests. The store owns currentDigest,
// events, SSE clients, subscribers, and a monotonic nextEventId.

import { describe, it, expect, beforeEach } from "vitest";
import {
  resetStore,
  setCurrentDigest,
  getCurrentDigest,
  pushEvent,
  subscribe,
  registerSseClient,
} from "../../.pi/extensions/digest-dashboard/store.ts";
import type { StateEvent } from "../../.pi/extensions/digest-dashboard/state.ts";
import type { ServerResponse } from "node:http";

function createActionEvent(overrides?: Partial<{ id: number; instruction: string }>): StateEvent {
  return {
    id: overrides?.id ?? 0,
    ts: new Date().toISOString(),
    dir: "page→agent",
    type: "action_click",
    payload: {
      section: "overdue",
      key: "AURA-1",
      action: "advance",
      label: "Advance AURA-1",
      instruction: overrides?.instruction ?? "Handle AURA-1",
      aura_use_case: "task-management",
    },
  };
}

function createProgressEvent(overrides?: Partial<{ id: string; label: string }>): StateEvent {
  return {
    id: 0,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: "progress",
    payload: {
      id: overrides?.id ?? "node-1",
      label: overrides?.label ?? "Fetching tasks",
      status: "running",
      startedAt: Date.now(),
      kind: "start",
    },
  };
}

function createAgentLogEvent(message: string): StateEvent {
  return {
    id: 0,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: "agent_log",
    payload: { message },
  };
}

// Minimal fake ServerResponse for SSE client tests.
function createFakeSseResponse(): { res: ServerResponse; written: string[] } {
  const written: string[] = [];
  const res = {
    write: (data: string) => {
      written.push(data);
      return true;
    },
  } as unknown as ServerResponse;
  return { res, written };
}

describe("store.ts — in-memory backing store", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("currentDigest", () => {
    it("getCurrentDigest returns null initially", () => {
      expect(getCurrentDigest()).toBeNull();
    });

    it("setCurrentDigest sets the digest and getCurrentDigest returns it", () => {
      const digest = { date: "2024-08-24", summary: "Test" };
      setCurrentDigest(digest);
      expect(getCurrentDigest()).toEqual(digest);
    });

    it("setCurrentDigest(null) clears the digest", () => {
      setCurrentDigest({ date: "2024-08-24" });
      setCurrentDigest(null);
      expect(getCurrentDigest()).toBeNull();
    });
  });

  describe("pushEvent", () => {
    it("assigns a monotonic id (overwriting client-supplied id)", () => {
      const e1 = createAgentLogEvent("line 1");
      pushEvent(e1);
      expect(e1.id).toBe(1);

      const e2 = createAgentLogEvent("line 2");
      pushEvent(e2);
      expect(e2.id).toBe(2);
    });

    it("assigns sequential ids across multiple pushes regardless of client id", () => {
      // All client-supplied ids are 0 — server must overwrite.
      const events = Array.from({ length: 3 }, () => createAgentLogEvent("log line"));
      for (const e of events) pushEvent(e);
      expect(events.map((e) => e.id)).toEqual([1, 2, 3]);
    });

    it("handles concurrent pushes with unique monotonic ids", () => {
      const events = Array.from({ length: 5 }, (_, i) => createProgressEvent({ id: `node-${i}` }));
      for (const e of events) pushEvent(e);
      const ids = events.map((e) => e.id).sort((a, b) => a - b);
      expect(ids).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("subscribe", () => {
    it("fires the callback when pushEvent is called", () => {
      const received: StateEvent[] = [];
      subscribe((e) => received.push(e));

      const event = createActionEvent();
      pushEvent(event);

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("action_click");
    });

    it("passes the event with the server-assigned id to subscribers", () => {
      const received: StateEvent[] = [];
      subscribe((e) => received.push(e));

      const event = createAgentLogEvent("hello");
      pushEvent(event);

      expect(received[0].id).toBe(1);
    });

    it("unsubscribe stops the callback from firing", () => {
      const received: StateEvent[] = [];
      const unsubscribe = subscribe((e) => received.push(e));

      pushEvent(createAgentLogEvent("before"));
      unsubscribe();
      pushEvent(createAgentLogEvent("after"));

      expect(received).toHaveLength(1);
      expect(received[0].payload).toEqual({ message: "before" });
    });

    it("multiple subscribers each receive events", () => {
      const received1: StateEvent[] = [];
      const received2: StateEvent[] = [];
      subscribe((e) => received1.push(e));
      subscribe((e) => received2.push(e));

      pushEvent(createActionEvent());

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });
  });

  describe("registerSseClient", () => {
    it("writes an SSE state-change event to the client on pushEvent", () => {
      const { res, written } = createFakeSseResponse();
      registerSseClient(res);

      const event = createProgressEvent();
      pushEvent(event);

      expect(written).toHaveLength(1);
      expect(written[0]).toContain("event: state-change");
      expect(written[0]).toContain('"id":1');
      expect(written[0]).toContain('"type":"progress"');
    });

    it("writes a change SSE event to the client on setCurrentDigest", () => {
      const { res, written } = createFakeSseResponse();
      registerSseClient(res);

      setCurrentDigest({ date: "2024-08-24" });

      expect(written).toHaveLength(1);
      expect(written[0]).toContain("event: change");
    });

    it("unregister stops the client from receiving events", () => {
      const { res, written } = createFakeSseResponse();
      const unregister = registerSseClient(res);

      unregister();
      pushEvent(createAgentLogEvent("after unregister"));

      expect(written).toHaveLength(0);
    });
  });

  describe("resetStore", () => {
    it("clears currentDigest, events, subscribers, sseClients, and resets nextEventId", () => {
      setCurrentDigest({ date: "2024-08-24" });
      pushEvent(createAgentLogEvent("line"));

      const { res, written } = createFakeSseResponse();
      registerSseClient(res);

      const received: StateEvent[] = [];
      subscribe((e) => received.push(e));

      resetStore();

      expect(getCurrentDigest()).toBeNull();

      // After reset, pushing an event should NOT reach the old subscriber or SSE client.
      const postEvent = createAgentLogEvent("post-reset");
      pushEvent(postEvent);
      expect(received).toHaveLength(0);
      expect(written).toHaveLength(0);

      // After reset, nextEventId should be 1.
      const e = createAgentLogEvent("check id");
      pushEvent(e);
      expect(e.id).toBe(2);
      expect(postEvent.id).toBe(1);
    });
  });
});
