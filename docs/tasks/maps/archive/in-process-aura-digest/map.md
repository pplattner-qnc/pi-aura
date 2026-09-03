---
kind: map
slug: in-process-aura-digest
title: Dissolve the aura-digest CLI bundle into in-process runtime-injected tools
status: active
tasks: [core-move, in-process-server, in-process-fetch, in-process-log-save, cli-deletion-and-rewire]
---

## Destination

The `aura-digest` fetch, log, save, and dashboard server all run **in-process**
as runtime-injected tools in the pi extension. There is no spawned
`aura-digest.mjs` child, no `~/.pi/aura/server-url.json`, no `~/.pi/aura/state.json`
pid tracking, and no `~/.pi/aura/digest.json`. The only file written to disk is
`~/.pi/aura/last-digest.json` (the diff baseline).

The extension holds the current digest and the event stream **in memory**
(module-scope state) and serves the browser via an in-process `http.Server`
the extension owns. The browser still talks HTTP/SSE — it is a separate process
and that does not change — but it reads `/api/digest` from memory and receives
`/events` SSE fanned out from in-memory pushes.

Done looks like:

- `digest-dashboard-start` creates an in-process `http.Server` (handle in module
  scope) and opens the browser to its URL. No detached child, no pid file.
- `digest-fetch` calls `fetchAction()` in-process (the existing async function,
  now importable) with an `onProgress` callback the extension wires to push
  events into the in-memory stream + SSE directly — no HTTP self-POST.
- `digest-log` calls the in-memory event push directly — no HTTP self-POST.
- `digest-save` writes `~/.pi/aura/last-digest.json` (the diff baseline) — the
  only disk write.
- `digest-dashboard-stop` and `session_shutdown` call `server.close()` —
  deterministic, in-process. No `terminateProcess`, no reap race, no orphan.
- The orphan / stale-`server-url.json` / stale-pid bug class is **structurally
  impossible**, not just patched.

The CLI is **deleted**: `main()`, `process.argv`/`stdout`/`exit`, the committed
`dist/aura-digest.mjs` bundle, and the esbuild config that builds it. Anything
that invoked the bundle (skills, docs, tests) goes through the tools instead.

## Constraints

- **The code lives where the tools live.** The core (`fetchAction`,
  `scheduler`, `progress-emitter`, `devlinks`, `build-actions`,
  `write-dashboard-digest`) moves out of `scripts/src/` into the extension
  (or a shared location the extension imports). This resolves the TS6059
  `rootDir` boundary that forced the local `readDashboardUrl` duplicate in
  slice 5 of `digest-live-progress-tree`.
- **The fetch is non-blocking I/O.** It runs on the main event loop as an
  awaited promise (~17s of network I/O, not CPU). The event loop stays
  responsive — the dashboard SSE and other tool calls coexist. No worker
  thread.
- **The browser is a separate process.** It keeps HTTP/SSE to the in-process
  server. That hop is unchanged in protocol (same `/api/digest`, `/api/state`,
  `/events` SSE), only the server's *backing store* changes (file → memory).
- **Determinism.** The digest output (dev_links order, reviews_owed,
  warnings) stays byte-identical to today. The scheduler's guarantees (mutex,
  cap, loud failures, graceful degradation) are untouched.
- **Scope is tight to the in-process move.** Lifecycle + UI cleanup that the
  move *forces* is in scope. Anything wider (digest data model, Svelte view
  redesign, action_click flow, Aura client, skill choreography) is **out of
  scope** and collected as a friction point along the way — to be turned into
  a separate map/task if it warrants, never absorbed here.

## Decisions so far

- **Destination: full in-process.** Server, fetch, log, save all in-process.
  Discovery files (`server-url.json`, `state.json` pid) and `digest.json` are
  gone; the digest + events live in memory; only `last-digest.json` on disk.
- **CLI: deleted.** No bundle, no `main()`, no esbuild for it. Skills/docs
  that invoked `aura-digest.mjs` go through the tools.
- **Core location: move to extension/shared.** The core leaves `scripts/src/`
  so the extension can import it (resolves TS6059). A CLI shim is NOT kept —
  the CLI is deleted outright.
- **Fetch execution: main event loop.** Non-blocking I/O; awaited promise; no
  thread boundary.
- **Bug class elimination, not patches.** The orphan / stale-file / reap races
  disappear because the process-and-two-files design that allowed them is gone.
  The targeted fixes just landed (`c80ef96d`, `e56e96ec`) remain as a safety net
  for the old design but become dead code once this map lands and should be
  removed.
- **Friction points are collected, not absorbed.** Anything that wants to be
  wider is recorded in the task's notes / a friction log and turned into a
  separate map/task if it warrants — never silently expanded into this scope.

## Fog

- **`last-digest.json` write path.** Does `digest-save` become a pure
  "promote the in-memory current digest to last-digest on disk," or does it
  still take a `dir` param (the temp directory is a CLI-era artifact that may
  also disappear)? The temp dir (`/tmp/aura-morning-<hex>/`) and `raw.json`
  were written by the bundle for the CLI; in-process, the fetch can return the
  object directly and the temp dir may be unnecessary. Sharp enough to be a
  task/decision, not a grilling block.
- **The `/digest` slash command's responsibility.** Today it activates tools +
  injects the skill doc. Should it also start the in-process server (so the
  dashboard is guaranteed up before the agent runs), or does the skill doc's
  Step 1 (`digest-dashboard-start`) remain the agent's first action? Given the
  agent reliably skipped Step 1 (the bug we just chased), the command starting
  the server itself is the more robust choice — but that's a small decision
  for the start-task body.
- **Tests that spawned the bundle.** `fetch-save-tools.test.ts` and others mock
  `child_process.spawn` against `aura-digest.mjs`. They become in-process call
  tests (mock `fetchAction` / `createDefaultAuraClient`). The test surface
  changes shape — needs a slice.
- **Skills/docs that invoke `aura-digest.mjs`.** `skills/core/aura-digest/
  aura-digest.md` and possibly other docs reference the bundle path. They
  switch to the tools. Needs an audit as a slice.
- **The `digest-fetch` tool's `details.dir`.** Today it returns the temp dir
  the agent passes to `digest-save`. If the temp dir disappears, the
  fetch→save handoff becomes "promote current in-memory digest to last" —
  no `dir` param. This couples to the `last-digest.json` fog above.

## Out of scope

- Redesigning the digest data model (actions, followup, dev_links shape).
- Redesigning the Svelte view or the action_click flow.
- Changing the Aura client (`createDefaultAuraClient`) or MCP-over-HTTP path.
- Redesigning the `aura-digest` skill choreography beyond what the in-process
  move forces (the step order may shift, but the choreography stays).
- A worker-thread fetch. (Main event loop is the decision.)
- Keeping the CLI. (Deletion is the decision.)
- Re-introducing `server-url.json` or `state.json` pid. (Gone by design.)
