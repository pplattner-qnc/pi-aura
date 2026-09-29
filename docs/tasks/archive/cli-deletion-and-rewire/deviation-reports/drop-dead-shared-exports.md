## Deviation report — drop-dead-shared-exports

### API surface changes
- **Planned:** Delete `progress-emitter.ts` (whole module), `write-dashboard-digest.ts`, and their tests (`aura-digest-progress.test.ts`, `write-dashboard-digest.test.ts`, `joinUrl-export.test.ts`). Remove `renderAction`/`saveAction`/`diffAction`/`cleanupAction`/`lastAction`/`USAGE`/`FailError`/`DASHBOARD_DIGEST_PATH`/`fail` from `aura-digest.ts`. Keep `fetchAction` + `saveLastDigest`. Drop the `./digest/progress-emitter` + `./digest/write-dashboard-digest` subpaths from `package.json` exports.
- **Actual:** Exactly as planned. All dead modules, tests, and exports removed. `aura-digest.ts` now exports only `fetchAction` + `saveLastDigest` (confirmed via grep — no other `^export` lines remain). The `package.json` exports map drops both removed subpaths. The `rmSync` import (used only by deleted `cleanupAction`) was correctly removed; `ApprovalDecision` and `DigestDiff` type imports (used only by deleted `render`/`diff` actions) were also cleaned. The `fail`/`FailError`/`USAGE`/`DASHBOARD_DIGEST_PATH` are all gone.
- **Impact:** None on dependent slices. `fetchAction` + `saveLastDigest` (the in-process tools' seam) are intact and unchanged. Slice 3 (skill-doc rewrite) is unblocked.

### Abstraction usage
- Used/was specified: **yes.** The slice correctly identified the CLI-only exports and removed only those. The `fetchAction` signature (`opts: { onProgress?, auraClient? } → {digest, report, raw}`) and `saveLastDigest(digest, lastDigestPath?)` are byte-identical to pre-slice. The `scheduler.ts` `fail` (a local variable inside `runTasks`, line 439) is a DIFFERENT `fail` — not the deleted digest-core `fail()` — and is correctly untouched. The `scripts/src/aura.ts` `USAGE` (line 49, the `aura` skill's own usage string) is a DIFFERENT const — correctly untouched.

### Out-of-scope changes
- **None.** The diff touches only `packages/shared/` (src + test + package.json). No changes to `.pi/extensions/` (the in-process tools), `skills/` (the skill doc — slice 3), `scripts/` (beyond what slice 1 already did), or the Svelte view. The `docs/tasks/state.yaml` change is a gitignored workflow artifact (task-tracking state), not a real code change.
- **Did NOT delete `fetchAction`/`saveLastDigest`** (correct — they're kept). **Did NOT touch the extension/tools** (correct). **Did NOT rewrite the skill doc** (correct — slice 3). **Did NOT delete `aura.ts` USAGE** (correct — different const).

### The fetchAction.test.ts stale comment
- **Updated.** The test "does not call readDashboardUrl or createProgressEmitter internally" (line 260) was renamed to "works without a dashboard server (no server-url.json needed)" and the comment body replaced — the old comment referenced the now-deleted `readDashboardUrl`/`createProgressEmitter` symbols; the new comment describes the pure-function semantics without naming dead symbols. The assertion logic is unchanged (still verifies `fetchAction` works without server wiring).

### New test file
- `packages/shared/test/digest/drop-dead-shared-exports.test.ts` (175 lines, 15 structural assertions): verifies the deleted modules/tests are gone, the dead exports are absent from `aura-digest.ts`, `fetchAction` + `saveLastDigest` still exist, `package.json` drops the removed subpaths, and no stale references to `createProgressEmitter`/`readDashboardUrl`/`writeDashboardDigest` remain. This is a well-scoped structural guard test.

### Task doc update needed?
**No.** The implementation matches the arch spec and slice doc exactly. The land-worker should note in `## Implementation notes`: progress-emitter.ts + write-dashboard-digest.ts + 3 tests deleted; 9 dead exports removed from aura-digest.ts; fetchAction + saveLastDigest kept; package.json exports trimmed; fetchAction.test.ts comment updated; new structural guard test added.

### User attention needed?
**No.** No API surfaces differ from the spec. `fetchAction` + `saveLastDigest` are intact (typecheck + tests pass). Scope did not drift — no extension/tool/skill-doc/scripts changes. The `scheduler.ts` `fail` and `aura.ts` `USAGE` are correctly identified as different symbols and left untouched.
