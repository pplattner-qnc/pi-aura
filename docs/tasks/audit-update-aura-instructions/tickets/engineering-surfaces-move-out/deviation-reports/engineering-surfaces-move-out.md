---
type: deviation report
title: Deviation report for engineering-surfaces-move-out
status: stable
---

## Deviation report: engineering-surfaces-move-out

### API surface changes

- **Planned:** Architecture ticket 6 removes the engineering-foundation skill
  directory and the engineering-rules extension with its test, updating the
  package manifest, the README tables, and the project instructions file. The
  ticket doc names the removal targets precisely: the manifest lists exactly
  the six surviving extensions; the README's skill and extension tables drop
  the moved-out entries; AGENTS.md drops the bullets describing the
  engineering-foundation skill layout and the rules extension.
- **Actual:** The removal of the extension is a split, not a deletion, forced
  by a dependency the spec did not account for. The dispatch half of
  `engineering-rules.ts` (the extension factory, the always-on and on-demand
  system-prompt section builders, the mention-name collector, the
  `before_agent_start` body-injection resolver) is deleted. The loading half
  (`loadRules`, the `Rule` type and frontmatter parsing, the glob compiler and
  matcher, the global-plus-project `aura.cursorRules.ignore` settings union,
  the recursive `.cursor/rules` walk) survives verbatim (code identical,
  comments adjusted) as a new plain module `extensions/cursor-rules.ts`, with
  a sibling `cursor-rules.test.ts` carrying the loader-half coverage, because
  the surviving reference engine `aura-references.ts` imports `loadRules` and
  `Rule` for its local-only `#rule:`/`@rule:` mention kind. Deleting the
  module outright would have broken one of the six extensions the ticket was
  told to keep, and no spec text authorizes removing the rule mention kind.
  A module-surface pin in `cursor-rules.test.ts` (exports = loading helpers
  only) keeps the dispatch from regrowing here.
  Two smaller planned-versus-actual gaps in the same ticket lines: the README
  has a skill table only (the engineering-foundation row is dropped; there is
  no extension table, so "the extension tables drop the moved-out entries"
  had nothing to drop), and AGENTS.md never carried a rules-extension bullet
  (only the engineering-foundation skill-layout bullet existed and was
  dropped).
- **Impact:** The exported contract holds exactly: the manifest lists the six
  surviving extensions (verified against `package.json` and pinned by the
  guard). Downstream effects:
  - Ticket 10 (root-docs-current) describes a package that also ships
    `extensions/cursor-rules.ts` as a non-manifest library module; a sentence
    about it, and about the companion-plugin assumption below, belongs in
    that ticket.
  - The plugin repo's rules dispatch must consume the same `.cursor/rules`
    directory and implement its own ignore-list reading (its loader is its
    own copy). Body injection for mentioned rules no longer ships from this
    package: in a session with pi-aura installed but the plugin repo's
    dispatch absent, `#rule:` and `@rule:` mentions still autocomplete and
    expand to `<rule-ref>` elements, but nothing injects the rule body.
  - `aura-references.test.ts` lost the dual-matching resolver assertions
    (they exercised `resolveRuleMentions`, which moved out with the
    dispatch); the engine-side expansion assertions for both syntaxes
    remain.

### Abstraction usage
- Used/was specified: yes. The absence pins extend the existing
  remnants-style guard (`packages/shared/test/guards/no-remnants.test.ts`):
  a manifest deep-equal against the six survivors, `existsSync` absence for
  the skill directory and both extension files, and a README + AGENTS.md
  name scan. The pre-existing "leaves only the two surviving core skills"
  assertion was updated to one, and the pre-existing README skill-table
  guard also catches re-introduction. No new guard machinery was invented,
  and the loader moved verbatim rather than being rewritten.

### Out-of-scope changes
- Em-dash fix in the surviving `aura` row of the README skill table (touched
  prose; the always-on no-em-dashes rule). Em-dashes on untouched README
  lines remain, for the root-docs ticket.
- Header-comment cleanups in `extensions/aura-feedback.ts` and
  `extensions/aura-references.test.ts` dropping the engineering-rules
  dispatch mention, plus provenance comments in `aura-references.ts`,
  `cursor-rules.ts`, `cursor-rules.test.ts`, and the guard that still name
  the removed surfaces (history notes; the guard's name scan is scoped to
  README + AGENTS.md per acceptance criterion 2).
- New module-surface pin in `cursor-rules.test.ts` (loading-only exports).
- Intentional remaining references outside this ticket's scope:
  `aura-mcp-client.test.ts` uses the real `engineering-foundation` wiki space
  slug as a knowledge-method fixture (a live server-side space, not a
  shipped surface), and the REST library (`aura-client.ts`, the generated
  SDK, `openapi.yaml`) names the same space in blueprint API descriptions;
  that library's fate belongs to ticket 5's consumer rule.

### Ticket doc update needed?
Yes. Append to `## Implementation notes`:
- The engineering-rules removal was a split, not a deletion: the dispatch
  half is gone, the loading half lives on as `extensions/cursor-rules.ts`
  (plus test) because `aura-references.ts` imports `loadRules` and `Rule` for
  the local `#rule:` kind. The module-surface pin prevents dispatch regrowth.
- The README has no extension table and AGENTS.md never had a rules bullet;
  the ticket's phrasing assumed both existed.
- The resolver dual-matching assertions left `aura-references.test.ts`
  together with the moved-out resolver.
- Mentioned-rule body injection is now the plugin repo's job; the root-docs
  ticket should state the companion-plugin assumption.

### User attention needed?
Yes, briefly: the ticket's scope line "the engineering-rules extension with
its test" is removed turned out to be unimplementable as written. The
package's behavior changed: rule loading and the `#rule:`/`@rule:` mention
surface stay, but the system-prompt dispatch (always-on and on-demand rule
sections, mentioned-rule body injection) is gone from this package and must
come from the plugin repo. Until that side ships, mentions expand but inject
nothing. The manifest contract (six extensions) holds exactly; no other
scope changed.

### Verification (re-run for this report)
- `packages/shared`: `npm test` 178/178 pass; the guard file alone 49/49.
- `node --experimental-strip-types`: `cursor-rules.test.ts` and
  `aura-references.test.ts` pass.
- `packages/shared` `npm run typecheck`: clean.
- Re-introduction probes (this report's own): re-creating
  `skills/core/engineering-foundation` fails 3 guard assertions (exit 1);
  re-creating `extensions/engineering-rules.ts` fails the extension-absence
  guard (exit 1); the clean tree passes.
