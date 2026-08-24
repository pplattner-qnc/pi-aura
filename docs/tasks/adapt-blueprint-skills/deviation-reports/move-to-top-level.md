## Deviation report — move-to-top-level

### API surface changes
- **Planned:** Move 14 `SKILL.md` + 4 `task-untangle` `.ts` companions from `resources/blueprint/skills/<name>/` to top-level `skills/engineering-workflow/<name>/`; update drift manifest `localPath` entries, `blueprintPathToLocal` in the sync utility, the `engineering-workflow` router, and the sync skill's wiki-dir→repo-dir table + checklist paths.
- **Actual:** All planned changes implemented exactly as specified. No API surface changes beyond what was planned.
- **Impact:** None on dependent slices — this is the final slice of the task.

### File moves
- **14 SKILL.md moved:** ✅ All 14 confirmed at top-level (`skills/engineering-workflow/<name>/SKILL.md`). `find` yields exactly 15 `SKILL.md` (router + 14 sub-skills) outside `resources/`.
- **4 task-untangle `.ts` companions moved:** ✅ `bundle.ts`, `check-bundle.ts`, `serve-plans.ts`, `views.ts` all at `skills/engineering-workflow/task-untangle/`.
- **14 `.gitkeep` files deleted:** ✅ The old `resources/blueprint/skills/` directory tree was removed (including the `.gitkeep` files that kept the empty dirs in git). No stale `.gitkeep` remains.
- **`resources/blueprint/manifest.yaml` stays:** ✅ Not moved — it is reference material.
- **Content preserved:** ✅ `sha256sum` of `task-refine/SKILL.md` and all 4 `.ts` companions are byte-identical to their pre-move state (verified against commit `18952b7` for the SKILL.md and `473417a` for the `.ts` files). `git mv` preserved all bytes.

### Drift manifest (`.pi/engineering-foundation.json`)
- **14 SKILL.md `localPath` updated:** ✅ All 14 changed from `skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md` to `skills/engineering-workflow/<name>/SKILL.md`.
- **4 `.ts` companion `localPath` updated:** ✅ All 4 changed to `skills/engineering-workflow/task-untangle/<file>.ts`.
- **Zero entries left at old path:** ✅ `grep` confirms no `localPath` starts with `skills/engineering-workflow/resources/blueprint/skills/`.
- **Each `localPath` file exists on disk:** ✅ Verified programmatically.
- **Hash fields unchanged:** ✅ `sourceSha256`, `adaptedSha256`, `auraChecksumOrVersion`, `auraUpdatedAt` are all identical to the seed commit (`473417a`) for every blueprint-skill entry.
- **Minor JSON encoding change (cosmetic):** The `tracker-aura` entry's `ignoreReason` field changed from a literal `→` (U+2192) to `\u2192` escape. This is a JSON serialization difference (likely from `JSON.stringify` vs the original hand-formatted JSON), not a semantic change — the string content is identical. No impact.

### Sync utility (`scripts/src/engineering-sync.ts`)
- **`blueprintPathToLocal` skills branch → top-level:** ✅ Added `if (under.startsWith("skills/"))` branch that maps to `skills/engineering-workflow/<name>/<file>` (stripping the `skills/` prefix from the dir). The `dir.replace(/^skills\//, "")` correctly strips `skills/` from paths like `skills/task-untangle`.
- **Rules branch unchanged:** ✅ Still maps to `resources/rules/`.
- **Manifest + other reference material unchanged:** ✅ Falls through to `return join("skills/engineering-workflow/resources/blueprint", under)` — manifest maps to `resources/blueprint/manifest.yaml`.
- **JSDoc comment updated:** ✅ Expanded from a single "Rules are an exception" note to a structured 4-item "Layout exceptions" list documenting rules, skills, manifest, and other files.
- **Dist rebuilt:** ✅ `.pi/skills/engineering-sync/dist/engineering-sync.mjs` reflects the new path mapping (verified via diff).
- **`wikiNodeToLocalPath` not touched:** ✅ As specified, only `blueprintPathToLocal` was changed.

