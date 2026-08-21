---
kind: task
slug: openapi-spec-bump
title: Bump packages/shared/openapi/openapi.yaml to the user-provided openapi-new.yaml and reconcile codegen breakage
type: feature
status: done
blocked_by: []
map: aura-mcp-doc-salvage
slices:
- replace-spec-and-regen
---

## Outcome

`packages/shared/openapi/openapi.yaml` is replaced with the user-provided
`openapi-new.yaml` (the 2026-08-21 version), the `@hey-api/openapi-ts` codegen
is regenerated, and any breakage in `@pi-aura/shared/aura-client` /
`HeyApiAuraClient` / the scripts' `AuraClient` call sites is reconciled.
`aura-review-subcommands` (which needs the review/approval types) blocks on
this.

## Scope

- Replace `packages/shared/openapi/openapi.yaml` with `openapi-new.yaml`
  (provided at repo root by the user). Confirm the new spec still has all the
  operationIds the `AuraClient` interface exercises (sample-verified: both
  specs have `getArtifactReview`, `getArtifactApprovals`, `requestArtifactReview`,
  `startArtifactReview`, `submitArtifactDecision`, `reopenArtifactReview`,
  `getBoardBriefing`, `getBoardSummary`, `listNotifications`, `getMyCapacity`,
  `getMyPriorityQueue`, `listTasks`, `getTaskByHumanKey`, `listArtifacts`, the
  `mcp*` routes, the code-search routes, etc.).
- Run the codegen (`make codegen` in `packages/shared/`, per
  `packages/shared/openapi-ts.config.ts` which uses `input: openapi/openapi.yaml`).
- Fix any breakage: the generated `HeyApiAuraClient` + the `AuraClient`
  interface in `packages/shared/src/aura-client.ts` + the `AuraClient` call
  sites in `scripts/src/aura-digest.ts` and `scripts/src/aura.ts`. Likely
  breakage: renamed/removed fields, new required params, changed response
  shapes. The new spec is +368 lines vs the old — some endpoints changed.
- `cd packages/shared && npm test` (the `hey-api-aura-client.test.ts` smoke
  tests) green; `cd scripts && npm run typecheck && npm run build` green.

## Out of scope

- Adding new `AuraClient` verbs (e.g. review verbs) — that's the
  `aura-review-subcommands` task. This task only keeps the existing surface
  compiling against the new spec.
- Doc changes (already salvaged + committed).

## Acceptance criteria

- `packages/shared/openapi/openapi.yaml` matches `openapi-new.yaml`.
- `make codegen` (or the equivalent) regenerates without error.
- `cd packages/shared && npm test` green.
- `cd scripts && npm run typecheck && npm run build` green; the built
  `dist/*.mjs` committed.
- Any field renames/shape changes from the new spec are reconciled in
  `aura-client.ts` / `hey-api-aura-client.ts` / the scripts' call sites (note
  them in `## Implementation notes`).
- `openapi-new.yaml` can be removed from the repo root after the bump (it's
  now the codegen input) OR kept as a reference — decide + note.

## Dependencies

- None (prerequisite for `aura-review-subcommands`).

## Slice list

- slice: replace-spec-and-regen (replace openapi.yaml, regen, reconcile
  breakage, verify the full gate)

## Test plan

- `make codegen` succeeds.
- The 4 `tsx --test` smoke tests in `packages/shared` pass.
- `scripts` typecheck + build green.
- Sample-verify the review/approval operationIds are present in the new spec
  (so the downstream task can use them).

## Implementation notes

### Spec replacement + codegen

- `packages/shared/openapi/openapi.yaml` replaced with the repo-root
  `openapi-new.yaml` (the 2026-08-21 spec, +368 lines vs old).
- `make codegen` (`cd packages/shared && npm run codegen`) regenerated
  `packages/shared/src/generated/{sdk.gen,types.gen,client.gen,index}.ts`
  without error.
- `packages/shared/src/generated/` is **gitignored** (via
  `packages/shared/.gitignore:src/generated/`); it is NOT committed — rebuilt
  locally via `make codegen`. The dist bundles (`skills/*/dist/*.mjs`) ARE
  committed and were rebuilt against the new spec.
- `openapi-new.yaml` was **removed** from the repo root (it's now the codegen
  input at `packages/shared/openapi/openapi.yaml`; nothing in the build
  references the root copy).

### Spec shape changes reconciled

The new spec is purely additive — no existing operationIds were removed or
renamed, no existing schema fields changed. The only operation removed was
`mcpGetTask`, which was not used anywhere in the codebase (not in the
`AuraClient` interface, `HeyApiAuraClient`, or the scripts).

Operations added in the new spec (not wired — out of scope for this slice):
- `aiSetup`, `getBlueprintFiles`, `listKnowledgeFileVersions`, `systemHealth`

New schemas added (not imported — out of scope):
- `AiSetupResponse`, `BlueprintFile`, `BlueprintToolError`, `GetBlueprintFilesResponse`,
  `KnowledgeFileVersion`, `KnowledgeFileVersionList`, `bearerAuth`, `cookieAuth`

No changes were needed in:
- `packages/shared/src/aura-client.ts` (domain types unchanged)
- `packages/shared/src/hey-api-aura-client.ts` (mappers unchanged; the
  implicit-any at line ~695 `g.review_artifacts.map((a) => ({ title: a.title }))`
  resolved because the generated `ArtifactReviewOverview.review_artifacts`
  is now typed as `Array<ArtifactReviewArtifactRef>` with `title: string`)
- `scripts/src/aura-digest.ts` (call sites unchanged)
- `scripts/src/aura.ts` (call sites unchanged)

### Gate results

- `cd packages/shared && npm run codegen` — green
- `cd packages/shared && npm test` — 4/4 smoke tests pass
- `cd scripts && npm run typecheck` — zero errors (implicit-any + TS2307 gone)
- `cd scripts && npm run build` — `skills/aura-digest/dist/aura-digest.mjs` +
  `skills/aura/dist/aura.mjs` produced and committed

### Review/approval operationIds confirmed present

The downstream `aura-review-subcommands` task depends on these — all present
in the new spec: `getArtifactReview`, `getArtifactApprovals`,
`requestArtifactReview`, `startArtifactReview`, `submitArtifactDecision`,
`reopenArtifactReview`.
