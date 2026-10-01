---
type: deviation report
title: 2-artifact-expansion-instruction
status: stable
---
## Deviation report: 2-artifact-expansion-instruction

Scope reviewed: the slice 2 red and green commits (`39f050c9` red, `d8466efa`
green; files: `extensions/aura-references.ts`,
`extensions/aura-references.test.ts`). Tests run: `node
--experimental-strip-types extensions/aura-references.test.ts` passes
(63 sections), every other extension suite passes, root vitest 236 green,
shared `tsx --test` 202 green, both typechecks (scripts, shared) clean. The
pre-existing red (`atlassian-provision.test.ts`) is out of scope
(`docs/bugs/atlassian-provision-test-broken-import.md`).

### API surface changes

- **Planned (arch spec):** `formatExpansion` emitting
  `<artifact-ref id kind version>title</artifact-ref>` with version = latest
  and proper escaping; `resolveFullToken` cache-first (cached metadata
  supplies kind and version) then a targeted `getArtifact` on miss;
  unresolvable references stay as typed; the instruction block grows the
  artifact-ref shape.
- **Actual:** all of that landed as specified, with these refinements:

  1. **The cache-first resolution is gated on complete metadata.** A cached
     row that lacks `artifactKind` or `version` (an older or corrupted
     entry) does not short-circuit the resolution: it falls through to the
     targeted `getArtifact`, which is the slice doc's own edge case ("a
     mention whose cached entry lacks version metadata"), so the mention
     never expands with half the attributes. `artifactItemMetadata` (from
     slice 1) is the completeness check.
  2. **The targeted-fetch result is not written back to the cache.** The
     task adapter's resolution does not write back either; freshness is the
     SWR refresh's job (the per-keystroke write-through), and the expansion
     path stays read-only against the cache.
  3. **`formatExpansion` degrades instead of throwing** when a hand-built
     item lacks the metadata (empty attributes). Unreachable in production
     (the resolution gate above guarantees complete metadata on every item
     that reaches expansion), but the never-throw rule holds anyway.
  4. **The instruction block grew one paragraph and one example element**
     beside the existing task-ref and rule-ref shapes, plus the
     uuid/kind-values/version-semantics explanations and the `aura`-skill
     pointer for artifact actions. No other system-prompt text changed.

### Verdict

Conforms. The metadata gate (item 1) is the slice doc's own edge case made
structural, not a deviation; everything else is exactly the arch spec's
slice-2 contract.
