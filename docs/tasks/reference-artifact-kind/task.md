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
