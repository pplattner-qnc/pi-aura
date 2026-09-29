---
kind: task
type: feature
slug: reference-engine-core
title: Reference engine core with #task: mentions end-to-end
map: unified-reference-mentions
status: done
blocked_by: []
slices: [1-task-autocomplete-warm-cache, 2-swr-refresh-server-search, 3-inline-expansion-instruction-aliases]
---

## What to build

The shared reference engine lands as a new pi extension (working name
`aura-references`) and takes its first kind, Aura tasks, all the way
through. Typing `#task:` in the chat input opens autocomplete instantly
with suggestions from the reference cache, finds tasks by key prefix and by
title substring, and refreshes the suggestions from Aura one keystroke
later via a background fetch (stale-while-revalidate; the provider never
awaits the Aura fetch in `getSuggestions`). Selecting a task inserts
`#task:AURA-42`. On submit, the mention expands inline to the new uniform
tag `<task-ref key="AURA-42" status="OPEN">title</task-ref>`; unknown keys
are left as typed so the agent can resolve them via the `aura` skill. The
system prompt gains the per-turn instruction block documenting the tag
shape and pointing to the `aura` skill. The initial task cache population
starts at `session_start` (fire-and-forget), not on first keystroke.

The engine is shaped as an adapter registry: token extraction,
autocomplete, expansion, and the cache are engine-level, and each kind is
a small adapter behind the common interface (parse partial token, search
local items, search server-side, format autocomplete row, format
expansion, resolve a full token for expansion). The legacy-alias machinery
(alias registration plus the once-per-session deprecation-warning flag)
is in place but no alias is registered yet.

This ticket ships a session-scoped in-memory cache behind the small cache
interface (which doubles as the unit-test fake); the persistent sqlite
store is the next ticket. The old `@AURA-` behavior is untouched:
`aura-tasks.ts` still owns it on its own trigger character, and the two
coexist (`#` for the new syntax, `@` for the old).

## Acceptance criteria

- [ ] Typing `#task:` at a token boundary opens autocomplete; tokens that are not reference tokens defer to the built-in provider (a `#` used as a heading, in code, or mid-word never hijacks completion).
- [ ] Suggestions appear instantly from the cache without awaiting any Aura fetch; the same call fires a background fetch guarded by the request's abort signal that writes through to the cache, so fresh results land on the next keystroke.
- [ ] Local filtering matches key prefix and title substring, case-insensitively; server-side search via `listTasks` with `search` is merged over local results.
- [ ] Selecting a task inserts `#task:AURA-42`.
- [ ] On submit, `#task:AURA-42` expands to `<task-ref key="..." status="...">title</task-ref>` with the title XML-escaped and attribute values escaped for `"`, `&`, `<`.
- [ ] Expansion resolves cache-first, then via a targeted `getTaskByHumanKey` lookup; unresolvable references are left exactly as typed.
- [ ] The per-turn system-prompt instruction block documents the task-ref tag shape and directs the agent to the `aura` skill for anything beyond reading the reference.
- [ ] Task cache warmup starts at `session_start`, not on first keystroke.
- [ ] Without Aura credentials the task kind no-ops silently: autocomplete defers and the prompt passes through unchanged.
- [ ] Legacy `@AURA-` behavior is unchanged: same autocomplete, same `<aura-task>` expansion via `aura-tasks.ts`.
- [ ] Adding a second kind requires only a new adapter; extraction, filtering, expansion, and the provider need no engine surgery.
- [ ] Unit tests cover the pure seams: token extraction and deferral, expansion and escaping, autocomplete filtering, and SWR orchestration with an injected controllable fetch and in-memory fake cache (pure exported functions, `node --experimental-strip-types` + `node:assert`, dynamic-import seam preserved).
- [ ] The new extension is registered in the package manifest.

## Blocked by

None (can start immediately).

## Implementation notes

### Slice 1: 1-task-autocomplete-warm-cache (landed)

- Cache contract as built: `read(kind)` returns every cached item for
  a kind (no query parameter); `write(kind, items)` upserts by id;
  `fetchedAt(kind)` plus per-entry stamps provide TTL awareness.
  Query filtering lives entirely in the engine's
  `filterReferenceItems(items, partial, max, keyMatch?)` with a
  per-kind `keyMatch` hook. The sqlite ticket (reference-cache-sqlite)
  must implement this `read(kind)` / `write` / `fetchedAt` shape, not a
  query-pushdown read (rationale: one unicode-safe matching
  implementation across cache backends).
