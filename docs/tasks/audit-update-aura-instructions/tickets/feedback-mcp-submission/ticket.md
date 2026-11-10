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

## Implementation notes

Landed as merge b19c7fc on task/feedback-mcp-submission (731 insertions, 90 deletions, exactly the feedback extension and its test). The submission path is the typed interface's createFeedback method, driven by the confirmed sign-off flow; the JSONL record body is byte-identical to the REST-era one; the injected warning carries the corrected tool naming; and no production extension file imports the shared REST client anymore (pinned test-side).

Durable facts: the extension factory accepts an options object with three injectable seams (loadCredentials, createInterface, logPath), production-wired by default, the same convention the reference engine uses; the JSONL path is overridable so hermetic tests never touch the real audit file. The interface is constructed per submission from freshly loaded credentials with the session's notify hook and closed after the send, so the contract self-check runs per submission. A malformed tool result (missing id or status on the JSON) maps to a user-visible error. The suite verified criterion 1 hermetically against a loopback fake MCP server over real HTTP with the real loader and default caller; no live-server submission is made by the tests, leaving the live send as the pi-runtime handoff. The failed-send outcome stays the pre-existing "rejected" wording, matching the base behavior exactly.

Handoff to ticket 5 (rest-library-consumer-rule): the feedback test file retains two type-only imports from the shared REST client for fixtures; count them as an in-package consumer and inline the fixture types if the library is removed. The stale tool-name token in the aura skill file and the feedback usecase resource remains ticket 7's worklist item, correctly untouched here.
