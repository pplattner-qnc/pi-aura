---
kind: slice
slug: drop-dead-shared-exports
title: Remove the shared-core exports only the CLI shim used (progress-emitter, write-dashboard-digest, render/save/diff/cleanup/last actions, FailError, USAGE, DASHBOARD_DIGEST_PATH)
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: [delete-cli-shim-and-bundle]
---

## End-to-end behavior

No behavior change (the in-process tools don't use these). The shared-core exports that existed only for the deleted CLI shim are removed: the whole `progress-emitter.ts` module, `write-dashboard-digest.ts`, and the `renderAction`/`saveAction`/`diffAction`/`cleanupAction`/`lastAction`/`USAGE`/`FailError`/`DASHBOARD_DIGEST_PATH` exports from `aura-digest.ts`. `fetchAction` + `saveLastDigest` stay (the in-process tools use them). The shared `exports` map drops the removed subpaths.

## What this slice delivers

- `packages/shared/src/digest/progress-emitter.ts`: **delete the file** (`createProgressEmitter`/`readDashboardUrl`/`defaultServerUrlPath`/`joinUrl` + types — used only by the deleted shim; the in-process `digest-fetch` uses `store.pushEvent`; the extension dropped these in tasks 2/4). Grep-confirm zero importers first (the core's `aura-digest.ts` no longer imports it — task 3 slice 1 removed that).
- `packages/shared/test/digest/aura-digest-progress.test.ts`: delete (tests the deleted `createProgressEmitter`).
- `packages/shared/src/digest/write-dashboard-digest.ts` + `packages/shared/test/digest/write-dashboard-digest.test.ts`: delete (writes `~/.pi/aura/digest.json`, which the in-process path doesn't; only the deleted shim imported `writeDashboardDigest`).
- `packages/shared/src/digest/aura-digest.ts`: remove the now-dead exports `renderAction`, `saveAction`, `diffAction`, `cleanupAction`, `lastAction`, `USAGE`, `FailError`, `DASHBOARD_DIGEST_PATH`. **Keep** `fetchAction` (in-process `digest-fetch`) + `saveLastDigest` (in-process `digest-save`). The `fail()` helper (threw `FailError`) becomes dead with `FailError` — delete it (grep-confirm nothing still throws it). `DASHBOARD_DIGEST_PATH` is dead (in-process doesn't write `digest.json`) — delete.
- `packages/shared/package.json` `exports`: drop `./digest/progress-emitter` + `./digest/write-dashboard-digest` subpaths.
- Confirm shared typecheck + `tsx --test` pass (the deleted tests' count drops; the remaining digest tests — scheduler/build-actions/fetchAction/joinUrl-export if it exists — still pass). NOTE: `joinUrl-export.test.ts` tested `joinUrl` from progress-emitter — if `joinUrl` is deleted with the module, delete that test too.

## Acceptance criteria

- No `progress-emitter.ts`/`write-dashboard-digest.ts` in `packages/shared/src/digest/`; no their tests.
- `aura-digest.ts` exports only `fetchAction` + `saveLastDigest` (digest actions); no `renderAction`/`saveAction`/`diffAction`/`cleanupAction`/`lastAction`/`USAGE`/`FailError`/`DASHBOARD_DIGEST_PATH`/`fail`.
- `packages/shared/package.json` `exports` drops the removed subpaths.
- Shared typecheck + `tsx --test` green (count drops by the deleted tests).

## Test plan

- Grep: no `createProgressEmitter`/`readDashboardUrl`/`writeDashboardDigest`/`renderAction`/`saveAction`/`diffAction`/`cleanupAction`/`lastAction`/`USAGE`/`FailError`/`DASHBOARD_DIGEST_PATH` in `packages/shared/src/` (except `fetchAction`/`saveLastDigest`).
- `cd packages/shared && npx tsc --noEmit` clean; `cd packages/shared && npx tsx --test 'test/**/*.test.ts'` green.
- Full vitest green (the extension's tests don't import the deleted exports — confirm).

## Constraints and dependencies

- Blocked by slice 1 (the shim — their only consumer — must be gone first).
- Do NOT delete `fetchAction` or `saveLastDigest` (the in-process tools use them).
- Do NOT touch the in-process tools/store/server/extension.
- Do NOT rewrite the skill doc (slice 3).
