## Deviation report — 1-task-autocomplete-warm-cache

Scope reviewed: `git diff 6082e897..HEAD` (7 commits, 3 files:
`extensions/aura-references.ts`, `extensions/aura-references.test.ts`,
`package.json`). Tests run:
`node --experimental-strip-types extensions/aura-references.test.ts` passes.

### API surface changes

- **Planned (arch spec, per-slice notes):** extraction + deferral functions,
  filtering/ranking, the in-memory cache, the provider wiring, the task
  adapter's warmup and local search; the adapter interface and cache
  interface exist, the task adapter implements them, the provider dispatches
  through the registry.
- **Actual:** all planned exports landed as specified
  (`extractReferenceToken`, `filterReferenceItems`,
  `createInMemoryReferenceCache`, `createReferenceAutocompleteProvider`,
  `createTaskAdapter` with warmup + `searchLocal`, `createReferenceRegistry`
  with the dormant alias table). Three refinements:

  1. **Cache read drops the query parameter.** The arch spec's
     dependent-ticket contract (and the effort spec's seam 4) say "read items
     by kind and query"; the shipped interface is
     `read(kind): CacheEntry[]` plus `write(kind, items)` (upsert by id) and
     `fetchedAt(kind)` for TTL awareness. Query filtering lives entirely in
     the engine's `filterReferenceItems` with a per-kind `keyMatch` hook.
     Impact: the sqlite ticket (reference-cache-sqlite) implements
     `read(kind)` / `write` / `fetchedAt`, not a query-pushdown read.
     Rationale is sound: one matching implementation across cache backends
     (SQLite `LIKE` case-insensitivity is ASCII-only, which would break the
     tested unicode title matching), and at the interim cache scale (warmup
     bounded by `MAX_TASKS` 500) a full-kind read per keystroke is trivial.
  2. **The full adapter interface ships now.** The task adapter implements
     the complete `KindAdapter` contract (parsePartial, searchLocal,
     searchServer, formatRow, formatExpansion, resolveFullToken, warmup)
     instead of only slice 1's warmup + local search. `searchServer`,
     `formatExpansion`, and `resolveFullToken` are wired into no code path in
     this slice and are untested here; slices 2 and 3 wire and test them.
     The interface itself matches the arch spec's contract for dependent
     tickets exactly.
  3. **No-credential gate is implicit, not settings-based.** The spec lists
     `loadAuraClientSettings` from `@pi-aura/shared/settings` for the
     no-credential check; the implementation instead relies on
     `createDefaultAuraClient()` throwing (the exact pattern `aura-tasks.ts`
     uses) so warmup no-ops and the provider defers on the empty cache.
     Behaviorally identical for this slice (tested via both a null cache and
     an empty cache deferring). Impact: slice 2's "without credentials no
     refresh is fired at all" needs an explicit gate; the slice 2 worker
     should either pick up `loadAuraClientSettings` or latch the no-creds
     state once detected.

- **Impact on dependent slices:** none blocking. Slice 2 consumes
  `searchServer` and the cache write path; slice 3 consumes
  `formatExpansion`, `resolveFullToken`, and the alias table. Both find the
  surface already in place. The cache signature change is the one item the
  sqlite ticket must plan against.

### Abstraction usage

- Used/was specified: **yes**, with one omission.
- Dynamic-import seam for `@pi-aura/shared/aura-client`: used
  (`createDefaultClient` mirrors `aura-tasks.ts` `loadTasks`; the
  strip-types test entry point stays runnable).
- Minimal structural autocomplete types copy: used (own copy at the top of
  the file, as specified; no pi-tui import).
- Provider overlay pattern (`addAutocompleteProvider((current) => wrapper)`
  with deferral to `current`): used, including `shouldTriggerFileCompletion`
  and `applyCompletion` deferral.
- `ctx.ui.notify` and the `before_agent_start` append: not applicable to
  this slice (no user-visible warning or instruction block yet; both arrive
  with slice 3).
- `loadAuraClientSettings`: **not used** (see API surface change 3).
- Do-NOT-reimplement list respected: no frontmatter/rule code, no
  reachability probe changes (`aura-tasks.ts` untouched), escaping
  implemented once inside the engine without touching `aura-tasks.ts`'s
  private copies, no pi-tui behavior retested.

### Out-of-scope changes

- Early implementations of slice 2/3 adapter methods (`searchServer`,
  `formatExpansion`, `resolveFullToken`) plus private `escapeAttr` /
  `escapeText` helpers. Unwired and untested in this slice; harmless.
- `MAX_TASKS` 500 warmup pagination cap carried over from `aura-tasks.ts`.
  The effort spec's end state ("the old 500-task in-memory cap is replaced
  by the persistent cache plus server-side search; no fixed cap on cached
  items") lands with the sqlite ticket plus slice 2's server-side search;
  the in-memory cache itself already has no cap, the bound is only on warmup
  volume. In scope for this interim slice, but the sqlite ticket should
  revisit it.
- Nothing else: no files touched beyond the three planned ones; legacy
  `@AURA-` behavior in `aura-tasks.ts` is unchanged and its tests stay
  green; `engineering-rules.ts` untouched.

### Divergence from the slice doc's acceptance criteria

None. All eight criteria are implemented and unit-tested at the pure seams:
token-boundary extraction and deferral (including `# task`, `foo#task:`,
`#heading`, unregistered `#rule:`, ended tokens, zero-match deferral),
session_start fire-and-forget warmup with page-by-page `listTasks`
pagination (multi-page, cap, abort mid-flight, page failure, no
credentials), case-insensitive key/number-prefix and title-substring
filtering capped at `MAX_SUGGESTIONS` 20, canonical-key insertion, silent
no-op without credentials, registry-driven dispatch proven with a synthetic
second kind and a synthetic alias, manifest registration, and the pure seams
under test. Test plan extras beyond the spec: the legacy alias recognition
hook, the `parsePartial` decline deferral hook (the wiki uuid-vs-path
discrimination hook from the effort spec's seam 1), cache upsert and kind
isolation, empty-write `fetchedAt` stamping, and unicode/empty-title/odd-
casing edges. Constraints hold: no em-dashes, dependency-free beyond the pi
peer dep, no sqlite, `node:assert/strict` house test style.

### Task doc update needed?

Yes. Append to `## Implementation notes` (the section does not exist yet;
the land worker should create it):

- Cache contract as built: `read(kind)` returns all cached items for a
  kind; `write(kind, items)` upserts by id; `fetchedAt(kind)` plus per-entry
  stamps provide TTL awareness. Query filtering lives in
  `filterReferenceItems(items, partial, max, keyMatch?)` in the engine. The
  sqlite ticket implements this shape, not a query-param read.
- The task adapter implements the full `KindAdapter` interface already;
  slices 2 and 3 wire and test `searchServer`, `formatExpansion`, and
  `resolveFullToken`.
- Slice 1 detects missing credentials via `createDefaultAuraClient()`
  throwing (no `loadAuraClientSettings` use); warmup is one-shot at
  session_start, so credentials appearing later mid-session do not retry
  until a `/reload` re-emits session_start. Slice 2 needs an explicit
  no-refresh gate for the no-credentials state.
- `MAX_TASKS` 500 is the interim warmup bound pending the sqlite ticket.

### User attention needed?

Yes, one item (an interface-contract refinement, not a scope change): the
cache seam reads by kind only, dropping the query parameter the effort spec
and arch spec both promised dependent tickets ("read by kind+query"). The
split is defensible (single, unicode-safe matching implementation in the
engine; the fake and the future sqlite store stay dumb), but the
reference-cache-sqlite ticket's slice docs must be written against the
actual `read(kind)` / `write` / `fetchedAt` shape, or the interface should
be re-widened before that ticket is planned. No other user decisions
required.
