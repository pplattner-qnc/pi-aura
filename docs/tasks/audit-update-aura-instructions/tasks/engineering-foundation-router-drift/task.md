---
type: task
subtype: research
title: Do all engineering-foundation router paths still resolve, and is the blueprint and ai-setup flow current?
status: stable
workflow_state: ready
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
