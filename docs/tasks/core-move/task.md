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

### Slice 1-leaf-core-to-shared — Move digest leaf core into @pi-aura/shared

- Moved 6 leaf modules (scheduler, progress-emitter, build-actions, write-dashboard-digest, types, settings) from `scripts/src/` into `packages/shared/src/digest/` via `git mv` (history preserved); added explicit `./digest/*` export subpaths to `packages/shared/package.json`.
- Re-pointed `scripts/src/aura-digest.ts`, `scripts/src/devlinks.ts`, and `scripts/src/followup-working-on.test.ts` imports to `@pi-aura/shared/digest/*`.
- Moved 4 test files to `packages/shared/test/digest/`; converted the 2 vitest-based tests (scheduler, aura-digest-progress) to `node:test` + `node:assert` to match the shared package `tsx --test` convention (semantically equivalent assertions).
- `vitest.config.ts` include trimmed to `["test/**/*.test.ts"]` (the 2 moved vitest paths removed); root vitest count went 20 files/210 → 18 files/177, with the 35 moved tests now running under `packages/shared` `tsx --test` (184 total there).
- Cross-import seam verified: extension `tsc --noEmit` imports `@pi-aura/shared/digest/*` with no TS6059 (the gate for slices 2-3 / tasks 2-4). CLI bundle builds and runs identically.
