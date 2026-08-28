---
kind: task
type: feature
slug: digest-live-progress-tree
title: Show a live progress tree in the digest dashboard while the fetch runs
map: digest-live-progress-tree
status: ready
slices: [1-scheduler-progress-nodes, 2-dashboard-event-plumbing, 3-bundle-emits-tree, 4-svelte-tree-view, 5-digest-log-tool, 6-skill-reorder-and-notify]
---

## User-visible outcome

When the user runs `/aura-digest`, the already-running digest dashboard shows a
live, nested tree of operations as the fetch happens ("Fetching notifications
from Aura" → "Fetching tasks from Aura" → per-task dev-links work, with
running/done/error icons). During the agent's augment phase, status lines render
as a log below the tree. When the fetch completes the tree transitions to the
digest view.

## User story

As a user waiting on the ~17s digest fetch, I want to see what it's doing in real
time — not a blank screen — so I trust it's working and can spot a stuck step.

## Scope boundaries

- In: the scheduler node model, dashboard event plumbing, bundle emission,
  the Svelte tree+log view, the `digest-log` tool, the skill reorder, and the
  pi-TUI warning when the dashboard is absent.
- Out: moving the base fetch into the scheduler; per-task cancellation; a
  refresh button. (See map "Out of scope".)

## Acceptance criteria

- `/aura-digest` starts the dashboard first (ready state), then the fetch
  streams a nested tree that updates live in the browser.
- Fast open→close node pairs still render a brief ✓ (no flicker) — layered
  debounce verified.
- During augment, `digest-log` calls render as a log under the tree.
- Fetch completes → tree transitions to the digest view.
- Fetch without the dashboard running still succeeds; a pi-TUI warning is
  shown once at the end.
- All existing scheduler guarantees (reducer mutex, runaway cap, loud
  failures, graceful run() degradation) and all 127 existing tests still pass.

## Existing abstractions to use

- `scripts/src/scheduler.ts` (reducer task scheduler) — add the imperative
  `ctx.progress` node model; do not regress the mutex/cap/failure guarantees.
- `.pi/extensions/digest-dashboard/state.ts` (`StateEvent`, `appendEvent`
  write queue) — add `"progress"` and `"agent_log"` event types.
- `.pi/extensions/digest-dashboard/server.ts` (`/events` SSE, `/api/state`
  POST) — extend `/events` to watch `state.json`.
- `.pi/extensions/digest-dashboard/Digest.svelte` — new "fetch display mode"
  view + layered debounce.
- `skills/core/aura-digest/aura-digest.md` — reorder steps.

## Architecture / domain decisions

See the map (`docs/tasks/maps/digest-live-progress-tree/map.md`) "Decisions so
far" — the full grilling record lives there. Key points: the node model is
imperative and task-driven (the scheduler is a passthrough; only the progress
function marks nodes finished; end-of-run sweep closes orphans as error);
`finish(node, { deferCloseForChildren: true })` is the opt-in parent-joins-
children primitive; transport reuses `POST /api/state` + extended `/events`;
batching is ~50ms in the bundle; client debounce is layered (30ms coalesce +
400ms dwell); base-fetch phases are emitted inline in `fetchAction`, not in
the scheduler.

## Implementation notes

### slice: 1-scheduler-progress-nodes (landed)

