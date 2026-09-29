---
kind: slice
slug: 1-rule-kind-hash-token
title: "#rule: kind end-to-end (local search, expansion, body injection)"
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## End-to-end behavior

Typing `#rule:` opens autocomplete with the repo's loaded rules
(local-only: the adapter imports `loadRules` from
`engineering-rules.ts`; no server, no cache, works offline), matched by
name substring, case-insensitive. Rows show `#rule:<name>` with the
attach mode as the description; selecting one inserts `#rule:<name>`.
On submit the mention expands to
`<rule-ref name="..." attach="...">title</rule-ref>` where the element
text is the rule's display title (frontmatter name, falling back to the
rule name) per the prototype decision. The mentioned rule's body is
still injected into the system prompt for that turn: the
engineering-rules resolver fires on `#rule:` mentions and on the already
expanded `<rule-ref name="...">` elements (the input transform rewrites
mentions before `before_agent_start` runs). Unresolvable names stay as
typed. The engine's instruction block grows the rule-ref shape. The
legacy `@rule:` behavior in `engineering-rules.ts` is untouched in this
slice (the alias migrates in slice 2).

## Acceptance criteria

- [ ] The rule adapter is registered behind the common interface with local-only search by name substring; no Aura client, credentials, or cache writes are involved.
- [ ] Rule loading is reused from `engineering-rules.ts` by import; no frontmatter parsing is reimplemented.
- [ ] Autocomplete rows show `#rule:<name>` with the attach mode as the description; selection inserts `#rule:<name>`.
- [ ] Expansion emits `<rule-ref name attach>title</rule-ref>` with the display title as element text.
- [ ] A mentioned rule's body is injected into the system prompt that turn, matching on raw `#rule:` tokens and expanded `<rule-ref>` elements.
- [ ] Unresolvable rule names are left as typed.
- [ ] The per-turn instruction block documents the rule-ref shape alongside task-ref.
- [ ] Legacy `@rule:` autocomplete, expansion, and body injection in `engineering-rules.ts` are unchanged in this slice.
- [ ] Unit tests cover the adapter's pure seams and the resolver's dual matching.

## Test plan

Seams: the rule adapter's pure functions (filtering, row formatting,
expansion, resolution); the engineering-rules resolver (raw tokens and
expanded elements).

Failure modes: no `.cursor/rules` directory (adapter offers nothing,
defers); a rule file with malformed frontmatter (skipped as today); a
mention whose rule was deleted between loading and submit (left as
typed, no body injected).

Scenarios: `#rule:` empty partial lists all loaded rules; `#rule:track`
substring match; `#rule:tracker-aura` exact match expands and injects
the body; two `#rule:` mentions inject both bodies once each; the
instruction block contains the rule-ref shape; rules with glob and
manual attach modes both render.

Edge cases: rule names with hyphens and digits; case-insensitive
matching with canonical insertion; a rule whose frontmatter name differs
from its filename (element text uses the display title); duplicate
names across subdirectories (both match; expansion picks the first
loaded).

## Constraints

- Rules are local-only: no server search, no cache rows, no
  credentials.
- The static cross-extension import must keep the strip-types test
  entry runnable; if it cannot, delegate via a thin loader and record
  the deviation.
- No em-dashes in prose.
