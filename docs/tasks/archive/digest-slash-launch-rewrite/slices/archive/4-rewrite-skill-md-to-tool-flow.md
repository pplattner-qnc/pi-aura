---
kind: slice
slug: rewrite-skill-md-to-tool-flow
title: Rewrite the aura-digest SKILL.md body to call tools (no bash shell-outs)
task: ../task.md
mode: hitl
size: m
blocked_by: [skill-non-model-invokable-and-skill-injection]
status: done
---

## End-to-end behavior

The `aura-digest` SKILL.md body no longer shells out to
`aura-digest.mjs fetch`/`save` via bash + parses stdout. The flow calls the
typed tools: `digest-fetch` → augment → `digest-save` → `digest-dashboard-
start` → wait for clicks → act on one via `aura` → `ack` + clear →
`digest-dashboard-stop`. The routing table + clean close + the `node -e`
ack/clear one-liners stay (those are agent-side writes, not fetch).

## Acceptance criteria

- SKILL.md Step 1 (fetch) → calls the `digest-fetch` tool; no `node ...
  aura-digest.mjs fetch` bash command. The tool returns `{ digest, report }`;
  the orchestrator fills `summary` + re-ranks `actions[]` from `report`
  (judgment work, unchanged).
- Step 4 (start) → calls `digest-dashboard-start` tool (not the slash); the
  `digest-save` tool replaces the `save` bash command.
- `render`/`cleanup`/`diff`/`last` drop from the skill (the dashboard is the
  render; `diff`/`last` can stay as `.mjs` CLI-only if useful, not in the
  skill).
- The routing table section, the "Agent-side writes" `node -e` one-liners
  (ack + clear `currentlyWorkingOn`), the clean close, and the `aura`-skill
  handoff stay (they're agent-side, not fetch).
- Real-data e2e: `/digest` → `digest-fetch` (real) → augment → `digest-save`
  → `digest-dashboard-start` → dashboard renders real data → click → agent
  acts → ack+clear → clean close.

## Test plan

- **Seams:** the skill prose — verify by a reader (the agent) following it
  end-to-end against the landed tools (hitl e2e).
- **Scenarios:** (a) `/digest` → full flow runs via tools; (b) no bash
  shell-outs in the prose; (c) the clean close + routing table + ack one-
  liners intact.
- **Failure modes:** a tool returns an error → the skill tells the agent to
  surface it (not crash).
- **Edge cases:** the `digest-fetch` tool's temp-dir cleanup — the skill
  notes the tool handles it (or drops cleanup entirely since the dashboard
  is the render).

## Constraints and dependencies

- `blocked_by: [skill-non-model-invokable-and-skill-injection]` (the skill
  is hidden + the tools exist).
- Keep the `node -e` ack/clear one-liners (they're agent-side writes to
  `state.json`/`digest.json`, not fetch — those stay).
