---
kind: slice
slug: wire-extension-entry
title: Wire /digest-dashboard start (spawn detached server + open browser + start listener) and optional tool
task: ../task.md
mode: afk
size: m
blocked_by: [teardown-subcommand]
---

## End-to-end behavior

`/digest-dashboard start` spawns the dumb server detached
(`spawn({detached:true, stdio:'ignore'})` + `unref()`), writes `{ pid,
server_started }` to `~/.pi/aura/state.json`, opens the browser to the
server URL, and starts the `state.json` listener. An optional
`pi.registerTool` lets the agent start the dashboard programmatically
(arch spec decides). End-to-end: `start` → page opens rendering
`~/.pi/aura/digest.json`; a click → `state.json` event → listener forwards
to the agent; `stop` cleans up.

## Acceptance criteria

- `index.ts` `start` handler: `child_process.spawn(process.execPath, [<server script>, { cwd }], { detached:true, stdio:'ignore' })` + `child.unref()` (Q1e); write `~/.pi/aura/state.json` = `{ pid: child.pid, server_started: Date.now() }` (plus any initial events array `[]`).
- The server script path resolves to the built server (the arch spec settles whether `server.ts` is bundled to a `.mjs` the detached process runs, or run via `node --experimental-strip-types` / `tsx`; pi-annotate runs `server.ts` in-process — but a *detached* server needs a runnable entry, likely a small `server.mjs` built by Vite or esbuild alongside `app.js`).
- Open the browser to `http://127.0.0.1:<port>/` (the server prints its port; `start` reads it — settle in arch spec: the server writes its URL to a temp file or stdout the parent reads before detaching, or `start` binds the port itself and passes it).
- Start the `state-listener` (`startListener({ pi, ctx, statePath })`) in-process.
- `pi.registerTool("digest-dashboard-start", …)` (optional, arch spec) so the SKILL.md flow can start the dashboard via a tool call.
- `session_shutdown`: kill the recorded PID + delete `state.json` (mirror `teardown-subcommand`'s cleanup).
- End-to-end smoke: with a real `~/.pi/aura/digest.json` fixture, `/digest-dashboard start` opens a page showing the digest; clicking a button appends to `state.json` and the listener forwards (visible via a `notify` or a captured `sendMessage`); `/digest-dashboard stop` cleans up.

## Test plan

- **Seams:** `start` with `openBrowser:false` (no real browser) + a temp `HOME` + a fixture `digest.json`; assert `state.json` written with a live PID; assert the listener forwards a synthetic `action_click`.
- **Scenarios:** (a) `start` → `state.json` has a `pid` that is alive; (b) the page is reachable at the server URL; (c) `POST /api/state` (a click) → listener `sendMessage` called; (d) `stop` → PID dead, `state.json` gone, listener exited; (e) second `start` while one is running → either refuse ("already running") or replace (arch spec settles — prefer refuse + point to `stop`).
- **Failure modes:** server fails to bind → `start` reports the error, no `state.json` written; port collision → `127.0.0.1:0` avoids it (random port).
- **Edge cases:** pi exits mid-session → `session_shutdown` kills the PID; browser auto-open fails on a headless box → `start` still returns the URL (Q8 assumes a browser, but the URL is useful regardless).

## Constraints and dependencies

- `blocked_by: [teardown-subcommand]` (the cleanup path must exist to wire against).
- The detached server's runnable entry is the one open arch-spec question: Vite builds the browser `app.js`, but the Node `server.ts` needs a runnable form for `spawn`. Likely a second Vite/esbuild entry → `dist/server.mjs` (Node ESM, not iife), or run via `node --experimental-strip-types server.ts`. The arch spec must fix this before the slice lands.
- This slice completes the mechanism; `skl-flow-rewrite` completes the choreography (agent writes `ack` + clears `currentlyWorkingOn`).