- Replaced the uncommitted declarative `Kind.progress(input)` + auto-open/close-around-`run` model with an imperative `ctx.progress` API on the scheduler. `ctx.progress.create(parent?, label)` returns an opaque `NodeHandle`; `ctx.progress.finish(node)` marks a node done right now (no removal); `ctx.progress.finish(node, { deferCloseForChildren: true })` defers resolution until all child-nodes are terminal (done if all children done, error if any child errored; no children → done immediately); `ctx.progress.setStatus(node, "running"|"done"|"error")` mutates status directly.
- `TaskRef.node` (an optional `NodeHandle` the parent created) replaces the removed `progressParentId`; the scheduler threads it as `ctx.node` (root for `start`). Nodes are append-only — never removed mid-run — so the tree only grows during a run.
- The scheduler's only auto-close is an end-of-run sweep: any still-"running" node (never `finish`ed or deferred-and-unresolved) → "error" (safety net). A task that throws does NOT trigger per-task auto-close; only the sweep closes its open nodes.
- `onProgress` fires for every status transition, serialized with the reducer drain (never overlap). Existing guarantees hold: reducer mutex, runaway cap, loud failures, graceful `run()` degradation. All pre-existing scheduler tests (mutex, cap, async-reducer rejection, unknown kind, throwing reducer, graceful degradation) pass unchanged.
- Tests: `scripts/src/scheduler.test.ts` gained 14 new tests covering the node lifecycle (defer-with-children dynamic join, never-finished sweep, throw-does-not-close, finish-no-children, `TaskRef.node` threading); 21 tests total. Full suite: 141 tests pass across 16 files (was 127). `scripts` typecheck clean, build succeeds.
- No bundle changes in this slice — the rebuilt `aura-digest.mjs` from verify is out of scope (bundle emission is slice 3). The scheduler-only change is consumed by slice 3's `start` kind.

### slice: 2-dashboard-event-plumbing (landed)

