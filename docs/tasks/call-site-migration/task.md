---
kind: task
type: feature
slug: call-site-migration
title: Migrate aura.ts/aura-digest.ts to AuraClient; dedupe types.ts
map: aura-access-rewrite
status: done
slices:
- migrate-aura-digest
- migrate-aura-cli
- dedupe-types
---

## User-visible outcome

`aura.ts` and `aura-digest.ts` stop using `McpClient.callTool(name, args)`
and instead call the `AuraClient` interface (via `createDefaultAuraClient()`).
The hand-maintained Aura shapes in `types.ts` that overlap with the new
domain types are removed (replaced by imports from `@pi-aura/shared/aura-client`);
the digest-specific types (`Digest`, `DigestQueueRow`, etc.) stay.

## User story

As a maintainer, I want the scripts to call Aura through the typed
`AuraClient` instead of the MCP wrapper, so the MCP dependency is gone from
the Aura path and the types are single-source.

## Scope boundaries

- `aura-digest.ts` and `aura.ts` in `scripts/src/` are migrated.
- The dev-links path (`devlinks.ts`) keeps using `McpClient` for the
  Atlassian Teamwork Graph (out of scope) — only the Aura `callTool`s are
  migrated.
- `types.ts`: remove the Aura-API-response shapes that now have domain-type
  equivalents (`Artifact`, `Task`, `BoardBriefing`, etc.); keep the
  digest/report/diff types that have no spec equivalent.
- Does **not** touch `bitbucket.ts`, `devlinks.ts`'s Atlassian calls,
  `mcp-client.ts` (kept for Atlassian), or `clients.ts`'s `atlassianClient`.
