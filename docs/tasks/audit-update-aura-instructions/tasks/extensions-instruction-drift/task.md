---
type: task
subtype: research
title: Which instruction texts and encoded behaviors in the shipped extensions are stale against current Aura?
status: stable
workflow_state: done
blocked_by: []
---

## Question

The extensions inject or encode instructions agents consume every session:
`aura-skill-instruction.ts` (the system-prompt Aura block),
`aura-tasks.ts` (task-ref rendering: statuses, kinds),
`aura-references.ts` plus `aura-reference-cache.ts` (mention resolution:
task / artifact / wiki kinds and versions), `aura-feedback.ts`,
`aura-secrets.ts`, `aura-health.ts`, `engineering-rules.ts` (cursor-rules
injection). For each, list the instruction text or encoded behavior that is
stale against current Aura: status lists, kind lists, response shapes, MCP
tool names, version fields.

Skip `atlassian-provision.ts`: remove-digest deletes it.

Also determine whether `aura-health.ts` is wired at all. Planning found no
importer and no package.json registration for it; verify and report whether
it is dead code (and what it was for).

## Unblocks

The extension update tickets.

## Trusted sources

- The extension sources under `extensions/`.
- Live `describeTool` output for the tools each extension calls or
  describes.
- Read-only live probes where behavior must be observed (for example a
  task-ref shape); never writes.

## Evidence

An extension-by-extension stale list in
`docs/tasks/audit-update-aura-instructions/tasks/extensions-instruction-drift/report.md`
(file and location, stale text or behavior, grounded correction), plus the
aura-health wiring verdict.

## Likely dependents

to-spec; openapi-spec-drift feeds REST-shape findings for extensions that
call REST directly.

## Notes

Resolved 2026-11-09 against the extension sources, live read-only probes (task, artifact, wiki, skill, feedback shapes), the introspection dump, the local spec, and git history. Evidence report: .work/report.md (572 lines; extension-by-extension stale list plus wiring verdicts).

Settled results:
- aura-references.ts task adapter sends stale query params (L943-944, L991): search: partial and status: "ALL". The live API's search param is q (openapi.yaml SearchParam L10288; dump listTasks q L1760) and no status param exists (the live params are status_slug / status_type; "ALL" is not one of the 13 live statuses). Inferred effect: the stale-while-revalidate refresh never filters by the typed partial; the call itself does not fail (cache rows were written 2026-11-09, after the Oct 12 build).
- aura-references.ts wiki tree derivation is broken against live (L1448 requires node.kind === "DOCUMENT", L1456 reads node.latest_version): the live getKnowledgeTree returns slim nodes {id, slug, title, source_path, children} with neither field (probe-verified). The local cache holds zero wiki rows ever, versus 190 task and 66 artifact rows. Whether the REST tree is slim like the MCP mirror, and whether REST /mcp/wiki-search still exists, falls to the synced spec at implementation time (the openapi-spec-drift report covers the wiki surface changes; medium confidence, the REST-tree shape is inferred).
- The wiki kind's "no space-listing verb" premise is stale (L136, L1716-1718): REST GET /knowledge/spaces and the live MCP listKnowledgeSpaces exist (openapi.yaml L7939, dump L1405); only the shared client wrapper lacks the verb.
- The REFERENCE_INSTRUCTION artifact kind list is stale (L805): says PLAN, REVIEW, or GENERIC; live creation kinds are PLAN, OPINION, GENERIC plus chat-only TEMPORARY (dump L1873-1874); a live probe observed PLAN and GENERIC. The openapi-spec-drift report confirms ArtifactKind dropped REVIEW.
- aura-feedback.ts names a nonexistent tool (L258, L6): aura-mcp-dev_createFeedback; the current pi naming is mcp__aura_mcp_dev__createFeedback. The same stale token sits in skills/core/aura/SKILL.md:140 and resources/usecases/feedback-submission.md:33 (skill tasks' scope, already enumerated by mcp-inventory-drift and usecase-resources-drift).
- Verified current, no correction needed: task-ref status examples (OPEN, IN_REVIEW, DONE are members of the current 13-status series), getTaskByHumanKey fallback, artifact q and latest_version wiring, wiki uuid-form per-node reads, feedback limits (title 120, body 50), source MCP, feedback status enum.
- No Aura-surface drift in aura-skill-instruction.ts, aura-tasks.ts, aura-secrets.ts, engineering-rules.ts, aura-reference-cache.ts. Side note: em-dashes inside the injected strings of aura-skill-instruction.ts:17/:19 and aura-tasks.ts:99.
- aura-health.ts verdict: deleted code, not dead code. It was removed with its package.json registration in commit 89d8ed4 (2026-08-18, the mcpx-era health check); aura-health.test.ts survives and is alive, testing the probe that moved into aura-tasks.ts (06265d3). The planning premise that the file ships was stale; this settles the map's aura-health fog question. Recommendation: optionally rename aura-health.test.ts so it stops naming a deleted module.
- atlassian-provision.ts: already deleted (8e51afe, 2026-10-30); remaining references are intentional guards (no-remnants.test.ts) or history.
- Shared-client typing feeds the extensions: ListTasksInput (aura-client.ts L329-343) still declares status / search / archived: boolean; fix together with the extension.

Recommendation (high confidence on findings 1, 4, 5, 8, 9; medium on the wiki-tree mechanism): the clear-cut extension tickets are the q fix with the status: "ALL" removal and the tool-name fix; gate the artifact kind list and the wiki repair on the synced spec (the wiki fix needs one REST probe to pick between the slim-tree and dead-endpoint mechanisms); optionally rename aura-health.test.ts.

Open items for the update tickets: live REST tree response shape (slim vs projected); live REST /mcp/wiki-search versus /knowledge/search; the full stored artifact-kind enum (whether stored REVIEW artifacts still read back). The report lives at .work/report.md (the gitignored, guard-exempt evidence location) while task.md's Evidence section says report.md.