- Added `"progress"` and `"agent_log"` to the `StateEvent.type` union in `.pi/extensions/digest-dashboard/state.ts`. New `ProgressPayload` (mirrors the scheduler's `ProgressEvent`: `id`, `label`, `parentId?`, `status`, `startedAt`, `endedAt?`, `kind`) and `AgentLogPayload` (`message: string`). `appendEvent` accepts both unchanged (same write queue).
- `/events` SSE in `server.ts` gained a second `fs.watch` on `state.json`; on change it reads the last event and emits `event: state-change` with the event's `id` + `type`. The existing `digest.json` `event: change` is untouched.
- `digest-types.ts` (the browser-facing `StateEvent` copy) was edited then deliberately reverted — the browser-side type union update is slice 4's scope. `state.ts` is the server-side source of truth (`server.ts` imports `StateEvent` from it), so typecheck passes without the `digest-types.ts` change.
- Tests: `test/digest-dashboard/server.test.ts` (new) and `test/digest-dashboard/state.test.ts` (new) cover POST landing with monotonic ids, SSE `state-change` for both new types, concurrent-POST serialization, and the `digest.json` `event: change` regression. Full suite: 149 tests pass across 16 files (was 141, +8 new). `scripts` typecheck clean; dashboard server bundle exists.
- Residual risks (for slice 4): the `state.json` watcher silently swallows ENOENT if the file is absent at SSE-connect time (no retry) — slice 4's view should re-fetch `state.json` on connect; `state-change` carries only the last event's id+type (a hint, not a full delta) so the browser re-fetches; `digest-types.ts` must be updated in slice 4 to mirror the `state.ts` union.

### slice: 3-bundle-emits-tree (landed)

- New `scripts/src/progress-emitter.ts` (separate module so it can be unit-tested without importing `aura-digest.ts`, which has module-level side effects). `readDashboardUrl(path?)` reads `~/.pi/aura/server-url.json` ONCE at fetch start; returns `null` if absent/malformed → the hook is a no-op for the whole run (digest still writes `digest.json`). `createProgressEmitter(dashboardUrl, opts?)` returns an `onProgress`-compatible hook + a `flush()` for run-end flushing. Events batch on a ~50ms timer; events arriving in the same window are coalesced by node id (latest status wins), so a near-instant open→done pair becomes a single "done" event. POST failures are best-effort (dashboard down mid-run is non-fatal). Each event is POSTed individually to `/api/state` as a `StateEvent` wrapper — the "batch" is the time window + coalescing, not a single HTTP body.
- `scripts/src/aura-digest.ts` `fetchAction` reads the dashboard URL once and installs the hook. Inline phase nodes (emitted before/during the parallel base fetch) cover notifications + capacity with stable ids (`phase-notifications`, `phase-capacity`); each is `finish`ed when its base fetch completes. The `start` kind creates two phase nodes ("Fetching tasks from Aura", "Fetching reviews") at root level, a child node per dev-links row under the tasks phase and per review candidate under the reviews phase, then `finish`es every child with `deferCloseForChildren: true` BEFORE spawning so each stays spinning until the child task finishes its own `ctx.node`. The `devLinksRow` and `reviewCandidate` kinds now take `ctx` and `finish(ctx.node)` in a `finally` block so the deferred parent resolves once all siblings are terminal.
- Bundle rebuilt: `skills/core/aura-digest/dist/aura-digest.mjs` regenerated via esbuild.
- Tests: `scripts/src/aura-digest-progress.test.ts` (new, 10 tests) covers `readDashboardUrl` (absent/exists/malformed), the no-op path (no POSTs when `dashboardUrl` is null), batching (10 rapid events in one ~50ms window), final flush, open→done coalescing to a single done event, different-id non-coalescing, running→error coalescing, and a kept-running event. Full suite: 159 tests pass across 17 files (was 149 across 16, +10 new). `scripts` typecheck clean; build succeeds.
- Residual risks (for slice 4): the emitter POSTs individual `StateEvent`s per event (no multi-event body) — slice 4's browser view must accumulate them from `state.json`; the no-op path emits nothing, so the browser sees an empty `state.json` while a no-dashboard fetch runs (slice 4 should handle an empty/absent tree gracefully).

### slice: 4-svelte-tree-view (landed)

- `Digest.svelte` gained a "fetch display mode": when `progress` events arrive the view renders a nested tree of nodes (spinner while running, ✓ on done, ✕ on error) keyed by `parentId`, and `agent_log` events render as a chronological log list below the tree. Nodes are append-only — once shown, a node stays on screen until the run ends (never removed mid-run) — so the tree only grows. On a terminal "done" event for the root fetch node, the view transitions to the digest view (existing queue/reviews/capacity/actions render) after `digest.json` is present; the existing digest render path and action_click flow are unchanged.
- New `.pi/extensions/digest-dashboard/progressTree.ts` is the pure, framework-agnostic helpers module: `buildTree(events)` constructs the nested structure, `findNode`/`getRootNodes`/`getChildNodes` traverse it, and `createDwellManager(DWELL_MS, onExpire?)` implements the ~400ms minimum dwell on a running→done transition. The dwell manager uses a clean `setTimeout` driven from render-observation (the component polls dwell expiry on each reactive tick), with a **reactive `dwellVersion`** counter so Svelte's reactivity re-runs the expiry check — NO `requestAnimationFrame`, NO buffer/canvas tricks. `onExpire` callback fires when a dwell timer elapses, letting the component re-render without a forced rAF loop. The ~30ms coalescing on incoming events is a separate debounce in the component that batches rapid `state-change` SSE bursts into one render.
- `digest-types.ts` updated to mirror `state.ts`: the browser-facing `StateEvent` type union now includes `"progress"` + `"agent_log"`, and `ProgressPayload` / `AgentLogPayload` mirror their server-side counterparts (resolving the residual risk slice 2 flagged).
- The ~400ms dwell fix evolved across the slice: the first attempt used a test-tuned rAF buffer; the final approach removed it in favor of the clean `setTimeout`-from-render-observation + reactive `dwellVersion` design (no rAF, no buffer). The component re-checks dwell timers reactively and calls `onExpire` when a timer elapses.
- Tests: `test/digest-dashboard/progressTree.test.ts` (new, covers `buildTree` nesting, append-only, `createDwellManager` with/without `onExpire`, reactive `dwellVersion`, ~400ms hold on running→done, rapid-burst coalescing) + `test/digest-dashboard/DigestTree.test.ts` (new, component-level: fast open→done renders a brief ✓ with no flicker, nested subtree, error ✕, `deferCloseForChildren` parent stays spinning until children resolve, transition to digest view on terminal root done + `digest.json` present). `Digest.test.ts` + `real-data-load.test.ts` updated for the new view. Full suite: **198 tests pass across 19 files** (was 159 across 17, +39 new +2 files). `scripts` typecheck clean; `scripts` build succeeds; `.pi/extensions/digest-dashboard/dist/{app.js,app.css,server.mjs}` bundles exist.

### slice: 5-digest-log-tool (landed)

- New `digest-log` pi tool registered in `.pi/extensions/digest-dashboard/index.ts` with params `{ message: string }` (a single status line for the dashboard's log list). On `execute` it reads `~/.pi/aura/server-url.json` once; if present it POSTs `{ dir: "agent→page", type: "agent_log", payload: { message } }` to `/api/state` of the running dashboard, so the agent can push augment-phase status lines ("Verifying review states…", "Re-ranking actions…") that render in the dashboard's log list (slice 4).
- No-op when the dashboard is down: if `server-url.json` is absent (or malformed) the tool returns `{ content: [{ text: "digest-log: dashboard not running, log skipped" }], details: {} }` — it never throws and never fails the agent's call. Best-effort on POST failure too: a `catch` around `fetch` returns an `ok (post failed, non-fatal)` text result instead of throwing, since the log is a nice-to-have, not a gate. Concurrent calls each fire their own POST (the server-side `appendEvent` write queue serializes ids).
- `readDashboardUrl` is duplicated locally in `index.ts` (mirrors `scripts/src/progress-emitter.ts`) rather than imported from the scripts project. The extension's `tsconfig.json` has a `rootDir` that blocks cross-project imports (TS6059); per the supervisor decision (Option A — duplicate the ~10-line helper) a cross-project import was attempted and rejected, so a local copy with a design-mirroring comment is kept instead. A `joinUrl` helper normalizes the base/path slashes for the POST URL.
- `digest-log` was added to the `DIGEST_TOOLS` array (4 → 5 tools) so the `/aura-digest` command activates it alongside `digest-dashboard-start`, `digest-dashboard-stop`, `digest-fetch`, and `digest-save`. The slash-command test `test/digest-dashboard/slash-command.test.ts` was updated: the "activates all four digest tools" assertion became "activates all digest tools" and now expects 5 `digest-`-prefixed tools, and the idempotent-double-handler test expects 5 tools.
- Tests: `test/digest-dashboard/log-tool.test.ts` (new, 9 tests) covers registration with `{ message: string }`, POSTing `agent_log` to `/api/state` + ok return when dashboard is up, no-op ok return when `server-url.json` is absent (no fetch attempted), concurrent calls each fire a POST, and the malformed-URL no-op path. Full suite: **203 tests pass across 20 files** (was 198 across 19, +5 new +1 file). `scripts` typecheck clean.

### slice: 6-skill-reorder-and-notify (landed)

- `skills/core/aura-digest/aura-digest.md` reordered: Step 1 is now `digest-dashboard-start` (ready state, browser open), Step 2 is `digest-fetch` (streams the live tree), Step 3 is augment (orchestrator judgment + `digest-log` per sub-step), Step 4 is `digest-save` → wait for clicks → act → teardown. The pipeline diagram + prose were rewritten to match (dashboard-start first → fetch-streams → augment with `digest-log` → save → clicks → teardown). Cross-references throughout ("Step 3 step 5" → "Step 4 step 4", etc.) were renumbered. `digest-dashboard-start` called when already running is still a no-op (existing idempotency preserved).
- `.pi/extensions/digest-dashboard/index.ts`: `digest-fetch`'s `execute` now takes the `ctx: ExtensionContext` param. It reads `~/.pi/aura/server-url.json` once at the start via `readDashboardUrl()` and sets a `dashboardWasDown` flag; at the end of the success path, if the flag is set, it calls `ctx.ui.notify("digest-fetch: dashboard was not running, no live tree shown", "warning")` and prepends a `⚠️` warning line to the result text. This is a **one-shot** end-of-run warning — never per-event — and the fetch **never fails** on the dashboard being absent: the digest is still written to `~/.pi/aura/digest.json` and returned in the result. The existing error paths (exit code ≠ 0, missing output directory, missing dashboard digest) are unchanged.
- The `readDashboardUrl()` helper (introduced in slice 5) is reused for the absent-dashboard check — no new file-reading code. When the dashboard is up, no warning is fired and the result text is clean, parseable JSON (the `digest-log` live log and the `progress` tree stream into the browser as designed by slices 3+4).
- Tests: `test/digest-dashboard/fetch-save-tools.test.ts` gained a `createCtxWithNotify` helper + a new `describe("digest-fetch dashboard-absent warning")` block (2 tests): (1) dashboard down → single warning notify with "warning" severity + warning line in result text, digest JSON still present; (2) dashboard up → no warning notify, no warning line, result text is clean parseable JSON. The existing "digest-fetch tool" suite was updated to write `server-url.json` so its success path does not trigger the new warning. Full suite: **205 tests pass across 20 files** (was 203 across 20, +2 new). `scripts` typecheck clean. No bundle rebuild needed (no `scripts/src/` changes).
- This is the **final slice** — all 6 slices landed. Task `digest-live-progress-tree` is ready for finalization.

## Architecture lessons (knowledge harvest)

- **Cross-project import boundary (TS6059).** `scripts/src/progress-emitter.ts` exports `readDashboardUrl()`, but importing it into `.pi/extensions/digest-dashboard/index.ts` breaks the extension's `tsc --noEmit` — the extension `tsconfig.json` has `rootDir: "."`, so `tsc` rejects files outside it (TS6059). The 8-line helper is duplicated locally in `index.ts` (with a comment noting it mirrors `progress-emitter.ts`), not shared. A shared `@pi-aura/shared` location would work but is out of scope for a slice. Lesson: when an arch spec says "reuse" a helper across the `scripts/`↔`.pi/extensions/` boundary, check the `rootDir`/`composite` settings first — a literal import may be architecturally invalid.
- **Event ids are server-assigned.** `appendEvent` (`state.ts`) assigns a monotonic id (`max(existing ids) + 1`) overwriting any client-supplied id. Clients (`progress-emitter.ts`, the `digest-log` tool) send `id: 0` as a placeholder; the server owns the invariant. Do not reintroduce a client-side `nextEventId` module global — it collides across concurrent runs and leaks across test instances.
- **`deferCloseForChildren: true` is for non-leaf parents only.** The scheduler resolves a deferred node with no children to "done" immediately, so using it on a leaf node is a no-op (the node flips to done before the task runs). The production wiring creates leaf row/candidate nodes and finishes them with a plain `finish(node)` in the task's `finally` block — the node stays "running" until the task completes, which is the desired UX. Phase nodes (`tasksPhaseNode`/`reviewsPhaseNode`) have children, so their `deferCloseForChildren: true` is correct. The scheduler tests document both behaviors.
- **Render-time observation belongs in `$effect.pre`, not `$effect`.** `dwell.observe()` must run *before* the DOM update so `statusIcon` (a pure render function that reads `dwell.displayStatus`) sees the dwell-hold on the first post-transition render. `$effect` runs after the DOM update — too late; the first render shows the terminal status immediately and the 400ms dwell test fails. `$effect.pre` (Svelte 5 rune) runs before the DOM update and preserves the dwell. Keep `statusIcon` pure: read `dwellVersion` (reactive counter bumped by the dwell manager's `onExpire` callback) + call `dwell.displayStatus`, no mutation.
- **`agent_log` dedup is O(1).** A `seenLogLines` `Set` mirrors the reactive `agentLogLines` array; dedup checks the Set, new lines go to both. Don't reintroduce `agentLogLines.includes(line)` (O(n²)).
