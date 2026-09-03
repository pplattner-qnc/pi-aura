---
kind: task
type: feature
slug: in-process-log-save
title: digest-log pushes events in-process; digest-save writes only last-digest.json
map: in-process-aura-digest
status: ready
blocked_by: [in-process-server, in-process-fetch]
slices: [1-digest-log-direct-push, 2-cleanup-and-final-polish]
---

## User-visible outcome

`digest-log` appends an `agent_log` event to the in-memory stream directly
(no HTTP self-POST) — the line appears in the dashboard log list. `digest-save`
writes `~/.pi/aura/last-digest.json` (the diff baseline) from the in-memory
current digest — the only disk write in the whole flow. No `digest.json`,
no temp dir, no `dir` param on `digest-save`.

## Scope boundaries

- In: `digest-log` → direct in-memory `appendEvent`-equivalent (no HTTP);
  `digest-save` → writes `last-digest.json` from in-memory current digest
  (no `dir` param, or `dir` dropped); drop the self-HTTP POST helper +
  `joinUrl` + the local `readDashboardUrl` in `index.ts` (already removed
  in task 1 once the core is shared).
- Out: the fetch (task 3), the server (task 2), CLI deletion (task 5), the
  digest data model, the action_click flow.

## Acceptance criteria

- `digest-log` never makes an HTTP call; pushes to the in-memory event
  stream; the line renders in the dashboard log list (verified with task
  2's server up); no-op-safe if the server isn't started (returns ok, no
  throw).
- `digest-save` writes only `~/.pi/aura/last-digest.json`; takes no `dir`
  (or `dir` is removed); the diff against the previous last-digest works
  on the next run.
- No `digest.json`, no temp dir, no `raw.json` referenced by these tools.
- All tests pass; `log-tool.test.ts` + `fetch-save-tools.test.ts` rewritten
  to the in-process shape.

## Existing abstractions to use

- The in-memory event stream + `appendEvent` serialization (task 2).
- The in-memory current digest (task 3 populates it).
- `last-digest.json` write path (today's `digest-save` logic, minus the
  temp-dir read).

## Slice intent (planned in a later pass)

- Likely: (a) `digest-log` → direct in-memory push; (b) `digest-save` →
  `last-digest.json`-only from memory, drop `dir`; (c) drop self-HTTP
  helpers + the local `readDashboardUrl` duplicate.

## Implementation notes

_The land-worker appends a per-slice note here as each slice lands._
