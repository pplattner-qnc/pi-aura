---
kind: task
type: feature
slug: core-move
title: Move the aura-digest core out of scripts/src into the extension/shared layer
map: in-process-aura-digest
status: ready
blocked_by: []
slices: [1-leaf-core-to-shared, 2-aura-digest-and-deps-to-shared, 3-remove-readDashboardUrl-duplicate]
---

## User-visible outcome

No user-visible change. The aura-digest core (`fetchAction`, `scheduler`,
`progress-emitter`, `devlinks`, `build-actions`, `write-dashboard-digest`,
`settings`, `types`) moves from `scripts/src/` to a location the
`digest-dashboard` extension can import without a TS6059 `rootDir` violation.
The CLI keeps working (temporarily) via a thin shim that imports the moved
core. This is pure prefactoring — it gates the in-process work (tasks 2–5)
but changes no behavior.

## Scope boundaries

- In: relocate the core sources; update import paths; keep the CLI bundle
  building and green (the CLI is deleted in task 5, not here); keep all
  existing tests green (tests move with their sources or get re-pointed).
- Out: changing any behavior; touching the extension's tools; deleting the
  CLI; the in-process server/fetch/log/save rewiring (tasks 2–5).

## Acceptance criteria

- The core lives where the extension's `tsc --noEmit` can import it without
  TS6059 (file outside `rootDir`). The local `readDashboardUrl` duplicate in
  `index.ts` (slice 5 of `digest-live-progress-tree`) is removed in favor of
  the single shared `readDashboardUrl`.
- The CLI bundle (`dist/aura-digest.mjs`) still builds and runs (via a thin
  shim that imports the moved core) — same CLI behavior as today.
- All existing tests pass (suite count as of this task's start) with tests
  re-pointed to the moved sources. `scripts` typecheck + build green;
  extension typecheck green.
- No behavior change: `digest.json` output byte-identical; scheduler
  guarantees intact.

## Existing abstractions to use

- `@pi-aura/shared` workspace package (already consumed by both `scripts/`
  and the extension) — the likely shared home, OR a new `core/` dir inside
  the extension. Decide in the slice that does the move.
- The existing `scripts/esbuild.config.mjs` (keep building the CLI shim
  against the moved core for now).

## Slice intent (planned in a later pass)

- One slice: relocate the core + re-point imports + remove the
  `readDashboardUrl` duplicate + keep CLI + tests green. Possibly split if
  the `@pi-aura/shared` packaging vs. extension-`core/` decision needs a
  prototype.

## Implementation notes

_The land-worker appends a per-slice note here as each slice lands._
