---
kind: slice
slug: dedupe-types
title: Remove types.ts Aura shapes duplicated by the domain types
task: ../task.md
mode: hitl
status: done
size: m
blocked_by:
  - migrate-aura-digest
  - migrate-aura-cli
---

## End-to-end behavior

The hand-maintained Aura-API-response shapes in `scripts/src/types.ts`
(`AuraArtifact`, `AuraTask`, `AuraBoardBriefing`, `AuraCapacity`,
`ArtifactApprovalState`, `ArtifactReview`, etc.) are removed where the new
`@pi-aura/shared/aura-client` domain types cover them. The digest/report/diff
types (`Digest`, `DigestQueueRow`, `DigestDiff`, `AuraReport`, etc.) that
have no spec equivalent stay.

## Acceptance criteria

- `types.ts` no longer defines types that duplicate the domain types — the
  migrated scripts import those from `@pi-aura/shared/aura-client`.
- The digest-specific types remain in `types.ts`.
- `make typecheck` passes (the typechecker confirms the migration uses the
  domain types, not the removed ones).
- No runtime behavior change (this is a type-source consolidation).

## Test plan

- Seams: the typechecker is the test — removing a duplicated type that's
  still referenced causes a compile error, which is the signal to migrate
  that reference.
- Failure modes: a domain type that's slightly different from the
  hand-maintained one (e.g. an extra optional field) surfaces as a type
  error at the call site — reconcile in the domain type or the call site.
- Scenarios: `make typecheck` clean; `make build` clean; the built
  `aura-digest.mjs` `fetch` still produces the same `digest.json` shape.
- Edge cases: a digest type that *embeds* a removed Aura shape (e.g.
  `DigestReview` has `decisions: ArtifactApprovalDecision[]`) — either keep
  the embedded type in `types.ts` or import the domain equivalent.

## Constraints / dependencies

- Blocked by both migration slices (don't remove types still referenced by
  un-migrated scripts).
