---
type: architecture
title: Audit, refresh, and reshape pi-aura to teach the live Aura server MCP-first
status: stable
---

# Architecture: audit, refresh, and reshape pi-aura

Produced from the stable specification at `docs/tasks/audit-update-aura-instructions/spec.md`; this document is the living architecture from here on, and the specification's architecture content below is archival from this write.

## Problem statement (archival, from the specification)

The package's instruction surfaces teach an Aura server that no longer exists. The aura skill documents a 90-tool server while the live aura-mcp-dev server (build 2026-10-12, commit 4aa37833) exposes 120 tools; the capacity guidance tells agents the capacity MCP tools are gone when three of them are back; the process resources teach a status series and a review flow Aura replaced months ago; the root docs teach a config file shape pi does not read. An agent that follows the shipped instructions is actively misled, not merely underserved.

At the same time the package carries an agent-facing CLI and REST access layer (the bundled CLI, the REST reference document, and the docs that teach them) that the operator is retiring, and two engineering surfaces (the engineering-foundation skill and the engineering-rules extension) whose job has moved to another package. The package must be refreshed and reshaped so that what it ships is true of the live server and carries only the surfaces it still owns.

## Solution (archival, from the specification)

Every instruction surface that survives the reshape teaches the live 120-tool aura-mcp-dev server, MCP-first: the aura skill and its usecase and process resources follow the confirmed placement map and the two-layer citation policy; the root documents carry no stale claim from the audit reports. Of the seven extensions, six survive, and the two that call Aura (the mention machinery and the feedback tool) run their access on the MCP server through a small in-extension client, keeping the sqlite mention cache and its instant-render behavior. The agent-facing CLI and REST surface is removed; the internal REST library is removed when (next to) no in-package consumers remain after the migration, otherwise kept or inlined per the consumer rule. The engineering-foundation skill and the engineering-rules extension move out.

## Implementation decisions (archival, from the specification)

### Instruction surfaces

**The aura skill file.** The rewrite follows the mcp-inventory report's outline: the tool count becomes 120 with the build identity (2026-10-12, commit 4aa37833) cited once; the ten mcp* tools stay listed with three one-line corrections (the new opinion artifact kind replacing review, the base64 upload description with its size limit, the artifact mode renamed to whole with the section and whole-body limits and the expected-version contract); the "left MCP entirely" paragraph becomes a per-capability scorecard (back: the capacity tools, board summary, owner and crew search; half back: Jira and Asana reads, wiki file reads, memory browse plus ingest; still absent: notification writes, the review-turned-opinion flow beyond its listing filter, skills import, wiki upload); the response-format contract is added (compact default, detail on the declaring tools, full on the two task reads; MCP-only, not part of the HTTP API; the permission apparatus excluded from every tier and reachable by the same PAT through REST); the new tool families get bullet-level coverage; threaded comments become flat per the live description; the contradictory capacity sentences are resolved to the current truth; the stale feedback tool-name token is fixed to the current naming. aiSetup and getBlueprintFiles are not documented at all.

**Usecase resources.** The twelve usecase files get their per-file corrections from the usecase-resources worklist under the confirmed placement map: capacity-planning.md is rewritten (the capacity MCP tools are back and documented as the primary path; company capacity settings and the cross-member per-task view are REST-only capabilities and get UI pointers); the uuid-to-id parameter sweep lands across the task, signals, wiki, skills, and unified-search files; wiki-knowledge.md documents the frontmatter save contract (identifier plus raw YAML string or null), version numbering shapes, and file-asset version history; task-management.md gains owner and crew management, the blocked flag, the story-point flow, the priority queue, progress, activity, user groups, repository linking, the workflow variant, and the neighborhood read, and drops its false "no member management on MCP" claim; code-search.md drops its nonexistent parameter and documents the repository-slug format; unified-search.md adds the FEEDBACK source and the mention-candidate tool with correct limit semantics; artifact-management.md documents the opinion_requested filter and the whole-mode replace contract; memory-graph.md corrects the ingest contract (no reason parameter, open questions) and the entity-source result (a navigable route, not provenance); feedback-submission.md gets the triage flow and the fixed tool naming; upload-documents.md is verified current and stays.

