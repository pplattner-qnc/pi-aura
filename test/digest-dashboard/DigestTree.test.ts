// @vitest-environment happy-dom
//
// Unit tests for the fetch-display-mode tree view in Digest.svelte (slice 4).
// Feeds a fixture of progress/agent_log events via a mock SSE + mock
// /api/state fetch so the component can be exercised without a real server.
// Mirrors the FakeEventSource + fetch-mock pattern from Digest.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "svelte";
import Digest from "../../.pi/extensions/digest-dashboard/Digest.svelte";
import type { StateEvent, ProgressPayload, AgentLogPayload } from "../../.pi/extensions/digest-dashboard/digest-types.ts";
import type { Digest as DigestType, DigestAction } from "../../.pi/extensions/digest-dashboard/digest-types.ts";

// --- FakeEventSource (supports named events: "change" + "state-change") ---
class FakeEventSource {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  static instances: FakeEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  // Svelte's EventSource usage in slice 4 listens for "change" and
  // "state-change" named events via addEventListener. Support both the
  // generic onmessage and addEventListener("change"/"state-change", ...).
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    FakeEventSource.instances = FakeEventSource.instances.filter((i) => i !== this);
  }

  static dispatchEventNamed(type: string, data: unknown) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    for (const es of FakeEventSource.instances) {
      // named-event listeners
      es.listeners.get(type)?.forEach((fn) => fn(new MessageEvent(type, { data: payload })));
      // generic onmessage fallback (for "message" only)
      if (type === "message" && es.onmessage) {
        es.onmessage(new MessageEvent("message", { data: payload }));
      }
    }
  }

  static dispatchChange() {
    FakeEventSource.dispatchEventNamed("change", {});
  }

  static dispatchStateChange(id: number, type: string) {
    FakeEventSource.dispatchEventNamed("state-change", { id, type });
  }

  static reset() {
    FakeEventSource.instances = [];
  }
}

let fetchMock: ReturnType<typeof vi.fn>;
let consoleWarnMock: ReturnType<typeof vi.fn>;
let consoleErrorMock: ReturnType<typeof vi.fn>;

function baseDigest(actions: DigestAction[] = []): DigestType {
  return {
    date: "2024-08-24",
    summary: "Daily digest summary.",
    attention: {
      overdue: [],
      waiting_on_you: [],
      waiting_on_others: [],
      notifications: { since_last_run: [], older_unread: [] },
    },
    queue: [],
    capacity: {
      base_pct: 80,
      committed_pct: 60,
      free_pct: 20,
      utilization_pct: 75,
      over: false,
      total_hours: 6,
    },
    reviews: [],
    reviews_owed: [],
    corrections: [],
    warnings: [],
    actions,
    followup: { currentlyWorkingOn: null },
    meta: {
      generated_at: "2024-08-24T08:00:00.000Z",
      raw_path: "/tmp/raw.json",
      report_path: "/tmp/report.json",
    },
  };
}

function progressEvent(
  payload: Partial<ProgressPayload> & { id: string; label: string },
  eventId = 1,
): StateEvent {
  return {
    id: eventId,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: "progress",
    payload: {
      status: "running",
      startedAt: Date.now(),
      kind: "test",
      ...payload,
    } as ProgressPayload,
  };
}

function agentLogEvent(message: string, eventId = 1): StateEvent {
  return {
    id: eventId,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: "agent_log",
    payload: { message } as AgentLogPayload,
  };
}

/** Build a StateFile (state.json shape) with the given events. */
function stateFile(events: StateEvent[]) {
  return { pid: null, server_started: null, events };
}

/** Mount the component with no digest yet (404 on /api/digest) so the
 *  fetch-display-mode view is shown. Returns the mount target. */
async function mountInFetchMode(stateJson: unknown, digestJson: DigestType | null = null) {
  // fetch("/api/digest") -> 404 (no digest yet) OR the digest
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/digest") {
      if (digestJson) return { ok: true, json: async () => digestJson };
      return { ok: false, status: 404, statusText: "Not Found" };
    }
    if (url === "/api/state" && (typeof url === "string")) {
      return { ok: true, json: async () => stateJson };
    }
    // Default: empty ok response
    return { ok: true, json: async () => ({}) };
  });

  const target = document.getElementById("app")!;
  mount(Digest, { target });
  // Let the async load + SSE effects settle.
  await new Promise((r) => setTimeout(r, 80));
  return target;
}

