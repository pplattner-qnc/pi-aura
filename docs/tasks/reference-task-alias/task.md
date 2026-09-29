---
kind: task
type: feature
slug: reference-task-alias
title: Legacy @AURA- through the engine; the task extension shrinks to the probe
map: unified-reference-mentions
status: ready
blocked_by: [reference-engine-core]
slices: []
---

## What to build

`@AURA-42` keeps working but becomes a legacy alias registered in the
shared engine: the same autocomplete suggestions, and on submit the same
expansion path, so a legacy mention expands to the new `<task-ref>` tag
(never `<aura-task>`; there is exactly one expansion format regardless of
how the reference was typed). The first legacy-syntax use in a session
triggers a user-visible deprecation warning, once per session, stating
the syntax is deprecated and will be removed in a future version; the
warning is user-only and never enters the prompt sent to the model.

The old task extension shrinks accordingly: `aura-tasks.ts` keeps only the
session-start reachability probe. Its `@AURA-` autocomplete, expansion,
and `<aura-task>` system-prompt instruction are deleted; the engine's
instruction block becomes the only task-reference documentation in the
system prompt.

## Acceptance criteria

- [ ] `@AURA-42` still autocompletes and still expands on submit, now via the engine's alias registration.
- [ ] Legacy mentions expand to the same `<task-ref>` tag as `#task:` mentions.
- [ ] `<aura-task>` is no longer emitted anywhere.
- [ ] The first legacy-syntax token per session shows the deprecation warning exactly once (user-visible, not sent to the model).
- [ ] `aura-tasks.ts` keeps only the reachability probe; its autocomplete, expansion, and instruction block are removed.
- [ ] Exactly one task-reference instruction block remains in the system prompt (the engine's).
- [ ] Unknown keys are still left as typed; without Aura credentials the legacy path no-ops silently.

## Blocked by

- reference-engine-core
