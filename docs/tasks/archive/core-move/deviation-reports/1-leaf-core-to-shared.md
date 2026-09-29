## Deviation report — 1-leaf-core-to-shared

### API surface changes

- **Planned:** Six leaf modules move to `packages/shared/src/digest/` with
  explicit `@pi-aura/shared/digest/*` export subpaths in `package.json`.
  Public exports of each module unchanged.
- **Actual:** Exactly as planned. The six modules
  (`scheduler`, `progress-emitter`, `build-actions`, `write-dashboard-digest`,
  `types`, `settings`) moved verbatim (git rename, 0 content changes). Six
  explicit subpaths added to `packages/shared/package.json` `exports` —
  matching the spec's list exactly. The `./*` catch-all is preserved. All
  public exports in every module are byte-identical to the originals (verified
  by `grep ^export`).
- **Impact:** None on dependent slices. The interface contract for slice 2
  is fully met: `@pi-aura/shared/digest/scheduler` exports `runTasks` + types,
  `@pi-aura/shared/digest/progress-emitter` exports `readDashboardUrl` +
  `createProgressEmitter`, etc. Slice 2 can proceed.

### Abstraction usage

- **Used/was specified: yes.**
  - `types.ts` retains its `@pi-aura/shared/aura-client` import (package-relative,
    unchanged). ✅
  - `build-actions.ts` retains its `./types.js` relative import — now an
    intra-shared-package relative import (`packages/shared/src/digest/types.ts`).
    The spec said to preserve the moved file's existing import style; the file
    used `./types.js` and that was kept. ✅
  - `scheduler.ts`, `progress-emitter.ts`, `settings.ts`,
    `write-dashboard-digest.ts` have only `node:` built-in imports — no
    re-pointing needed. ✅
  - `scripts/src/aura-digest.ts` re-points all six leaf imports from `./x.js`
    to `@pi-aura/shared/digest/x` (no-extension form, matching
    `@pi-aura/shared/keyring` convention). ✅
  - `scripts/src/devlinks.ts` re-points `./types.js` →
    `@pi-aura/shared/digest/types` and `./settings.js` →
    `@pi-aura/shared/digest/settings`. ✅ (devlinks moves in slice 2, but its
    type-only imports to the moved leaves needed re-pointing now since the
    source files are gone.)
  - `scripts/src/followup-working-on.test.ts` re-points `./types.ts` →
    `@pi-aura/shared/digest/types`. ✅
  - No logic was reimplemented. All six source files moved verbatim (git
    rename, similarity 100%).

### Out-of-scope changes

- **Only the 6 leaves moved** — `aura-digest.ts`, `devlinks`, `clients`,
  `mcp-client`, `bitbucket` remain in `scripts/src/`. ✅ Correct scope.
- **Extension untouched** — no files under `.pi/extensions/digest-dashboard/`
  changed. The `readDashboardUrl` duplicate and `joinUrl` remain (slice 3
  scope). ✅
- **esbuild config untouched** — `scripts/esbuild.config.mjs` unchanged. ✅
- **`scripts/src/keyring.ts` stays** — as the spec noted, it's only dropped if
  confirmed to be a pure re-export; it was left in place. ✅
- **`aura.ts` and `engineering-sync.ts` untouched** — no regressions. ✅

**One out-of-scope-but-necessary change (not a deviation):**
- `vitest.config.ts` was updated: the `include` list dropped the two vitest
  entries `scripts/src/scheduler.test.ts` and
  `scripts/src/aura-digest-progress.test.ts` (the files moved to the shared
  package). The include now is just `["test/**/*.test.ts"]`. This is necessary
  housekeeping: without it, vitest would fail to find the deleted paths. Not a
  scope violation — it's the mechanical consequence of the move.

**Test framework migration (a notable change, within scope of the move):**
- Two test files (`scheduler.test.ts`, `aura-digest-progress.test.ts`) were
  converted from vitest (`describe/it/expect` + `vi.fn`/`vi.useFakeTimers`) to
  `node:test` + `node:assert/strict` to match the shared package's `tsx --test`
  convention. The assertions are semantically equivalent (e.g.
  `expect(x).toBe(y)` → `assert.equal(x, y)`, `expect(x).rejects.toThrow()` →
  `assert.rejects(x, /regex/)`). The `aura-digest-progress.test.ts` batching
  test replaced vitest fake timers with a real `batchMs: 1` + `setTimeout(50)`
  wait — a different timing approach that is slightly less deterministic but
  functionally equivalent. The other two test files
  (`build-actions.test.ts`, `write-dashboard-digest.test.ts`) were already
  `node:test`-based; only their import paths were re-pointed.
- This is consistent with the slice doc's requirement that moved tests "pass
  under `tsx --test`" — the shared package uses `tsx --test`, not vitest.
- The `write-dashboard-digest.test.ts` had one small type fix: `baseDir`
  widened from `string` to `string | undefined` (the variable is assigned in
  a `try` block and used after — the type widening is a correctness fix for
  `tsc --noEmit` under the shared tsconfig's `strict` mode).

**Bundle rebuild (expected):**
- `skills/core/aura-digest/dist/aura-digest.mjs` was rebuilt. The diff is
  purely esbuild source-path comments changing from `// src/scheduler.ts` to
  `// ../packages/shared/src/digest/scheduler.ts` — no logic change in the
  bundle. The bundle is a committed build artifact so this is expected.

### Task doc update needed?

**No.** The implementation matches the arch spec and slice doc. The only
items worth noting in `## Implementation notes` (for the land-worker to append)
are:
- vitest.config.ts was trimmed (removed two moved-test paths).
- Two test files migrated from vitest to node:test to match shared-package
  convention.
- The vitest suite count dropped from 20 files / 210 tests to 18 files / 177
  tests (35 tests now run under `packages/shared` `tsx --test` instead).

### User attention needed?

**No.** No API surfaces differ from the spec. Scope did not drift. The test
framework migration and vitest.config.ts trim are mechanical consequences of
the move, not scope changes. The leaf module exports, export subpaths, and
import conventions all match the arch spec exactly.
