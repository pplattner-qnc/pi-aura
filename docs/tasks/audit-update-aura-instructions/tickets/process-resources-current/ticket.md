---
type: ticket
subtype: feature
title: Process resources current
status: stable
workflow_state: ready
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
