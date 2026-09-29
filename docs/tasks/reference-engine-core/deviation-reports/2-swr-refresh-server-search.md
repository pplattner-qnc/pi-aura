## Deviation report: 2-swr-refresh-server-search

Scope reviewed: `git diff task/reference-engine-core..HEAD` (6 commits, 2
files: `extensions/aura-references.ts` +97/-3,
`extensions/aura-references.test.ts` +464/-0). Tests run:
`node --experimental-strip-types extensions/aura-references.test.ts`
passes (26 sections, including all slice 1 seams unchanged).

### API surface changes

- **Planned (arch spec, per-slice notes):** the SWR orchestration function
  (injected fetch + cache); contract: `getSuggestions` never awaits an Aura
  fetch, the background refresh is abort-guarded and writes through to the
  cache, server-side `listTasks` search results merge over local ones.
- **Actual:** all planned behavior landed and is test-pinned. One export,
  one planned-surface addition, two refinements worth recording:

  1. **The SWR function is `refreshReferenceKind(cache, adapter, partial,
     options?: { signal })`.** The "injected fetch" is the adapter's
     `searchServer` method, whose Aura access is the injectable
     `createClient` factory (production: the dynamic-imported
     `createDefaultAuraClient`; tests: controllable deferred fakes). The
     seam is injected at one remove rather than a bare fetch callback, but
     the arch spec's seam 5 is satisfied in substance: tests control every
     fetch, its timing, its answer, and its failure. Impact: none for
     dependent slices; the pure orchestration stays importable and
     fake-cache/fake-client testable exactly as the effort spec's Testing
     Decisions require.
  2. **`createReferenceAutocompleteProvider` gained an optional fourth
     parameter `refreshOptions?: { canRefresh?: () => boolean }`**
     (default: refresh allowed). Not in the arch spec's export list for
     this slice, but the need was pre-flagged: the slice 1 report and the
     task doc's Implementation notes both said slice 2 "needs an explicit
     no-refresh gate for the no-credentials state". The gate is how
     "without credentials no refresh is fired at all" is enforced in the
     production wiring (the factory arms it from a one-shot
     `createDefaultClient()` probe at `session_start`). Impact: additive
     and optional, so no dependent call site or test breaks.
  3. **The refresh fires on every reference query, including zero-match
     partials** (which then defer their rows to the built-in provider);
     non-reference tokens fire none. This is required for the "task outside
     the local cache window is findable" end-to-end behavior and is
     test-pinned.
  4. **The server search is a single `listTasks` call**: `search: partial,
     status: "ALL", archived: "all", limit: 20 (MAX_SUGGESTIONS),
     updated_at desc`. Not paginated like the warmup; the spec prescribes
     no fetch size, and 20 rows exceed the pane bound, but the sqlite
     ticket should know the per-refresh fetch is capped here.

- **Impact on dependent slices:** none blocking. Slice 3 consumes
  `formatExpansion`, `resolveFullToken`, and the alias table; nothing this
  slice touched changes those. The sqlite ticket (reference-cache-sqlite)
  builds on `refreshReferenceKind`'s write-through semantics (see the
  empty-result note below).

### Abstraction usage

- Used/was specified: **yes**, with one carried-over omission.
- Dynamic-import seam for `@pi-aura/shared/aura-client`: used
  (`createDefaultClient`); the strip-types test entry point stays
  runnable.
- Provider overlay pattern (`addAutocompleteProvider((current) =>
  wrapper)` with deferral to `current`): used; deferral for non-reference
  tokens, zero-match partials, null cache, and the gated no-refresh state
  all preserved.
- `createDefaultAuraClient` behind the seam: used, now in two roles (the
  adapter's fetches and the factory's one-shot gate probe at
  `session_start`).
- `loadAuraClientSettings` from `@pi-aura/shared/settings`: **not used**.
  This is the continuation of the deviation slice 1 already recorded: the
  gate latches the no-credentials state (one probe, catch means stay off)
  instead of reading settings. Behaviorally equivalent for the criterion,
  and it keeps one credential-detection code path (the same throw the
  warmup relies on).
- pi-tui's debounce, request serialization, and late-result dropping:
  **not retested** (constraint respected; tests only cover the engine's own
  never-await and abort handling).
