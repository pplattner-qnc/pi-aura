---
type: deviation report
title: 1-rule-kind-hash-token
status: stable
---
## Deviation report: 1-rule-kind-hash-token

Scope reviewed: `git diff 6aa4a011..2ff930e4` (2 commits, 2 files:
`extensions/aura-references.ts`,
`extensions/engineering-rules.ts`). Tests run: `node
--experimental-strip-types extensions/aura-references.test.ts` passes
(47 sections), `engineering-rules.test.ts` passes (14 sections), and the
remaining extension suites (`aura-tasks`, `aura-health`,
`aura-reference-cache`, `aura-feedback`, `aura-secrets`) pass; root vitest
236 green (one flaky first-run failure in `test/`, which this diff cannot
reach: vitest includes only `test/**`, the diff touches only
`extensions/`), shared `tsx --test` 202 green, both typechecks clean, the
`aura.mjs` bundle builds. The pre-existing red
(`atlassian-provision.test.ts`) is out of scope
(`docs/bugs/atlassian-provision-test-broken-import.md`).

### API surface changes

- **Planned (arch spec):** a rule adapter behind the common interface
  (local search by name substring, no `searchServer`, no `warmup` against
  Aura, name-matching resolution, the `<rule-ref>` expansion), rule
  loading reused from `engineering-rules.ts` by import, the resolver
  matching raw tokens and expanded elements, the instruction block
  growing the rule-ref shape.
- **Actual:** all of that landed as specified, with these additions:

  1. **`KindAdapter.local?` (additive interface flag).** The factory's
     input handler previously passed `null` as the lookup in a
     credential-less session, which would have left every `#rule:` mention
     as typed and violated "rules keep working offline without Aura
     credentials". The gate is now per kind: local kinds resolve always,
     server kinds only when the client probe succeeded. This is the
     local-kind pattern the arch spec asks the rule ticket to document
     for any future local kind.
  2. **Rules ride engine memory, not the reference cache.** The arch
     spec's "no cache rows" is implemented as: the factory loads the
     session's rules (`loadRules(ctx.cwd)`) and hands them to the adapter
     through a `getRules` accessor; the adapter's `searchLocal` and
     `resolveFullToken` ignore the cache items they are handed (rules are
     cwd-local; persisting rows in the shared sqlite store would
     cross-contaminate repos). No cache reads or writes anywhere in the
     rule path, matching the seams line "resolution (no network, no
     cache)".
  3. **`Rule.displayName?` (optional, populated by `loadRules`).** The
     display title (frontmatter `name` falling back to the rule name) had
     no carrier on the loaded `Rule`. Rule loading and frontmatter parsing
     stay in `engineering-rules.ts`; the loader now also keeps the parsed
     frontmatter name. No parsing is reimplemented.
  4. **`ruleToReferenceItem` / `filterRuleItems` / `createRuleAdapter` /
     `RULE_KIND` (exported).** The pure seams the tests pin. The item
     mapping: `id` = relPath (unique across subdirectories), `key` = the
     rule name, `title` = the display title, `status` = the attach
     summary (glob rules carry their patterns, so the row description
     matches the legacy `@rule:` rows' information; always-on rules read
     `(always)`, the legacy rows' `(manual)` for them was misleading).
  5. **`collectRuleMentionNames` (exported, in engineering-rules.ts).**
     The resolver's mention scan extracted as a pure seam: legacy
     `@rule:` tokens, new `#rule:` tokens (both grammars `[a-z0-9-]+`,
     so trailing punctuation stays lenient as before), and expanded
     `<rule-ref name="...">` elements.
  6. **`TASK_REF_INSTRUCTION` renamed to `REFERENCE_INSTRUCTION`.** The
     per-turn block now documents both tag shapes (task-ref + rule-ref,
     the aura-skill pointer for tasks, the body-injection note for
     rules); the old name would have been a lie.

### Abstraction usage

- Used/was specified: **yes.** The static cross-extension import
  (`import { loadRules, type Rule } from "./engineering-rules.ts"`)
  keeps the `node --experimental-strip-types` entry runnable (both
  modules are node builtins + type-only pi imports); no fallback loader
  was needed. No new dependency (`package.json` untouched), pure
  exported functions + `node:assert`, dynamic-import seams preserved, no
  runtime deps beyond the pi peer dep.

### Out-of-scope changes

- None. The `aura.mjs` bundle was rebuilt locally by the CI gate but its
  (vendored-yaml-drift) diff was reverted: it is unrelated to this
  ticket.

### Divergence from the slice doc's acceptance criteria

One deliberate presentation change inside the body-injection resolver:
the per-rule block header was `### Rule: <name> (@rule:<name>)` and is
now `### Rule: <name>`. The echo claimed a specific mention syntax while
mentions now arrive in three forms (`@rule:`, `#rule:`, `<rule-ref>`),
and the rule name is already the header. Which bodies inject, and when,
is unchanged (the legacy `@rule:` semantics are byte-identical otherwise;
the section header `## Engineering Rules (@mentioned this turn)` stays).
Everything else conforms: the adapter behind the common interface with
local-only name-substring search and no cache writes, loading reused by
import, `#rule:<name>` rows with the attach mode (plus glob patterns) as
the description, the prototype-pinned expansion with the display title as
element text, dual matching through `collectRuleMentionNames` (pinned
end-to-end: the engine expands a `#rule:` mention and the resolver
injects the body from the resulting `<rule-ref>` element), unresolvable
names left as typed, the instruction block documenting the rule-ref shape
alongside task-ref, and the legacy `@rule:` autocomplete untouched in
this slice.

### Task doc update needed?

Yes. Appended (this commit): the adapter shape, the engine-memory
decision for rules, the per-kind resolution gate, the displayName
addition, the attach-summary semantics, and the test inventory.

### User attention needed?

No. The behavior deltas (always-on rules described `(always)` instead of
`(manual)` in rows; the per-rule header echo dropped) are presentation
corrections aligned with the slice's own wording ("the attach mode as
the description"); no pinned output regressed.
