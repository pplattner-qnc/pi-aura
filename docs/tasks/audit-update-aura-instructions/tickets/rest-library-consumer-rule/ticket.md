---
type: ticket
subtype: feature
title: Apply the consumer rule to the internal REST library
status: stable
workflow_state: ready
blocked_by:
- mention-machinery-mcp
- feedback-mcp-submission
- remove-cli-rest-surface
size: m
---

## What to build

Apply the operator's consumer rule to the internal REST library (the generated typed client, its wrapper, the spec source, and the sync and codegen targets built on it) once the package no longer uses it for agent-facing access or the extension feed.

First count: after the mention machinery and the feedback tool run on the typed MCP interface and the agent-facing removal has landed, enumerate every remaining in-package consumer of the REST library (production code, tests, build targets). Record the count and the consumers; this enumeration is part of the ticket's evidence, not a pre-implementation guess.

Then apply the settled rule:
- With (next to) no consumers: remove the library, its spec source, its sync and codegen targets, and its tests; inline the few straggling call sites (a plain request at the seam, if a straggler genuinely needs one call) so nothing depending on the generated machinery remains.
- With surviving consumers: keep the library whole or inline its few call sites, decided by how many they are and how likely they are to need changes when Aura's REST API changes; a generated library tracks the spec, inlined calls rot silently, so few-but-volatile favors keeping, one-and-stable favors inlining.

Guard tests pin the outcome either way. The final package layout this ticket produces is what the documentation tickets describe.

## Acceptance criteria

- [ ] The evidence of the consumer count (the enumerated call sites after the migrations and the removal) is recorded in the ticket notes.
- [ ] The chosen branch matches the rule for the counted evidence, and the choice with its rationale is recorded.
- [ ] Either way: no half-state remains (no unused library kept without a consumer; no inlined call left overriding a kept library).
- [ ] The guard tests pin the outcome; typecheck and the test list pass.

## Blocked by

- mention-machinery-mcp
- feedback-mcp-submission
- remove-cli-rest-surface
