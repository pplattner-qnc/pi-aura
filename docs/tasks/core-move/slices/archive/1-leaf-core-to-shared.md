---
kind: slice
slug: 1-leaf-core-to-shared
title: Move the pure digest-core leaf modules into @pi-aura/shared and re-point the CLI bundle
task: ../task.md
mode: afk
status: doing
size: m
blocked_by: []
---

## End-to-end behavior

No user-visible change. The pure leaf modules of the digest core —
`scheduler`, `progress-emitter`, `build-actions`, `write-dashboard-digest`,
`types`, `settings` — move from `scripts/src/` into `@pi-aura/shared`
(`packages/shared/src/digest/...` or a new subpath) so both `scripts/` (the
CLI bundle) and the `digest-dashboard` extension can import them without a
TS6059 `rootDir` violation. The CLI bundle (`aura-digest.mjs`) keeps building
and behaving identically, now importing the moved modules via the
`@pi-aura/shared` package path. Their tests move with them and pass.

This is the first vertical slice of the prefactoring: it proves the shared
home works (the import boundary is resolved) by moving the leaf modules the
rest of the core depends on, and keeping the CLI green end-to-end.

## What this slice delivers

- A decision + implementation: the digest core lives under
  `@pi-aura/shared` (the existing workspace package both `scripts/` and the
  extension already consume) — e.g. `packages/shared/src/digest/scheduler.ts`,
  `.../progress-emitter.ts`, etc., exported via the shared `exports` map
  (`@pi-aura/shared/digest/scheduler`, ...). (If a quick prototype shows a
  new `@pi-aura/digest-core` package is cleaner, use that instead — record
  the decision in the task notes. The point is: one shared home that the
  extension can import without TS6059.)
- The leaf modules move: `scheduler`, `progress-emitter`, `build-actions`,
  `write-dashboard-digest`, `types`, `settings`. (Not `aura-digest.ts`,
  `devlinks`, `clients`, `mcp-client`, `bitbucket` yet — those depend on
  the leaves and move in slice 2, except where noted.)
- `scripts/src/aura-digest.ts` (and the remaining digest sources) re-point
  their `./scheduler.js` etc. imports to `@pi-aura/shared/digest/...`.
- The CLI bundle (`dist/aura-digest.mjs`) rebuilds and runs identically.
- Tests for the moved leaves move to `packages/shared/test/digest/...` and
  pass under `tsx --test`; the shared `typecheck` passes.

## Acceptance criteria

- The leaf modules are importable from `@pi-aura/shared/digest/*` (or the
  chosen shared path); the extension's `tsc --noEmit` would not throw TS6059
  importing them (verified by a trivial import in a scratch extension file,
  or by the absence of rootDir-relative paths).
- `scripts/src/aura-digest.ts` imports the moved leaves via the shared
  package path, not `./scheduler.js`.
- The CLI bundle builds (`npm run build` in `scripts/`) and `aura-digest.mjs
  fetch` produces byte-identical digest output to today (determinism check).
- `packages/shared` `typecheck` + `tsx --test test/digest/*.test.ts` pass;
  `scripts` `typecheck` + `build` pass; full vitest suite passes
  (digest-dashboard tests untouched).
- No behavior change.

## Test plan

- Determinism: run `aura-digest.mjs fetch` before and after; diff the
  `digest.json` output (dev_links order, reviews_owed, warnings) — identical.
- Moved-leaf tests: `scheduler.test.ts`, `progress-emitter` (in
  `aura-digest-progress.test.ts`), `build-actions.test.ts`,
  `write-dashboard-digest.test.ts` pass from their new shared location.
- Cross-import check: a scratch `import { runTasks } from
  "@pi-aura/shared/digest/scheduler"` in the extension typechecks (proves
  the boundary is resolved for slice 2 + tasks 2–4).

## Constraints and dependencies

- Must not change any behavior or the digest output.
- Must not break the `aura.ts` or `engineering-sync.ts` bundles (they don't
  import the digest core — confirmed — but the shared package change must
  not regress their builds).
- The `@pi-aura/shared` `exports` map gains the new subpaths.
