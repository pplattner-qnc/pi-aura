---
type: deviation report
title: 3-inline-expansion-instruction-aliases
status: stable
---
## Deviation report: 3-inline-expansion-instruction-aliases

Scope reviewed: `git diff task/reference-engine-core..HEAD` (10 commits, 2
files: `extensions/aura-references.ts` +290/-7,
`extensions/aura-references.test.ts` +396/-7). Tests run:
`node --experimental-strip-types extensions/aura-references.test.ts`
passes (35 sections, 8 new for this slice; all slice 1 and 2 seams
unchanged), plus regressions `aura-tasks.test.ts` and
`engineering-rules.test.ts` pass. `aura-tasks.ts`,
`engineering-rules.ts`, and `package.json` have an empty diff against
the task branch.

### API surface changes

- **Planned (arch spec, per-slice notes):** expansion formatting + the
  prompt transform, the instruction-block constant, the alias registry +
  warning decision function. Contract: the input handler resolves
  cache-first with the targeted `getTaskByHumanKey` fallback; the alias
  registry API is what the task-alias and rule tickets will call.
- **Actual:** all planned behavior landed and is test-pinned. One
  addition, three refinements worth recording:

  1. **`expandReferenceMentions(prompt, registry, lookup | null)` is
     async** (returns `Promise<string>`). The effort spec's seam 2 is
     phrased as "pure"; the injected lookup must be async because the
     targeted fallback is a server call, so the transform awaits it.
     Purity in substance is preserved: prompt, registry, and the
     injected `ReferenceResolver` (new exported type) are the only
     inputs, and tests inject fakes. Impact: none; callers in the
     factory wiring already await.
  2. **Alias registration is a method on the registry:
     `registry.registerAlias(alias)`**, additive to the slice 1
     `ReferenceRegistry` interface, mutating the alias table after
     construction. The arch spec's "register ... and arm the
     once-per-session deprecation warning" is implemented as
     always-armed factory wiring rather than a `registerAlias` side
     effect: `session_start` builds a fresh
     `createDeprecationWarningDecision()`, and the input handler
     consults `registry.aliases` and notifies through `ctx.ui.notify`.
     Registering through the API therefore arms the warning without an
     extra call. Functionally equivalent for the alias tickets.
  3. **The `LegacyAlias` capture-group contract was clarified in doc
     comments**: group 1 is the token text handed to the kind adapter,
     the full key minus the trigger char (e.g. pattern
     `@(AURA-[^\s]*)` capturing `AURA-42`), one group serving both
     autocomplete (the partial while typing) and submit (the full key
     to resolve). This resolves a latent disagreement between slice
     1's doc comment and the expansion path. The task-alias and rule
     tickets must write patterns to this shape.
  4. **`TASK_REF_INSTRUCTION`** (the per-turn block) and
     **`createDeprecationWarningDecision()`** (the latched
     once-per-session decision, rebuilt per `session_start`, so
     `/reload` re-arms it) are exported exactly as planned.

- **Impact on dependent slices:** no call site breaks (the registry
  change is additive; the transform is new). One downstream implication
  to pin for the task-alias ticket: with the group 1 contract, the
  autocomplete partial for an alias is the full key shape (e.g.
  `AURA-4` while typing `@AURA-4`). The task adapter's `searchLocal`
  keyMatch (key-number prefix) does not match that shape, so the
  task-alias ticket must adapt the partial (or extend keyMatch) when it
  wires alias autocomplete. This slice deliberately does not test alias
  autocomplete; its criteria cover recognition, expansion routing, and
  warning semantics, per the slice doc.

### Abstraction usage

- Used/was specified: **yes**, with one carried-over omission.
- `before_agent_start` system-prompt append pattern: used
  (`TASK_REF_INSTRUCTION` re-applied per turn, mirroring
  `aura-tasks.ts` and `aura-skill-instruction.ts`).
- `ctx.ui.notify` for the user-visible warning: used in the factory
  wiring (same channel as the VPN warning).
- `createDefaultAuraClient` behind the dynamic-import seam: used; the
  expansion gate latches `clientAvailable` from the same one-shot
  `session_start` probe slice 2 added, and the targeted fallback goes
  through the adapter's injectable `createClient`.
- `loadAuraClientSettings`: **not used** (the carried-forward slice 1/2
  deviation; the client probe throwing covers both missing baseUrl and
  missing PAT, and for expansion it manifests as the `clientAvailable`
  latch).
- XML/attribute escaping implemented once inside the engine
  (module-private `escapeAttr`/`escapeText`); `aura-tasks.ts` keeps its
  own private copies untouched, per the Do-NOT-reimplement list.
