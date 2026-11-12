---
type: spec
title: Audit, refresh, and reshape pi-aura to teach the live Aura server MCP-first
status: stable
---

## Problem Statement

The package's instruction surfaces teach an Aura server that no longer exists. The aura skill documents a 90-tool server while the live aura-mcp-dev server (build 2026-10-12, commit 4aa37833) exposes 120 tools; the capacity guidance tells agents the capacity MCP tools are gone when three of them are back; the process resources teach a status series and a review flow Aura replaced months ago; the root docs teach a config file shape pi does not read. An agent that follows the shipped instructions is actively misled, not merely underserved.

At the same time the package carries an agent-facing CLI and REST access layer (the bundled CLI, the REST reference document, and the docs that teach them) that the operator is retiring, and two engineering surfaces (the engineering-foundation skill and the engineering-rules extension) whose job has moved to another package. The package must be refreshed and reshaped so that what it ships is true of the live server and carries only the surfaces it still owns.

## Solution

Every instruction surface that survives the reshape teaches the live 120-tool aura-mcp-dev server, MCP-first: the aura skill and its usecase and process resources follow the confirmed placement map and the two-layer citation policy; the root documents carry no stale claim from the audit reports. Of the seven extensions, six survive, and the two that call Aura (the mention machinery and the feedback tool) run their access on the MCP server through a small in-extension client, keeping the sqlite mention cache and its instant-render behavior. The agent-facing CLI and REST surface is removed; the internal REST library is removed when (next to) no in-package consumers remain after the migration, otherwise kept or inlined per the consumer rule. The engineering-foundation skill and the engineering-rules extension move out. The release 0.9.0 covers this effort, the landed remove-digest effort, and the reshape.

## User Stories

1. As a pi agent, I want the aura skill to name the exact live tool inventory (120 tools, build 4aa37833), so that I never call a documented tool that does not exist or miss a live one.
2. As a pi agent, I want the response-format contract (compact default, detail on declaring tools, full on task reads, the permission fields excluded) documented in the skill, so that I pass the right tier on every call and know what I cannot see.
3. As a pi agent, I want the "left MCP" guidance to be a live scorecard (what is back, what is half back, what is still REST-only), so that I pick MCP tools first and fall back correctly (UI pointer, not REST calls).
4. As a pi agent, I want capacity guidance that tells me readCapacity, updateTaskMemberCapacity, and updateTaskMemberParticipation are live on MCP, so that I stop hand-crafting REST calls for capacity work.
5. As a pi agent, I want story-point guidance (the four-tool estimate, accept, set, list flow; only Stories and Sub-Tasks eligible; human correction wins), so that I run the estimation workflow instead of guessing.
6. As a pi agent, I want task-lifecycle guidance covering the new statuses (the level- and variant-resolved series), discard, reopen, blocked, and the neighborhood read, so that I keep tasks in legal states.
7. As a pi agent, I want the opinions flow (replaced reviews) documented where it is visible on MCP, so that I stop looking for review commands that are gone.
8. As a pi agent, I want wiki guidance covering versioning, restore, and frontmatter saves with their current parameter contracts, so that my wiki calls succeed on the first try.
9. As a pi agent, I want the taught file-workflow pattern to be codemode plus the write tool (read from Aura through MCP, then write to disk), so that I can download an artifact without any CLI.
10. As a pi agent, I want guidance that never teaches REST or CLI calls to Aura, so that my access stays on MCP where the server supports it.
11. As a pi agent working on feedback, I want the correct tool names in the feedback instructions, so that the tool I am told to avoid or use actually exists under that name.
12. As a pi agent searching broadly, I want unified-search guidance that includes the FEEDBACK source type and mention-candidate tool, so that my searches cover live surfaces.
13. As a pi agent reading about artifacts, I want the current kind list (PLAN, OPINION, GENERIC, chat-only TEMPORARY) and the opinion_requested filter, so that I create and filter artifacts correctly.
14. As a pi agent using code search, I want the live code_* tool family with its actual parameters, so that my repository questions use the right calls.
15. As a pi agent working on tasks, I want owner and crew management (add member, set roles) documented on MCP, so that I do not fall back to the UI for member work.
16. As a pi agent tracking my work, I want the priority queue, my progress, and task activity tools in the task guidance, so that I can answer "what is next" and "what happened" without guessing APIs.
17. As a pi agent working with user groups, projects, and tags, I want their tool families at index level, so that I can use them for single-call needs without a full walkthrough.
18. As a pi agent reading process guidance, I want the current phases, quality gates, capacity model, and escalation rules, so that my process behavior matches the house canon.
19. As the operator, I want the mention autocomplete to keep rendering instantly from the sqlite cache on every keystroke, so that typing never waits on the network.
20. As the operator, I want the mention machinery's data feed on the MCP server, so that the package no longer depends on the REST access layer for references.
21. As the operator, I want wiki mentions to work again (the cache has never held a wiki row because the tree derivation predates the slim shape), so that all three mention kinds resolve.
22. As the operator, I want the feedback submission to go through MCP while keeping the sign-off flow and the local JSONL record, so that nothing is sent without my confirmation and the audit trail stays.
23. As the operator, I want the agent-facing CLI, its bundle, and the REST reference document gone, so that the package stops shipping an access path I am retiring.
24. As the operator, I want the internal REST library removed if nothing in the package still needs it after the migration, so that I maintain one access technology, and I want it kept or its few call sites inlined when real consumers remain, so that I do not pay silent rot for inlined calls that Aura changes.
25. As the operator, I want the engineering-foundation skill and the engineering-rules extension out of this package, so that the engineering canon has one delivery vehicle, not two.
26. As the operator, I want the reachability probe (the VPN-off warning at session start) to survive the reshape, so that the private-instance failure mode stays visible.
27. As the operator, I want the secrets command (`/aura`) unchanged in behavior, so that my credential import and edit flows keep working.
28. As a new team member, I want README and dev docs that describe the post-reshape tree (what the package contains, how it is built and tested), so that I can get a working checkout without archaeology.
29. As a new team member, I want the install instructions to name the pi-native MCP configuration (the agent config file with url plus headers), so that my setup works on the first attempt.
30. As a team member reading the glossary, I want the domain terms refreshed to the post-reshape truth, so that conversations do not reference deleted modules.
31. As the maintainer, I want the release 0.9.0 cut when the effort closes, so that this audit, the digest removal, and the reshape land as one coherent version.
32. As the Aura team, I want my product's wiki not to be cited where it contradicts the live server, so that agents do not learn facility behavior from stale pages.

