---
kind: slice
slug: skill-non-model-invokable-and-skill-injection
title: Set aura-digest disable-model-invocation: true + confirm zero idle context
task: ../task.md
mode: hitl
size: s
status: todo
blocked_by: [digest-fetch-and-save-tools]
---

## End-to-end behavior

The `aura-digest` skill is hidden from the agent's system prompt
(`disable-model-invocation: true`); a fresh session has zero digest
footprint (no skill description, no tool descriptions) until `/digest` runs.

## Acceptance criteria

- `skills/core/aura-digest/SKILL.md` frontmatter: add
  `disable-model-invocation: true`.
- Verify (hitl): in a fresh pi session, the agent's system prompt does NOT
  include the `aura-digest` skill description + the `digest-*`/`digest-
  dashboard-*` tools are not in the active tool set (zero idle context).
- Verify: `/digest` still loads the skill (the injection from slice 1 works
  despite the skill being hidden from the system prompt — the injection
  bypasses the system-prompt description).
- `/skill:aura-digest` may still work (pi lists it) — acceptable (D1 only
  requires not-model-invokable; user-invokable via `/skill:` is harmless).

## Test plan

- **Seams:** the frontmatter change — verify via a fresh session's system
  prompt inspection (hitl). No unit test (it's a pi-runtime behavior).
- **Scenarios:** (a) fresh session → skill desc absent from system prompt;
  (b) `/digest` → skill content injected + agent runs it.
- **Failure modes:** if the injected skill doesn't run because it's hidden,
  record + return to Wayfinder (the hide + inject combination is the Fog
  risk).

## Constraints and dependencies

- `blocked_by: [digest-fetch-and-save-tools]` (the tools exist to activate).
- This is a one-line frontmatter change + a hitl verification.
