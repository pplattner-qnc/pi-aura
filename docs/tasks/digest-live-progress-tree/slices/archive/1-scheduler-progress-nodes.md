---
kind: slice
slug: 1-scheduler-progress-nodes
title: Revise the scheduler to an imperative ctx.progress node model
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## End-to-end behavior

The scheduler stops auto-opening/closing nodes around `run`. Instead each
`run` receives a progress object in `ctx` and drives nodes imperatively. Nodes
outlive the task that opened them; a parent attaches each child to a node it
created; `finish(node, { deferCloseForChildren: true })` opts into "close when
all child-nodes are terminal"; the scheduler tracks the subtree and closes the
deferred node when the last child terminals. The scheduler's only auto-close is
an end-of-run sweep: any still-"running" node → "error".

## What this slice delivers

A revised `scripts/src/scheduler.ts` (replacing the uncommitted declarative
`Kind.progress(input)` + auto-open/close from this turn) plus updated
`scheduler.test.ts` covering the new lifecycle.

## Acceptance criteria

- `ctx.progress.create(parent?, label)` opens a node and returns an opaque
  `NodeHandle`; `ctx.node` is the task's own attachment (root for `start`). A
  node, once created, STAYS ON SCREEN until the end of the run — never removed.
- `ctx.progress.finish(node)` (no flag): marks the node **done** right now
  (spinner stops, turns into a tick). The node stays visible; only its status
  changes. It does NOT remove the node.
- `ctx.progress.finish(node, { deferCloseForChildren: true })`: does NOTHING
  to the node's status now; instead sets a flag on the node — "once all my
  child-nodes are terminal, I become done (done if all children succeeded,
  error if any child errored)." The parent keeps spinning until that join
  resolves. A `finish`ed-with-defer node that has no children becomes done
  immediately.
- `ctx.progress.setStatus(node, "running"|"done"|"error")` mutates a node's
  status directly (e.g. a task can mark its own node error before returning).
- `TaskRef` carries an optional `node: NodeHandle` the parent created; the
  scheduler threads it to the child as `ctx.node`.
- The scheduler tracks parent→child node relationships to honor
  `deferCloseForChildren`: a deferred parent's status resolves to done iff
  all child-nodes (dynamic, including ones attached later) are done; to
  error if any child-node is error.
- End of run: any node still "running" (never `finish`ed, or deferred-and-
  unresolved) → "error" (safety net). The tree is append-only; no node is
  ever removed mid-run.
- The scheduler calls `onProgress(event)` for every status transition;
  events are serialized with the reducer drain (never overlap).
- Existing guarantees hold: reducer mutex, runaway cap, loud failures,
  graceful run() degradation. All pre-existing scheduler tests still pass.

## Test plan

- A task opens a node and `finish`es it with `deferCloseForChildren: true`
  after spawning children attached to it; assert the node closes only when
  the last child closes (dynamic — add a child *after* the finish).
- A task opens a node and never `finish`es it; assert the end-of-run sweep
  marks it "error".
- A task throws; assert its still-open nodes are NOT closed per-task (only
  the end-of-run sweep closes them as "error").
- `finish` with no children closes immediately.
- All existing scheduler tests pass unchanged (mutex, cap, async-reducer
  rejection, unknown kind, throwing reducer, graceful degradation).

## Constraints and dependencies

- Replaces the uncommitted declarative `Kind.progress` code from this turn.
- No dashboard/bundle changes in this slice — pure scheduler + tests.
- Must not regress the committed reducer mutex / cap / failure guarantees.
