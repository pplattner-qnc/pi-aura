---
kind: task
type: feature
slug: call-site-migration
title: Migrate aura.ts/aura-digest.ts to AuraClient; dedupe types.ts
map: aura-access-rewrite
status: ready
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
