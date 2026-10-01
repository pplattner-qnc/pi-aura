---
type: arch spec
title: "Architecture spec: reference-engine-core"
status: stable
---
# Architecture spec: reference-engine-core

Status: approved. The user approved this spec's slice plan and seams; the
seams themselves were originally confirmed in the effort spec's Testing
Decisions and are restated here unchanged.

- Task doc: `docs/tasks/reference-engine-core/task.md`
- Effort spec: `docs/tasks/unified-reference-mentions/spec.md` (its
  Implementation Decisions and Testing Decisions are binding)
- Map: `docs/tasks/maps/unified-reference-mentions/map.md` (read its
  Constraints, especially the branching mandate)

## Shared architecture

### Shape

One new pi extension (working name `aura-references`) owns the shared
reference engine. Engine-level concerns: `#`-token extraction, the
autocomplete provider, inline expansion, the cache, the per-turn
system-prompt instruction, and the legacy-alias registry. Each kind is a
small adapter behind a common interface. The registry is data-driven: kind
prefixes, adapters, and aliases are registered entries that extraction,
filtering, and expansion dispatch through, so a later kind (rule,
artifact, wiki) is a new adapter plus a registration, never engine
surgery.

### Exports (public surface of the extension module)

- The default extension factory (registers `session_start` for the
  provider + warmup, `input` for expansion, `before_agent_start` for the
  instruction block).
- Pure functions for the test seams: token extraction + deferral,
  autocomplete filtering/ranking, expansion formatting, and the
  stale-while-revalidate provider orchestration (takes an injected fetch
  and cache).
- The cache interface type plus its in-memory implementation (the
  in-memory implementation doubles as the unit-test fake).
- The adapter interface type plus the task adapter.
- The alias registry: registration of a legacy token pattern to a kind
  adapter, plus the once-per-session deprecation-warning decision
  function. No alias is registered in production wiring in this ticket.

### Existing abstractions to use

- `AuraClient` via `createDefaultAuraClient` behind the dynamic-import
  seam (`import("@pi-aura/shared/aura-client")`), exactly as
  `aura-tasks.ts` does; this keeps the `node --experimental-strip-types`
  test entry point runnable.
- The minimal structural autocomplete types pattern
  (`AutocompleteItem` / `AutocompleteProvider` /
  `AutocompleteSuggestions`) duplicated at the top of `aura-tasks.ts` and
  `engineering-rules.ts`; this extension carries its own copy (the other
  two copies die in the alias tickets).
- The provider overlay pattern: `ctx.ui.addAutocompleteProvider((current)
  => wrapper)` with deferral to `current` for non-reference tokens.
- `ctx.ui.notify` for user-visible warnings (same channel the VPN
  warning uses).
- The `before_agent_start` system-prompt append pattern (re-applied each
  turn; see `aura-tasks.ts` and `aura-skill-instruction.ts`).
- `loadAuraClientSettings` from `@pi-aura/shared/settings` for the
  no-credential check.

### Do NOT reimplement

- Frontmatter parsing, rule loading, and `@rule:` resolution:
  `engineering-rules.ts` owns these until the rule ticket.
- The session-start reachability probe: `aura-tasks.ts` owns it; it is
  unrelated to references.
- XML/attribute escaping: implement once inside the engine.
  `aura-tasks.ts` keeps its own private copies until the task-alias
  ticket deletes that extension's expansion code; do not share or
  delete them in this ticket.
- pi-tui's debounce, request serialization, and late-result dropping:
  pi's own tested surface, not retested here (per the effort spec).

### Seams under test (user-approved)

1. Token extraction + deferral (pure): all `#kind:` prefixes, token
   boundaries, deferral to the built-in provider, legacy alias
   recognition hooks, wiki uuid-vs-path discrimination hooks (the wiki
   kind itself is a later ticket).
2. Expansion (pure): prompt + injected lookup to expanded text; tag
   shapes, escaping, unknown references untouched.
3. Autocomplete filtering (pure): items + partial to ranked
   suggestions; key-prefix and title-substring matching.
4. Cache seam: the engine depends on the small cache interface; the
   in-memory implementation is this ticket's production cache and the
   test fake (the sqlite store behind the same interface is a later
   ticket).
5. SWR orchestration (pure): injected controllable fetch; the provider
   returns cached items without awaiting the fetch, triggers the
   background refresh, and respects the abort signal.

Extension factories stay verified by the pi runtime (repo convention); no
pi-session mocking.

### Interface contract for dependent tickets

- Cache interface: read items by kind and query, write items, TTL
  awareness. The sqlite ticket implements it with `node:sqlite`; the
  in-memory implementation remains the test fake.
- Adapter interface: parse partial token, search local items, search
  server-side, format autocomplete row, format expansion, resolve a full
  token for expansion.
- Alias registration: register a legacy token pattern to a kind adapter
  and arm the once-per-session deprecation warning. The task-alias and
  rule tickets register `@AURA-` and `@rule:` through it.

## Per-slice notes

### Slice 1: task autocomplete from a warmed session cache

Exports: extraction + deferral functions, filtering/ranking, the
in-memory cache, the provider wiring, the task adapter's warmup and
local search. Interface contract: the adapter interface and cache
interface exist and the task adapter implements them; the provider
dispatches through the registry.

### Slice 2: stale-while-revalidate refresh and server-side task search

Exports: the SWR orchestration function (injected fetch + cache).
Contract: `getSuggestions` never awaits an Aura fetch; the background
refresh is abort-guarded and writes through to the cache; server-side
`listTasks` search results merge over local ones. Depends on slice 1's
cache interface and provider wiring.

### Slice 3: inline expansion, instruction, dormant aliases

Exports: expansion formatting + the prompt transform, the
instruction-block constant, the alias registry + warning decision
function. Contract: the input handler resolves cache-first with the
targeted `getTaskByHumanKey` fallback; the alias registry API is what
the task-alias and rule tickets will call. Depends on slice 1's cache
and adapter interfaces, not on slice 2.
