---
kind: task
slug: aura-review-subcommands
title: Re-implement the 6 `aura.mjs artifact review-*` subcommands on main's AuraClient
type: feature
status: open
blocked_by:
- openapi-spec-bump
map: aura-mcp-doc-salvage
slices:
- add-review-verbs-to-aura-client
- wire-aura-mjs-review-subcommands
- verify-and-build
---

## Outcome

`scripts/src/aura.ts` exposes the 6 `artifact review-*` subcommands the
salvaged docs reference (see `docs/tasks/maps/aura-mcp-doc-salvage/dangling-review-cli-refs.md`),
implemented on main's `AuraClient` (not the dropped `restClient`). The doc
references become truthful.

## Scope

- Add review/approval **verbs** to the `AuraClient` interface in
  `packages/shared/src/aura-client.ts` (the interface currently has the types
  `ArtifactReview`, `ArtifactApprovals`, `ReviewerStatus`, `OpenReview`,
  `ApprovalDecision` but a `// reviews / approvals` section with no verbs).
  Verbs needed (mapped to REST):
  - `getArtifactReview(id): Promise<ArtifactReview>` → `GET /artifacts/{id}/review`
  - `getArtifactApprovals(id): Promise<ArtifactApprovals>` → `GET /artifacts/{id}/approvals`
  - `requestArtifactReview(id): Promise<void>` → `POST /artifacts/{id}/review-request`
  - `startArtifactReview(input): Promise<...>` → `POST /artifacts/{id}/review-start` (version, roles[], user_ids[], deadline?)
  - `submitArtifactDecision(id, version, decision): Promise<...>` → `POST /artifacts/{id}/decisions`
  - `reopenArtifactReview(id): Promise<void>` → `POST /artifacts/{id}/review-reopen`
- Implement them in `HeyApiAuraClient` (`packages/shared/src/hey-api-aura-client.ts`)
  via the generated SDK methods (now codegen-current after `openapi-spec-bump`).
- Wire the 6 `aura.mjs artifact review-*` subcommands in `scripts/src/aura.ts`:
  - `review-get <id>`, `review-approvals <id>`, `review-request <id>`,
    `review-start <id> --version V --roles R[,R] --user-ids U[,U] [--deadline D]`,
    `review-decide <id> --version V --decision APPROVED|REJECTED`,
    `review-reopen <id>`. Each calls the `AuraClient` verb and prints a
    compact summary; update USAGE.
- Keep the existing artifact/wiki/upload subcommands untouched.

## Out of scope

- Re-implementing the dropped `restClient` (use `AuraClient`).
- The fetcher migration or `markAllNotificationsRead` (already on main).
- Doc changes (the docs already reference these subcommands; this task makes
  them real — no doc edits needed unless a subcommand's flags diverge from the
  doc, in which case fix the doc to match).

## Acceptance criteria

- All 6 subcommands work via `AuraClient` (created via
  `createDefaultAuraClient()` like the other `aura.ts` subcommands).
- `aura.mjs artifact review-get <id>` prints compact review state; the others
  print confirmations / decisions; errors to stderr + exit 1 (mirror existing
  `fail()`).
- `AuraClient` interface has the 6 review verbs; `HeyApiAuraClient`
  implements them via the generated SDK.
- `cd packages/shared && npm test` green (add tests for the new verbs);
  `cd scripts && npm run typecheck && npm run build` green; `dist/aura.mjs`
  rebuilt + committed and contains the review-* dispatch.
- The doc references in `artifact-management.md` + `review-modes.md` now point
  at real subcommands (grep the bundle for `review-get` etc.).

## Dependencies

- **openapi-spec-bump** — the codegen types must be current before wiring the
  verbs (the review operationIds must exist in the generated SDK).

## Slice list

- slice: add-review-verbs-to-aura-client (interface + HeyApiAuraClient impl +
  tests)
- slice: wire-aura-mjs-review-subcommands (the 6 subcommands in aura.ts +
  USAGE)
- slice: verify-and-build (gate + build + commit dist)

## Test plan

- `packages/shared` `tsx --test`: mock the generated SDK, assert each verb
  calls the right path/method/params.
- `scripts`: typecheck + build; grep the built `dist/aura.mjs` for the
  review-* dispatch.
- Manual smoke test (user, needs live PAT): `node skills/aura/dist/aura.mjs
  artifact review-get <real-id>` prints review state.
