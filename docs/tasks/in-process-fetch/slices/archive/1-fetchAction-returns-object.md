---
kind: slice
slug: fetchAction-returns-object
title: Make fetchAction a pure function returning {digest, report, raw}; CLI shim takes over file-writing
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: []
---

## End-to-end behavior

No user-visible change. `fetchAction()` in `@pi-aura/shared/digest/aura-digest`
becomes a pure function: it builds and returns `{ digest, report, raw }`
instead of writing temp-dir files + `~/.pi/aura/digest.json` + stdout. The CLI
shim (`scripts/src/aura-digest.ts`) takes over the file-writing so `aura-digest.mjs
fetch` behaves identically (byte-identical output). `fetchAction` gains an
optional `onProgress?: (e: ProgressEvent) => void` param (callers own the
live-tree wiring) and an optional `auraClient?` param (test seam). The core
stops calling `readDashboardUrl`/`createProgressEmitter` internally.

## What this slice delivers

- `fetchAction(opts?: { onProgress?: (e: ProgressEvent) => void; auraClient?: AuraClient }): Promise<{ digest: Digest; report: AuraReport; raw: RawAuraData }>`. Stop writing `raw.json`/`digest.json`/`report.json` to a temp dir; stop `writeDashboardDigest`; stop the `console.log("output directory: ...")`. Build + return the object. Pass `opts.onProgress` to `runTasks`'s `onProgress` (replacing `progressHook`). When `onProgress` is undefined, pass a no-op (the CLI shim supplies its own). `auraClient` defaults to `createDefaultAuraClient()` when undefined (the test seam).
- Move the `readDashboardUrl()` + `createProgressEmitter` call OUT of `fetchAction` to the callers. `createProgressEmitter` + `readDashboardUrl` stay exported from `@pi-aura/shared/digest/progress-emitter` (the CLI shim uses them this slice; task 5 deletes them with the CLI).
- Export `DASHBOARD_DIGEST_PATH` (or a `writeDashboardDigestToDefault(digest)` helper) from the shared core so the CLI shim can write `~/.pi/aura/digest.json` (it currently relies on `fetchAction` doing it).
- CLI shim `main()` fetch case: `const r = await fetchAction({ onProgress: createProgressEmitter(readDashboardUrl()) }); <write raw.json/digest.json/report.json to a temp dir> <writeDashboardDigest(r.digest, DASHBOARD_DIGEST_PATH)> console.log("output directory: <dir>/")`. The temp-dir + file-writing logic moves from `fetchAction` into the shim. CLI behaves identically.
- Add a `fetchAction` test in `packages/shared/test/digest/` that injects a fake `auraClient` and asserts the returned object shape + that NO files are written. (Mock conventions: inject a fake `AuraClient` — see `docs/testing.md`. The `auraClient?` param is the seam.)

## Acceptance criteria

- `fetchAction` returns `{digest, report, raw}`; writes no files; takes `onProgress?` + `auraClient?`.
- The CLI shim writes the temp-dir files + `~/.pi/aura/digest.json` + prints `output directory:` — `aura-digest.mjs fetch` produces byte-identical output to today.
- `createProgressEmitter`/`readDashboardUrl` no longer called inside `fetchAction`.
- New `fetchAction` test (mocked `auraClient`) passes under `tsx --test`; shared typecheck + the CLI build + root vitest green.

## Test plan

- `fetchAction.test.ts` (new, `node:test`): inject a fake `AuraClient` returning fixture data; assert `fetchAction({ auraClient: fake })` returns `{digest, report, raw}` with the expected shape; assert no files written (use a temp HOME + assert no `~/.pi/aura/digest.json`).
- CLI determinism: `aura-digest.mjs fetch` (if runnable with creds in CI) byte-identical; at minimum the bundle builds + `last`/USAGE work.
- Shared `tsx --test` + typecheck + root vitest green.

## Constraints and dependencies

- No behavior change to the CLI (shim takes over file-writing).
- Do NOT call `fetchAction` from the extension yet (slice 2).
- Do NOT drop `digest.json`/temp dir from the CLI path (task 5 deletes the CLI).
- Keep `createProgressEmitter`/`readDashboardUrl` exported (CLI shim uses them).
