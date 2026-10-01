---
kind: slice
slug: 1-wiki-autocomplete
title: "#wiki: autocomplete end-to-end (dual identity, space/path rows)"
task: ../task.md
mode: afk
status: done
size: m
legacy_blocked_by: []
---

## End-to-end behavior

Typing `#wiki:` opens autocomplete with wiki pages from the persistent
cache, offered by their space/path form; the same query fires
`mcpWikiSearch` through the SWR seam, whose results merge over local and
write through to the cache. Rows show the space/path with the page
title; selecting ALWAYS inserts the readable `#wiki:<space>/<path>`
token, never a uuid. The adapter's partial parsing discriminates uuid
form from path form by shape, so a hand-typed `#wiki:<uuid>` partial is
also recognized (for resolution later, not for row insertion). The
session-start warmup populates the wiki cache. Without Aura credentials:
warmup no-ops, the provider defers, nothing fetches.

## Acceptance criteria

- [ ] The wiki adapter is registered behind the common interface; partial parsing discriminates uuid vs path form by shape.
- [ ] Local filtering matches space/path substrings and title substrings, case-insensitively, over cached items.
- [ ] `mcpWikiSearch` results merge over local and write through to the cache.
- [ ] Rows show the space/path with the title; selection inserts `#wiki:<space>/<path>` (never the uuid).
- [ ] The search-hit-to-path derivation is a pure, unit-tested function over the real payload shape, with the choice recorded in the task doc's implementation notes.
- [ ] Warmup runs at session start (source per the arch spec's open detail; the choice recorded).
- [ ] Cache items carry space, path, and version in the metadata JSON column; the uuid is the item id.
- [ ] Without credentials: silent defer everywhere, nothing throws into the session.

## Test plan

Seams: the adapter's pure functions (dual-identity parsing, filtering,
rows, searchServer mapping, the hit-to-path derivation).

Failure modes: no credentials (defer, no fetch); empty server result
(no write, no stamp); a search hit whose path cannot be derived
(fallback path per the recorded decision, never a crash).

Scenarios: `#wiki:` empty partial lists the head of the cache;
`#wiki:eng/` matches a space prefix; `#wiki:eng/process/pr` narrows by
path; `#wiki:conven` matches a title substring; a server-only match
appears after write-through; a hand-typed uuid partial is recognized as
wiki-shaped.

Edge cases: two pages with the same title in different spaces (rows
disambiguate by space/path); a page with unicode title; a hit with a
missing `space_slug` (handled per the derivation decision).

## Constraints

- The uuid form is for hand-typed/programmatic references: no uuid
  insertion from autocomplete (map decision).
- No engine surgery: the adapter rides the registry.
- No em-dashes in prose.
