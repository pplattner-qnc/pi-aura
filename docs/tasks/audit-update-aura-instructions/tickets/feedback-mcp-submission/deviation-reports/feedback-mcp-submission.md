---
type: deviation report
title: Deviation report for feedback-mcp-submission
status: stable
---

## Deviation report: feedback-mcp-submission

Scope reviewed: the ticket diff and the implementation described in the TDD result. The repo carries no `task/feedback-mcp-submission` branch, so the diff was taken as `git diff 09863ff..HEAD` (`09863ff` being `ticket: finalize mention-machinery-mcp`, the commit the ticket branch grew from), which is the complete ticket work: 731 insertions, 90 deletions, over exactly two files, `extensions/aura-feedback.ts` and `extensions/aura-feedback.test.ts`.

### API surface changes

- **Planned:** The arch spec pinned an internal swap, not a model-facing change: the feedback tool submits through the typed interface's `createFeedback` method with the same calling convention as ticket 2 (pass the notify hook, map `AuraMcpToolUnavailableError` onto the degrade path, treat `AuraMcpCallError` as covering transport, protocol, and in-200 application errors); the sign-off flow, the confirm and edit interaction, and the local JSONL audit record stay (same fields); the injected warning carries the corrected tool naming; the registered `aura_feedback` tool otherwise keeps its identity. Export to dependents: no remaining REST call sites in the extension layer outside the mention machinery.
- **Actual:** All of that landed as specified, and the model-facing surface is unchanged (tool name, parameter schema minus the forced `source`, result outcomes, unadvertised-by-design). What the spec did not spell out, and the implementation added:
  1. The default factory export widened from `(pi: ExtensionAPI)` to `(pi: ExtensionAPI, options: AuraFeedbackExtensionOptions = {})`, with three injectable seams (`loadCredentials`, `createInterface`, `logPath`). This is the same convention the landed reference engine uses for test injection; production passes nothing, and pi invokes the factory with one argument, so it is backward compatible.
  2. New module exports: `AuraFeedbackExtensionOptions`, the structural `FeedbackCreated` row type (replacing the REST `FeedbackDetail` on this module's boundary), and the exported `extractCreatedFeedback` helper, which requires non-empty `id` and `status` strings on the tool-result JSON and throws otherwise, so a malformed server result surfaces as a user-visible error instead of a log entry with a missing uuid.
  3. Interface lifetime differs from the mention machinery: the typed interface is constructed per submission from freshly loaded credentials with the session's notify hook and closed after the send, rather than a once-per-session shared instance (the feedback tool registers no `session_start` hook to share one from). Side effect, arguably a benefit: the contract self-check runs on every submission, so drift warnings reach the user per submission through the notify hook.
  4. Module-header and comment rewrites describing the MCP path (documentation of the module, no behavior).
- **Impact:** No dependent ticket consumed a changed API; the internal additions are additive. Two handoffs materialize: ticket 5 (rest-library-consumer-rule) must count the two type-only fixture imports in `extensions/aura-feedback.test.ts` (`CreateFeedbackInput`, `FeedbackDetail` from `@pi-aura/shared/aura-client`) as an in-package consumer and inline the fixture types if it removes the library; and the stale tool-name token still present in `skills/core/aura/SKILL.md` and `skills/core/aura/resources/usecases/feedback-submission.md` remains ticket 7's (aura-skill-rewrite) worklist item, correctly untouched here. The ticket's export criterion holds and is stronger than stated: no production extension file imports the shared REST client anymore (verified by grep; the production module is additionally pinned test-side against the import and factory names).

### Abstraction usage
- Used/was specified: yes. The shipped interface modules are used exactly as the spec directs: `createAuraMcpInterface` (notify passed through `ctx.ui.notify`, the caller seam for tests), `loadAuraMcpCredentials` behind the package's dynamic-import seams, `AuraMcpToolUnavailableError` for dedicated fail-fast wording, everything else through one generic error text that covers the `AuraMcpCallError` cases as the spec prescribed, plus `auraMcpJson` for the result payload and the contract module's data for test fixtures. No hand-rolled transport, no REST regeneration, no new dependencies.

### Out-of-scope changes
- Em-dash sweep over both touched files (twenty occurrences rewritten). The repo-wide AGENTS.md rule requires no em-dashes in touched code comments, but the ticket and arch spec name an em-dash sweep only for the root documents. Two of the rewrites touched user-visible screen strings (`formatEditedResultText`'s note; the comment-screen prompt pair) rather than only comments; both are behavior-preserving and neither was pinned by an exact-string assertion.
- The test file's stale header comment (still claiming the live aura `POST /feedback` call is exercised by the pi runtime) was rewritten to describe the suite's actual coverage; test-doc change only, with the pre-existing test sections byte-identical to the base commit.
- Criterion 1's "verified against a reachable instance" was implemented hermetically: a loopback fake MCP instance served over real HTTP, driven by the real credential loader over fixture seams and the default pi-mcp caller, rather than the live Aura server (which would have created real feedback rows). Live-instance verification remains the pi-runtime handoff. A deliberate, documented interpretation, not a silent shortcut.
- The error path keeps the pre-existing `outcome: "rejected"` value for failed sends, so the rendered one-liner reads "Rejected" when a send fails while the tool text says precisely what happened ("nothing was sent"). This matches the base behavior exactly (the REST-era catch block already returned the same outcome), so it is a known cosmetic wrinkle, not a regression.

### Ticket doc update needed?
Yes. The ticket has no `## Implementation notes` section yet; create it and append:
- The extension factory accepts an options object (injectable `loadCredentials`, `createInterface`, `logPath`), production-wired by default; the JSONL path is overridable so the hermetic tests never touch the real `~/.pi/aura/feedback.jsonl`.
- The typed interface is constructed per submission from freshly loaded credentials with the session's notify hook and closed after the send; the contract self-check therefore runs per submission.
- `extractCreatedFeedback` requires non-empty `id` and `status` strings on the tool-result JSON and throws otherwise, mapping a malformed result to a user-visible error.
- Hermetic verification note: criterion 1 was verified against a loopback fake MCP server over real HTTP (real loader, default pi-mcp caller); no live-server submission is made by the suite.
- Handoff to ticket 5: `extensions/aura-feedback.test.ts` retains two type-only imports from `@pi-aura/shared/aura-client` (`CreateFeedbackInput`, `FeedbackDetail`); count them and inline the fixture types if the REST library is removed.

### User attention needed?
No. No scope change; the model-facing tool surface is identical to the plan and the internal additions are backward compatible (pi invokes the factory with one argument). The only user-visible deltas are the two reworded screen strings required by the no-em-dash convention, and both preserve behavior.
