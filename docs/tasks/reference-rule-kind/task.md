---
kind: task
type: feature
slug: reference-rule-kind
title: "#rule: and legacy @rule: through the engine"
map: unified-reference-mentions
status: ready
blocked_by: [reference-engine-core]
slices: []
---

## What to build

Cursor-style rules join the reference family. Typing `#rule:` opens
autocomplete over the repo's loaded rules (local-only: filesystem search,
no server, no cache), matching by name substring; selecting one inserts
`#rule:<name>`. On submit the mention expands inline to
`<rule-ref name="..." attach="...">title</rule-ref>` and the mentioned
rule's body is still injected into the system prompt for that turn, the
established `@rule:` behavior now firing for `#rule:` too.

`@rule:name` keeps working as a legacy alias registered in the engine:
same expansion, same body injection, plus the once-per-session
deprecation warning. The rules extension keeps rule loading, frontmatter
dispatch, and the always-on/glob system-prompt sections, but its own
`@rule:` autocomplete moves to the engine. The exact file split is left
to implementation. Rules keep working offline without Aura credentials.

## Acceptance criteria

- [ ] `#rule:<name>` autocompletes from the loaded rules by name substring and inserts the token.
- [ ] On submit, `#rule:` mentions expand to `<rule-ref name="..." attach="...">title</rule-ref>`.
- [ ] A mentioned rule's body is injected into the system prompt that turn, for both `#rule:` and legacy `@rule:` mentions.
- [ ] `@rule:` keeps working as an engine alias and triggers the once-per-session deprecation warning on first use.
- [ ] Rule search is local-only (filesystem); no Aura credentials or network are involved.
- [ ] The rules extension keeps loading, frontmatter dispatch, and the always-on/glob sections; its autocomplete provider is gone from the extension.
- [ ] Unresolvable rule names are left as typed.
- [ ] Unit tests cover the rule adapter's pure seams: filtering, row formatting, expansion, and alias recognition.

## Blocked by

- reference-engine-core
