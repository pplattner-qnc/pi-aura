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

### Slice 2: 2-rule-alias-atomic-switch (landed)

- The registration: `createRuleAlias(ruleAdapter, getRules)` builds the
  alias and the extension factory registers it right after
  `createAuraTaskAlias`, in the SAME landing that deletes the rules
  extension's own `@rule:` autocomplete provider (atomic: with the alias
  registered, the old provider would double-answer the same tokens; the
  commit before the switch is red tests only).
- The pattern pins the legacy grammar: `(?:^|[ \t])@rule:([a-z0-9-]+)$`
  with the `i` flag. Token boundary before `@`; the name charset is the
  legacy resolver's (letters, digits, hyphens), because one pattern
  serves both autocomplete (the partial while typing) and submit (the
  full key) per the alias capture-group contract; an empty name is a
  non-mention (no suggestions, no warning). Scanning on submit drops the
  `$` anchor through the engine's `globalScanPattern`, so trailing
  punctuation stays lenient exactly as the legacy resolver was.
- The alias rows reuse the rule adapter's `formatRow` for the
  description (the attach mode) and swap value/label to the legacy
  `@rule:<name>` token, so selection keeps the user in the syntax they
  typed while the deprecation warning teaches `#rule:`. Like the
  adapter, the alias's `searchLocal` hook filters the loaded rules via
  the shared `getRules` accessor and ignores the cache items (rules
  never ride the reference cache).
- The warning latch is shared across aliases unchanged:
  `promptHasLegacyMention` iterates every registered alias pattern, and
  the one `createDeprecationWarningDecision` per session means the first
  legacy token of either `@AURA-` or `@rule:` syntax fires the warning
  exactly once (user-only, via `ctx.ui.notify`, never in the prompt).
- `engineering-rules.ts` after the shrink: rule loading
  (`loadRules`), frontmatter parsing, glob/settings helpers, the
  always-on and on-demand system-prompt sections, and the
  body-injection resolver (`collectRuleMentionNames` +
  `resolveRuleMentions`). Deleted: `extractRuleToken`, `formatRuleItem`,
  `createRuleAutocompleteProvider`, the structural autocomplete types,
  `RULE_TOKEN_PREFIX`, and the `session_start` provider registration.
  `engineering-rules.test.ts` pins the module surface so nothing
  regrows into it. The on-demand section prose now teaches `#rule:<name>`
  (legacy form noted).
- Tests: 4 new sections in `aura-references.test.ts` (recognition through
  the real pattern, legacy autocomplete rows, expansion routing
  including both syntaxes side by side and the dual body injection, the
  shared warning latch across both aliases); `engineering-rules.test.ts`
  swaps the extractor section for the module-surface pin. All extension
  suites, root vitest 236, shared 202, both typechecks green; the
  `atlassian-provision.test.ts` red is pre-existing and out of scope.