### `engineering-workflow` router (`skills/engineering-workflow/SKILL.md`)
- **Table row updated:** ✅ `resources/blueprint/skills/<name>/SKILL.md` → `<name>/SKILL.md`.
- **"Blueprint skills are pi-adapted" section updated:** ✅ Changed from "The 14 `SKILL.md` files under `resources/blueprint/skills/<name>/` are the pi-adapted versions" to "The 14 `SKILL.md` files under `<name>/SKILL.md` are invokable pi sub-skills discovered recursively under `skills/engineering-workflow/`. They are the pi-adapted versions". Framing changed from reference material to invokable sub-skills. Adaptation description (AskQuestion→…, SwitchMode→…, etc.) kept verbatim.
- **Unaffected `resources/` rows:** ✅ INDEX, Log, workflow, guides, manifest, rules rows all unchanged.

### Sync skill (`.pi/skills/engineering-sync/SKILL.md`)
- **wiki-dir→repo-dir table (~line 155):** ✅ `blueprint/skills/<name>/SKILL.md` row updated to `skills/engineering-workflow/<name>/SKILL.md`.
- **Verification checklist paths:** ✅ `blueprint/skills/<name>/SKILL.md` → `<name>/SKILL.md` in the "Placement vs the consumer" checklist item.
- **Manifest example JSON:** ✅ The `localPath` in the example manifest entry updated from `resources/blueprint/skills/ai-setup/SKILL.md` to `skills/engineering-workflow/ai-setup/SKILL.md`.
- **No stale `resources/blueprint/skills` references:** ✅ `grep` confirms zero remaining occurrences.

### Sync test (`scripts/src/engineering-sync.test.ts`)
- **Not changed:** ✅ `git diff 473417a..HEAD` shows zero changes to this file. The tests use generic paths (`/x/skills/ai-setup/SKILL.md` for `suffixed`, `resources/rules/...` for tombstone tests) that don't pin the blueprint-skills location, so no test update was needed — exactly as the spec predicted.

### Abstraction usage
- Used/was specified: yes — `git mv` for file moves (preserves history), direct JSON `localPath` string edits for the manifest, targeted `blueprintPathToLocal` branch addition for the sync utility. No new abstractions introduced.

### Out-of-scope changes
- None. All changes are within the planned scope: file moves, manifest path updates, sync utility code, router prose, sync skill prose, dist rebuild. The only unstaged change is `docs/tasks/adapt-blueprint-skills/slices/archive/1-edge-fixes.md` (status: `ready` → `done`), which is the slice-1 land-worker's leftover — not a slice-2 change.

### Test results
- **`cd scripts && npm run typecheck`:** ✅ passed (zero errors)
- **`node .pi/skills/engineering-sync/dist/engineering-sync.mjs status`:** ✅ passed — "manifest: 44 entries (verbatim 5, adapted 37, authored 1, ignored 1)", no unresolved three-way files
- **`cd packages/shared && npm test`:** ✅ passed (30 tests, 0 failures)
- **`node --experimental-strip-types scripts/src/engineering-sync.test.ts`:** ❌ failed — **pre-existing module resolution issue** (cannot resolve `packages/shared/src/hey-api-aura-client.js`). This failure is identical on the seed commit `473417a` (verified by checkout), so it is NOT caused by this slice. The test requires the `@pi-aura/shared` package to be built as ESM, and there is no build script for it.
- **Path mapping verification:** ✅ `blueprintPathToLocal` tested with 4 cases (SKILL.md, .ts companion, rules, manifest) — all produce the correct top-level / `resources/rules/` / `resources/blueprint/` paths.

### Task doc update needed?
No. The implementation matches the spec exactly. No `## Implementation notes` update is required.

### User attention needed?
No. The scope and API surfaces match the spec. The one test failure (`engineering-sync.test.ts`) is pre-existing and unrelated to this slice.
