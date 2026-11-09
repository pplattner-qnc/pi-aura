---
type: ticket
subtype: feature
title: Feedback submission on MCP
status: stable
workflow_state: ready
blocked_by:
- aura-mcp-interface
size: m
---

## What to build

The feedback tool keeps its identity and gains a new submission path. Everything the user sees stays: the model-invoked feedback flow with the confirm and edit interaction where a human signs off before anything is sent, and the local JSONL audit record appended after a submission. What changes is underneath: the submission goes through the typed interface's feedback-creation method (backed by the MCP server) instead of the REST library's post.

The instruction text the tool injects keeps its meaning (the model must not call the server's feedback tool directly, because that path submits with no human sign-off) but carries the corrected tool naming; the stale token that names a tool under a naming scheme that no longer exists is gone.

With this ticket, the extension layer's only remaining Aura access outside the mention machinery is gone from the REST library, which is the precondition the consumer-rule ticket counts on.

## Acceptance criteria

- [ ] A feedback submission confirmed through the sign-off flow lands in Aura (verified against a reachable instance) via the MCP path; no REST call site remains in the feedback extension.
- [ ] The local JSONL audit record is appended exactly as before, with the same fields.
- [ ] The injected warning names the current full tool name and still forbids direct model calls without sign-off.
- [ ] A simulated interface unavailability (core drift on the feedback path) surfaces as a user-visible error from the sign-off flow, not a silent no-op.
- [ ] The existing confirm-and-edit tests pass unchanged; new tests cover the MCP submission path with the fake caller.

## Blocked by

- aura-mcp-interface
