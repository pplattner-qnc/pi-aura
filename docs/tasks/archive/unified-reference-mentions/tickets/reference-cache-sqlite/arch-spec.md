---
type: arch spec
title: "Architecture spec: reference-cache-sqlite"
status: stable
---
# Architecture spec: reference-cache-sqlite

Status: approved. The user approved this slice plan, including the TTL
semantics decision below.

- Task doc: `docs/tasks/reference-cache-sqlite/task.md`
- Effort spec: `docs/tasks/unified-reference-mentions/spec.md` (binding
  Implementation and Testing Decisions)
- Map: `docs/tasks/maps/unified-reference-mentions/map.md` (branching
  mandate in Constraints)

## Binding decision: what the TTL gates

The per-query background refresh stays ALWAYS-ON: user story 10 (a
recently renamed title corrects itself within a keystroke) and the map
constraint (every autocomplete query also fetches from Aura) require it.
The TTL therefore gates the session-start warmup only: while the
persisted cache is within TTL and non-empty, the warmup fetch is skipped
entirely (instant session start, far fewer Aura calls); expired or empty
caches trigger the warmup fetch. Reads always serve entries instantly
(stale-while-revalidate), regardless of expiry.

## Plan against the as-built interface

Read `extensions/aura-references.ts` FIRST. Ticket 1's deviation report
is explicit: the cache interface as built is `read(kind)` (no query
param), `write`, and `fetchedAt` stamping; the SWR seam is
`refreshReferenceKind(cache, adapter, partial, { signal })` with the
`canRefresh` gate. The sqlite store implements THAT interface. If a
richer read is needed (per-item freshness), extend the interface
additively without breaking the in-memory fake or the existing callers.

## Shape

A `node:sqlite` (`DatabaseSync`) store at
`~/.pi/agent/aura-reference-cache.db`, WAL journal mode, shared by all
pi sessions as a plain file. One table of cached referenceable items
keyed by `(base_url, kind, id)` with `title`, a metadata JSON column,
and `fetched_at`. The base URL comes from the same settings module the
AuraClient uses (`aura.baseUrl`), so multi-instance setups never
cross-contaminate. The metadata JSON column keeps the schema
kind-agnostic: artifact and wiki kinds (later tickets) add metadata
without a migration.

## Exports

- The sqlite store factory: takes an injectable db path and the base URL
  (tests pass a temp-file path).
- The TTL / warmup-gate decision as a pure function: items +
  `fetchedAt` + ttl + now to fetch-or-skip, with an injectable clock.
- The TTL settings loader: `aura.references.cacheTtlMs` from
  `~/.pi/agent/settings.json` with a project `.pi/settings.json`
  override (override precedence, not a union), defaulting to a value on
  the order of hours (exact default decided in implementation).

## Existing abstractions to use

- The as-built cache interface and in-memory implementation from
  `aura-references.ts` (the in-memory one remains the unit-test fake;
  the production wiring swaps to the sqlite store).
- The settings-reading pattern from `engineering-rules.ts`
  (`loadIgnoreGlobs` reads global + project files; here it is an
  override, not a union) and `@pi-aura/shared/settings` for the base
  URL.

## Do NOT reimplement

- The SWR orchestration (`refreshReferenceKind`), the provider, the
  `canRefresh` gate, the adapters, or the expansion path: untouched.
  Only the cache backing swaps.
- No `better-sqlite3` or any other dependency: `node:sqlite` only
  (repo constraint; verified present on Node v24).

## Failure policy (live-package rule)

The extension must never throw into the session: a db that cannot be
opened (unreadable path, corrupt file, locked) silently falls back to
the in-memory cache for that session. Cache writes are fire-and-forget
side effects that never block `getSuggestions`; a failed write is
swallowed.

## Seams under test

- The real store against a temp-file db (roundtrip, WAL mode, reopen
  persistence, base-URL keying, concurrent writers, busy-timeout
  behavior).
- The TTL / warmup-gate decision function (injected clock).
- The TTL settings loader (injectable paths, malformed files fall back
  to the default).

Tests are pure exported functions run with
`node --experimental-strip-types` + `node:assert`, per repo convention.

## Interface contract for dependent tickets

- Tickets 5 and 6 (artifact, wiki) write items with kind-specific
  metadata (artifact kind/version; wiki space/path/version): the schema
  must accept arbitrary metadata JSON without migration, and the cache
  interface stays kind-agnostic.
- Empty server results write nothing and stamp nothing (ticket 1's
  no-stamp semantics): the TTL logic must treat an unstamped-but-present
  row by its `fetched_at`, never as fresh-by-omission.

## Per-slice notes

### Slice 1: sqlite store + production wiring

The store, the schema, the base-URL keying, the wiring swap, and the
temp-file test rig. Demo: warm one session, open a fresh pi session,
suggestions are instant on the first keystroke.

### Slice 2: TTL + warmup gating

The settings loader, the pure gate function, the warmup integration
(expired or empty fetches; within TTL and non-empty skips), expired
entries still served instantly. Per-query refresh unchanged.

### Slice 3: write coalescing + concurrency

Concurrent sessions racing per-keystroke refreshes into the same WAL
file: busy timeout, no lost updates beyond last-writer-wins per key, no
corruption, no hang on the query path. The folded Fog, settled.
