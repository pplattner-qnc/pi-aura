# Handoff — digest-live-progress-tree (paused after slice 2)

> **Read this first, then `docs/tasks/maps/digest-live-progress-tree/map.md` and `docs/tasks/digest-live-progress-tree/arch-spec.md`.** This file is the live state; the map/arch-spec are the design record.

## What this is

Feature task `digest-live-progress-tree` — show a live progress tree in the digest dashboard while the `/aura-digest` fetch runs. Planned via Wayfinder + a grilling session; all design decisions are settled and recorded in the map's "Decisions so far". Six slices; **2 landed, 4 remain**. Implementation was paused by the user after slice 2.

## Where things are

- **Branch:** `main` (all work lands direct-to-main, `--no-ff` merge + a separate `docs(slice): land` commit — this is the repo convention, verified from prior landings).
- **Task doc:** `docs/tasks/digest-live-progress-tree/task.md` (has `## Implementation notes` for slices 1 + 2).
- **Arch spec:** `docs/tasks/digest-live-progress-tree/arch-spec.md` (covers all 6 slices — still accurate).
- **State:** `docs/tasks/state.yaml` → `task: digest-live-progress-tree`, `slice: 2-dashboard-event-plumbing`.
- **Tests:** 149 pass (16 files). `cd scripts && npm run typecheck` clean. Dashboard server bundle exists at `.pi/extensions/digest-dashboard/dist/server.mjs`.

### Landed (archived under `slices/archive/`, `status: done`)
| # | Slice | Merge | Land | Net tests |
|---|---|---|---|---|
| 1 | scheduler-progress-nodes | `1a8454a8` | `6fe53511` | 127 → 141 (+14) |
| 2 | dashboard-event-plumbing | `59b75653` | `2c9bda3b` | 141 → 149 (+8) |

