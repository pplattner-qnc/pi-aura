---
type: task
subtype: grilling
title: How should the package's documentation treat each newly added Aura facility?
status: deprecated
workflow_state: done
blocked_by: []
---

## Decision to settle

How should this package's documentation treat each newly added Aura
facility (the ~30 new tools across 14 families the mcp-inventory-drift
report enumerates)? Settle per facility: usecase coverage in an existing
file, a new usecase file, a SKILL.md family-index row only, process-resource
coverage, or deliberate omission; and how deep each treatment goes (working
instruction versus a pointer to the wiki or the REST reference).

## Parent decisions this depends on

- Audit scope and carry-through to the 0.9.0 release (settled, map
  Decisions).
- The seven drift reports' findings and per-file gap lists.
- The wiki-facility-documentation report (what official documentation
  exists per facility; run this grilling only after that research lands).

## Choices already known

- The provisional granularity policy recorded in the map last pass:
  multi-step agent-workflow families get usecase coverage in an existing
  file whose job fits (story points, blocked, priority queue, progress,
  activity, user groups into task-management.md; knowledge versioning,
  restore, frontmatter into wiki-knowledge.md; feedback triage into
  feedback-submission.md); a new usecase file only when no existing file's
  job fits; single-call reference tools get a SKILL.md family-index row;
  the router mirrors this (subtree rows for coherent sub-canon, individual
  rows for top-level guides). Confirm, amend, or replace.
- Specific judgment calls to settle inside the policy: user-group and
  feedback-triage placement; the opinions flow that replaced reviews (how
  the docs teach it, and whether the six dead aura.ts artifact review-*
  subcommands get migrated to the opinions flow or removed); memory ingest
  (reportMemoryEntityQuestion creates open questions); TEMPORARY artifacts;
  capacity documentation now versus waiting for the add-capacity-subcommands
  CLI (map constraint: document the MCP tools now, stay neutral toward the
  CLI).

## Recommended starting answer

Keep the provisional policy as the default rule and decide facility by
facility against the wiki-facility-documentation report; migrate the
review-* subcommands to the opinions flow rather than remove them (the
process canon teaches the opinions flow as the successor); document the MCP
capacity tools now.

## Downstream work the answer may create

The per-facility treatment list becomes the scope of the usecase, SKILL.md,
and process update tickets in to-spec / to-tickets; a migrate-or-remove
answer for review-* adds or reshapes the derived-surface tickets.

## Notes

Grilling session opened 2026-11-09. Round 1 answers (the operator's terms):

- Documentation-treatment rule: CONFIRMED as written. A family that forms a multi-step agent workflow gets usecase coverage in an existing usecase file whose job it fits; a new usecase file only when no existing file fits; single-call reference tools get a SKILL.md family-index row only; the router mirrors this (subtree rows for coherent sub-canon, individual rows for top-level guides). Rejected alternatives: amending or replacing the rule.
- Citation policy: TWO-LAYER, confirmed. Tool contracts cite only the live introspection dump and the synced REST spec; semantics and process cite the wiki (patchnotes for what a facility is, the 1.x pages for process, task-artifact-conventions for the scale, repo-skills for facility semantics, tracker-aura for calling discipline minus its two flagged errors). Never cite the June bitbucket-anwaltde-aura mirror as current; never copy repo-skills chat tool names. Rejected alternatives: dump-and-spec-only citations, wiki-first citations.
- Operator added: they are about to retire the entire CLI and REST access layer. Consequences for the review-* disposition and the derived-surface tickets are being settled in round 2.
- The six dead aura.ts artifact review-* subcommands: round-1 answer was migrate to the opinions flow; revisited in round 2 in light of the CLI retirement note.
- aiSetup / getBlueprintFiles: OMITTED entirely from the docs. Operator note: they will most likely be dropped in coming Aura releases, so ignore them and do not mention them. This resolves the router task's open question: no mentions are kept, and no Aura-team gate is needed before the docs rewrite.
- Operator global note: before to-spec, a separate, more general grilling session where the operator gives ideas for reshaping the plugin, followed by more wayfinder tasks as the agent sees fit. Registered as the planning task plugin-reshape-grilling; this pass runs at most one grilling (this one), so it runs in the next pass.

Round 2 answers (the operator's terms):

- CLI and REST access-layer retirement: WITHIN THIS EFFORT. The retirement lands with 0.9.0: the update tickets stop maintaining the CLI and REST surfaces; the docs go MCP-first; the six aura.ts artifact review-* subcommands are removed, not migrated; the rest-api.md and typed-client regeneration drops out of scope; the CLI and REST layer are removed or frozen as part of the release. This supersedes the round-1 review-* answer (migrate) and the openapi-spec-drift regeneration chain. Open design consequence for the reshape session and the spec phase: the extensions that call REST today (aura-references via the generated client, aura-feedback's POST /feedback) must switch to MCP calls or be retired along with the layer.
- Per-family placement map: the operator asked for a plain-language explanation before answering; the placements question re-asks in round 3 with the explanation.

Round 3 and 4 answers (the operator's terms):

- Per-family placement map (round 3, after a plain-language explanation): CONFIRMED as proposed. task-management.md gets owner/crew, blocked, story points, priority queue, progress and activity, user groups, repository linking, workflow_variant, and getTaskNeighborhood; wiki-knowledge.md gets versioning, restore, and frontmatter; feedback-submission.md gets feedback triage plus the fixed createFeedback naming; memory-graph.md gets the ingest note and getMemoryEntitySource; artifact-management.md gets the opinion_requested filter and the opinions flow; unified-search.md gets the FEEDBACK source and mention candidates; roadmap goals, tags, projects, comments, glossary, and systemHealth stay SKILL.md family-index rows; code-search.md gets its ref and repo_slug fixes only.
- REST-only capabilities (capacity settings, notifications write, permission fields): UI POINTER ONLY. The docs point agents to the Aura UI and drop all REST examples and client instructions; a single non-teaching note may state that the REST API exists. Rejected: teaching raw REST calls; dropping all mentions.
- Extensions: MIGRATE TO MCP. The references extension and the feedback extension switch from the generated REST client to live MCP calls (listTasks, listArtifacts, getKnowledgeTree, createFeedback all exist on MCP). Operator note, verbatim intent: the docs should establish codemode as the replacement pattern for the old CLI workflows, for example downloading an artifact to a file becomes codemode reading the artifact from Aura plus the write tool writing it to disk; this allows ditching the CLI altogether.
- add-capacity-subcommands effort: ARCHIVE IT. Its CLI premise dies with the retirement; the capacity docs go MCP-first with the CLI-neutrality constraint now obsolete.

Frontier after round 4: empty. Every branch of the design tree is settled: treatment rule, citation policy, placement map, retirement scope, review-* disposition (remove), REST-only posture, extension disposition, codemode pattern, aiSetup/getBlueprintFiles omission, capacity-effort disposition. Awaiting the completion-gate confirmation, then the write-back to the map and the done-marking.
