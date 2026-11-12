---
type: ticket
subtype: feature
title: Finalize review cleanup sweep
status: stable
workflow_state: ready
blocked_by: []
size: m
---

## What to build

The finalize review's confirmed cleanup findings, in one mechanical sweep:

- task-management.md's status-flow block (around lines 79-84) still teaches the retired pre-AURA-2211 flat series (READY_FOR_ALIGNMENT and READY_FOR_REVIEW in one chain), contradicting workflow-phases.md in the same package: repoint it at the split series (or at workflow-phases.md), and widen the guard's retired-flat-series ban so it scans the whole usecases directory, not only workflow-phases.md, so this class of stale claim cannot survive the enforcement record again.
- Remove the dead js-yaml dependency and @types/js-yaml devDependency from packages/shared (their sole consumer was deleted with the REST library) and extend the REST-library removal guard to pin their absence.
- Replace packages/shared/src/index.ts's stale placeholder comment naming the retired AuraClient.
- Em-dash sweep over code comments and injected strings per the repo rule: the three interface modules (aura-mcp-contract.ts, aura-mcp-client.ts, aura-mcp-server.ts), cursor-rules.ts, the test files aura-mcp-client.test.ts and cursor-rules.test.ts, the Taskfile header line, the local-provider.ts lines, aura-skill-instruction.ts, and aura-tasks.ts. Reword, do not blind-substitute.
- docs/testing.md: correct the mock-convention sentence that attributes createInterface to the reference engine (it is the feedback factory's injection hook; the engine's hooks are loadCredentials and createCache, and logPath goes unmentioned), and fix the runtime-resolution phrasing that overstates the embed half (the extensions resolve only settings and keyring); the same phrasing echo in the Taskfile comment goes too.
- wiki-knowledge.md's tree-bounds row: the one word "widen" becomes "narrow" (the MCP defaults already equal the schema maxima).
- Remove the zero-consumer embed fixtures (packages/shared/src/embed/ with their tests): nothing in production reads them (only the guard references them), so flip ticket 5's keep-survivors pin accordingly and update the testing-doc mock-convention text that names them.

## Acceptance criteria

- [ ] No shipped file teaches the retired flat status series; the guard bans it across the usecases and process directories.
- [ ] No js-yaml reference remains anywhere; the guard pins the absence; the dependency tree is clean.
- [ ] No em-dash remains in the named files' comments and injected strings; the suite stays green.
- [ ] The testing doc's seam sentences name the right factories and hooks; the Taskfile comment matches reality.
- [ ] The wiki tree-bounds row reads narrow; the guard stays green.
- [ ] The embed fixtures are gone, the keep-survivors pin is updated, and the testing doc no longer presents them as a runtime seam.
- [ ] Full gate green: shared suite, ten extension suites, typecheck.

## Blocked by

None (can start immediately).
