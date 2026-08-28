---
kind: task
type: feature
slug: in-process-server
title: Replace the detached dashboard server child with an in-process http.Server the extension owns
map: in-process-aura-digest
status: ready
blocked_by: [core-move]
slices: []
---

## User-visible outcome

`digest-dashboard-start` creates an in-process `http.Server` (handle held in
the extension's module scope) and opens the browser to its URL. There is no
spawned child process, no `~/.pi/aura/server-url.json`, and no `state.json`
pid field. `digest-dashboard-stop` and `session_shutdown` close the server
deterministically (`server.close()`). The orphan / stale-`server-url.json` /
stale-pid bug class becomes structurally impossible.

The browser still talks HTTP/SSE — protocol unchanged (`/api/digest`,
`/api/state`, `/events` SSE) — but the server's backing store is in-memory
(the current digest + the event stream), not files. (The fetch/save rewiring
that *populates* the in-memory digest is task 3; this task stands up the
in-memory server and serves whatever it holds.)

## Scope boundaries

- In: the in-process `http.Server` (start/stop lifecycle, module-scope
  handle); delete `server-url.json` + the `state.json` pid field +
  `waitForServerUrl` + `terminateProcess` + `isProcessAlive` + the
  `readDashboardUrl`-for-the-server path; the server reads/serves the
  in-memory digest + events; `digest-dashboard-start`/`-stop` rewritten.
- Out: the fetch rewiring (task 3), log/save rewiring (task 4), CLI deletion
  (task 5). The `digest-fetch` tool still runs the (moved) core's
  `fetchAction` however it does today during this task — only the *server*
  changes here.

## Acceptance criteria

- `digest-dashboard-start` returns a reachable URL served by an in-process
  `http.Server`; no child process is spawned; no `server-url.json` written.
- `digest-dashboard-stop` and `session_shutdown` close the server
  deterministically; no orphan process can remain.
- The server serves `/api/digest` (from in-memory current digest) and
  `/events` SSE (fanning out in-memory event pushes). `/api/state` POST
  appends to the in-memory event stream.
- The orphan + stale-file lifecycle bugs are gone: no `server-url.json` to
  go stale, no pid to reap, no detached child to outlive pi.
- All existing tests pass (start/stop/server/state tests rewritten to the
  in-process shape); typecheck + build green.

## Existing abstractions to use

- `server.ts`'s `startServer` (request handlers, SSE) — reuse the handler
  logic, drop the `writeFileSync(server-url.json)` + pid bookkeeping.
- `state.ts`'s `appendEvent` write queue (serialization) — keep the
  serialization semantics, back it with the in-memory array instead of a
  file (or keep `state.json` events-only on disk if a slice decides the SSE
  substrate needs it; the pid field is dropped regardless).

## Slice intent (planned in a later pass)

- Likely: (a) in-process server + module-scope handle + start/stop; (b)
  in-memory digest/events backing + `/api` + SSE; (c) delete discovery
  files + dead-code sweep of `waitForServerUrl`/`terminateProcess`.
