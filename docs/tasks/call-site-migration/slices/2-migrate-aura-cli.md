---
kind: slice
slug: migrate-aura-cli
title: Migrate aura.ts (artifact/wiki/upload CLI) call sites to AuraClient
task: ../task.md
mode: hitl
status: todo
size: m
blocked_by: []
---

## End-to-end behavior

`aura.ts` (the artifact/wiki/upload workdir CLI) calls Aura via `AuraClient`
instead of `McpClient.callTool`. The ~12 Aura calls (getArtifact,
mcpUpdateArtifact, mcpCreateArtifact, getKnowledgeNode, getKnowledgeNodeByPath,
saveKnowledgeNodeBody, mcpWikiSearch, getKnowledgeTree, createKnowledgeNode,
mcpCreateUploadDocument, mcpGetUploadDocument) become `AuraClient` methods.

## Acceptance criteria

- `aura.ts` constructs `const aura = await createDefaultAuraClient()` instead
  of `bearerClient(...).connect()`.
- All Aura `callTool` calls replaced with `aura.<method>(...)`.
- The workdir model (freshWorkdir / writeWorkdir / removeWorkdir) is
  unchanged — only the Aura calls change.
- `make build` produces `skills/aura/dist/aura.mjs`; the built bundle runs
  `artifact get` / `wiki get` / `upload create` end-to-end.

## Test plan

- Seams: `AuraClient` interface; a fake impl unit-tests the workdir
  lifecycle without Aura.
- Failure modes: a missing PAT -> factory throws; large body (>500 chars)
  still uses the workdir file path, not a direct call (the LARGE_BODY_THRESHOLD
  behavior is preserved).
- Scenarios: `node skills/aura/dist/aura.mjs artifact get <uuid>` writes a
  workdir; `artifact update <workdir>` uploads and removes it.
- Edge cases: `upload create` base64-encodes a file — that's local, not an
  Aura call; the `mcpCreateUploadDocument` call carries the base64.

## Constraints / dependencies

- Blocked by `aura-client`.
