---
kind: slice
slug: 2-aura-digest-and-deps-to-shared
title: Move aura-digest.ts + devlinks/clients/mcp-client/bitbucket into shared; re-point CLI + extension
task: ../task.md
mode: afk
status: todo
size: l
blocked_by: [1-leaf-core-to-shared]
---

## End-to-end behavior

No user-visible change. The rest of the digest core — `aura-digest.ts`
itself plus `devlinks`, `clients`, `mcp-client`, `bitbucket` — moves into
the shared home chosen in slice 1. `scripts/src/aura-digest.ts` becomes a
thin CLI entry that imports `fetchAction`/`renderAction`/etc. from the
shared core (the `main()` dispatch stays here; the CLI is deleted in task 5,
not this slice). The CLI bundle builds and runs identically. The
`digest-dashboard` extension can now import `fetchAction` from the shared
core without TS6059 — the import boundary that blocked the in-process work
is fully resolved, ready for tasks 2–4.

## What this slice delivers

- Move `aura-digest.ts` → `@pi-aura/shared/digest/aura-digest.ts` (or the
  chosen shared path); it imports the moved leaves (slice 1) via the shared
  path. Export `fetchAction` (and the other actions) so the CLI shim and the
  extension can both call them.
- Move `devlinks`, `clients`, `mcp-client`, `bitbucket` into the shared
  digest home; re-point their internal imports.
- `scripts/src/aura-digest.ts` becomes a thin CLI entry: `import {
  fetchAction, saveAction, ... } from "@pi-aura/shared/digest/aura-digest"`;
  `main()` dispatches on `process.argv` and prints JSON (unchanged CLI
  behavior). This is the shim task 5 later deletes.
- Drop `scripts/src/keyring.ts` if it was only a re-export used by the
  digest core — point the moved core directly at `@pi-aura/shared/keyring`.
- The `aura.ts` and `engineering-sync.ts` bundles are untouched (confirmed
  they don't import the digest core).

## Acceptance criteria

- `fetchAction` (and sibling actions) are importable from the shared core;
  the extension's `tsc --noEmit` imports them without TS6059 (verified by a
  scratch import or the absence of rootDir-relative paths).
- The CLI bundle builds and `aura-digest.mjs fetch` produces byte-identical
  output to today.
- All tests pass: moved tests under `packages/shared/test/digest/`, the
  `scripts` typecheck + build, and the full vitest suite.
- No behavior change; scheduler guarantees intact.

## Test plan

- Determinism: `aura-digest.mjs fetch` output diff vs today — identical.
- `fetchAction` import test: a scratch extension file `import {
  fetchAction } from "@pi-aura/shared/digest/aura-digest"` typechecks (the
  gate for tasks 2–4).
- Moved tests pass under `tsx --test`; vitest suite green.

## Constraints and dependencies

- Blocked by slice 1 (the leaves must move first).
- No behavior change. No `aura.ts`/`engineering-sync.ts` regression.
- The `fail()` helper in `aura-digest.ts` calls `process.exit` — for the
  shared core, change it to a `throw` (the CLI shim catches and
  `process.exit`s). Record this as a small seam decision in the notes.
