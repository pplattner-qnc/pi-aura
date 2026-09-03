# Architecture spec — `in-process-server`

> Replace the detached dashboard server child with an in-process `http.Server`
> the extension owns. No spawned child, no `server-url.json`, no `state.json`
> pid field. The orphan/stale-file bug class becomes structurally impossible.
> This is task 2 of 5 in the `in-process-aura-digest` map.

## Current architecture (what's being replaced)

- `index.ts` `startDashboard` spawns `dist/server.mjs` as a detached child
  (`spawn({detached:true,stdio:'ignore'})` + `unref()`), writes the child's pid
  to `state.json` (`writePid`), and polls `waitForServerUrl` for the child to
  write `~/.pi/aura/server-url.json` (`{url, pid}`), matching `pid === child.pid`.
- `teardownDashboard` reads the pid from `state.json`, `terminateProcess`-es it
  (SIGTERM→SIGKILL + reap poll), deletes `state.json` + `server-url.json`.
- `server.ts` `startServer` binds a port, writes `server-url.json`, serves
  `/api/digest` (reads `~/.pi/aura/digest.json` from disk), `/events` SSE
  (`fs.watch` on `digest.json` + `state.json`), `/api/state` POST (`appendEvent`
  → `state.json`). It has a self-run entry (bottom block) for running as the
  detached child, with signal/exit cleanup that deletes the discovery files.
- `listener.ts` `fs.watch`-es `state.json` for `action_click` events → `pi.sendMessage`.
- `digest-fetch`/`digest-log` find the server via `readDashboardUrl()` (reads
  `server-url.json`) + HTTP POST to `/api/state`.

## Target architecture (this task)

- `index.ts` holds a **module-scope server handle** (`{ server, port, url }`).
  `digest-dashboard-start` calls `startServer` **in-process** (no spawn), stores
  the handle, opens the browser. `digest-dashboard-stop`/`session_shutdown`
  call `server.close()` — deterministic, no reap race.
- The server's backing store is **in-memory**: a module-scope current digest
  + an event array + SSE client set. `/api/digest` serves the in-memory digest
  (empty until task 3 populates it), `/events` SSE fans out in-memory event
  pushes, `/api/state` POST appends to the in-memory event stream + fans out.
- The listener subscribes to the in-memory event stream (callback), not
  `fs.watch` on `state.json`.
- `server-url.json` is gone (the handle has the URL). `state.json`'s pid field
  is gone (no child). `readDashboardUrl`-for-the-server is replaced by a
  `getDashboardUrl()` that returns the in-process handle's URL.

## Key design decision (the transient regression)

Per the map's Destination, `/api/digest` serves the **in-memory** current
digest. Task 3 (`in-process-fetch`) is what *populates* it (by calling
`fetchAction` in-process + wiring `onProgress`). So **after this task, the
in-memory digest is empty** — `/api/digest` returns 404/empty until task 3
lands. The dashboard will not show a digest between task 2 and task 3. This is
**intentional and transient**: the map is WIP on `develop` (not `main`), and
each task is a step toward the Destination, not independently shippable to
users. The determinism the map guards is the *digest output* (byte-identical),
not the dashboard's mid-map ability to display it.

