---
type: map
title: Audit and update the package's Aura instructions against current Aura
status: stable
blocked_by: []
ready_for_spec: true
---

# Audit and update the Aura instructions

## Destination

The package, reshaped: the `aura` skill's SKILL.md and all its resources
teach the live aura-mcp-dev server (the 120-tool server, build 2026-10-12,
commit 4aa37833) MCP-first, following the confirmed placement map and the
two-layer citation policy; README.md, CONTEXT.md, AGENTS.md,
docs/testing.md, and docs/dev-env.md carry no stale claim from the drift
reports; six extensions survive the reshape, with the two that call Aura
(aura-references including its sqlite mention cache, and aura-feedback)
running their access on MCP; the agent-facing CLI and REST surface is gone
(the aura.mjs bundle, rest-api.md, and every doc that teaches REST or CLI
usage), while the internal REST library follows the consumer rule: removed
when (next to) no in-package consumers remain after the migration,
otherwise kept or its few call sites inlined, decided by consumer count and
update likelihood; the engineering-foundation skill and the
engineering-rules extension move to their new package home. Version 0.9.0
is cut at finalize and covers this effort, remove-digest, and the reshape.

## Constraints

- Triangulate three sources for every "what changed" conclusion: (1) live
  MCP introspection (describeNamespace, describeTool, the server
  instructions string), (2) the Aura source repo's `openapi.yaml` via the
  openapi-sync mechanics, (3) the Aura wiki. Ground every row of every
  report in at least the live server; mark anything beyond that as
  inferred.
- Ask the user before concluding that a source cannot be found. Never
  assume "it does not exist" (user instruction, grilling Q6).
- Research is read-only against Aura: introspection and read-only probes
  only, no MCP writes. Existing consent-first conventions stay.
- The docs are MCP-first: no shipped surface teaches agent-facing REST or
  CLI usage. REST-only capabilities (company capacity settings,
  notifications write, the permission fields excluded from MCP tiers) get a
  UI pointer plus at most a non-teaching note that the REST API exists.
- The extensions' Aura access migrates to live MCP calls. The internal REST
  library (the generated client, the aura-client wrapper, and its
  openapi.yaml plus sync / codegen targets) is removed only when (next to)
  no in-package consumers remain after that migration; surviving consumers
  either keep the library or inline their calls, decided by how many they
  are and how likely they are to track Aura updates
  (plugin-reshape-grilling).
- No em-dashes in any touched prose.

## Decisions so far

- Two-effort split (grilling Q1): this effort audits and refreshes;
  remove-digest removes. Both were planned in the same session.
- Audit scope (grilling Q2): all instruction surfaces, not only the
  markdown: the skill and its resources, the engineering-foundation router,
  extension-emitted text, README / CONTEXT / AGENTS, plus derived surfaces
  via spec regen, rest-api.md regen, typecheck, and tests.
- Carry through to fixes and a release, 0.9.0 (grilling Q5).
- Drift already confirmed during planning (the research tasks enumerate it
  fully): 90 documented tools vs 120 live; the 10 `mcp*` tools unchanged;
  capacity, board summary, user search, and Jira/Asana access back on MCP;
  new families (roadmap goals, story points, user groups, projects, tags,
  memory ingest, knowledge versioning and restore, space CRUD, frontmatter
  save, aiSetup and getBlueprintFiles, getTaskNeighborhood,
  batchUpsertTaskPhaseGoals, listMentionCandidates, systemHealth, priority
  queue, progress, activity, discard/reopen/updateTaskBlocked); code search
  renamed to the `code_*` family; a new compact/detail/full
  `response_format` contract with the permission apparatus excluded from
  MCP tiers; local openapi.yaml last synced Sep 1 while the server build is
  Oct 12.
- usecase-resources-drift: every stale instruction in all 12 usecase files is
  now listed with grounded corrections (task Notes and the task's .work
  report). capacity-planning.md is actively false (the capacity MCP tools
  are back: readCapacity, updateTaskMemberCapacity,
  updateTaskMemberParticipation), the uuid-to-id parameter drift spans five
  files, task-management.md misses the owner/crew, blocked, story-point,
  priority-queue, progress, activity, and user-group families, and
  upload-documents.md is current. The per-file lists are the update
  tickets' worklist.
