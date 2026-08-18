---
kind: slice
slug: migrate-aura-digest
title: Migrate aura-digest.ts call sites to AuraClient
task: ../task.md
mode: hitl
status: todo
size: l
blocked_by: []
---

## End-to-end behavior

`aura-digest.ts` (the morning-routine fetch script) calls Aura via the
`AuraClient` interface instead of `McpClient.callTool`. The ~12 Aura calls
(getBoardBriefing, getBoardSummary, listNotifications, getMyPriorityQueue,
getMyCapacity, listArtifacts, listTasks x2, getArtifactApprovals,
getTaskByHumanKey, getArtifactReview x2) become `AuraClient` methods.

## Acceptance criteria

- `aura-digest.ts` constructs `const aura = await createDefaultAuraClient()`
  instead of `bearerClient(...).connect()`.
- All Aura `callTool` calls replaced with `aura.<method>(...)`.
- The dev-links section's `client.callTool<AuraTaskDetail>("getTaskByHumanKey",
  ...)` (Aura) is migrated; the `atlassian.callTool(...)` (Teamwork Graph)
  is **not** migrated (out of scope — keeps `McpClient`).
- `REQUIRED_TOOLS` / `assertToolsAvailable` removed (no MCP tool discovery
  anymore).
- `make build` produces `skills/aura-digest/dist/aura-digest.mjs`; the
  built bundle runs `fetch` end-to-end against a real Aura instance.

## Test plan

- Seams: the `AuraClient` interface is the seam — a fake impl can unit-test
  the digest assembly without Aura.
- Failure modes: a missing PAT -> `createDefaultAuraClient()` throws with
  the "run /aura secrets discover" message (from the factory slice).
- Scenarios: `node skills/aura-digest/dist/aura-digest.mjs fetch` produces
  `raw.json` + `digest.json` + `report.json` with real data.
- Edge cases: the parallel `Promise.all` fetch block (8 calls) must stay
  parallel against the `AuraClient` methods.

## Constraints / dependencies

- Blocked by `aura-client` (need the interface + factory).
