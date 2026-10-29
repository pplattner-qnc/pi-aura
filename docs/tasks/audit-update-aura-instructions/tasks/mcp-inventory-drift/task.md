---
type: task
subtype: research
title: What exactly differs between the aura skill's documented MCP surface and the live aura-mcp-dev server?
status: stable
workflow_state: ready
blocked_by: []
---

## Question

`skills/core/aura/SKILL.md` documents a 90-tool server, exactly 10 `mcp*`
tools, a list of capabilities that "left MCP entirely", and no
response-format contract. The live aura-mcp-dev server (build 2026-10-12,
commit 4aa37833) exposes 120 tools. Enumerate every claim-level difference,
claim by claim:

- total tool count and per-family counts;
- the `mcp*` list (planning already saw the 10 unchanged; verify);
- which "left MCP" capabilities are back (capacity: `readCapacity`,
  `updateTaskMemberCapacity`, `updateTaskMemberParticipation`; board:
  `getBoardSummary`; user search: `searchUsers`, `listUsers`; Jira/Asana:
  `getTaskByJiraKey`, `getAsanaTask`, `listAsanaTasks`; wiki files:
  `listKnowledgeFiles`) and which really are still absent;
- renamed tools (`code_search`, `code_read_file`, `code_list_tree`,
  `code_find_related`, `code_list_repositories` versus the old code-search
  names the usecase docs use);
- removed tools (documented but no longer present);
- new families and what each is for (roadmap goals, story points, user
  groups, projects, tags, memory ingest and question, knowledge versioning
  and restore, space CRUD, frontmatter save, aiSetup and getBlueprintFiles,
  getTaskNeighborhood, batchUpsertTaskPhaseGoals, listMentionCandidates,
  systemHealth, getMyPriorityQueue, listMyProgress, listTaskActivity,
  discardTask, reopenTask, updateTaskBlocked);
- the compact / detail / full `response_format` contract and the
  permission-apparatus exclusion, exactly as the server instructions state
  them.

## Unblocks

The SKILL.md rewrite decisions and every usecase-resource update ticket.

## Trusted sources

- Live MCP introspection only: `describeNamespace("mcp__aura_mcp_dev")`,
  `describeTool` per tool, and the namespace `instructions` string.
- The skill file itself, `skills/core/aura/SKILL.md`.

No wiki, external docs, or web needed for this task.

## Evidence

A per-claim drift table in
`docs/tasks/audit-update-aura-instructions/tasks/mcp-inventory-drift/report.md`:
one row per claim (claim as written with file and line, live truth,
citation: tool name or instruction excerpt). Every row grounded in
introspection output; no row inferred from memory.

## Likely dependents

`usecase-resources-drift` consumes the inventory as an index;
`root-docs-drift` reuses the count and mcp* findings; to-spec consumes the
report.
