---
type: ticket
title: "#wiki: references end-to-end"
status: stable
blocked_by:
- reference-engine-core
- reference-cache-sqlite
subtype: feature
workflow_state: ready
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