**Process resources.** The seven process files repoint their canonical references to the replacement wiki pages under the way-of-working section; workflow-phases.md is rewritten to the split status series (resolved by hierarchy level and workflow variant, immutable at creation; the standard series without the two retired statuses; lean series for sagas and subtasks; discovery ending after alignment); capacity.md moves to the new capacity model (the placeholder epic for non-task work, commitment steps, full landing, the daily reset; no structural reserve); review-modes.md teaches opinions as the successor flow (graded scale, no locks or rounds, edit-after-submit) and drops the dead CLI review commands; the quality gates (disciplines, verdicts, the reason requirement to leave a rejected gate) are documented; integrations.md updates the Asana and Jira postures and task parenting; roles, escalation, and the index get header and minor updates.

**Root documents.** README, CONTEXT.md (the glossary), AGENTS.md, docs/testing.md, and docs/dev-env.md take the root-docs worklist: the MCP configuration example moves to the pi-native config file with url plus headers; the install pin tracks the released version; the "no user-facing commands" claim is corrected to name the secrets command and the feedback tool; the unused prerequisites are dropped; the credential story describes the keyring and the settings-derived base URL with the MCP config file as the import source only; the glossary entries for the access client and the keyring describe the post-reshape reality; the dev setup flow describes the post-teardown tree; the testing mock conventions match what the tests actually do; the extension and skill tables lose the moved-out entries; em-dashes are removed from touched prose.

**Citation policy.** Two layers: tool contracts (names, parameters, shapes, limits) cite only the live introspection evidence or the synced spec; semantics and process cite the wiki (the patchnotes for what a facility is, the replacement process pages, the task-artifact conventions page for the story-point scale, tracker-aura for calling discipline minus its two flagged errors). The June repository mirror is never cited as current; chat-only tool names from the skills spaces are never copied into the docs.

### Extensions and the MCP feed (amended at ticket time, see the phase decisions section)

The mention machinery and the feedback tool reach Aura through a typed interface standing on pi's own MCP client library, plus a model-facing server registration owned by the package; details in the contracts below. The sqlite cache keeps its stale-while-revalidate design; the feedback tool keeps its sign-off flow and JSONL record; the prompt-injection extension, the secrets command, and the reachability probe keep their behavior.

### Teardown and the consumer rule

**The agent-facing surface is removed unconditionally:** the bundled CLI, the scripts that only serve it, the REST reference resource, the Taskfile targets that build or regenerate them, and every doc that teaches REST or CLI access to Aura. The six dead review subcommands are removed, not migrated.

**The internal REST library follows the consumer rule:** after the MCP migration lands, the in-package consumers of the generated client and its wrapper are counted. With (next to) none, the library, its spec source, its sync and codegen targets, and its tests are removed, and any straggling call site is inlined. With surviving consumers, the library is either kept whole or its few call sites are inlined, decided by how many there are and how likely they are to need changes when Aura's API changes. The decision is made at implementation time on the counted evidence, not pre-emptively.

**Guards.** The remnants guard that pins removed surfaces is updated to hold the new retirements.

### Move-out of the engineering surfaces

The engineering-foundation skill directory and the engineering-rules extension (with its test) are removed from this package; their new home is the other package, which becomes the sole delivery vehicle for the engineering canon. The removal updates the package manifest, the README tables, and the project instructions file.

## Phase decisions recorded at ticket time (operator rulings)

These supersede the corresponding archival statements above:

