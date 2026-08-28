---
kind: slice
slug: 3-remove-readDashboardUrl-duplicate
title: Remove the local readDashboardUrl duplicate in the extension; use the shared one
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: [2-aura-digest-and-deps-to-shared]
---

## End-to-end behavior

No user-visible change. The local `readDashboardUrl` duplicate in
`.pi/extensions/digest-dashboard/index.ts` (added in slice 5 of
`digest-live-progress-tree` because importing
`scripts/src/progress-emitter.ts` broke the extension's `tsc --noEmit` with
TS6059) is removed. The extension imports `readDashboardUrl` from the shared
core (now `@pi-aura/shared/digest/progress-emitter`) instead. Single source
of truth.

## What this slice delivers

- Delete the local `readDashboardUrl` (and the `joinUrl` helper if it was
  also duplicated) from `index.ts`; import `readDashboardUrl` from the
  shared core.
- Update `log-tool.test.ts` and any test that mocked the local helper to
  mock the shared import instead.
- Note in the task: `readDashboardUrl` itself becomes dead code once task 3
  (in-process-fetch) lands (the fetch won't read `server-url.json`), but
  this slice removes the *duplicate now* to close the TS6059 workaround
  cleanly while the helper still exists.

## Acceptance criteria

- `index.ts` has no local `readDashboardUrl` definition; it imports the
  shared one. (Or, if `digest-log` is already rewired to not need it, it's
  simply gone — but that rewiring is task 4, not here. Here we just
  de-duplicate.)
- Extension `tsc --noEmit` passes.
- `digest-log` behavior unchanged (still no-op-safe if the dashboard is
  down); `log-tool.test.ts` passes.
- Full vitest suite + typecheck green.

## Test plan

- `log-tool.test.ts`: the no-op path (no `server-url.json`) still returns
  ok without throwing; the POST path still POSTs. Pass with the shared
  import.
- Typecheck the extension.

## Constraints and dependencies

- Blocked by slice 2 (the shared core must export `readDashboardUrl`).
- No behavior change. This closes the TS6059 workaround documented in
  `digest-live-progress-tree`'s slice 5 notes.
