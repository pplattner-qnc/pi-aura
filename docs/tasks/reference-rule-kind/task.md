---
kind: task
type: feature
slug: reference-rule-kind
title: "#rule: and legacy @rule: through the engine"
map: unified-reference-mentions
status: ready
blocked_by: [reference-engine-core]
slices: [1-rule-kind-hash-token, 2-rule-alias-atomic-switch]
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

## Implementation notes

### Slice 1: 1-rule-kind-hash-token (landed)

- The adapter: `createRuleAdapter({ getRules })` in `aura-references.ts`,
  kind `rule`, `local: true`. `searchLocal` filters the loaded rules by
  name substring (case-insensitive, loaded order, capped at
  `MAX_SUGGESTIONS`) through the exported `filterRuleItems`; `resolveFullToken`
  matches by name case-insensitively (duplicate names pick the first
  loaded); `searchServer` returns `[]` and there is no warmup. The
  factory registers it beside the task adapter and loads the rules at
  `session_start` (`loadRules(ctx.cwd)`), handing them to the adapter
  through the accessor (a `/reload` re-emits `session_start` and swaps
  the set).
- Rules ride engine memory, not the reference cache: rule rows are
  cwd-local, so persisting them in the shared sqlite store would
  cross-contaminate repos. The adapter's `searchLocal`/`resolveFullToken`
  therefore ignore the cache items they are handed; nothing in the rule
  path reads or writes any cache. This is the local-kind pattern for any
  future local kind.
- The `KindAdapter` interface gained the optional `local` flag, and the
  factory's input handler resolves per kind: local kinds expand without
  Aura credentials (rules work offline), server kinds stay gated on the
  one-shot client probe (the previous whole-session `null` lookup would
  have blocked offline rule expansion).
- The item mapping (`ruleToReferenceItem`): `id` = relPath (unique across
  subdirectories), `key` = the rule name (the token key), `title` = the
  display title, `status` = the attach summary. The `Rule` type gained
  the optional `displayName` (the frontmatter `name`, populated by
  `loadRules`, falling back to the filename-derived name); loading and
  frontmatter parsing stay in `engineering-rules.ts`, imported statically
  (the strip-types entry stays runnable; no fallback loader needed).
- The attach summary drives both the row description (`(manual)`,
  `(always)`, `(glob: **/*.md)`, matching the legacy `@rule:` rows'
  information; always-on rules previously read the misleading
  `(manual)`) and the expansion's `attach` attribute, so
  `<rule-ref name="tracker-aura" attach="manual">Tracker Aura</rule-ref>`
  matches the prototype decision and glob rules carry their patterns.
- The wrinkle: `collectRuleMentionNames` (exported from
  `engineering-rules.ts`) scans three mention forms, legacy `@rule:`
  tokens, new `#rule:` tokens, and expanded `<rule-ref name="...">`
  elements, because the engine's input transform rewrites `#rule:`
  mentions before `before_agent_start` runs. `resolveRuleMentions`
  builds on it; the per-rule block header dropped the `(@rule:<name>)`
  echo (mentions arrive in three forms; the rule name is the header).
  The token grammar stays `[a-z0-9-]+`, so trailing punctuation remains
  lenient as before.
- The per-turn instruction block grew from `TASK_REF_INSTRUCTION` into
  `REFERENCE_INSTRUCTION`: one block documenting the `<task-ref>` and
  `<rule-ref>` shapes, the `aura`-skill pointer for tasks, and the rule
  body injection for rules.
- Tests: 7 new sections in `aura-references.test.ts` (item mapping +
  filtering, rows + expansion, resolution, provider suggestions +
  deferral, expansion end-to-end + the wrinkle, the local-kind gate, the
  instruction block), 3 new + 1 reworked section in
  `engineering-rules.test.ts` (the mention scan, dual-matching resolver,
  display-title loading). All extension suites, root vitest 236, shared
  202, both typechecks green; the `atlassian-provision.test.ts` red is
  pre-existing and out of scope.
