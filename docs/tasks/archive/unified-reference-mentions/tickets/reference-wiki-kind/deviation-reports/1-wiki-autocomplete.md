---
type: deviation report
title: 1-wiki-autocomplete
status: stable
---
## Deviation report: 1-wiki-autocomplete

Scope reviewed: the slice 1 red and green commits (`debd769d` red,
`0bf8419` green; files: `extensions/aura-references.ts`,
`extensions/aura-references.test.ts`). Tests run: `node
--experimental-strip-types extensions/aura-references.test.ts` passes
(69 sections), and every other extension suite passes (`aura-tasks`,
`aura-health`, `aura-reference-cache`, `aura-feedback`, `aura-secrets`,
`engineering-rules`); root vitest 236 green, shared `tsx --test` 202
green, both typechecks (scripts, shared) clean. The pre-existing red
(`atlassian-provision.test.ts`) is out of scope
(`docs/bugs/atlassian-provision-test-broken-import.md`). The adapter was
additionally exercised against live Aura (search + warmup) before
landing: 20 complete items for the query `it-sicherheitskonzept` and a
680-item warmup across 11 spaces.

### API surface changes

- **Planned (arch spec):** the wiki adapter behind the common interface
  (uuid-vs-path partial discrimination by shape, local search by
  space/path substring or title substring, `mcpWikiSearch` merged over
  local results with write-through, rows showing the space/path with the
  title that always insert the readable form, cache items carrying
  space/path/version in the metadata JSON column with the uuid as the
  item id, the two open details settled against real payloads and
  recorded).
- **Actual:** all of that landed as specified, with these refinements:

  1. **The hit-to-path derivation is tree-based, not url-based or
     node-based.** Settled against live payloads: a search hit's `url`
     is `/knowledge/<space_slug>/<uuid>` (no path in it), and a
     `getKnowledgeNode(id)` roundtrip yields the node's own slug but no
     ancestor chain (the shared client's mapping drops `parent_id`
     entirely), so neither arch-spec candidate produces the canonical
     path. The per-space knowledge tree does, in one call: the pure
     `wikiItemsFromTree` walks `getKnowledgeTree(hit.space_slug)` into
     `space/slug-path` items (verified for WIKI, REPOSITORY, and SKILL
     spaces), and the hit joins by node id. Trees are memoized per space
     per session; a hit missing from a memoized tree refetches that
     space once (self-healing for pages created after the memo); hits
     whose tree fails or whose `space_slug` is empty are dropped, never
     a crash. Recorded in the ticket doc's implementation notes with the
     example payload shapes.
  2. **The warmup is search-seeded and tree-completed** (the recorded
     open-detail choice): the client has no space-listing verb
     (`listKnowledgeSpaces` exists only in the generated SDK, which the
     map's shared-client constraint forbids importing), so one generic
     seed search (`WARMUP_WIKI_SEED_QUERY = "der"`, bounded at the API
     max `WARMUP_WIKI_SEARCH_LIMIT = 50`; live data: 11 distinct spaces
     including engineering-foundation, skills, iso-27001-dokumente,
     legal-qa) decides which spaces to cover, then one memoized tree
     per distinct hit space writes complete items, capped per space at
     `MAX_WIKI_ITEMS_PER_SPACE = 500` in tree order. The cap keeps the
     per-keystroke sqlite read bounded (the legal-qa tree alone carries
     ~1000 nodes); it is coverage, not a correctness limit, since the
     per-query search still writes through.
  3. **Only DOCUMENT nodes are referenceable** (folders are containers,
     FILE nodes are assets; `getKnowledgeNodeByPath` resolves document
     nodes), decided inside `wikiItemsFromTree` and recorded in the
     notes.
  4. **A uuid partial finds its page locally.** The local filter's
     keyMatch hook matches the space/path key by SUBSTRING plus the
     uuid (item id) by prefix, so a hand-typed `#wiki:<uuid>` (or its
     prefix) offers the matching page and STILL inserts the readable
     space/path form; the complete uuid form skips the server search
     (`mcpWikiSearch` matches titles and bodies, never ids, and requires
     a non-empty query, as does the empty partial).
  5. **`formatExpansion` / `resolveFullToken` are deliberate stubs in
     this slice** (the artifact slice-1 pattern): the interface requires
     both, but expansion is slice 2's scope, so `resolveFullToken`
     returns null (wiki mentions stay exactly as typed, the engine's
     safe passthrough) and `formatExpansion` is unreachable in
     production. Slice 2 replaces both under its own red tests.
  6. **`createDefaultClient()` widened to
     `Promise<TaskAuraClient & ArtifactAuraClient & WikiAuraClient>`.**
     The single dynamic-import seam now feeds all three server adapters
     structurally; the live client satisfies the intersection, and
     nothing about the seam's behavior changed (the artifact ticket's
     recorded precedent for widening this intersection type).

### Verdict

Conforms. The two arch-spec candidate derivations were settled AGAINST
real payloads exactly as the open-detail section instructed (url parsing
ruled out by the payload, the tree roundtrip adopted and recorded with
example shapes), and the warmup source decision followed the spec's
search-seeded allowance with the no-cheap-enumeration premise verified
against the shared client's surface. Everything else is the landed
machinery plus one new adapter and its registration.
