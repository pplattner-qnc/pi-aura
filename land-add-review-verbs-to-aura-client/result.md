# Land: add-review-verbs-to-aura-client

## Outcome

Slice `add-review-verbs-to-aura-client` landed onto `task/aura-mcp-doc-salvage`.
Slice branch deleted; slice doc archived; implementation note appended to task
doc; archived slice + state.yaml marked done/open. NOT the last slice (slices
2 `wire-aura-mjs-review-subcommands` and 3 `verify-and-build` remain `todo`),
so task `aura-review-subcommands` stays `status: open`.

## Steps performed

1. Read slice doc + task doc + TDD/verify outputs.
2. Verified slice tests green on the slice branch (23/23) before merge.
3. `git checkout task/aura-mcp-doc-salvage`.
4. `git merge --no-ff slice/add-review-verbs-to-aura-client` — clean merge
   (ort strategy, no conflicts).
5. `git branch -d slice/add-review-verbs-to-aura-client`.
6. `git mv` slice doc → `docs/tasks/aura-review-subcommands/slices/archive/1-add-review-verbs-to-aura-client.md`.
7. Added `## Implementation notes` section to task doc (none existed) with the
   slice 1 note, including the **`reopenArtifactReview(id, version)` divergence**
   flagged for slice 2.
8. Set archived slice doc `status: done`.
9. Updated `state.yaml`: `task: aura-review-subcommands`, `slice: add-review-verbs-to-aura-client`, `task_status: open`.
10. `git commit -m "docs(slice): land add-review-verbs-to-aura-client"`.
11. Re-ran full suite on landed branch — all green.

## Merge

- **No conflicts.** Clean `--no-ff` merge (ort strategy).
- Merge commit: `dddd8dc`.
- Doc-commit: `e235917`.
- Slice branch deleted.

## Post-merge verification (on task/aura-mcp-doc-salvage)

- `cd packages/shared && npm test` → **23 pass, 0 fail**.
- `cd packages/shared && npm run typecheck` → pass (exit 0).
- `cd scripts && npm run typecheck` → pass (exit 0).

## Diff review

Files changed by the slice (4 files, +622/-1):
- `packages/shared/src/aura-client.ts` (+23): `ReviewerRole`,
  `StartArtifactReviewInput`, `SubmitArtifactDecisionInput` domain types + 4
  new verb declarations on `AuraClient`. No generated-type leak (mirrors
  existing `getArtifact`/`listArtifacts` style).
- `packages/shared/src/hey-api-aura-client.ts` (+68): implements 4 new verbs
  via generated SDK methods (aliased `gen*`), generated types aliased `G*` and
  used only at cast boundaries (`as GArtifactReviewStartRequest["roles"]`,
  `as GArtifactDecisionRequest["decision"]`). Extracts `sdkErrorMessage` +
  `unwrapVoid` helpers for 204/void endpoints. Throws `AuraApiError` on errors.
- `packages/shared/test/review-verbs.test.ts` (+529, new): unit tests for all
  6 review verbs using `mock.method` on the injected fetch client. 23 tests.
- `packages/shared/test/hey-api-aura-client.test.ts` (+3/-1): minor update.

## Divergence carried forward (slice 2 must handle)

`reopenArtifactReview` signature widened from `(id)` → `(id, version)` to
match the actual REST contract: `POST /artifacts/{id}/review-reopen` has a
**required** `ArtifactReviewVersionRequest` body (`{ version: number }`).
The server needs the version to know which review run to reopen.

**Slice 2 action:** add a `--version` flag to the `review-reopen` subcommand
and pass it through. Salvaged doc example should be updated from
`artifact review-reopen <artifact-uuid>` to
`artifact review-reopen <artifact-uuid> --version <version>`.

## Review findings

No blockers. The slice's own acceptance criteria are all satisfied. The single
recorded divergence (`reopenArtifactReview(id, version)`) is a justified
correction to match the REST contract and is documented for slice 2.

## Residual risks

- `unwrapVoid` treats `res.error === undefined` as success and does not
  inspect `res.data`; correct for 201-with-body/204 endpoints, but would
  silently swallow a 4xx/5xx whose error shape `@hey-api/client-fetch` does not
  populate into `res.error`. Low risk (the SDK populates `error` on non-2xx),
  noted in the task implementation notes.
- No lint tooling exists in the repo; verification relies on typecheck alone
  for static analysis.

## Notes

- Task is NOT done (2 of 3 slices remain). `state.yaml` updated to reflect
  current task context for the next worker.
