---
kind: task
type: feature
slug: reference-cache-sqlite
title: Persistent sqlite cache for reference autocomplete
map: unified-reference-mentions
status: ready
blocked_by: [reference-engine-core]
slices: [1-sqlite-store-wiring, 2-ttl-warmup-gating, 3-write-coalescing-concurrency]
---

## What to build

The production backing for the reference cache: a persistent,
cross-session sqlite store so autocomplete is instant in every pi
session, not just warm ones. Built on `node:sqlite` (`DatabaseSync`) at
`~/.pi/agent/aura-reference-cache.db` with WAL journal mode, shared by
all pi sessions as a plain file (no extra process). One table of cached
referenceable items keyed by `(kind, id)` with a `fetched_at` timestamp
and the per-kind metadata the rows and expansions need (task status;
artifact kind and version; wiki space, path, and version).

Reads are stale-while-revalidate: entries past their TTL are still served
instantly but always trigger the background refresh. The TTL comes from
`aura.references.cacheTtlMs` in `~/.pi/agent/settings.json` (project
`.pi/settings.json` may override), defaulting to a value on the order of
hours (the exact default is decided in implementation). Cache keying
includes the Aura base URL so multi-instance setups never
cross-contaminate. Write coalescing under per-keystroke refreshes is
settled here (WAL handles cross-session concurrency).

The engine's production wiring swaps from the in-memory cache to the
sqlite store; the in-memory implementation remains as the unit-test
fake.

## Acceptance criteria

- [ ] The sqlite store implements the cache interface behind the engine; autocomplete behavior is unchanged except that it now persists.
- [ ] The database lives at `~/.pi/agent/aura-reference-cache.db`, WAL journal mode, one table keyed by `(kind, id)` with `fetched_at`.
- [ ] A warm session followed by a fresh pi session shows instant suggestions on the first keystroke.
- [ ] TTL from `aura.references.cacheTtlMs` (global settings, project override, default on the order of hours); expired entries are served instantly and always trigger a background refresh.
- [ ] Cache keying includes the Aura base URL.
- [ ] Write coalescing behaves sanely under per-keystroke refreshes across concurrent sessions.
- [ ] A focused test exercises the real store against a temp file: WAL mode, TTL expiry, stale-while-revalidate read behavior, base-URL keying.
- [ ] No new runtime dependency: `node:sqlite` only (repo constraint).

## Blocked by

- reference-engine-core

## Implementation notes

### Slice 1: 1-sqlite-store-wiring (landed)

- The store lives in its own module, `extensions/aura-reference-cache.ts`:
  `createSqliteReferenceCache({ dbPath, baseUrl, now?, busyTimeoutMs? })`
  plus `defaultReferenceCacheDbPath()`
  (`~/.pi/agent/aura-reference-cache.db`). The split keeps the engine's
  unit-test entry point (`aura-references.test.ts`) free of `node:sqlite`
  entirely; the store module imports only node builtins plus
  `./aura-references.ts` (the cache types and the in-memory fake).
- The schema: one table `reference_items` keyed `(base_url, kind, id)` with
  `item_key`, `title`, `status` (nullable), `metadata` (JSON of every
  non-engine-known item field: kind-specific extras like artifact
  kind/version or wiki space/path/version ride this column without
  migration), and `fetched_at` (epoch ms). Reads return rows in `rowid`
  order (insertion order, upserts keep their position), matching the
  in-memory fake's Map semantics.
- `fetchedAt(kind)` is derived, not stored: `MAX(fetched_at)` over the
  kind's rows. A kind with no rows reads as null (never
  fresh-by-omission), and the newest row drives the decision even when a
  more recent write to that kind wrote zero rows: empty writes write
  nothing and stamp nothing in the store (the in-memory fake still stamps
  an empty write; deliberately untouched, and unobservable through the
  engine because `refreshReferenceKind` never writes empty results and
  the warmup gate treats empty item lists as fetch regardless).
- The production wiring: `createSessionCache()` in `aura-references.ts`
  dynamic-imports both `@pi-aura/shared/settings` (the base URL, `?? ""`
  when unset) and the store module, then builds the store; any failure
  falls back to the session-scoped in-memory cache. The dynamic imports
  keep `node --experimental-strip-types` test runs working and let a Node
  build without sqlite support degrade to the in-memory cache instead of
  failing the extension load. `session_start` now nulls the previous
  session's cache before the async construction (reload hygiene) and
  awaits the cache before arming warmup.
- Writes are one `BEGIN IMMEDIATE` transaction per call (the busy timeout
  applies at lock acquisition, not mid-batch): a keystroke refresh lands
  atomically, all rows or no rows. All failures (unopenable db at
  construction: silent in-memory fallback; busy timeout, schema lost,
  damaged file at read/write time: swallowed, reads degrade to empty,
  stamps to null) never throw into the session; a corrupt file is never
  overwritten or destroyed.
