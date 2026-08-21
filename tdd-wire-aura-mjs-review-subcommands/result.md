# Slice: wire-aura-mjs-review-subcommands

## Summary

Wired the 6 `artifact review-*` subcommands into `scripts/src/aura.ts` under the
existing `artifact` group. Each subcommand calls the corresponding `AuraClient`
verb (landed in slice 1) via `createDefaultAuraClient()`, mirroring how the
existing `artifact get`/`wiki` subcommands build the client.

## Acceptance criteria

- ✅ `aura.ts` dispatches all 6 subcommands under the existing `artifact` group,
  using `createDefaultAuraClient()` (same client construction as the other
  subcommands — the client is created once at the top of `main()` and passed to
  each handler, exactly like the existing pattern).
- ✅ Arg parsing: `--version` (number, validated with `Number.isFinite`),
  `--roles` (comma→array via `parseCsv`), `--user-ids` (comma→array),
  `--deadline` (string, optional), `--decision` (validated APPROVED|REJECTED,
  case-insensitive). Missing required flags → `fail()` usage error exit 2.
- ✅ Each prints a compact human-readable summary to stdout; errors to stderr
  + exit 1 via the existing top-level catch in `main()`.
- ✅ `USAGE` updated to list the 6 new subcommands.
- ✅ Existing artifact get/update/create/section/cleanup + wiki + upload
  subcommands untouched (diff is purely additive).
- ✅ `cd scripts && npm run typecheck && npm run build` green; the built
  `dist/aura.mjs` contains all 6 `review-*` case branches (grep verified).
- ✅ Committed on `slice/wire-aura-mjs-review-subcommands` branch.

## Divergence from plan

- **`review-reopen` requires `--version`:** The slice doc's subcommand table
  listed `artifact review-reopen <id>` (only `id`). However, slice 1 widened the
  `reopenArtifactReview` signature to `reopenArtifactReview(id, version)` to
  match the actual REST contract (`POST /artifacts/{id}/review-reopen` has a
  **required** requestBody `ArtifactReviewVersionRequest` with `version`
  required — the server needs the version to know which review run to reopen).
  This divergence was documented in the task.md implementation notes for slice 1.
  The `review-reopen` subcommand therefore requires `--version V`, and the USAGE
  string reflects this: `artifact review-reopen <id> --version V`. The salvaged
  doc example `artifact review-reopen <artifact-uuid>` should be updated to
  `artifact review-reopen <artifact-uuid> --version <version>` — but per the
  slice constraints, doc edits belong to the dependent task/slice (the slice
  says "prefer matching the doc's flag names" but this is a REST-contract
  requirement, not a naming choice).

## Test plan results

The scripts project has no test runner (`docs/testing.md` confirms: scripts =
`tsc --noEmit` + esbuild bundle, no test runner). The gate is typecheck + build +
bundle grep, per the slice doc's test plan.

- ✅ `npm run typecheck` — green
- ✅ `npm run build` — green, `dist/aura.mjs` rebuilt
- ✅ Bundle grep for `review-get`/`review-decide`/`review-reopen` — all present
- ✅ `packages/shared` `npm test` — 23 tests pass (slice 1's verbs, which this
  slice consumes)

## Notable events

- Wrote `review-reopen` with `--version` flag (slice 1 divergence documented in
  task.md — the REST contract requires `version` in the reopen request body).

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Added 6 review-* subcommands to scripts/src/aura.ts (additive only, no existing subcommands touched). typecheck + build green, bundle grep verified, shared tests pass."
    }
  ],
  "changedFiles": [
    "scripts/src/aura.ts",
    "skills/aura/dist/aura.mjs",
    "skills/aura-digest/dist/aura-digest.mjs"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "cd scripts && npm run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit passes, no errors"
    },
    {
      "command": "cd scripts && npm run build",
      "result": "passed",
      "summary": "esbuild bundle built aura.mjs + aura-digest.mjs"
    },
    {
      "command": "grep -o 'review-get' skills/aura/dist/aura.mjs",
      "result": "passed",
      "summary": "3 occurrences found in bundle"
    },
    {
      "command": "grep -o 'review-decide' skills/aura/dist/aura.mjs",
      "result": "passed",
      "summary": "7 occurrences found in bundle"
    },
    {
      "command": "grep -o 'review-reopen' skills/aura/dist/aura.mjs",
      "result": "passed",
      "summary": "6 occurrences found in bundle"
    },
    {
      "command": "cd packages/shared && npm test",
      "result": "passed",
      "summary": "23 tests pass, 0 fail (slice 1 review verbs consumed by this slice)"
    }
  ],
  "validationOutput": [
    "typecheck: green",
    "build: green, dist/aura.mjs rebuilt",
    "bundle grep: review-get=3, review-decide=7, review-reopen=6, review-approvals=3, review-request=4, review-start=8",
    "shared tests: 23 pass, 0 fail"
  ],
  "residualRisks": [
    "review-reopen requires --version (REST contract); the salvaged doc example still shows 'artifact review-reopen <artifact-uuid>' without --version — doc update needed in a dependent slice"
  ],
  "noStagedFiles": true,
  "diffSummary": "Additive: 6 new review-* handler functions + parseCsv helper + 6 dispatch cases in artifact switch + 3 type imports + 6 USAGE lines. Existing artifact/wiki/upload subcommands untouched. dist/aura.mjs rebuilt.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "The scripts project has no test runner; gate is typecheck + build + bundle grep per docs/testing.md. review-reopen divergence from slice doc (--version required) is a REST-contract requirement documented in task.md slice 1 notes."
}
```
