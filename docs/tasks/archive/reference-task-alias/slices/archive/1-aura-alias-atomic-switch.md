---
kind: slice
slug: 1-aura-alias-atomic-switch
title: "Atomic switch: the engine owns @AURA-, aura-tasks shrinks to the probe"
task: ../task.md
mode: afk
status: done
size: m
legacy_blocked_by: []
---

## End-to-end behavior

`@AURA-42` keeps working, now as the first production alias registered in
the reference engine. Typing `@AURA-<partial>` offers the same task
suggestions as before (selecting one inserts the legacy `@AURA-<number>`
token); on submit the mention resolves through the task adapter and
expands to the same `<task-ref key status>title</task-ref>` tag as
`#task:` (never `<aura-task>`); the first submitted prompt containing a
legacy mention triggers the user-only deprecation warning exactly once
per session. In the same landing, `aura-tasks.ts` shrinks to the
reachability probe: its autocomplete, expansion, and instruction code is
deleted, leaving the engine's block as the only task-reference
instruction. Unknown keys stay as typed; without credentials the legacy
path no-ops silently, same as the `#task:` path.

## Acceptance criteria

- [ ] The engine registers `@AURA-<digits>` as a production alias (group 1 = full key minus the trigger character) in the same landing that removes the old handling; no intermediate state exists where both paths transform mentions.
- [ ] `@AURA-<partial>` autocompletes task suggestions; selection inserts `@AURA-<number>`.
- [ ] `@AURA-42` expands to the same `<task-ref>` tag as `#task:AURA-42`, cache-first with the `getTaskByHumanKey` fallback; unknown keys are left as typed.
- [ ] `<aura-task>` is no longer emitted anywhere.
- [ ] The deprecation warning fires exactly once per session, on the first submitted legacy mention, via `ctx.ui.notify` only (never in the prompt sent to the model).
- [ ] `aura-tasks.ts` keeps only the reachability probe and its tests; the extension stays registered in the package manifest.
- [ ] Exactly one task-reference instruction block remains in the system prompt.
- [ ] Without Aura credentials both the alias autocomplete and expansion silently defer; nothing throws into the session.
- [ ] Unit tests cover the real alias end-to-end: extraction at boundaries, expansion routing through the task adapter, the once-per-session warning, and unknown-key passthrough.

## Test plan

Seams: the alias registration through the existing pure engine functions
(extraction, expansion, warning decision); the shrunk aura-tasks module
(probe only).

Failure modes: no credentials (defer everywhere, no fetch); unknown key
after cache and targeted lookup (left as typed); alias mention plus
`#task:` mention in the same prompt (both expand through the same
adapter).

Scenarios: `@AURA-42` at start/middle/end of the prompt; `@aura-42`
case-insensitive with canonical expansion; two legacy mentions in one
prompt (one warning, both expand); legacy and new syntax side by side;
the warning latch resets only on a new session (per-session decision
function).

Edge cases: `@AURA-` with no digits (no match, no warning);
`foo@AURA-42` mid-word (no match); the old tests' expectations removed
with the code they covered.

## Constraints

- Atomic landing: registration + deletion in one slice, no split.
- No engine surgery: the alias rides the existing registry API.
- `engineering-rules.ts` is out of scope (the rule ticket migrates it).
- No em-dashes in prose; strip-types test entry preserved.
