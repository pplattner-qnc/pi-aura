---
kind: task
type: feature
slug: reference-artifact-kind
title: "#artifact: references end-to-end"
map: unified-reference-mentions
status: ready
blocked_by: [reference-engine-core, reference-cache-sqlite]
slices: [1-artifact-autocomplete, 2-artifact-expansion-instruction]
---

## What to build

Aura artifacts become referenceable. Typing `#artifact:` opens autocomplete
with artifacts from the cache, matched by id prefix or title substring
(case-insensitive); the same call fires the server-side `listArtifacts`
search (`q`) in the background, whose results are merged over local ones
and written through to the cache, so a recently created artifact appears
one keystroke after the refresh lands. Autocomplete rows show the
artifact title as the label with the uuid only in the description;
selecting one inserts the full uuid token `#artifact:<uuid>`, so the
unreadable uuid appears in the text box only after selection.

On submit the mention expands inline to
`<artifact-ref id="..." kind="..." version="...">title</artifact-ref>`,
resolved cache-first and then via a targeted `getArtifact` lookup;
unresolvable references stay as typed. The artifact cache warmup starts
at `session_start`. The system-prompt instruction block grows the
artifact-ref shape.

## Acceptance criteria

- [ ] `#artifact:` autocompletes artifacts by id prefix and title substring, locally from the cache.
- [ ] Server-side `listArtifacts` search results are merged over local ones and written through to the cache.
- [ ] Suggestion rows show the title as the label; the uuid appears in the description; the inserted value is the full uuid.
- [ ] On submit, `#artifact:<uuid>` expands to `<artifact-ref id kind version>title</artifact-ref>` with proper escaping.
- [ ] Expansion resolves cache-first, then via `getArtifact`; unresolvable references are left as typed.
- [ ] Artifact warmup starts at `session_start`; without credentials the kind no-ops silently.
- [ ] The system-prompt instruction block documents the artifact-ref shape.
- [ ] Unit tests cover the artifact adapter's pure seams: filtering (id prefix + title substring), row formatting, expansion, resolution.

## Blocked by

- reference-engine-core
- reference-cache-sqlite

## Implementation notes

### Slice 1: 1-artifact-autocomplete (landed)

- The adapter: `createArtifactAdapter({ createClient })` in
  `aura-references.ts`, kind `artifact`, registered in the factory beside
  the task and rule kinds. It rides the landed machinery untouched: the
  TTL-gated session-start warmup loop, the per-query SWR refresh, the
  no-credential refresh gate, and the credential-gated expansion lookup all
  dispatch through the registry, so registering the adapter is the whole
  factory change.
- The item mapping (`artifactToReferenceItem`, exported):
  `id` and `key` are both the uuid (the token key inserted on selection),
  `title` is the label, and two metadata extras carry the expansion
  attributes: `artifactKind` (the Aura artifact kind, PLAN/REVIEW/GENERIC;
  named so it never collides with the engine's registry `kind`) and
  `version` (the latest version at fetch time). The extras land in the
  sqlite cache's kind-agnostic metadata JSON column and read back from
  there, which is the ticket-2 interface contract this kind exercises
  (the wiki kind reuses the same pattern for space, path, and version).
  `artifactItemMetadata` (exported) reads the extras off any item and
  reports completeness, so resolution can distinguish a metadata-less
  cached row.
- The row UX inverts the task shape per the prototype decision: label =
  the artifact title, description = the uuid (the uuid appears only
  there), value = `#artifact:<full uuid>` (so the unreadable uuid hits the
  text box only after selection).
- Local filtering rides the engine's `filterReferenceItems` unchanged, no
  per-kind `keyMatch` hook: an artifact's key IS its uuid, so the default
  key-prefix match is the id-prefix match (the task kind needs its hook
  only because a task key has the AURA-<n> form with the numeric-suffix
  match). Ranking, the cap, and case-insensitivity are the engine's.
- The warmup pagination bound (the arch spec's implementation decision):
  `MAX_ARTIFACTS = 500` over `ARTIFACT_PAGE_SIZE = 100`, the same shape as
  the task warmup, newest-updated first, page-by-page writes. The bound is
  coverage, not correctness: the cache plus the per-query server search
  make any bound non-blocking.
- `searchServer` sends `{ q: partial, limit, sort_by: "updated_at",
  sort_dir: "desc" }`, drops late results after an abort, and returns []
  silently on failure; the SWR seam writes fresh results through to the
  cache (a server-only match appears one keystroke after the refresh
  lands, a rename corrects itself the same way).
- `createDefaultClient()` widened to the structural intersection
  `TaskAuraClient & ArtifactAuraClient`: one dynamic-import seam feeds
  both server adapters.
- `formatExpansion` / `resolveFullToken` are deliberate stubs until slice
  2 (mentions stay as typed; the interface requires the methods, the
  slice plan assigns the behavior to slice 2's red tests).
