---
kind: map
slug: digest-live-progress-tree
title: Show a live progress tree in the digest dashboard while the fetch runs
status: done
tasks: [digest-live-progress-tree]
---

## Destination

When the user starts an `/aura-digest` run, the digest dashboard (already
running in the browser from the slash command) shows a **live, nested tree of
operations** as the fetch happens — "Fetching notifications from Aura", "Fetching
tasks from Aura", and under it the per-task dev-links work, with status icons
(running / done / error) updating in real time. Between fetch-done and the
final augmented digest, the agent's augment sub-steps render as a **log below
the tree**. When the fetch is complete the tree transitions to the digest view.

The scheduler is the source of the tree events; the dashboard renders them.
Done looks like:

- The `/aura-digest` slash command starts the dashboard server first; the
  browser opens to a "ready" state.
- `digest-fetch` runs the bundle, which streams progress events to the
  already-running dashboard via `POST /api/state`. The browser shows the tree
  live, with client-side debouncing so fast open/close bursts don't flicker.
- During the agent's augment phase (Step 2), the agent calls a `digest-log`
  tool to push status lines that render as a log under the tree.
- When the fetch finishes, the scheduler emits a terminal "done" event; the
  tree view transitions to the digest view once `digest.json` is written.
- If the dashboard was never started, the fetch still succeeds; a pi-TUI
  warning is shown at the end (not a failure).

## Constraints

- The scheduler's correctness guarantees (reducer mutex, runaway cap, loud
  failure on programming errors, graceful degradation on run() failure) are
  already landed and committed; this feature must not regress them.
- The dashboard's existing event/state architecture (`POST /api/state` +
  `appendEvent` write queue, `/events` SSE, `state.json`, `digest.json`)
  is the substrate; reuse it, don't fork it.
- The committed bundle (`skills/core/aura-digest/dist/aura-digest.mjs`) is the
  single artifact the `digest-fetch` tool spawns; progress emission lives in
  the bundle, the scheduler, and the dashboard — not the pi extension tool
  surface (which stays a one-shot `AgentToolResult`).

## Decisions so far

### Scheduler (settled, committed)

- **Task model**: `(kind, hashable input)` identity; first-seen-wins dedup on
  `${kind}\u0000${keyOf(input)}`. `run` / `spawn` / `reduce` live on the kind
  in a `KindMap`. Single root. (`scripts/src/scheduler.ts`)
- **Reducer mutex**: serialized completion drain — at most one `reduce` runs
  at a time. `reduce` MUST be synchronous; a thenable return rejects the run.
  `spawn` runs after `reduce`, inside the drain, so it sees post-fold state.
- **Runaway cap**: conservative `initialMaxTasks` (default 30); the first
  reducer to return `{ setMaxTasks }` replaces it with the real ceiling
  learned from base data. Later setters ignored + recorded in `runWarnings`.
  Overflow dropped, `capped` sticky.
- **Failure posture**: `run()` failure degrades gracefully (no fold, run
  continues). Unknown kind / unhashable input / throwing reducer or spawn
  reject loudly.

### Live progress tree (settled in grilling, this feature)

- **Channel**: browser, via the existing dashboard SSE/`state.json`
  infrastructure — not the pi tool-call stream.
- **Tree fidelity**: full live tree (nested nodes with status icons), with
  **layered client-side debounce**: ~30ms coalescing on incoming events +
  ~400ms minimum dwell on running→done so a fast open→close still renders a
  brief ✓ rather than vanishing.
- **Event transport**: reuse `POST /api/state` (append a new `agent→page`
  event type `"progress"` to `state.json`); extend `/events` SSE to *also*
  watch `state.json` so the browser learns a progress event arrived. No
  parallel stream.
- **Event batching**: batch in the bundle on a ~50ms flush timer (+ flush on
  run end) before POSTing. Cuts POST volume and coalesces near-instant
  open→close pairs.
