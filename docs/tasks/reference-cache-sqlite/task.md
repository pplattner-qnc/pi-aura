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