The slice split below sequences the change so **each slice leaves the tree
green and the dashboard functional** — except slice 2, which introduces the
empty-digest transitional state by design (and only for events; the digest
display loss is the one accepted regression, scoped to slice 2's "backing
moves to memory" step).

## Slice split (3 slices, sequential)

### Slice 1 — `lifecycle-in-process` (size m)
**Lifecycle in-process; backing still file-based.** No behavior change to the
dashboard — it works exactly as today, but the server runs in-process instead
of as a spawned child.

- `index.ts`: `startDashboard` calls `startServer` in-process (no `spawn`), stores
  the returned `{server, port, url}` in a module-scope `serverHandle`. No
  `writePid` (no child pid). `teardownDashboard` calls `serverHandle.server.close()`
  + stops the listener + deletes `state.json` (events still on disk this slice).
  `session_shutdown` likewise.
- `server.ts` `startServer`: **stop writing `server-url.json`** (the in-process
  caller has the URL from the returned handle). Handlers **unchanged** — still
  read `digest.json` from disk, still `appendEvent` → `state.json`, still
  `fs.watch` for SSE. Drop the `serverUrlPath` option + the `writeFileSync`
  of `server-url.json`. (The self-run entry block stays for now — slice 3
  removes it.)
- `getDashboardUrl(): string | null` — new helper in `index.ts` returning
  `serverHandle?.url ?? null`. `digest-fetch`'s "dashboard was down" check and
  `digest-log`'s URL discovery switch from `readDashboardUrl()` to
  `getDashboardUrl()` (this is the "delete the readDashboardUrl-for-the-server
  path" scope item — the server-discovery mechanism changes here). Remove the
  `readDashboardUrl`/`joinUrl` import from `index.ts` (replaced by
  `getDashboardUrl` + the existing local `joinUrl`... wait, `joinUrl` was
  de-duplicated to shared in core-move slice 3; `digest-log` still uses
  `joinUrl(dashboardUrl, "/api/state")` — keep that import, only replace
  `readDashboardUrl`).
- Delete the now-dead lifecycle code: `spawn` import, `resolveServerEntryPath`,
  `waitForServerUrl`, `isProcessAlive`, `terminateProcess`, the `child`/`pid`
  branches in `startDashboard`/`teardownDashboard`, `writePid` calls. (`writePid`
  /`clearPid` in `state.ts` stay callable but unused this slice; slice 3 removes
  them.)
- Tests: rewrite `start.test.ts`/`stop-tool.test.ts`/`teardown.test.ts` to the
  in-process shape (no spawn mock, no `server-url.json`; assert the handle +
  `server.close`). `server.test.ts`/`state.test.ts`/`listener.test.ts` mostly
  unchanged (still file-backed).
- **Green check:** dashboard starts, serves the digest (file-backed), events
  flow, stop closes it. No `server-url.json` written.

### Slice 2 — `backing-in-memory` (size m)
**Backing store moves to memory.** This is the slice that introduces the
empty-digest transitional state (by design — task 3 populates it).

- New in-memory backing (module-scope in `index.ts` or a small new
  `store.ts`): `currentDigest: unknown | null`, `events: StateEvent[]`,
  `sseClients: Set<Response>`, `nextEventId`, `subscribe(cb): unsubscribe` for
  the listener. A `pushEvent(event)` appends (assigns monotonic id), fans out
  to SSE clients, notifies subscribers.
- `server.ts` `startServer`: handlers read/write the in-memory store, not
  files. `/api/digest` → `currentDigest` (404 if null). `/events` SSE →
  register the response in `sseClients`; on `pushEvent`, write to each client.
  `/api/state` POST → `pushEvent`. Drop `dashboardPath`/`statePath` options,
  `appendEvent` (file), `fs.watch` watchers.
- `listener.ts`: subscribe to the in-memory `pushEvent` stream (callback) for
  `action_click` → `pi.sendMessage`. Drop `fs.watch` on `state.json`.
- `state.ts`: `appendEvent` becomes an in-memory push (or is replaced by
  `pushEvent`); the file-write `appendEvent`/`readState`/`writePid`/`clearPid`
  + `EMPTY_STATE.pid` are dead — slice 3 removes them; this slice stops
  calling them.
- `digest-log`: still HTTP-POSTs to the in-process server's `/api/state` (which
  now appends in-memory). No change to digest-log's call site beyond slice 1's
  `getDashboardUrl`. (Task 4 later replaces the HTTP POST with a direct
  in-memory `pushEvent` call.)
- Tests: rewrite `server.test.ts` (assert `/api/digest` from memory, SSE from
  `pushEvent`, `/api/state` POST → in-memory), `state.test.ts` (in-memory
  events), `listener.test.ts` (subscribe to in-memory stream, no `fs.watch`).
- **Green check (with the accepted regression):** dashboard starts, `/api/digest`
  returns 404 (empty in-memory digest — task 3 fixes), events flow in-memory
  via SSE + listener, stop closes it. No `state.json` written.

### Slice 3 — `dead-code-and-bundle-sweep` (size s)
**Delete the now-dead server bundle + bookkeeping.**

- `server.ts`: delete the self-run entry block (the `if (invokedPath ===
  modulePath)` block + signal/exit cleanup + `defaultAuraPaths` if now unused).
  `server.ts` becomes a pure library module exporting `startServer` +
  `openBrowser` (+ helpers) for in-process use.
- Delete `dist/server.mjs` + the extension's `esbuild.config.mjs` (the *server*
  bundle config — distinct from the `scripts/esbuild.config.mjs` aura-digest
  CLI bundle that task 5 deletes). Update `.pi/extensions/digest-dashboard/
  package.json` `build` script: `vite build && node esbuild.config.mjs` →
  `vite build` (the server is no longer bundled; it's imported in-process).
  Update `.gitignore` if it referenced `dist/server.mjs`.
- `state.ts`: delete `writePid`, `clearPid`, `readState` (if unused), the
  `EMPTY_STATE.pid`/`server_started` fields, the file-write `appendEvent`. Keep
  the `StateEvent` types (still used). The `StateFile` interface shrinks to
  just `events` (or is removed if events are purely in-memory).
- Confirm `npm run build` (vite only) + `npm run typecheck` pass; the extension
  loads from source (`pi.extensions` points at `./index.ts`, not a bundle).
- Tests: remove any remaining file-based state assertions; final gate.
- **Green check:** no `dist/server.mjs`, no `server-url.json`, no `state.json`
  pid, `npm run build` builds only `app.js`/`app.css`, full suite + typecheck
  green.

## Existing abstractions to use

- `server.ts`'s handler logic (`resolveBundles`, `htmlShell`, `readRequestBody`,
  the route switch) — **reuse**, drop the file/`server-url.json` bits.
