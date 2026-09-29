## Deviation report: 1-aura-alias-atomic-switch

Scope reviewed: `git diff d2531e8c..19ece364` (2 commits, 5 files:
`extensions/aura-references.ts`,
`extensions/aura-references.test.ts`,
`extensions/aura-tasks.ts`,
`extensions/aura-tasks.test.ts`,
`extensions/aura-feedback.ts`). Tests run: `node
--experimental-strip-types extensions/aura-references.test.ts` passes (40
sections), `aura-tasks.test.ts` passes (module-surface pin), `aura-health.test.ts`
(the probe's logic tests, unchanged) passes, `aura-feedback.test.ts`,
`aura-reference-cache.test.ts`, `engineering-rules.test.ts`,
`aura-secrets.test.ts` pass, root vitest 236 green, shared `tsx --test` 202
green, both typechecks clean. The pre-existing red
(`atlassian-provision.test.ts`) is byte-identical before and after the diff
and out of scope (`docs/bugs/atlassian-provision-test-broken-import.md`).

### API surface changes

- **Planned (arch spec):** register `@AURA-<digits>` through the existing
  `registerAlias(LegacyAlias)` API (pattern + capture-group contract +
  kind mapping + insert-the-legacy-token autocomplete); delete the old
  handling; no engine surgery (cache, SWR, warmup, adapter internals
  untouched).
- **Actual:** the registration rides the existing API unchanged, but
  expressing "insert the legacy token on selection" needed the alias
  registration to carry its own autocomplete rows. Additions:

  1. **`LegacyAlias.searchLocal?` (the legacy-row hook).** The engine's
     adapter seam could not express legacy-token insertion:
     `formatRow`/`searchLocal` always emit `#kind:` rows. The optional
     hook ranks + formats cached items as legacy-syntax rows (value =
     the legacy token) and falls back to the adapter's new-syntax rows
     when omitted. This is the interface contract `@rule:` will reuse.
  2. **`ExtractedReferenceToken.alias?`.** The matched registration rides
     on the extracted token so the provider can find the hook (engine
     plumbing; multiple aliases may map to the same kind).
  3. **`createAuraTaskAlias(taskAdapter)` (exported).** The production
     registration: the pinned pattern, the kind mapping, and the
     legacy-row formatting (adapter description + legacy token
     value/label). Exported so the tests pin the real registration, not a
     re-declared pattern.
  4. **`promptHasLegacyMention(prompt, registry)` (exported).** The
     deprecation-warning trigger, extracted from the factory's inline
     scan into a pure function so the trigger is testable against the
     real pattern.
  5. **Provider `triggerCharacters` `["#"]` -> `["#", "@"]`.** `@` is one
     of pi-tui's default trigger characters (verified in the pi-tui
     editor source: `DEFAULT_AUTOCOMPLETE_TRIGGER_CHARACTERS = ["@",
     "#"]`), so the declaration documents ownership as much as it
     changes behavior; every non-alias `@` token still defers to the
     wrapped provider.

  No changes to the cache, the SWR refresh, the warmup, the sqlite store,
  or the task adapter internals (verified in the diff).

### Abstraction usage

- Used/was specified: **yes.** No new dependency (`package.json`
  untouched), pure exported functions + `node:assert` under
  `node --experimental-strip-types`, dynamic-import seams preserved, no
  runtime deps beyond the pi peer dep.

### Out-of-scope changes

- Three comment-only updates in `extensions/aura-feedback.ts`: its
  cross-references pointed at aura-tasks's deleted aura-client import and
  at the old `@AURA-` overlay ownership; they now point at
  `aura-references.ts`. No behavior. `engineering-rules.ts` is untouched.

### Divergence from the slice doc's acceptance criteria

One deliberate, slice-doc-pinned edge: a bare `@AURA-` with no digits
offers no suggestions (the old overlay showed the cache head there). The
slice's own edge-case list pins "`@AURA-` with no digits (no match, no
warning)", which one end-anchored pattern can only honor by requiring at
least one digit; suggestions therefore start at the first digit, where
they show the same rows the old number-prefix filter produced. Everything
else conforms: the atomic landing (registration + deletion in one commit,
with a red-only test commit before it), extraction at boundaries,
legacy-token insertion, expansion routing through the task adapter
(cache-first, targeted fallback, unknown keys left as typed, never
`<aura-task>`), the once-per-session user-only warning on submit, the
probe-only module (pinned by a module-surface test), exactly one
task-reference instruction block, and the no-credential silent deferral.

Resolving the carried-forward engine-core note ("the task-alias ticket
must adapt the partial or extend keyMatch"): neither was needed. The alias
partial is the full key shape (`AURA-4` while typing `@AURA-4`), which
`filterReferenceItems`'s plain key-prefix matching ranks; the task
keyMatch's number-prefix hook only matters for digits-only partials,
which never arise through the alias. Documented in the task doc's
implementation notes so the rule ticket starts from the resolved shape.

### Task doc update needed?

Yes. Appended (this commit): the registration shape, the pattern
semantics, the rule-ticket interface contract, the no-adaptation
resolution, the warning composition, the shrunk module's exact surface,
and the test inventory.

### User attention needed?

No. The one behavior delta (no suggestions on a digit-less `@AURA-`) is
the slice doc's own pinned edge case, and the alias autocomplete gains
the stale-while-revalidate refresh the old overlay never had (the same
query the `#task:` path fires, with the full-key partial).
