---
kind: task
type: feature
slug: digest-live-progress-tree
title: Show a live progress tree in the digest dashboard while the fetch runs
map: digest-live-progress-tree
status: ready
slices: [1-scheduler-progress-nodes, 2-dashboard-event-plumbing, 3-bundle-emits-tree, 4-svelte-tree-view, 5-digest-log-tool, 6-skill-reorder-and-notify]
---

## User-visible outcome

When the user runs `/aura-digest`, the already-running digest dashboard shows a
live, nested tree of operations as the fetch happens ("Fetching notifications
from Aura" → "Fetching tasks from Aura" → per-task dev-links work, with
running/done/error icons). During the agent's augment phase, status lines render
as a log below the tree. When the fetch completes the tree transitions to the
digest view.

## User story

As a user waiting on the ~17s digest fetch, I want to see what it's doing in real
time — not a blank screen — so I trust it's working and can spot a stuck step.

## Scope boundaries

- In: the scheduler node model, dashboard event plumbing, bundle emission,
  the Svelte tree+log view, the `digest-log` tool, the skill reorder, and the
  pi-TUI warning when the dashboard is absent.
- Out: moving the base fetch into the scheduler; per-task cancellation; a
  refresh button. (See map "Out of scope".)

## Acceptance criteria

- `/aura-digest` starts the dashboard first (ready state), then the fetch
  streams a nested tree that updates live in the browser.
- Fast open→close node pairs still render a brief ✓ (no flicker) — layered
  debounce verified.
- During augment, `digest-log` calls render as a log under the tree.
- Fetch completes → tree transitions to the digest view.
- Fetch without the dashboard running still succeeds; a pi-TUI warning is
  shown once at the end.
- All existing scheduler guarantees (reducer mutex, runaway cap, loud
  failures, graceful run() degradation) and all 127 existing tests still pass.

## Existing abstractions to use

- `scripts/src/scheduler.ts` (reducer task scheduler) — add the imperative
  `ctx.progress` node model; do not regress the mutex/cap/failure guarantees.
- `.pi/extensions/digest-dashboard/state.ts` (`StateEvent`, `appendEvent`
  write queue) — add `"progress"` and `"agent_log"` event types.
- `.pi/extensions/digest-dashboard/server.ts` (`/events` SSE, `/api/state`
  POST) — extend `/events` to watch `state.json`.
- `.pi/extensions/digest-dashboard/Digest.svelte` — new "fetch display mode"
  view + layered debounce.
- `skills/core/aura-digest/aura-digest.md` — reorder steps.

## Architecture / domain decisions

See the map (`docs/tasks/maps/digest-live-progress-tree/map.md`) "Decisions so
far" — the full grilling record lives there. Key points: the node model is
imperative and task-driven (the scheduler is a passthrough; only the progress
function marks nodes finished; end-of-run sweep closes orphans as error);
`finish(node, { deferCloseForChildren: true })` is the opt-in parent-joins-
children primitive; transport reuses `POST /api/state` + extended `/events`;
batching is ~50ms in the bundle; client debounce is layered (30ms coalesce +
400ms dwell); base-fetch phases are emitted inline in `fetchAction`, not in
the scheduler.

## Implementation notes

### slice: 1-scheduler-progress-nodes (landed)

