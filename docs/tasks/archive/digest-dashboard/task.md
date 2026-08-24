---
kind: task
type: feature
slug: digest-dashboard
title: Build the .pi/extensions/digest-dashboard sub-package — Svelte SPA + dumb server + state.json listener + teardown
map: aura-digest-interactive
status: ready
blocked_by: [digest-actions-and-followup]
slices: [sub-package-skeleton, svelte-dashboard-client, dumb-file-server, state-listener, teardown-subcommand, wire-extension-entry]
---

## User-visible outcome

A new pi extension at **`.pi/extensions/digest-dashboard/`** serves the
interactive Aura digest as an HTML page: a **Svelte SPA** (Vite lib/iife,
inlined into a static shell) renders `~/.pi/aura/digest.json` — the table +
per-section action buttons from `actions[]` — and a **dumb file server**
serves the shell, `digest.json` at `/api/digest`, and an SSE `/events`
stream that announces JSON changes. A **background listener** `fs.watch`es
`~/.pi/aura/state.json` (the bidirectional append-only mailbox) and forwards
`page→agent` click events to the agent via `pi.sendMessage({ triggerTurn })`.
A **teardown subcommand** kills the detached server PID and deletes
`state.json`. One click → the agent acts on one action → writes `ack` +
clears `followup.currentlyWorkingOn` → the page hot-reloads (spinner → done).

## User story

As the user running the morning digest, I open the dashboard in my browser
and see my queue, reviews I owe, capacity, and an action button per
actionable item. I click one; the button shows a spinner + "continue in pi"
tooltip and the other buttons disable; the agent acts in pi and reports; the
page updates to show the result. I close the page when done, and a teardown
subcommand cleans up the server + listener.

## Scope boundaries

- **In:** the whole `.pi/extensions/digest-dashboard/` sub-package: `Digest.svelte` + `main.ts` (browser), `server.ts` (dumb file server + SSE), `listener.ts` (`fs.watch` + forward), `index.ts` (extension: register tool/command + spawn server + start listener + teardown), `package.json`, `vite.config.ts`, `tsconfig.json`, committed `dist/app.js`+`dist/app.css`. A root-level `vite.config.ts` if needed (mirror pi-annotate). The `state.json` event schema (`{id,ts,dir,type,payload}` + the `action_click`/`ack`/`update_view` payload shapes). Add the extension entry to the root `package.json` `pi.extensions`.
- **Out:** computing `actions[]`/`followup` (that's `digest-actions-and-followup` — this task *reads* them from `digest.json`); rewriting the `aura-digest` SKILL.md flow (that's `skl-flow-rewrite`); the `aura` skill itself; the markdown render path.
- **Mirror `pi-annotate`'s build discipline:** `svelte`/`vite`/`@sveltejs/vite-plugin-svelte` are `devDependencies`; the published package ships only the committed `dist/` bundle; end users need no build step.

## Acceptance criteria

