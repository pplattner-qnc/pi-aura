---
kind: task
type: feature
slug: cli-deletion-and-rewire
title: Delete the aura-digest CLI bundle + esbuild config; rewire skills/docs/tests off it
map: in-process-aura-digest
status: ready
blocked_by: [core-move, in-process-fetch, in-process-log-save]
slices: [1-delete-cli-shim-and-bundle, 2-drop-dead-shared-exports, 3-rewrite-skill-doc-and-tests]
---

## User-visible outcome

The `aura-digest` CLI is gone: `main()`, `process.argv`/`stdout`/`exit`, the
committed `dist/aura-digest.mjs` bundle, and the `scripts/esbuild.config.mjs`
that builds it are deleted. Anything that invoked the bundle — the
`aura-digest` skill doc, other docs, and tests — goes through the in-process
tools instead. The `scripts/` project shrinks to whatever non-CLI tooling
remains (or is itself removed if empty).

## Scope boundaries

- In: delete `main()` + the CLI dispatch (`fetch`/`render`/`save`/`diff`/
  `last`/`cleanup` actions), `process.argv`/`stdout`/`exit`, `fail()`'s
  `process.exit`, the `dist/aura-digest.mjs` bundle, `scripts/esbuild.config.mjs`
  (if it only built the bundle); rewire `skills/core/aura-digest/aura-digest.md`
  and any other doc/skill that invokes `aura-digest.mjs` to use the tools;
  update tests that spawn the bundle.
- Out: the in-process tools (tasks 2–4), the core logic (task 1 moves it;
  this task deletes the CLI shim that called it). Any wider skill
  choreography redesign (collect as friction).

## Acceptance criteria

- No `aura-digest.mjs` bundle exists or is built; no `esbuild.config.mjs`
  for it; `scripts/package.json` `build` script updated or removed.
- No code path uses `process.argv`/`process.stdout`/`process.exit` for the
  digest flow (the `fail()` helper becomes a throw or is deleted).
- The `aura-digest` skill doc references only the in-process tools (no
  `aura-digest.mjs` path); any other invoking doc/skill audited and rewired.
- A friction log records anything that wanted wider skill-choreography
  redesign (turned into a separate map/task if warranted, not absorbed).
- All tests pass; no test spawns `aura-digest.mjs`.

## Existing abstractions to use

- The in-process tools (tasks 2–4) — the skill doc points at them.
- `submit_feedback` to record friction points discovered during the rewire.

## Slice intent (planned in a later pass)

- Likely: (a) delete the CLI shim + bundle + esbuild config; (b) rewire
  the skill doc + audit other invokers; (c) update/rewrite tests; (d)
  friction log + dead-code sweep (incl. the `c80ef96d`/`e56e96ec` lifecycle
  fixes that are now dead code).

## Implementation notes

_The land-worker appends a per-slice note here as each slice lands._
