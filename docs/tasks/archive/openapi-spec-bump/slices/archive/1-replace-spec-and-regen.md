---
kind: slice
slug: replace-spec-and-regen
title: Replace openapi.yaml with openapi-new.yaml, regen codegen, reconcile breakage
task: ../task.md
mode: afk
status: todo
size: l
blocked_by: []
---

## End-to-end behavior

`packages/shared/openapi/openapi.yaml` is replaced with the user-provided
`openapi-new.yaml` (repo root), `make codegen` regenerates `src/generated/`, and
the whole repo typechecks + builds + tests green. This unblocks
`aura-review-subcommands` (which needs the review/approval codegen types) and
fixes main's pre-existing red typecheck (missing `generated/sdk.gen.js` + an
implicit-any in `hey-api-aura-client.ts:695`).

## Acceptance criteria

- `packages/shared/openapi/openapi.yaml` is replaced with `openapi-new.yaml`
  (copy the repo-root `openapi-new.yaml` over it). The repo-root
  `openapi-new.yaml` is then removed (it's now the codegen input) — or kept as
  reference; decide + note in `## Implementation notes`.
- `make codegen` (→ `cd packages/shared && npm run codegen`) regenerates
  `packages/shared/src/generated/` without error.
- Reconcile any codegen breakage in:
  - `packages/shared/src/hey-api-aura-client.ts` (maps generated types ↔ the
    `AuraClient` domain types) — the implicit-any at line ~695
    (`g.review_artifacts.map((a) => ...)`) should resolve once `generated/`
    exists; fix any other shape changes from the new spec.
  - `packages/shared/src/aura-client.ts` (the `AuraClient` interface + domain
    types) — add/adjust fields if the new spec renamed/added them.
  - `scripts/src/aura-digest.ts` + `scripts/src/aura.ts` (the `AuraClient` call
    sites) — fix any field/param changes.
- `cd packages/shared && npm test` green (the `tsx --test` smoke tests).
- `make build` (root: typecheck + `scripts` build) green; the built
  `dist/aura.mjs` + `dist/aura-digest.mjs` committed.
- `packages/shared/src/generated/` is committed (it's the codegen output —
  verify whether main commits it or gitignores it; if gitignored, leave it; if
  committed on main, commit the regenerated files).
- Note in the task doc's `## Implementation notes`: every field/shape change
  from the new spec you reconciled, and whether `generated/` is committed or
  gitignored.
- Set task `status: done`.

## Test plan

- **Seam:** `make codegen` is the gate; the generated types flow into
  `hey-api-aura-client.ts` → `AuraClient` → the scripts.
- **Scenarios:**
  1. After replacing the spec, `make codegen` produces
     `packages/shared/src/generated/{sdk.gen,types.gen}.js|ts` (the missing
     modules that caused `TS2307`).
  2. `cd packages/shared && npm test` — the 4 `hey-api-aura-client.test.ts`
     smoke tests pass (adjust mocks if generated method names/shapes changed).
  3. `cd scripts && npm run typecheck` green (the implicit-any + TS2307 errors
     gone; no new errors from spec changes).
  4. `npm run build` green; `dist/*.mjs` rebuilt.
- **Edge cases:** the new spec is +368 lines vs old — some endpoints may have
  new required params or renamed fields; reconcile each. If a review/approval
  verb shape changed, note it (the downstream `aura-review-subcommands` task
  depends on the review types).

## Constraints

- Do NOT add new `AuraClient` verbs (review verbs are the downstream task's
  scope). This slice only keeps the existing surface compiling against the new
  spec.
- Do NOT reintroduce the dropped `restClient` — stay on `AuraClient`.
- `openapi-new.yaml` is the user-provided 2026-08-21 spec; treat it as the
  source of truth.
