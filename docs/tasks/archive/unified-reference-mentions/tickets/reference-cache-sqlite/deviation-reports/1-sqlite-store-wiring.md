---
type: deviation report
title: 1-sqlite-store-wiring
status: stable
---
## Deviation report: 1-sqlite-store-wiring

Scope reviewed: `git diff 7ee5a9b0..HEAD` (6 commits, 3 files:
`extensions/aura-reference-cache.ts` (new),
`extensions/aura-reference-cache.test.ts` (new),
`extensions/aura-references.ts`). Tests run:
`node --experimental-strip-types extensions/aura-reference-cache.test.ts`
passes (9 sections), `node --experimental-strip-types
extensions/aura-references.test.ts` passes (35 sections, unchanged),
root vitest 236 green, source typecheck
(`tsc --noEmit` over both extension sources, bundler resolution +
`allowImportingTsExtensions`) clean. The pre-existing red
(`atlassian-provision.test.ts`) is unchanged and out of scope (filed as a
bug on develop).

### API surface changes

- **Planned (arch spec, Exports):** the sqlite store factory (injectable db
  path + base URL), the TTL/warmup-gate pure function, and the TTL settings
  loader.
- **Actual:** the store factory landed as specified this slice
  (`createSqliteReferenceCache({ dbPath, baseUrl, now?, busyTimeoutMs? })`
  plus `defaultReferenceCacheDbPath()`); the TTL loader and the gate
  function are slice 2 and are not present yet. Three refinements:

  1. **The store lives in a new module, `aura-reference-cache.ts`, not
     inside `aura-references.ts`.** The arch spec did not fix a location.
     The split keeps `aura-references.test.ts` (the engine's unit-test
     entry point) free of `node:sqlite` entirely and gives the store its
     own focused test file. The module imports only node builtins plus
     `./aura-references.ts` (the cache types and the in-memory fake), so
     `node --experimental-strip-types` runs it directly.
  2. **`fetchedAt(kind)` is derived, not stored: `MAX(fetched_at)` over the
     kind's rows.** There is no separate kind-level stamp table. A kind
     with no rows reads as null (never fresh-by-omission, per the arch
     spec's contract), and a kind whose newest row is old reads as old,
     even when a more recent write to that kind wrote zero rows (the
     no-stamp semantics).
  3. **Empty writes stamp nothing in the store** (`write(kind, [])` is a
     no-op). The in-memory fake in `aura-references.ts` still stamps an
     empty write (`lastWrite.set`), and is deliberately untouched (slice
     constraint); the difference is unobservable through the engine because
     `refreshReferenceKind` never writes empty results and the slice 2
     gate treats empty item lists as fetch regardless of the stamp.

### Abstraction usage

- Used/was specified: **yes.**
- The as-built cache interface (`read(kind)` / `write` / `fetchedAt`): the
  store implements exactly that shape; the engine, the provider, the SWR
  refresh, and every existing test run unchanged against it (the
  engine-compat section drives `refreshReferenceKind` through the store).
- `@pi-aura/shared/settings` for the base URL: used by the production
  wiring (`createSessionCache` in `aura-references.ts`) through the
  dynamic-import seam (`loadAuraClientSettings().baseUrl ?? ""`; the
  empty string is the single-instance default when no base URL is
  configured). Multi-instance keying is exercised in the store tests.
- The settings-reading pattern from `engineering-rules.ts`
  (`globalSettingsPath`): used for the default path resolution shape
  (homedir computed lazily inside `defaultReferenceCacheDbPath`, so tests
  can override `HOME`); the TTL loader itself is slice 2.
- Do-NOT-reimplement list respected: `refreshReferenceKind`, the provider,
  the `canRefresh` gate, the adapters, and the expansion path are
  untouched (the only engine-file changes are the wiring swap, the
  session-cache construction helper, doc comments, and the reload-hygiene
  `sessionCache = null` reset at the top of `session_start`). No
  `better-sqlite3`; `node:sqlite` only, and no new runtime dependency of
  any kind (`package.json` untouched, not even the manifest list: the
  store is a module of the existing `aura-references` extension, not a new
  extension).

### Out-of-scope changes

- `busyTimeoutMs` option and the `BEGIN IMMEDIATE` write transaction are
  slice 3's territory, but they are structurally load-bearing for the
  store now (the busy timeout bounds every write; IMMEDIATE takes the lock
  at transaction start). Slice 3 exercises and documents them; the default
  (500 ms) is recorded in the options doc comment.
- The `sessionCache = null` reset at the top of `session_start` (reload
  hygiene while the async cache construction is in flight): a one-line
  wiring hardening, behaviorally invisible before this slice (the
  assignment used to be synchronous).
- Nothing else: `aura-tasks.ts`, `engineering-rules.ts`, the shared
  package, and the manifest are untouched.

### Divergence from the slice doc's acceptance criteria

None. All seven criteria are implemented and tested: `node:sqlite`
`DatabaseSync` with WAL journal mode verified by pragma (injectable path,
default `~/.pi/agent/aura-reference-cache.db`), the one table keyed
`(base_url, kind, id)` with `item_key`, `title`, `status`, metadata JSON,
and `fetched_at`, the as-built cache interface (the in-memory fake
untouched), the production wiring swap, the silent in-memory fallback
(unopenable path: a directory; corrupt file: garbage bytes, and the file
is left untouched), and the focused temp-file tests (roundtrip for two
kinds, reopen persistence, WAL mode, base-URL keying isolation, plus the
test-plan extras: upsert no-dup, metadata fidelity for nested values,
unicode and 5000-char titles, empty-write no-stamp, dropped-schema
swallowed failures, and the engine SWR write-through). Test-plan
adaptation: "write to a closed/removed db file (swallowed)" is pinned via
a dropped schema rather than a file unlink, because an unlinked open
sqlite descriptor keeps accepting writes on Linux and therefore does not
deterministically fail; the dropped schema produces the same failure
class (the write cannot run) deterministically. The two-session demo
(warm one session, fresh session, instant first keystroke) is covered by
the reopen-persistence and engine-compat tests plus a one-off wiring
probe that loaded the extension through jiti (pi's loader), ran a fake
`session_start` with `HOME` pointed at a temp dir, and observed instant
suggestions served from the pre-seeded persisted cache before any fetch
could land. Constraints hold: no em-dashes, no runtime dependency beyond
`node:sqlite`, repo test style (`node --experimental-strip-types` +
`node:assert/strict`, pure exported functions).

### Task doc update needed?

Yes. Append to `## Implementation notes` (the land worker should create
the section):

- The store module location and shape: `extensions/aura-reference-cache.ts`,
  `createSqliteReferenceCache({ dbPath, baseUrl, now?, busyTimeoutMs? })`
  plus `defaultReferenceCacheDbPath()`; the production wiring
  (`createSessionCache` in `aura-references.ts`) dynamic-imports both the
  settings reader (base URL) and the store module, so
  `aura-references.test.ts` stays free of `node:sqlite` and a Node build
  without sqlite support degrades to the in-memory cache instead of
  failing the extension load.
- The schema: one table `reference_items` keyed `(base_url, kind, id)`
  with `item_key`, `title`, `status` (nullable), `metadata` (JSON of every
  non-engine-known item field), `fetched_at` (epoch ms). Kind-specific
  extras (artifact kind/version, wiki space/path/version) ride the
  metadata column without migration; `fetchedAt(kind)` is `MAX(fetched_at)`
  over the kind's rows.
- The empty-write divergence between the fake and the store (above).

### User attention needed?

No. Everything is within the approved slice plan; the new-module choice
and the derived `fetchedAt` are recorded above for the dependent artifact
and wiki tickets (both consume the metadata column and the kind-agnostic
interface as specified).
