---
kind: slice
slug: skill-drop-markread
title: "SKILL.md: drop auto markAllNotificationsRead, document no-mutate"
task: ../task.md
mode: hitl
status: done
size: s
blocked_by:
  - notif-window-fetch
---

## End-to-end behavior

`skills/aura-digest/SKILL.md` Step 4 no longer instructs the orchestrator
to mark notifications read. A one-line note records that the digest does
not mutate notification read state.

## Acceptance criteria

- The Step 4 bullet `Mark notifications read via MCP:
  \`aura-mcp-dev_markAllNotificationsRead()\`` is deleted.
- The `save` and `cleanup` bullets remain intact and in order.
- A short note is added stating the digest does **not** mark
  notifications read (so the behavior is documented, not just absent).
- No other section of SKILL.md is changed.

## Test plan

- **Seams:** documentation only — read the resulting Step 4.
- **Failure modes:** none (no code).
- **Scenarios:** confirm no remaining wording in SKILL.md implies
  notifications are auto-cleared or auto-marked-read.
- **Edge cases:** the `diff`/`last` sections still reference
  `last-digest.json` correctly — do not touch them.

## Constraints / dependencies

- Blocked by `notif-window-fetch` (natural ordering: code lands first,
  then the orchestration doc; no live code dependency).