## Implementation Decisions

The settled decisions, recorded by the planning tasks (each named task carries the evidence worklist in its Notes and its .work report):

### Instruction surfaces

**The aura skill file.** The rewrite follows the mcp-inventory report's outline: the tool count becomes 120 with the build identity (2026-10-12, commit 4aa37833) cited once; the ten mcp* tools stay listed with three one-line corrections (the new opinion artifact kind replacing review, the base64 upload description with its size limit, the artifact mode renamed to whole with the section and whole-body limits and the expected-version contract); the "left MCP entirely" paragraph becomes a per-capability scorecard (back: the capacity tools, board summary, owner and crew search; half back: Jira and Asana reads, wiki file reads, memory browse plus ingest; still absent: notification writes, the review-turned-opinion flow beyond its listing filter, skills import, wiki upload); the response-format contract is added (compact default, detail on the declaring tools, full on the two task reads; MCP-only, not part of the HTTP API; the permission apparatus excluded from every tier and reachable by the same PAT through REST); the new tool families get bullet-level coverage; threaded comments become flat per the live description; the contradictory capacity sentences are resolved to the current truth; the stale feedback tool-name token is fixed to the current naming. aiSetup and getBlueprintFiles are not documented at all.

**Usecase resources.** The twelve usecase files get their per-file corrections from the usecase-resources worklist under the confirmed placement map: capacity-planning.md is rewritten (the capacity MCP tools are back and documented as the primary path; company capacity settings and the cross-member per-task view are REST-only capabilities and get UI pointers); the uuid-to-id parameter sweep lands across the task, signals, wiki, skills, and unified-search files; wiki-knowledge.md documents the frontmatter save contract (identifier plus raw YAML string or null), version numbering shapes, and file-asset version history; task-management.md gains owner and crew management, the blocked flag, the story-point flow, the priority queue, progress, activity, user groups, repository linking, the workflow variant, and the neighborhood read, and drops its false "no member management on MCP" claim; code-search.md drops its nonexistent parameter and documents the repository-slug format; unified-search.md adds the FEEDBACK source and the mention-candidate tool with correct limit semantics; artifact-management.md documents the opinion_requested filter and the whole-mode replace contract; memory-graph.md corrects the ingest contract (no reason parameter, open questions) and the entity-source result (a navigable route, not provenance); feedback-submission.md gets the triage flow and the fixed tool naming; upload-documents.md is verified current and stays.

