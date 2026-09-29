## Deviation report — 4-svelte-tree-view (dwell-fix re-check)

### API surface changes
- **Planned:** A "fetch display mode" view in `Digest.svelte` that renders a nested tree from `progress` events (spinner→✓→✕), append-only (nodes never removed mid-run), plus a log list from `agent_log` events below the tree. Transitions to the existing digest view on a terminal root "done" event when `digest.json` exists. Layered debounce: ~30ms coalescing on incoming `state-change` events + ~400ms minimum dwell on running→done so a fast pair still shows a brief ✓.
- **Actual:** All delivered as specified, including the ~400ms minimum dwell that was missing in the first implementation pass. The dwell is now implemented via `createDwellManager` in `progressTree.ts` (pure timer logic, no DOM dependency) wired into `Digest.svelte` through a reactive `dwellVersion = $state(0)` counter. The `statusIcon` function observes the running→terminal transition at render time and the dwell manager holds the displayed status as "running" for 400ms (via `setTimeout`) before allowing the terminal status to render. An optional `onExpire` callback on `createDwellManager` bumps the `dwellVersion` counter so Svelte re-renders when the dwell timer fires.
- **Impact:** Dependent slices: none (slice 4 is a terminal slice per the arch spec). User-facing impact: fast open→done node pairs now render a brief ✓ (~400ms spinner hold) rather than visually vanishing, satisfying the map's design decision.

### Abstraction usage
- Used/was specified: **yes**
  - **`/events` SSE `state-change` from slice 2:** Used — `Digest.svelte` adds `addEventListener("state-change", ...)` and `addEventListener("change", ...)` on the existing `EventSource("/events")`. ✅
  - **`readState`/`state.json`:** Used — `loadStateEvents()` fetches `/api/state` (which returns the `state.json` content) and extracts `progress`/`agent_log` events. ✅
  - **Existing digest view unchanged:** The existing digest render path (queue/reviews/capacity/actions) is **unchanged** — the fetch display mode is added as a new `{:else if fetchMode}` branch in the template, before `{:else if error}` and `{:else if digest}`. ✅
  - **`EventSource("/events")`:** Used — the existing `EventSource("/events")` is preserved, with named-event listeners added alongside `onmessage`. ✅
  - **Did NOT reimplement the digest render path:** Confirmed — the existing digest template (`{:else if digest}` block) is untouched. ✅
  - **Did NOT reimplement the action_click flow:** Confirmed — no changes to `action_click` handling, `data-action-key` attributes, or action-related functions. ✅
  - **Did NOT reimplement the SSE endpoint:** Confirmed — `server.ts` has zero diff on this branch. ✅
  - **Did NOT reimplement the `digest.json` watcher:** Confirmed — no changes to the `digest.json` file-watching logic. ✅