- The task adapter already implements the full `KindAdapter` interface
  (parsePartial, searchLocal, searchServer, formatRow,
  formatExpansion, resolveFullToken, warmup). The slice 2/3 methods
  (`searchServer`, `formatExpansion`, `resolveFullToken`) are present
  but wired into no code path yet; they get wired and behavior-tested in
  their own slices.
- No-credential detection is via `createDefaultAuraClient()` throwing
  (the `aura-tasks.ts` pattern), not `loadAuraClientSettings`. Slice 2
  needs an explicit no-refresh gate for the no-credentials state (pick
  up `loadAuraClientSettings` or latch the no-creds state once
  detected).
- Warmup is one-shot at `session_start`; credentials appearing later in
  the session do not retry (until a `/reload` re-emits session_start).
- `MAX_TASKS` 500 is the interim warmup pagination bound, replaced by
  the persistent cache plus server-side search in the sqlite ticket.

### Slice 2: 2-swr-refresh-server-search (landed)

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

### Slice 3: 3-inline-expansion-instruction-aliases (landed)

- The alias registry API as built: `registerAlias(alias)` is an additive
  method on the slice 1 `ReferenceRegistry` interface (the alias table
  stays mutable after construction), plus the exported
  `createDeprecationWarningDecision()` latched once-per-session decision.
  The warning is armed by the factory wiring rather than by
  `registerAlias` itself: `session_start` builds a fresh decision (so a
  `/reload` re-emits `session_start` and re-arms it), and the input
  handler consults `registry.aliases` and notifies through
  `ctx.ui.notify` (user-only; deprecation text never lands in the
  prompt). Registering through the API therefore arms the warning
  without an extra call. No alias is registered in the production
  wiring, so the generic message text stays dormant until the task-alias
  ticket registers one.
- The `LegacyAlias` capture-group contract: group 1 is the token text
  handed to the kind adapter, the full key minus the trigger char (e.g.
  pattern `@(AURA-\S*)` capturing `AURA-42`), one group serving both
  autocomplete (the partial while typing) and submit (the full key to
  resolve). This resolves a latent disagreement between slice 1's doc
  comment and the expansion path; the task-alias and rule tickets must
  write patterns to this shape. Downstream implication for the
  task-alias ticket: with this contract the autocomplete partial for an
  alias is the full key shape (e.g. `AURA-4` while typing `@AURA-4`),
  which the task adapter's `searchLocal` keyMatch (key-number prefix)
  does not match, so that ticket must adapt the partial (or extend
  keyMatch) when it wires alias autocomplete.
- The expansion flow: `expandReferenceMentions(prompt, registry, lookup)`
  is the prompt transform, async (returns `Promise<string>`) because
  the targeted fallback inside the injected lookup is a server call;
  purity in substance is preserved: prompt, registry, and the injected
  `ReferenceResolver` (a new exported type) are the only inputs, and
  tests inject fakes. A null lookup means no targeted fetch at all.
  Resolution is `resolveFullToken`: cache-first, then the targeted
  `getTaskByHumanKey` fallback (404 and throw both mean leave as
  typed); unresolvable references stay exactly as typed so the agent
  can resolve them via the `aura` skill. The expansion gate latches
  `clientAvailable` from the same one-shot `session_start` client probe
  slice 2 added, and the targeted fallback goes through the adapter's
  injectable `createClient`.
- `TASK_REF_INSTRUCTION` is appended per turn via `before_agent_start`,
  documenting the `<task-ref key status>title</task-ref>` shape and
  pointing to the `aura` skill (including the SKILL.md load
  instruction). XML/attribute escaping is implemented once inside the
  engine (module-private `escapeAttr`/`escapeText`); `aura-tasks.ts`
  keeps its own private copies. The interim double instruction block
  is accepted: `aura-tasks.ts`'s `AURA_TASK_INSTRUCTION` stays in place
  (both blocks use the `## Aura task references` heading) until the
  task-alias ticket removes it.
- Pinned token grammar semantic: a mention with glued trailing
  punctuation (`#task:AURA-42,`) does not expand; the token is the
  non-whitespace run after `#kind:`, kept kind-agnostic so future
  kinds' tokens (wiki paths) are never mangled.
- `loadAuraClientSettings` remains unused (the carried-forward slice
  1/2 deviation): the client probe throwing covers both missing
  baseUrl and missing PAT, and for expansion it manifests as the
  `clientAvailable` latch.
- This is the final slice of the task: all three slices have landed
  and every task acceptance criterion is covered by the slice seams
  (the extension registration landed in slice 1).
