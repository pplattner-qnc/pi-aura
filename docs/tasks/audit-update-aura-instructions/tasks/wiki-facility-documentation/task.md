---
type: task
subtype: research
title: What does the Aura wiki document about Aura's own facilities, and what should this package's instruction surfaces align with or cite?
status: stable
workflow_state: done
blocked_by: []
---

## Question

The seven drift reports audited this package's instruction surfaces against
live MCP introspection and, where relevant, the Aura source repo and wiki
process canon. Nobody has inventoried the Aura wiki as documentation of
Aura's own facilities. Three parts:

(a) Inventory: which spaces exist (listKnowledgeSpaces) and what does each
contain (getKnowledgeTree per space)? Which spaces document Aura itself
(product, facilities, tools), as opposed to content hosted in Aura (the
engineering-foundation canon, the knowledge-hub process pages, patch notes)?

(b) Facilities: for each facility family in the audit's scope, especially
the ~30 new tools' families (story points, roadmap goals, artifact opinions
and the retired review flow, the capacity model, priority queue, progress
and activity, user groups, projects, tags, memory ingest, knowledge
versioning / restore / frontmatter, mention candidates, the task lifecycle
additions, quality gates, integrations): does the wiki document it, where
(file path or node path), and what does it teach? Include what the
knowledge-hub 1.x way-of-working pages teach about facilities (the
process-resources-source report already maps their existence; extract what
they say per facility), what aura-patchnotes adds, and whether any MCP tool
reference or REST documentation exists in the wiki.

(c) Alignment: per facility, what should this package's rewritten
instruction surfaces (aura SKILL.md, the usecase resources, the process
resources) take from the wiki documentation: align with it, cite it as the
canonical reference, or deliberately diverge (and why)? Flag contradictions
between wiki documentation and the live server (the guides/tracker-aura
status-series bug is the known one).

## Unblocks

The facilities-documentation-grilling task (the operator's decisions about
how to treat each newly added facility), and through it to-spec.

## Trusted sources

- Live wiki, read-only, through codemode calls to the granted tools:
  listKnowledgeSpaces, getKnowledgeTree, searchKnowledge,
  getKnowledgeNodeByPath, getKnowledgeNode, getKnowledgeNodeVersion.
- The live introspection dump at
  docs/tasks/audit-update-aura-instructions/tasks/mcp-inventory-drift/.work/introspection-dump.md
  (the authoritative 120-tool live surface; your own session's
  describeNamespace shows only granted tools, never cite it as the
  inventory).
- The seven done tasks' Notes sections and .work reports as context.
- No Aura writes; introspection and read-only probes only.

## Evidence

A report at
docs/tasks/audit-update-aura-instructions/tasks/wiki-facility-documentation/.work/report.md:
(a) the per-space inventory, (b) the per-facility documentation table
(family, documented where, what it teaches, citation), (c) the per-facility
alignment recommendation, with contradictions flagged.

## Likely dependents

facilities-documentation-grilling; to-spec.

## Notes

Resolved 2026-11-09 against the live wiki (listKnowledgeSpaces, getKnowledgeTree per space, searchKnowledge, getKnowledgeNodeByPath, getKnowledgeNode, getKnowledgeNodeVersion), the introspection dump, and the seven done audit reports. Evidence report: .work/report.md (152 lines; part (a) space inventory, part (b) per-facility documentation table, part (c) per-facility alignment recommendations, contradictions and traps, open questions).

Settled results:
- Space inventory: listKnowledgeSpaces returns 28 spaces (all WIKI or REPOSITORY kind); only five surfaces document Aura itself: aura-patchnotes, the knowledge-hub way-of-working-and-structures process canon (plus the archived guide it replaced), the house engineering-foundation canon, the bitbucket-anwaltde-aura repo mirror, and the two skills spaces below. Everything else is content hosted in Aura.
- Two SKILL-kind spaces are invisible to listKnowledgeSpaces and surface only through searchKnowledge and getKnowledgeTree: repo-skills (45 nodes, verified live; Aura's own agent skills) and skills (22 nodes, verified live). repo-skills is the operative agent-side documentation for story points, tags, hierarchy, opinions, gate check instructions, signals, user memory, knowledge answering, and Jira conversion; it names chat tools (tag_search, knowledge_graph), never MCP tools; never copy its tool names into our docs.
- Every new-tools family has product-level wiki documentation in the patchnotes (v9 through v19), but no MCP tool contract is documented anywhere in the wiki; the only tool-contract text is tracker-aura's Call contracts (recordTaskProgress shape, tag slug rules, the 200,000 / 50,000 artifact section limits, is_ai_generated).
- Per-facility documentation: story points (v16, AURA-1653 semantics; guides/task-artifact-conventions for the scale and the plan-header rule; the four-tool MCP flow is dump-only); roadmap goals (v17, AURA-1882, no process page covers them; the propose / append split is dump-only); opinions (v18 replaces reviews; repo-skills/revise-from-opinions teaches the agent-side model; the only MCP trace is listArtifacts(opinion_requested)); capacity (knowledge-hub 1.3 is the canonical new model: AURA-1686 placeholder, 10/20/30 steps, 09:00/09:30 rhythm, 100% landing; v17 adds the 04:00 reset; v19 keeps finished work counted); plus the rest in the report's part (b) table.
- Contradictions strengthened and recorded: tracker-aura's FULL status series carries both gate waiting statuses in every version v1 (2026-10-08) through v4 (2026-10-12), so the guide was created after AURA-2211 shipped and never had it right; tracker-aura's reopen observation ("the only remaining move is archived: true") contradicts the live reopenTask description and v19's reopen dialog (AURA-2599). Reverse direction: aiSetup and getBlueprintFiles describe the blueprint/ wiki subtree the wiki itself retired. The v4 patchnote says comments are threaded while the live listComments is flat.
- The bitbucket-anwaltde-aura mirror is a 2026-06-29 snapshot (task statuses OPEN/ARCHIVED, no v14-v19 endpoints): a staleness trap; citable only as a pre-v14 data-model reference, never as current.
- REST documentation lives in the product's public reference page (v15, AURA-1636), not the wiki; no MCP reference page exists.

Recommendation (high confidence for wiki-side claims and dump-side contracts; medium for the tracker-aura reopen verdict, which needs an Aura-side answer): adopt a two-layer citation policy for the rewrite: the introspection dump and the synced live spec are the only citations for tool contracts; cite the wiki for semantics and process (patchnotes for what a facility is, the 1.x pages for process, tracker-aura for calling discipline minus its two flagged errors, task-artifact-conventions for the scale, repo-skills for facility semantics). Never cite the June mirror as current, never copy repo-skills tool names, hold aiSetup / getBlueprintFiles until the Aura team answers the retirement question. The part (c) table supports the provisional granularity policy in the map.

Open questions (carried into the grilling and the operator report): whether aiSetup / getBlueprintFiles still function against the retired blueprint subtree; whether tracker-aura's reopen observation reflects a real server limitation the tool description misses; whether further SKILL-kind spaces exist beyond the two found (listKnowledgeSpaces cannot enumerate them); whether the UI threads comments while the MCP list is flat.
