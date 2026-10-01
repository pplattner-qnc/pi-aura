---
type: ticket
title: Persistent sqlite cache for reference autocomplete
status: deprecated
blocked_by:
- reference-engine-core
subtype: feature
workflow_state: done
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

### Slice 2: 2-ttl-warmup-gating (landed)

- The default TTL is 6 hours (`DEFAULT_REFERENCE_CACHE_TTL_MS`). The TTL
  gates only the session-start warmup (reads are always served,
  stale-while-revalidate; the per-query refresh is always-on), so a
  working-session-scale default maximizes skipped warmups without
  materially delaying eventual freshness.
- `loadReferenceCacheTtlMs({ globalSettingsPath?, projectSettingsPath? })`
  reads `aura.references.cacheTtlMs` from `~/.pi/agent/settings.json` with a
  `<cwd>/.pi/settings.json` project override (override precedence, not a
  union). Missing files, malformed JSON, missing blocks, and non-finite
  values fall back to the default without throwing; a configured finite
  number passes through as-is, including zero and negative values.
- `shouldSkipReferenceWarmup({ items, fetchedAt, ttlMs, now })` is the pure
  gate: skip only when non-empty, stamped, and strictly
  `now < fetchedAt + ttl` (at exactly the boundary the cache is expired and
  fetches). Empty caches, unstamped caches (never fresh-by-omission), and
  non-positive TTLs (always-expired, never skip-everything) all fetch.
- The wiring: `createSessionCache()` returns
  `{ cache, shouldSkipWarmup(kind) }`; the TTL and the gate come from the
  same dynamic import as the store, and the fallback path (module or
  settings unavailable) returns an always-fetch gate, exactly the
  pre-gate warmup behavior. The gated loop skips `adapter.warmup` for kinds
  whose persisted cache is within TTL and non-empty; the per-query
  background refresh is untouched and stays always-on.

### Slice 3: 3-write-coalescing-concurrency (landed)

- The coalescing semantics (what a per-keystroke refresh actually writes):
  one full upsert per item per refresh, wrapped in a single
  `BEGIN IMMEDIATE` transaction per `write(kind, items)` call. A refresh
  that returns N items writes those N rows atomically (all rows or no
  rows: never a torn half of a keystroke refresh); rows outside the
  refreshed partial are never touched. Cross-session races resolve
  last-writer-wins per `(base_url, kind, id)` key with no duplicate rows
  (the primary-key upsert), and stale rows outside any refresh window are
  served until some later refresh upserts them (stale-while-revalidate).
- The busy timeout defaults to 500 ms (`busyTimeoutMs` option). It bounds
  how long a blocked write waits before it is dropped (swallowed, never
  thrown); because `DatabaseSync` is synchronous, it also bounds the worst
  case of event-loop blocking a background write can cause, which is why
  the default is deliberately small. `BEGIN IMMEDIATE` takes the write
  lock at transaction start, so the busy timeout applies once at
  acquisition instead of failing mid-batch.
- Concurrent FIRST opens retry: SQLite does not invoke the busy handler
  for a `journal_mode` switch, so pi sessions racing the very first
  creation of the shared file used to see `database is locked` from the
  WAL pragma and silently fall back to in-memory, dropping all of that
  session's writes (reproduced: 4 racing writers landed only 50 to 150 of
  200 items). The factory now retries the open sequence up to 5 times with
  a linear 25 ms backoff (~250 ms worst case, synchronous via
  `Atomics.wait`), with `busy_timeout` set before the WAL pragma; only a
  database that still cannot be opened after the retries falls back to the
  in-memory cache.
- Reads under WAL never wait for writers (snapshot isolation): the query
  path serves the cached view while another session's write transaction
  is in flight; pinned with a sub-100 ms bound in the tests.
