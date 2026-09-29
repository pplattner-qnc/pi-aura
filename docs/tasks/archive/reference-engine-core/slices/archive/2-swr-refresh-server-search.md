---
kind: slice
slug: 2-swr-refresh-server-search
title: "Stale-while-revalidate refresh and server-side task search"
task: ../task.md
mode: afk
status: done
size: m
blocked_by: [1-task-autocomplete-warm-cache]
---

## End-to-end behavior

Stale-while-revalidate lands on the provider. `getSuggestions` returns
the cache instantly and never awaits an Aura fetch; the same call fires a
background refresh guarded by the request's abort signal, which writes
through to the in-memory cache, so fresh results appear on the next
keystroke (pi-tui re-queries per keystroke with a 20 ms debounce and
drops late results itself). The background refresh also runs the
server-side task search (`listTasks` with `search`) for the typed partial
and merges those results over the local ones. Demo: rename a task title
in Aura, keep typing, and the corrected title appears one keystroke
later; a task outside the local window is findable by title substring.

## Acceptance criteria

- [ ] `getSuggestions` resolves from the cache without awaiting any Aura fetch (verifiable with an injected fetch that never resolves).
- [ ] Every query fires a background refresh guarded by the request abort signal; aborted requests stop their work.
- [ ] A completed refresh writes through to the cache; the next query sees fresh data.
- [ ] Server-side `listTasks` search results for the typed partial merge over local results.
- [ ] Transient fetch failures are swallowed: cached suggestions still return, nothing throws into the session.
- [ ] Without credentials no refresh is fired at all.

## Test plan

Seam: SWR orchestration (pure function taking an injected controllable
fetch and the fake cache).

Failure modes: the fetch rejects (cached items still returned, cache
untouched); the fetch hangs and then the abort signal fires (no write
after abort); the server returns an empty result (local items kept).

Scenarios: cached item with a stale title plus a server result carrying
the corrected title (write-through, next read fresh); a server-only match
not in the cache is added; abort before resolution prevents the write;
rapid successive queries (the later aborts the earlier).

Edge cases: a server result duplicating a cached item (dedupe by id);
server results with unknown extra fields; a server error mid-page.

## Constraints

- Never block `getSuggestions` on the network.
- pi-tui's debounce, serialization, and late-result dropping are NOT
  retested here; they are pi's own tested surface (per the effort spec).
- No em-dashes in prose.
