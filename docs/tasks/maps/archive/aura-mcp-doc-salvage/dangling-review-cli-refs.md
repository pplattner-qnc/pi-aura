# Dangling `aura.mjs` CLI references — review subcommands not on main

> Produced by the `aura-mcp-overhaul-update` salvage (2026-08-21). The salvaged
> skill docs reference `aura.mjs artifact review-*` subcommands that were
> implemented on the overhaul branch but **dropped** (main's `aura-access-rewrite`
> uses a typed `AuraClient`, not these subcommands). This file catalogues every
> dangling reference so `aura-review-subcommands` can re-implement them and make
> the docs truthful again.

## Subcommands referenced in docs but NOT in main's `scripts/src/aura.ts` USAGE

| Subcommand | REST path | Method |
|---|---|---|
| `artifact review-get <id>` | `/artifacts/{id}/review` | GET |
| `artifact review-approvals <id>` | `/artifacts/{id}/approvals` | GET |
| `artifact review-request <id>` | `/artifacts/{id}/review-request` | POST |
| `artifact review-start <id> --version V --roles R[,R] --user-ids U[,U] [--deadline D]` | `/artifacts/{id}/review-start` | POST |
| `artifact review-decide <id> --version V --decision APPROVED\|REJECTED` | `/artifacts/{id}/decisions` | POST |
| `artifact review-reopen <id>` | `/artifacts/{id}/review-reopen` | POST |

All REST endpoints exist in `openapi-new.yaml` (and in main's current
`packages/shared/openapi/openapi.yaml` — verified: `getArtifactReview`,
`getArtifactApprovals`, `requestArtifactReview`, `startArtifactReview`,
`submitArtifactDecision`, `reopenArtifactReview` operationIds all present).

## Doc files containing the dangling references

- `skills/aura/resources/usecases/artifact-management.md` — the "Review workflow"
  section (6 `node skills/aura/dist/aura.mjs artifact review-*` examples:
  request → review-get → review-decide → review-start → review-reopen →
  review-approvals).
- `skills/aura/resources/process/review-modes.md` — line ~57: "Use
  `aura.mjs artifact review-*` subcommands, or the REST endpoints …".

## Re-implementation target

`aura-review-subcommands` task: add these 6 subcommands to
`scripts/src/aura.ts` on top of current main, but implemented via main's
`AuraClient` interface (`@pi-aura/shared/aura-client`), **not** the dropped
`restClient`. Main's `AuraClient` currently has a `// reviews / approvals`
section with types (`ArtifactReview`, `ArtifactApprovals`, `ReviewerStatus`,
`OpenReview`, `ApprovalDecision`) but **no review verbs on the interface** —
the re-implementation task must first add the review verbs to `AuraClient` (or
call the generated `HeyApiAuraClient` REST methods directly), then wire the
`aura.mjs` subcommands. Depends on `openapi-spec-bump` (so the codegen types
are current).
