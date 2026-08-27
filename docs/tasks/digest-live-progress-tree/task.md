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