- **Transport reuse.** No transport is hand-rolled. The typed interface stands on `@earendil-works/pi-mcp` (the MCP client library pi itself uses, present in the dependency tree and resolvable inside the pi process where the extensions run), using its client and streamable HTTP transport with the endpoint from settings and the PAT from the keyring.
- **Server registration.** One part of the package registers the model-facing aura-mcp-dev server at extension load from settings plus keyring, silently skipping when no PAT is stored; a user's own configuration entry keeps precedence. The package's own data path uses its own client instance through the typed interface (pi does not expose its live tool connection to extension code); the two connections share the endpoint and the PAT. The README's MCP configuration section becomes an optional-override note.
- **Contract self-check.** On every initialization the typed interface fetches the server's live tool schemas and compares them against the definitions the package ships (derived from the effort's introspection evidence). Cosmetic drift (a new optional parameter, a changed description) warns the user naming the tool and the difference. Core drift (a tool gone, a parameter the interface sends or reads renamed, retyped, or newly required) makes that tool's path unavailable: calls fail fast, the affected machinery degrades to its established cache-only behavior, and the warning names what broke. The shipped definitions are refreshed whenever the package re-audits the server; this check is the drift-detection loop the effort exists to close.
- **Documentation ordering.** The documentation tickets wait for the code tickets; they never describe files still present.
- **Release outside the effort.** The version bump, the changelog entries, and the tag for 0.9.0 happen outside this effort, which supersedes the specification's Release subsection and the map's release-scoped success test. The README install-pin correction stays in the root-documents ticket.

## Per-ticket graph and interface contracts

Ten tickets. Levels (blockers first): the registration-and-interface ticket, the CLI-REST removal, and the engineering move-out can start immediately; the two migrations wait on the interface; the consumer-rule ticket waits on the migrations and the removal; the four documentation tickets wait on all five code tickets.

**1. aura-mcp-interface (feature, m; blocked by none).** One extension registers the model-facing server (settings endpoint, keyring PAT, no-op without a PAT). A typed wrapper module over the pi MCP client library provides strictly typed methods for the surface the machinery and the feedback tool use: task search (full-text plus archived visibility, paging, sorting), task read by human key, artifact search and read, knowledge search, tree fetch, node reads by identifier and by path, space listing, feedback creation. Types derive from the effort's introspection evidence. The wrapper carries the contract self-check (warn on cosmetic drift; fail fast and mark the path unavailable on core drift) and an injectable caller seam for tests. **Exports to dependents:** the wrapper constructor with the caller seam; the per-tool typed methods; a degraded-path error the consumers map onto cache-only behavior; the registration behavior that must not break when credentials are absent.

**2. mention-machinery-mcp (feature, l; blocked by 1).** The reference engine and its sqlite cache switch every lookup to the typed interface: task search with the corrected parameters, task resolution by human key, artifact search and resolution, knowledge search, node resolution by identifier and path, tree fetch with the slim-shape adaptation (candidates from title and slug, versions loaded lazily from the node read). The stale task-search parameters die here; the wiki walk that never populated is rebuilt against the tree the interface returns. The rendered output contract (reference tags, titles, statuses) is unchanged; the cache-first render behavior is unchanged. **Exports to dependents:** the end state the documentation tickets describe: three mention kinds resolving over MCP with a working wiki half.

**3. feedback-mcp-submission (feature, m; blocked by 1).** The feedback tool submits through the typed interface's create-feedback method; the sign-off flow, the confirm and edit interaction, and the local JSONL audit record stay; the warning text carries the corrected tool naming. **Exports:** no remaining REST call sites in the extension layer outside the mention machinery.

**4. remove-cli-rest-surface (feature, l; blocked by none).** Removes the bundled CLI, the scripts serving only it, the REST reference resource, the build and regeneration targets for them, and the doc passages teaching that access; extends the remnants guards to pin the removed names. The six dead review subcommands go with the CLI; no migration. **Exports to dependents:** the guard-enforced absences the consumer-rule and documentation tickets rely on, and the shrunken build surface.