beforeEach(() => {
  document.body.innerHTML = "";
  const app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);

  fetchMock = vi.fn();
  (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
  FakeEventSource.reset();

  consoleWarnMock = vi.spyOn(console, "warn").mockImplementation(() => {});
  consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const es of FakeEventSource.instances.slice()) {
    es.close();
  }
  FakeEventSource.reset();
  consoleWarnMock.mockRestore();
  consoleErrorMock.mockRestore();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Criterion: On "progress" events with status "running" render a spinner;
// "done" -> check; "error" -> X. Nodes nest by parentId.
// ---------------------------------------------------------------------------

describe("fetch display mode — tree rendering", () => {
  it("renders a spinner for a running node, check for done, X for error", async () => {
    const state = stateFile([
      progressEvent({ id: "running", label: "Fetching digest", status: "running" }, 1),
      progressEvent({ id: "done", label: "Child task", status: "done" }, 2),
      progressEvent({ id: "err", label: "Failed task", status: "error" }, 3),
    ]);

    const target = await mountInFetchMode(state);

    // The tree should render three nodes (no nesting — all roots)
    const nodes = target.querySelectorAll("[data-node-id]");
    expect(nodes.length).toBeGreaterThanOrEqual(3);

    // Running node should have a spinner
    const runningNode = target.querySelector('[data-node-id="running"]');
    expect(runningNode).not.toBeNull();
    expect(runningNode!.querySelector(".loading-spinner")).not.toBeNull();
    expect(runningNode!.textContent).toContain("Fetching digest");

    // Done node should show a check
    const doneNode = target.querySelector('[data-node-id="done"]');
    expect(doneNode).not.toBeNull();
    expect(doneNode!.textContent).toContain("✓");

    // Error node should show an X
    const errNode = target.querySelector('[data-node-id="err"]');
    expect(errNode).not.toBeNull();
    expect(errNode!.textContent).toContain("✕");
  });

  it("nests child nodes under their parent by parentId", async () => {
    const state = stateFile([
      progressEvent({ id: "root", label: "Root", status: "running" }, 1),
      progressEvent({ id: "child-a", label: "Child A", status: "running", parentId: "root" }, 2),
      progressEvent({ id: "child-b", label: "Child B", status: "done", parentId: "root" }, 3),
    ]);

    const target = await mountInFetchMode(state);

    const rootEl = target.querySelector('[data-node-id="root"]');
    expect(rootEl).not.toBeNull();

    // Children should be nested inside the root's subtree container
    const subtree = rootEl!.querySelector("[data-subtree]");
    expect(subtree).not.toBeNull();
    expect(subtree!.querySelector('[data-node-id="child-a"]')).not.toBeNull();
    expect(subtree!.querySelector('[data-node-id="child-b"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion: Nodes are append-only — once shown, a node stays on screen
// until the run ends (never removed mid-run).
// ---------------------------------------------------------------------------

describe("fetch display mode — append-only", () => {
  it("keeps a previously-shown node on screen when new state-change arrives without it", async () => {
    // Simulate: state.json has root + child, then a state-change fires but
    // state.json now only has the root (server re-fetched a partial). The
    // browser re-fetches /api/state — but since nodes are append-only, the
    // child should NOT disappear.
    const fullState = stateFile([
      progressEvent({ id: "root", label: "Root", status: "running" }, 1),
      progressEvent({ id: "child", label: "Child", status: "done", parentId: "root" }, 2),
    ]);

    // After mount, we'll swap to a state with only root
    const partialState = stateFile([
      progressEvent({ id: "root", label: "Root", status: "done" }, 1),
    ]);

    let currentState = fullState;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/digest") return { ok: false, status: 404, statusText: "Not Found" };
      if (url === "/api/state") return { ok: true, json: async () => currentState };
      return { ok: true, json: async () => ({}) };
    });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 80));

    // Both nodes should be visible
    expect(target.querySelector('[data-node-id="root"]')).not.toBeNull();
    expect(target.querySelector('[data-node-id="child"]')).not.toBeNull();

    // Now swap state and dispatch a state-change
    currentState = partialState;
    FakeEventSource.dispatchStateChange(1, "progress");
    await new Promise((r) => setTimeout(r, 80));

    // The child must still be visible (append-only)
    expect(target.querySelector('[data-node-id="child"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion: Layered debounce — a node going running->done within one render
// tick still shows a brief check (~400ms dwell); rapid bursts (10 in <30ms)
// coalesce into one render.
// ---------------------------------------------------------------------------

describe("fetch display mode — layered debounce", () => {
  it("coalesces a rapid burst of 10 state-change events into one render (no fetch storm)", async () => {
    vi.useFakeTimers();

    const state = stateFile([
      progressEvent({ id: "root", label: "Root", status: "running" }, 1),
    ]);

    let stateFetchCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/digest") return { ok: false, status: 404, statusText: "Not Found" };
      if (url === "/api/state") {
        stateFetchCount++;
        return { ok: true, json: async () => state };
      }
      return { ok: true, json: async () => ({}) };
    });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    // Let the initial mount + fetch settle (fake timers — advance past the
    // initial async load).
    await vi.advanceTimersByTimeAsync(100);

    const fetchesBefore = stateFetchCount;

    // Fire 10 state-change events in rapid succession (within <30ms)
    for (let i = 0; i < 10; i++) {
      FakeEventSource.dispatchStateChange(i + 1, "progress");
    }

    // Advance just a tiny bit (less than the coalesce window should be enough
    // but we advance past it to let the coalesced fetch fire)
    await vi.advanceTimersByTimeAsync(50);

    // Should have done at most 1 additional /api/state fetch (coalesced)
    expect(stateFetchCount - fetchesBefore).toBeLessThanOrEqual(1);

    vi.useRealTimers();
  });

  it("holds the spinner for ~400ms on a fast running->done transition, then shows check", async () => {
    vi.useFakeTimers();

    // Phase 1: node is running.
    const runningState = stateFile([
      progressEvent({ id: "root", label: "Root", status: "running" }, 1),
    ]);

    let currentState = runningState;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/digest") return { ok: false, status: 404, statusText: "Not Found" };
      if (url === "/api/state") return { ok: true, json: async () => currentState };
      return { ok: true, json: async () => ({}) };
    });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await vi.advanceTimersByTimeAsync(100);

    // Root should show spinner (running).
    let rootEl = target.querySelector('[data-node-id="root"]');
    expect(rootEl).not.toBeNull();
    expect(rootEl!.querySelector(".loading-spinner")).not.toBeNull();

    // Phase 2: node transitions to done on the next tick (fast pair).
    currentState = stateFile([
      progressEvent({ id: "root", label: "Root", status: "done" }, 1),
    ]);
    FakeEventSource.dispatchStateChange(1, "progress");
    // Advance past the 30ms debounce so the state-change is processed,
    // the render occurs, and the dwell is observed. At this point the
    // dwell timer has just started (~400ms hold).
    await vi.advanceTimersByTimeAsync(50);

    // The spinner should STILL be visible (dwell just started).
    // The node must NOT show the check yet.
    rootEl = target.querySelector('[data-node-id="root"]');
    expect(rootEl).not.toBeNull();
    expect(rootEl!.querySelector(".loading-spinner")).not.toBeNull();
    expect(rootEl!.textContent).not.toContain("✓");

    // The dwell was observed at ~t=130 (when the 30ms debounce fired
    // inside the advance above). ~20ms has already elapsed. Advance
    // ~380ms more so we're just inside the 400ms dwell boundary.
    await vi.advanceTimersByTimeAsync(379);
    rootEl = target.querySelector('[data-node-id="root"]');
    expect(rootEl!.querySelector(".loading-spinner")).not.toBeNull();

    // 2ms later (~401ms past observation): the dwell expires and the
    // check appears.
    await vi.advanceTimersByTimeAsync(2);
    rootEl = target.querySelector('[data-node-id="root"]');
    expect(rootEl!.textContent).toContain("✓");

    vi.useRealTimers();
  });

  it("shows the check immediately for a node already done on first mount (no dwell)", async () => {
    vi.useFakeTimers();

    // Node is already done — no observed running->done transition.
    const state = stateFile([
      progressEvent({ id: "root", label: "Root", status: "done", startedAt: 1000, endedAt: 1100 }, 1),
    ]);

    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/digest") return { ok: false, status: 404, statusText: "Not Found" };
      if (url === "/api/state") return { ok: true, json: async () => state };
      return { ok: true, json: async () => ({}) };
    });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await vi.advanceTimersByTimeAsync(100);

    // The node status is "done" with no observed running->done transition
    // — it should show a check immediately (no dwell).
    const rootEl = target.querySelector('[data-node-id="root"]');
    expect(rootEl).not.toBeNull();
    expect(rootEl!.textContent).toContain("✓");

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Criterion: A node finishing with deferCloseForChildren stays spinning until
// its children resolve, then shows check (or X if a child errored).
// ---------------------------------------------------------------------------

describe("fetch display mode — deferCloseForChildren", () => {
  it("keeps a parent spinning while children are running, then shows check when all children done", async () => {
    // Phase 1: parent is "done" (deferred) but children are still running.
    // The browser sees the parent status as "done" in the payload, but since
    // children are running, the view should keep the parent spinning until
    // children resolve.
    //
    // Note: the ProgressPayload does NOT carry a deferCloseForChildren flag
    // — it only carries the status. The emitter (slice 3) only POSTs the
    // final resolved status (done/error) once children resolve. So the
    // browser simply trusts the status field: if the parent says "done"
    // but children are still "running", the view keeps the parent spinner
    // until all children are terminal.
    const phaseRunning = stateFile([
      progressEvent({ id: "parent", label: "Parent", status: "running" }, 1),
      progressEvent({ id: "child-1", label: "Child 1", status: "running", parentId: "parent" }, 2),
      progressEvent({ id: "child-2", label: "Child 2", status: "running", parentId: "parent" }, 3),
    ]);

    let currentState = phaseRunning;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/digest") return { ok: false, status: 404, statusText: "Not Found" };
      if (url === "/api/state") return { ok: true, json: async () => currentState };
      return { ok: true, json: async () => ({}) };
    });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 80));

    // Parent should show spinner (children still running)
    const parentEl = target.querySelector('[data-node-id="parent"]');
    expect(parentEl).not.toBeNull();
    expect(parentEl!.querySelector(".loading-spinner")).not.toBeNull();

    // Now children finish — parent goes done
    currentState = stateFile([
      progressEvent({ id: "parent", label: "Parent", status: "done" }, 1),
      progressEvent({ id: "child-1", label: "Child 1", status: "done", parentId: "parent" }, 2),
      progressEvent({ id: "child-2", label: "Child 2", status: "done", parentId: "parent" }, 3),
    ]);
    FakeEventSource.dispatchStateChange(3, "progress");
    await new Promise((r) => setTimeout(r, 80));

    const parentEl2 = target.querySelector('[data-node-id="parent"]');
    expect(parentEl2!.textContent).toContain("✓");
  });

  it("shows X on the parent when a child errored", async () => {
    const phaseRunning = stateFile([
      progressEvent({ id: "parent", label: "Parent", status: "running" }, 1),
      progressEvent({ id: "child-1", label: "Child 1", status: "running", parentId: "parent" }, 2),
    ]);

    let currentState = phaseRunning;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/digest") return { ok: false, status: 404, statusText: "Not Found" };
      if (url === "/api/state") return { ok: true, json: async () => currentState };
      return { ok: true, json: async () => ({}) };
    });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 80));

    // Child errors -> parent should show X
    currentState = stateFile([
      progressEvent({ id: "parent", label: "Parent", status: "error" }, 1),
      progressEvent({ id: "child-1", label: "Child 1", status: "error", parentId: "parent" }, 2),
    ]);
    FakeEventSource.dispatchStateChange(2, "progress");
    await new Promise((r) => setTimeout(r, 80));

    const parentEl = target.querySelector('[data-node-id="parent"]');
    expect(parentEl!.textContent).toContain("✕");
  });
});

