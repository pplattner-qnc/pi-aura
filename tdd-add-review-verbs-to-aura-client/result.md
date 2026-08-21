# Slice: add-review-verbs-to-aura-client — Result

## Summary

Added 4 new review/approval verbs to the `AuraClient` interface and
`HeyApiAuraClient` implementation (`requestArtifactReview`,
`startArtifactReview`, `submitArtifactDecision`, `reopenArtifactReview`),
plus unit tests for all 6 review verbs (the 2 GET verbs `getArtifactReview`
and `getArtifactApprovals` were already implemented from the
`openapi-spec-bump` slice). All tests and typechecks pass on the
`slice/add-review-verbs-to-aura-client` branch.

## Divergence from plan

**`reopenArtifactReview` signature changed: `(id)` → `(id, version)`.**

The slice doc's verb↔REST table lists `reopenArtifactReview(id): Promise<void>`
(only `id`), matching the salvaged CLI doc's `aura.mjs artifact review-reopen
<id>` usage. However, the generated SDK method `reopenArtifactReview`
requires `body: ArtifactReviewVersionRequest` (i.e. `{ version: number }`),
and `openapi.yaml` confirms `POST /artifacts/{id}/review-reopen` has a
**required** `requestBody` of type `ArtifactReviewVersionRequest` with
`version` required. The server needs the version to know which review run
to reopen.

I implemented the interface as `reopenArtifactReview(id: string, version:
number): Promise<void>` to match the actual REST contract. Slice 2 (wire the
`aura.mjs` subcommand) must add a `--version` flag to `review-reopen` and
pass it through. The salvaged doc `artifact review-reopen <artifact-uuid>`
example should be updated to `artifact review-reopen <artifact-uuid>
--version <version>`.

## Acceptance criteria status

1. ✅ `AuraClient` interface declares 6 verbs with domain types (no generated
   leak). `ReviewerRole`, `StartArtifactReviewInput`,
   `SubmitArtifactDecisionInput` added as expressive domain input types.
2. ✅ `HeyApiAuraClient` implements all 6 via generated SDK methods with
   domain↔generated mapping. Throws `AuraApiError` on SDK errors.
3. ✅ Unit tests in `packages/shared/test/review-verbs.test.ts` mock the
   generated SDK (via `mock.method` on the client's `.get`/`.post`) and
   assert each verb calls the right method + args + mapping + error
   propagation.
4. ✅ `cd packages/shared && npm test` green (23 tests pass). `cd scripts &&
   npm run typecheck` green (interface change flows, no call sites yet).
5. ✅ Committed on `slice/add-review-verbs-to-aura-client` branch.

## Notable events

- Discovered that `getArtifactReview` and `getArtifactApprovals` were already
  implemented (from the prior `openapi-spec-bump` slice); only 4 verbs were
  new. Tests cover all 6 for completeness.
- Discovered `reopenArtifactReview` requires a `version` body per the
  generated SDK + openapi.yaml, diverging from the slice doc's `reopen(id)`
  signature. Widened the interface to `reopen(id, version)` and recorded the
  divergence.
- Extracted `unwrapVoid` helper + `sdkErrorMessage` to handle 204/void
  endpoints without duplicating the error-check logic from `unwrap`.
- Used `mock.method` (Node's built-in test runner mock) to intercept
  `.get`/`.post` on a real `@hey-api/client-fetch` Client instance — the
  existing test noted it "can't easily stub the generated SDK functions
  (they're direct imports)", but `mock.method` on the injected client works
  cleanly.
