---
type: task
subtype: research
title: Which instructions in the 13 usecase resource files are stale against the live tools?
status: deprecated
workflow_state: done
blocked_by: []
---

## Question

For each of the 13 files under `skills/core/aura/resources/usecases/`
(unified-search, task-management, artifact-management, wiki-knowledge,
code-search, upload-documents, capacity-planning, questions-workflow,
memory-graph, signals, skills-management, feedback-submission), list every
stale instruction:

- tool names that no longer exist (the old code-search names in
  code-search.md);
- guidance that contradicts the live surface (capacity-planning.md
  teaching hand-crafted REST calls while `readCapacity`,
  `updateTaskMemberCapacity`, and `updateTaskMemberParticipation` are back
  on MCP);
- documented parameters or flows that changed;
- new live tools the file should mention but does not (comments write,
  memory ingest, knowledge versioning / restore / frontmatter, discard /
  reopen / updateTaskBlocked, story points, phase goals, mention
  candidates, priority queue, progress / activity, projects, tags, user
  groups).

## Unblocks

The usecase-resource update tickets in the spec.

## Trusted sources

- The 13 usecase files themselves.
- Live `describeTool` output for every tool a file references or should
  reference (the mcp-inventory-drift report is a useful index if already
  present; this task may also start independently).

## Evidence

A file-by-file stale list in
`docs/tasks/audit-update-aura-instructions/tasks/usecase-resources-drift/report.md`:
per file, the stale lines (quote plus line number) and the corrected
instruction grounded in describeTool output.

## Likely dependents

to-spec; root-docs-drift where README repeats usecase claims.

## Coordination note

capacity-planning.md updates must state the MCP capacity tools are back
while leaving room for the capacity CLI subcommands (live effort
`add-capacity-subcommands`, kept as-is by user decision).

## Notes

Resolved 2026-11-09 by a delegated read-only researcher working from the live introspection dump (docs/tasks/audit-update-aura-instructions/tasks/mcp-inventory-drift/.work/introspection-dump.md; server build 4aa37833, 120 tools). Evidence report: docs/tasks/audit-update-aura-instructions/tasks/usecase-resources-drift/.work/report.md (641 lines; every stale line quoted with its line number, every correction grounded in a dump citation; the report also records the task text's 13-files count as a planning-time miscount, 12 files exist).

Settled results:
- capacity-planning.md is actively false: readCapacity, updateTaskMemberCapacity, and updateTaskMemberParticipation are live on MCP. Its blanket REST-ONLY claims and its 195-to-90 tool count must be rewritten; getCapacitySettings / updateCapacitySettings and the per-task cross-member view stay REST-only, and the rewrite stays neutral toward the add-capacity-subcommands CLI effort.
- Systemic parameter drift uuid to id across five files: signals.md, wiki-knowledge.md, skills-management.md, task-management.md, unified-search.md.
- wiki-knowledge.md shape changes: saveKnowledgeNodeFrontmatter takes id plus raw (a YAML string or null), not uuid plus a frontmatter object; restoreKnowledgeNodeVersion takes the version as a decimal string; listKnowledgeFileVersions is unmentioned.
- task-management.md L151-L153 is false (owner/crew assignment is on MCP: addTaskMember, setTaskMemberRoles) and the file misses whole live families: updateTaskBlocked, the story-point tools, getMyPriorityQueue, listMyProgress, listTaskActivity, the user-group tools, linkRepositoryToTask, and createTask's workflow_variant.
- code-search.md already uses the live tool names; its stale bits are the nonexistent ref parameter and mcpGetRepoDocument's repo_slug format (must be source/workspace/slug).
- unified-search.md misses FEEDBACK in source_types; limit is per source type (1 to 20, default 5).
- artifact-management.md: the pending_review filter is now opinion_requested; listArtifactTasks and mcpUpdateArtifact's expected_version / confirm_full_replace whole-mode contract are undocumented.
- upload-documents.md is fully current; feedback-submission.md and questions-workflow.md are current on their own mechanics with small coverage gaps; memory-graph.md: reportMemoryEntityQuestion has no reason parameter and creates open questions, and getMemoryEntitySource returns a navigable route, not provenance.

Recommendation (high confidence for everything dump-cited): the update tickets rewrite capacity-planning.md first (it actively misdirects agents), then run the mechanical uuid-to-id sweep across the five files, then close per-file gaps in priority order (task-management missing families, wiki frontmatter and file versioning, unified-search FEEDBACK, artifact filters and whole-mode contract).

Open questions carried forward: where user-group and feedback-triage tools belong (extended existing files or new usecase files; this is the map's granularity fog item); task-management.md L38's planning-hub phrasing needs payload verification before being kept; aura.mjs CLI subcommands were outside this task's evidence scope.