- mcp-inventory-drift: the per-claim drift between the aura SKILL.md and the
  live 120-tool server is fully enumerated (task Notes and the task's .work
  report; the .work introspection dump is the effort's shared live-surface
  evidence file). The 10 mcp* tools are right in name and count, no
  documented tool was removed, the "left MCP entirely" paragraph is the big
  drift (capacity, board, owner/crew search fully back; Jira/Asana and
  wiki-file reads half back; notifications write, artifact review flow,
  skills import, wiki upload still absent), the response_format contract
  (compact / detail / full, MCP-only) is undocumented, and about 30 new
  tools across 14 families need coverage. The report's section 9 is the
  SKILL.md rewrite outline.
- process-resources-source: the source of truth for all 7 process files is
  found: the archived "How We Work" wiki article was replaced on 2026-09-23
  by six pages under knowledge-hub/way-of-working-and-structures/ that map
  1:1 onto the local files, and every local file's canonical path now 404s.
  The drift is enumerated: the status series split by level and
  workflowVariant (STANDARD dropped READY_FOR_ALIGNMENT / READY_FOR_REVIEW),
  v18 quality gates, reviews became opinions (the aura.mjs artifact
  review-* subcommands the files teach are dead), the capacity model
  overhaul (daily reset, no 80/20 reserve), story points, roadmap goals,
  and the lifecycle additions; workflow-phases.md, capacity.md, and
  review-modes.md need the deepest rewrites. The report also records an
  Aura-side wiki bug for the operator: guides/tracker-aura still lists the
  pre-AURA-2211 status series.
- engineering-foundation-router-drift: 8 of 11 router rows resolve live and
  all 3 blueprint rows are dead: the blueprint/ subtree is retired from the
  wiki (48-node tree, zero blueprint nodes; the rollout page states the
  registry and checksum manifest are retired), the live model ships rules
  and skills as plugins from anwaltde/agent-plugins, 40 of 48 live nodes
  are unrouted (playbooks/, rollout/, guides/observability/,
  guides/governance/, plus 14 top-level guides), and the taxonomy paragraph
  is stale. This report's rewrite worklist moves to the other package with
  the skill (plugin-reshape-grilling); it no longer produces update
  tickets in this effort.
- root-docs-drift: 57 claim rows audited across README.md, CONTEXT.md,
  AGENTS.md, docs/testing.md, and docs/dev-env.md: 19 stale, 38 current, no
  digest leftovers. The big ones: the README MCP config block teaches the
  wrong config file and shape (pi reads ~/.pi/agent/mcp.json with url plus
  headers), the install pin says v0.1.0 (package is 0.8.0), CONTEXT.md says
  the server has 90 tools, the README claims "no user-facing commands"
  while aura-secrets registers /aura and aura-feedback registers
  aura_feedback, the prerequisites list names two unused packages, the
  credential story lags the keyring rewrite (PAT from OS keyring, baseUrl
  from ~/.pi/agent/settings.json, @napi-rs/keyring gone), and the dev-env
  setup flow predates the workspaces layout. The report's priority order is
  the root-docs update tickets' worklist.
- openapi-spec-drift: the endpoint-level diff between the Sep-1 local spec
  and the live server's own spec (same commit as the deployed build) is
  enumerated with per-change consumer impact. The artifact review flow is
  gone from REST (11 operations removed, replaced by a 7-opinion family),
  which breaks six aura.ts artifact review-* subcommands today; a
  {uuid}-to-{id} path-parameter rename wave (130 of 138 changed operations)
  and a BoardTaskRef rename break the typed client at regen;
  mcpUpdateArtifact can now return application errors with HTTP 200;
  ArtifactKind gains OPINION and TEMPORARY and drops REVIEW; 78 operations
  were added (roadmap goals, task gates, webhooks, disciplines,
  check-instructions, opinions, reports); the rest-index blob hides all
  new operations until regenerated; response_format appears in neither
  spec, so the aura.mjs REST flows are unaffected by the MCP tier contract
  (this settles that fog question). The report's regeneration chain is
  superseded by the CLI and REST retirement decision below.
