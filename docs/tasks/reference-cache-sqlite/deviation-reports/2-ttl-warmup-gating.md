## Deviation report: 2-ttl-warmup-gating

Scope reviewed: `git diff de47368b..HEAD` (3 commits, 2 files:
`extensions/aura-reference-cache.ts`,
`extensions/aura-reference-cache.test.ts`, plus the wiring hunks in
`extensions/aura-references.ts`). Tests run:
`node --experimental-strip-types extensions/aura-reference-cache.test.ts`
passes (11 sections), `node --experimental-strip-types
extensions/aura-references.test.ts` passes (35 sections, unchanged: the
per-query refresh suite stays green untouched), root vitest 236 green,
source typecheck clean. The pre-existing red
(`atlassian-provision.test.ts`) is unchanged and out of scope.

### API surface changes

- **Planned (arch spec, Exports):** the TTL settings loader
  (`aura.references.cacheTtlMs`, global with project override, default on
  the order of hours) and the TTL / warmup-gate decision as a pure
  function (items + fetchedAt + ttl + now to fetch-or-skip, injectable
  clock).
- **Actual:** both landed as specified. `loadReferenceCacheTtlMs({
  globalSettingsPath?, projectSettingsPath? })` (injectable paths),
  `DEFAULT_REFERENCE_CACHE_TTL_MS = 6 * 60 * 60 * 1000`, and
  `shouldSkipReferenceWarmup({ items, fetchedAt, ttlMs, now })` (the now
  parameter is the injectable clock). Two refinements:

  1. **The default TTL is 6 hours.** The slice doc deferred the exact
     value to implementation with a task-note record: the TTL gates only
     the session-start warmup (reads are always served, the per-query
     refresh is always-on), so a working-session-scale default maximizes
     skipped warmups without materially delaying eventual freshness; 6
     hours sits between the extremes of "every session refetches" and
     "stale for a day".
  2. **The gate's boundary is documented as strict:** fresh means
     `now < fetchedAt + ttl`; at exactly `fetchedAt + ttl` the cache is
     expired and fetches. The slice doc asked for the boundary to be
     documented in the code; it is (in `shouldSkipReferenceWarmup`'s doc
     comment) and the tests pin both sides of the line.

- **Wiring shape (not in the export list, in the wiring contract):**
  `createSessionCache()` in `aura-references.ts` now returns
  `{ cache, shouldSkipWarmup(kind) }` instead of a bare cache: the TTL and
  the gate come from the same dynamic import as the store, and the
  fallback path (module or settings unavailable) returns an
  always-fetch gate, exactly the pre-gate warmup behavior.

### Abstraction usage

- Used/was specified: **yes.**
- The settings-reading pattern from `engineering-rules.ts`
  (`readIgnoreGlobs`/`loadIgnoreGlobs`): mirrored as
  `readCacheTtlMs`/`loadReferenceCacheTtlMs` (per-file tolerant reader
  with null-on-malformed semantics, lazy `homedir()` path), with the
  documented difference that the project file overrides the global one
  instead of unioning with it.
- The as-built cache interface: the gate consumes
  `read(kind)`/`fetchedAt(kind)` exactly as the arch spec's "Plan against
  the as-built interface" prescribed; nothing in the interface changed.
- Do-NOT-reimplement list respected: `refreshReferenceKind`, the
  provider, the `canRefresh` gate, the adapters, and the expansion path
  are untouched; the whole `aura-references.ts` diff is the
  `createSessionCache` return shape, the gated warmup loop, and doc
  comments.

### Out-of-scope changes

- None beyond the wiring hunks described above. No engine behavior
  changed: the existing 35-section engine suite (including all six
  `refreshReferenceKind` SWR sections) passes unmodified.

### Divergence from the slice doc's acceptance criteria

None. All six criteria are implemented and tested: the settings loader
(default, global value, project override precedence, malformed file /
missing block / non-number fallbacks, zero and negative passthrough), the
6-hour default recorded in the task doc's implementation notes, the pure
gate (fresh skip, expired-by-one-ms fetch, strict boundary, empty fetch,
unstamped fetch, non-positive TTL fetch, injected now), expired entries
still served instantly by reads (the store never filters by TTL; pinned in
the store + gate integration section), and the per-query refresh
unchanged (the engine suite passes untouched). Test-plan adaptation: the
slice doc's "cache with items but no `fetched_at` stamps" edge case is
pinned at the pure gate (`fetchedAt: null` with items fetches), because
the sqlite schema cannot represent an unstamped-but-present row
(`fetched_at` is NOT NULL) and the store's derived
`fetchedAt(kind) = MAX(fetched_at)` makes the no-rows case null by
construction; the semantic (never fresh-by-omission) is what the arch
spec's contract asked the TTL logic to guarantee. The wiring integration
itself (the six-line gate call in `session_start`) is review-verified
rather than probe-verified: without Aura credentials a skipped warmup and
a fired-then-failed warmup are externally identical, and the gate
decision is unit-tested at exactly the wiring's call shape (the store +
gate integration section constructs the same
`read`/`fetchedAt`/`shouldSkipReferenceWarmup` inputs). Constraints
hold: no em-dashes, `refreshReferenceKind`/provider/`canRefresh`
untouched, repo test style.

### Task doc update needed?

Yes. Append to `## Implementation notes` under a slice 2 heading: the
default TTL decision (6 hours and why), the strict boundary semantics,
the loader's override precedence and passthrough of zero/negative
values, and the `createSessionCache` return-shape change.

### User attention needed?

No. The default TTL value (the one decision the slice doc left to
implementation) is recorded above and in the task notes; everything else
is within the approved plan.
