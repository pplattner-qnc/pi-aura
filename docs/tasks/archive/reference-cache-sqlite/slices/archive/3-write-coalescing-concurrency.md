---
kind: slice
slug: 3-write-coalescing-concurrency
title: "Write coalescing and cross-session concurrency"
task: ../task.md
mode: afk
status: done
size: m
legacy_blocked_by: [1-sqlite-store-wiring]
---

## End-to-end behavior

Multiple pi sessions race per-keystroke refresh writes into the same WAL
database file without corruption, hangs, or errors escaping into any
session. The store configures a sane busy timeout, coalesces writes
(last-writer-wins per `(base_url, kind, id)` key, no duplicate rows, no
torn writes), and a write that cannot complete in time is swallowed
rather than blocking the query path. This settles the map's folded Fog
item on cache write-through batching under per-keystroke refreshes.

## Acceptance criteria

- [ ] A busy timeout is configured; concurrent writers from tests land without `SQLITE_BUSY` errors escaping the store's API.
- [ ] Parallel writes of overlapping keys are last-writer-wins per key with no torn or duplicate rows.
- [ ] After concurrent writes, reopening the db shows an intact, queryable state.
- [ ] A write that times out is swallowed; `getSuggestions` is never blocked by a cache write.
- [ ] The coalescing semantics (what a per-keystroke refresh actually writes: full upsert per item) are documented in the task doc's implementation notes.
- [ ] Dependency audit: no runtime dependency beyond `node:sqlite`.

## Test plan

Seams: the real store against a temp-file db under concurrent load.

Failure modes: write while another writer holds the lock (busy timeout,
swallow); write to a db removed mid-session (swallowed); interleaved
upserts of the same key from two store instances (consistent final row).

Scenarios: N parallel writers each writing M distinct items (all land);
two writers racing the same key repeatedly (final state is one of the
written values, row count is 1); read while a write is in flight (read
returns, no hang).

Edge cases: a long transaction held open (busy timeout elapses, the
write is dropped, no exception escapes); WAL checkpointing under load
(reopen succeeds).

## Constraints

- The query path is never blocked: cache writes are fire-and-forget
  side effects.
- No em-dashes in prose.
