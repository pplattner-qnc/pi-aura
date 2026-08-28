// progressTree.ts — pure helpers for the fetch-display-mode tree view.
//
// Extracted from Digest.svelte so the tree-building + debounce logic is
// unit-testable without mounting the Svelte component. The component
// imports these helpers; the view state lives in the component's runes.
//
// Design:
//   - buildProgressTree takes the raw progress events from state.json and
//    returns a nested tree (root nodes with children). Nodes are append-only
//    by id — once a node id appears, it is never dropped from the tree even
//    if a later state.json fetch omits it (the caller accumulates).
//   - effectiveStatus: a parent whose payload status is "done" but that still
//    has running children should display as "running" (deferCloseForChildren
//    semantics — the emitter only POSTs the final resolved status, but if
//    the browser sees children still running, it keeps the parent spinning).
//   - debounce: a simple coalescing helper for rapid SSE state-change bursts.

import type { ProgressPayload, AgentLogPayload, StateEvent } from "./digest-types.ts";

export type NodeStatus = "running" | "done" | "error";

export interface ProgressNode {
  id: string;
  label: string;
  parentId?: string;
  status: NodeStatus;
  startedAt: number;
  endedAt?: number;
  kind: string;
  children: ProgressNode[];
}

/** Extract progress events (agent→page) from a StateFile's events array. */
export function extractProgressEvents(events: StateEvent[]): ProgressPayload[] {
  return events
    .filter((e) => e.dir === "agent→page" && e.type === "progress")
    .map((e) => e.payload as ProgressPayload);
}

/** Extract agent_log events (agent→page) from a StateFile's events array. */
export function extractAgentLogEvents(events: StateEvent[]): AgentLogPayload[] {
  return events
    .filter((e) => e.dir === "agent→page" && e.type === "agent_log")
    .map((e) => e.payload as AgentLogPayload);
}

/** Merge new progress payloads into an existing map of nodes (by id).
 *  Append-only: once a node id is in the map, it stays. The status is
 *  updated to the latest payload's status. Children are resolved at
 *  tree-build time, not here. */
export function mergeProgressNodes(
  existing: Map<string, ProgressNode>,
  payloads: ProgressPayload[],
): Map<string, ProgressNode> {
  for (const p of payloads) {
    const node: ProgressNode = {
      id: p.id,
      label: p.label,
      parentId: p.parentId,
      status: p.status,
      startedAt: p.startedAt,
      endedAt: p.endedAt,
      kind: p.kind,
      children: [],
    };
    existing.set(p.id, node);
  }
  return existing;
}

/** Build a nested tree from a flat map of nodes. Root nodes (no parentId or
 *  parentId not in the map) are returned at the top level. Children are
 *  sorted by their first-seen order (insertion order in the map). */
export function buildProgressTree(
  nodes: Map<string, ProgressNode>,
): ProgressNode[] {
  const byId = new Map<string, ProgressNode>();
  // Clone nodes so we don't mutate the input map's children arrays.
  for (const node of nodes.values()) {
    byId.set(node.id, { ...node, children: [] });
  }

  const roots: ProgressNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Compute the effective status of a node for display. A parent whose
 *  payload says "done" but that still has running children should display
 *  as "running" (deferCloseForChildren — the emitter only POSTs the final
 *  status once children resolve, but if the browser sees children still
 *  running, it keeps the parent spinning). If any child is "error", the
 *  parent shows "error". */
export function effectiveStatus(node: ProgressNode): NodeStatus {
  if (node.children.length === 0) return node.status;
  // Recursively compute children statuses
  const childStatuses = node.children.map(effectiveStatus);
  if (childStatuses.some((s) => s === "error")) return "error";
  if (childStatuses.some((s) => s === "running")) return "running";
  // All children done — parent's own status wins
  return node.status;
}

/** Create a debounce function that coalesces rapid calls into a single
 *  callback after `delayMs`. Returns a function to cancel/trigger. */
export function createDebounce(
  callback: () => void,
  delayMs: number,
): { trigger: () => void; cancel: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    trigger: () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        callback();
      }, delayMs);
    },
    cancel: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    flush: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        callback();
      }
    },
  };
}

