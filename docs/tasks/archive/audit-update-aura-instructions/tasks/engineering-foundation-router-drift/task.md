---
type: task
subtype: research
title: Do all engineering-foundation router paths still resolve, and is the blueprint and ai-setup flow current?
status: deprecated
workflow_state: done
blocked_by: []
---

## Question

`skills/core/engineering-foundation/SKILL.md` routes questions to wiki
node paths under the `engineering-foundation` space and describes the
blueprint flow (blueprint/manifest.yaml, blueprint/rules, blueprint/skills,
aiSetup / getBlueprintFiles / ai-sync).

(a) Does every routed path in the router table still resolve in the live
wiki (`getKnowledgeNodeByPath`, `getKnowledgeTree`)?

(b) Has the space's structure changed in ways the router misses: new nodes
worth routing, moved nodes, stale mentions?

(c) Is the described blueprint / ai-setup / ai-sync flow still what the
live tools do (`aiSetup` and `getBlueprintFiles` descriptions, manifest
behavior)?

## Unblocks

The engineering-foundation SKILL.md update ticket.

## Trusted sources

- Live MCP: `getKnowledgeTree` on the engineering-foundation space,
  `getKnowledgeNodeByPath` per routed path, `describeTool` for aiSetup and
  getBlueprintFiles.
- The SKILL.md router table itself.

## Evidence

A path-by-path resolution table plus a structure diff and flow-verification
notes in
`docs/tasks/audit-update-aura-instructions/tasks/engineering-foundation-router-drift/report.md`.

## Likely dependents

to-spec.

## Notes

Resolved 2026-11-09 against the live wiki (getKnowledgeTree full untruncated tree, getKnowledgeNodeByPath per routed path, live page quotes), the introspection dump (aiSetup and getBlueprintFiles describeTool output), and skills/core/engineering-foundation/SKILL.md. Evidence report: .work/report.md (path-by-path resolution table, structure diff with history, flow verification).

Settled results:
- (a) Path resolution: 8 of 11 router rows resolve live. All 3 blueprint rows (blueprint/rules/, blueprint/skills/, blueprint/manifest.yaml; SKILL.md L25-27) fail with "Node not found".
- The whole blueprint/ subtree is retired from the wiki: the full tree (48 nodes, truncated: false) has zero blueprint or manifest nodes, and the live AI-Readiness Rollout page states verbatim: "The earlier blueprint registry and its checksum manifest are retired with the blueprint tree." Parent verified independently: 48 nodes, zero blueprint mentions.
- (b) Structure drift: 40 of 48 live nodes are unrouted, including entire subtrees the router never mentions: playbooks/ (8 nodes), rollout/ (2), guides/observability/ (6), guides/governance/ (1), plus 14 top-level guides. Structure history from the live log: recipes/ was renamed playbooks/ on 2026-09-03, the six-playbook rework landed 2026-10-06, and rollout/agent-plugins-onboarding (2026-10-14) and guides/governance/house-standard-governance (2026-10-26) are new.
- The router's taxonomy paragraph is stale: the live wiki has one tags class (reference), resource is now always the origin path, and Playbook is an AI-readiness unit (Inputs Table plus execution block), explicitly not a narrative workflow.
- The "How blueprint/ maps into a repo" section describes a dead source; the live model ships rules and skills as plugins (anw-engineering-foundation and anw-ai-setup from anwaltde/agent-plugins), with repo rules as two real files per harness.
- (c) Flow check: SKILL.md agrees with the live aiSetup and getBlueprintFiles tool descriptions, but both lag the wiki, which retired what those tools describe. No aiSync MCP tool exists (ai-sync is a skill), which SKILL.md never contradicts. Whether aiSetup and getBlueprintFiles still function against the retired subtree is untested and needs an Aura-team answer before their mentions are kept.
- The router's own description (SKILL.md L3) promises "the house rules" and "the blueprint skills" topics; both now route to dead paths. The two fetch handoffs remain valid (getKnowledgeNodeByPath argument names confirmed live; aura.mjs and the wiki-knowledge.md resource exist).

Recommendation (high confidence for a and b; medium for c): the SKILL.md update ticket replaces the three blueprint rows (playbook set to playbooks/index, plugin contents to rollout/agent-plugins-onboarding, house-rule knowledge to the guides), rewrites the blueprint prose to the plugin model, fixes the taxonomy paragraph, and adds rows for guides/observability/, guides/governance/house-standard-governance, guides/ai-docs-structure, guides/tracker-aura, and rollout/.

Open questions: whether aiSetup and getBlueprintFiles are retired or serve the retired subtree (Aura-side; ask before keeping their mentions; if stale, the aura_feedback path applies); whether an unlogged blueprint removal entry exists; whether house-rule guides get individual router rows or one row plus rule frontmatter (this is the map's granularity fog item); the report lives at .work/report.md rather than the task text's report.md (.work is the gitignored, guard-exempt evidence location).
