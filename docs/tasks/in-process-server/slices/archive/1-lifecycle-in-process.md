---
kind: slice
slug: lifecycle-in-process
title: Run the dashboard server in-process (module-scope handle); delete spawn/pid/waitForServerUrl lifecycle
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: []
---

## End-to-end behavior

No user-visible change. `digest-dashboard-start` runs the HTTP server
**in-process** (a module-scope `serverHandle = {server, port, url}`) instead
of spawning `dist/server.mjs` as a detached child. No `server-url.json` is
written; no pid is recorded in `state.json`. `digest-dashboard-stop` and
`session_shutdown` close the server deterministically (`server.close()`). The
dashboard still works exactly as today (file-backed `/api/digest`, `fs.watch`
SSE, `state.json` events) — only the *lifecycle* changes from spawned to
in-process. The orphan/stale-`server-url.json`/stale-pid bug class is gone.

## What this slice delivers

- `index.ts` `startDashboard`: call `startServer` in-process; store
  `{server, port, url}` in a module-scope `serverHandle`. No `spawn`, no
  `unref`, no `writePid`, no `waitForServerUrl`. Open the browser to
  `serverHandle.url`.
- `index.ts` `teardownDashboard`: `serverHandle.server.close()` + stop the
  listener + delete `state.json` (events still file-backed this slice). No
  `readState`-for-pid, no `terminateProcess`, no `isProcessAlive`.
- New `getDashboardUrl(): string | null` in `index.ts` returning
  `serverHandle?.url ?? null`. `digest-fetch`'s "dashboard was down" check and
  `digest-log`'s URL discovery switch from `readDashboardUrl()` to
  `getDashboardUrl()`. Keep the `joinUrl` import (digest-log still uses it).
  Remove the `readDashboardUrl` import (no longer needed here).
- `server.ts` `startServer`: stop writing `server-url.json` (drop the
  `writeFileSync` of the URL payload + the `serverUrlPath` option). Handlers
  unchanged (still read `digest.json` from disk, `appendEvent`→`state.json`,
  `fs.watch` SSE). The self-run entry block stays (slice 3 removes it).
- Delete dead lifecycle code: `spawn` import, `resolveServerEntryPath`,
  `waitForServerUrl`, `isProcessAlive`, `terminateProcess`, `writePid` calls,
  the `child`/`pid` branches. (`writePid`/`clearPid` in `state.ts` stay
  exported-but-unused this slice; slice 3 removes them.)

## Acceptance criteria

- `digest-dashboard-start` returns a reachable URL from an in-process
  `http.Server`; no child process spawned; no `server-url.json` written.
- `digest-dashboard-stop` and `session_shutdown` close the server
  deterministically; no orphan can remain.
- `getDashboardUrl()` returns the in-process handle's URL (or null when
  stopped); `digest-fetch`/`digest-log` use it.
- Dashboard still serves `/api/digest` (from disk) + `/events` SSE +
  `/api/state` POST (file-backed) — same as today.
- `start.test.ts`/`stop-tool.test.ts`/`teardown.test.ts` rewritten to the
  in-process shape; full vitest + typecheck green.

## Test plan

- `start.test.ts`: start returns a URL; an HTTP GET to it serves the shell;
  no `server-url.json` on disk; re-start is idempotent/no-op (or stops+restarts).
- `stop-tool.test.ts`/`teardown.test.ts`: stop closes the server (a GET to the
  URL then fails); no `state.json` pid; `session_shutdown` closes it.
- `server.test.ts`/`state.test.ts`/`listener.test.ts`: unchanged (file-backed).
- Full vitest + extension/scripts/shared typecheck green.

## Constraints and dependencies

- No behavior change to the dashboard's served content (still file-backed).
- `digest-fetch` still runs the moved core as today (task 3 rewires it).
- Do NOT delete `dist/server.mjs` or the esbuild config (slice 3).
- Do NOT move the backing to memory (slice 2).
