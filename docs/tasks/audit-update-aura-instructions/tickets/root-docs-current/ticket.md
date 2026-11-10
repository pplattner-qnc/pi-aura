---
type: ticket
subtype: feature
title: Root documents current
status: stable
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

The root documents describe the final package: the post-teardown tree, the six surviving extensions with their MCP access, the registration behavior, and the current credential story. Working from the root-docs report's claim-by-claim worklist:

- README: the MCP configuration section becomes an optional-override note (the package registers the server from the keyring; a user's own entry wins); the install pin names the current released version; the false "no user-facing commands" claim is corrected to name the secrets command and the feedback tool; the unused prerequisites are dropped; the CLI and REST sections are gone; the skill and extension tables match the shipped reality (no moved-out entries).
- The glossary (CONTEXT.md) entry set is refreshed to the post-reshape truth: the PAT lives in the keyring with the MCP config file as the import source; the access-client and keyring entries describe what ships; the stale server description and tool count go.
- The project instructions file (AGENTS.md) loses the engineering-surface bullets and matches the shipped layout and conventions.
- The testing doc's mock conventions match what the tests actually do (including the earlier report's findings on the suite's stated limits); the typecheck-plus-suite bar is stated against the post-teardown tree.
- The dev-env doc describes the post-teardown setup: the install flow, the working layout, the local seams, and nothing about removed build targets.
- Em-dashes are removed from touched prose.

This ticket verifies against the final tree delivered by the removal, consumer-rule, and move-out tickets, which is why it waits for them.

## Acceptance criteria

- [ ] Every stale row in the root-docs report's claim list is corrected or removed; current rows stay current.
- [ ] A new team member following the README and dev-env doc alone reaches a working checkout; nothing references a file or target that no longer exists.
- [ ] The glossary's terms all reference shipped surfaces; no deleted module is named as current.
- [ ] No root document teaches manual MCP setup as required, REST or CLI access, or the removed build targets.
- [ ] No em-dash in touched prose.

## Blocked by

- mention-machinery-mcp
- feedback-mcp-submission
- remove-cli-rest-surface
- rest-library-consumer-rule
- engineering-surfaces-move-out

## Implementation notes

Landed as merge dc401e5 on task/root-docs-current (8 files, 433 insertions, 100 deletions: the five root documents, the worklist-flagged package.json description line, and 19 new guard tests in six describe blocks; the shared suite is 197, the guard file alone 152). All 19 stale rows of the root-docs worklist are corrected or removed and the current rows re-verified against the tree; the docs teach the post-reshape registration story (the package registers the server from settings plus keyring, a user's own entry wins, no manual setup required) wherever the audit's pre-reshape suggestions were superseded.

Durable facts: retired names are taught by absence, not negation (no AuraClient or HeyApiAuraClient aliases in the glossary, no "no longer" sentences in the testing doc), and the guards pin them outright, so even a negating sentence fails the suite. The README's Extensions section sits after Usage deliberately, keeping the skill-table guard's parse region clean. The install pin names v0.8.0 and takes a one-word update when the 0.9.0 release lands (outside the effort per the phase decision).

Residuals for the coherence pass: the injected system-prompt string in the skill-instruction extension still carries em-dashes (code, outside this ticket's files); two one-line imprecisions found in review (the testing doc attributes createInterface to the reference engine rather than the feedback tool and omits the logPath seam; the "embed modules the extensions resolve at runtime" phrasing overstates the embed half).