### Out-of-scope changes
- **`progressTree.ts` — new module (232 lines):** The spec says the view is in `Digest.svelte`, but the implementer extracted pure helpers (`extractProgressEvents`, `extractAgentLogEvents`, `mergeProgressNodes`, `buildProgressTree`, `effectiveStatus`, `createDebounce`, `createDwellManager`, `isRootDone`) into a separate `progressTree.ts` module for unit-testability without mounting the Svelte component. This is a sound modularity decision consistent with the project's coding guidelines ("separate orchestration from business logic; one focused responsibility per file/module") — the tree-building, debounce, and dwell logic is pure and testable independently, while the view state and rendering stay in `Digest.svelte`. Does not contradict any spec constraint.
- **`createDwellManager` `onExpire` callback:** An optional second parameter `(id: string) => void` invoked when a dwell timer fires. This is a necessary, in-scope addition: Svelte's reactivity cannot observe mutations to the dwell manager's internal (non-reactive) `Map`, so the `onExpire` callback bumps a `dwellVersion = $state(0)` counter that `statusIcon` reads (`void dwellVersion`), creating a reactive dependency that triggers a re-render when the dwell expires. Without this, the dwell would hold the spinner but the component would never re-render to show the ✓ after 400ms. The callback is optional (defaults to no-op), so the pure unit tests work without a Svelte context.
- **`digest-types.ts` — updated:** `ProgressPayload` + `AgentLogPayload` interfaces added; `StateEvent.type` union now includes `"progress" | "agent_log"`. This is a necessary update flagged as a residual risk from slice 2 (the browser-side type union was deliberately not updated in slice 2 — slice 4's job). The shapes mirror `state.ts` exactly. ✅
- **`dist/server.mjs` — rebuilt with slice 2's changes:** The `dist/server.mjs` diff adds the `state.json` watcher + `state-change` SSE emission that slice 2 added to `server.ts` but never rebuilt into dist. This is a necessary rebuild (the slice doc says "rebuild dist bundles"), not new code. The `server.ts` source has zero diff on this branch.
- **`dist/app.js` and `dist/app.css` — rebuilt:** Vite build artifacts reflecting the `Digest.svelte` + `progressTree.ts` changes. Expected.
- **`Digest.test.ts` — modified:** The existing test's `FakeEventSource` was extended with `addEventListener`/`removeEventListener`/`dispatchNamed` to support named SSE events. The SSE change test was refactored to use `mockImplementation` instead of `mockResolvedValueOnce` (necessary because the component now also fetches `/api/state`). The POST-counting assertion was tightened to filter by `method === "POST"`. These are necessary adaptations to keep existing tests passing with the new SSE listeners, not behavior changes.
- **`real-data-load.test.ts` — modified:** Same `FakeEventSource` extension (addEventListener/removeEventListener) to avoid breaking when `Digest.svelte` calls `addEventListener` on the mock. No test logic changes beyond that.
- **No test-tuned magic numbers in production code.** The earlier implementation pass had a `scheduler` parameter on `createDwellManager` and a `requestAnimationFrame` + `Math.round(rafDelay / 2)` buffer in `Digest.svelte` that were specific to happy-dom's test timing — these have been removed in the cleanup commit (`38913e30`). The production code now uses a plain `setTimeout(dwellMs)` started when the transition is observed at render time. Confirmed: `grep -rn 'requestAnimationFrame\|rafDelay\|Math\.round.*raf\|scheduler' .pi/extensions/digest-dashboard/Digest.svelte .pi/extensions/digest-dashboard/progressTree.ts` returns zero matches.

### Divergence from slice doc acceptance criteria

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | On "progress" events with status "running", render a spinner; on "done", ✓; on "error", ✕. Nodes nest by parentId. | ✅ Met | `statusIcon(node)` returns "spinner"/"✓"/"✕" based on `effectiveStatus(node)` + dwell `displayStatus`. Nesting by `parentId` is handled by `buildProgressTree` which places children under their parent's `[data-subtree]` container. Tests: "renders a spinner for a running node, check for done, X for error" and "nests child nodes under their parent by parentId". |
| 2 | Nodes are append-only: once shown, a node stays on screen until the run ends (never removed mid-run). | ✅ Met | `mergeProgressNodes` accumulates into a `Map<string, ProgressNode>` that only adds/updates — never deletes. `loadStateEvents` calls `mergeProgressNodes(progressNodes, progressEvents)` which preserves previously-seen nodes even if the latest `state.json` fetch omits them. Test: "keeps a previously-shown node on screen when new state-change arrives without it" verifies this. |
| 3 | Layered debounce: a node that goes running→done within one render tick still shows a brief ✓ (~400ms dwell) rather than vanishing; rapid event bursts (10 in <30ms) coalesce into one render. | ✅ Met | **Both halves now implemented.** The ~30ms coalescing is fully implemented and tested ("coalesces a rapid burst of 10 state-change events into one render"). The ~400ms minimum dwell is now implemented via `createDwellManager(DWELL_MS, onExpire)` — a pure timer that holds the displayed status as "running" for 400ms on an observed running→terminal transition. The component test "holds the spinner for ~400ms on a fast running->done transition, then shows check" is a REAL dwell test: it uses fake timers, mounts the component with a running node, dispatches a done event, advances time to verify the spinner is still visible at ~380ms past observation, then advances 2ms more and asserts ✓ appears. This is not a mount-already-done test. The unit test "holds a node in running during a running->done transition for ~400ms" also directly tests the dwell manager's timer logic. The implementation is CLEAN: a plain `setTimeout(400)` started when the transition is observed at render time, with NO `requestAnimationFrame`, NO `scheduler` parameter, NO `Math.round(rafDelay/2)` buffer in production code (those were a test-tuned hack removed in commit `38913e30`). |
| 4 | `agent_log` events render as a chronological log list below the tree. | ✅ Met | `agentLogLines` accumulates `agent_log` messages in chronological order. The template renders them in a `[data-agent-log]` section with `[data-log-line]` items below the tree. Test: "renders agent_log events as a chronological log list below the tree" verifies 3 log items in correct order. |
| 5 | On a terminal "done" event for the root fetch node, the view transitions to the digest view (existing render) after `digest.json` is present. | ✅ Met | `maybeTransitionToDigest()` checks `isRootDone(buildProgressTree(progressNodes))` and if true, fetches `/api/digest`; if the digest is available, it sets `digest`, clears `loading`, and sets `fetchMode = false`. Tests: "transitions to the digest view when the root node is done and digest.json exists" and "stays in fetch mode if root is done but digest.json is not yet present". |
| 6 | The existing digest view (queue/reviews/capacity/actions) is unchanged. | ✅ Met | The existing `{:else if digest}` template block is untouched. Only 2 lines were removed from the existing code (a comment and a cleanup return), both replaced with expanded versions. The action_click flow, tab system, and all digest rendering functions are unchanged. |

### Slice-2 and slice-3 residual risks — honored?

1. **`digest-types.ts` updated to mirror `state.ts` union** — ✅ Honored. `ProgressPayload` and `AgentLogPayload` interfaces added to `digest-types.ts`, and the `StateEvent.type` union now includes `"progress" | "agent_log"`. The `payload` union includes `ProgressPayload | AgentLogPayload`. The shapes match `state.ts` exactly (`id, label, parentId?, status, startedAt, endedAt?, kind` and `message: string`).
2. **View re-fetches `state.json` on connect** — ✅ Honored. `void loadStateEvents()` is called inside the `$effect` that creates the `EventSource`, right after `source.onerror`. Comment explicitly cites the residual risk: "Re-fetch state.json on connect (the watcher may have missed the file if it was absent at SSE-connect time)."
3. **View re-fetches `state.json` on each `state-change`** — ✅ Honored. `source.addEventListener("state-change", () => { stateDebounce.trigger(); })` fires on each `state-change` SSE event, debounced at ~30ms, then calls `loadStateEvents()` which fetches `/api/state`.
4. **Empty/absent tree handled gracefully** — ✅ Honored. When `state.json` has no progress events, `fetchMode` stays `false` (only set `true` when `progressEvents.length > 0 || logEvents.length > 0`). The tree template shows "Preparing…" when `tree.length === 0`. Tests: "shows a neutral ready state when state.json has no progress events" and "handles an absent state.json gracefully (fetch returns empty)" verify no crash.

### Task doc update needed?
**Yes.** The task doc's `## Implementation notes` section has no entry for slice 4. The following should be appended:

```
### slice: 4-svelte-tree-view (landed)

- New "fetch display mode" in `Digest.svelte`: when `progress` events arrive, renders a nested tree (spinner→✓→✕ via `effectiveStatus` + dwell `displayStatus`) and an `agent_log` log list below it. Transitions to the existing digest view when the root node is terminal (done) and `digest.json` is present.
- New `progressTree.ts` module (232 lines) with pure helpers: `extractProgressEvents`, `extractAgentLogEvents`, `mergeProgressNodes` (append-only by id), `buildProgressTree` (nests by `parentId`), `effectiveStatus` (deferCloseForChildren: parent stays "running" while children run, "error" if any child errored), `createDebounce` (~30ms coalescing), `createDwellManager` (~400ms minimum dwell on running→terminal), `isRootDone`.
- `createDwellManager` uses a plain `setTimeout(DWELL_MS)` started when the running→terminal transition is observed at render time. An optional `onExpire` callback bumps a reactive `dwellVersion = $state(0)` counter in `Digest.svelte` so the component re-renders when the dwell timer fires. No `requestAnimationFrame`, no `scheduler` parameter, no test-tuned buffers.
- `digest-types.ts` updated: `ProgressPayload` + `AgentLogPayload` added, `StateEvent.type` union now includes `"progress" | "agent_log"` (mirrors `state.ts`).
- SSE: `EventSource("/events")` now listens for named events "change" (digest.json) and "state-change" (state.json). On connect, re-fetches `/api/state` (residual risk from slice 2: watcher may swallow ENOENT). On `state-change`, debounces ~30ms then re-fetches `/api/state`.
- Tests: 198 pass across 19 files (was 159/17, +39 tests, +2 new files: `DigestTree.test.ts` 637 lines, `progressTree.test.ts` 329 lines). `Digest.test.ts` and `real-data-load.test.ts` adapted for named SSE events. typecheck clean.
```

### User attention needed?
**No.** All 6 acceptance criteria are met, including the ~400ms minimum dwell (criterion #3) that was missing in the first implementation pass. The dwell implementation is clean: a plain `setTimeout(400)` with no test-tuned magic numbers in production code. All residual risks from slices 2+3 are honored. No scope changed, no API surfaces differ from the spec.

DEVIATION: CLEAN

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "The implementation does not widen scope. All changes are within slice 4's scope: Digest.svelte (fetch display mode view + dwell wiring), digest-types.ts (type union update — residual risk from slice 2), progressTree.ts (new pure helper module including createDwellManager), dist rebuilds, and test files. No changes to server.ts, state.ts, listener.ts, index.ts, or the scheduler. The ~400ms dwell is now fully implemented with a clean plain setTimeout(400) — no requestAnimationFrame, no scheduler parameter, no Math.round(rafDelay/2) buffer in production code (confirmed via grep — zero matches). The onExpire callback and reactive dwellVersion $state counter are necessary in-scope additions for Svelte reactivity. All 6 acceptance criteria met."
    }
  ],
  "changedFiles": [
    ".pi/extensions/digest-dashboard/Digest.svelte",
    ".pi/extensions/digest-dashboard/digest-types.ts",
    ".pi/extensions/digest-dashboard/progressTree.ts",
    ".pi/extensions/digest-dashboard/dist/app.js",
    ".pi/extensions/digest-dashboard/dist/app.css",
    ".pi/extensions/digest-dashboard/dist/server.mjs",
    "test/digest-dashboard/Digest.test.ts",
    "test/digest-dashboard/DigestTree.test.ts",
    "test/digest-dashboard/progressTree.test.ts",
    "test/digest-dashboard/real-data-load.test.ts"
  ],
  "testsAddedOrUpdated": [
    "test/digest-dashboard/DigestTree.test.ts (new, 637 lines — tree rendering, append-only, layered debounce incl. real dwell test with fake timers, deferCloseForChildren, agent log, transition, empty/absent tree)",
    "test/digest-dashboard/progressTree.test.ts (new, 329 lines — extract, merge append-only, build tree, effectiveStatus, debounce, createDwellManager unit tests, isRootDone)",
    "test/digest-dashboard/Digest.test.ts (modified — FakeEventSource addEventListener support, fetch mock adapted for /api/state)",
    "test/digest-dashboard/real-data-load.test.ts (modified — FakeEventSource addEventListener support)"
  ],
  "commandsRun": [
    {
      "command": "npx vitest run --config vitest.config.ts",
      "result": "passed",
      "summary": "198 tests pass across 19 files (was 159/17, +39 tests, +2 new files)"
    },
    {
      "command": "cd scripts && npm run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit clean, no errors"
    },
    {
      "command": "cd .pi/extensions/digest-dashboard && npm run build",
      "result": "passed",
      "summary": "vite build + esbuild: app.css/app.js/server.mjs emitted, server.mjs 9.8kb"
    },
    {
      "command": "git diff --stat main..slice/4-svelte-tree-view -- .pi/extensions/digest-dashboard/server.ts .pi/extensions/digest-dashboard/state.ts .pi/extensions/digest-dashboard/listener.ts .pi/extensions/digest-dashboard/index.ts",
      "result": "passed",
      "summary": "Zero diff — server.ts, state.ts, listener.ts, index.ts all untouched (did NOT reimplement SSE endpoint, action_click, or digest render path)"
    },
    {
      "command": "grep -rn 'requestAnimationFrame\\|rafDelay\\|Math\\.round.*raf\\|scheduler' .pi/extensions/digest-dashboard/Digest.svelte .pi/extensions/digest-dashboard/progressTree.ts",
      "result": "passed",
      "summary": "Zero matches — no test-tuned magic numbers in production code (rAF/scheduler/buffer hack was removed in cleanup commit 38913e30)"
    },
    {
      "command": "git diff --stat main..slice/4-svelte-tree-view",
      "result": "passed",
      "summary": "10 files changed, +2730/-547 lines. Source: Digest.svelte (+201), digest-types.ts (+22), progressTree.ts (+232 new), dist rebuilds, 4 test files. No out-of-scope source files."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "Empty — no staged files"
    }
  ],
  "validationOutput": [
    "vitest: 19 files, 198 tests, all passed, 0 failed",
    "typecheck: clean (tsc --noEmit, 0 errors)",
    "build: vite + esbuild succeeded, dist/server.mjs 9.8kb",
    "server.ts/state.ts/listener.ts/index.ts: zero diff (not reimplemented)",
    "digest-types.ts: ProgressPayload + AgentLogPayload added, StateEvent.type union updated (residual risk honored)",
    "SSE connect: void loadStateEvents() called on EventSource connect (residual risk honored)",
    "SSE state-change: addEventListener('state-change', stateDebounce.trigger) with ~30ms coalesce (residual risk honored)",
    "Empty/absent tree: fetchMode stays false, tree shows 'Preparing…' (residual risk honored)",
    "dwell: plain setTimeout(400) at render-observation time, onExpire -> reactive dwellVersion counter, no rAF/scheduler/buffer in production (CLEAN)",
    "dwell test: REAL test with fake timers (running->done transition, spinner holds ~400ms, then ✓) — not a mount-already-done test",
    "DEVIATION: CLEAN — all 6 acceptance criteria met including the ~400ms dwell"
  ],
  "residualRisks": [
    "dist/server.mjs rebuild includes slice 2's state.json watcher code that was in server.ts but not previously built into dist — this is correct but means the dist and source were out of sync before this slice.",
    "No automated browser-visual-qa at desktop/tablet/mobile widths (test plan lists it as manual).",
    "The dwell test timing boundary (spinner at ~380ms, ✓ at ~401ms from observation) is sensitive to the 30ms debounce window — if the debounce delay changes, the test's advance-by values may need adjustment. This is a test concern, not a production-code concern."
  ],
  "noStagedFiles": true,
  "diffSummary": "Slice 4 adds a fetch-display-mode view to Digest.svelte (nested progress tree with spinner→✓→✕, agent_log list, transition to digest view on root done + digest.json present), a new progressTree.ts module with pure testable helpers including createDwellManager (~400ms minimum dwell on running→terminal, plain setTimeout, onExpire callback for Svelte reactivity), updates digest-types.ts to mirror state.ts's ProgressPayload/AgentLogPayload, rebuilds dist bundles, and adds 39 new tests across 2 new files + 2 adapted existing test files. All 6 acceptance criteria met. No test-tuned magic numbers in production code.",
  "reviewFindings": [
    "no blockers — implementation faithfully matches the arch spec and slice doc; all 6 acceptance criteria met including the ~400ms dwell; no out-of-scope reimplementations; no test-tuned magic numbers in production code"
  ],
  "manualNotes": "This is a re-check deviation report after the dwell fix + cleanup. The original deviation report found the ~400ms minimum dwell was not implemented (criterion #3, second half). It is NOW implemented with a clean plain setTimeout(400) started at render-observation time, a reactive dwellVersion $state counter for Svelte re-render on expiry, and a REAL test with fake timers that verifies a running→done transition holds the spinner ~400ms. The earlier test-tuned rAF/scheduler/Math.round(rafDelay/2) hack was removed in cleanup commit 38913e30. Pre-existing untracked files in git status (extensions/aura-tasks.ts, aura-health.test.ts, docs/tasks/add-capacity-subcommands/, docs/tasks/generic-openapi-cli-wrapper/) are unrelated to slice 4."
}
```
