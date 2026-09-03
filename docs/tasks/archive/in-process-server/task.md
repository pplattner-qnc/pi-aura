---
kind: task
type: feature
slug: in-process-server
title: Replace the detached dashboard server child with an in-process http.Server the extension owns
map: in-process-aura-digest
status: done
blocked_by:
- core-move
slices:
- 1-lifecycle-in-process
- 2-backing-in-memory
- 3-dead-code-and-bundle-sweep
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

## Implementation notes

_The land-worker appends a per-slice note here as each slice lands._

### Slice 1 — lifecycle-in-process (landed)

- In-process `serverHandle = {server, port, url, done}` held in module scope;
  `getDashboardUrl()` returns `serverHandle?.url ?? null`.
- `startDashboard` rewritten: calls `startServer` in-process (imported from
  `./server.ts`), stores the result in `serverHandle`. No spawn, no unref, no
  `writePid`, no `waitForServerUrl`, no `resolveServerEntryPath`. Opens the
  browser to `serverHandle.url`. "Already running" check is
  `serverHandle !== null`.
- `teardownDashboard` rewritten: calls `serverHandle.done()` (closes the
  server + watchers), stops the listener, deletes `state.json`, sets
  `serverHandle = null`. Signature changed from `(statePath, serverUrlPath)`
  to `(statePath)` — no `server-url.json` to delete.
- `server.ts` `startServer`: stopped writing `server-url.json` (dropped the
  `writeFileSync` + `serverUrlPath` option). Handlers unchanged (still
  file-backed).
- `digest-fetch`/`digest-log` switched from `readDashboardUrl()` to
  `getDashboardUrl()`.
- Deleted dead lifecycle code: `spawn`-of-server child, `unref`,
  `waitForServerUrl`, `isProcessAlive`, `terminateProcess`, `deleteFiles`,
  `resolveServerEntryPath`, the orphan-reap branch, `readState`/`writePid`
  imports.
- `runAuraDigest`'s CLI spawn KEPT (task 3 rewires it).
- Backing still file-backed this slice (slice 2 moves it in-memory).
- `writePid`/`clearPid` remain exported from `state.ts` but unused (slice 3
  removes them).
- `dist/server.mjs` rebuilt to reflect `server.ts` source change (slice 3
  deletes the bundle).

### Slice 2 — backing-in-memory (landed)

- New `store.ts` module owns the in-memory backing: `currentDigest: unknown |
  null`, `events: StateEvent[]`, `nextEventId` (monotonic, server-assigned),
  `sseClients: Set<ServerResponse>`, `subscribers: Set<(e) => void>`.
- Store API (the seam task 3/4 calls):
  - `setCurrentDigest(d: unknown | null): void` — sets `currentDigest` +
    fans out a `'change'` SSE event to all SSE clients (the browser re-fetches
    `/api/digest` on `'change'`, matching the old `fs.watch` on `digest.json`).
  - `getCurrentDigest(): unknown | null` — returns `currentDigest` (null when
    unset; `/api/digest` returns 404).
  - `pushEvent(event: StateEvent): void` — assigns `event.id = nextEventId++`
    (overwriting client-supplied id, like `appendEvent` did), pushes to
    `events`, writes `'event: state-change\ndata: {"id":<id>,"type":"<type>"}\n\n'`
    to each SSE client, calls each subscriber.
  - `subscribe(cb): () => void` — adds to `subscribers`, returns unsubscribe.
  - `registerSseClient(res): () => void` — adds `res` to `sseClients`, returns
    a removal fn (called on `req 'close'`).
  - `resetStore(): void` — clears everything (called in `teardownDashboard` +
    tests).
- `server.ts` `startServer`: `StartServerOptions` now only has
  `openBrowser`/`browserOpener` (dropped `dashboardPath`/`statePath`).
  `/api/digest` GET → `getCurrentDigest()` (404 if null, 200+JSON otherwise — no
  file read). `/events` SSE → `registerSseClient(res)` + unregister on
  `req 'close'` (no `fs.watch`). `/api/state` POST → `pushEvent(parsed)` (no
  file write). The shell route (GET `/`) unchanged. `done()` just closes the
  server (no watchers). Self-run entry block kept (slice 3 removes it);
  `startServer()` call there dropped `dashboardPath`/`statePath`.
- `listener.ts`: rewritten to subscribe to `store.subscribe`. On each event,
  if `dir === "page→agent"` and `type === "action_click"` and the payload is
  an `ActionClickPayload`, `pi.sendMessage(...)`. `ListenerOptions` now only
  has `{ pi }` (dropped `statePath`/`pollIntervalMs`). `stop()` unsubscribes.
  `isActionClickPayload` kept. No `fs.watch`, no polling, no cursor.
- `index.ts`: `startDashboard` no longer destructures `dashboardPath`/
  `statePath` for `startServer`/`startListener` (they no longer take them).
  `teardownDashboard` calls `resetStore()` after closing the server + listener
  (clean slate for a fresh start). Still deletes `state.json` best-effort
  (may linger from a pre-slice-2 session).
- `state.ts`: `StateEvent`/`AckPayload`/`UpdateViewPayload` types kept.
  `readState`/`appendEvent`/`writePid`/`clearPid`/`EMPTY_STATE`/`StateFile`/
  `writeQueues` remain exported but are now dead code (slice 3 removes them).
  No imports of these from `server.ts`/`listener.ts`/`index.ts`.
- `digest-log`: unchanged — still HTTP-POSTs to `/api/state`, which now
  `pushEvent`s in-memory. `log-tool.test.ts` passes unchanged.
- Accepted regression: `/api/digest` returns 404 until task 3 calls
  `setCurrentDigest`. `digest-fetch` still writes `~/.pi/aura/digest.json` on
  disk, but `/api/digest` reads the in-memory store, not that file.

### Slice 3 — dead-code-and-bundle-sweep (landed — LAST slice)

- Deleted `dist/server.mjs` + extension `esbuild.config.mjs` (the server
  bundle config); `npm run build` is now vite-only (`vite build`) producing
  `dist/app.js` + `dist/app.css` only. Extension loads `./index.ts` from source.
- Removed root `.gitignore` `server.mjs` keep-exception line.
- `server.ts`: self-run entry block removed (process.argv[1] check, signal/exit
  cleanup, `defaultAuraPaths`); removed now-unused imports (`rmSync`, `os`).
  Now a pure library module exporting `startServer` + `openBrowser`.
- `state.ts`: removed `writePid`/`clearPid`/`readState`/file `appendEvent`/
  `EMPTY_STATE`/`StateFile`/`writeQueues`/`ensureDir`/`enqueue`; removed now-unused
  imports (`mkdirSync`/`readFileSync`/`writeFileSync`/`existsSync`/`path`). Kept
  `StateEvent`/`AckPayload`/`UpdateViewPayload` types (now a pure type module).
- `progressTree.ts` confirmed NOT dead (imported by `Digest.svelte`); only its
  comments referencing `StateFile` were updated to "an events array". `store.ts`
  comment updated. `index.ts` comment updated (no `writePid` reference).
- Test comments updated in `start.test.ts`, `log-tool.test.ts`,
  `DigestTree.test.ts` (local `stateFile()` helper kept — not an import).
- New `test/digest-dashboard/dead-code-sweep.test.ts` (20 structural tests).
- All 3 slices of in-process-server now landed; task ready for finalize.
