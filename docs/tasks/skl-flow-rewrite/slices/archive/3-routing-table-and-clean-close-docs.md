---
kind: slice
slug: routing-table-and-clean-close-docs
title: Add the Routing table section + Clean close terminal; replace the [ASK] block
task: ../task.md
mode: hitl
status: done
size: s
blocked_by: [agent-ack-and-followup-writer]
---

## End-to-end behavior

The SKILL.md has a "Routing table" section (section → action →
`aura_use_case` map) and a "Clean close" terminal (one-line verdict +
`/digest-dashboard stop` + stop). The old `[ASK]` block is removed (the
dashboard is the ask).

## Acceptance criteria

- A new **"Routing table"** section mirrors `buildActions` (`digest-actions-and-followup`):
  | Section | action | aura_use_case | Notes |
  |---|---|---|---|
  | 🔴 Overdue | advance | task-management | max 3 |
  | 🟡 Waiting on you | unblock | task-management | max 3 |
  | Reviews I owe (current) | review | artifact-management | review-decision flow is REST/UI; route via artifact-management |
  | Capacity >100% | flag_capacity | capacity-planning | 1 |
  | Corrections (stale) | — | — | informational, no button |
  | ⚠️ Warnings | run_setup | aura-digest | 1, only if warnings |
  | Active queue | advance | task-management | fill to max 6 |
- A **"Clean close"** terminal: when `actions[]` is empty or the user says "stop/done", emit a one-line verdict from the digest (e.g. `"Nothing needs you right now — N tasks committed, capacity X%, no reviews owed."`), run `/digest-dashboard stop` (teardown), and stop — **no dangling prompt**.
- The old `**[ASK]**` block is removed; the dashboard's buttons are the interaction. A one-line note says: interaction is via the dashboard page; teardown is `/digest-dashboard stop`.
- The "Scope and handoff" section keeps the "load the `aura` skill" rule (now triggered by a click) + the `is_ai_generated` / `mcp*` / `recordTaskProgress` conventions.

## Test plan

- **Seams:** prose — verify the routing table matches `buildActions`'s output (no drift) and the clean-close verdict is derivable from `digest.json` (`capacity.committed_pct`, `queue.length`, `reviews_owed.length`).
- **Scenarios:** (a) empty `actions[]` → clean close verdict + stop; (b) user "stop" mid-session → verdict + `/digest-dashboard stop` + stop; (c) a warnings-only digest → a `run_setup` action routes to `aura-digest` (not `aura`).
- **Failure modes:** routing table drifts from `buildActions` → the table references `buildActions` as the source of truth (so a future change updates one place).
- **Edge cases:** the verdict line's exact wording is illustrative; the SKILL.md gives the template, the agent fills it.

## Constraints and dependencies

- `blocked_by: [agent-ack-and-followup-writer]` (part of the same Step 4 rewrite).
- The routing table is a *reference*; `buildActions` is the source of truth — keep them in sync by reference, not by duplication.
