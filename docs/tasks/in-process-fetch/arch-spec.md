# Architecture spec — `in-process-fetch`

> Task 3 of 5 in `in-process-aura-digest`. `digest-fetch` calls `fetchAction()`
> **in-process** (no spawned CLI) with `onProgress` wired to the in-memory
> event stream (task 2's `store.ts`), and populates the in-memory current
> digest — ending the accepted empty-dashboard regression from task 2.
> No `~/.pi/aura/digest.json`, no temp dir, no `raw.json`/`report.json`.

## Current state (after tasks 1 + 2)

- `fetchAction()` in `@pi-aura/shared/digest/aura-digest.ts` builds the
  `digest`/`report`/`raw` objects **in memory**, then writes `raw.json` +
  `digest.json` + `report.json` to a temp dir (`/tmp/aura-morning-<hex>/`),
  calls `writeDashboardDigest(digest, DASHBOARD_DIGEST_PATH)` (writes
  `~/.pi/aura/digest.json`), and returns `void` (CLI contract: stdout
  `output directory: <dir>/`). It uses `readDashboardUrl()` +
  `createProgressEmitter` for the live tree (batched HTTP POSTs to the
  dashboard's `/api/state`).
- `digest-fetch` tool (`index.ts`) spawns the CLI via `runAuraDigest(["fetch"])`,
  parses `output directory:` from stdout, reads `digest.json`+`report.json`
  from the temp dir, returns `{digest, report}` + `details.dir`.
- `digest-save` tool spawns `runAuraDigest(["save", dir])`; `saveAction` reads
  `<dir>/digest.json` to write `~/.pi/aura/last-digest.json`.
- `store.ts` (task 2) exposes `setCurrentDigest`, `pushEvent`, `subscribe`,
  `getEvents`, `resetStore`. The server serves `/api/digest` from
  `getCurrentDigest()` and `/events` SSE from `pushEvent`.

## Fog resolutions (the design decisions)

1. **`fetchAction` returns the object, not writes files.** Refactor
   `fetchAction` to return `{ digest, report, raw }` and stop writing the temp
   dir + `~/.pi/aura/digest.json`. The CLI shim (task 5 deletes it; this task
   keeps it working) adapts: it calls `fetchAction()`, writes the files itself
   (preserving the CLI's `output directory:` stdout + temp-dir behavior), so
   the CLI path stays green. **The core becomes a pure function.**
2. **No temp dir / `raw.json` / `report.json` in-process.** `digest-fetch`
   calls `fetchAction()` directly and gets the object; it does not create a
   temp dir or read files. `details.dir` is dropped from the tool result.
3. **`onProgress` → `pushEvent` directly (no `createProgressEmitter`).** The
   scheduler's `onProgress` emits `ProgressEvent`
   (`{id,label,parentId,status,startedAt,endedAt,kind}`). The extension owns a
   small adapter that translates each `ProgressEvent` into a `progress`
   `StateEvent` (`{id,ts,dir:"agent→page",type:"progress",payload:<ProgressEventLike>}`)
   and calls `store.pushEvent(...)`. **No batching** (the in-memory push has no
   network cost); coalescing instant open→done is nice-to-have but NOT
   required — keep the adapter simple (1 event = 1 push). `createProgressEmitter`
   + `readDashboardUrl`-for-fetch become dead in the core; this task stops
   calling them from `fetchAction`. (Removing `createProgressEmitter` itself
   is slice-scope; see below.)
4. **`setCurrentDigest` populates the dashboard.** `digest-fetch` calls
   `store.setCurrentDigest(digest)` after `fetchAction` returns — this ends
   the task-2 regression (the dashboard's `/api/digest` serves it; the
   `'change'` SSE fans out and the browser re-fetches).
5. **`details.dir` → `digest-save` handoff is reworked.** This couples to
   task 4. **Decision:** this task changes `digest-fetch`'s result to return
   the `digest` object (not a `dir`), and `digest-save` (task 4) is updated
   to save the **in-memory current digest** to `last-digest.json` (no `dir`
   param). To keep the tree green *between* task 3 and task 4, `digest-save`
   must still work — so this task keeps `digest-save` spawning the CLI
   `saveAction` but **also** writes `<dir>/digest.json` is no longer
   possible (no temp dir). Resolution: this task updates `digest-save` to
   read the digest from the **in-memory store** (`getCurrentDigest`) and
   write `last-digest.json` directly (a small, in-scope tweak to keep
   `digest-save` working without a temp dir), OR keeps `saveAction` callable
   with the in-memory digest. **Chosen:** `digest-save` in this task writes
   `last-digest.json` from `getCurrentDigest()` in-process (no spawn); the
   CLI `saveAction` stays for the CLI path (task 5 deletes it). This pulls a
   small piece of task 4 forward, but it's necessary to keep `digest-save`
   functional after the temp dir disappears. Task 4 then owns `digest-log` +
   the final `digest-save` polish.

## Slice split (3 slices, sequential)

### Slice 1 — `fetchAction-returns-object` (size m)
**Make `fetchAction` a pure function that returns `{digest, report, raw}`.**
No behavior change to the CLI (the shim takes over file-writing).

- `fetchAction()` → `fetchAction(): Promise<{digest: Digest; report: AuraReport; raw: RawAuraData}>`.
  Stop writing `raw.json`/`digest.json`/`report.json` to a temp dir; stop
  `writeDashboardDigest` to `~/.pi/aura/digest.json`; stop the
  `console.log("output directory: ...")`. Build + return the object.
- **`onProgress` parameter:** add an optional `onProgress?: (e: ProgressEvent) => void`
  param to `fetchAction`. The core passes it to `runTasks`'s `onProgress`
  (replacing `progressHook`). When `onProgress` is undefined (the CLI shim
  path, which still wants the live tree via HTTP), the core passes a no-op —
  OR the shim supplies its own emitter. **Chosen:** `fetchAction` takes
  `onProgress?`; the CLI shim constructs the progress emitter (it still has
  `readDashboardUrl` + `createProgressEmitter`) and passes it as `onProgress`,
  preserving the CLI's live-tree behavior. The in-process caller (task's
  slice 2) passes the store-adapter. This keeps the core side-effect-free.
- Stop calling `readDashboardUrl`/`createProgressEmitter` *inside* `fetchAction`
  — move that to the callers. (`createProgressEmitter` stays exported from
  `@pi-aura/shared/digest/progress-emitter` for the CLI shim's use this task;
  task 5 deletes it with the CLI.)
- **CLI shim** (`scripts/src/aura-digest.ts`): update `main()`'s `fetch` case
  to call `fetchAction({ onProgress: createProgressEmitter(readDashboardUrl()) })`,
  then write the temp-dir files + `~/.pi/aura/digest.json` itself (the logic
  `fetchAction` used to do), then print `output directory: <dir>/`. The CLI
  behaves identically. (This keeps `aura-digest.mjs` green until task 5.)
- Tests: `fetchAction` is currently tested via the CLI bundle / not directly.
  Add/adjust tests in `packages/shared/test/digest/` asserting `fetchAction`
  returns the object with a mocked `createDefaultAuraClient`. (Mocking the
  Aura client is the seam — inject a fake; see `docs/testing.md` Mock
  conventions.) The shared `tsx --test` suite gains a `fetchAction` test.
- **Green check:** CLI `aura-digest.mjs fetch` still produces byte-identical
  output (the shim writes the same files). Shared typecheck + the new
  `fetchAction` test green. Root vitest green.

### Slice 2 — `digest-fetch-in-process` (size m)
**`digest-fetch` calls `fetchAction` in-process; wires `onProgress` → store; populates `setCurrentDigest`.**

- `digest-fetch` `execute`: import `fetchAction` from
  `@pi-aura/shared/digest/aura-digest`. Call it with an `onProgress` adapter
  that translates each `ProgressEvent` → a `progress` `StateEvent` and calls
  `store.pushEvent(stateEvent)`. No `runAuraDigest(["fetch"])`, no spawn,
  no stdout parsing. After it returns, `store.setCurrentDigest(result.digest)`.
  Return `{digest, report}` as the tool text; `details` drops `dir` (no temp
  dir). Keep the "dashboard was down" one-shot warning logic but base it on
  `getDashboardUrl() === null` (already does post-task-2) — actually, with
  in-process + `setCurrentDigest`, the dashboard is populated regardless;
  the warning becomes "no live tree shown" only if the server isn't running
  (events won't fan out). Keep the warning semantics sensible.
- The `onProgress`→`pushEvent` adapter: lives in `index.ts` (or `store.ts`).
  `ProgressEvent` → `StateEvent` shape: `{ id: e.id, ts: new Date().toISOString(), dir: "agent→page", type: "progress", payload: { id, label, parentId, status, startedAt, endedAt, kind } }` (matches the `ProgressPayload` the Svelte view expects — check `digest-types.ts` `ProgressPayload`). The store assigns the monotonic `id` (overwriting the `id:0`), so the adapter passes `id: 0` (or the event's id — store ignores it).
- Drop `runAuraDigest`'s `fetch` path (keep `save` until slice 3 / task 4).
  `resolveAuraDigestScriptPath` + `spawn` stay for `digest-save` this slice.
- Tests: rewrite `fetch-save-tools.test.ts`'s fetch tests to mock
  `createDefaultAuraClient` (inject a fake `AuraClient` into `fetchAction`
  — check how `fetchAction` constructs it; it calls `createDefaultAuraClient`
  internally, so the seam is mocking `createDefaultAuraClient` via module
  mock, OR refactoring `fetchAction` to accept an `AuraClient` param. **Decide
  in the slice:** prefer injecting an `auraClient?` param into `fetchAction`
  (optional; defaults to `createDefaultAuraClient()`) so tests pass a fake
  without module mocking — cleaner. Record this.). Assert: no spawn; events
  pushed to the store; `setCurrentDigest` called; tool returns the object.
- **Green check:** `digest-fetch` runs in-process (mocked); events flow to
  the store + SSE; `setCurrentDigest` populates the dashboard (ends the
  regression). No `digest.json` written. Full suite + typecheck green.

### Slice 3 — `drop-digest-json-and-rework-save` (size s)
**Drop `~/.pi/aura/digest.json` + the temp dir; rework `digest-save` to use the in-memory digest.**

- `fetchAction` already returns the object (slice 1) and doesn't write
  `digest.json` (slice 1 removed `writeDashboardDigest`). Confirm no
  `~/.pi/aura/digest.json` write path remains in the core or the in-process
  tool. The CLI shim (slice 1) still writes it for the CLI path — that's
  fine until task 5.
- `digest-save`: rewrite to write `last-digest.json` from
  `store.getCurrentDigest()` in-process (no spawn, no `dir` param). Drop the
  `saveToolParameters` `dir` field; the tool takes no params (or ignores
  `dir`). Import a small `saveLastDigest(digest)` helper (either in the
  shared core, exported alongside `fetchAction`, or in the extension). Keep
  the CLI `saveAction` for the CLI path (task 5 deletes it).
- Update the `digest-save` tool description + the `aura-digest` skill doc if
  it references `details.dir` (audit `skills/core/aura-digest/aura-digest.md`
  for the fetch→save handoff prose; update it to "digest-save saves the
  current in-memory digest" — but keep changes minimal and in-scope; a full
  skill-doc rewrite is task 5).
- Drop `runAuraDigest`'s `save` path + `resolveAuraDigestScriptPath` + the
  `spawn` import from `index.ts` if nothing else uses it. (digest-fetch no
  longer spawns; digest-save no longer spawns.) `runAuraDigest` becomes dead
  — remove it.
- Tests: `digest-save` tests rewritten to assert `last-digest.json` is
  written from `getCurrentDigest()`; no spawn. `fetch-save-tools.test.ts`
  updated (no `dir` handoff).
- **Green check:** no `~/.pi/aura/digest.json` from the in-process path; no
  temp dir; `digest-save` works from the in-memory digest; `runAuraDigest`
  gone; full suite + typecheck green. CLI `aura-digest.mjs` still works
  (the shim + CLI `saveAction` untouched).

## Existing abstractions to use

- `fetchAction` (now importable) — refactor to return the object + take
  `onProgress?` + optional `auraClient?`.
- `store.pushEvent` / `setCurrentDigest` (task 2) — the in-memory seam.
- `runTasks`'s `onProgress: (e: ProgressEvent) => void` — unchanged.
- `createProgressEmitter` (CLI shim uses it for HTTP live tree; core no
  longer calls it).
- `ProgressPayload` (digest-types.ts) — the `onProgress`→`StateEvent` payload
  shape must match what the Svelte view renders.

## Do NOT (out of scope — other tasks)

- Rewire `digest-log` to direct `pushEvent` (task 4 — keep its HTTP POST).
- Delete the `aura-digest` CLI bundle / `scripts/esbuild.config.mjs` /
  `scripts/src/aura-digest.ts` shim (task 5). The shim stays functional.
- Touch the server lifecycle / store backing (task 2 — done).
- Change the digest data model, the Svelte view, or the Aura client.

## Seams (boundaries under test)

1. **Pure-function seam:** `fetchAction` returns `{digest, report, raw}` with
   a mocked `AuraClient`; writes no files.
2. **In-process-fetch seam:** `digest-fetch` calls `fetchAction` in-process;
   `onProgress` → `pushEvent` (progress StateEvents flow to the store/SSE);
   `setCurrentDigest(digest)` populates the dashboard; no spawn.
3. **No-disk seam:** no `~/.pi/aura/digest.json`, no temp dir, no `raw.json`/
   `report.json` from the in-process path.
4. **Save-from-memory seam:** `digest-save` writes `last-digest.json` from
   `getCurrentDigest()`; no `dir`; no spawn.
5. **Determinism seam:** the `digest` object (dev_links order, reviews_owed,
   warnings) is byte-identical to the CLI path (same `fetchAction` core).

## Interface contract for task 4 (`in-process-log-save`)

After this task:
- `store.pushEvent` is the event seam (task 4 wires `digest-log` to call it
  directly instead of HTTP-POSTing).
- `store.setCurrentDigest` / `getCurrentDigest` exist (task 4's `digest-save`
  polish uses them; this task stands up the save-from-memory path).
- `digest-log` still HTTP-POSTs to `/api/state` (task 4 rewires it) —
  confirm not prematurely rewired.

## Baseline (on task/in-process-fetch off develop)

- ext/shared/scripts typecheck: green · shared `tsx --test`: 188 · root vitest: 19 files / 201 tests
- CLI exit codes: 2/2/0 · extension build: vite-only (no server.mjs)