**Process resources.** The seven process files repoint their canonical references to the replacement wiki pages under the way-of-working section; workflow-phases.md is rewritten to the split status series (resolved by hierarchy level and workflow variant, immutable at creation; the standard series without the two retired statuses; lean series for sagas and subtasks; discovery ending after alignment); capacity.md moves to the new capacity model (the placeholder epic for non-task work, commitment steps, full landing, the daily reset; no structural reserve); review-modes.md teaches opinions as the successor flow (graded scale, no locks or rounds, edit-after-submit) and drops the dead CLI review commands; the quality gates (disciplines, verdicts, the reason requirement to leave a rejected gate) are documented; integrations.md updates the Asana and Jira postures and task parenting; roles, escalation, and the index get header and minor updates.

**Root documents.** README, CONTEXT.md (the glossary), AGENTS.md, docs/testing.md, and docs/dev-env.md take the root-docs worklist: the MCP configuration example moves to the pi-native config file with url plus headers; the install pin tracks the released version; the "no user-facing commands" claim is corrected to name the secrets command and the feedback tool; the unused prerequisites are dropped; the credential story describes the keyring and the settings-derived base URL with the MCP config file as the import source only; the glossary entries for the access client and the keyring describe the post-reshape reality; the dev setup flow describes the post-teardown tree; the testing mock conventions match what the tests actually do; the extension and skill tables lose the moved-out entries; em-dashes are removed from touched prose.

**Citation policy.** Two layers: tool contracts (names, parameters, shapes, limits) cite only the live introspection evidence or the synced spec; semantics and process cite the wiki (the patchnotes for what a facility is, the replacement process pages, the task-artifact conventions page for the story-point scale, tracker-aura for calling discipline minus its two flagged errors). The June repository mirror is never cited as current; chat-only tool names from the skills spaces are never copied into the docs.

### Extensions and the MCP feed

**The in-extension MCP client.** The mention machinery and the feedback tool reach Aura through a small client inside the extension layer that speaks JSON-RPC over HTTP to the aura-mcp-dev endpoint, sending tools/call envelopes with the PAT from the keyring (pi exposes no extension API for calling MCP tools; registration is the only supported extension hook). The client honors the existing abort semantics: calls are checked against the request signal before results are applied, late resolutions are dropped, and failures degrade to cache-only answers.

**The mention machinery.** The sqlite cache stays with its stale-while-revalidate design (pi renders autocomplete exactly once per keystroke, so the cache read is the only synchronous source; fresh lookups are background side effects). The feed changes: task search uses listTasks with its full-text parameter and the archived visibility options (replacing the stale search and status parameters); task resolution uses the human-key read; artifact search and resolution use the artifact listing and read tools; wiki search uses the knowledge search tool; wiki resolution uses the node reads by identifier and by path. The tree derivation adapts to the slim tree shape: candidates derive from title and slug, and versions load lazily from the node read at resolve time. The reference instruction's artifact kind list becomes the live set including the opinion kind and the chat-only temporary kind; the "no space-listing" premise is dropped (the listing tool exists).

**The feedback tool.** The submission path moves from the REST post to the MCP create-availability through the same in-extension client; the sign-off flow, the confirm and edit interaction, and the JSONL audit record stay; the instruction that the model must not call the feedback tool directly keeps its meaning with the corrected tool name.

**Unchanged extensions.** The prompt-injection extension, the secrets command, and the reachability probe keep their behavior; the probe already uses a raw request and does not depend on the REST library.

### Teardown and the consumer rule

