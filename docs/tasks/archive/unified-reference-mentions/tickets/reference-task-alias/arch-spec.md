---
type: arch spec
title: "Architecture spec: reference-task-alias"
status: stable
---
# Architecture spec: reference-task-alias

Status: approved (one atomic slice, size m).

- Task doc: `docs/tasks/reference-task-alias/task.md`
- Effort spec: `docs/tasks/unified-reference-mentions/spec.md`
- Map: `docs/tasks/maps/unified-reference-mentions/map.md`
- As-built reference: `extensions/aura-references.ts` (read it first; the
  alias machinery is live code, not a sketch) and the archived ticket-1
  task doc's Implementation notes.

## The one rule: atomicity

The alias registration in the engine and the deletion of the old
`@AURA-` handling in `aura-tasks.ts` MUST land in the same commit/merge.
While the engine's alias is registered, the old extension's `input`
handler would also transform the same mention (two transforms racing on
one prompt). There is no safe intermediate state; this is why the ticket
is one slice.

## Shape

`@AURA-<digits>` becomes the first production alias registered through
the engine's existing `registerAlias(LegacyAlias)` API:

- Pattern: `@AURA-` at a token boundary (start of line or after
  whitespace) followed by digits; capture group 1 = the full key minus
  the trigger character (e.g. `AURA-42`), per the pinned contract.
- Cursor recognition: the same task suggestions appear while typing
  `@AURA-<partial>`; selecting one inserts the LEGACY token
  `@AURA-<number>` (the user stays in the syntax they typed; the warning
  teaches the new one).
- Expansion: `@AURA-42` resolves through the task adapter
  (`resolveFullToken`: cache-first, `getTaskByHumanKey` fallback,
  no-credential gate) and expands to the same `<task-ref>` tag as
  `#task:`. Unknown keys stay as typed. `<aura-task>` is never emitted
  again, anywhere.
- Warning: the once-per-session deprecation decision
  (`createDeprecationWarningDecision`) goes live with the first
  registered alias; it fires as a user-only `ctx.ui.notify` on the first
  submitted prompt containing a legacy mention (the as-built trigger
  point is the `input` handler, i.e. submit, not autocomplete).

## aura-tasks.ts after this ticket

Keeps ONLY the reachability probe: `checkAuraReachable`,
`formatUnreachableWarning`, the `session_start` fire-and-forget probe
wiring, and the probe's tests. Deleted: the autocomplete provider, the
`input` expansion handler, the `AURA_TASK_INSTRUCTION` block and its
`before_agent_start` hook, and every pure function only they used
(token extraction, filtering, expansion, unresolved-mention collection,
key resolution, the task cache). The extension stays registered in the
package manifest (the probe remains live). Exactly one task-reference
instruction block remains in the system prompt: the engine's
`TASK_REF_INSTRUCTION`.

## Do NOT touch

- `engineering-rules.ts` (its `@rule:` handling migrates in the rule
  ticket, not here).
- The engine's cache, SWR, warmup, or adapter internals: the alias rides
  the existing registry; no engine surgery.
- The reachability probe's dynamic-import seam and test style.

## Interface contract for the rule ticket (reference-rule-kind)

The alias registration pattern set here (pattern + capture-group
contract + kind mapping + insert-the-legacy-token autocomplete) is the
same contract `@rule:` will use; document any friction the real
registration surfaces so the rule ticket does not rediscover it.
