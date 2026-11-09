---
type: ticket
subtype: feature
title: Usecase resources current
status: stable
workflow_state: ready
blocked_by:
- mention-machinery-mcp
- feedback-mcp-submission
- remove-cli-rest-surface
- rest-library-consumer-rule
- engineering-surfaces-move-out
size: l
---

## What to build

All twelve usecase resources become current against the live server, working from the usecase-resources report's per-file worklist and the confirmed placement map:

- capacity-planning.md is rewritten: the three capacity MCP tools (readCapacity, updateTaskMemberCapacity, updateTaskMemberParticipation) are the documented primary path, including their scope semantics; company capacity settings and the per-task cross-member view stay REST-only and get UI pointers; the false blanket REST-only claims and the stale tool counts are gone.
- The uuid-to-id parameter sweep lands across the task, signals, wiki, skills, and unified-search files.
- wiki-knowledge.md documents the frontmatter save contract (identifier plus a raw YAML string or null), the version numbering shapes (version as a decimal string), and the file-asset version history.
- task-management.md gains the family sections per the placement map (owner and crew management, the blocked flag, the story-point flow, the priority queue, progress, activity, user groups, repository linking, the workflow variant, the neighborhood read) and drops its false "no member management on MCP" claim; the flagged "planning hub" phrasing is verified against a live detail payload before it is kept.
- code-search.md drops the nonexistent parameter and documents the repository-slug format.
- unified-search.md adds the FEEDBACK source type and the mention-candidate tool with correct limit semantics.
- artifact-management.md documents the opinion_requested filter and the whole-mode replace contract with expected-version.
- memory-graph.md corrects the ingest contract (no reason parameter; open questions) and the entity-source result (a navigable route, not provenance).
- feedback-submission.md gets the triage section and the fixed tool naming.
- upload-documents.md is re-verified current and left as is.

The two-layer citation policy applies throughout; no em-dashes in touched prose.

## Acceptance criteria

- [ ] Every stale line in the usecase report's per-file lists is corrected or covered by the rewrite; rows verified current stay current.
- [ ] The placement map is honored: family sections exactly where the map puts them; single-call tools stay index-level in the skill file.
- [ ] The capacity file names the three MCP tools as the primary path and the settings view as a UI pointer.
- [ ] No file teaches REST or CLI access; the artifact download pattern taught is codemode plus the write tool.
- [ ] The payload check for the flagged phrasing is recorded with its outcome.

## Blocked by

- mention-machinery-mcp
- feedback-mcp-submission
- remove-cli-rest-surface
- rest-library-consumer-rule
- engineering-surfaces-move-out