- `.pi/extensions/digest-dashboard/` exists with `package.json` (private, `type: module`, `pi.extensions: ["./index.ts"]`), `Digest.svelte`, `main.ts`, `server.ts`, `listener.ts`, `index.ts`, `tsconfig.json`, and `vite.config.ts`.
- `vite build` (or `npm run build`) produces `dist/app.js` (lib/iife, Svelte runtime inlined) + `dist/app.css`; both are **committed** and selectively un-gitignored (mirror pi-annotate's `dist/**` + `!dist/app.js` + `!dist/app.css` rule).
- The **server** (`server.ts`): a `node:http` server on `127.0.0.1:0` (random port) serving `GET /` (static shell with inlined `app.js`/`app.css`), `GET /api/digest` (reads `~/.pi/aura/digest.json`), and `GET /events` (SSE that `fs.watch`es `digest.json` and pushes a change notification). No stamping — the SPA renders.
- The **SPA** (`Digest.svelte`): fetches `/api/digest`, renders the digest sections + an action button per `actions[]` entry; on click, POSTs `{id, ts, dir:"page→agent", type:"action_click", payload: <the action object>}` by **appending to `~/.pi/aura/state.json`** (via a small `/api/state` POST endpoint the server exposes, since browsers can't write files directly — see arch spec). Reads `followup.currentlyWorkingOn`; the matching button shows a spinner + "continue in pi" tooltip and the other buttons `disabled`. Re-renders on SSE change-notify.
- The **listener** (`listener.ts`): `fs.watch`es `~/.pi/aura/state.json`; on change, reads events past its cursor; for each `page→agent` `action_click`, calls `pi.sendMessage({ customType: "aura-digest-event", content: <instruction>, details: <action object>, triggerTurn: true, deliverAs: "steer" })`. Exits when `state.json` is deleted.
- The **extension** (`index.ts`): `pi.registerCommand("digest-dashboard", {…})` with subcommands `start` (spawn the detached server via `child_process.spawn(node, [server.mjs], { detached:true, stdio:'ignore' })` + `unref()`, write PID to `state.json`, open browser, start the listener) and `stop` (teardown: read PID, `process.kill`, delete `state.json`). Optionally a `pi.registerTool` so the agent can start it programmatically (settled in arch spec).
- `make typecheck` green for the new sub-package's `tsconfig`; `vite build` succeeds; the committed `dist/` loads in a browser (manual smoke — open the page, see the table, click a button → `state.json` gets an event).
- Unit tests: `listener` forwards an `action_click` via `pi.sendMessage` (fake `pi`); `server` serves `/api/digest` + `/events`; `state.json` append schema validates.
- No new runtime npm deps for end users (only committed `dist/`).

## Existing abstractions to use

- **`pi-annotate`** (`~/Projects/pi-annotate/.pi/extensions/pi-annotate/`) — the structural template: `server.ts` (`node:http`, `127.0.0.1:0`, `openBrowser`, `liveServers` set, `done()`), `client.ts` (inlined bundle read into `htmlShell()`), `index.ts` (`registerTool`+`registerCommand`, `session_start`/`session_shutdown` cleanup), `vite.config.ts` (lib/iife, `inlineDynamicImports`), `.gitignore` (`dist/**` + un-ignore the two assets). **Read these files before writing.**
- **`pi-impeccable`** extension (`pi-impeccable/extensions/impeccable.ts`) — the listener pattern: managed background child, `startPoll`/`killPoll`, `session_shutdown` cleanup, `pi.sendMessage({ triggerTurn })`. Use this as the listener-spawn template.
- `~/.pi/aura/` dir + the `DASHBOARD_DIGEST_PATH` from `digest-actions-and-followup`.
- `@pi-aura/shared/*` if any shared types help (but `DigestAction`/`DigestFollowup` live in `scripts/src/types.ts` — the arch spec decides whether to re-declare a browser-facing subset in the sub-package to avoid importing the scripts workspace).

## Architecture / domain decisions

- Per the grilling: **client-side SPA + SSE** (Q1a), **Svelte/Vite lib/iife inlined** (Q4), **dumb file server** (Q3), **append-only `state.json`** (Q1c), **`fs.watch` + `pi.sendMessage`** (Q1d), **`spawn({detached:true})` + `unref()`** (Q1e), **one action at a time** via `followup.currentlyWorkingOn` (Q7), **browser always available** (Q8).
- **Browser → `state.json` write path:** browsers can't write files directly, so the server exposes a small `POST /api/state` that appends the event to `~/.pi/aura/state.json`. The server is the only writer of `state.json` from the page side; the agent writes `ack`/`update_view` events directly to `state.json` (it's a Node process). The arch spec nails down the exact endpoint + payload.
- **Hot-reload of `followup.currentlyWorkingOn`:** the agent writes `digest.json` (clearing `currentlyWorkingOn`) and the server's `fs.watch` + SSE notifies the SPA → buttons re-enable. No separate channel.
- **Listener process model:** the extension spawns the listener as a detached child (like pi-impeccable's poller) OR runs it in-process on an interval/`fs.watch` — the arch spec settles; prefer in-process `fs.watch` (simpler, no second detached child) unless it proves unreliable.

## Slices

### 1. `sub-package-skeleton` (m)

Create `.pi/extensions/digest-dashboard/` with `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore` entries, and a stub `index.ts` that `pi.registerCommand("digest-dashboard", {…})` with `start`/`stop` no-ops. Add the extension entry to the root `package.json` `pi.extensions`. Verify `pi` loads it (no errors) and `vite build` produces an empty `dist/`. Prefactor for the later slices.

### 2. `svelte-dashboard-client` (l)

`Digest.svelte` + `main.ts`: fetch `/api/digest`, render the digest (sections + table + reviews + capacity) and an action button per `actions[]`; handle `followup.currentlyWorkingOn` (spinner + "continue in pi" tooltip + disabled siblings); on click, `POST /api/state` with an `action_click` event. `vite build` → committed `dist/app.js`+`dist/app.css`. Use a fake `/api/digest` fixture for dev (Vite `server` proxy or a `live/` fixture dir, mirror pi-annotate). Manual smoke: the page renders a fixture digest.

### 3. `dumb-file-server` (m)

`server.ts`: `node:http` on `127.0.0.1:0` serving `GET /` (static shell inlining `dist/app.{js,css}`), `GET /api/digest` (read `~/.pi/aura/digest.json`), `GET /events` (SSE `fs.watch`ing `digest.json`), and `POST /api/state` (append event to `~/.pi/aura/state.json`). Unit-test the endpoints with a temp `HOME`.

### 4. `state-listener` (m)

`listener.ts`: `fs.watch` `~/.pi/aura/state.json`, read events past a cursor, forward `page→agent` `action_click` events via `pi.sendMessage({ customType:"aura-digest-event", triggerTurn:true, deliverAs:"steer" })`. Exit on file deletion. Unit-test with a fake `pi` + temp `state.json`.

### 5. `teardown-subcommand` (s)

`index.ts` `stop` subcommand: read `state.json` PID, `process.kill(pid)`, delete `state.json` (the listener observes deletion and exits). Handle missing-file / already-dead-PID gracefully. `session_shutdown` cleanup kills any leaked server. Unit-test the lifecycle.

### 6. `wire-extension-entry` (m)

Wire `start` to spawn the detached server (`spawn({detached:true, stdio:'ignore'})`+`unref()`, write PID to `state.json`), open the browser, and start the listener. Optional `pi.registerTool` for agent-driven start (arch spec). End-to-end smoke: `/digest-dashboard start` opens a page rendering `~/.pi/aura/digest.json`; a click → `state.json` event → listener forwards → (agent acts in `skl-flow-rewrite`); `/digest-dashboard stop` cleans up.

## Notes

- The end-to-end "click → agent acts → ack → page updates" loop is completed by `skl-flow-rewrite` (the SKILL.md orchestrator flow + the agent writing `ack`/clearing `currentlyWorkingOn`). This task delivers the *mechanism*; `skl-flow-rewrite` delivers the *choreography*.
- The `state.json` schema and the `POST /api/state` endpoint are co-designed in slices 2+3; the arch spec must fix the schema before either lands.
- Importing `DigestAction`/`DigestFollowup` from `scripts/src/types.ts` into the browser bundle would pull the scripts workspace into the Vite graph — the arch spec decides whether to re-declare a browser-facing subset in the sub-package (preferred) or set up a shared types import.

## Implementation notes

- **Slice 1 (`sub-package-skeleton`):** Created the `.pi/extensions/digest-dashboard/` sub-package skeleton — `package.json` (private, `type:module`, `pi.extensions`), `tsconfig.json` (ES2022/NodeNext/strict), `vite.config.ts` (svelte plugin, lib/iife `Digest` → `dist/app.js`, `inlineDynamicImports`), and `esbuild.config.mjs` for the `server.mjs` output. Stub `index.ts` registers the `digest-dashboard` command (single handler; `start`/`stop` subcommands deferred to slice 6), `main.ts`/`server.ts` are placeholders. Root `package.json` `pi.extensions` entry added; `svelte`/`vite`/`@sveltejs/vite-plugin-svelte` added as root `devDependencies`. `.gitignore` gained `dist/**` + selective `!` un-ignore rules for `dist/app.js`/`dist/app.css`. Two-output build verified (vite → `dist/app.js`, esbuild → `dist/server.mjs`); scripts typecheck and sub-pkg typecheck both green. Stray `test-skeleton.mjs` verification artifact removed at landing.
- **Slice 2 (`svelte-dashboard-client`):** Built the `Digest.svelte` SPA — fetches `/api/digest`, renders summary, attention (overdue/waiting/notifications), queue table, capacity, reviews, reviews-owed, corrections, warnings, and an actions list (one button per `actions[]` entry using `action.label`). On click, POSTs an `action_click` event (`{id, ts, dir:"page→agent", type:"action_click", payload: <action object>}`) to `/api/state`. `followup.currentlyWorkingOn` shows a spinner + `continue in pi` tooltip on the matching button and disables the others; `EventSource("/events")` triggers a re-fetch on SSE change-notify. `main.ts` mounts `Digest.svelte` into `#app`. `digest-types.ts` re-declares a browser-facing subset (`DigestAction`, `DigestFollowup`, `StateEvent`) so the Vite graph does not import `scripts/src/types.ts`. A `live/` fixture dir (`live/index.html` + `live/digest.json`) serves a fixture digest so `npm run live` renders without the server. `vitest.config.ts` + 9 `Digest.test.ts` scenarios (3 actions→3 buttons, currentlyWorkingOn spinner+disabled siblings, empty actions, click→fetch envelope, SSE re-fetch, 404/500 error state, malformed action skip, stale currentlyWorkingOn graceful, long-label truncation). Committed build artifacts: `dist/app.js` + `dist/app.css` + `dist/server.mjs` come in via the merge (tracked build artifacts, correct per build discipline). Sub-pkg build, sub-pkg typecheck, scripts typecheck, vitest 9/9, and shared pkg all green. Three minor non-blocking type-simplification notes (decisions as `string[]` for read-only view; `StateEvent.payload` looser — slice 3 `state.ts` owns authoritative types).
- **Slice 3 (`dumb-file-server`):** Built `server.ts` (dumb file server) — `node:http` on `127.0.0.1:0` serving `GET /` (static shell with inlined `dist/app.{js,css}` via `htmlShell()`, mirroring pi-annotate's `client.ts`), `GET /api/digest` (reads `~/.pi/aura/digest.json`, 404 if absent), `GET /events` (SSE: `res.writeHead(200, {"Content-Type":"text/event-stream"})`, `fs.watch(digest.json)` → `event: change` notification, watcher cleanup on connection close), and `POST /api/state` (appends an event to `~/.pi/aura/state.json` via `state.ts` `appendEvent`, serialized by a per-file promise queue for concurrent-append safety; malformed JSON → 400). `startServer({ dashboardPath, statePath, serverUrlPath, openBrowser?, browserOpener? })` → `{ port, url, server, done }` — the `serverUrlPath` + `browserOpener` additions are supersets of the arch spec per decision #5 (server writes `{ url, pid }` to `server-url.json` on listen) and the test plan's injected-opener seam. `openBrowser` uses `xdg-open`/`open`/`start` with `PI_DIGEST_NO_BROWSER=1` suppression. `done()` closes all `fs.watch` watchers + the HTTP server. `state.ts` declares the `StateFile`/`StateEvent`/`AckPayload`/`UpdateViewPayload` schema + helpers (`readState`, `appendEvent`, `writePid`, `clearPid`, `ensureDir`) — the shared schema module for `server.ts` (slice 3) + `listener.ts` (slice 4) + `index.ts` (slice 6). Self-start entry point when run directly as `dist/server.mjs` (required for slice 6's detached spawn). Tests: 10 `server.test.ts` + 5 `state.test.ts` scenarios (all test-plan cases + concurrent append serialization + `server-url.json` written + `pid`/`server_started` preserved). `dist/server.mjs` rebuilt (8.3 KB) and committed (tracked build artifact). Sub-pkg build, sub-pkg typecheck, scripts typecheck, vitest 24/24 (9 Digest + 10 server + 5 state), shared pkg all green. Deviation: clean — `serverUrlPath`/`browserOpener` match arch spec decisions #5 + test plan; no out-of-scope work.
- **Slice 4 (`state-listener`):** Built `listener.ts` — in-process `fs.watch` on `~/.pi/aura/state.json`; on change, `readState` (via `state.ts` from slice 3) and read events past a monotonic `event.id` cursor. For each `page→agent` `action_click`, calls `pi.sendMessage({ customType:"aura-digest-event", content: payload.instruction, details: payload, triggerTurn: true, deliverAs: "steer", display: true })` (the `display: true` makes the forwarded click visible in the TUI). Ignores `agent→page` events (acks/update_views). Malformed events are skipped + logged (`isActionClickPayload` guard), never thrown. Cursor starts at the max existing event id on startup (no history replay). A polling fallback (`setInterval(scan, pollIntervalMs=100)`) runs alongside `fs.watch` for filesystems where `fs.watch` is unreliable (Q1d); the cursor dedupes by id, so the dual path can't double-forward. Delete-exit contract: a `rename` event + `!existsSync` triggers a 500ms grace period (distinguishes atomic replace from real teardown) before `cleanup()` closes the watcher and resolves `stop()`. `startListener({ pi, statePath, pollIntervalMs? })` → `{ stop(): Promise<void> }` — the optional `pollIntervalMs` + `Promise<void>` return are superset additions; slice 6 calls `startListener({ pi, statePath })`. Uses `readState` + types from `state.ts` and `ActionClickPayload` from `digest-types.ts` (no re-implementation). Tests: 7 `listener.test.ts` scenarios (single action_click, two in order, ignore agent→page ack + cursor advance, delete → stop() resolves, atomic replace → no re-forward, cursor-at-max no replay, malformed skip) — all pass; 31/31 across 4 files. Deviation: clean — polling fallback + deletion grace are robustness additions anticipated by the slice doc constraints (Q1d); no out-of-scope work.
- **Slice 5 (`teardown-subcommand`):** Replaced the slice-1 `index.ts` stub with a real extension — `registerCommand("digest-dashboard", { handler })` dispatches via `parseSubcommand(args)`: `stop` → `stopHandler`, `start` → `startHandler` (stub notify, slice 6 implements), else → usage warning. `stopHandler` calls `teardownDashboard(statePath, serverUrlPath)` (extracted testable helper) → `TeardownResult { ok, message }` → `ctx.ui.notify(result.message, result.ok ? "info" : "error")`. `teardownDashboard` reads `~/.pi/aura/state.json` via `readState` (from `state.ts`): absent file → `{ ok: true, message: "No dashboard running." }` (idempotent); PID present → `terminateProcess(pid)` (SIGTERM, 2s grace, SIGKILL fallback; `ESRCH` caught = already dead, silent); then `deleteFiles` removes `state.json` + `server-url.json` (force, catch+log). `session_start` stores `ctx.cwd` in `sessionCwd`; `session_shutdown` calls `teardownDashboard` (kills leaked PID + cleans files — mirrors pi-annotate's `liveServers` cleanup). `defaultAuraPaths()` helper centralizes `~/.pi/aura/` paths. Tests: 6 `teardown.test.ts` scenarios (live PID killed + files deleted + "stopped" notify, no file → "No dashboard running", dead PID → file deleted no throw, stop route + notify, start stub, session_shutdown kills leaked PID) — all pass; 37/37 across 5 files. Deviation: clean — `start` is a stub (slice 6), no `registerTool` (slice 6), `TeardownResult` + `defaultAuraPaths()` are additive; two non-blocking optional gaps (permission-error path untested but catch-covered; PID-reuse `server_started` guard optional per slice doc).
- **Slice 6 (`wire-extension-entry`):** Wired the `start` handler in `index.ts` — `startHandler` spawns the detached server via `child_process.spawn(process.execPath, [server.mjs], { detached:true, stdio:'ignore' })` + `unref()`, calls `writePid` to `~/.pi/aura/state.json` (`{ pid, server_started }`), polls `server-url.json` until the server writes `{ url, pid }` on listen, then `openBrowser(url)` + `startListener({ pi, statePath })` in-process, and `ctx.ui.notify(…)` success. `registerTool("digest-dashboard-start", …)` exposes an agent-driven start (the SKILL.md flow in `skl-flow-rewrite` can call it). `session_shutdown` reuses `teardownDashboard` (from slice 5) to kill the leaked PID + clean files. Tests: 6 `start.test.ts` scenarios (spawn+writePid+poll server-url+openBrowser+startListener+notify; openBrowser:false skip; writePid writes `{pid,server_started}`; poll server-url timeout; registerTool exposed; second-start refuses "already running") — all pass; the `teardown.test.ts` update (deleted obsolete "start stub" test + realigned stop test) is an intended API-change (slice 6 made `start` real). 43/43 across 6 files (Digest + server + state + listener + teardown + start); sub-pkg build, sub-pkg typecheck, scripts typecheck, shared pkg all green. **This slice completes the digest-dashboard MECHANISM** — all 6 slices landed; the `skl-flow-rewrite` task delivers the choreography (agent writes `ack` + clears `currentlyWorkingOn`).