- **Node model — imperative, task-driven (the scheduler is a passthrough)**:
  - `run` receives a **progress object** in `ctx` and drives nodes
    imperatively. The scheduler does NOT auto-open/close nodes around `run`.
  - Interface (mockup; final names TBD in task body):
    ```ts
    progress.create(parent?, label): NodeHandle   // open a node
    progress.finish(node, { deferCloseForChildren?: true })  // close own status
    progress.setStatus(node, "running" | "done" | "error")
    ```
  - `ctx.node` is the task's own attachment (root for `start`). A task's
    `spawn` creates each child's node via `progress.create(ctx.node, ...)` and
    attaches it to the child `TaskRef` — so the **parent** decides each
    child's attachment (supersedes an earlier `Kind.progress(input)` design,
    which is removed).
  - **Nodes are NOT lifecycle-bound to a task and NEVER removed mid-run.** A
    node, once created, stays on screen until the end of the run; the tree is
    append-only. A node outlives the task that opened it: a parent returns,
    its node persists for its children.
  - **`finish(node)` (no flag)**: marks the node **done** right now (spinner →
    ✓). Does NOT remove the node. Only changes its status.
  - **`finish(node, { deferCloseForChildren: true })`**: does nothing to the
    node's status now; sets a flag — "once all my child-nodes are terminal, I
    become done (done iff all children succeeded, error if any child
    errored)." The parent keeps spinning until that join resolves. A
    deferred node with no children becomes done immediately.
  - **Only the progress function marks nodes finished** — not the scheduler.
  - **Scheduler's only auto-close**: at **end of the whole run**, any node
    still "running" (never `finish`ed, or deferred-and-unresolved) →
    "error" (safety net so a forgotten `finish` can't leave the tree stuck).
    No per-task auto-close, no close-on-throw, and no node is ever removed.
- **Phase-node ownership**: the top-level phases ("Fetching notifications",
  "Fetching tasks", …) happen before the scheduler runs (in `fetchAction`),
  so they are **emitted inline in `fetchAction`** (outside the scheduler) and
  the scheduler's `start` nests its fan-out under the "Fetching tasks" /
  "Fetching reviews" phase nodes via the attachment mechanism. Base fetch is
  NOT moved into the scheduler.
- **Augment-phase log**: a new **`digest-log`** tool (one `message: string`
  param) POSTs to `/api/state` as a new `agent_log` event type; the browser
  renders `agent_log` events as a log list below the tree. Keeps
  `digest-fetch`/`digest-save` single-purpose.
- **Tree → digest transition**: the scheduler emits a terminal "done" event
  at run end; the UI stays in tree mode showing the tree + the agent log
  (from `digest-log`) during the augment phase, then transitions to the digest
  view once the augmented `digest.json` is written.
- **Dashboard-liveness precondition**: if `~/.pi/aura/server-url.json` is
  absent at fetch start, the `onProgress` hook becomes a **no-op for the whole
  run** (digest still writes `digest.json`). At fetch **end**, surface a
  warning both in the tool-result text and via `ctx.ui.notify(..., "warning")`
  in the pi TUI — one-shot, not per-event. The fetch never fails on this.

## Fog

- Exact names of the progress object's methods and the `NodeHandle` shape —
  to be settled in the first feature task's body.
- Whether `digest-log` events should carry a timestamp/order field beyond the
  `StateEvent.id`/`ts` already present (probably not; the append order +
  `id` suffice).
- Whether the ~50ms bundle batch and the ~30ms client coalesce should share
  a single configured value or stay independent (likely independent — they
  solve different problems).

## Out of scope

- Moving the base fetch (briefing/queue/capacity/reviews/notifications) into
  the scheduler. It stays sequential in `fetchAction`; only the fan-out is
  scheduled.
- A "re-run / refresh" button in the tree view (the dashboard already
  re-fetches `digest.json` on change).
- Per-task cancellation / `AbortSignal` threading through the scheduler
  (separate concern, not needed for the live tree).
