---
kind: slice
slug: 5-digest-log-tool
title: Add a digest-log pi tool that pushes an agent_log event to the dashboard
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: [2-dashboard-event-plumbing]
---

## End-to-end behavior

A new `digest-log` pi extension tool (registered in
`.pi/extensions/digest-dashboard/index.ts`) takes one `message: string` param
and POSTs it to `/api/state` as an `agent→page` `agent_log` event, so the agent
can push augment-phase status lines ("Verifying review states…",
"Re-ranking actions…") that render in the dashboard's log list (slice 4).

## What this slice delivers

The tool registration + a small POST helper (reusing the dashboard URL from
`~/.pi/aura/server-url.json`). No-op (returns ok) if the dashboard isn't
running — the log is a nice-to-have, not a gate.

## Acceptance criteria

- `digest-log` is registered with params `{ message: string }`.
- It POSTs `{ dir: "agent→page", type: "agent_log", payload: { message } }`
  to `/api/state` of the running dashboard (URL from `server-url.json`).
- If `server-url.json` is absent, the tool returns `{ ok: true, message:
  "dashboard not running, log skipped" }` — never fails the agent's call.
- The agent can call it between augment sub-steps; the line appears in the
  dashboard's log list (verified end-to-end with slice 4).

## Test plan

- Call the tool with the dashboard up; assert an `agent_log` event lands in
  `state.json` and (with slice 4) renders in the log list.
- Call the tool with the dashboard down; assert ok return, no throw, no
  stray file writes.
- Concurrent calls serialize (monotonic `id`s via `appendEvent`'s queue).

## Constraints and dependencies

- Blocked by 2 (event plumbing — needs the `agent_log` type).
- Independent of 1, 3, 4 — parallel-friendly.
