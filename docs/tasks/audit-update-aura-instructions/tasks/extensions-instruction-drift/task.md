---
type: task
subtype: research
title: Which instruction texts and encoded behaviors in the shipped extensions are stale against current Aura?
status: stable
workflow_state: ready
blocked_by: []
---

## Question

The extensions inject or encode instructions agents consume every session:
`aura-skill-instruction.ts` (the system-prompt Aura block),
`aura-tasks.ts` (task-ref rendering: statuses, kinds),
`aura-references.ts` plus `aura-reference-cache.ts` (mention resolution:
task / artifact / wiki kinds and versions), `aura-feedback.ts`,
`aura-secrets.ts`, `aura-health.ts`, `engineering-rules.ts` (cursor-rules
injection). For each, list the instruction text or encoded behavior that is
stale against current Aura: status lists, kind lists, response shapes, MCP
tool names, version fields.

Skip `atlassian-provision.ts`: remove-digest deletes it.

Also determine whether `aura-health.ts` is wired at all. Planning found no
importer and no package.json registration for it; verify and report whether
it is dead code (and what it was for).

## Unblocks

The extension update tickets.

## Trusted sources

- The extension sources under `extensions/`.
- Live `describeTool` output for the tools each extension calls or
  describes.
- Read-only live probes where behavior must be observed (for example a
  task-ref shape); never writes.

## Evidence

An extension-by-extension stale list in
`docs/tasks/audit-update-aura-instructions/tasks/extensions-instruction-drift/report.md`
(file and location, stale text or behavior, grounded correction), plus the
aura-health wiring verdict.

## Likely dependents

to-spec; openapi-spec-drift feeds REST-shape findings for extensions that
call REST directly.
