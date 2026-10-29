---
type: task
subtype: research
title: Which claims in README.md, CONTEXT.md, and AGENTS.md are stale against the post-removal package and current Aura?
status: stable
workflow_state: ready
blocked_by: []
---

## Question

Audit the root docs claim by claim:

- README.md: the install example pins `v0.1.0` while package.json is 0.8.0;
  the skill table includes aura-digest and the agents table lists the
  morning agents (both removed by remove-digest: mark "removal handles");
  the morning-routine usage section; the design-principles lines about the
  digest pipeline and `deepseek-v4-flash`; the prerequisites and MCP
  config section.
- CONTEXT.md: the digest-related terms (Digest, digest-dashboard,
  in-process, /digest: "removal handles"); the `mcp*` tools term (it embeds
  the "90" count and the old server description); the AuraClient
  description.
- AGENTS.md: the `skills/core/aura-digest` line ("removal handles"); the
  rest against current Aura.
- docs/testing.md and docs/dev-env.md (amended into this task at
  remove-digest spec time): after remove-digest rewrites their digest and
  Atlassian sections, audit the remaining claims: the keyring-era bundle
  externals claim, the runner and mock-convention descriptions, and
  anything else that no longer matches the post-removal tree.

Mark each digest-related claim "removal handles"; audit the rest against
current Aura and the post-removal tree.

## Unblocks

The root-docs update tickets.

## Trusted sources

- The five files (README.md, CONTEXT.md, AGENTS.md, docs/testing.md,
  docs/dev-env.md).
- The live server facts (the mcp-inventory-drift report).
- package.json and Taskfile.yml for what the post-removal package actually
  ships.

## Evidence

A claim-by-claim list in
`docs/tasks/audit-update-aura-instructions/tasks/root-docs-drift/report.md`
(claim, file and line, verdict: stale / removal-handles / current,
correction).

## Likely dependents

to-spec.
