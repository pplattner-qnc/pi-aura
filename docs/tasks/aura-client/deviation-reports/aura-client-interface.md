## Deviation report — aura-client-interface

### API surface changes
- **Planned:** `packages/shared/src/aura-client.ts` exports the `AuraClient`
  interface with ~21 methods (the exercised verbs), each with expressive
  hand-written domain-type inputs and outputs (no generated types, no
  `unknown`/`any`). `@pi-aura/shared/aura-client` exports mapping added to
  `packages/shared/package.json`. `npm run typecheck` passes.
- **Actual:** All 21 methods are present with domain-typed inputs and outputs.
  The interface declares every domain type listed in the arch spec's
  "Domain type catalogue" (verified field-by-field against the catalogue):
  `Pagination`, `Artifact`, `ArtifactKind`, `CreateArtifactInput`,
  `UpdateArtifactInput`, `UpdateArtifactResult`, `ArtifactList`,
  `ArtifactListItem`, `ListArtifactsInput`, `KnowledgeNode`,
  `KnowledgeNodeKind`, `SaveKnowledgeNodeBodyInput`, `WikiSearchInput`,
  `WikiSearchResult`, `WikiSearchHit`, `KnowledgeTree`,
  `CreateKnowledgeNodeInput`, `UploadDocument`, `CreateUploadDocumentInput`,
  `BoardBriefing`, `BoardSummary`, `BoardBucket`, `BoardItem`,
  `NotificationList`, `Notification`, `ListNotificationsInput`,
  `PriorityQueue`, `PriorityQueueItem`, `HumanKeyRef`, `Capacity`,
  `CapacityTask`, `TaskList`, `Task`, `ListTasksInput`, `ArtifactApprovals`,
  `OpenReview`, `ApprovalDecision`, `ArtifactReview`, `ReviewerStatus`.
  The method count is exactly 21 (4 artifacts + 6 knowledge/wiki + 2 upload
  + 2 boards + 1 notifications + 2 my-board + 1 listTasks + 3 reviews).
  The `./aura-client` exports mapping was added to `package.json`.
  `npm run typecheck` passes (confirmed independently).
- **Impact:** None on dependent slices. Slice 3 (`hey-api-impl-and-factory`)
  imports `AuraClient` + the domain types and implements `HeyApiAuraClient`
  against them; the contract is unchanged.

### Abstraction usage
- Used/was specified: yes. The interface is pure hand-written domain types
  with **no** imports from `./generated/*` — Q8 is satisfied (verified by
  grepping `aura-client.ts` for `generated`/`.gen.`; the only hit is the
  `generated_at` field on `BoardBriefing`, which is a domain field name, not
  an import). Field sets were cross-checked against `scripts/src/types.ts`
  (the existing response shapes) and the arch spec catalogue.

### Out-of-scope changes
- **`ListArtifactsInput` added** — the arch spec's method-signature section
  shows `listArtifacts(opts?: ListArtifactsInput)` but the "Domain type
  catalogue" does not define the type. The implementer declared it as a
  loose `{ [k: string]: unknown }` index signature. This is a minor
  addition consistent with the "expressive but not over-encoded" guidance
  (the scripts pass it via query params; the call-site-migration task will
  tighten it if needed). The slice doc's acceptance criteria name a type
  `TaskListQuery` (the test-plan example `listTasks(query: TaskListQuery)`)
  but the arch spec uses `ListTasksInput` — the implementer followed the
  arch spec, which is the authoritative interface contract. This is a
  slice-doc/spec naming mismatch, not an implementation deviation.
- No other additions or removals. No implementation, factory, or call-site
  changes (correctly deferred to slice 3 / `call-site-migration`).

### Task doc update needed?
Yes — append to `## Implementation notes`: slice 2 landed the `AuraClient`
interface (21 methods) + all domain types; `ListArtifactsInput` was added as a
loose index-signature type (not enumerated in the spec catalogue); the
slice-doc `TaskListQuery` naming was superseded by the arch spec's
`ListTasksInput` (authoritative).

### User attention needed?
No — scope and API surfaces match the spec. One naming note for
`call-site-migration`: the slice doc's test plan references `TaskListQuery`,
but the actual exported type is `ListTasksInput` (per the arch spec). The
migration task should import `ListTasksInput`, not `TaskListQuery`.
