---
type: ticket
subtype: feature
title: Process resources current
status: deprecated
workflow_state: done
blocked_by:
- mention-machinery-mcp
- feedback-mcp-submission
- remove-cli-rest-surface
- rest-library-consumer-rule
- engineering-surfaces-move-out
size: m
---

## What to build

The seven process resources become current against the live process canon (the replacement way-of-working wiki pages that superseded the archived single article), working from the process-resources report:

- Every file's canonical reference repoints from the dead path to the replacement page under the way-of-working section that maps onto it.
- workflow-phases.md is rewritten to the split status series: resolved by hierarchy level and workflow variant, immutable at creation; the standard series without the two retired statuses; the lean series for sagas and subtasks; the discovery series ending after alignment; the contributor-started phases except deployment.
- capacity.md moves to the new capacity model: the placeholder epic for non-task work, the commitment steps, full landing, the daily reset, finished work still counted; no structural reserve; the MCP capacity tools as the access path.
- review-modes.md teaches opinions as the successor flow (graded scale, no locks or rounds, edit-after-submit, the listing filter on MCP) and drops the dead CLI review commands entirely.
- The quality gates are documented: the disciplines' sign-offs, per-gate check instructions, the verdicts, and the reason requirement to leave a rejected gate.
- integrations.md updates the Asana posture (create-from-Aura with auto-link), the deliberate Jira creation, and the task-parenting rule.
- roles, escalation, and the index get the header repoints and their minor corrections.

Semantics and process claims cite the replacement pages; no tool-contract claim cites anything but the introspection evidence or the synced spec; the June repository mirror is never cited; tracker-aura's calling discipline is cited minus its two flagged errors. No em-dashes in touched prose.

## Acceptance criteria

- [ ] No canonical reference in the seven files resolves to a dead path; each file cites its replacement page.
- [ ] The status series in the process files matches the live server's recorded behavior (level- and variant-resolved, the retired statuses gone).
- [ ] No CLI review command appears; opinions are taught as the review flow.
- [ ] The capacity model described matches the replacement canon (steps, landing, reset, placeholder epic).
- [ ] No em-dash in touched prose.

## Blocked by

- mention-machinery-mcp
- feedback-mcp-submission
- remove-cli-rest-surface
- rest-library-consumer-rule
- engineering-surfaces-move-out

## Implementation notes

Landed as merge c87b592 on task/process-resources-current (9 files, 931 insertions, 114 deletions: the seven process files plus 31 new guard tests in eight describe blocks; the shared suite is 178). All canonical references repoint to the way-of-working 1.x pages, verified live through the package's typed-interface caller (the six pages resolved with the planning report's node IDs; the dead path returns not-found; the probe record lives only in the ticket's gitignored .work directory, the guards and this report being the durable record).

Durable facts: workflow-phases.md teaches the split status series (level and variant resolved, immutable at creation with AURA-2335 named as the pending mutability change, the standard series without the two retired waiting statuses, the lean and discovery series), the v18 quality gates (37 disciplines, verdicts, the reason requirement), the v19 contributor-started phases except deployment, the discard and reopen contracts, the fixed rework jumps, and the updateTask-by-id one-step walk discipline cited from tracker-aura minus its two flagged errors. review-modes.md teaches opinions as the successor flow on the graded scale with the opinion_requested filter. The capacity model is current: the placeholder epic, the commitment steps, the full landing, the daily reset, finished work counted, the 80/20 reserve gone (the guard pins retired vocabulary outright, so even a negating sentence fails the suite); the leadership overview is readCapacity's company scope, the not-on-MCP set narrowed to the settings and the cross-member view (the two corrections ticket 8's deviation report handed over). integrations.md drops the retired REST operation names; roles.md documents the four live membership tools with the owner and crew search kept as UI pointers; the person-level stakeholder mapping became the Personio pointer the wiki itself uses (a one-line content decision to revisit if agents should carry a local name-to-concern list).

Residuals: if AURA-2335 lands (variant mutability), the immutable line needs a one-word update; the wiki 1.x pages remain the canon, so future Aura-side edits re-stale these summaries until the next audit, with the canonical-reference headers always pointing at the live pages.