- `state.ts`'s `appendEvent` serialization (monotonic id assignment) — keep the
  semantics, back with the in-memory array.
- `listener.ts`'s `startListener`/`ListenerHandle` shape — keep the API,
  rewire the internals to the in-memory subscription.
- `@pi-aura/shared/digest/progress-emitter`'s `readDashboardUrl`/`joinUrl` —
  `joinUrl` stays (digest-log uses it); `readDashboardUrl`'s server-discovery
  use is replaced by `getDashboardUrl`.

## Do NOT (out of scope — other tasks)

- Rewire `digest-fetch` to call `fetchAction` in-process + populate the
  in-memory digest (task 3). In this task, `digest-fetch` still runs the moved
  core via the CLI shim/HTTP as it does today; the in-memory digest stays empty.
- Rewire `digest-log`/`digest-save` to direct in-memory calls (task 4).
  `digest-log` still HTTP-POSTs to the in-process server's `/api/state`.
- Delete the `aura-digest` CLI bundle / `scripts/esbuild.config.mjs` (task 5).
- Redesign the Svelte view, the digest data model, or the action_click flow.

## Seams (boundaries under test)

1. **Lifecycle seam:** `startDashboard` returns a reachable URL from an
   in-process `http.Server`; no child spawned; `stop`/`session_shutdown` close
   it deterministically.
2. **In-memory backing seam:** `/api/digest` serves the in-memory digest;
   `/events` SSE fans out `pushEvent`; `/api/state` POST appends in-memory.
3. **Listener seam:** the listener forwards `action_click` from the in-memory
   event stream (not `fs.watch` on a file).
4. **No-discovery-files seam:** no `server-url.json` written; no `state.json`
   pid field; `getDashboardUrl` returns the handle URL.
5. **Dead-code seam (slice 3):** no `dist/server.mjs`; `npm run build` is
   vite-only; no `writePid`/`clearPid`.

## Interface contract for task 3 (`in-process-fetch`)

After this task, the in-memory store exports (or exposes via the module scope):
- a way to **set the current digest** (task 3 calls this after `fetchAction`).
- the **`pushEvent`** API (task 3 wires `onProgress` → `pushEvent`; task 4 wires
  `digest-log` → `pushEvent`).
- `getDashboardUrl()` (task 3/4 use it, though they may switch to direct
  in-memory calls).

This task does NOT finalize those APIs for tasks 3/4 — it stands them up.
Slice 2 should expose `pushEvent` and a `setCurrentDigest` (or the store
module) clearly enough that task 3 can call them; record the exact shape in
the implementation notes.

## Baseline (captured at spec time, on task/in-process-server off develop)

- shared `tsc --noEmit`: green · scripts `tsc --noEmit`: green · extension
  `tsc --noEmit`: green
- shared `tsx --test`: 188 pass · root vitest: 18 files / 177 tests
- CLI exit codes: 2/2/0 (preserved from core-move; this task doesn't touch the CLI)