- Do-NOT-reimplement list respected: no escaping changes, no reachability
  probe changes, `aura-tasks.ts` and `engineering-rules.ts` untouched, no
  pi-session mocking.

### Out-of-scope changes

- None. Only the two engine files changed. The test file changes are pure
  additions (zero deletions; no slice 1 test was weakened). The three
  removed implementation lines are a stale comment pair and the widened
  provider-wiring call. No manifest change was needed (registration landed
  in slice 1).

### Divergence from the slice doc's acceptance criteria

None. All six criteria are implemented and unit-tested:

1. `getSuggestions` resolves from the cache without awaiting any Aura
   fetch: proven with an injected fetch that is left hanging forever while
   the query answers instantly (and the refresh is observably only
   started).
2. Every query fires a background refresh guarded by the request abort
   signal; aborted requests stop their work: pre-aborted signals fire no
   fetch at all; a hung fetch resolved after abort writes nothing (no
   items, no fresh `fetchedAt`); rapid successive queries let only the
   later (surviving) request's results land.
3. A completed refresh writes through to the cache; the next query sees
   fresh data: write-through test (stale title corrected in place, dedupe
   by id, fresh stamp) plus the end-to-end rename demo (stale row on query
   1, corrected title on query 2).
4. Server-side `listTasks` search results merge over local results:
   merge-over-local (upsert by id, cached order preserved), server-only
   match added, out-of-window task findable by title substring end to end.
5. Transient fetch failures are swallowed: rejected search keeps cached
   items and the old stamp; a throwing adapter still resolves the refresh
   (never-rejects contract); an empty server result keeps local items.
6. Without credentials no refresh is fired at all: the `canRefresh` gate
   (as the factory arms it from the no-credentials latch) keeps queries
   answering from the cache with zero server calls; non-reference tokens
   fire nothing regardless.

Test plan coverage: every listed failure mode, scenario, and edge case is
covered, with one subsumption: "a server error mid-page" is not separately
simulated because the refresh search is a single `listTasks` request (not
a paginated walk); any mid-flight failure surfaces as a rejected promise,
which is exactly the swallowed-rejection path that is tested.

Two implementation semantics worth pinning (both test-pinned, neither
contradicts the slice doc, both matter to the sqlite ticket):

- **An empty server result writes nothing and stamps nothing.** A refresh
  with zero results leaves items and `fetchedAt` untouched, so an empty
  search cannot refresh a TTL (stale-while-revalidate keeps re-triggering
  until real results arrive). This matches the slice doc's failure mode
  "the server returns an empty result (local items kept)" and the map's
  eventual-freshness constraint (an empty result carries no fresh data to
  write).
- **The gate latch is one-shot per session** (probe at `session_start`,
  re-armed only by `/reload`), matching the warmup's recorded one-shot
  semantics. A query that races the session-start probe may fire no
  refresh; the gate converges once the probe resolves, and the warmup is
  filling the cache in the same window anyway.

### Task doc update needed?

Yes. Append to `## Implementation notes`:

- The SWR seam as built: `refreshReferenceKind(cache, adapter, partial,
  { signal })`, with the adapter's `searchServer` (injectable
  `createClient`) as the controlled fetch; the provider fires it per
  reference query (including zero-match partials) behind the optional
  `canRefresh` gate, never awaited in `getSuggestions`.
- The no-refresh gate latches once per session from a
  `createDefaultClient()` probe at `session_start` (credentials appearing
  later do not re-arm until `/reload`); the default for the pure provider
  is refresh-allowed, so tests and dependents are unaffected.
- Empty server results write nothing and stamp nothing (a TTL cannot be
  refreshed by an empty search); the refresh search is a single
  `listTasks` call capped at `MAX_SUGGESTIONS` 20, `status: "ALL"`,
  `archived: "all"`, newest-first.

### User attention needed?

No. Scope is unchanged and the acceptance criteria are met without
divergence. The one API surface delta (the optional `canRefresh` parameter
on the provider factory) was pre-authorized by the slice 1 implementation
note this slice was dispatched against, and the `loadAuraClientSettings`
omission is the already-surfaced slice 1 deviation carried forward with
equivalent behavior. The only standing user-facing planning item remains
the one slice 1 raised: the sqlite ticket must plan against the actual
`read(kind)` / `write` / `fetchedAt` cache shape.
