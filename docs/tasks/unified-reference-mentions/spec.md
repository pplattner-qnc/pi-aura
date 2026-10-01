---
type: spec
title: "Spec: Unified in-chat resource references"
status: stable
---
# Spec: Unified in-chat resource references

Map: `docs/tasks/unified-reference-mentions/map.md` (this effort's root)

## Problem Statement

Referencing resources in a pi chat prompt is inconsistent and incomplete.
Aura tasks use `@AURA-42`, cursor-style rules use `@rule:name`, and other
Aura resources (artifacts, wiki pages) cannot be referenced at all. The two
existing syntaxes expand through different mechanisms: tasks become inline
XML in the prompt, rules inject into the system prompt, with no shared
shape. Autocomplete for tasks is slow on first use (the fetch starts on the
first keystroke instead of at session start), only matches number prefixes
(no title search), and is bounded by a 500-task in-memory cache, so tasks
the user can see sometimes never appear.

## Solution

One syntax family for all referenceable resources: `#task:AURA-42`,
`#rule:tracker-aura`, `#artifact:<uuid>`, `#wiki:<space>/<path>` (a wiki
page can also be referenced hand-typed as `#wiki:<uuid>`). Typing a prefix
opens autocomplete with instant results from a persistent cross-session
sqlite cache, refined one keystroke later by fresh Aura results; search
matches key/id prefixes and title substrings, locally and server-side. On
submit, every reference expands inline in the prompt to a uniform XML
element (`<task-ref>`, `<rule-ref>`, `<artifact-ref>`, `<wiki-ref>`)
carrying metadata as attributes and the resource title as element text;
bodies are never inlined, the agent fetches on demand via the `aura` skill.
Rule mentions additionally trigger the existing rule-body injection into
the system prompt. The legacy `@AURA-42` and `@rule:name` syntaxes keep
working as aliases but show a user-visible deprecation warning once per
session.

## User Stories

1. As a pi user, I want to reference an Aura task with `#task:AURA-42`, so
   that all my references use one predictable syntax.
2. As a pi user, I want to reference a cursor rule with `#rule:name`, so
   that rules live in the same syntax family as Aura resources.
3. As a pi user, I want to reference an Aura artifact with
   `#artifact:<uuid>`, so that the agent knows which artifact I mean
   without me pasting its content.
4. As a pi user, I want to reference a wiki page with
   `#wiki:<space>/<path>`, so that the reference stays readable in my
   prompt.
5. As a pi user, I want to also reference a wiki page by its uuid when I
   have one, so that programmatic or copied references resolve.
6. As a pi user, I want autocomplete to offer wiki pages by their
   space/path form, so that inserted references are human-readable.
7. As a pi user, I want autocomplete suggestions to appear instantly, so
   that referencing never interrupts my typing flow.
8. As a pi user, I want autocomplete to find tasks by typing part of their
   title, so that I can reference a task whose number I do not remember.
9. As a pi user, I want autocomplete to find tasks by their key prefix
   (e.g. `123` finds `AURA-1234`), so that partial numbers work.
10. As a pi user, I want autocomplete results refreshed from Aura as they
    arrive, so that a recently renamed title corrects itself within a
    keystroke.
11. As a pi user, I want autocomplete to find tasks outside any local
    cache window via server-side search, so that every task I can access is
    referenceable.
12. As a pi user, I want the autocomplete cache shared across all my pi
    sessions, so that a fresh session is as fast as a warm one.
13. As a pi user, I want the cache TTL configurable in my pi settings, so
    that I control the freshness/speed trade-off.
14. As a pi user, I want artifact autocomplete rows to show the artifact
    title, so that I can pick the right artifact despite uuids being
    unreadable.
15. As a pi user, I want the selected artifact reference inserted as its
    full uuid, so that the reference is unambiguous.
16. As an agent, I want every reference expanded to a uniform XML tag with
    metadata attributes and a title, so that I can unambiguously identify
    the referenced resource.
17. As an agent, I want expansions to never contain resource bodies, so
    that the user's context budget is preserved and I fetch content only
    when needed.
18. As a pi user, I want a mentioned rule's body injected into the system
    prompt as today, so that `#rule:` keeps its established behavior in
    addition to the inline XML reference.
19. As a pi user, I want my old `@AURA-42` and `@rule:name` habit to keep
    working, so that nothing breaks while I migrate.
20. As a pi user, I want a once-per-session warning when I use the old
    syntax, so that I learn the new syntax without being nagged every
    prompt.
21. As a pi user, I want old-syntax mentions to expand to the same new XML
    tags, so that there is exactly one expansion format regardless of how I
    typed the reference.
22. As a pi user without Aura credentials, I want rule references and file
    completion to keep working and Aura kinds to no-op silently, so that
    the extension never blocks my prompt.
23. As a pi user, I want unknown or unresolvable references left as typed,
    so that the agent can still resolve them via the `aura` skill.
24. As a maintainer, I want one shared engine powering all kinds via small
    per-kind adapters, so that a fifth kind is an adapter, not a new
    extension.
25. As an agent reading the system prompt, I want one instruction block
    documenting all four tag shapes, so that I know how to interpret any
    reference and where to go (the `aura` skill) to act on it.

## Implementation Decisions

- **One new extension** (working name `aura-references`) owns the shared
  reference engine: token extraction, autocomplete provider, inline
  expansion, cache, and the per-turn system-prompt instruction documenting
  all four tag shapes. Kinds are small adapters behind a common interface
  (parse partial token, search local items, search server-side, format
  autocomplete row, format expansion, resolve a full token for expansion).
- **Existing extensions shrink.** `aura-tasks.ts` loses its autocomplete
  and expansion logic, keeping only the reachability probe; its legacy
  `@AURA-` handling becomes an alias registration in the shared engine.
  `engineering-rules.ts` keeps rule loading, frontmatter dispatch, and the
  system-prompt body injection; its `@rule:` autocomplete moves to the
  engine and its mention resolver additionally fires on `#rule:` tokens.
  The exact file split is left to implementation.
- **Expansion format** (from the prototype decision): uniform tags
  `<task-ref>`, `<rule-ref>`, `<artifact-ref>`, `<wiki-ref>`. Rich
  attributes: task `key,status`; artifact `id,kind,version`; wiki
  `space,path,version`; rule `name,attach`. Element text is the title,
  XML-escaped; attribute values escaped for `"`, `&`, `<`. `<aura-task>` is
  no longer emitted; the system-prompt instruction documents the four new
  tags and points to the `aura` skill for acting on references.
- **Token grammar.** `#` at a token boundary (start of line or after
  whitespace), then `task:`/`rule:`/`artifact:`/`wiki:`, then the partial.
  Wiki tokens accept both `<space>/<path>` and uuid shapes; the adapter
  distinguishes by form (uuid pattern vs path). Legacy aliases: `@AURA-<n>`
  maps to the task adapter, `@rule:<name>` to the rule adapter; both expand
  to the new tags and set the deprecation-warning flag.
- **Deprecation warning.** First legacy-syntax token per session triggers a
  user-visible warning (user-only, not in the prompt sent to the model)
  stating the syntax is deprecated and will be removed in a future version.
  Tracked as an in-memory per-session flag.
- **Autocomplete: cache-first SWR** (from the research decision).
  `getSuggestions` reads the sqlite cache synchronously-ish and returns
  immediately; it never awaits an Aura fetch. The same call fires a
  background fetch (guarded by the request's abort signal) that
  write-through updates the cache; fresh results surface on the next
  keystroke (pi-tui re-queries per keystroke with a 20 ms debounce and
  drops late resolutions itself).
- **Persistent cache.** `node:sqlite` (`DatabaseSync`), database file at
  `~/.pi/agent/aura-reference-cache.db`, WAL journal mode, plain file
  shared by all pi sessions (no extra process). One table of cached
  referenceable items keyed by `(kind, id)` with a `fetched_at` timestamp;
  TTL from `aura.references.cacheTtlMs` in `~/.pi/agent/settings.json`
  (project `.pi/settings.json` may override), default decided in
  implementation (order of hours). Expired entries are still served
  instantly (stale-while-revalidate) but always trigger a background
  refresh. Cache keying includes the Aura base URL so multi-instance setups
  do not cross-contaminate.
- **Search semantics.** Local filter: case-insensitive key/id prefix match
  OR title substring match. Server-side per kind: tasks `listTasks` with
  `search`, artifacts `listArtifacts` with `q`, wiki `mcpWikiSearch`, rules
  local-only (filesystem). Server results are merged over local ones and
  written to the cache. The old 500-task in-memory cap is replaced by the
  persistent cache plus server-side search; no fixed cap on cached items.
- **Warmup.** The initial cache population/refresh for tasks, artifacts,
  and wiki starts at `session_start` (fire-and-forget), not on first
  keystroke.
- **No-credential and failure behavior unchanged:** missing AuraClient
  credentials or transient fetch failures leave Aura kinds silent
  (autocomplete defers, mentions pass through unexpanded); rules keep
  working offline.
- **Artifact token UX** (from the prototype decision): autocomplete inserts
  the full uuid; the suggestion row label shows the title (uuid only in the
  description), so the uuid appears in the text box only after selection.
- **Expansion resolution.** On submit, the engine resolves each typed
  reference against the cache first, then (cache miss) a targeted
  server-side lookup (`getTaskByHumanKey`, `getArtifact`,
  `getKnowledgeNodeByPath` or `getKnowledgeNode` for uuid-form wiki
  tokens). Unresolvable references stay as typed.

## Testing Decisions

Good tests here test external behavior of pure units (token in → decisions
out, prompt in → expanded prompt out), never implementation details like
regex internals or sqlite SQL. Prior art: `extensions/aura-tasks.test.ts`
and `extensions/engineering-rules.test.ts` (pure exported functions,
`node --experimental-strip-types` + `node:assert`, the pi-runtime factory
untested).

Seams (confirmed with the user):

1. **Token extraction + deferral** (pure): all four `#kind:` prefixes,
   cursor-boundary rules, deferral to the built-in path provider, legacy
   `@AURA-`/`@rule:` alias recognition, wiki uuid-vs-path discrimination.
2. **Expansion** (pure): prompt + injected lookup → expanded text. Per-kind
   tag shapes and attribute sets, XML escaping, unknown references left
   untouched, legacy syntax expanding to new tags, wiki dual identity
   resolving to the same canonical expansion.
3. **Autocomplete filtering** (pure): items + partial → ranked suggestions;
   key-prefix and title-substring matching per kind; artifact rows showing
   title as label with uuid value.
4. **Cache seam** (the one new seam): the engine depends on a small cache
   interface (read by kind+query, write items, TTL awareness). Unit tests
   inject an in-memory fake; a separate focused test exercises the real
   `node:sqlite` store against a temp file (WAL mode, TTL expiry,
   stale-while-revalidate read behavior, base-URL keying).
5. **SWR orchestration** (pure): with an injected controllable fetch, the
   provider returns cached items without awaiting the fetch, triggers the
   background refresh, and respects the abort signal.

The pi-tui editor behavior (debounce, request serialisation, late-result
dropping) is pi's own tested surface and is not re-tested. The extension
factories remain verified by the pi runtime, mirroring current practice.

## Out of Scope

- Feedback-entry references (`#feedback:`).
- Changes to the `aura` skill, the aura-mcp-dev MCP tools, or the Aura
  server.
- Migrating old prompts, docs, or session history containing `@AURA-`
  mentions.
- A removal timeline for the legacy syntax (the warning says "will be
  removed in a future version"; scheduling that removal is a later
  decision).
- Re-testing pi-tui's autocomplete pane behavior.

## Further Notes

- Repo convention: no em-dashes in prose.
- The dynamic-import seam for `@pi-aura/shared/aura-client` (Node
  strip-types test entry point) must be preserved in the new extension.
- The reachability probe in `aura-tasks.ts` is unrelated to references and
  stays put.
- Remaining map Fog folded into implementation: cache write coalescing
  under per-keystroke refreshes (WAL handles cross-session concurrency).
