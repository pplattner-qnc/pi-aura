---
type: ticket
subtype: feature
title: Remove the agent-facing CLI and REST surface
status: stable
workflow_state: ready
blocked_by: []
size: l
---

## What to build

The agent-facing CLI and REST access surface leaves the package. This is the operator's settled retirement: removal, not migration and not a rewrite.

Removed: the bundled CLI and the scripts that exist only to serve it (including the six dead artifact review subcommands, which call endpoints the live server no longer serves; they are deleted with no successor, since the opinions flow has no CLI commands to migrate to), the generated REST reference resource in the skill directory, the build and regeneration targets for those artifacts, and every doc passage that teaches reaching Aura through the CLI or REST. The package's shipped documentation afterwards teaches MCP-first access, the codemode-plus-write pattern for file workflows, and UI pointers for the REST-only capabilities (company capacity settings, notification writes, the excluded permission fields).

The remnants-style guards are extended to pin the removal: the retired names, the removed command surface, and the REST-teaching patterns fail the suite if they reappear.

## Acceptance criteria

- [ ] No shipped file teaches CLI or REST access to Aura; the docs teach the codemode download pattern and UI pointers instead.
- [ ] The CLI bundle, its serving scripts, and the REST reference resource no longer exist in the package; the build surface contains no target that produces them.
- [ ] The guard tests fail on re-introducing the removed names or REST-teaching patterns.
- [ ] Typecheck and the run-these-always test list from the testing doc pass after the removal.
- [ ] The user-visible MCP-first behavior (skills, mention machinery, feedback, registration) is unaffected.

## Blocked by

None (can start immediately).
