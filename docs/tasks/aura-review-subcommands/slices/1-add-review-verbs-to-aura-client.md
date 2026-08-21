---
kind: slice
slug: add-review-verbs-to-aura-client
title: Add the 6 review/approval verbs to AuraClient + HeyApiAuraClient impl + tests
task: ../task.md
mode: afk
status: todo
size: l
blocked_by: []
---

## End-to-end behavior

`packages/shared/src/aura-client.ts` `AuraClient` interface gains 6
review/approval verbs (the interface currently has the types
`ArtifactReview`, `ArtifactApprovals`, `ReviewerStatus`, `OpenReview`,
`ApprovalDecision` but a `// reviews / approvals` section with no verbs).
`HeyApiAuraClient` implements them via the generated SDK (now codegen-current
after `openapi-spec-bump`). Unit tests mock the generated SDK and assert each
verb calls the right path/method/params.

## Verbs (mapped to REST, all in openapi.yaml)

| Verb | REST | Method |
|---|---|---|
| `getArtifactReview(id): Promise<ArtifactReview>` | `/artifacts/{id}/review` | GET |
| `getArtifactApprovals(id): Promise<ArtifactApprovals>` | `/artifacts/{id}/approvals` | GET |
| `requestArtifactReview(id): Promise<void>` | `/artifacts/{id}/review-request` | POST |
| `startArtifactReview(input): Promise<...>` | `/artifacts/{id}/review-start` | POST (version, roles[], user_ids[], deadline?) |
| `submitArtifactDecision(id, version, decision): Promise<...>` | `/artifacts/{id}/decisions` | POST |
| `reopenArtifactReview(id): Promise<void>` | `/artifacts/{id}/review-reopen` | POST |

## Acceptance criteria

- `AuraClient` interface in `packages/shared/src/aura-client.ts` declares the 6
  verbs with expressive domain input/output types (mirror the existing
  `getArtifact`/`listArtifacts` style — no generated types leak into the
  interface). `startArtifactReview` takes `{ id, version, roles: ReviewerRole[], user_ids: string[], deadline?: string }`; `submitArtifactDecision` takes `{ id, version, decision: "APPROVED" | "REJECTED" }`.
- `HeyApiAuraClient` in `packages/shared/src/hey-api-aura-client.ts`
  implements all 6, delegating to the generated SDK methods (mapped
  generated<->domain internally, same pattern as the existing verbs). Throws
  `AuraApiError` on SDK errors.
- Unit tests in `packages/shared/test/` (extend `hey-api-aura-client.test.ts`
  or a new `review-verbs.test.ts`) mock the generated SDK and assert each verb
  calls the right generated method with the right mapped args + returns the
  mapped domain type.
- `cd packages/shared && npm test` green; `cd scripts && npm run typecheck`
  green (the interface change flows to the scripts but no call sites yet —
  that's slice 2).
- Commit on a slice/add-review-verbs-to-aura-client branch.

## Test plan

- **Seam:** mock the generated `HeyApiAuraClient` SDK calls (the existing tests
  already mock the SDK — follow that pattern).
- **Scenarios:**
  1. `getArtifactReview` → calls generated `getArtifactReview` (or the
     generated method name), maps to domain `ArtifactReview`.
  2. `getArtifactApprovals` → maps to `ArtifactApprovals`.
  3. `requestArtifactReview(id)` → POST; returns void.
  4. `startArtifactReview({id, version, roles, user_ids, deadline})` → POST
     with the mapped body.
  5. `submitArtifactDecision({id, version, decision})` → POST.
  6. `reopenArtifactReview(id)` → POST.
  7. Each verb propagates an SDK error as `AuraApiError`.
- **Edge cases:** `deadline` optional; empty `roles`/`user_ids` passed
  through (server validates).

## Constraints

- Don't wire `aura.mjs` subcommands yet (slice 2). Don't edit docs (they
  already reference these — this slice makes the backing code real).
- Stay on `AuraClient`; don't reintroduce the dropped `restClient`.
- Match the existing `hey-api-aura-client.ts` mapping patterns (domain<->generated) exactly.