- Replaced the uncommitted declarative `Kind.progress(input)` + auto-open/close-around-`run` model with an imperative `ctx.progress` API on the scheduler. `ctx.progress.create(parent?, label)` returns an opaque `NodeHandle`; `ctx.progress.finish(node)` marks a node done right now (no removal); `ctx.progress.finish(node, { deferCloseForChildren: true })` defers resolution until all child-nodes are terminal (done if all children done, error if any child errored; no children → done immediately); `ctx.progress.setStatus(node, "running"|"done"|"error")` mutates status directly.
- `TaskRef.node` (an optional `NodeHandle` the parent created) replaces the removed `progressParentId`; the scheduler threads it as `ctx.node` (root for `start`). Nodes are append-only — never removed mid-run — so the tree only grows during a run.
- The scheduler's only auto-close is an end-of-run sweep: any still-"running" node (never `finish`ed or deferred-and-unresolved) → "error" (safety net). A task that throws does NOT trigger per-task auto-close; only the sweep closes its open nodes.
- `onProgress` fires for every status transition, serialized with the reducer drain (never overlap). Existing guarantees hold: reducer mutex, runaway cap, loud failures, graceful `run()` degradation. All pre-existing scheduler tests (mutex, cap, async-reducer rejection, unknown kind, throwing reducer, graceful degradation) pass unchanged.
- Tests: `scripts/src/scheduler.test.ts` gained 14 new tests covering the node lifecycle (defer-with-children dynamic join, never-finished sweep, throw-does-not-close, finish-no-children, `TaskRef.node` threading); 21 tests total. Full suite: 141 tests pass across 16 files (was 127). `scripts` typecheck clean, build succeeds.
- No bundle changes in this slice — the rebuilt `aura-digest.mjs` from verify is out of scope (bundle emission is slice 3). The scheduler-only change is consumed by slice 3's `start` kind.

### slice: 2-dashboard-event-plumbing (landed)

