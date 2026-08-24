---
kind: task
type: feature
slug: skl-flow-rewrite
title: Rewrite the aura-digest SKILL.md "after presenting" flow for the interactive dashboard + routing table + clean close
map: aura-digest-interactive
status: ready
blocked_by: [digest-dashboard]
slices: [interactive-flow-step, agent-ack-and-followup-writer, routing-table-and-clean-close-docs]
---

## User-visible outcome

The `aura-digest` SKILL.md's "Step 4: Present, save, and act" + "Scope and
handoff" + `[ASK]` sections are rewritten to the **interactive dashboard
choreography**: after fetch → augment, the orchestrator starts the dashboard
(`/digest-dashboard start` or the tool), opens the page, and **waits for
clicks**. On a click (forwarded by the listener), it loads the `aura` skill,
acts on **exactly one** action (using `action.aura_use_case` to route +
`action.instruction` as the human-readable form), writes an `ack` event to
`state.json` + clears `followup.currentlyWorkingOn` in `digest.json` (so the
page hot-reloads the buttons back to enabled), and reports. When nothing is
actionable or the user declines all, it ends with a **clean all-clear close**
(one-line verdict, stop). A teardown (`/digest-dashboard stop`) cleans up.

## User story

As the agent running the morning digest, after I gather + augment the data I
want the SKILL.md to tell me precisely: start the dashboard, wait for a
click, act on that one action via the `aura` skill, ack + clear the
in-flight lock, report, and either wait for the next click or close cleanly.
No ad-hoc improvisation after presenting.

## Scope boundaries

- **In:** `skills/core/aura-digest/SKILL.md` only — rewrite Step 4 + the "Scope and handoff" + `[ASK]` block; add a "Routing table" section (the per-section → action → `aura` use-case map, mirroring `digest-actions-and-followup`'s `buildActions`) and a "Clean close" terminal. Update the pipeline diagram + subcommand list to mention the dashboard.
- **Out:** any code (the mechanism is `digest-dashboard`; the data is `digest-actions-and-followup`); the `aura` skill's content (only routes into it); the markdown render path (stays).
- **Don't break existing steps:** Steps 1–3 (fetch → augment → render markdown) stay; the markdown digest remains available. Step 4 gains the interactive path as the primary, with the markdown path retained for reference/scripted use.

## Acceptance criteria

- Step 4 rewritten to: (a) `save` the corrected digest to `last-digest.json` (unchanged); (b) ensure `~/.pi/aura/digest.json` is written (per `digest-actions-and-followup`); (c) start the dashboard (`/digest-dashboard start` or the `digest-dashboard-start` tool) — the page opens; (d) **wait for the listener** to forward a click (`pi.sendMessage` customType `aura-digest-event`).
- On a forwarded click: load the `aura` skill; route on `action.aura_use_case` (task-management / artifact-management / capacity-planning / …); act on **one** action; use `action.instruction` as the human-readable form; write an `ack` event to `~/.pi/aura/state.json` (`{id, ts, dir:"agent→page", type:"ack", payload:{event_id, status:"done"}}`) and **clear** `followup.currentlyWorkingOn` in `~/.pi/aura/digest.json` (so the page hot-reloads); report the outcome; return to waiting.
- **Clean all-clear close:** if `actions[]` is empty or the user says "stop/done", end with a one-line verdict (e.g. `"Nothing needs you right now — 3 tasks committed, capacity 82%, no reviews owed."`), run `/digest-dashboard stop`, and stop — no dangling `[ASK]` prompt.
- A new **"Routing table"** section documents the section → action → `aura_use_case` map (mirroring `buildActions` in `digest-actions-and-followup`) so the SKILL.md reader understands which button becomes which capability.
- The `[ASK]` block is removed/replaced (the dashboard *is* the ask — no separate prompt); a note covers the teardown subcommand.
- The "Scope and handoff" section keeps the "load the `aura` skill" rule (now triggered by a click) and its conventions (`is_ai_generated`, `mcp*` variants, `recordTaskProgress`).
- The pipeline diagram + subcommand list mention `digest.json` + `state.json` + `/digest-dashboard start|stop`.

## Existing abstractions to use

- The existing Step 4 `save`/`cleanup` commands — `save` stays; `cleanup` (temp dir) stays; the dashboard adds `/digest-dashboard stop` for the server+listener.
- The `aura` skill + its use-case resources (task-management, artifact-management, capacity-planning) — route into them by `aura_use_case`.
- `~/.pi/aura/digest.json` (from `digest-actions-and-followup`) — the agent reads `actions[]` to know what's clickable, and writes `followup.currentlyWorkingOn`.
- `~/.pi/aura/state.json` (from `digest-dashboard`) — the agent writes `ack` events here.

## Architecture / domain decisions

- Per the grilling: one action at a time (Q7) via `followup.currentlyWorkingOn`; structured payload (Q6); routing table in `digest.json` (Q5); browser always available (Q8, so no no-browser branch in the SKILL.md); clean all-clear close (settled at map level).
- The agent's writes to `digest.json` (clearing `currentlyWorkingOn`) and `state.json` (ack) are direct file writes from the Node-side agent (the orchestrator runs `node`-side tools) — the SKILL.md documents the exact commands/shapes.

## Slices

### 1. `interactive-flow-step` (m)

Rewrite SKILL.md Step 4 to the start-dashboard → wait-for-click → act-on-one → ack+clear → report → wait/close flow. Add the `digest.json`/`state.json` write commands. Keep Steps 1–3 + the markdown path.

### 2. `agent-ack-and-followup-writer` (s)

Document the exact agent-side writes: the `ack` event shape for `state.json` and the `followup.currentlyWorkingOn` clear in `digest.json` (with a one-liner `node`/edit command), so the choreography is unambiguous.

### 3. `routing-table-and-clean-close-docs` (s)

Add the "Routing table" section (section → action → `aura_use_case` map) and the "Clean close" terminal (one-line verdict + `/digest-dashboard stop` + stop). Replace the `[ASK]` block.

## Implementation notes

### Slice 1 — `interactive-flow-step` (landed)

- SKILL.md Step 4 rewritten to the interactive dashboard 7-step flow: `save` → ensure `digest.json` → `/digest-dashboard start` → wait for listener click → load `aura` skill + act on one action → write `ack` to `state.json` + clear `followup.currentlyWorkingOn` in `digest.json` → report → wait or clean close.
- Pipeline diagram + subcommand list updated to mention `digest.json`, `state.json`, and `/digest-dashboard start|stop`.
- Steps 1–3 (fetch → augment → render markdown) and the `last-digest.json` store are unchanged; the markdown path stays as a reference/scripted output.
- Out-of-scope items (exact `node -e` ack/followup commands, the Routing table section, `[ASK]` removal, clean-close terminal) correctly deferred to slices 2 (`agent-ack-and-followup-writer`) and 3 (`routing-table-and-clean-close-docs`).

## Notes

- This task is prose-only (SKILL.md), but it's the **contract** the agent follows — precision matters. The slice docs demand exact commands + event shapes.
- The end-to-end loop (click → agent acts → ack → page updates) is only real once `digest-dashboard` is landed; this task's slices can be written against the landed mechanism.
