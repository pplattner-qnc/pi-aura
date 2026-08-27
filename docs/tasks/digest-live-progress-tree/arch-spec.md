# Architecture spec — digest-live-progress-tree

Shared across all slice chains. Each slice tests only at its listed seams; the
tdd-worker does not reimplement the listed abstractions.

## Slice 1 — scheduler-progress-nodes

**Exports** (`scripts/src/scheduler.ts`):
- `NodeHandle` — opaque token (branded string or object); tasks can't forge it.
- `Progress` — `{ create(parent?, label): NodeHandle; finish(node, opts?: { deferCloseForChildren?: boolean }): void; setStatus(node, "running"|"done"|"error"): void }`.
- Revised `Ctx<S>` — adds `progress: Progress` and `node: NodeHandle` (the task's own attachment; root for `start`).
- Revised `TaskRef` — adds optional `node?: NodeHandle` (the parent-created node the child attaches to). `progressParentId` is removed (superseded by `node`).
- `ProgressEvent` (already exists) — gains nothing; the `onProgress` hook already fires on transitions.
- **Removed**: `Kind.progress(input)` and the auto-open/close-around-`run` code added this turn.

**Existing abstractions to use**: the existing `runTasks` pump/drain, the serialized completion drain (reducer mutex), `onProgress` hook, `SchedulerOptions`, `RunResult`. The node-subtree tracking is new internal state in `runTasks`, not a separate module.

**Do NOT reimplement**: `keyOf`/dedup, the reducer mutex, the runaway cap, `fail`/`finish`/`enqueue`. These are untouched.

**Seams** (test surface): `runTasks` with a recording `onProgress` callback and trivial kinds. Assert:
- `create` → a "running" `ProgressEvent` fires.
- `finish(node)` (no flag) → a "done" event fires for that node.
- `finish(node, { deferCloseForChildren: true })` with children attached later → the node stays "running" until all child-nodes are terminal, then fires "done" (or "error" if any child errored). Dynamic: a child attached *after* the `finish` counts.
- `finish` with `deferCloseForChildren` and no children → "done" immediately.
- A node never `finish`ed → end-of-run sweep fires "error".
- A task that throws does NOT trigger per-task auto-close (only the end-of-run sweep).
- `TaskRef.node` threads to the child as `ctx.node`.
- Existing scheduler tests (mutex, cap, async-reducer rejection, unknown kind, throwing reducer, graceful degradation) pass unchanged.

**Interface contract for dependents (slice 3)**: `runTasks` accepts `onProgress: (e: ProgressEvent) => void` (already does); `Ctx<S>.progress` and `ctx.node` are the surfaces the bundle's `start` kind uses to build the tree. `ProgressEvent` is the wire shape slice 2 + 4 consume.

## Slice 2 — dashboard-event-plumbing

**Exports** (`.pi/extensions/digest-dashboard/state.ts`, `server.ts`):
- `state.ts`: `StateEvent.type` union gains `"progress"` and `"agent_log"`. New `ProgressPayload` (mirrors `ProgressEvent`: `id, label, parentId?, status, startedAt, endedAt?, kind`) and `AgentLogPayload` (`message: string`). `appendEvent` accepts both unchanged.
- `server.ts`: `/events` SSE gains a second `fs.watch` on `state.json`; on change, sends `event: state-change\ndata: {"id":N,"type":"..."}\n\n`. The existing `digest.json` `event: change` is untouched. `/api/state` POST already accepts any `StateEvent` (no change beyond the type union).

**Existing abstractions to use**: `appendEvent`'s write queue (serialization), `readState`, the existing `/events` SSE structure, `readRequestBody`.

**Do NOT reimplement**: the `digest.json` watcher, the `action_click` listener, `writePid`/`clearPid`.

**Seams**: POST a `progress`/`agent_log` event to `/api/state` → it lands in `state.json` with a monotonic `id` and an SSE `state-change` fires. Concurrent POSTs serialize. Existing `digest.json` `event: change` SSE still fires (regression).

**Interface contract for dependents (slices 3, 4, 5)**: the `ProgressPayload` shape (slice 1's `ProgressEvent` projected) and `AgentLogPayload` are the wire types. Slice 3 POSTs `progress`; slice 5 POSTs `agent_log`; slice 4 reads both from `state.json` via the `state-change` SSE.

## Slice 3 — bundle-emits-tree

**Exports** (`scripts/src/aura-digest.ts` + small helper):
- An `onProgress` hook passed to `runTasks` that POSTs batched `progress` events (~50ms flush + flush-on-run-end) to the running dashboard's `/api/state`.
- A `readDashboardUrl()` helper reading `~/.pi/aura/server-url.json` once; the hook is a no-op for the whole run if absent.
- Inline phase-node emission in `fetchAction` (notifications/tasks/capacity/reviews) before `runTasks`.
- The `start` kind's `run` creates a child node per dev-links row (attached under the "tasks" phase node) and per review candidate (under "reviews"), and `finish`es each with `deferCloseForChildren: true` before `spawn`.

**Existing abstractions to use**: `runTasks`'s `onProgress` (slice 1), the existing `start`/`dev-links-row`/`review-candidate` kinds, `fetchAction`'s base-fetch `await`s, the committed bundle build.

**Do NOT reimplement**: the scheduler, the kinds' `run`/`reduce`, the digest determinism (queue-order readback).

**Seams**: bundle run with a mock dashboard URL → events POSTed in batches; bundle run with no `server-url.json` → no-op, digest byte-identical. Unit-test the batch flush (10 rapid events → ≤1 batch within ~50ms + final flush).

**Interface contract for dependents (slice 6)**: the bundle writes `digest.json` unchanged; the `digest-fetch` tool's `execute` is where the pi-TUI notify lands (slice 6), not here.

## Slice 4 — svelte-tree-view

**Exports** (`.pi/extensions/digest-dashboard/Digest.svelte`):
- A "fetch display mode" view: renders the nested tree from `progress` events (spinner→✓→✕), append-only (nodes never removed mid-run), plus a log list from `agent_log` events below the tree. Transitions to the existing digest view on a terminal root "done" event when `digest.json` exists.
- Layered debounce: ~30ms coalescing on incoming `state-change` events + ~400ms minimum dwell on running→done so a fast pair still shows a brief ✓.

**Existing abstractions to use**: the `/events` SSE `state-change` from slice 2, `readState`/`state.json`, the existing digest view (unchanged, becomes the post-transition state), the existing `EventSource("/events")`.

**Do NOT reimplement**: the digest render path, the action_click flow, the SSE endpoint.

**Seams**: feed a fixture of `progress`/`agent_log` events via a mock SSE → assert nesting, status icons, no flicker (dwell), append-only, and the transition. browser-visual-qa at desktop/tablet/mobile.

**Interface contract**: none (terminal slice).

## Slice 5 — digest-log-tool

**Exports** (`.pi/extensions/digest-dashboard/index.ts`):
- A `digest-log` pi tool: params `{ message: string }`; POSTs `{ dir: "agent→page", type: "agent_log", payload: { message } }` to `/api/state`. Returns `{ ok: true, message: "..." }`; no-op (ok return, no throw) if `server-url.json` absent.

**Existing abstractions to use**: the tool registration pattern (`pi.registerTool`) used by the other `digest-*` tools, `~/.pi/aura/server-url.json`, `appendEvent` via `/api/state`.

**Do NOT reimplement**: the POST handler, the listener.

**Seams**: tool call with dashboard up → `agent_log` event in `state.json`; tool call with dashboard down → ok, no throw. Concurrent calls serialize.

**Interface contract**: the `agent_log` event type from slice 2. Consumed by slice 4's log list.

## Slice 6 — skill-reorder-and-notify

**Exports**:
- `skills/core/aura-digest/aura-digest.md` reordered: Step 1 → `digest-dashboard-start` (ready state), Step 2 → `digest-fetch` (streams tree), augment (agent calls `digest-log`), `digest-save`, clicks, teardown.
- `.pi/extensions/digest-dashboard/index.ts`: `digest-fetch`'s `execute` checks `server-url.json` at start; if absent, sets a flag; at run end, if flagged, calls `ctx.ui.notify("...", "warning")` + prepends a warning line to the result text. Fetch never fails on this.

**Existing abstractions to use**: `ctx.ui.notify` (already used by `digestCommandHandler`), `startDashboard`'s idempotency, the existing `digest-fetch` `execute` shape.

**Do NOT reimplement**: `startDashboard`, the bundle, the dashboard server.

**Seams**: E2E `/aura-digest` with dashboard up → tree live, no warning; with dashboard down → fetch succeeds, TUI warning once. Existing `digest-dashboard` tests pass.

**Interface contract**: terminal slice.

## Cross-slice notes

- The `ProgressEvent` → `ProgressPayload` projection is the one wire boundary between slice 1 (scheduler) and slice 2 (dashboard). Define `ProgressPayload` in `state.ts` to mirror `ProgressEvent` fields; slice 3's hook maps one to the other.
- Slice 1 and 2 are independent (no shared code) and form the first dependency level. Slices 3, 4, 5 depend on 2; 3 also on 1. Slice 6 depends on 3 + 4.
- All slices must keep the 127 existing tests green and the digest output deterministic.
