---
type: arch spec
title: "Architecture spec: reference-wiki-kind"
status: stable
---
# Architecture spec: reference-wiki-kind

Status: approved (two slices, m then s; levels [1] then [2]). The
kickoff is deliberately deferred by the user until a pending item is
settled; do not treat the delay as a change to this plan.

- Ticket doc: `docs/tasks/unified-reference-mentions/tickets/reference-wiki-kind/ticket.md`
- Effort spec: `docs/tasks/unified-reference-mentions/spec.md`
- Map: `docs/tasks/unified-reference-mentions/map.md`
- As-built reference: `extensions/aura-references.ts` (the task and
  artifact adapters are the patterns), `packages/shared/src/aura-client.ts`
  (`mcpWikiSearch`, `getKnowledgeNodeByPath`, `getKnowledgeNode`,
  `WikiSearchHit`, `KnowledgeNode`), the ticket-5 implementation notes.

## Shape

The wiki kind adds dual identity: every wiki page can be referenced as
`#wiki:<space>/<path>` (the readable form; autocomplete always offers
and inserts this one) or hand-typed as `#wiki:<uuid>` (programmatic or
copied references). Both resolve to the same canonical expansion
`<wiki-ref space="..." path="..." version="...">title</wiki-ref>`.

## Open detail the implementer must settle (slice 1)

`mcpWikiSearch` hits carry `id`, `space_slug`, `title`, `url`,
`heading_path`, `excerpt`, `match_source` but NO explicit node path.
Deriving the canonical space/path token for insertion therefore needs a
decision made against REAL payloads: either parse the `url`, or do a
`getKnowledgeNode(id)` roundtrip for the canonical path. Inspect actual
responses, pick the reliable derivation, and record the choice (with an
example payload shape) in the task doc's implementation notes.

Same for warmup: the client has no space-listing verb, so the warmup
source is implementation-decided. A search-seeded warmup (a generic
`mcpWikiSearch` bounded by a sane limit) is acceptable if no cheap
enumeration exists; record the choice. The map constraint "warmup starts
at session_start, fire-and-forget" still applies.

## Slice 1: `#wiki:` autocomplete end-to-end

- Adapter kind `wiki`: `parsePartial` discriminates uuid form vs
  path form by shape (uuid pattern vs path).
- `searchLocal`: cached items matched by path/space substring or title
  substring (case-insensitive). Cache items carry `space`, `path`, and
  `version` in the metadata JSON column; the uuid is the item id.
- `searchServer`: `mcpWikiSearch` for the typed partial, merged over
  local results with write-through (the established SWR seam).
- `formatRow` / insertion: rows show the space/path with the title;
  selecting ALWAYS inserts the readable `#wiki:<space>/<path>` form,
  never the uuid.
- Warmup at session start per the open detail above; no credentials:
  silent defer everywhere.

## Slice 2: `#wiki:` expansion + instruction completion

- `formatExpansion`: `<wiki-ref space path version>title</wiki-ref>`
  (title XML-escaped, attributes escaped), identical for both input
  forms.
- `resolveFullToken`: cache-first (metadata supplies space, path,
  version); then `getKnowledgeNodeByPath` for path-form tokens or
  `getKnowledgeNode` for uuid-form tokens; unresolvable references
  stay as typed.
- The engine's per-turn instruction block grows the wiki-ref shape,
  completing the one-block-documents-all-four end state (task, rule,
  artifact, wiki).

## Do NOT touch

- The task, rule, and artifact kinds or either alias.
- The engine's SWR, cache, warmup-gating internals.
- `aura-tasks.ts` (probe only).

## Seams under test

- The wiki adapter's pure functions: dual-identity parsing, local
  filtering, row formatting (space/path label, path-form insertion),
  expansion, resolution (injected client).
- The search-hit-to-path derivation as a pure, unit-testable function
  over the payload shape.
- Repo test conventions unchanged.
