---
type: task
subtype: research
title: What changed in the Aura REST API since the local openapi.yaml (synced Sep 1), and which changes affect the REST docs, the typed client, and aura.mjs?
status: stable
workflow_state: done
blocked_by: []
---

## Question

Run the spec sync mechanics (`task openapi-sync`, or
`scripts/openapi-sync.sh` directly: a depth-1 clone of
`git@bitbucket.org:anwaltde/aura.git`, comparing
`src/api/openapi/openapi.yaml` against
`packages/shared/openapi/openapi.yaml`). Produce an endpoint-level diff
(added / changed / removed paths and operationIds, and schema changes that
matter to consumers) and map each change to its consumers:

- `scripts/src/gen-rest-doc.ts` output (the `rest-api.md` reference);
- `packages/shared/src/generated` (the typed client; regeneration itself is
  a later ticket, not this task);
- `scripts/src/aura.ts` commands (artifact / wiki / upload);
- the extensions' REST calls.

This task reports only: no files under `packages/` or `scripts/` are
modified, no codegen runs, nothing is committed.

## Unblocks

The spec sync, codegen, rest-api.md regen, and consumer-fix tickets.

## Trusted sources

- The Aura source repo spec via the sync mechanics.
- The local spec and its consumers (gen-rest-doc.ts, aura.ts, the
  generated client).

## Constraint (user instruction)

If the Bitbucket clone fails (no SSH access, auth rejected), ask the user
how to obtain the current spec instead of concluding it is unavailable.

## Evidence

An endpoint-level diff report in
`docs/tasks/audit-update-aura-instructions/tasks/openapi-spec-drift/report.md`
with a consumer-impact section per change.

## Likely dependents

to-spec; extensions-instruction-drift for extensions that encode REST
shapes.

## Notes

Resolved 2026-11-09 by diffing the Aura source repo spec (throwaway depth-1 clone at 4aa37833, verified identical to the live server build commit) against packages/shared/openapi/openapi.yaml (last synced Sep 1), with consumer mapping across scripts/src/gen-rest-doc.ts, packages/shared/src/generated, scripts/src/aura.ts, and the extensions. Evidence report: .work/report.md.

Settled results:
- The artifact review/approval flow is gone from the REST API: all 11 review/decision operations (local spec L6897-7288) were removed and replaced by a 7-operation artifact-opinion family (requestArtifactOpinions, submitArtifactOpinion, listArtifactOpinions, withdrawArtifactOpinionRequest, beginArtifactOpinion, and friends). Six aura.ts subcommands are broken against the live server today: artifact review-get, review-approvals, review-request, review-start, review-decide, review-reopen (the endpoints 404; no regeneration needed to break them). This matches process-resources-source's independent finding that the aura.mjs artifact review-* subcommands are dead.
- Spec-wide path-parameter rename wave: 130 of 138 changed operations; {uuid} to {id} in 105 operations, plus {key} to {human_key} and friends. Wire-compatible (same URL shapes), but breaks the hey-api-aura-client.ts path-param objects at regeneration time.
- mcpUpdateArtifact can now fail with HTTP 200: McpUpdateArtifactResponse became oneOf Ok/Error (clone L24310); aura.ts artifact update and artifact section print "updated ..." on application-level errors.
- ArtifactKind changed from [PLAN, REVIEW, GENERIC] to [PLAN, OPINION, GENERIC, TEMPORARY]; McpCreateArtifactRequest.kind now refs CreatableArtifactKind, so artifact create --kind REVIEW is rejected.
- 78 added operations (roadmap goals 16, task gates 15, repo webhooks 10, wiki bindings 8, disciplines 9, check-instructions 7, opinions 7, llm-generations 2, cycle-time report, capacity reset, my-progress, updateTaskBlocked); 13 removed; 138 changed of 260 common. Two new clone operations have no operationId and are intentionally skipped by the loader.
- Consumer-relevant schema changes: TaskListItem and TaskDetail gain urgent_deadline, is_blocked, gates, and roadmap fields; KnowledgeVersion, BlueprintFile, and KnowledgeNodeFile user ids change integer to uuid; BoardTaskRef renames uuid to id (breaks mapBoardSummary, hey-api-aura-client.ts:723); four wrapper-imported types disappear (ArtifactReviewOverview, ArtifactApprovalsResponse, ArtifactReviewPersonStatus, ArtifactReviewStartRequest).
- rest-api.md regen impact: 5 new sections (RoadmapGoals, Disciplines, CheckInstructions, Reports, llm-generations), llm-turns removed, Repositories 15 to 33, Tasks 77 to 92, Artifacts 23 to 19; the rest-index.ts blob (273 operations, Sep 1) hides all 78 new operations from rest list/describe/search and 404s/422s the removed ones.
- Extensions are nearly unaffected: aura-references (listTasks, listArtifacts, wiki) and aura-feedback (POST /feedback unchanged) keep working; only the artifact-ref kind documentation goes stale (OPINION and TEMPORARY now exist).
- response_format appears in neither spec (0 hits in both): the compact/detail/full tiers are generated purely in the Aura MCP layer; REST consumers always get the full projection. This settles the map's response_format fog question: the aura.mjs REST flows are unaffected by the MCP tier contract.

Recommendation (high confidence on the diff itself; inferred, not probed over HTTP: the live server 404s on removed endpoints, and hey-api keeping orphaned schemas as exported types): run the spec sync first, then regenerate in one order-dependent chain (typed client, rest-index, rest-api.md), with the review-to-opinions migration split out as its own ticket touching hey-api-aura-client.ts, aura-client.ts domain types, the six aura.ts subcommands, and two skill resource pages; fix the mechanical regen breakages (path-param names, BoardTaskRef, the Ok/Error branch) in the same regen ticket.

Open questions for to-spec and the operator: whether the review-* subcommands have live users, and whether the migration target is the opinion flow or removal; whether artifact opinions reach the MCP layer at all (the current 120-tool MCP set has neither review nor opinion tools).