/** Check if the root node (a node with no parentId) has a terminal "done"
 *  status (all children done, own status done). Returns true if the tree
 *  is complete and should transition to the digest view. */
export function isRootDone(roots: ProgressNode[]): boolean {
  if (roots.length === 0) return false;
  // The root fetch node is the first root (or the only root). Check if it
  // and all its children are terminal (done/error, not running).
  for (const root of roots) {
    if (effectiveStatus(root) === "running") return false;
  }
  // At least one root must be "done" (not just error) to transition
  return roots.some((r) => effectiveStatus(r) === "done");
}

/** Minimum dwell on a running->done (or running->error) transition so a
 *  fast open->close pair still renders a brief check/X rather than
 *  vanishing. The dwell only applies to an OBSERVED transition — a node
 *  that was already terminal when first seen renders immediately. */
export const DWELL_MS = 400;

export interface DwellManager {
  /** Record the latest status observed for a node. When a running->done
   *  or running->error transition is observed, the node enters a dwell: it
   *  should continue to display as "running" for ~dwellMs. */
  observe(id: string, status: NodeStatus): void;
  /** True if the node is currently in a dwell hold (should display as
   *  "running" despite having a terminal real status). */
  isDwelling(id: string): boolean;
  /** The status to display for a node given its real (post-merge) status.
   *  If the node is dwelling, returns "running"; otherwise returns the
   *  real status. */
  displayStatus(id: string, realStatus: NodeStatus): NodeStatus;
  /** Cancel all active dwell timers (e.g. on component teardown). */
  cancel(): void;
}

/** Create a DwellManager that holds a running->terminal transition for
 *  `dwellMs` before allowing the terminal status to render. Pure timer
 *  logic — no DOM or component dependency — so it is unit-testable.
 *  The optional `onExpire` callback is invoked when a dwell timer fires
 *  (before the node is removed from the dwell hold), so a caller that
 *  renders from reactive state can bump a counter and trigger a re-render.
 *  The optional `scheduler` function defaults to `setTimeout`; a caller
 *  that renders in a framework with its own timing (e.g. requestAnimationFrame)
 *  can pass a custom scheduler to defer the dwell expiry timer start so it
 *  aligns with the framework's render cycle. */
export function createDwellManager(
  dwellMs: number = DWELL_MS,
  onExpire?: (id: string) => void,
  scheduler: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> =
    (fn, ms) => setTimeout(fn, ms),
): DwellManager {
  // The last status we observed for each node (before the current one).
  const lastStatus = new Map<string, NodeStatus>();
  // Nodes currently in a dwell hold, with the terminal status they'll show
  // after the dwell expires.
  const dwelling = new Map<string, NodeStatus>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    observe(id: string, status: NodeStatus): void {
      const prev = lastStatus.get(id);
      // Only a running -> terminal transition triggers a dwell.
      if (prev === "running" && (status === "done" || status === "error")) {
        // Clear any existing timer for this node.
        const existing = timers.get(id);
        if (existing !== undefined) clearTimeout(existing);
        // Set the dwelling flag immediately so the current render shows
        // the spinner. The expiry timer is started via the scheduler,
        // which may defer it (e.g. to the next animation frame) so the
        // dwell duration is measured from the first visible render.
        dwelling.set(id, status);
        const timer = scheduler(() => {
          dwelling.delete(id);
          timers.delete(id);
          onExpire?.(id);
        }, dwellMs);
        timers.set(id, timer);
      }
      lastStatus.set(id, status);
    },

    isDwelling(id: string): boolean {
      return dwelling.has(id);
    },

    displayStatus(id: string, realStatus: NodeStatus): NodeStatus {
      if (dwelling.has(id)) return "running";
      return realStatus;
    },

    cancel(): void {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      dwelling.clear();
    },
  };
}