**5. rest-library-consumer-rule (feature, m; blocked by 2, 3, 4).** Counts the in-package consumers of the generated client and its wrapper after the migrations and the removal; with (next to) none, removes the library, its spec source, its sync and codegen targets, and its tests, inlining any straggling call site; with survivors, keeps or inlines per the settled rule, recording the count and the choice. **Exports:** the final package layout the documentation tickets describe, and the stated decision.

**6. engineering-surfaces-move-out (feature, m; blocked by none).** Removes the engineering-foundation skill directory and the engineering-rules extension with its test; updates the package manifest, the README tables, and the project instructions file for the removed entries. **Exports:** a manifest listing exactly the six surviving extensions.

**7. aura-skill-rewrite (feature, l; blocked by 2, 3, 4, 5, 6).** The skill file per the mcp-inventory report's outline (section 9 of that report): the live count with the build identity, the mcp* corrections, the leave-and-return scorecard, the response-format contract, new families at bullet level, flat comments, the capacity contradiction resolved, the stale feedback tool-name token fixed, and no mention of the two expected-dead tools. **Exports:** the skill surface the usecase resources hang off.

**8. usecase-resources-current (feature, l; blocked by 2, 3, 4, 5, 6).** All twelve usecase files per the usecase-resources worklist and the confirmed placement map, including the capacity rewrite, the parameter sweep, the family additions, the codemode download pattern, and the one flagged phrasing verified against a live payload. **Exports:** usecase text consistent with the rewritten skill.

**9. process-resources-current (feature, m; blocked by 2, 3, 4, 5, 6).** The seven process files repointed to the replacement wiki canon with the split status series, the opinions flow, the new capacity model, the quality gates, and the integrations update. **Exports:** process text consistent with the live canon.

**10. root-docs-current (feature, m; blocked by 2, 3, 4, 5, 6).** README, the glossary, the project instructions file, the testing doc, and the dev-env doc per the root-docs worklist against the final tree (the post-teardown layout from tickets 4 and 5, the manifest from ticket 6, the registration behavior from ticket 1, which turns the manual MCP configuration section into an optional-override note). **Exports:** root documents describing exactly the shipped package.

## Existing abstractions to use

- `@earendil-works/pi-mcp` (1.4.0): the MCP client, the streamable HTTP transport (URL plus headers), tools/call, list-tools with schemas, abort and timeout semantics. No protocol code is written.
- The package's shared settings and keyring modules (with their dynamic-import seams and the fake keyring).
- The sqlite reference cache and its stale-while-revalidate engine: kept, only its feed changes.
- The extension warning pattern (a UI notify naming the failure, used by the reachability probe) for surfacing drift warnings.
- The remnants-style guards for pinning absences.
- The planning tasks' Notes sections and `.work` reports as the authoritative worklists; the introspection dump as the type source.

## Do-not-reimplement notes

- No hand-rolled JSON-RPC, no envelope building, no reconnect logic: pi's MCP library owns all of it.
- No second symlink of the model-facing registration: one registration, and it yields to the user's own configuration.
- The sqlite cache is not rebuilt; the rendering contract (one render per keystroke, cache-first, late resolutions dropped) is unchanged.
- The typed REST client is not regenerated anywhere in this effort; the consumer-rule ticket only removes or preserves it.
- No new runtime npm dependencies: the pi-process modules resolve the way the existing extension imports do (dynamic-import seam; the implementer verifies the import resolves in the packaged extension the same way the shared modules already do).

## Seams

- **The caller seam**: the typed wrapper takes an injectable caller; tests assert envelopes, degraded-path errors, and the self-check verdicts against fakes.
- **The credential seam**: the registration and the wrapper read settings plus keyring through the existing dynamic-import seams; tests use the fake keyring and settings fixtures.
- **The degrade seam**: a core-drift unavailable path surfaces as the same failure shape the reference engine already maps onto cache-only answers.
- **The evidence seam**: each documentation ticket works from its planning task's recorded worklist, not from re-derivation.
- **The guard seam**: removed names and retired claims are pinned by tests, so regressions fail the suite rather than a review.
