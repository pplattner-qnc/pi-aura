---
kind: task
type: feature
slug: in-process-fetch
title: digest-fetch calls fetchAction in-process with onProgress wired to the in-memory stream
map: in-process-aura-digest
status: ready
blocked_by: [core-move, in-process-server]
slices: [1-fetchAction-returns-object, 2-digest-fetch-in-process, 3-drop-digest-json-and-rework-save]
---

## User-visible outcome

`digest-fetch`'s `execute` calls `fetchAction()` directly (in-process, on the
main event loop) with an `onProgress` callback the extension wires to push
events into the in-memory stream + SSE — no spawned child, no
`aura-digest.mjs`, no HTTP self-POST. The live progress tree streams to the
browser as the fetch runs (the behavior `digest-live-progress-tree` built,
now without the cross-process hop). The digest is held in memory (task 2's
server serves it); `~/.pi/aura/digest.json` is **not** written.

## Scope boundaries

- In: `digest-fetch` `execute` calls `fetchAction()` in-process;
  `onProgress` → in-memory event push + SSE fan-out (no HTTP); the in-memory
  current digest is populated from `fetchAction`'s return; drop `digest.json`
  and the temp dir / `raw.json` if `fetchAction` can return the object
  directly (decide in a slice); the `details.dir` → `digest-save` handoff is
  reworked (couples to task 4).
- Out: the server lifecycle (task 2), the log/save rewiring (task 4), CLI
  deletion (task 5), the Aura client, the digest data model.

## Acceptance criteria

- `digest-fetch` spawns no child; calls `fetchAction()` in-process; returns
  the digest/report object directly (no stdout parsing).
- `progress` events flow to the browser via the in-memory stream + SSE
  (the live tree renders), verified end-to-end with task 2's server up.
- No `~/.pi/aura/digest.json` is written. No temp dir / `raw.json` unless a
  slice decides otherwise (record the decision).
- Determinism: the digest (dev_links order, reviews_owed, warnings) is
  byte-identical to today.
- All tests pass; the `digest-fetch` tests are rewritten to call
  `fetchAction` with a mocked `createDefaultAuraClient` (no `child_process.spawn` mock).

## Existing abstractions to use

- `fetchAction` (now importable after task 1) — call it; pass an `onProgress`
  that the extension owns.
- `createProgressEmitter` — likely dissolves: the emitter's job (batch +
  POST) becomes a direct in-memory push (no HTTP). Decide in a slice whether
  batching is still needed (the in-memory push has no network cost).
- The scheduler's `onProgress` hook (unchanged).

## Slice intent (planned in a later pass)

- Likely: (a) `fetchAction` returns the object directly (no stdout/temp
  dir); (b) `digest-fetch` calls it in-process + wires `onProgress` to the
  in-memory push; (c) drop `digest.json` + the temp dir; (d) rework the
  fetch→save handoff (with task 4).
- Fog resolved here: `last-digest.json` write path; `details.dir`
  handoff; whether `createProgressEmitter` survives.

## Implementation notes

### slice 1 — fetchAction-returns-object

`fetchAction` now returns `{digest, report, raw}` and takes `onProgress?`/`auraClient?`; it writes no files. `DASHBOARD_DIGEST_PATH` is exported. `createProgressEmitter`/`readDashboardUrl` moved to the CLI shim (still exported). The shim writes the temp-dir files + `~/.pi/aura/digest.json` + stdout, byte-identical to before. `meta.raw_path`/`report_path`/`report.raw_path` are left as empty strings by the pure function and filled in by the shim after it creates the temp dir. New `fetchAction.test.ts` injects a mocked `auraClient` and asserts no files are written. No CLI behavior change.

### slice 2 — digest-fetch-in-process

`digest-fetch` `execute` now calls `fetchAction()` in-process (no spawn, no stdout parsing, no temp dir, no `~/.pi/aura/digest.json`). An `onProgress` adapter (`adaptProgressToStore`) wraps each scheduler `ProgressEvent` as a `progress` `StateEvent` (`dir:"agent→page"`, `type:"progress"`, payload matching `ProgressPayload` in `digest-types.ts`) and calls `store.pushEvent`; no batching (1 event = 1 push). After `fetchAction` returns, `setCurrentDigest(result.digest)` populates the in-memory current digest — ending the task-2 empty-dashboard regression (`/api/digest` serves it; `'change'` SSE fans out). Tool returns `{digest, report}` with `details: {}` (`dir` dropped). The dashboard-absent one-shot warning is preserved (based on `getDashboardUrl() === null`), guarded with `if (ctx.ui)` for robustness. **Test-injection seam:** chose module-scope `let injectedAuraClient` + `_setAuraClientForTesting(client)` setter (passes the fake to `fetchAction({ auraClient })`) over `vi.mock` of `createDefaultAuraClient`, per `docs/testing.md`'s avoid-module-mocking guidance. `runAuraDigest`/`resolveAuraDigestScriptPath`/`spawn` kept for `digest-save` (slice 3 removes them). `fetch-save-tools.test.ts` rewritten: fetch tests inject a fake `AuraClient`; spawn mock kept only for `digest-save`; 15s timeouts on dashboard+fetchAction tests. digest-log unchanged (task 4).
