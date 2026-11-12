---
type: task
subtype: research
title: Where is the current source of truth for the 7 process resources, and what in Aura's process changed since they were written?
status: deprecated
workflow_state: done
blocked_by: []
---

## Question

The 7 files under `skills/core/aura/resources/process/` (INDEX,
workflow-phases, roles, capacity, review-modes, escalation, integrations)
encode Aura's development process. Two parts:

(a) Where does this content come from and where does its current version
live? Candidate homes: an Aura wiki space, docs inside the Aura source
repo, or the material the archived `aura-mcp-doc-salvage` effort salvaged
from. Identify the source per file.

(b) What changed in Aura's process since they were written: phase goals
(`batchUpsertTaskPhaseGoals`), story points (estimate / accept / set), task
lifecycle additions (`discardTask`, `reopenTask`, `updateTaskBlocked`,
`getTaskNeighborhood`), roadmap goals, and any change to the phases,
review modes, capacity rules, or integrations themselves.

## Unblocks

The process-resource update tickets.

## Trusted sources

- The Aura wiki (search for the process content; the
  engineering-foundation space is a different canon and probably not this
  content's home, but search it too).
- The Aura source repo: a depth-1 clone of
  `git@bitbucket.org:anwaltde/aura.git` contains more than the spec
  (`scripts/openapi-sync.sh` documents the clone mechanics); process docs
  may live in-repo.
- Live server behavior: `getTask` with response_format detail/full shows
  statuses and allowed next statuses; the story-point and phase-goal tool
  descriptions describe their flows.

## Constraint (user instruction)

If a source cannot be found, ask the user how to get it before concluding
it does not exist. Record any such question and its answer in the report.

## Evidence

A per-file report in
`docs/tasks/audit-update-aura-instructions/tasks/process-resources-source/report.md`:
for each of the 7 files, its identified source (citation: wiki path or repo
path) or the explicit question already asked to the user, plus the drift
list (content claim versus current source).

## Likely dependents

to-spec; usecase-resources-drift for task-lifecycle-related guidance.

## Notes

Resolved 2026-11-09 against the live Aura wiki, a depth-1 clone of the Aura source repo at 4aa37833 (byte-identical to the deployed server build), the archived aura-mcp-doc-salvage effort, and live read-only probes. The hard rule never triggered: every file's source was found. Evidence report: .work/report.md (460 lines, zero em-dashes; provenance chain, per-file source identification with citations, per-file drift lists, process-change section).

Settled results:
- Source of truth for all 7 process files: they are a per-topic split of the wiki article "How We Work in Aura: A Practical Guide" (node 2a6d4f32, v3, 2026-08-06) that landed in this repo's initial commit 67e024b (2026-08-14). On 2026-09-23 that article was archived into knowledge-hub-archive and replaced by six pages under knowledge-hub/way-of-working-and-structures/ (1, 1.1 Roles, 1.2 Workflow Phases, 1.3 Capacity & Resourcing, 1.4 Alignment Review & Escalation, 1.5 Tooling), which map 1:1 onto the local files. Every local file's "Canonical reference" path now 404s.
- Process changes since they were written, all grounded: the status series is no longer one flat chain; there are three series resolved by level plus workflowVariant (STANDARD / DISCOVERY, immutable at creation), the STANDARD series dropped READY_FOR_ALIGNMENT and READY_FOR_REVIEW (AURA-2211), SAGA/SUBTASK get a lean series, and DISCOVERY ends after alignment; verified against the clone and live allowed_next_statuses probes. v18 (2026-10-05) added formal quality gates: sign-off by 37 disciplines, APPROVED/REJECTED verdicts, and status_change_reason required to leave a rejected gate. Reviews became opinions: the artifact-review REST endpoints and the aura.mjs artifact review-* subcommands the files reference are dead; the live surface is /artifacts/{id}/opinions* with a graded scale plus listArtifacts(opinion_requested). The capacity model was overhauled: the 80/20 structural reserve is gone, non-task work goes to the placeholder epic AURA-1686, everyone lands at 100%, and commitments reset to 0% daily at 04:00 (v17); capacity.md's "all capacity tools gone from MCP" is wrong (readCapacity, updateTaskMemberCapacity, updateTaskMemberParticipation are live). Story points shipped in v16 (four live MCP tools; only Stories and Sub-Tasks are eligible; human correction outranks AI). Roadmap goals shipped in v17 (full live MCP surface; tasks carry roadmap_goals). Phase goals now have batchUpsertTaskPhaseGoals and five goal phases (refinement, alignment, development, review, deployment). Lifecycle additions are live and precise: discardTask (owner-only, reason, ends memberships), reopenTask (DONE/DISCARDED to an ACTIVE status), updateTaskBlocked (orthogonal flag, own consent rule), getTaskNeighborhood; v19 lets contributors start phases themselves except deployment. Integrations drifted: Asana sync shipped (create-from-Aura with auto-link), Jira creation is now deliberate, and wiki 1.5 adds "every task needs a parent" (5 operational plus 11 goal-oriented Sagas).
- Recommendation (high confidence for provenance and drift; medium for the holiday/absence automation claim and the tracker-aura FULL-series contradiction, both recorded, not resolved): repoint every canonical header to the 1.x pages, then rewrite workflow-phases.md, capacity.md, and review-modes.md first (highest drift), then integrations.md and roles.md; escalation.md and INDEX.md need only header and minor updates. Never trust the vendored openapi-new.yaml for endpoint checks; use the live clone and the introspection dump.
- Cross-repo finding for the operator: guides/tracker-aura in the engineering-foundation wiki still lists the pre-AURA-2211 FULL status series and contradicts the live server; fixing it is an Aura-side wiki edit outside this repo.
- Judgment calls recorded for the update tickets: whether to re-point the files at the 1.x pages or keep them page-agnostic.
