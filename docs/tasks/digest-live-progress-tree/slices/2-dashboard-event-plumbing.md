---
kind: slice
slug: 2-dashboard-event-plumbing
title: Add progress + agent_log event types and extend /events SSE to state.json
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: []
---

## End-to-end behavior

`POST /api/state` accepts two new `agent→page` event types (`"progress"` and
`"agent_log"`), appended via the existing `appendEvent` write queue. The
`/events` SSE now also watches `state.json` and notifies on change, so the
browser learns a progress/log event arrived (today `/events` only watches
`digest.json`).

## What this slice delivers

Changes to `.pi/extensions/digest-dashboard/state.ts` and `server.ts`. No Svelte
view yet — verifiable by curl + an SSE client.

## Acceptance criteria

- `StateEvent.type` union includes `"progress"` and `"agent_log"`; payloads
  typed (`ProgressPayload` mirrors the scheduler's `ProgressEvent`; `agent_log`
  carries `message: string`).
- `appendEvent` accepts and persists both new types unchanged (same write queue).
- `/events` SSE: in addition to the existing `digest.json` watcher, add a watcher
  on `state.json` that sends an `event: state-change` (with the new event's `id`
  + `type` in the data) when `state.json` changes. The existing `digest.json`
  `event: change` behavior is unchanged.
- A client connected to `/events` receives the `state-change` event when a
  `progress` or `agent_log` event is POSTed.
- Existing `action_click`/`ack`/`update_view` handling and the listener are
  unchanged.

## Test plan

- POST a `progress` event to `/api/state`; assert it lands in `state.json` with
  the right `id`/`type`/`dir` and an SSE `state-change` fires.
- POST an `agent_log` event; same.
- Verify the existing `digest.json` `event: change` SSE still fires on
  `digest.json` writes (regression).
- Concurrent POSTs (5 in a tight loop) all land with monotonic `id`s
  (write-queue serialization).

## Constraints and dependencies

- No Svelte changes (next slice consumes this).
- No bundle changes.
- Must not change the existing `page→agent` `action_click` listener contract.
