## Deviation report: 2-rule-alias-atomic-switch

Scope reviewed: `git diff c81f1c1c..9514b859` (2 commits, 2 files:
`extensions/aura-references.ts`,
`extensions/engineering-rules.ts`). Tests run: `node
--experimental-strip-types extensions/aura-references.test.ts` passes
(51 sections), `engineering-rules.test.ts` passes (13 sections), and the
remaining extension suites (`aura-tasks`, `aura-health`,
`aura-reference-cache`, `aura-feedback`, `aura-secrets`) pass; root vitest
236 green, shared `tsx --test` 202 green, both typechecks clean. The
pre-existing red (`atlassian-provision.test.ts`, the ENOENT on the
walkthrough doc) is out of scope
(`docs/bugs/atlassian-provision-test-broken-import.md`).

### API surface changes

- **Planned (arch spec):** register `@rule:<name>` through the existing
  `registerAlias(LegacyAlias)` API mirroring ticket 3's `@AURA-`
  registration (token-boundary pattern, group 1 = the rule name), with
  the alias's own legacy-row autocomplete, expansion routing through the
  rule adapter, and the shared warning latch; in the same landing,
  `engineering-rules.ts` loses its `@rule:` autocomplete provider while
  keeping loading, frontmatter dispatch, always-on/glob sections, and
  the body-injection resolver; no engine surgery beyond the alias
  registration.
- **Actual:** all of that landed as specified through the existing API
  (`createRuleAlias(ruleAdapter, getRules)` is the exported registration
  builder; the factory registers it beside `createAuraTaskAlias`). Two
  additions worth recording:

  1. **The alias's `searchLocal` hook filters the loaded rules, not the
     passed cache items.** Same local-kind decision as slice 1: rules
     never ride the reference cache (cwd-local; persisting rows would
     cross-contaminate repos), so the hook closes over the same
     `getRules` accessor the adapter uses and ignores the (always empty)
     cache items the provider hands it.
  2. **The pattern pins the resolver's name grammar, not the old
     provider's partial grammar.** The old provider matched any
     non-space partial after `@rule:`; the alias pattern
     `(?:^|[ \t])@rule:([a-z0-9-]+)$` requires the legacy name charset
     (letters, digits, hyphens), because one pattern serves both
     autocomplete and submit per the capture-group contract. While
     typing, a partial containing characters outside that charset (dots,
     underscores) offers no rows; such names could never body-inject
     under the legacy resolver grammar either. On submit the global scan
     stops at the first non-name character, so trailing punctuation
     stays lenient exactly as the legacy resolver was.

### Abstraction usage

- Used/was specified: **yes.** The registration rides `registerAlias`
  and the `LegacyAlias.searchLocal` hook ticket 3 established (the
  interface contract the task-alias deviation report called out for this
  ticket); no engine surgery beyond it (the provider, cache, SWR, and
  expansion internals are untouched in this diff). No new dependency,
  pure exported functions + `node:assert` under
  `node --experimental-strip-types`, no runtime deps beyond the pi peer
  dep.

### Out-of-scope changes

- Two prose updates inside the rewritten module doc and the on-demand
  section: `engineering-rules.ts`'s header no longer documents the
  deleted `@mention` overlay (it points at the engine instead), and
  `buildListedRulesSection`'s prompt prose now teaches `#rule:<name>`
  (with the legacy `@rule:<name>` noted) instead of only the legacy
  form, matching the deprecation story. The session_start early-return
  became dead and was folded into the comment. Three em-dashes in the
  rewritten header block were reworded (repo convention; no blind
  substitution).

### Divergence from the slice doc's acceptance criteria

None. The atomic landing holds (registration + provider removal in one
commit, with a red-only test commit before it); recognition,
legacy-token insertion, expansion routing through the rule adapter
(the same `<rule-ref>` tag as `#rule:`), the once-per-session shared
warning latch (first legacy token of either syntax fires it exactly
once; user-only), the shrunk module (pinned by the module-surface test:
loading, frontmatter dispatch, sections, resolver, and nothing else),
offline rules, and the unchanged `@AURA-` behavior (its sections pass
byte-identically) all conform. The edge cases pin as specified: an empty
`@rule:` name is a non-mention, `@RULE:` is recognized with canonical
insertion, and the old provider's tests were removed with the code they
covered (the extractor section is replaced by the module-surface pin,
which is what makes "no double answers" a durable property rather than
a one-time observation).

### Task doc update needed?

Yes. Appended (this commit): the registration shape, the pattern
semantics and the grammar decision, the shared latch composition, and
the test inventory.

### User attention needed?

No. The one typing-behavior delta (a partial with characters outside
the name charset no longer offers rows while completing `@rule:`) only
affects names that could never resolve or body-inject under the legacy
grammar; the slice's pinned edge cases (empty name, uppercase, hyphens,
digits) all behave as specified.
