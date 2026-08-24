---
kind: slice
slug: dumb-file-server
title: Build the dumb file server (static shell + /api/digest + SSE /events + POST /api/state)
task: ../task.md
mode: afk
size: m
blocked_by: [svelte-dashboard-client]
status: done
---

## End-to-end behavior

`server.ts` starts a `node:http` server on `127.0.0.1:0` serving the static
shell (with inlined `dist/app.{js,css}`), `digest.json` at `/api/digest`, an
SSE `/events` stream that notifies on `digest.json` change, and a `POST
/api/state` endpoint that appends an event to `~/.pi/aura/state.json`.

## Acceptance criteria

- `server.ts` exports `startServer({ cwd, openBrowser })` → `{ port, url, server, done }` (mirror pi-annotate's `startAnnotateServer` shape).
- `GET /` → the static shell HTML (`<!doctype html>…<div id="app">…<script>…dist/app.js…</script>…`) with `dist/app.js` + `dist/app.css` **inlined** (read at serve time, mirror pi-annotate's `client.ts` `htmlShell()`).
- `GET /api/digest` → reads `~/.pi/aura/digest.json`, returns it as JSON (404 if absent).
- `GET /events` → SSE: `res.writeHead(200, {"Content-Type":"text/event-stream"})`, `fs.watch(digest.json)` → on change write `event: change\ndata: {}\n\n`; clean up the watcher on connection close.
- `POST /api/state` → read body (JSON event `{id,ts,dir,type,payload}`), **append** to `~/.pi/aura/state.json` (a JSON array; read-parse-append-write atomically), respond `{ ok: true }`.
- `openBrowser(url)` — `xdg-open`/`open`/`start` (mirror pi-annotate); suppressed when `PI_DIGEST_NO_BROWSER=1` (for tests).
- `done()` closes the server + the `fs.watch`.
- Unit tests with a temp `HOME` covering all four endpoints + the SSE change notification.

## Test plan

- **Seams:** `startServer` with an injected `browserOpener` (no real browser in tests) + a temp `HOME`.
- **Scenarios:** (a) `GET /` → HTML contains `<div id="app">` + inlined script; (b) `GET /api/digest` → the fixture JSON; (c) `GET /events` → touching `digest.json` yields an SSE `change` event; (d) `POST /api/state` → `state.json` grows by one event with the right shape; (e) `POST /api/state` with malformed JSON → 400.
- **Failure modes:** `digest.json` absent → `/api/digest` 404 (SPA shows empty state); `state.json` absent on append → create it as `[event]`.
- **Edge cases:** concurrent `POST /api/state` (two near-simultaneous clicks) — the append is read-modify-write; a simple mutex/sequential-write avoids clobber (the arch spec can note a write lock if needed; ≤2 concurrent is unlikely for a singleton dashboard).

## Constraints and dependencies

- `blocked_by: [svelte-dashboard-client]` (serves its built `dist/`).
- `~/.pi/aura/` + `DASHBOARD_DIGEST_PATH` from `digest-actions-and-followup`.
- `state.json` path: `~/.pi/aura/state.json` (Q1b).
- Do not spawn the server detached yet — that's `wire-extension-entry`.