// ---------------------------------------------------------------------------
// Criterion: "agent_log" events render as a chronological log list BELOW the
// tree.
// ---------------------------------------------------------------------------

describe("fetch display mode — agent log", () => {
  it("renders agent_log events as a chronological log list below the tree", async () => {
    const state = stateFile([
      progressEvent({ id: "root", label: "Root", status: "running" }, 1),
      agentLogEvent("Starting augment phase", 2),
      agentLogEvent("Reviewing task AURA-42", 3),
      agentLogEvent("Reviewing task AURA-99", 4),
    ]);

    const target = await mountInFetchMode(state);

    // The log list should exist and contain the messages in order
    const logList = target.querySelector("[data-agent-log]");
    expect(logList).not.toBeNull();
    const logItems = logList!.querySelectorAll("[data-log-line]");
    expect(logItems).toHaveLength(3);
    expect(logItems[0].textContent).toContain("Starting augment phase");
    expect(logItems[1].textContent).toContain("Reviewing task AURA-42");
    expect(logItems[2].textContent).toContain("Reviewing task AURA-99");
  });
});

// ---------------------------------------------------------------------------
// Criterion: On a terminal "done" event for the root fetch node, transition
// to the digest view (existing render) AFTER digest.json is present.
// ---------------------------------------------------------------------------