- Untracked `tdd-add-review-verbs-to-aura-client/` and
  `verify-add-review-verbs-to-aura-client/` scratch dirs were left alone
  (worker outputs, not repo artifacts).

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Reviewed the merged slice diff on task/aura-mcp-doc-salvage: packages/shared/src/aura-client.ts (+23) adds ReviewerRole/StartArtifactReviewInput/SubmitArtifactDecisionInput domain types + 4 verb decls with no generated-type leak; packages/shared/src/hey-api-aura-client.ts (+68) implements them via gen* SDK methods with G* generated types only at cast boundaries and throws AuraApiError; packages/shared/test/review-verbs.test.ts (+529) covers all 6 verbs. ReopenArtifactReview signature diverged to (id, version) per openapi.yaml required body — documented for slice 2. No blockers found."
    }
  ],
  "changedFiles": [
    "packages/shared/src/aura-client.ts",
    "packages/shared/src/hey-api-aura-client.ts",
    "packages/shared/test/hey-api-aura-client.test.ts",
    "packages/shared/test/review-verbs.test.ts",
    "docs/tasks/aura-review-subcommands/task.md",
    "docs/tasks/aura-review-subcommands/slices/archive/1-add-review-verbs-to-aura-client.md",
    "docs/tasks/state.yaml"
  ],
  "testsAddedOrUpdated": [
    "packages/shared/test/review-verbs.test.ts",
    "packages/shared/test/hey-api-aura-client.test.ts"
  ],
  "commandsRun": [
    {
      "command": "git checkout task/aura-mcp-doc-salvage",
      "result": "passed",
      "summary": "Switched to task branch"
    },
    {
      "command": "git merge --no-ff slice/add-review-verbs-to-aura-client -m \"slice(aura-review-subcommands): ...\"",
      "result": "passed",
      "summary": "Clean merge (ort strategy), no conflicts, 4 files +622/-1"
    },
    {
      "command": "git branch -d slice/add-review-verbs-to-aura-client",
      "result": "passed",
      "summary": "Slice branch deleted (was 46bc355)"
    },
    {
      "command": "git mv slices/1-...md slices/archive/1-...md",
      "result": "passed",
      "summary": "Slice doc archived"
    },
    {
      "command": "git add docs/tasks/ && git commit -m \"docs(slice): land add-review-verbs-to-aura-client\"",
      "result": "passed",
      "summary": "Doc commit e235917 (3 files, +45/-4)"
    },
    {
      "command": "cd packages/shared && npm test",
      "result": "passed",
      "summary": "23 tests, 23 pass, 0 fail (post-merge on task branch)"
    },
    {
      "command": "cd packages/shared && npm run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit exit 0"
    },
    {
      "command": "cd scripts && npm run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit exit 0"
    }
  ],
  "validationOutput": [
    "Post-merge on task/aura-mcp-doc-salvage: npm test → 23/23 pass; packages/shared typecheck pass; scripts typecheck pass.",
    "Merge commit dddd8dc (no conflicts); doc commit e235917.",
    "Slice branch slice/add-review-verbs-to-aura-client deleted.",
    "Task stays open (slices 2 and 3 remain todo). state.yaml updated to current task context."
  ],
  "residualRisks": [
    "unwrapVoid treats res.error===undefined as success and does not inspect res.data; would silently swallow a 4xx/5xx whose error shape @hey-api/client-fetch does not populate into res.error. Low risk (SDK populates error on non-2xx), documented in task implementation notes.",
    "No lint tooling in repo; static analysis relies on typecheck alone."
  ],
  "noStagedFiles": true,
  "diffSummary": "Merge of slice add-review-verbs-to-aura-client into task/aura-mcp-doc-salvage: +622/-1 across aura-client.ts (4 verb decls + 3 domain types), hey-api-aura-client.ts (4 verb impls + unwrapVoid/sdkErrorMessage helpers), review-verbs.test.ts (new, 23 tests), hey-api-aura-client.test.ts (minor). Plus doc edits (task impl notes, archived slice status done, state.yaml).",
  "reviewFindings": [
    "no blockers — reopenArtifactReview(id, version) signature divergence from slice doc is a justified correction matching the openapi.yaml required requestBody; documented for slice 2 to add --version flag."
  ],
  "manualNotes": "Task aura-review-subcommands is NOT done (2 of 3 slices remain: wire-aura-mjs-review-subcommands, verify-and-build). Slice 2 must add a --version flag to review-reopen and update the salvaged doc example. state.yaml now reflects the in-progress task context."
}
```