- Does **not** remove `bearerClient` (that's the cleanup task).

## Acceptance criteria

- `aura.ts` and `aura-digest.ts` import `AuraClient` /
  `createDefaultAuraClient` from `@pi-aura/shared/aura-client`, not
  `bearerClient`/`McpClient`, for all Aura calls.
- All 21 distinct Aura verbs the scripts called are now `AuraClient`
  methods.
- `types.ts` no longer defines shapes that duplicate the domain types
  (compile errors from the removal confirm the migration uses the domain
  types).
- `make build` produces both `.mjs` outputs; `make typecheck` passes.
- The built `aura.mjs` and `aura-digest.mjs` run end-to-end against a real
  Aura instance (manual smoke).

## Existing abstractions to use

- `@pi-aura/shared/aura-client` — the interface + factory.
- `scripts/src/types.ts` — for the digest-specific types that remain.

## Architecture / domain decisions

From the first grilling: full access-layer redesign with the interface seam
(Q2), dedupe overlapping types (Q8), ~21 verbs (Q11), keep the
digest-specific types.

## Implementation notes

### Slice: migrate-aura-digest (landed)

All ~12 Aura `callTool` calls in `aura-digest.ts` replaced with `AuraClient`
methods via `createDefaultAuraClient()`. `REQUIRED_TOOLS` /
`assertToolsAvailable` / `client.connect()` removed. The 8-call parallel
`Promise.all` block stays parallel against `aura.<method>(...)`.
`getTaskByHumanKey` (×2), `getArtifactReview` (×2), `getArtifactApprovals`
(in `verifyArtifacts`) all migrated. `verifyArtifacts` retyped to
`client: AuraClient`. Both Aura `client.close()` calls dropped (Seam A);
the Atlassian `McpClient` path (`buildAtlassianClient`,
`fetchTaskDevLinks`, `atlassian.close()`) untouched (out of scope). Seam C
(`current_version` → `latest_version`) applied at 3 sites.

**Build-config note:** `dbus-next` added to `scripts/esbuild.config.mjs`
`external` array (transitively pulled in by `createDefaultAuraClient()` →
keyring on Linux; its optional `x11` dep can't bundle). Same external-marking
pattern as the existing `@napi-rs/keyring` entries. `migrate-aura-cli` will
inherit this fix (shared config).

**Transitional items flagged for `dedupe-types` (Level 2):**
- `as unknown as RawAuraData` cast — domain types use `undefined` where
  `RawAuraData` (typed from `types.ts`) uses `null`. Reconcile `RawAuraData`
  to domain types and remove the cast.
- `?? null` normalization at 3 capacity-boundary sites — can stay or fold into
  the `RawAuraData` reconciliation.
- `fetchTaskDevLinks` signature kept on `AuraTaskDetail` (structurally
  compatible with domain `Task`); retype to `Task`.
- Remove now-unused `Aura*` types from `types.ts`.
- Stale line-21 comment still references `assertToolsAvailable` (cosmetic).

### Slice: migrate-aura-cli (landed)

All 11 Aura `callTool` calls in `scripts/src/aura.ts` replaced with
`AuraClient` methods via `createDefaultAuraClient()`. `bearerClient` /
`McpClient` / `loadSettings` imports removed; `AuraClient`, domain types
(`Artifact`, `KnowledgeNode`, `WikiSearchResult`, `KnowledgeTree`,
`UploadDocument`, `ArtifactKind`) imported from `@pi-aura/shared/aura-client`.
All 11 async subcommand functions retyped `client: McpClient` →
`client: AuraClient`. All `await client.close()` calls dropped (Seam A).
Local interfaces `ArtifactDetail`, `WikiNodeDetail`, `UploadDocumentDetail`
removed, replaced by domain types. `dbus-next` external inherited from
`migrate-aura-digest` (no esbuild config change needed).

**Field renames:** Artifact `current_version` → `latest_version`;
KnowledgeNode `uuid` → `id`, `version` → `latest_version`; UploadDocument
pages `p.text` → `p.content`.

**Seam B (getKnowledgeNodeByPath):** CLI `--slug` split at first `/` into
`spaceSlug` + `path`; if no `/`, whole slug is the space slug and path is
empty string. `includeBody: true` opt passed to `getKnowledgeNode` and
`getKnowledgeNodeByPath` for clarity (REST ignores it; always returns body).

**Transitional items flagged for `dedupe-types` (Level 2):**
- `wikiSearch` output: domain `WikiSearchHit` has `title`, `space_slug`,
  `url`, `excerpt`, `heading_path`, `match_source`, `id` — no `slug` or
  `score`. CLI now prints `title`/`space_slug`/`url` instead of `slug`/`score`.
  Minor output format change; flagged for awareness.
- `artifactCreate` kind casting: CLI `--kind` is `string` but
  `CreateArtifactInput.kind` expects `ArtifactKind`; cast with
  `opts.kind as ArtifactKind` (runtime value passed through unchanged).

### Slice: dedupe-types (landed)

20 hand-maintained Aura-API-response shapes removed from
`scripts/src/types.ts` (`AuraHumanKey`, `AuraCapacityTask`, `AuraCapacity`,
`AuraPriorityQueueItem`, `AuraPriorityQueue`, `AuraNotification`,
`AuraNotificationList`, `AuraArtifact`, `AuraArtifactList`,
`AuraBoardBriefing`, `AuraBoardSummaryItem`, `AuraBoardSummaryBucket`,
`AuraBoardSummary`, `AuraAttentionItem`, `AuraTask`, `AuraTaskList`,
`AuraTaskDetail`, `ArtifactReview`, `ArtifactApprovalDecision`,
`ArtifactApprovalState`). `types.ts` dropped from ~400 to 296 lines and now
imports 9 domain types (`ApprovalDecision`, `ArtifactApprovals`,
`ArtifactList`, `BoardBriefing`, `BoardSummary`, `Capacity`,
`NotificationList`, `PriorityQueue`, `TaskList`) from
`@pi-aura/shared/aura-client`. The digest/report/diff/dev-link types with no
spec equivalent (`Digest`, `DigestQueueRow`, `RawAuraData`, `AuraReport`,
`ArtifactVerification`, `TaskDevLinks`, etc.) stay.

Embedded references retyped to domain equivalents: `DigestReview.decisions`
and `DigestCorrection.current_decisions` → `ApprovalDecision[]`;
`ArtifactVerification.current` → `ArtifactApprovals | null`; all 8
`RawAuraData` fields → domain types (`BoardBriefing`, `BoardSummary`,
`NotificationList`, `PriorityQueue`, `Capacity`, `ArtifactList`, `TaskList`);
`devlinks.ts` `fetchTaskDevLinks` + `taskText` params → `Task`.

**Divergence from plan (both minor, consistent with slice intent):**
- `AuraAttentionItem` removed — not in the arch spec's explicit "Types to
  remove" list, but a dead Aura-response shape with no domain equivalent and
  no consumers outside `types.ts` after Slices 1+2. Removed as a dead type.
- `as unknown as RawAuraData` cast removed in `aura-digest.ts` — the
  transitional cast from Slice 1 is no longer needed once `RawAuraData`
  fields were retyped to domain types. The `raw` object is now directly
  annotated `const raw: RawAuraData = {...}` with no cast.

**Intentional non-changes:** The 3 capacity-boundary `?? null` sites in
`aura-digest.ts` stay. These map domain types (which use `undefined` for
optionals like `capacity_percent?: number`) to the digest JSON contract
(which uses `null` for `capacity_pct: number | null`). This is intentional
runtime behavior, not a type-source duplication issue.

Typecheck + build passed on first attempt — no removed-type references
needed fixing, confirming Slices 1+2 had already migrated all call sites to
domain types.

### Architecture lessons (for `clients-cleanup`)

- **`aura.ts` + `aura-digest.ts` no longer import `bearerClient`/`McpClient`
  for Aura.** They use `createDefaultAuraClient()` from
  `@pi-aura/shared/aura-client`. `bearerClient`'s Aura path is now dead and
  can be removed in `clients-cleanup` (keep `atlassianClient`/
  `readOAuthTokenFromKeyring`/`McpClient` — the Atlassian/devlinks path still
  uses them).
- **`scripts/src/generated/` is dead.** Both scripts now reach Aura via
  `packages/shared/src/generated/` (through `HeyApiAuraClient`). The old
  `scripts/src/generated/` tree + `scripts/openapi*` + the `@hey-api/*` deps
  in `scripts/package.json` can be removed in `clients-cleanup`.
- **`dbus-next` is an esbuild external.** `scripts/esbuild.config.mjs` marks
  `dbus-next` external (transitively pulled in via `@pi-aura/shared` keyring
  on Linux; its `address-x11.js` has an optional `require("x11")` that can't
  bundle). Keep this entry; do NOT remove it when pruning `scripts` deps.
- **Field renames to remember if old code is re-read:** Artifact
  `current_version`→`latest_version`; KnowledgeNode `uuid`→`id`,
  `version`→`latest_version`; UploadDocument pages `p.text`→`p.content`.
- **`getKnowledgeNodeByPath` takes `(spaceSlug, path, opts)`** — the CLI
  splits `--slug` at the first `/`. The MCP `slug`-as-full-path shape is gone.
- **`types.ts` is now digest/report/diff/dev-link types only.** The
  Aura-response shapes are single-sourced in `@pi-aura/shared/aura-client`.
  `clients-cleanup` can prune `types.ts` further only if a digest type becomes
  unused; the Aura shapes are already gone.
- **`dataflow.tldraw`** is an unrelated tracked diagram file that editors
  modify on open; revert it before any commit/merge if it shows as modified.
