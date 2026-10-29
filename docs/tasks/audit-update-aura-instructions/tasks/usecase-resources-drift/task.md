---
type: task
subtype: research
title: Which instructions in the 13 usecase resource files are stale against the live tools?
status: stable
workflow_state: ready
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