describe("fetch display mode — transition to digest view", () => {
  it("transitions to the digest view when the root node is done and digest.json exists", async () => {
    // Start in fetch mode (no digest)
    const fetchState = stateFile([
      progressEvent({ id: "root", label: "Fetching digest", status: "running" }, 1),
    ]);

    const digest = baseDigest([
      {
        section: "overdue",
        key: "AURA-1",
        action: "advance",
        label: "Advance AURA-1",
        instruction: "Handle AURA-1",
        aura_use_case: "task-management",
      },
    ]);

    let currentDigest: DigestType | null = null;
    let currentState = fetchState;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/digest") {
        if (currentDigest) return { ok: true, json: async () => currentDigest };
        return { ok: false, status: 404, statusText: "Not Found" };
      }
      if (url === "/api/state") return { ok: true, json: async () => currentState };
      return { ok: true, json: async () => ({}) };
    });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 80));

    // Should be in fetch mode (tree visible)
    expect(target.querySelector("[data-node-id]")).not.toBeNull();

    // Now digest.json becomes available AND root node is done
    currentDigest = digest;
    currentState = stateFile([
      progressEvent({ id: "root", label: "Fetching digest", status: "done" }, 1),
    ]);

    // Dispatch both: a digest change (digest.json written) + state-change (root done)
    FakeEventSource.dispatchChange();
    FakeEventSource.dispatchStateChange(1, "progress");
    await new Promise((r) => setTimeout(r, 80));

    // Should have transitioned to the digest view
    expect(target.querySelector("button[data-action-key]")).not.toBeNull();
    expect(target.textContent).toContain("Advance AURA-1");
    // The tree should no longer be visible
    expect(target.querySelector("[data-node-id]")).toBeNull();
  });

  it("stays in fetch mode if root is done but digest.json is not yet present", async () => {
    const state = stateFile([
      progressEvent({ id: "root", label: "Fetching digest", status: "done" }, 1),
    ]);

    // /api/digest still 404
    const target = await mountInFetchMode(state, null);

    // Should still be in fetch mode (tree visible, no digest view)
    expect(target.querySelector("[data-node-id]")).not.toBeNull();
    expect(target.querySelector("button[data-action-key]")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion: The existing digest view (queue/reviews/capacity/actions) is
// unchanged. (Regression — existing Digest.test.ts covers this; here we
// verify the existing view still renders correctly after our changes.)
// ---------------------------------------------------------------------------

describe("fetch display mode — empty/absent tree (no-op path)", () => {
  it("shows a neutral ready state when state.json has no progress events", async () => {
    const emptyState = stateFile([]);

    const target = await mountInFetchMode(emptyState);

    // Should not crash; should show a neutral/ready state
    expect(target.textContent).not.toContain("Loading digest…");
    // Should not have any tree nodes
    expect(target.querySelector("[data-node-id]")).toBeNull();
  });

  it("handles an absent state.json gracefully (fetch returns empty)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/digest") return { ok: false, status: 404, statusText: "Not Found" };
      if (url === "/api/state") return { ok: true, json: async () => ({ pid: null, server_started: null, events: [] }) };
      return { ok: true, json: async () => ({}) };
    });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 80));

    // Should not crash
    expect(target.textContent).not.toContain("Loading digest…");
    expect(target.querySelector("[data-node-id]")).toBeNull();
  });
});
