---
kind: slice
slug: 3-inline-expansion-instruction-aliases
title: "Inline expansion, system-prompt instruction, dormant alias machinery"
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: [1-task-autocomplete-warm-cache]
---

## End-to-end behavior

On submit, a `#task:AURA-42` mention in the prompt expands inline to
`<task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>` (the
title XML-escaped; attribute values escaped for `"`, `&`, `<`).
Resolution is cache-first, then a targeted `getTaskByHumanKey` lookup;
unresolvable references stay exactly as typed so the agent can resolve
them via the `aura` skill. The system prompt gains a per-turn instruction
block documenting the task-ref shape and pointing to the `aura` skill
for any action beyond reading the reference. The alias registry exists
(register a legacy token pattern to a kind adapter, arm the
once-per-session deprecation warning) but no alias is registered yet; a
unit test registers a synthetic alias to prove the machinery. Legacy
`@AURA-` behavior is untouched: `aura-tasks.ts` still emits its
`<aura-task>` form (the interim double instruction block is accepted
until the task-alias ticket).

## Acceptance criteria

- [ ] Expansion format: `<task-ref key status>title</task-ref>` with the title XML-escaped and attribute values escaped for `"`, `&`, `<`.
- [ ] Resolution is cache-first with the `getTaskByHumanKey` fallback; unresolvable references are left exactly as typed.
- [ ] A prompt without references passes through unchanged (fast path).
- [ ] The per-turn system-prompt instruction block documents the task-ref tag and the `aura` skill pointer.
- [ ] The alias registry is present and unit-tested with a synthetic alias: recognition, expansion routing to the kind adapter, warning exactly once per session, warning decision is user-only (never added to the prompt).
- [ ] No alias is registered in the production wiring.
- [ ] Legacy `@AURA-` behavior is unchanged (`aura-tasks.ts` still expands to `<aura-task>`).

## Test plan

Seam: expansion (pure function: prompt + injected lookup to expanded
text); alias registry (pure).

Failure modes: cache miss then targeted fetch miss (unchanged); targeted
fetch throws (unchanged); credentials absent (no targeted fetch at all).

Scenarios: single mention; multiple mentions; mixed known and unknown
mentions; a title containing `&`, `<`, `"`; key and status attribute
escaping; the mention at start, middle, and end of the prompt; duplicate
mentions; case-insensitive token matching with canonical key output.

Edge cases: a mention adjacent to punctuation; an expansion that makes
the prompt longer than before (no truncation); the alias warning flag
reset per session; a synthetic alias whose expansion routes through the
task adapter.

## Constraints

- Bodies are never inlined into the prompt (map constraint); the
  reference carries only key, status, and title.
- The instruction block is engine-owned; `aura-tasks.ts`'s
  `AURA_TASK_INSTRUCTION` stays in place until the task-alias ticket
  removes it.
- No em-dashes in prose.
