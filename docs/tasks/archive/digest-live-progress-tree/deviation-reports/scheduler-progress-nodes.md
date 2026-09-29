## Deviation report — scheduler-progress-nodes

### API surface changes
- **Planned:** `NodeHandle` (opaque token), `Progress` (`create`/`finish`/`setStatus`), revised `Ctx<S>` with `progress` + `node`, `TaskRef.node` replacing `progressParentId`, removal of `Kind.progress` + `ProgressRef`.
- **Actual:** All delivered exactly as specified.
  - `NodeHandle` — branded interface `{ readonly _nodeHandleBrand: true; readonly id: number }`. Opaque to callers; can't be forged without matching the brand. ✅
  - `Progress` — `{ create(parent?, label): NodeHandle; finish(node, opts?: { deferCloseForChildren?: boolean }): void; setStatus(node, ProgressStatus): void }`. ✅
  - `Ctx<S>` — adds `readonly progress: Progress` and `readonly node: NodeHandle | undefined`. ✅
  - `TaskRef` — `readonly node?: NodeHandle`, `progressParentId` absent. ✅
  - `Kind.progress(input)` and `ProgressRef` — entirely absent from the implementation (confirmed by grep). ✅
  - `ProgressEvent` — `id`/`parentId` are `string` projections of the internal numeric node ids (e.g. `"0"`, `"1"`). This matches the arch spec's "string projections" note. ✅
- **Impact:** No deviations from the planned API surface. Dependent slices (3, 4) can consume `ProgressEvent` and `Ctx.progress`/`ctx.node` as specified.

### Abstraction usage
- Used/was specified: **yes**. The implementation reuses the existing `keyOf`/`canonicalize` (dedup), `enqueue` (first-seen-wins + cap), `drainCompletions` (serialized reducer mutex), `fail`/`finish` (run lifecycle), `maxTasks`/`capSetBy`/`runWarnings` (runaway cap), and the `onProgress` hook — all unchanged from the committed `main` base. The node-tracking (`NodeRecord`, `createNode`, `transition`, `checkDeferred`, `makeProgress`, `makeCtx`, end-of-run sweep) is new internal state inside `runTasks`, not a separate module — exactly as the arch spec required ("new internal state in runTasks, not a separate module").
- Did NOT reimplement: `keyOf`/dedup, the reducer mutex, the runaway cap, `fail`/`finish`/`enqueue`. All confirmed present and unchanged. ✅

### Out-of-scope changes
- **None.** The diff is strictly `scripts/src/scheduler.ts` (+260/-14) and `scripts/src/scheduler.test.ts` (+394/-2). No dashboard, bundle, or other files touched. The only non-test source file is the scheduler, matching the slice scope ("pure scheduler + tests").

### Task doc update needed?
- **No.** All acceptance criteria from the slice doc are met (see detailed comparison below). No divergence to append to `## Implementation notes`.

### Detailed acceptance-criteria comparison

| Slice doc criterion | Met? | Evidence |
|---|---|---|
| `ctx.progress.create(parent?, label)` → opaque `NodeHandle`; `ctx.node` is root's own attachment (undefined for `start`) | ✅ | `makeProgress` returns `createNode(...)`; `makeCtx(ref.kind, ref.node)` threads `ref.node` (undefined for root). Test: "ctx.progress.create fires a running event; ctx.node is undefined for root". |
| Node stays on screen until end of run — never removed | ✅ | No removal code exists; `transition` only changes status. Test: "nodes are append-only: never removed mid-run" asserts same `id` across all events. |
| `finish(node)` (no flag) → done right now; node stays visible | ✅ | `transition(node.id, "done")`. Test: "finish(node) marks node done right now; node stays (not removed)". |
| `finish(node, { deferCloseForChildren: true })` → does nothing now; flag set; parent resolves when all children terminal (done iff all done, error if any error); no children → done immediately | ✅ | `rec.deferCloseForChildren = true; if (rec.children.size === 0) transition(done) else checkDeferred(id)`. `checkDeferred` iterates `parent.children`, checks allTerminal + anyError, cascades via `transition` → `checkDeferred`. Tests: "deferred-empty", "deferred parent stays running until all child-nodes close", "deferred parent becomes error when any child-node errors". |
| Children dynamic (attached after finish still count) | ✅ | `createNode` adds to `parent.children` at creation time; `checkDeferred` iterates the live `Set`. Test: "deferred parent: child-node attached AFTER the finish still counts (dynamic)". |
| `setStatus(node, "running"|"done"|"error")` mutates directly | ✅ | `transition(node.id, status)`. Test: "setStatus mutates a node's status directly". |
| `TaskRef.node` threads to child as `ctx.node` | ✅ | `makeCtx(ref.kind, ref.node)`; test: "TaskRef.node threads to the child as ctx.node". |
| End of run: still-"running" node → "error"; no per-task auto-close; no close-on-throw | ✅ | End-of-run sweep: `checkDeferred` then `transition(id, "error")` for remaining running nodes. The `.catch` handler in the pump has no node-close code (comment: "no per-task auto-close of nodes happens here"). Tests: "a node never finished → end-of-run sweep marks it error", "a task that throws does NOT trigger per-task node auto-close". |
| `onProgress` fires for every transition; serialized with drain | ✅ | `emit` is called inside `transition`, which is synchronous and called from the drain or from `createNode` (synchronous). Test: "onProgress fires for every status transition" (running→error→done = 3 events). |
| Existing guarantees hold (mutex, cap, loud failures, graceful degradation); all pre-existing tests pass | ✅ | All 7 original scheduler tests pass unchanged; full suite 141/141 green; `tsc --noEmit` clean. |

### Residual risks
- **`ProgressEvent.id` is a stringified number** (`String(nodeId)`). Slice 4 (Svelte) must not assume numeric ordering from `id` — it should use the `parentId` string for nesting. The arch spec flagged this as a "string projection." Low risk if slice 4 reads `parentId` for tree structure, not `id` for ordering.
- **`NodeHandle.id` is exposed as `readonly id: number`** (not fully opaque — a determined caller could read it). The `_nodeHandleBrand` marker prevents accidental construction but not intentional field access. This is acceptable per the arch spec ("branded string or object") but worth noting for slice 3, which must not forge handles.
- **`onProgress` is called synchronously inside `transition`/`createNode`**, which are called from the serialized drain (for `finish`/`setStatus` via `transition`) and from the pump (for `create` via `createNode` inside `run`). Since `run` is async and `create` happens during `run`'s synchronous portion, an `onProgress` callback that throws would propagate into `run` and be caught by the `.catch` (graceful degradation). This is safe but the hook must be side-effect-only (no throwing). Low risk.
