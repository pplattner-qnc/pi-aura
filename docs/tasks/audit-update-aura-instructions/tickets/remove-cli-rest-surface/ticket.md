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

## Implementation notes

Landed as merge 41f4901 on task/remove-cli-rest-surface (45 files, +392 / -19367): the whole scripts workspace is gone (aura.ts, the rest-* modules, gen-rest-doc, gen-rest-index, and their 10 suites, plus the workspace manifest), the CLI bundle and the REST reference resource are deleted, the root workspaces list narrows to the shared package, and the Taskfile drops gen-rest-doc, gen-rest-index, build, watch, and clean. scripts/openapi-sync.sh and scripts/release.sh stay: they serve the shared package, which is ticket 5's domain, and a guard assertion pins the codegen, openapi-sync, and typecheck targets present against over-deletion (ticket 5 must drop that assertion if it removes the REST library, the expected hand-off).

Hand-offs recorded for the remaining tickets: testing.md and dev-env.md already carry the post-teardown statements and the narrowed always list (no scripts loop, no build step; typecheck covers the shared workspace only), so that slice of ticket 10 is done. The teaching guard's deliberate exceptions: REST-only capability labels, the non-teaching REST-exists note, and the same-PAT phrasing are legal; descriptive API-shape mentions sit outside the scan. upload-documents.md no longer matches its "verified current, leave as is" baseline (its aura.mjs walkthrough had to die under criterion 1), so ticket 8 must re-verify its base64 upload description with the size limit against the live dump rather than skip the file. Availability-claim corrections (owner and crew assignment now on MCP in task-management.md and roles.md) deliberately remain for their owning tickets; those files are CLI/REST-free but not yet current. Guard history: the old scripts-workspace section read the deleted manifest, so its absence assertions supersede. Stale comments naming the deleted scripts tree remain in the shared package's client and one test (ticket 5's domain), and the em-dash convention debt from ticket 1 stands for the end-of-effort coherence sweep.
