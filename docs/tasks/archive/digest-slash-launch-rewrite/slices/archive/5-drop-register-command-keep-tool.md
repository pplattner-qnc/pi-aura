---
kind: slice
slug: drop-register-command-keep-tool
title: Remove the old /digest-dashboard command; keep registerTool inactive-by-default; final e2e
task: ../task.md
mode: hitl
size: s
blocked_by: [rewrite-skill-md-to-tool-flow]
---

## End-to-end behavior

The old `/digest-dashboard` extension command is removed (replaced by
`/digest`). The `registerTool` calls for start/stop stay (inactive by
default; activated by `/digest`). The full real-data e2e passes via the new
flow.

## Acceptance criteria

- `index.ts`: remove `pi.registerCommand("digest-dashboard", …)`. Keep
  `pi.registerTool` for `digest-dashboard-start`/`-stop` (registered, inactive
  by default — not in `getActiveTools()` until `/digest` activates them).
- The `/digest` command (slice 1) is the sole slash entry.
- Final e2e (hitl): fresh session → `/digest` → `digest-fetch` (real) →
  augment → `digest-save` → `digest-dashboard-start` → dashboard renders real
  Aura data → click → agent acts via `aura` → ack+clear → page hot-reloads →
  `/digest` flow ends with clean close (`digest-dashboard-stop`). Zero digest
  context before `/digest`.
- 42+ vitest tests green; the transition's old-command tests updated/removed.

## Test plan

- **Seams:** the removed command — verify `/digest-dashboard` is gone (not
  in the slash listing); `/digest` works.
- **Scenarios:** (a) `/digest-dashboard` no longer exists; (b) `/digest`
  runs the full flow; (c) zero idle context in a fresh session.
- **Failure modes:** any leftover reference to the old command → fix.

## Constraints and dependencies

- `blocked_by: [rewrite-skill-md-to-tool-flow]` (the skill is rewritten; this
  is the cleanup + final e2e).
- This is the final slice — after it, the feature task is done.
