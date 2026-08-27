---
kind: slice
slug: 3-bundle-emits-tree
title: Wire the bundle onProgress to POST batched events + emit phase/row nodes
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: [1-scheduler-progress-nodes, 2-dashboard-event-plumbing]
---

## End-to-end behavior

The bundle's `runTasks` call passes an `onProgress` hook that POSTs progress
events (batched ~50ms + flushed at run end) to the running dashboard's
`/api/state`. `fetchAction` emits the top-level phase nodes ("Fetching
notifications from Aura", "Fetching tasks from Aura", "Fetching capacity",
"Fetching reviews") inline before the scheduler runs, and the `start` kind
creates + attaches child nodes for the dev-links rows (under "Fetching tasks")
and review candidates (under "Fetching reviews"), finishing them with
`deferCloseForChildren: true` so they stay spinning until each subtree completes.

## What this slice delivers

Changes to `scripts/src/aura-digest.ts` (phase-node emission + `start`'s node
wiring + the `onProgress`→POST hook) and a small helper for reading
`~/.pi/aura/server-url.json` + batched POST. Bundle rebuild.

## Acceptance criteria

- `onProgress` reads `~/.pi/aura/server-url.json` once at fetch start; if
  absent, the hook is a no-op for the whole run (digest still writes
  `digest.json`).
- Events are batched on a ~50ms timer and flushed at run end; near-instant
  open→done pairs coalesce to a single "done" event.
- `fetchAction` emits the four phase nodes inline (notifications/tasks/
  capacity/reviews) with stable ids and `finish`es each when its base fetch
  completes.
- `start` creates a child node per dev-links row attached under "tasks", and
  per review candidate under "reviews", and `finish`es each with
  `deferCloseForChildren: true` before spawning.
- The fetch still succeeds and writes a deterministic digest when the dashboard
  is absent (no-op path); the digest output is byte-identical to today.
- Wall time within run-to-run variance of the current ~17s (batching must not
  add latency).

## Test plan

- Run the bundle with the dashboard up; observe the live tree in the browser
  (manual / browser-qa).
- Run the bundle with the dashboard down; assert no errors, digest written,
  no events attempted (no-op).
- Compare `digest.json` to a pre-change baseline; assert identical dev_links
  order + reviews_owed + warnings.
- Unit test the batch flush: push 10 rapid events, assert they POST in ≤1
  batch within ~50ms + a final flush.

## Constraints and dependencies

- Blocked by 1 (scheduler node model) and 2 (event plumbing) — needs both.
- Must not regress the committed digest determinism.
