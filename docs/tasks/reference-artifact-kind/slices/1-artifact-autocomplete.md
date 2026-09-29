---
kind: slice
slug: 1-artifact-autocomplete
title: "#artifact: autocomplete end-to-end (warmup, uuid rows, server search)"
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: []
---

## End-to-end behavior

Typing `#artifact:` opens autocomplete with Aura artifacts from the
persistent cache, matched by id prefix or title substring
(case-insensitive); the same query fires the server-side `listArtifacts`
search (`q`) through the existing SWR seam, whose results merge over
local ones and write through to the cache, so a recently created
artifact appears one keystroke after the refresh lands. Rows show the
artifact title as the label with the uuid only in the description;
selecting one inserts the full uuid token `#artifact:<uuid>`. The
session-start warmup pages artifacts into the cache through the
TTL-gated path. Without Aura credentials: warmup no-ops, the provider
defers, nothing fetches.

## Acceptance criteria

- [ ] The artifact adapter is registered behind the common interface; local filtering matches id prefix and title substring, case-insensitively.
- [ ] Warmup pages `listArtifacts` into the persistent cache via the TTL-gated session-start path; the pagination bound is recorded in the task doc's implementation notes.
- [ ] Server-side `listArtifacts` search (`q`) fires per query through the SWR seam; results merge over local and write through to the cache.
- [ ] Suggestion rows show the title as the label, the uuid in the description, and insert the full uuid as the value.
- [ ] Cache items carry the artifact kind and latest version in the metadata JSON column.
- [ ] Without credentials: silent defer everywhere, nothing throws into the session.
- [ ] Unit tests cover the adapter's pure seams: filtering (id prefix + title substring), row formatting, and the searchServer mapping (injected client).

## Test plan

Seams: the adapter's pure functions (filtering, rows, searchServer
mapping).

Failure modes: no credentials (defer, no fetch); empty server result
(no write, no stamp, per the established no-stamp semantics); a fetch
failure mid-warmup (swallowed, cache keeps prior rows).

Scenarios: `#artifact:` empty partial shows the head of the cache;
`#artifact:9f3` matches an id prefix; `#artifact:onboard` matches a
title substring; a server-only match (not cached) appears after the
write-through; a title containing XML-special characters does not break
row formatting.

Edge cases: two artifacts whose titles collide (both listed, uuid
disambiguates); a very long title (row truncation is the renderer's
job); a cached artifact whose server copy was renamed (stale title
served, corrected one keystroke after refresh).

## Constraints

- The uuid appears in the text box only after selection (prototype
  decision).
- No engine surgery: the adapter rides the registry.
- No em-dashes in prose.
