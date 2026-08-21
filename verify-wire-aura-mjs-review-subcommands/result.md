# Verification: wire-aura-mjs-review-subcommands

**Slice verified — lint gate N/A (no linter configured), typecheck clean, full test suite green.**

## Quality gate

1. **Lint** — No linter is configured for this repo. Root `package.json` and `scripts/package.json` have no eslint/prettier/biome scripts or config files. Per `docs/testing.md`, the static gate for `scripts/` is `tsc --noEmit` (typecheck). Skipped as N/A.

2. **Slice test command** — The slice doc's test plan is typecheck + build + bundle grep (no test runner in `scripts/`, confirmed by `docs/testing.md`).

3. **Full project test suite** — `packages/shared` is the only test runner (`tsx --test`). **23/23 tests pass** (3 suites, 0 fail).

## Commands run

| Command | Result |
|---|---|
| `cd scripts && npm run typecheck` | ✅ green (exit 0) |
| `cd scripts && npm run build` | ✅ green (exit 0) |
| `grep 'case "review-X"' dist/aura.mjs` (all 6) | ✅ all present |
| `cd packages/shared && npm test` | ✅ 23/23 pass |

## Bundle grep

All 6 subcommands present in `skills/aura/dist/aura.mjs`:
- `review-get` ✅
- `review-approvals` ✅
- `review-request` ✅
- `review-start` ✅
- `review-decide` ✅
- `review-reopen` ✅

(The slice doc's own grep targeted `review-get`/`review-decide`/`review-reopen`; I verified all 6 case branches in the bundle.)

## Acceptance criteria check

- ✅ All 6 `review-*` subcommands dispatched under existing `artifact` group, each calling the `AuraClient` verb via the client constructed once at `main()` (line 406, `createDefaultAuraClient()`).
- ✅ Arg parsing matches: `--version` validated with `Number.isFinite`, `--roles`/`--user-ids` via `parseCsv` (comma→trimmed array), `--deadline` optional, `--decision` validated APPROVED|REJECTED case-insensitively (`.toUpperCase()`).
- ✅ Missing required flags → `fail(..., true)` → exit 2 (usage); missing `<id>` same. Verb errors propagate to top-level catch → exit 1.
- ✅ `USAGE` lists all 6 subcommands (lines 48–53).
- ✅ Diff purely additive: `git diff HEAD~1 HEAD` on `scripts/src/aura.ts` shows 0 deleted lines (527 insertions total across the 3 files).
- ✅ Committed on `slice/wire-aura-mjs-review-subcommands`.

## Divergence note (verified consistent)

`review-reopen` requires `--version` — this matches slice 1's widened `reopenArtifactReview(id, version)` signature and the REST contract (required `version` in the reopen request body). The USAGE string reflects `artifact review-reopen <id> --version V`. Documented as intentional; doc example update is deferred to the dependent slice per stated constraints. Not a blocker.

## Git state

- No staged files (`git diff --cached` empty).
- 4 untracked `result.md` files belong to sibling worker runs (`land-*`, `tdd-*`, `verify-*`), not part of this slice's code.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Diff is purely additive (527 insertions, 0 deletions across scripts/src/aura.ts and the two rebuilt bundles). Only the 6 artifact review-* subcommands and their USAGE entries were added; existing artifact get/update/create/section/cleanup + wiki + upload subcommands untouched. No scope widening."
    }
  ],
  "changedFiles": [
    "scripts/src/aura.ts",
    "skills/aura/dist/aura.mjs",
    "skills/aura-digest/dist/aura-digest.mjs"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {"command": "cd scripts && npm run typecheck", "result": "passed", "summary": "tsc --noEmit clean"},
    {"command": "cd scripts && npm run build", "result": "passed", "summary": "esbuild rebuilt aura.mjs + aura-digest.mjs"},
    {"command": "grep all 6 review-* case branches in skills/aura/dist/aura.mjs", "result": "passed", "summary": "review-get/approvals/request/start/decide/reopen all present"},
    {"command": "cd packages/shared && npm test", "result": "passed", "summary": "23/23 tests pass (full project suite)"}
  ],
  "validationOutput": [
    "typecheck exit 0; build exit 0; all 6 review-* case branches present in bundle; 23/23 shared tests pass; no lint configured (N/A per docs/testing.md)"
  ],
  "residualRisks": [
    "None. review-reopen requiring --version is an intentional, documented divergence (REST contract requires version in reopen body)."
  ],
  "noStagedFiles": true,
  "diffSummary": "Adds 6 artifact review-* subcommands to scripts/src/aura.ts (147 lines) wired to AuraClient verbs via the client created once in main(); updates USAGE; rebuilds both bundles. Purely additive.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "No linter is configured anywhere in the repo (no eslint/prettier/biome config or scripts), so the lint gate is N/A and typecheck (tsc --noEmit) is the static gate per docs/testing.md. Slice doc's own grep named only 3 subcommands; I verified all 6 case branches in the bundle."
}
```
