// Unit tests for progressTree.ts pure helpers.
// These test the tree-building, merge, effective-status, and debounce
// logic without mounting the Svelte component.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractProgressEvents,
  extractAgentLogEvents,
  mergeProgressNodes,
  buildProgressTree,
  effectiveStatus,
  createDebounce,
  isRootDone,
  type ProgressNode,
} from "../../.pi/extensions/digest-dashboard/progressTree.ts";
import type { StateEvent, ProgressPayload } from "../../.pi/extensions/digest-dashboard/digest-types.ts";

function prog(p: Partial<ProgressPayload> & { id: string; label: string }): ProgressPayload {
  return {
    status: "running",
    startedAt: Date.now(),
    kind: "test",
    ...p,
  };
}

function stateEvent(type: string, payload: unknown, id = 1): StateEvent {
  return {
    id,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: type as StateEvent["type"],
    payload,
  };
}

describe("progressTree — extractProgressEvents", () => {
  it("extracts only agent→page progress events", () => {
    const events: StateEvent[] = [
      stateEvent("progress", prog({ id: "a", label: "A" }), 1),
      stateEvent("agent_log", { message: "hi" }, 2),
      { ...stateEvent("action_click", { section: "x" }, 3), dir: "page→agent" },
    ];
    const result = extractProgressEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });
});

describe("progressTree — extractAgentLogEvents", () => {
  it("extracts only agent→page agent_log events", () => {
    const events: StateEvent[] = [
      stateEvent("agent_log", { message: "line 1" }, 1),
      stateEvent("agent_log", { message: "line 2" }, 2),
      stateEvent("progress", prog({ id: "a", label: "A" }), 3),
    ];
    const result = extractAgentLogEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].message).toBe("line 1");
    expect(result[1].message).toBe("line 2");
  });
});

describe("progressTree — mergeProgressNodes (append-only)", () => {
  it("adds new nodes and updates existing ones by id", () => {
    const map = new Map<string, ProgressNode>();
    mergeProgressNodes(map, [prog({ id: "a", label: "A", status: "running" })]);
    expect(map.get("a")?.status).toBe("running");

    // Update same id
    mergeProgressNodes(map, [prog({ id: "a", label: "A", status: "done" })]);
    expect(map.get("a")?.status).toBe("done");
  });

  it("is append-only: once added, a node is never removed even if absent from later payloads", () => {
    const map = new Map<string, ProgressNode>();
    mergeProgressNodes(map, [
      prog({ id: "a", label: "A", status: "running" }),
      prog({ id: "b", label: "B", status: "running" }),
    ]);
    expect(map.size).toBe(2);

    // Later payload only has "a" — "b" should stay
    mergeProgressNodes(map, [prog({ id: "a", label: "A", status: "done" })]);
    expect(map.size).toBe(2);
    expect(map.has("b")).toBe(true);
  });
});

describe("progressTree — buildProgressTree", () => {
  it("nests children under parents by parentId", () => {
    const map = new Map<string, ProgressNode>();
    mergeProgressNodes(map, [
      prog({ id: "root", label: "Root" }),
      prog({ id: "child-a", label: "Child A", parentId: "root" }),
      prog({ id: "child-b", label: "Child B", parentId: "root" }),
    ]);
    const tree = buildProgressTree(map);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].id).toBe("child-a");
    expect(tree[0].children[1].id).toBe("child-b");
  });

  it("treats nodes with a parentId not in the map as roots", () => {
    const map = new Map<string, ProgressNode>();
    mergeProgressNodes(map, [
      prog({ id: "orphan", label: "Orphan", parentId: "missing" }),
    ]);
    const tree = buildProgressTree(map);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("orphan");
  });
});

