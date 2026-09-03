---
kind: slice
slug: backing-in-memory
title: Move the server backing store to in-memory (digest/events/SSE); rewire listener to subscribe
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: [lifecycle-in-process]
---

## End-to-end behavior

The dashboard's backing store moves from disk to **in-memory**: `/api/digest`
serves a module-scope `currentDigest`, `/events` SSE fans out a module-scope
`pushEvent` stream, `/api/state` POST appends in-memory, and the listener
subscribes to the in-memory stream (no `fs.watch` on `state.json`). **Accepted
transitional regression:** `/api/digest` returns 404/empty until task 3
(`in-process-fetch`) populates `currentDigest` — the digest *output* stays
byte-identical; the dashboard just can't display it between task 2 and task 3.
No `state.json` is written.

## What this slice delivers

- In-memory backing (module-scope in `index.ts` or a new small `store.ts`):
  `currentDigest: unknown | null`, `events: StateEvent[]`, `sseClients:
  Set<ServerResponse>`, a monotonic `nextEventId`, `pushEvent(event)` (append +
  fan out to SSE clients + notify subscribers), `subscribe(cb): unsubscribe`,
  and `setCurrentDigest(d)` (the seam task 3 calls).
- `server.ts` `startServer`: handlers read/write the in-memory store. `/api/
  digest` → `currentDigest` (404 if null). `/events` SSE → register response
  in `sseClients`; on `pushEvent`, write to each. `/api/state` POST →
  `pushEvent`. Drop `dashboardPath`/`statePath` options, `appendEvent` (file),
  `fs.watch` watchers.
- `listener.ts`: subscribe to the in-memory `pushEvent` stream for
  `action_click` → `pi.sendMessage`. Drop `fs.watch` on `state.json` + the
  readState cursor. Keep the `ListenerHandle` API.
- `state.ts`: stop calling file-write `appendEvent`/`readState`/`writePid`/
  `clearPid`. Keep `StateEvent` types. Slice 3 removes the dead file
  functions; this slice just stops using them.
- `digest-log`: unchanged from slice 1 (still HTTP-POSTs to the in-process
  server's `/api/state`, which now appends in-memory). Task 4 replaces the
  HTTP POST with a direct `pushEvent` call.
- Expose `pushEvent` + `setCurrentDigest` clearly for task 3; record their
  exact shape in the implementation notes.

## Acceptance criteria

- `/api/digest` serves the in-memory `currentDigest` (404 when null); no file read.
- `/events` SSE receives `pushEvent` fan-out; `/api/state` POST appends
  in-memory + fans out; no `state.json` written.
- The listener forwards `action_click` from the in-memory stream (not
  `fs.watch`); `pi.sendMessage` fires on a pushed `action_click`.
- `server.test.ts`/`state.test.ts`/`listener.test.ts` rewritten to the
  in-memory shape; full vitest + typecheck green.
- (Accepted regression) `/api/digest` is empty until task 3 — assert it 404s
  when no digest is set, and serves when `setCurrentDigest` is called.

## Test plan

- `server.test.ts`: `/api/digest` 404 when `currentDigest=null`; 200 + body
  after `setCurrentDigest(d)`. `/events` SSE receives a `pushEvent`. `/api/state`
  POST → in-memory event, fanned to SSE clients.
- `state.test.ts`: `pushEvent` assigns monotonic ids + fans out; no file write.
- `listener.test.ts`: `subscribe` callback fires on a pushed `action_click` →
  `pi.sendMessage`; `stop()` unsubscribes.
- Full vitest + typecheck green.

## Constraints and dependencies

- Blocked by slice 1 (lifecycle must be in-process first).
- Do NOT populate `currentDigest` from a real fetch (task 3).
- Do NOT rewire `digest-log`/`digest-save` to direct calls (task 4).
- Do NOT delete the dead file functions in `state.ts` (slice 3).
