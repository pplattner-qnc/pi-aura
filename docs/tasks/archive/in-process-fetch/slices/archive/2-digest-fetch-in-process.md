---
kind: slice
slug: digest-fetch-in-process
title: digest-fetch calls fetchAction in-process; onProgress → store.pushEvent; setCurrentDigest populates dashboard
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: [fetchAction-returns-object]
---

## End-to-end behavior

`digest-fetch`'s `execute` calls `fetchAction()` directly (in-process, no
spawn) with an `onProgress` adapter that pushes `progress` events into the
in-memory store (`store.pushEvent`), and calls `store.setCurrentDigest(digest)`
on success — ending the task-2 empty-dashboard regression (the dashboard's
`/api/digest` serves the digest; the `'change'` SSE fans out). No
`aura-digest.mjs` spawn, no stdout parsing, no temp dir. The live progress
tree streams to the browser via the in-memory SSE.

## What this slice delivers

- `digest-fetch` `execute`: import `fetchAction` from `@pi-aura/shared/digest/aura-digest`. Call `fetchAction({ onProgress: adaptToStore })` where `adaptToStore` translates each `ProgressEvent` → a `progress` `StateEvent` and calls `store.pushEvent(stateEvent)`. No `runAuraDigest(["fetch"])`. After it returns, `store.setCurrentDigest(result.digest)`. Return `{digest, report}` as the tool text; `details` drops `dir` (no temp dir). Keep a sensible "dashboard not running" warning (events won't fan out if the server is down — base on `getDashboardUrl() === null`).
- The `onProgress`→`pushEvent` adapter: `ProgressEvent` → `StateEvent` shape `{ id: 0, ts: new Date().toISOString(), dir: "agent→page", type: "progress", payload: { id: e.id, label: e.label, parentId: e.parentId, status: e.status, startedAt: e.startedAt, endedAt: e.endedAt, kind: e.kind } }` — the `payload` must match `ProgressPayload` in `digest-types.ts` (verify the shape). The store assigns the monotonic `id` (overwrites `0`). No batching (1 event = 1 push). Lives in `index.ts` (or `store.ts` — your call).
- Drop `runAuraDigest`'s `fetch` path. `resolveAuraDigestScriptPath` + `spawn` + `runAuraDigest` stay for `digest-save` this slice (slice 3 / task 4 removes them).
- Tests: rewrite `fetch-save-tools.test.ts`'s fetch tests to inject a fake `AuraClient` via `fetchAction({ auraClient: fake })` (the seam slice 1 added). Assert: no spawn; `progress` events pushed to the store (inspect `store.getEvents()` or subscribe); `setCurrentDigest` called (assert `store.getCurrentDigest()` is the digest); tool returns the object. No `digest.json` written.
- Verify the Svelte view's `ProgressPayload` (digest-types.ts) matches the adapter's payload shape — if not, adjust the adapter (not the view).

## Acceptance criteria

- `digest-fetch` spawns no child; calls `fetchAction()` in-process; returns the digest/report object (no stdout parsing); `details.dir` gone.
- `progress` events flow to the store + SSE (the live tree renders); `setCurrentDigest(digest)` populates the dashboard (ends the task-2 regression).
- No `~/.pi/aura/digest.json` written by the in-process path.
- Fetch tests rewritten to mock `createDefaultAuraClient` (via the `auraClient?` seam); full vitest + typecheck green.

## Test plan

- `fetch-save-tools.test.ts` fetch path: inject fake `auraClient`; assert `store.getEvents()` has the `progress` events in order; `store.getCurrentDigest()` is the returned digest; no spawn mock, no `digest.json` on disk.
- A SSE test: a connected `/events` client receives the `progress` `state-change` events during a (mocked) fetch.
- Full vitest + typecheck green.

## Constraints and dependencies

- Blocked by slice 1 (`fetchAction` must return the object + take `onProgress`/`auraClient`).
- Do NOT rewire `digest-log` (task 4 — keep HTTP POST).
- Do NOT rework `digest-save` (slice 3 — keep its spawn path this slice).
- Do NOT delete the CLI shim/bundle (task 5).
- Do NOT change the Svelte view; match its `ProgressPayload` shape in the adapter.