describe("progressTree — effectiveStatus (deferCloseForChildren)", () => {
  it("returns the node's own status when it has no children", () => {
    const node: ProgressNode = {
      id: "a", label: "A", status: "done", startedAt: 0, kind: "t", children: [],
    };
    expect(effectiveStatus(node)).toBe("done");
  });

  it("returns running when the parent says done but children are still running", () => {
    const node: ProgressNode = {
      id: "parent", label: "P", status: "done", startedAt: 0, kind: "t",
      children: [
        { id: "c1", label: "C1", status: "running", startedAt: 0, kind: "t", children: [] },
      ],
    };
    expect(effectiveStatus(node)).toBe("running");
  });

  it("returns error when any child is error", () => {
    const node: ProgressNode = {
      id: "parent", label: "P", status: "done", startedAt: 0, kind: "t",
      children: [
        { id: "c1", label: "C1", status: "done", startedAt: 0, kind: "t", children: [] },
        { id: "c2", label: "C2", status: "error", startedAt: 0, kind: "t", children: [] },
      ],
    };
    expect(effectiveStatus(node)).toBe("error");
  });

  it("returns done when all children are done and parent is done", () => {
    const node: ProgressNode = {
      id: "parent", label: "P", status: "done", startedAt: 0, kind: "t",
      children: [
        { id: "c1", label: "C1", status: "done", startedAt: 0, kind: "t", children: [] },
      ],
    };
    expect(effectiveStatus(node)).toBe("done");
  });

  it("recurses into grandchildren", () => {
    const node: ProgressNode = {
      id: "parent", label: "P", status: "done", startedAt: 0, kind: "t",
      children: [
        {
          id: "c1", label: "C1", status: "done", startedAt: 0, kind: "t",
          children: [
            { id: "gc1", label: "GC1", status: "running", startedAt: 0, kind: "t", children: [] },
          ],
        },
      ],
    };
    expect(effectiveStatus(node)).toBe("running");
  });
});

describe("progressTree — createDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid calls into a single callback after delay", () => {
    const cb = vi.fn();
    const d = createDebounce(cb, 30);
    d.trigger();
    d.trigger();
    d.trigger();
    vi.advanceTimersByTime(29);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("cancel prevents the callback", () => {
    const cb = vi.fn();
    const d = createDebounce(cb, 30);
    d.trigger();
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(cb).not.toHaveBeenCalled();
  });

  it("flush fires the callback immediately and clears the timer", () => {
    const cb = vi.fn();
    const d = createDebounce(cb, 30);
    d.trigger();
    d.flush();
    expect(cb).toHaveBeenCalledTimes(1);
    // Subsequent advance should not fire again
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("progressTree — isRootDone", () => {
  it("returns false for an empty tree", () => {
    expect(isRootDone([])).toBe(false);
  });

  it("returns false when the root is still running", () => {
    const map = new Map<string, ProgressNode>();
    mergeProgressNodes(map, [prog({ id: "root", label: "R", status: "running" })]);
    expect(isRootDone(buildProgressTree(map))).toBe(false);
  });

  it("returns true when the root is done with no children", () => {
    const map = new Map<string, ProgressNode>();
    mergeProgressNodes(map, [prog({ id: "root", label: "R", status: "done" })]);
    expect(isRootDone(buildProgressTree(map))).toBe(true);
  });

  it("returns false when the root is done but children are running", () => {
    const map = new Map<string, ProgressNode>();
    mergeProgressNodes(map, [
      prog({ id: "root", label: "R", status: "done" }),
      prog({ id: "c1", label: "C", status: "running", parentId: "root" }),
    ]);
    expect(isRootDone(buildProgressTree(map))).toBe(false);
  });

  it("returns true when the root and all children are done", () => {
    const map = new Map<string, ProgressNode>();
    mergeProgressNodes(map, [
      prog({ id: "root", label: "R", status: "done" }),
      prog({ id: "c1", label: "C", status: "done", parentId: "root" }),
    ]);
    expect(isRootDone(buildProgressTree(map))).toBe(true);
  });

  it("returns false when all roots are error (no done root)", () => {
    const map = new Map<string, ProgressNode>();
    mergeProgressNodes(map, [prog({ id: "root", label: "R", status: "error" })]);
    expect(isRootDone(buildProgressTree(map))).toBe(false);
  });
});
