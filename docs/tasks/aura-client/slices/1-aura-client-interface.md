---
kind: slice
slug: aura-client-interface
title: AuraClient interface + expressive domain types
task: ../task.md
mode: hitl
status: todo
size: m
blocked_by: []
---

## End-to-end behavior

The `AuraClient` interface and its expressive domain types exist in
`packages/shared/src/aura-client.ts`, importable as `@pi-aura/shared/aura-client`.
No implementation yet — `HeyApiAuraClient` is the next slice. The interface
owns the vocabulary the scripts see; generated types do not appear in it.

## Acceptance criteria

- `AuraClient` interface with ~21 methods (the exercised verbs), each with
  expressive domain-type inputs and outputs (not generated types, not
  `unknown`).
- Domain types named for the domain: e.g. `Artifact`, `Task`, `TaskListQuery`,
  `UpdateArtifactInput`, `BoardBriefing`, `BoardSummary`, `Notification`,
  `PriorityQueue`, `Capacity`, `ArtifactApprovalState`, `ArtifactReview`,
  `KnowledgeNode`, `WikiSearchResult`, `UploadDocument`, etc.
- The interface has **no** generated-type imports (Q8: generated types
  never leak).
- `@pi-aura/shared/aura-client` `exports` mapping added to
  `packages/shared/package.json`.
- `npm run typecheck` passes.

## Test plan

- Seams: each method's input/output is a domain type — verify a method
  like `listTasks(query: TaskListQuery): Promise<Task[]>` compiles and that
  `TaskListQuery` has the real fields (`role`, `view`, `status_slug`,
  `limit`).
- Failure modes: if a domain type is too loose (`unknown`/`any`), the
  "expressive" requirement (Q5) is violated — tighten it.
- Scenarios: a scratch `const c: AuraClient = ...` (with a fake impl)
  type-checks against all ~21 methods.
- Edge cases: the ~21 verbs' args differ (some take `id`, some take a query
  object, some take a body) — each method's signature reflects that.

## Constraints / dependencies

- Blocked by `keyring-rewrite` (the factory needs `createKeyring` to exist;
  the interface itself doesn't, but the package's coherence does).