- extensions-instruction-drift: the stale extension surfaces are enumerated
  with grounded corrections. The clear-cut fixes: the aura-references task
  adapter sends stale query params (search: partial and status: "ALL"; the
  live param is q and no status param exists) and aura-feedback names a
  nonexistent tool (aura-mcp-dev_createFeedback; the current pi naming is
  mcp__aura_mcp_dev__createFeedback, a stale token that also sits in
  SKILL.md and feedback-submission.md). Also: the wiki tree derivation is
  broken against the live slim getKnowledgeTree shape (the cache holds
  zero wiki rows ever), the artifact kind list in REFERENCE_INSTRUCTION
  still says REVIEW (live kinds are PLAN, OPINION, GENERIC, chat-only
  TEMPORARY), the shared client's ListTasksInput still declares the stale
  params, and the "no space-listing verb" premise is stale. The task-ref
  status examples, fallbacks, and limits verified current.
  aura-health.ts is deleted code, not dead code (removed in 89d8ed4; its
  test survives and tests the probe that moved into aura-tasks.ts), which
  settles the map's aura-health fog question. The engineering-rules part
  of this report's scope moves out with the extension
  (plugin-reshape-grilling).
- Documentation granularity for the new tools (settled from the drift
  reports, this was the map's granularity fog question): a tool family gets
  usecase coverage when it forms a multi-step agent workflow, placed in an
  existing usecase file whose job the family fits (story points, blocked,
  priority queue, progress, activity, and user groups into
  task-management.md; knowledge versioning, restore, and frontmatter into
  wiki-knowledge.md; feedback triage into feedback-submission.md); a family
  gets a new usecase file only when no existing file's job fits;
  single-call reference tools get a SKILL.md family-index row. The same
  rule applies to the router: subtree rows for coherent sub-canon
  (observability, governance), individual rows for top-level guides.
  (Confirmed with the operator by facilities-documentation-grilling.)
- wiki-facility-documentation: the Aura wiki's own facility documentation is
  now inventoried. Only five surfaces document Aura itself (the patchnotes,
  the way-of-working 1.x process canon, the engineering-foundation canon, the
  June repo mirror, and two SKILL-kind spaces invisible to
  listKnowledgeSpaces: repo-skills with 45 nodes and skills with 22).
  Every new-tools family has product-level documentation in the patchnotes
  (v9 through v19) but no MCP tool contract is documented anywhere in the
  wiki; the only tool-contract text is tracker-aura's Call contracts.
  repo-skills is the operative agent-side documentation for story points,
  tags, opinions, and memory, but names chat tools, never MCP tools. The
  June bitbucket-anwaltde-aura mirror is a staleness trap (pre-v14), never
  citable as current. Contradictions recorded: tracker-aura's FULL status
  series and its reopen observation, aiSetup / getBlueprintFiles describing
  the retired blueprint subtree, and the v4 patchnote's threaded comments
  versus the live flat listComments.
- facilities-documentation-grilling: settled with the operator. The
  documentation-treatment rule and the per-family placement map are
  confirmed (the placements: owner/crew, blocked, story points, priority
  queue, progress and activity, user groups, repository linking,
  workflow_variant, and getTaskNeighborhood into task-management.md;
  versioning, restore, and frontmatter into wiki-knowledge.md; feedback
  triage plus the fixed createFeedback naming into feedback-submission.md;
  ingest and getMemoryEntitySource into memory-graph.md; the
  opinion_requested filter and the opinions flow into artifact-management.md;
  the FEEDBACK source and mention candidates into unified-search.md;
  roadmap goals, tags, projects, comments, glossary, and systemHealth stay
  SKILL.md family-index rows). Citations are two-layer: tool contracts cite
  only the live introspection and the synced spec; semantics and process
  cite the wiki (patchnotes for what a facility is, the 1.x pages for
  process, task-artifact-conventions for the scale, tracker-aura for calling
  discipline minus its two flagged errors); the June repo mirror is never
  cited as current and repo-skills chat tool names are never copied. The
  CLI and REST retirement lands within this effort. aiSetup and
  getBlueprintFiles are omitted from the docs entirely. add-capacity-
  subcommands is archived (its CLI premise died with the retirement; the
  capacity docs are MCP-only).
- plugin-reshape-grilling: the operator's reshape session, settled. (1) The
  agent-facing CLI and REST surface is removed unconditionally: the
  aura.mjs bundle, rest-api.md, and every doc teaching REST or CLI access;
  the internal REST library (generated client, aura-client wrapper,
  openapi.yaml, sync and codegen targets) is removed only when (next to) no
  in-package consumers remain after the MCP migration, otherwise kept or
  its few call sites are inlined into the consumers, decided by consumer
  count and how likely they are to track Aura updates. (2) The mention
  machinery stays and moves to MCP: the sqlite cache is kept (verified
  healthy; pi renders autocomplete exactly once per keystroke, so
  cache-first is the only design that never lags typing), fed through a
  small in-extension JSON-RPC-over-HTTP client posting tools/call envelopes
  to the aura-mcp-dev endpoint with the keyring PAT (pi exposes no
  extension API for calling MCP tools, verified in the pi docs); every
  current REST lookup has an MCP equivalent (listTasks with q, listArtifacts
  with q, searchKnowledge, getKnowledgeNode / getKnowledgeNodeByPath,
  getTaskByHumanKey, getArtifact), with one adaptation: the slim
  getKnowledgeTree shape means candidates come from title plus slug and
  versions load lazily at resolve time. The seed assumption that
  listMentionCandidates could serve the machinery was wrong and is
  corrected in the task notes: it returns users mentionable in comments,
  not entity candidates. (3) Six extensions stay (aura-skill-instruction,
  aura-tasks, aura-references, aura-reference-cache, aura-feedback,
  aura-secrets) and engineering-rules is dropped: it migrates to the other
  package. (4) The engineering-foundation skill drops likewise: the other
  package becomes the delivery vehicle for the engineering canon, and the
  router-drift findings travel with it. (5) No further reshape ideas; the
  session's recorded purpose was to put the CLI/REST drop on record.

## Fog

## Out of scope

- The digest removal (the remove-digest effort, landed and archived).
- Building any new agent-facing CLI or REST surface: that access is removed,
  not rewritten or re-wrapped (generic-openapi-cli-wrapper stays archived);
  the consumer rule for the internal REST library lives in Constraints.
- Rewriting the engineering-foundation router skill in this package: it
  and the engineering-rules extension move to their new package home, and
  the router-drift findings travel with them (plugin-reshape-grilling).
- Documenting `aiSetup` or `getBlueprintFiles`: omitted entirely; the
  operator expects Aura to drop them in coming releases.
- Capacity CLI subcommands: dead premise with the retirement
  (add-capacity-subcommands archived); the capacity docs are MCP-only.
- Aura-side behavior changes: if Aura itself is wrong or missing
  something, the sanctioned path is the `aura_feedback` tool, not this repo.
- The user's separate Atlassian MCP usage outside this package.

## Non-negotiable facts

**Success test:** every instruction surface the package ships after the reshape teaches the live aura-mcp-dev server (build 4aa37833, 120 tools) with no stale claim left from the drift reports, the agent-facing CLI and REST surface is retired, the engineering-foundation skill and engineering-rules extension are moved out, the test suite and typecheck pass, and version 0.9.0 is released.

- The live reference is the aura-mcp-dev server, build 2026-10-12, commit
  4aa37833c7dc87205d105f65b9195c52a4bdc312, 120 tools; every correction
  cites it, the synced spec at that commit, or a repo file.
- Research stays read-only against Aura: introspection and read-only probes
  only, no MCP writes, and nothing shared is bounced.
- Capacity documentation states the MCP capacity tools are back
  (readCapacity, updateTaskMemberCapacity, updateTaskMemberParticipation);
  with add-capacity-subcommands archived, the capacity docs are MCP-only.
- No em-dashes in any touched prose.
- Version 0.9.0 is cut at finalize and covers this effort, remove-digest,
  and the reshape (the CLI and REST retirement plus the engineering-surface
  move-out).
