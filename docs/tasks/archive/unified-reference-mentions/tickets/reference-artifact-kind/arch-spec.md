---
type: arch spec
title: "Architecture spec: reference-artifact-kind"
status: stable
---
# Architecture spec: reference-artifact-kind

Status: approved (two slices, m then s; levels [1] then [2]).

- Task doc: `docs/tasks/reference-artifact-kind/task.md`
- Effort spec: `docs/tasks/unified-reference-mentions/spec.md`
- Map: `docs/tasks/maps/unified-reference-mentions/map.md`
- As-built reference: `extensions/aura-references.ts` (the task adapter
  is the pattern: `KindAdapter` with parsePartial, searchLocal,
  searchServer, formatRow, formatExpansion, resolveFullToken, warmup),
  `extensions/aura-reference-cache.ts` (the metadata JSON column), and
  the archived tickets' implementation notes.

## Shape

The artifact kind is the first kind exercising ticket 2's interface
contract: cache items carry the artifact kind and latest version in the
kind-agnostic metadata JSON column, so the expansion attributes read
from cached metadata. Everything else rides the landed machinery (SWR
refresh, TTL-gated warmup, write-through, no-credential gate, escaping);
this ticket is one new adapter plus its slice of the instruction block.

## Slice 1: `#artifact:` autocomplete end-to-end

- Adapter kind `artifact`: warmup pages `listArtifacts` into the
  persistent cache through the session-start path (a sane pagination
  bound, decided in implementation, recorded in the task doc; the cache
  plus server-side search make any bound non-blocking, same spirit as
  the task warmup).
- `searchLocal`: id prefix OR title substring, case-insensitive (the
  engine's filter with a per-kind `keyMatch` hook, as the task kind
  does).
- `searchServer`: `listArtifacts` with `q` for the typed partial; the
  existing SWR seam fires it per query and merges over local results.
- `formatRow`: label = the artifact TITLE, description includes the
  uuid; the inserted value is the FULL uuid token `#artifact:<uuid>`
  (the prototype's artifact UX decision: the uuid appears in the text
  box only after selection).
- No credentials: warmup no-ops, provider defers, nothing fetches.

## Slice 2: `#artifact:` expansion + instruction

- `formatExpansion`: `<artifact-ref id kind version>title</artifact-ref>`
  with version = latest; title XML-escaped; attributes escaped.
- `resolveFullToken`: cache-first (cached metadata supplies kind and
  version), then a targeted `getArtifact` on miss; unresolvable
  references stay as typed.
- The engine's per-turn instruction block grows the artifact-ref shape.

## Do NOT touch

- The engine's SWR, cache, warmup gating internals: the adapter rides
  them exactly as the task adapter does.
- The rule kind or either alias (tickets 3 and 4 behavior).
- `aura-tasks.ts` (probe only).

## Seams under test

- The artifact adapter's pure functions: local filtering (id prefix +
  title substring), row formatting (title label, uuid description, full
  uuid value), expansion, resolution (injected client).
- The SWR integration is already seam-tested generically; only the
  adapter's `searchServer` mapping needs its own tests.
- Repo test conventions unchanged: pure exported functions,
  `node --experimental-strip-types` + `node:assert`.

## Interface contract for the wiki ticket

`reference-wiki-kind` follows this shape with dual-identity parsing
(uuid vs space/path); anything the artifact adapter learns about
metadata-driven expansion attributes should be recorded in the task
doc's implementation notes for the wiki ticket to reuse.
