# Architecture spec: reference-rule-kind

Status: approved (two slices, m each; levels [1] then [2]).

- Task doc: `docs/tasks/reference-rule-kind/task.md`
- Effort spec: `docs/tasks/unified-reference-mentions/spec.md`
- Map: `docs/tasks/maps/unified-reference-mentions/map.md`
- As-built reference: `extensions/aura-references.ts` (engine, adapters,
  alias registry), `extensions/engineering-rules.ts` (rule loading,
  frontmatter dispatch, `@rule:` resolver and autocomplete), the
  prototype decision `docs/tasks/reference-expansion-ux-prototype/
  variants.md` (Variant B formats), and ticket 3's landed alias
  registration as the pattern to mirror.

## Shape

The rule kind joins the reference family as the only local kind: no
Aura, no credentials, no cache rows, works offline. Two slices; slice 1
introduces `#rule:` (a new token, safe interim state), slice 2 migrates
`@rule:` (the atomic switch).

## Reuse, do not reimplement

Rule loading and frontmatter parsing STAY in `engineering-rules.ts`
(`loadRules`, `parseFrontmatter`, the `Rule` type). The engine's rule
adapter imports them (`import { loadRules, type Rule } from
"./engineering-rules.ts"`). Both modules are strip-types-clean (node
builtins + type-only pi imports), so the static cross-extension import
preserves the `node --experimental-strip-types` test entry. If the import
proves brittle in practice, the fallback is a thin loader in the adapter
delegating to the same parsing rules, recorded as a deviation.

## Slice 1: `#rule:` kind end-to-end

- Adapter: kind `rule`; `searchLocal` filters loaded rules by name
  substring (case-insensitive); no `searchServer`, no `warmup` against
  Aura (loading the local rules at session start is the cheap local
  equivalent); `resolveFullToken` matches by name; `formatExpansion`
  emits `<rule-ref name="..." attach="...">title</rule-ref>` where the
  element text is the rule's display title (frontmatter name, falling
  back to the rule name) per the prototype decision.
- Autocomplete rows: `#rule:<name>` with the attach mode as the
  description (`(manual)` / `(glob: ...)`, matching the current
  `@rule:` rows' information). Selection inserts `#rule:<name>`.
- Body injection: the engineering-rules `before_agent_start` resolver
  fires for `#rule:` mentions too. CRITICAL wrinkle: the engine's input
  transform rewrites `#rule:<name>` to the `<rule-ref name="...">`
  element BEFORE `before_agent_start` runs, so the resolver must match
  BOTH raw `#rule:<name>` tokens AND expanded `<rule-ref name="...">`
  elements. Same for the alias expansion in slice 2.
- The engine's per-turn instruction block grows the rule-ref shape.
- Unresolvable `#rule:` names stay as typed (no server fallback; rules
  are local).

## Slice 2: `@rule:` alias migration (atomic)

- Register `@rule:<name>` as the second production alias through
  `registerAlias` (pattern at a token boundary, group 1 = the rule
  name), mirroring ticket 3's `@AURA-` registration: autocomplete
  offers the loaded rules, selection inserts `@rule:<name>`, expansion
  routes through the rule adapter, body injection unchanged.
- In the SAME landing, `engineering-rules.ts` loses its `@rule:`
  autocomplete provider (atomic: with the alias registered, the old
  provider would double-answer the same tokens). It keeps rule
  loading, frontmatter dispatch, always-on/glob system-prompt sections,
  and the body-injection resolver.
- The once-per-session deprecation warning is shared across aliases
  (the existing decision function): the first legacy token of either
  syntax fires it once.

## Do NOT touch

- The engine's cache, SWR, warmup internals: the rule adapter rides the
  registry like the task adapter did.
- `aura-tasks.ts` (probe only since ticket 3).
- The `@AURA-` alias behavior landed in ticket 3.

## Seams under test

- The rule adapter's pure functions: local filtering, row formatting,
  expansion, resolution (no network, no cache).
- The alias recognition for `@rule:` (extraction at boundaries, group 1
  contract, warning latch shared with `@AURA-`).
- The engineering-rules resolver: matching raw tokens and expanded
  elements; unresolvable names ignored.
- Repo test conventions unchanged: pure exported functions,
  `node --experimental-strip-types` + `node:assert`.

## Interface contract for the remaining tickets

Tickets 5 and 6 (artifact, wiki) follow the task-adapter shape (server
kinds with cache rows); the rule kind establishes the local-kind
pattern and the body-injection coexistence with the input transform,
which the rule ticket must document for any future local kind.
