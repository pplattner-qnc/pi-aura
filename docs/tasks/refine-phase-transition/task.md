---
kind: task
type: feature
slug: refine-phase-transition
title: Keep the live tree during the augment phase; digest-finalize signals the view to transition to the digest
status: ready
blocked_by: []
slices: [1-refine-done-signal-and-rename, 2-view-transition-on-refine-done]
---

## User-visible outcome

After `digest-fetch` completes, the live progress tree **stays** (showing a "Refining…" header + the augment `digest-log` lines in the log list) while the LLM refines the digest (Step 3: summary, review updates, re-rank, corrections). The view transitions to the digest **only** when the LLM signals the digest is final — via the renamed `digest-finalize` tool (was `digest-save`), which persists the corrected digest to `~/.pi/aura/last-digest.json` AND pushes a `refine_done` event that flips the view. No more half-baked uncorrected digest flashing before the augment; the live tree carries through the whole fetch→augment phase.

## Scope boundaries

- In: add a `refine_done` event type; rename `digest-save` → `digest-finalize` (dual role: persist + push `refine_done`); change the view's transition from "root done + /api/digest ok" to "a `refine_done` event arrived"; show "Refining…" while the fetch root is done but no `refine_done` yet; update tests + the skill doc.
- Out: the fetch flow (task 3), the server lifecycle (task 2), the log/save core (task 4), CLI deletion (task 5 — done). The augment logic itself (summary/reviews/actions) — unchanged; just the *view* of it.

## Acceptance criteria

- After `digest-fetch` (root `done` + `setCurrentDigest`), the tree stays (fetchMode remains true); the header shows "Refining…".
- `digest-finalize` (was `digest-save`) persists the corrected digest AND pushes a `refine_done` event.
- The view transitions to the digest on seeing a `refine_done` event (not on root-done + digest-ok).
- `digest-log` lines during augment render in the log list (already works via GET /api/state).
- All tests pass; the `digest-save` references renamed to `digest-finalize`.

## Existing abstractions to use

- `store.pushEvent` (task 2) — the `refine_done` event.
- `StateEvent` type union — add `refine_done`.
- The existing tree + log list UI (no new UI surface).
- `saveLastDigest` (shared core) — unchanged.

## Slice intent

- Slice 1: add `refine_done` event type; rename `digest-save` → `digest-finalize` + push the event; update tests.
- Slice 2: view transitions on `refine_done` (not root-done); "Refining…" header; tests + skill doc.

## Implementation notes

_The land-worker appends a per-slice note here as each slice lands._
