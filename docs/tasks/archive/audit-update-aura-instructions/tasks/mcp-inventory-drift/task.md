---
type: task
subtype: research
title: What exactly differs between the aura skill's documented MCP surface and the live aura-mcp-dev server?
status: deprecated
workflow_state: done
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

## Notes

Resolved 2026-11-09 against the live introspection dump (server build 4aa37833, 2026-10-12, 120 tools). The dump at this task's .work/introspection-dump.md is the shared live-surface evidence file for the whole effort. Evidence report: .work/report.md (311 lines: per-claim drift table, definitive mcp* list, left-MCP scorecard, renamed tools, removed tools, internal contradictions, family index of all 120 live tools, verbatim response-format contract, rewrite recommendation, open items).

Settled results:
- Live surface: 120 tools versus SKILL.md's 90 (two occurrences: L10-11, L81-82). No documented tool name was removed; every name SKILL.md mentions resolves in the live 120.
- The 10 mcp* tools are correct in name and count; three one-liners drifted: the artifact kind review is now OPINION, the upload description is base64 plus 10 MB, and the artifact mode full is renamed whole (with section limits 50,000 / whole 200,000 characters and the expected_version contract).
- The "left MCP entirely" paragraph (L98-102) is the big drift, scored claim by claim: capacity (readCapacity, updateTaskMemberCapacity, updateTaskMemberParticipation), board summary, and owner/crew search are fully back; Jira/Asana reads, wiki file reads, and memory browse plus ingest are half back (link, edge, and upload writes still absent); notifications write, the artifact review flow, skills import, and wiki upload really are still absent.
- SKILL.md documents no response-format contract. Live: compact is the default, detail on the 16 tools that declare it, full only on getTask / getTaskByHumanKey; response_format is MCP-only, not part of the HTTP API; the 13-field permission apparatus is excluded from every MCP tier but reachable via REST with the same PAT.
- Internal contradictions in SKILL.md itself: L37 versus L98 (capacity), L94-96 (notifications listed among "all other tools" though zero exist), L38 "threaded comments" versus the live flat comments.
- The code-search usecase doc already uses the live code_* names, contradicting this task's premise (matching usecase-resources-drift's finding).
- About 30 new tools across 14 families, each grounded with a one-line purpose in the report's family index.

Recommendation (report section 9, high confidence, everything dump-grounded): the SKILL.md rewrite replaces 90 with 120 citing the build identity once, keeps the mcp* list with the three one-liner fixes, replaces the left-MCP paragraph with the scorecard, adds the response-format contract and the permission exclusion, adds the new families at bullet level, rewords "threaded comments" pending product confirmation, re-derives the REST example list from the live spec, and resolves the L37/L98 contradiction by stating the current truth once.

Open items: whether mcpCreateUploadDocument still creates an artifact (not determinable from introspection; needs a probe or the REST doc); the ~273 REST operation count (SKILL.md L122) is unverifiable from MCP introspection and falls to openapi-spec-drift; the report lives at .work/report.md rather than the task text's report.md because the docs/tasks write guard exempts only .work/ for evidence.
