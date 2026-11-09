---
type: ticket
subtype: feature
title: Root documents current
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
