---
kind: slice
slug: digest-log-direct-push
title: digest-log calls store.pushEvent directly (no HTTP self-POST); drop joinUrl
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: []
---

## End-to-end behavior

`digest-log` appends an `agent_log` event directly to the in-memory store
(`store.pushEvent`) instead of HTTP-POSTing to `/api/state`. The line renders
in the dashboard log list when the server is up (SSE fan-out). The tool is
**always-safe**: it records the event regardless of whether the dashboard is
running (returns `ok`; no "skipped" branch — the push always succeeds, SSE
just has no clients to fan out to if the server is down). No HTTP call.

## What this slice delivers

- `digest-log` `execute`: replace `getDashboardUrl`/`joinUrl`/`fetch(POST)` with `store.pushEvent({ id: 0, ts: new Date().toISOString(), dir: "agent→page", type: "agent_log", payload: { message: params.message } })`. The store assigns the monotonic id + fans out to SSE clients. Return `digest-log: ok (<message>)` unconditionally (no "dashboard not running" branch).
- Drop the `joinUrl` import from `index.ts` (only `digest-log` used it; now dead). Keep `getDashboardUrl` (`digest-fetch` still uses it).
- Tests: rewrite `log-tool.test.ts` — assert `pushEvent` called (event in `store.getEvents()` with `type: "agent_log"` + the message); no `fetch` called (no HTTP); a connected `/events` SSE client receives the `agent_log` `state-change` event; the tool returns `ok` regardless of server state. Replace the "dashboard down → skipped" test with "always records the event even with no server".

## Acceptance criteria

- `digest-log` never makes an HTTP call; pushes to the in-memory event stream; the line renders with the server up; always-safe (returns `ok` with no server).
- `joinUrl` import gone from `index.ts`.
- `log-tool.test.ts` rewritten; full vitest + typecheck green.

## Test plan

- `log-tool.test.ts`: pushEvent recorded (getEvents has the agent_log event); no fetch; SSE client receives the event; returns ok with no server; returns ok with server.
- Full vitest + typecheck green.

## Constraints and dependencies

- Do NOT touch `digest-save` (slice 2 verifies it; task 3 already reworked it).
- Do NOT remove the `/api/state` POST route in `server.ts` (the browser still uses it for action_click).
- Do NOT touch `digest-fetch`/the store/the server lifecycle.
