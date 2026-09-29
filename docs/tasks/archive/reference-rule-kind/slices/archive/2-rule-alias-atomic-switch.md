---
kind: slice
slug: 2-rule-alias-atomic-switch
title: "@rule: alias through the engine; engineering-rules loses its autocomplete"
task: ../task.md
mode: afk
status: done
size: m
blocked_by: [1-rule-kind-hash-token]
---

## End-to-end behavior

`@rule:name` keeps working, now as the second production alias
registered in the engine, mirroring ticket 3's `@AURA-` switch: typing
`@rule:<partial>` offers the same loaded rules (selection inserts
`@rule:<name>`); on submit the mention expands through the rule adapter
to the same `<rule-ref>` tag and the rule's body is still injected into
the system prompt that turn. The once-per-session deprecation warning
is shared across aliases: the first legacy token of either `@AURA-` or
`@rule:` syntax fires it exactly once. In the same landing,
`engineering-rules.ts` loses its `@rule:` autocomplete provider (atomic:
the old provider and the engine alias would otherwise double-answer the
same tokens); it keeps rule loading, frontmatter dispatch, always-on and
glob system-prompt sections, and the body-injection resolver.

## Acceptance criteria

- [ ] `@rule:<name>` is registered as a production alias (token-boundary pattern, group 1 = the rule name) in the same landing that removes the old provider.
- [ ] `@rule:` autocompletes the loaded rules via the engine; selection inserts `@rule:<name>`.
- [ ] `@rule:name` expands to the same `<rule-ref>` tag as `#rule:name`; the rule body is injected that turn.
- [ ] The deprecation warning fires once per session on the first legacy token of either alias syntax (user-only, never in the prompt).
- [ ] `engineering-rules.ts` keeps loading, frontmatter dispatch, always-on/glob sections, and the resolver; its autocomplete provider is gone.
- [ ] Rules keep working offline without Aura credentials.
- [ ] The `@AURA-` alias behavior from ticket 3 is unchanged.
- [ ] Unit tests cover the alias recognition, the shared warning latch across both aliases, and the provider removal (no double answers).

## Test plan

Seams: alias extraction at boundaries; the shared warning decision; the
shrunk engineering-rules module (resolver + sections only).

Failure modes: no rules directory (both syntaxes defer); unknown rule
name (left as typed, no body injected); no credentials (irrelevant for
rules, verify nothing changed).

Scenarios: `@rule:tracker-aura` at start/middle/end of the prompt;
`@rule:` and `#rule:` mentions in the same prompt (both expand, both
inject, one warning); `@AURA-42` and `@rule:x` in the same session
(first fires the warning, second does not); always-on and glob sections
still present in the system prompt.

Edge cases: `@rule:` with an empty name (no match); `@RULE:` uppercase
(recognized, canonical insertion); the old provider's tests removed
with the code they covered.

## Constraints

- Atomic landing: alias registration + provider removal in one slice.
- No engine surgery beyond the alias registration.
- No em-dashes in prose.
