---
type: task
subtype: research
title: Where is the current source of truth for the 7 process resources, and what in Aura's process changed since they were written?
status: stable
workflow_state: ready
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