**The agent-facing surface is removed unconditionally:** the bundled CLI, the scripts that only serve it, the REST reference resource, the Taskfile targets that build or regenerate them, and every doc that teaches REST or CLI access to Aura. The six dead review subcommands are removed, not migrated: the opinions flow has no MCP commands to migrate them to beyond the listing filter already covered in the docs.

**The internal REST library follows the consumer rule:** after the MCP migration lands, the in-package consumers of the generated client and its wrapper are counted. With (next to) none, the library, its spec source, its sync and codegen targets, and its tests are removed, and any straggling call site is inlined. With surviving consumers, the library is either kept whole or its few call sites are inlined, decided by how many there are and how likely they are to need changes when Aura's API changes. The decision is made at implementation time on the counted evidence, not pre-emptively.

**Guards.** The remnants guard that pins removed surfaces is updated to hold the new retirements (digest remnants already held; the CLI and REST names, the moved-out engineering surfaces, and the retired claims join it).

### Move-out of the engineering surfaces

The engineering-foundation skill directory and the engineering-rules extension (with its test) are removed from this package; their new home is the other package, which becomes the sole delivery vehicle for the engineering canon. The router-drift findings travel with them: no rewrite of the router happens in this repo. The removal updates the package manifest, the README tables, and the project instructions file.

### Release

Version 0.9.0 is cut at effort close and covers the audit, the digest removal landing, and the reshape. The README install example and the changelog are part of the release ticket.

## Testing Decisions

A good test here observes external behavior, not implementation: the autocomplete contract (one render per keystroke, cache-first, late resolutions dropped, abort respected), the tools/call envelope and error mapping the MCP client produces, the reference rendering output, and the guard-enforced absence of retired names. Module tests:

- The mention machinery: the reference engine's existing test suite is the prior art and grows the MCP-feed cases (candidate mapping from the slim tree, lazy version loads, the corrected task-search parameters). The MCP client gets a fake seam in the pattern of the existing keyring fake: an injectable caller whose envelopes and error shapes are asserted, including the HTTP-200-with-application-error case the migration must surface rather than swallow.
- The feedback tool: the existing confirm-and-edit tests stay; the submission path asserts the MCP call and the JSONL record.
- The removals: the remnants-style guards (current prior art holds digest leftovers out) are extended to the CLI, REST, and engineering-surface names, and the package manifest is asserted to match the surviving extension list.
- Documentation sanity: where cheap, content guards can pin the load-bearing facts the audit fixed (the live tool count, the capacity tool names, the absence of REST teaching), in the existing guard style.
- Typecheck and the run-these-always test list from the testing doc define the bar; the full suite must pass with the removals in.

## Out of Scope

- The digest removal itself (its own effort, already landed and archived).
- Building any new agent-facing CLI or REST surface; the retirement is removal, not a rewrite or a new wrapper.
- Rewriting the engineering-foundation router skill in this package; it moves to the other package with the extension and the findings.
- Documenting aiSetup or getBlueprintFiles; the operator expects Aura to drop both.
- Capacity CLI subcommands; the premise died with the retirement and the docs are MCP-only.
- Aura-side behavior changes (the flagged wiki contradictions go through the feedback tool, not this repo).
- The operator's separate Atlassian MCP usage outside this package.

## Further Notes

- The evidence worklists live in the planning tasks' Notes sections and their .work reports under the effort directory; the introspection dump (the verbatim 120-tool server surface) is the contract source for every tool claim.
- Two Aura-side wiki bugs are recorded for the operator, not fixed here: the tracker-aura guide carries a pre-split status series and a reopen observation that contradicts the live tool description; the patchnote's threaded-comments claim contradicts the live flat listing. The sanctioned path is the Aura feedback tool.
- The planning record corrected one seed assumption during the reshape session: the mention-candidates tool on the server serves user mentions inside comments, not entity search, and is not part of this machinery.
- One usecase phrasing (a "planning hub" description of the task detail read) is to be verified against a live payload at ticket time before it is kept, as the usecase report flagged.
- REST-only capabilities (company capacity settings, notification writes, the excluded permission fields) appear in the docs only as UI pointers, with at most a non-teaching note that the REST API exists.
- The release also carries the changelog entries for the digest removal, since 0.9.0 covers both.

> The architecture content in this specification is archival: the living architecture document is [architecture.md](architecture.md); update it there, not here.
