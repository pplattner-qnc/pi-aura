---
type: task
subtype: grilling
title: The operator's ideas for reshaping the pi-aura plugin, collected and settled
status: deprecated
workflow_state: done
blocked_by: []
---

## Decision to settle

The operator's ideas for reshaping this plugin (the pi-aura package as a
whole), collected and settled in one open-ended grilling session: what they
want the package to become, which of the audited surfaces survive the
reshaping, and which ideas become new planning work. This is the operator's
session: they bring the ideas; the session stress-tests them into decisions
with consequences, alternatives, and follow-up work.

Known inputs the session should weigh:

- The operator is about to retire the entire CLI and REST access layer
  (recorded in the facilities-documentation-grilling round 1; its scope and
  timing settled there in round 2).
- The eight done research reports' findings (the drift worklists for the
  skill, usecases, process files, router, root docs, extensions, the REST
  spec diff, and the wiki facility-documentation inventory).
- The settled documentation-treatment rule and the two-layer citation
  policy.
- The version 0.9.0 carry-through decision: this effort plus remove-digest;
  a reshape may re-scope or re-slice the release.

## Parent decisions it depends on

- facilities-documentation-grilling (documentation treatment, citations,
  the CLI and REST retirement scope, review-* disposition).

## Choices already known

None yet; the operator brings the ideas. The session maps them into a
design tree, settles them with the operator, and hands precise follow-up
work back to Wayfinder as new planning tasks (research, prototype, or
grilling) or records out-of-scope items.

## Recommended starting answer

Let the operator lead with their ideas; for each idea, settle what it means
for the 0.9.0 scope (fold in, follow-up effort, or reject), and only then
decide which new planning tasks it needs. Do not pre-structure the
operator's ideas into decisions before hearing them.

## Downstream work the answer may create

New Wayfinder planning tasks (research, prototype, further grillings),
re-sliced update tickets in to-spec / to-tickets, changes to the 0.9.0
release scope, or follow-up efforts registered for the reshape itself.

## Notes

Session rounds (the operator's terms):

Round 1: teardown scope CONFIRMED: full teardown of the REST/CLI toolset (scripts/src with aura.ts, gen-rest-doc, the rest-call / rest-search / rest-index family; packages/shared generated client and openapi.yaml; the Taskfile openapi-sync / codegen / bundle targets; their tests). Nothing kept "just in case"; even openapi.yaml goes (the audit stands on its archived reports). Rejected option: keeping the spec file as a citation anchor.

Round 1 fact-finding (done live before answering): the seed question's listMentionCandidates claim was wrong and is corrected: it returns users mentionable in comments (entity_id plus entity_type ARTIFACT/TASK, has_access flag), not entity candidates. The verified coverage table for the mention machinery on MCP: task search listTasks(q, archived all, limit, sort) which also fixes the stale search/status params; task warmup listTasks(page, limit); getTaskByHumanKey; artifact search listArtifacts(q, limit, sort); getArtifact; wiki search searchKnowledge(query); wiki exact getKnowledgeNode and getKnowledgeNodeByPath (both return latest_version); tree getKnowledgeTree with one adaptation: slim nodes (id, slug, title, source_path, children) carry no kind and no latest_version, so candidates come from title plus slug and versions load lazily via getKnowledgeNode at resolve time. Verified in the pi extension docs: extensions cannot call MCP tools through a pi API (they can only register MCP servers), so the migration means the extension carries a small JSON-RPC-over-HTTP client posting tools/call envelopes to the aura-mcp-dev endpoint with the existing keyring PAT.

Round 1, Q2 answer: KEEP the sqlite mention cache and feed it from MCP, with the slim-tree adaptation and the parameter fixes landing inside the same migration. Rationale: the cache is healthy (190 task and 66 artifact rows; the wiki half never populated only because of the broken walk) and pi renders autocomplete exactly once per keystroke, so cache-first is the only design that never lags the typing.

Round 1, Q3 answer: of the seven extensions, DROP engineering-rules; it is being migrated off to another package (the house plugin model). The other six stay: aura-skill-instruction (system-prompt Aura block), aura-tasks (VPN-off reachability warning), aura-references (the mention machinery), aura-reference-cache (its sqlite cache), aura-feedback (the aura_feedback tool with sign-off flow), aura-secrets (the /aura command). Consequence recorded: removing engineering-rules also touches its test, the package manifest, and the README extension tables.

Frontier after round 1: (a) the fate of the engineering-foundation router skill (skills/core/engineering-foundation/): it stays here and gets the router rewrite, or it migrates off with the rules and the router-drift worklist moves to the other package; (b) any further reshape ideas from the operator, or the session closes.

Round 2 answers (the operator's terms):

- Q4: YES, the engineering-foundation router skill under skills/core/engineering-foundation/ migrates off with the rules: the other package becomes the delivery vehicle for the engineering canon. Consequences for this effort: the engineering-foundation-router-drift report's rewrite worklist moves out of this repo's update tickets (the findings travel to the other package); skills/core/engineering-foundation/ is removed from this package rather than updated; the README skill table and AGENTS.md drop their mentions; the audit's instruction-surface set shrinks accordingly.
- Q5: NOTHING FURTHER. The operator states the session's purpose was to give them a chance to put the CLI/REST surface drop on record, which this session did.

Frontier after round 2: empty. Every branch is settled: teardown scope, mention machinery on MCP with the cache kept, the extension set (six stay, engineering-rules drops to the other package), the engineering-foundation skill drops likewise, and no further reshape ideas. Awaiting the completion-gate confirmation before the write-back and done-marking.

Completion-gate round (the operator's terms): the shared understanding was confirmed ("lgtm") with one amendment to the teardown decision:

- The teardown's unconditional target is the AGENT-FACING REST and CLI access: the CLI (the aura.mjs bundle and the scripts around it), rest-api.md, and every doc or tool that exists so the agent can access Aura via CLI or REST tools. That surface is removed under all circumstances.
- The INTERNAL REST library (the generated typed client, the aura-client wrapper, the openapi.yaml and its sync / codegen targets) is NOT dropped unconditionally: if, after the MCP migration, some extension still needs REST, we either keep the library or inline the specific calls into the consumer, decided by how many consumers remain and how likely they are to need updates when Aura's REST changes (a generated library tracks the spec; inlined calls rot silently). If we notice at the end that there are next to no consumers, the library is removed and the few remaining call sites are inlined.

The operator states the session's goal was to get the CLI/REST drop on record, which this session did. Frontier empty, gate passed with the amendment; the write-back follows.
