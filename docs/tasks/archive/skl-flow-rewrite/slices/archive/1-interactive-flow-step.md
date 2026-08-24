---
kind: slice
slug: interactive-flow-step
title: Rewrite SKILL.md Step 4 to the interactive dashboard flow (start → wait → act → ack+clear → report/close)
task: ../task.md
mode: hitl
size: m
blocked_by: []
status: done
---

## End-to-end behavior

SKILL.md "Step 4: Present, save, and act" describes the interactive
choreography: save → write `digest.json` → start dashboard → wait for
listener click → load `aura` → act on one action → write `ack` + clear
`followup.currentlyWorkingOn` → report → wait or clean-close. Steps 1–3 and
the markdown path stay.

## Acceptance criteria

- Step 4 rewritten with numbered sub-steps:
  1. `save` the corrected digest to `last-digest.json` (existing command, unchanged).
  2. Ensure `~/.pi/aura/digest.json` is written (per `digest-actions-and-followup`).
  3. Start the dashboard: `/digest-dashboard start` (or the `digest-dashboard-start` tool) — the page opens in the browser; the listener runs.
  4. **Wait** for the listener to forward a click (`pi.sendMessage` customType `aura-digest-event`, `details` = the action object). Do not poll or prompt.
  5. On a forwarded click: **load the `aura` skill**; route on `action.aura_use_case`; act on exactly **one** action; use `action.instruction` as the human-readable form. Follow the `aura` skill's conventions (`is_ai_generated`, `mcp*` variants, `recordTaskProgress`).
  6. Write an `ack` event to `~/.pi/aura/state.json` and clear `followup.currentlyWorkingOn` in `~/.pi/aura/digest.json` (so the page hot-reloads buttons back to enabled) — exact commands in `agent-ack-and-followup-writer`.
  7. Report the outcome concisely; return to step 4 (wait for the next click) unless the user says stop or `actions[]` is empty.
- The pipeline diagram + subcommand list mention `digest.json` + `state.json` + `/digest-dashboard start|stop`.
- Steps 1–3 (fetch → augment → render markdown) unchanged; the markdown digest stays available as a reference/scripted output.

## Test plan

- **Seams:** SKILL.md is prose — "test" = a reader (the agent) follows it end-to-end against the landed `digest-dashboard` and produces the right sequence of commands/writes.
- **Scenarios:** (a) a digest with actions → start → click → act → ack+clear → report → wait; (b) a digest with no actions → clean close (covered in `routing-table-and-clean-close-docs`); (c) user says "stop" mid-session → `/digest-dashboard stop` + stop.
- **Failure modes:** a forwarded click for an action whose `aura_use_case` is unknown → the SKILL.md says: load the `aura` skill and surface the action, don't improvise.
- **Edge cases:** multiple clicks queued (shouldn't happen — `currentlyWorkingOn` disables siblings) → the SKILL.md says: process one, ack, then the next; never parallel.

## Constraints and dependencies

- None blocking (prose), but only meaningful after `digest-dashboard` lands.
- `mode: hitl` because the prose contract should be reviewed by the user before it's landed.
