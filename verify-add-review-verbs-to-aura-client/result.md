# Slice verification: add-review-verbs-to-aura-client

## Result

**Slice `add-review-verbs-to-aura-client` verified — lint not configured (typecheck substitutes), slice tests passing (23/23), full project suite green.**

## Quality gate

### 1. Lint
No lint tool is configured in this project. There is no `lint` script in any
`package.json` and no ESLint/Prettier/Biome config file at repo root or in the
workspaces. Static analysis is provided by `tsc --noEmit` typecheck, which is
the project's established convention (see `Makefile` `typecheck` target).
Both workspace typechecks were run and are green.

### 2. Slice tests — PASSING
`cd packages/shared && npm test` → `tsx --test test/*.test.ts`
- tests 23, pass 23, fail 0, skipped 0.

### 3. Full project suite — GREEN
- `cd scripts && npm run typecheck` → pass (no output, exit 0).
- `cd packages/shared && npm run typecheck` → pass (no output, exit 0).
- `node --experimental-strip-types extensions/aura-secrets.test.ts` → "All tests passed".

There is no root-level test runner; the only test files in the repo are
`packages/shared/test/*.test.ts` (run by the shared test command) and
`extensions/aura-secrets.test.ts` (a standalone smoke test, run directly).
All three entry points pass.

## Diff review

The slice's own commits (`c00ca76`, `46bc355`) touch exactly the expected
files:
- `packages/shared/src/aura-client.ts` (+23): adds `ReviewerRole`,
  `StartArtifactReviewInput`, `SubmitArtifactDecisionInput` domain types and
  4 new methods on `AuraClient`.
- `packages/shared/src/hey-api-aura-client.ts` (+67): implements the 4 new
  verbs, extracts `sdkErrorMessage` + `unwrapVoid` helpers.
- `packages/shared/test/review-verbs.test.ts` (+529, new): unit tests for all
  6 review verbs, using `mock.method` on the injected fetch client.
- `packages/shared/test/hey-api-aura-client.test.ts` (+3, -1): small update.

Generated types are imported (aliased `G*`) and used only at cast boundaries
(`as GArtifactReviewStartRequest["roles"]`, `as GArtifactDecisionRequest["decision"]`),
confirming acceptance criterion 1 (no generated-type leak into the public
interface).

The recorded divergence — `reopenArtifactReview(id, version)` instead of
`reopen(id)` — is consistent with `openapi.yaml` (`POST
/artifacts/{id}/review-reopen` has a required `requestBody` of
`ArtifactReviewVersionRequest` with required `version`). This is a justified
correction and is documented for slice 2 (`wire aura.mjs`) to add a
`--version` flag.

## Residual risks

- `unwrapVoid` treats `res.error === undefined` as success and does not
  inspect `res.data`; for a 201-with-body or 204 endpoint this is correct,
  but if any of these 4 endpoints ever returns a 4xx/5xx with an error shape
  that `@hey-api/client-fetch` does not populate into `res.error`,
  `unwrapVoid` would silently swallow it. Low risk given the SDK populates
  `error` on non-2xx, but worth a note.
- No lint tooling exists in the repo, so this verification relies on
  typecheck alone for static analysis.
