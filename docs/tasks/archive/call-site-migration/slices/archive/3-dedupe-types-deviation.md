## Deviation report — dedupe-types

### API surface changes
- **Planned:** Remove the hand-maintained Aura-API-response shapes from
  `scripts/src/types.ts` that duplicate the `@pi-aura/shared/aura-client`
  domain types; keep the digest/report/diff/dev-link types that have no spec
  equivalent; retype embedded references (`DigestReview.decisions`,
  `DigestCorrection.current_decisions`, `ArtifactVerification.current`,
  `RawAuraData` fields, `fetchTaskDevLinks` param) to the domain equivalents.
- **Actual:** All planned removals + retypes landed exactly as specified. 20
  Aura-response shapes removed (`AuraHumanKey`, `AuraCapacityTask`,
  `AuraCapacity`, `AuraPriorityQueueItem`, `AuraPriorityQueue`,
  `AuraNotification`, `AuraNotificationList`, `AuraArtifact`,
  `AuraArtifactList`, `AuraBoardBriefing`, `AuraBoardSummaryItem`,
  `AuraBoardSummaryBucket`, `AuraBoardSummary`, `AuraAttentionItem`,
  `AuraTask`, `AuraTaskList`, `AuraTaskDetail`, `ArtifactReview`,
  `ArtifactApprovalDecision`, `ArtifactApprovalState`).
  `types.ts` dropped from ~400 lines to 296 lines and now imports 9 domain
  types (`ApprovalDecision`, `ArtifactApprovals`, `ArtifactList`,
  `BoardBriefing`, `BoardSummary`, `Capacity`, `NotificationList`,
  `PriorityQueue`, `TaskList`) from `@pi-aura/shared/aura-client`.
  `RawAuraData` fields retyped to those domain types. `DigestReview.decisions`
  and `DigestCorrection.current_decisions` → `ApprovalDecision[]`;
  `ArtifactVerification.current` → `ArtifactApprovals | null`.
  `devlinks.ts`'s `fetchTaskDevLinks` + `taskText` params retyped
  `AuraTaskDetail` → `Task`.
- **Impact:** `clients-cleanup` (the next task) can now remove
  `bearerClient`'s Aura path + `scripts/src/generated/` + the `@hey-api/*`
  deps from `scripts/package.json` knowing no script imports the old
  Aura-response types. `types.ts` contains only digest/report/diff/dev-link
  types — the Aura-API shapes are single-sourced in the shared package.

### Abstraction usage
- Used/was specified: **yes.** The domain types from
  `@pi-aura/shared/aura-client` are the single source for all Aura
  response shapes. `types.ts` imports them via `import type { ... } from
  "@pi-aura/shared/aura-client"` and re-uses them in the digest/report
  types that embed them (`RawAuraData`, `DigestReview`, `DigestCorrection`,
  `ArtifactVerification`). No Aura-response shape is redefined locally.

### Out-of-scope changes
- **`AuraAttentionItem` removed** — not explicitly listed in the arch spec's
  "Types to remove" list, but it was an Aura-response shape (the
  `toAttentionItem` mapping consumed it indirectly via `AuraBoardSummaryItem`).
  It had no domain equivalent and no consumers outside `types.ts` after
  Slices 1+2 migrated the call sites. Removed it as a dead type. This is a
  minor scope extension consistent with the slice's intent ("remove shapes
  duplicated by / superseded by the domain types").
- **`as unknown as RawAuraData` cast removed** in `aura-digest.ts` — the
  transitional cast from Slice 1 (added because the domain types use
  `undefined` for optionals while the old `RawAuraData` used `null`) is no
  longer needed once `RawAuraData` fields were retyped to the domain types.
  The `raw` object is now directly annotated `const raw: RawAuraData = {...}`
  with no cast. This is a bonus cleanup that directly follows from the
  `RawAuraData` reconciliation; not explicitly in the spec but a natural
  consequence.
- **`decisionEmoji` param retyped** in `aura-digest.ts`:
  `ArtifactApprovalDecision` → `ApprovalDecision` (imported from domain).
  This is an embedded-reference retype the spec anticipated ("DigestReview
  has `decisions: ArtifactApprovalDecision[]` — retype to `ApprovalDecision`").

### Divergence from acceptance criteria
- **None that break the criteria.** All four acceptance criteria are met:
  `types.ts` no longer defines shapes that duplicate the domain types ✅;
  digest-specific types remain ✅; typecheck passes ✅; no runtime behavior
  change (pure type-source consolidation) ✅.

### Embedded-type retype decisions
- `ArtifactVerification.current`: `ArtifactApprovalState | null` →
  `ArtifactApprovals | null` (domain type). The `stale` logic in
  `verifyArtifacts` reads `current.version` — the domain `ArtifactApprovals`
  has `version: number` (required), so no null-guard change needed beyond the
  existing `current is null` check.
- `DigestReview.decisions` / `DigestCorrection.current_decisions`:
  `ArtifactApprovalDecision[]` → `ApprovalDecision[]`. The domain
  `ApprovalDecision` has `{ user_name: string; decision: string; decided:
  boolean }` — structurally identical to the old `ArtifactApprovalDecision`.
- `RawAuraData` fields: all 8 retyped to domain equivalents. The `raw`
  object in `aura-digest.ts` is now `const raw: RawAuraData = {...}` with no
  cast (the old `as unknown as RawAuraData` is removed).
- `fetchTaskDevLinks` / `taskText` params: `AuraTaskDetail` → `Task`. The
  domain `Task` has `jira_issues` + `children` (the fields `devlinks.ts`
  reads), so the retype is structural-compatible with no field-access changes.

### undefined-vs-null reconciliations
- The 3 capacity-boundary `?? null` sites in `aura-digest.ts` (flagged as
  transitional in Slice 1 notes) **stay**. These map domain types (which use
  `undefined` for optionals like `capacity_percent?: number`) to the digest
  contract types (which use `null` for `capacity_pct: number | null`). This
  is intentional runtime behavior — the digest JSON contract uses `null`,
  not `undefined` — so keeping them is correct and not a type-source
  duplication issue. The slice correctly did not touch these.

### Task doc update needed?
Yes — append to `## Implementation notes`: Slice 3 landed; 20 Aura-response
types removed from `types.ts` (now 296 lines, digest/report/diff/dev-link
types only); 9 domain types imported from `@pi-aura/shared/aura-client`;
embedded references retyped (`ArtifactVerification.current` →
`ArtifactApprovals`, `DigestReview`/`DigestCorrection` decisions →
`ApprovalDecision`, `RawAuraData` fields → domain, `fetchTaskDevLinks` param
→ `Task`); `as unknown as RawAuraData` cast removed; `AuraAttentionItem`
removed (dead type); 3 `?? null` capacity normalizations stay (intentional
digest-contract behavior). Typecheck + build pass on first attempt.

### User attention needed?
No — scope and API surfaces match the spec. The two out-of-scope changes
(`AuraAttentionItem` removal, cast removal) are minor and consistent with the
slice's intent. No public API surface changed; no dependent slice is
affected beyond what the spec predicted.
