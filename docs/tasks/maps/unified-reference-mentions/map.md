---
kind: map
slug: unified-reference-mentions
title: "Unified in-chat resource references (#task:, #rule:, #artifact:, #wiki:)"
status: active
tasks:
  - slug: pi-autocomplete-async-constraints
    blocked_by: []
    done: true
  - slug: reference-expansion-ux-prototype
    blocked_by: []
    done: true
  - slug: reference-engine-core
    blocked_by: []
    done: true
  - slug: reference-cache-sqlite
    blocked_by:
      - reference-engine-core
    done: true
  - slug: reference-task-alias
    blocked_by:
      - reference-engine-core
    done: false
  - slug: reference-rule-kind
    blocked_by:
      - reference-engine-core
    done: false
  - slug: reference-artifact-kind
    blocked_by:
      - reference-engine-core
      - reference-cache-sqlite
    done: false
  - slug: reference-wiki-kind
    blocked_by:
      - reference-engine-core
      - reference-cache-sqlite
    done: false
---

## Destination

In-chat resource references are unified and kind-agnostic:

- The user can reference Aura tasks, cursor-style rules, Aura artifacts, and
  Aura wiki/knowledge pages with one syntax family: `#task:AURA-42`,
  `#rule:my-rule`, `#artifact:<uuid>`, `#wiki:<space>/<path>`.
- Every typed reference expands inline in the submitted prompt to an
  XML-style tagged element carrying metadata as attributes and the
  human-readable title as element text (bodies are never inlined; the agent
  fetches on demand). Rules are the sole exception: the `#rule:` mention
  additionally triggers the existing rule-body injection into the system
  prompt, alongside its inline XML reference.
- One shared reference engine (token extraction, autocomplete, expansion,
  cache) powers all kinds via small per-kind adapters; `aura-tasks.ts` and
  `engineering-rules.ts` shrink to legacy-syntax shims plus rule dispatch.
- Autocomplete is fast and complete: results render instantly from a
  persistent cross-session sqlite cache (node:sqlite, WAL,
  `~/.pi/agent/aura-reference-cache.db`, TTL configurable in
  `~/.pi/agent/settings.json`), then are overridden by fresh Aura results
  when the background fetch lands (stale-while-revalidate). Search matches
  by key/id prefix AND title substring, locally and server-side
  (`listTasks.search`, `listArtifacts.q`, `mcpWikiSearch`).
- The legacy `@AURA-42` and `@rule:name` syntaxes still work as aliases but
  emit a user-visible deprecation warning once per session; expansions
  always use the new unified tags.

## Constraints

- Extensions stay dependency-free beyond the pi peer dep: use `node:sqlite`
  (verified present, Node v24), no better-sqlite3.
- The cache exists only to speed up autocomplete; every autocomplete query
  also fetches from Aura and overrides stale entries (eventual freshness).
- No em-dashes in prose (repo convention).
- The shared AuraClient is the only path to Aura; dynamic-import seam kept
  for unit-testability (node --experimental-strip-types).
- Expansion never inlines resource bodies into the prompt (context budget);
  rules keep their existing system-prompt body injection as the one
  exception.
- Branching (user mandate): this checkout on `develop` is the live
  package other pi agents consume, so no half-finished implementation may
  land on `develop` (or `main`). All ticket work happens in git worktrees:
  each ticket is implemented on its own branch (`task/<ticket-slug>`)
  cut from the integration branch `task/unified-reference-mentions`, which
  is itself cut from `develop`. Within a ticket, the workflow package's
  convention applies: per-slice branches (`slice/<slice-slug>`) are cut
  from the ticket branch and merged back into it by the land worker. A
  finished ticket merges only into the
  integration branch (never into `develop`/`main`); `develop` receives a
  single merge of the integration branch once the whole map is
  finalizable. finalize-task's merge-to-main step is overridden
  accordingly for every ticket of this map.

## Decisions so far

- Kinds in scope: task, rule, artifact, wiki (feedback entries excluded).
- Syntax: `#task:`, `#rule:`, `#artifact:`, `#wiki:`; artifacts use
  `#artifact:<uuid>`, tasks keep the human key `#task:AURA-42`.
- Wiki pages have dual identity: both `#wiki:<space>/<path>` and
  `#wiki:<uuid>` are accepted and resolve to the same node. Autocomplete
  always inserts the `<space>/<path>` form (readable); the uuid form is for
  hand-typed or programmatic references. Expansion resolves either form.
- Legacy `@AURA-` / `@rule:` accepted as aliases, deprecation warning once
  per session, expansions always emit the new unified XML tags.
- Expansion shape: XML element, metadata as attributes, title as text, no
  bodies; rules additionally auto-load body into the system prompt.
- Autocomplete: persistent sqlite cache (WAL, shared across sessions,
  configurable TTL) + stale-while-revalidate against live Aura fetches;
  search by key prefix and title substring, local and server-side.
- Architecture: shared reference engine + per-kind adapters in one new
  extension; aura-tasks.ts and engineering-rules.ts become shims.
- Facts verified: node:sqlite available (Node v24); listTasks supports
  `search`, listArtifacts supports `q`, mcpWikiSearch exists; pi
  autocomplete provider API is async.
- Expansion format (prototype: reference-expansion-ux-prototype): uniform
  `<task-ref>` / `<rule-ref>` / `<artifact-ref>` / `<wiki-ref>` tags
  (Variant B); `<aura-task>` is no longer emitted but stays self-describing
  in old history. Rich attribute sets: task `key,status`; artifact
  `id,kind,version`; wiki `space,path,version`; rule `name,attach`. Title
  as element text, never bodies.
- Artifact token UX: autocomplete inserts the full uuid; the suggestion row
  label shows the title so the uuid only appears in the text box after
  selection.
- Autocomplete SWR shape (research: pi-autocomplete-async-constraints):
  pi-tui cannot re-render an open pane, so the design is cache-first
  render + background fetch that writes through to the cache; fresh
  results land on the next keystroke (20 ms debounce, one serialised
  request per keystroke, late resolutions dropped by the editor). The
  provider must never await the Aura fetch in `getSuggestions`.

## Fog

- Cache schema and keying (per baseUrl? per user PAT?) for multi-instance
  setups.
- Cache write-through batching (per-keystroke Aura responses racing into
  sqlite; WAL handles concurrency, but write coalescing is undecided).

## Out of scope

- Feedback-entry references (#feedback:).
- Changing the aura skill or MCP tools.
- Migrating prompt history or docs that contain old `@AURA-` mentions.
- Server-side changes to Aura itself.
