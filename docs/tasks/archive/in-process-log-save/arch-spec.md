# Architecture spec — `in-process-log-save`

> Task 4 of 5 in `in-process-aura-digest`. `digest-log` pushes an `agent_log`
> event directly to the in-memory store (`store.pushEvent`) instead of
> HTTP-POSTing to `/api/state`. `digest-save` already writes `last-digest.json`
> from `getCurrentDigest()` (task 3 did it) — this task does the final polish +
> drops the now-dead HTTP-POST helpers. No `digest.json`, no temp dir.

## Current state (after tasks 1–3)

- `digest-log` (`index.ts`): `getDashboardUrl()` → if null, "dashboard not
  running, log skipped"; else `joinUrl(dashboardUrl, "/api/state")` +
  `fetch(POST)` with an `agent_log` StateEvent body. **Still HTTP-POSTs** to
  the in-process server's `/api/state`, which then `pushEvent`s in-memory.
  (A self-HTTP hop within the same process — pointless now that the store is
  in-memory.)
- `digest-save` (`index.ts`): **already reworked by task 3** —
  `getCurrentDigest()` → `saveLastDigest(digest)`; no `dir`, no spawn, error
  when null. Done.
- `store.pushEvent` (task 2): the in-memory event seam. `digest-fetch`
  (task 3) already wires `onProgress` → `pushEvent`; `digest-ack` (task 3
  coherence fix) calls `pushEvent` directly. `digest-log` is the **last**
  tool still going through the HTTP self-POST.
- `getDashboardUrl()` stays (used by `digest-fetch`'s "dashboard was down"
  warning). `joinUrl` is used **only** by `digest-log` — dead after this task.

## Slice split (2 slices, sequential)

### Slice 1 — `digest-log-direct-push` (size s)
**`digest-log` calls `store.pushEvent` directly; no HTTP self-POST.**

- `digest-log` `execute`: replace the `getDashboardUrl`/`joinUrl`/`fetch(POST)`
  with a direct `store.pushEvent({ id: 0, ts: new Date().toISOString(), dir:
  "agent→page", type: "agent_log", payload: { message: params.message } })`.
  The store assigns the monotonic id + fans out to SSE clients (the line
  renders in the dashboard log list when the server is up).
- **No-op semantics change:** `pushEvent` always pushes to the in-memory
  `events` array; SSE fan-out is a no-op if no clients are connected (the
  server isn't started). So `digest-log` is now **always-safe** (never "skipped"
  — the event is recorded; it just doesn't render if the dashboard isn't open).
  Return `digest-log: ok (<message>)` unconditionally (no "dashboard not running"
  branch — the push always succeeds). This matches the task's "no-op-safe if
  the server isn't started (returns ok, no throw)" criterion, but stronger:
  the event is recorded regardless.
- Drop the `joinUrl` import from `index.ts` (now only `digest-log` used it;
  after the rewire, nothing imports `joinUrl`). Keep `getDashboardUrl`
  (`digest-fetch` still uses it).
- Tests: rewrite `log-tool.test.ts` to assert: `pushEvent` called (the event
  is in `store.getEvents()` with `type: "agent_log"` + the message); no
  `fetch` called (no HTTP); a connected `/events` SSE client receives the
  `agent_log` `state-change` event; the tool returns `ok` regardless of
  whether the server is running. Drop the "dashboard down → skipped" test
  (that branch is gone) — replace with "always records the event even with
  no server".

### Slice 2 — `cleanup-and-final-polish` (size s)
**Drop the now-dead HTTP-POST path + finalize.**

- Confirm `digest-save` is in its final state (task 3 did it; this slice just
  verifies + records): writes `last-digest.json` from `getCurrentDigest()`;
  no `dir`; no spawn; error when null. No change unless a small polish is
  needed (e.g., the tool description).
- Grep `index.ts`: no `joinUrl` (dropped in slice 1), no HTTP `fetch` for
  `/api/state` (digest-log was the last), no `readDashboardUrl`. The
  `/api/state` POST route stays in `server.ts` (the browser's action_click
  POSTs to it — that's page→agent, still needed; only the agent's self-POST
  is gone). Confirm.
- Update the `digest-log` tool `description`/`promptSnippet` if it still says
  "no-op if the dashboard is not running" → "always records the line; renders
  in the dashboard when it's running" (the new semantics).
- Skill doc (`aura-digest.md`): the `digest-log` section already says it's a
  no-op if the dashboard isn't running — update to "always records; renders
  when the dashboard is up". Minimal (task 5 does the full rewrite).
- Final gate: full vitest + all typechecks + CLI build green; no `joinUrl` in
  `index.ts`; `digest-log` never calls `fetch`.

## Existing abstractions to use

- `store.pushEvent` (task 2) — the direct in-memory seam.
- `saveLastDigest` (task 3) — `digest-save` already uses it.
- `getDashboardUrl` (task 2) — stays for `digest-fetch`'s warning.

## Do NOT (out of scope — other tasks)

- Touch `digest-fetch` (task 3 — done) or its `setCurrentDigest`/`onProgress`.
- Touch the server lifecycle / store backing (task 2 — done).
- Delete the CLI bundle/shim (task 5).
- Change the digest data model, the Svelte view, or `digest-types.ts`.
- Remove the `/api/state` POST route in `server.ts` (the browser still uses it
  for `action_click` — only the agent's self-POST is gone).

## Seams (boundaries under test)

1. **Direct-push seam:** `digest-log` calls `pushEvent` (no `fetch`); the event
   is in `store.getEvents()`; SSE fan-out to connected clients.
2. **Always-safe seam:** `digest-log` returns `ok` regardless of server state;
   the event is recorded even with no server.
3. **No-HTTP seam:** no `joinUrl`/`fetch` for `/api/state` in `digest-log`; grep
   `index.ts` for `joinUrl` → empty.
4. **Save-final seam:** `digest-save` unchanged (already final from task 3) —
   confirm.

## Interface contract for task 5 (`cli-deletion-and-rewire`)

After this task, the extension's agent-side tools (`digest-fetch`, `digest-log`,
`digest-save`, `digest-update`, `digest-ack`, `digest-dashboard-start/stop`)
are **all** in-process + in-memory — no spawned child, no HTTP self-POST, no
`server-url.json`/`digest.json`/temp dir. The only remaining CLI surface is the
`aura-digest.mjs` bundle + `scripts/src/aura-digest.ts` shim + `scripts/esbuild.config.mjs`
+ the `createProgressEmitter`/`readDashboardUrl`/`saveAction` exports the shim
uses — all of which task 5 deletes. The skill doc still has CLI-era references
task 5 rewrites.

## Baseline (on task/in-process-log-save off develop)

- ext/shared/scripts typecheck: green · shared `tsx --test`: 195 · root vitest: 20 files / 212 tests
- CLI exit codes: 2/2/0