- `aura-tasks.ts`'s `AURA_TASK_INSTRUCTION` stays in place; the interim
  double instruction block is accepted per the slice doc (both blocks
  use the `## Aura task references` heading until the task-alias ticket
  removes the old one).
- pi-tui's surfaces not retested; the extension factory stays verified
  by the pi runtime (repo convention), so the notify/latch wiring is
  untested while the pure seams are covered.
- Bodies are never inlined: the `<task-ref>` carries only key, status,
  and title (map constraint respected).

### Out-of-scope changes

- None. Only the two engine files changed, and the test changes are
  pure additions plus one stale-comment fix in the shared test header.
  No manifest change was needed (registration landed in slice 1). No
  em-dashes in the diff.

### Divergence from the slice doc's acceptance criteria

None. All seven criteria are implemented and unit-tested:

1. Expansion format: `<task-ref key status>title</task-ref>` pinned,
   including all three attribute-escape targets (`"`, `&`, `<`), the
   missing-status empty attribute, and element-text escaping.
2. Resolution is cache-first with the `getTaskByHumanKey` fallback:
   `resolveFullToken` pinned (a cache hit builds no client; a miss
   resolves through the targeted fallback; 404 and throw both return
   null), and wired into the input handler.
3. A prompt without references passes through unchanged: identity
   string, zero resolutions, and the handler returns no transform.
4. The per-turn instruction block is pinned: tag shape, key and status
   attributes, element text, the `aura` skill pointer, and the SKILL.md
   load instruction.
5. The alias registry is unit-tested with a synthetic alias: recognition
   (kind, partial, raw), expansion routing through the task adapter's
   `formatExpansion`, mixing with `#task:` mentions, unresolvable
   aliases left as typed, an alias to a kind without an adapter left as
   typed, the warning exactly once per session, and the warning decision
   user-only (no deprecation text ever lands in the expanded prompt).
6. No alias is registered in the production wiring: the factory builds
   the registry from the task adapter alone; the production alias table
   is empty and legacy syntax is unrecognized.
7. Legacy `@AURA-` behavior is unchanged: `aura-tasks.ts` has an empty
   diff and its test suite passes.

Test plan coverage: every listed failure mode (targeted miss, targeted
throw, credentials absent with zero lookup calls), scenario (single,
multiple, mixed known/unknown, titles containing `&`, `<`, `"`
attributes, start/middle/end of the prompt, duplicates, case-insensitive
matching with canonical key output), and edge case (adjacent
punctuation, no truncation of longer expansions, the warning flag reset
per session, a synthetic alias routing through the task adapter) is
covered.

One pinned semantic to record (consistent with the criteria, a
deliberate as-built decision): a mention with glued trailing
punctuation (`#task:AURA-42,`) does not expand. The token grammar is the
non-whitespace run after `#kind:`, kept kind-agnostic so future kinds'
tokens (wiki paths) are never mangled; the test documents this.

### Task doc update needed?

Yes. Append a `### Slice 3` subsection to `## Implementation notes`
recording:

- The alias registry API as built: `registerAlias` method on the
  registry plus `createDeprecationWarningDecision()` (armed by the
  factory per `session_start`, user-only via `ctx.ui.notify`, generic
  dormant message text, no alias registered in production wiring).
- The `LegacyAlias` capture-group contract: group 1 is the full token
  text minus the trigger char (e.g. `@(AURA-[^\s]*)` capturing
  `AURA-42`), one group serving autocomplete and submit; the
  task-alias ticket must adapt the alias partial shape for
  `searchLocal`'s keyMatch when it wires alias autocomplete.
- The expansion flow: `expandReferenceMentions` (async pure transform,
  `ReferenceResolver` injection, null lookup means no targeted fetch at
  all) over `resolveFullToken` (cache-first, then the targeted
  `getTaskByHumanKey`, catch means leave as typed).
- `TASK_REF_INSTRUCTION` appended per turn via `before_agent_start`;
  the interim double instruction block (same heading as
  `AURA_TASK_INSTRUCTION`) is accepted until the task-alias ticket.
- The punctuation-adjacency semantic: glued punctuation is part of the
  typed token, so such a mention stays as typed.

### User attention needed?

No. Scope is unchanged and all acceptance criteria are met without
divergence. The API refinements (alias registration as a registry
method with the warning armed by the factory rather than the
registration call, the async prompt transform) are additive or
shape-only, leave the arch spec's interface contract intact in
substance, and are recorded above for the dependent alias tickets.