Both had **zero deviations** (deviation reports in `docs/tasks/digest-live-progress-tree/deviation-reports/`). ui-noter: no UI work in either (expected — they're scheduler + event-plumbing).

## What slices 1 + 2 delivered (so you know what exists)

- **Slice 1 — `scripts/src/scheduler.ts`:** imperative `ctx.progress` node model. `ctx.progress.create(parent?, label) → NodeHandle`; `finish(node)` marks done now (no removal); `finish(node, { deferCloseForChildren: true })` defers — node resolves to done iff all child-nodes (dynamic) terminal, error if any child errored, done immediately if no children; `setStatus(node, status)` mutates. `TaskRef.node` (parent-created handle) threads to child as `ctx.node`. Nodes are **append-only** (never removed mid-run). Scheduler's only auto-close: end-of-run sweep flips still-running nodes to error. `onProgress(event)` fires per transition, serialized with the reducer drain. All prior guarantees (reducer mutex, runaway cap, loud failures, graceful run() degradation) intact.
- **Slice 2 — `.pi/extensions/digest-dashboard/state.ts` + `server.ts`:** `"progress"` + `"agent_log"` added to `StateEvent.type`. `ProgressPayload` mirrors `ProgressEvent`; `AgentLogPayload` is `{ message }`. `appendEvent` accepts both (same write queue). `/events` SSE now also `fs.watch`es `state.json` and emits `event: state-change` with the last event's `id`+`type`. `digest.json` `event: change` untouched. **`digest-types.ts` (browser copy) deliberately NOT updated — that's slice 4's job.**

### Residual risks slice 2 flagged (slice 4 must honor)
1. `state.json` watcher swallows ENOENT if file absent at SSE-connect (no retry) — slice 4's view should re-fetch `state.json` on connect.
2. `state-change` SSE carries only the *last* event's id+type (a hint, not a full delta) — the browser re-fetches full `state.json` on each `state-change`.
3. `digest-types.ts` must be updated in slice 4 to mirror the `state.ts` union (browser-side `StateEvent` is currently out of sync).

## Remaining frontier (4 slices, all docs exist under `slices/`)

Per the slices' `blocked_by`:
- **`3-bundle-emits-tree`** — blocked_by [1, 2] ✅ → **READY**. Wire `onProgress`→batched POST (~50ms) to `/api/state`; read `~/.pi/aura/server-url.json` once (no-op if absent); emit top-level phase nodes inline in `fetchAction`; `start` kind creates+attaches child nodes (rows under "tasks", candidates under "reviews") and `finish`es with `deferCloseForChildren`. Rebuild the bundle. Slice doc: `slices/3-bundle-emits-tree.md`.
- **`4-svelte-tree-view`** — blocked_by [2] ✅ → **READY**. `Digest.svelte` "fetch display mode": nested tree from `progress` events (append-only, spinner→✓→✕) + log list from `agent_log`, layered debounce (~30ms coalesce + ~400ms dwell on running→done), transition to digest view on terminal root "done". **Also update `digest-types.ts` here.** Slice doc: `slices/4-svelte-tree-view.md`.
- **`5-digest-log-tool`** — blocked_by [2] ✅ → **READY**. New `digest-log` pi tool (`message` → POST `agent_log`); no-op if dashboard down. Slice doc: `slices/5-digest-log-tool.md`.
- **`6-skill-reorder-and-notify`** — blocked_by [3, 4] → waits. Reorder skill doc (dashboard-start first → fetch-streams → augment with `digest-log` → save); `digest-fetch` end-of-run `ctx.ui.notify` + result warning when dashboard was absent. `mode: hitl`. Slice doc: `slices/6-skill-reorder-and-notify.md`.

Slices within a level run **sequentially** (chains share the repo cwd). 3, 4, 5 are all unblocked — run them one chain at a time (3, then 4, then 5 — or any order; 6 last).

## How to resume (the exact flow)

This is the `implement-task` autonomous feature pipeline. Per slice, the chain is:

**tdd-worker → (slice-verifier ∥ deviation-reporter ∥ ui-noter) → land-worker**

1. Dispatch `tdd-worker` (async) with the slice doc + arch-spec + "read the existing files first" pointers. It creates `slice/<slug>`, RED→GREEN→REFACTOR, commits each GREEN.
2. When tdd completes, fan out three concurrent async agents: `slice-verifier` (run `cd scripts && npm run typecheck`, `npx vitest run`, build if relevant), `deviation-reporter` (fork context — compare to arch-spec/slice doc, write `deviation-reports/<slug>.md`), `task-workflow.ui-noter` (detect UI work, advisory only).
3. On verify-pass + deviation-clean, dispatch `land-worker`: `--no-ff` merge slice branch into `main`, `git mv` slice doc to `slices/archive/` + set `status: done`, append `### slice: <slug> (landed)` to task.md `## Implementation notes`, update `state.yaml` `slice:`, commit `docs(slice): land <slug>`, `git branch -d slice/<slug>`.
4. After all slices land, the task is finalizable (`/skill:finalize-task`), then return to Wayfinder (`/skill:wayfinder digest-live-progress-tree`) to reassess the map.

Telemetry: `telemetry_skill_context({ skill_name: "implement-task", map: "digest-live-progress-tree", sliceCount: 6 })` was called at start.

## ⚠️ Operational note: subagent stalls

This session, the **slice-verifier** and **land-worker** agents (and one tdd-worker final run) stalled repeatedly mid-turn — the model provider hung after emitting partial output, leaving the run "needs attention" indefinitely. The **deviation-reporter** (forked context, different model) was reliably clean every time.

**Workaround used (keep using it):** if a verify/land/tdd agent shows no log progress for >60s despite `subagent_wait`, inspect its output log; if genuinely stuck, `interrupt` it and **run the deterministic gates / git ops yourself**. The gates are: `cd scripts && npm run typecheck`, `npx vitest run` (expect 149 + new), `cd scripts && npm run build` (esbuild — needed when a slice touches `scripts/src/`), and for dashboard slices confirm `.pi/extensions/digest-dashboard/dist/server.mjs` exists. The land git-ops are the exact sequence in step 3 above. Write the result file yourself (`docs/tasks/digest-live-progress-tree/.work/{verify,land}-<slug>/result.md`) so the record is complete.

Don't burn turns nudging a hung agent — interrupt + do it inline. If stalls persist across slices, consider routing verify/land to a more reliable model.

## Things explicitly out of scope (don't do)

- Moving the base fetch (briefing/queue/capacity/reviews/notifications) into the scheduler — it stays sequential in `fetchAction`.
- A refresh button in the tree view.
- Per-task cancellation / AbortSignal threading.
- Re-implementing the reducer mutex / runaway cap / dedup — they're settled and must not regress.

## Quick orientation commands

```
git log --oneline -6                                   # see the landed commits
ls docs/tasks/digest-live-progress-tree/slices/*.md    # remaining slices
ls docs/tasks/digest-live-progress-tree/slices/archive/  # landed slices
npx vitest run                                         # 149 pass baseline
cat docs/tasks/state.yaml                              # current task/slice
```

The next ready slice is **3-bundle-emits-tree**. Start its tdd-worker.
