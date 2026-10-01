---
type: ticket
title: "#wiki: references end-to-end"
status: stable
blocked_by:
- reference-engine-core
- reference-cache-sqlite
subtype: feature
workflow_state: in-progress
---

## What to build

Aura wiki pages become referenceable with their dual identity. Typing
`#wiki:` opens autocomplete with wiki pages offered by their space/path
form; the same call fires the server-side `mcpWikiSearch` in the
background, merged over local results and written through to the cache.
Selecting a page inserts the readable `#wiki:<space>/<path>` token. A
hand-typed `#wiki:<uuid>` is also recognized; the adapter distinguishes
the two forms by shape (uuid pattern vs path).

On submit, both forms resolve to the same canonical expansion
`<wiki-ref space="..." path="..." version="...">title</wiki-ref>`:
cache-first, then a targeted lookup via `getKnowledgeNodeByPath` for the
path form or `getKnowledgeNode` for the uuid form. Unresolvable
references stay as typed. The wiki cache warmup starts at
`session_start`. The system-prompt instruction block grows the wiki-ref
shape, completing the one-block-documents-all-four end state.

## Acceptance criteria

- [ ] `#wiki:` autocompletes wiki pages by their space/path form and inserts `#wiki:<space>/<path>`.
- [ ] Server-side `mcpWikiSearch` results are merged over local ones and written through to the cache.
- [ ] A hand-typed `#wiki:<uuid>` is recognized as a wiki reference (uuid pattern vs path discrimination).
- [ ] Both forms expand to the same canonical `<wiki-ref space path version>title</wiki-ref>` with proper escaping.
- [ ] Expansion resolves cache-first, then `getKnowledgeNodeByPath` (path form) or `getKnowledgeNode` (uuid form); unresolvable references are left as typed.
- [ ] Wiki warmup starts at `session_start`; without credentials the kind no-ops silently.
- [ ] The system-prompt instruction block documents all four tag shapes (task, rule, artifact, wiki) in the one block.
- [ ] Unit tests cover the wiki adapter's pure seams: dual-identity parsing, filtering, row formatting, expansion, resolution.

## Blocked by

- reference-engine-core
- reference-cache-sqlite

## Implementation notes

### Slice 1: 1-wiki-autocomplete (landed)

- The adapter: `createWikiAdapter({ createClient })` in
  `aura-references.ts`, kind `wiki`, registered in the factory beside the
  task, rule, and artifact kinds. It rides the landed machinery untouched:
  the TTL-gated session-start warmup loop, the per-query SWR refresh, the
  no-credential refresh gate, and the credential-gated expansion lookup all
  dispatch through the registry, so registering the adapter is the whole
  factory change (`createDefaultClient` widened to the three-adapter
  intersection, the artifact ticket's recorded precedent).
- Dual identity: `parsePartial` passes both shapes through (a hand-typed
  `#wiki:<uuid>` partial is recognized, never declined), and the exported
  `isWikiUuidForm` (a complete 8-4-4-4-12 hex node uuid, case-insensitive)
  is the shape discriminator the downstream seams consult: the local
  filter matches the space/path key by substring OR the uuid (item id) by
  prefix through the engine's `keyMatch` hook (so a hand-typed uuid
  partial still finds its page and inserts the readable form), and the
  server search skips the empty partial and the complete uuid form
  (`mcpWikiSearch` matches titles and bodies, never ids, and requires a
  non-empty query). Rows carry `#wiki:<space>/<path>` as value AND label
  with the title in the description (the prototype's wiki row; the task
  shape, since the wiki token is readable where the artifact uuid is
  not); selection never inserts a uuid.
- The hit-to-path derivation (arch-spec open detail, settled against live
  payloads): a `mcpWikiSearch` hit looks like
  `{"id": "19116556-6e3b-451a-9866-2d61c0736a78", "space_slug":
  "iso-27001-dokumente", "title": "IT-Sicherheitskonzept", "url":
  "/knowledge/iso-27001-dokumente/19116556-6e3b-451a-9866-2d61c0736a78",
  "heading_path": ["TEIL 2: ..."], "excerpt": "...", "match_source":
  "both"}`. The url is `<base>/knowledge/<space_slug>/<uuid>`, so parsing
  it yields nothing the hit does not already carry (url parsing ruled
  out); a `getKnowledgeNode(id)` roundtrip yields the node's own slug,
  space, and version but NO ancestor chain (the shared client's mapping
  drops `parent_id`, and the raw payload would need one roundtrip per
  ancestor). The reliable derivation is the per-space knowledge tree:
  `getKnowledgeTree(hit.space_slug)` returns
  `{"space_id": "...", "nodes": [{"id": "2f6b7f30-...", "kind":
  "FOLDER", "slug": "nis-2", "title": "NIS-2", "latest_version": 0,
  "children": [{"id": "19116556-...", "kind": "DOCUMENT", "slug":
  "it-sicherheitskonzept", ...}]}]}` (bodies omitted; verified for WIKI,
  REPOSITORY, and SKILL spaces), and the pure `wikiItemsFromTree` walks it
  into items whose key is the ancestor slug chain
  (`iso-27001-dokumente/nis-2/it-sicherheitskonzept`). The hit joins by
  node id. Trees are memoized per space for the adapter's lifetime (one
  session): the per-keystroke SWR refresh costs the search plus at most
  one tree per not-yet-memoized space, and a hit missing from a memoized
  tree (a page created after the memo) refetches that space once.
  Hits whose space tree cannot be fetched, or whose `space_slug` is
  empty, are dropped (never a crash; the recorded fallback for
  underivable hits). Only DOCUMENT nodes are referenceable (folders are
  containers, FILE nodes are assets).
- The warmup source (arch-spec open detail, settled): the shared
  `AuraClient` has no space-listing verb (`listKnowledgeSpaces` exists
  only in the generated SDK, which the map's shared-client constraint
  forbids importing), so no cheap enumeration exists and the warmup is
  search-seeded: one generic `mcpWikiSearch` with the seed query `der`
  bounded at the API max (`WARMUP_WIKI_SEED_QUERY` /
  `WARMUP_WIKI_SEARCH_LIMIT = 50`; live data: 50 hits across 11 distinct
  spaces, including engineering-foundation, skills, iso-27001-dokumente,
  and legal-qa), then one memoized tree per distinct hit space writes
  complete items per space, capped at `MAX_WIKI_ITEMS_PER_SPACE = 500`
  in tree order (the legal-qa tree alone carries ~1000 nodes; the cap
  keeps the per-keystroke sqlite read bounded). Per-space writes land
  partial progress, aborts stop between spaces (in-flight trees still
  land, the artifact warmup's between-pages precedent), a failing space
  is skipped, and without credentials the warmup no-ops silently. The
  cap is coverage, not correctness: any page beyond it is still found
  by the per-query search and its write-through.
- Cache items: `WikiReferenceItem` carries `space`, `path`, and `version`
  as metadata extras (the artifact kind's pattern; they land in the
  sqlite metadata JSON column and read back through `wikiItemMetadata`,
  the completeness accessor), with the uuid as the item id and
  `space/path` as the token key. The warmup and the SWR write-through
  are the only writers.
