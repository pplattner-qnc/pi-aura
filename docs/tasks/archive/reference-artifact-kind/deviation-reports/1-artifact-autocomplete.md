## Deviation report: 1-artifact-autocomplete

Scope reviewed: the slice 1 red and green commits (`dca2b00c` red, `1b38d5f5`
green; files: `extensions/aura-references.ts`,
`extensions/aura-references.test.ts`). Tests run: `node
--experimental-strip-types extensions/aura-references.test.ts` passes
(60 sections), and every other extension suite passes (`aura-tasks`,
`aura-health`, `aura-reference-cache`, `aura-feedback`, `aura-secrets`,
`engineering-rules`); root vitest 236 green, shared `tsx --test` 202 green,
both typechecks (scripts, shared) clean. The pre-existing red
(`atlassian-provision.test.ts`) is out of scope
(`docs/bugs/atlassian-provision-test-broken-import.md`).

### API surface changes

- **Planned (arch spec):** an artifact adapter behind the common interface
  (warmup paging `listArtifacts`, local search by id prefix or title
  substring case-insensitively, `searchServer` firing `listArtifacts` with
  `q` through the SWR seam, rows with the title as the label / uuid in the
  description / full uuid as the inserted value, cache items carrying the
  artifact kind and latest version in the metadata JSON column).
- **Actual:** all of that landed as specified, with these refinements:

  1. **No per-kind `keyMatch` hook.** The arch spec said local search rides
     "the engine's filter with a per-kind `keyMatch` hook, as the task kind
     does". For artifacts the key IS the uuid (the token key and the id are
     the same string), so the engine's default key-prefix match is the
     id-prefix match; no hook is needed and none was added. Behavior is
     exactly the spec's "id prefix OR title substring, case-insensitive",
     with key-prefix hits ranking first, pinned by tests.
  2. **The warmup pagination bound: `MAX_ARTIFACTS = 500` over
     `ARTIFACT_PAGE_SIZE = 100`.** The arch spec left the bound to
     implementation. It matches the task kind's bound (5 pages of 100,
     newest-updated first), and the cache plus the per-query server-side
     search make any bound non-blocking; recorded in the task doc's
     implementation notes.
  3. **`formatExpansion` / `resolveFullToken` are deliberate stubs in this
     slice.** The `KindAdapter` interface requires both, but expansion is
     slice 2's scope, so `resolveFullToken` returns null (artifact mentions
     stay exactly as typed, the engine's safe passthrough) and
     `formatExpansion` is unreachable in production (the input handler only
     formats resolved items). Slice 2 replaces both under its own red tests.
  4. **`artifactItemMetadata` (exported).** The metadata-extras accessor:
     reads `artifactKind` + `version` off any item and reports completeness,
     so slice 2's resolution can fall back to the targeted fetch when a
     cached row lacks the metadata, and the wiki ticket can mirror the
     pattern for its own extras. `artifactToReferenceItem` (also exported) is
     the pure item mapping seam the tests pin.
  5. **`createDefaultClient()` widened to
     `Promise<TaskAuraClient & ArtifactAuraClient>`.** The single
     dynamic-import seam now feeds both server adapters structurally; the
     live client satisfies the intersection, and nothing about the seam's
     behavior changed.

### Verdict

Conforms. The one mechanism the spec sketched differently (the keyMatch
hook) is a no-op for this kind because the uuid is the key, which the
spec's own matching requirement describes exactly; everything else is the
landed machinery plus one new adapter and its registration, as the spec's
Shape section prescribed.
