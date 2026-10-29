---
type: map
title: Audit and update the package's Aura instructions against current Aura
status: stable
blocked_by: []
---

# Audit and update the Aura instructions

## Destination

Every instruction surface the package ships teaches current Aura (the
120-tool server, build 2026-10-12, commit 4aa37833, era): the `aura` skill's
SKILL.md and all resources, the `engineering-foundation` router, the
instruction text emitted or encoded by the extensions, README / CONTEXT.md /
AGENTS.md, and the derived surfaces (REST docs and typed client regenerated
from a fresh `openapi.yaml`). The effort carries through to fixes and a
release: version 0.9.0 is cut at finalize and covers this effort plus
remove-digest.

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
- Capacity doc updates must leave room for the live
  `add-capacity-subcommands` effort (kept as-is by user decision, grilling
  Q4): MCP capacity tools are back (`readCapacity`,
  `updateTaskMemberCapacity`, `updateTaskMemberParticipation`) and the docs
  must say so, but the CLI subcommands may still land later and the docs
  must not contradict them.
- Research may run in parallel with remove-digest; the update tickets
  assume the removal has landed. Mark digest-related findings "removal
  handles" instead of auditing them.
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

## Fog

- Documentation granularity for the ~30 new tools: which deserve usecase
  sections versus a SKILL.md table row. Decided at to-spec once the drift
  reports exist.
- Whether the response_format contract changes the aura.mjs file-based
  flows (new full tier on getTask / getTaskByHumanKey). The
  mcp-inventory-drift and openapi-spec-drift reports inform.
- aura-health.ts has no importer and no package.json registration
  (planning grep found none); the extensions task verifies whether it is
  dead code and reports.

## Out of scope

- The digest removal (the remove-digest effort).
- Re-architecting the REST CLI or absorbing hand-written commands into a
  generated wrapper (generic-openapi-cli-wrapper stays archived).
- Aura-side behavior changes: if Aura itself is wrong or missing
  something, the sanctioned path is the `aura_feedback` tool, not this repo.
- The user's separate Atlassian MCP usage outside this package.