- Added `"progress"` and `"agent_log"` to the `StateEvent.type` union in `.pi/extensions/digest-dashboard/state.ts`. New `ProgressPayload` (mirrors the scheduler's `ProgressEvent`: `id`, `label`, `parentId?`, `status`, `startedAt`, `endedAt?`, `kind`) and `AgentLogPayload` (`message: string`). `appendEvent` accepts both unchanged (same write queue).
- `/events` SSE in `server.ts` gained a second `fs.watch` on `state.json`; on change it reads the last event and emits `event: state-change` with the event's `id` + `type`. The existing `digest.json` `event: change` is untouched.
- `digest-types.ts` (the browser-facing `StateEvent` copy) was edited then deliberately reverted — the browser-side type union update is slice 4's scope. `state.ts` is the server-side source of truth (`server.ts` imports `StateEvent` from it), so typecheck passes without the `digest-types.ts` change.
- Tests: `test/digest-dashboard/server.test.ts` (new) and `test/digest-dashboard/state.test.ts` (new) cover POST landing with monotonic ids, SSE `state-change` for both new types, concurrent-POST serialization, and the `digest.json` `event: change` regression. Full suite: 149 tests pass across 16 files (was 141, +8 new). `scripts` typecheck clean; dashboard server bundle exists.
- Residual risks (for slice 4): the `state.json` watcher silently swallows ENOENT if the file is absent at SSE-connect time (no retry) — slice 4's view should re-fetch `state.json` on connect; `state-change` carries only the last event's id+type (a hint, not a full delta) so the browser re-fetches; `digest-types.ts` must be updated in slice 4 to mirror the `state.ts` union.

### slice: 3-bundle-emits-tree (landed)

- New `scripts/src/progress-emitter.ts` (separate module so it can be unit-tested without importing `aura-digest.ts`, which has module-level side effects). `readDashboardUrl(path?)` reads `~/.pi/aura/server-url.json` ONCE at fetch start; returns `null` if absent/malformed → the hook is a no-op for the whole run (digest still writes `digest.json`). `createProgressEmitter(dashboardUrl, opts?)` returns an `onProgress`-compatible hook + a `flush()` for run-end flushing. Events batch on a ~50ms timer; events arriving in the same window are coalesced by node id (latest status wins), so a near-instant open→done pair becomes a single "done" event. POST failures are best-effort (dashboard down mid-run is non-fatal). Each event is POSTed individually to `/api/state` as a `StateEvent` wrapper — the "batch" is the time window + coalescing, not a single HTTP body.
- `scripts/src/aura-digest.ts` `fetchAction` reads the dashboard URL once and installs the hook. Inline phase nodes (emitted before/during the parallel base fetch) cover notifications + capacity with stable ids (`phase-notifications`, `phase-capacity`); each is `finish`ed when its base fetch completes. The `start` kind creates two phase nodes ("Fetching tasks from Aura", "Fetching reviews") at root level, a child node per dev-links row under the tasks phase and per review candidate under the reviews phase, then `finish`es every child with `deferCloseForChildren: true` BEFORE spawning so each stays spinning until the child task finishes its own `ctx.node`. The `devLinksRow` and `reviewCandidate` kinds now take `ctx` and `finish(ctx.node)` in a `finally` block so the deferred parent resolves once all siblings are terminal.
- Bundle rebuilt: `skills/core/aura-digest/dist/aura-digest.mjs` regenerated via esbuild.
- Tests: `scripts/src/aura-digest-progress.test.ts` (new, 10 tests) covers `readDashboardUrl` (absent/exists/malformed), the no-op path (no POSTs when `dashboardUrl` is null), batching (10 rapid events in one ~50ms window), final flush, open→done coalescing to a single done event, different-id non-coalescing, running→error coalescing, and a kept-running event. Full suite: 159 tests pass across 17 files (was 149 across 16, +10 new). `scripts` typecheck clean; build succeeds.
- Residual risks (for slice 4): the emitter POSTs individual `StateEvent`s per event (no multi-event body) — slice 4's browser view must accumulate them from `state.json`; the no-op path emits nothing, so the browser sees an empty `state.json` while a no-dashboard fetch runs (slice 4 should handle an empty/absent tree gracefully).

### slice: 4-svelte-tree-view (landed)

- `Digest.svelte` gained a "fetch display mode": when `progress` events arrive the view renders a nested tree of nodes (spinner while running, ✓ on done, ✕ on error) keyed by `parentId`, and `agent_log` events render as a chronological log list below the tree. Nodes are append-only — once shown, a node stays on screen until the run ends (never removed mid-run) — so the tree only grows. On a terminal "done" event for the root fetch node, the view transitions to the digest view (existing queue/reviews/capacity/actions render) after `digest.json` is present; the existing digest render path and action_click flow are unchanged.
- New `.pi/extensions/digest-dashboard/progressTree.ts` is the pure, framework-agnostic helpers module: `buildTree(events)` constructs the nested structure, `findNode`/`getRootNodes`/`getChildNodes` traverse it, and `createDwellManager(DWELL_MS, onExpire?)` implements the ~400ms minimum dwell on a running→done transition. The dwell manager uses a clean `setTimeout` driven from render-observation (the component polls dwell expiry on each reactive tick), with a **reactive `dwellVersion`** counter so Svelte's reactivity re-runs the expiry check — NO `requestAnimationFrame`, NO buffer/canvas tricks. `onExpire` callback fires when a dwell timer elapses, letting the component re-render without a forced rAF loop. The ~30ms coalescing on incoming events is a separate debounce in the component that batches rapid `state-change` SSE bursts into one render.
- `digest-types.ts` updated to mirror `state.ts`: the browser-facing `StateEvent` type union now includes `"progress"` + `"agent_log"`, and `ProgressPayload` / `AgentLogPayload` mirror their server-side counterparts (resolving the residual risk slice 2 flagged).
- The ~400ms dwell fix evolved across the slice: the first attempt used a test-tuned rAF buffer; the final approach removed it in favor of the clean `setTimeout`-from-render-observation + reactive `dwellVersion` design (no rAF, no buffer). The component re-checks dwell timers reactively and calls `onExpire` when a timer elapses.
- Tests: `test/digest-dashboard/progressTree.test.ts` (new, covers `buildTree` nesting, append-only, `createDwellManager` with/without `onExpire`, reactive `dwellVersion`, ~400ms hold on running→done, rapid-burst coalescing) + `test/digest-dashboard/DigestTree.test.ts` (new, component-level: fast open→done renders a brief ✓ with no flicker, nested subtree, error ✕, `deferCloseForChildren` parent stays spinning until children resolve, transition to digest view on terminal root done + `digest.json` present). `Digest.test.ts` + `real-data-load.test.ts` updated for the new view. Full suite: **198 tests pass across 19 files** (was 159 across 17, +39 new +2 files). `scripts` typecheck clean; `scripts` build succeeds; `.pi/extensions/digest-dashboard/dist/{app.js,app.css,server.mjs}` bundles exist.
