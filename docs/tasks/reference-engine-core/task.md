---
kind: task
type: feature
slug: reference-engine-core
title: Reference engine core with #task: mentions end-to-end
map: unified-reference-mentions
status: ready
blocked_by: []
slices: []
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
