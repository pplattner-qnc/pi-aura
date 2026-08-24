---
kind: slice
slug: state-listener
title: Build the state.json fs.watch listener (forward action_click → pi.sendMessage)
task: ../task.md
mode: afk
size: m
blocked_by: [dumb-file-server]
---

## End-to-end behavior

`listener.ts` `fs.watch`es `~/.pi/aura/state.json`; on change, it reads events
past its cursor and, for each `page→agent` `action_click`, calls
`pi.sendMessage({ customType:"aura-digest-event", content:<instruction>,
details:<action object>, triggerTurn:true, deliverAs:"steer" })`. It exits
when `state.json` is deleted.

## Acceptance criteria

- `listener.ts` exports `startListener({ pi, ctx, statePath })` → `{ stop() }` (or a managed child — arch spec settles; prefer in-process `fs.watch`).
- Maintains a cursor (byte offset or event-count) so it only reads new events on each change.
- For each new event with `dir:"page→agent"` and `type:"action_click"`, calls `pi.sendMessage({ customType:"aura-digest-event", content: event.payload.instruction, details: event.payload, triggerTurn:true, deliverAs:"steer" })`.
- Ignores `agent→page` events (those are for the page, not the agent).
- On `state.json` deletion (teardown signal), cleans up the watcher and exits cleanly.
- On `fs.watch` error (e.g. file moved/replaced atomically), re-opens the watcher; on persistent error, logs + exits (don't spin).
- Unit tests with a fake `pi` (capture `sendMessage` calls) + a temp `state.json`: append an event → `sendMessage` called with the right `content`/`details`/`triggerTurn`; delete the file → listener exits.

## Test plan

- **Seams:** `startListener` with an injected `pi` (fake `sendMessage`) + temp `HOME`.
- **Scenarios:** (a) append 1 `action_click` → 1 `sendMessage` with `content=instruction`, `details=action`, `triggerTurn:true`; (b) append 2 → 2 forwards in order; (c) append an `agent→page` `ack` → no `sendMessage`; (d) delete `state.json` → watcher cleaned + `startListener` resolves/exits; (e) restart after replace (atomic write) → cursor advances, no re-forward.
- **Failure modes:** malformed event (missing `payload`) → skip + log, don't throw; `fs.watch` emits multiple rapid events for one append → de-duplicate by cursor (id/offset).
- **Edge cases:** listener started with an existing `state.json` (mid-session) → start cursor at end (don't replay history); very rapid clicks → cursor stays correct.

## Constraints and dependencies

- `blocked_by: [dumb-file-server]` (shares the `state.json` schema + path).
- The `pi` object + `ctx` come from the extension's `session_start`/command context (see `wire-extension-entry`).
- `fs.watch` reliability: if the target FS doesn't deliver events reliably, the arch spec may add a polling fallback (Q1d noted this) — not in this slice unless needed.
