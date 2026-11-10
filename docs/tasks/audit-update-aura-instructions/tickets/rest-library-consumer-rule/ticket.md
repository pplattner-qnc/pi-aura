---
type: ticket
subtype: feature
title: Apply the consumer rule to the internal REST library
status: stable
workflow_state: done
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

## Implementation notes

Landed as merge 00d53d4 on task/rest-library-consumer-rule (the task branch cut from develop, carrying the working branch's single removal commit 36593ff, 45 files, 171 insertions, 49,865 deletions) plus the land docs commit a430f82 staging the deviation report and the state pointer. The land worker timed out composing its result document after completing every landing mechanic; the parent's close-out CI gate re-ran the full always set on the landed branch green (shared suite, ten extension suites, typecheck).

The consumer count (the ticket's first evidence obligation, recorded here and in the ticket's .work report): zero production consumers. No extension or shared source file imports the REST client, the wrapper modules, the generated SDK, or the spec loader; the reference engine's import died with the mention-machinery seam rename, the feedback tool's with its migration, the CLI's with the removal ticket. The remaining in-package consumers were the two type-only fixture imports in the feedback test (inlined as local fixture types), the library's own seven suites (removed with it), and guard keep-pins (flipped, not consumed).

The decision, on that counted evidence: remove, whole. Gone with the library: the generated client, the wrapper, the REST credential path (its sole consumer was the wrapper), the spec loader and the generic-invoker helpers under it, the spec source itself, the sync and codegen targets and their dev dependency, and the library's tests. Zero-consumer stragglers were removed under the no-half-state criterion rather than inlined (nothing was left to inline into). The guard's keep-target assertions for codegen and openapi-sync were dropped as the sanctioned outcome; the typecheck target pin survives; the stale scripts-tree comments were cleaned. The shared suite is 99 tests after the removal (the count drop is the library's suites leaving).

Export to the documentation tickets: the final package layout is settled. The package ships the six-extension manifest, the three interface modules, the rules loader, the reference engine and cache, and nothing else; the shared package holds the keyring, the settings, and their tests.
