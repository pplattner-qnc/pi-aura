---
type: ticket
subtype: feature
title: Remove the shared digest core and the scripts-side digest leftovers
status: stable
workflow_state: done
blocked_by:
- dashboard-extension-removal
size: m
---

## What to build

With the dashboard gone, the digest data core becomes unconsumed: delete the
shared digest module family (fetch core, action builder, dev-links with its
Bitbucket client and Atlassian clients, the in-process MCP client, the
scheduler, the types, the digest settings loader), its unit tests, and the
seven digest subpath exports from the shared package manifest. Delete the
legacy morning-fetch script and the followup unit test in the scripts
workspace. Delete the three dev-links e2e trees under the root test tree
(the Bitbucket reader and Atlassian client suites; all of them import the
digest clients). Drop the MCP SDK dependency from the scripts workspace
manifest (its only consumer was the deleted in-process client) and rename
that manifest away from its digest-era name, fixing its description.

## Acceptance criteria

- [ ] The shared package exports no digest subpaths and contains no digest
      source or test modules.
- [ ] The shared unit suite runs green without the digest suites.
- [ ] The scripts workspace carries no morning-fetch script, no followup
      test, no MCP SDK dependency, and no digest-era package name or
      description.
- [ ] The root test tree no longer contains the three dev-links e2e
      families; the remaining tree still runs green.
- [ ] Typecheck and the bundle build stay green.

## Blocked by

- dashboard-extension-removal (the dashboard was the digest core's last
  non-test consumer).

## Implementation notes

- Landed on `task/digest-core-and-build-pkg-cleanup` as merge commit
  `0f8c05b` (`ticket(digest-core-and-build-pkg-cleanup): Remove the shared
  digest core and the scripts-side digest leftovers`); the working branch
  `ticket/digest-core-and-build-pkg-cleanup` (tip `9643ba1`, forked from
  `task/secrets-aura-pat-only` at `d165513`) was deleted by the land step
  after the merge, its tip staying reachable as `0f8c05b^2`. Gates at
  merge time (verifier on the branch tip, whose tree is identical to the
  merged result): shared runner 171 pass / 0 fail across 42 suites,
  `packages/shared` and `scripts` typecheck clean, the scripts bundle
  build green with the rebuilt `skills/core/aura/dist/aura.mjs`
  byte-identical to the committed one, root vitest exit 0 over the emptied
  tree, scripts strip-types 79 pass / 0 fail; lint not-applicable because
  no linter is configured anywhere in the repo. Diff vs fork point: 26
  files, +227/-5634.
- The manifest carried nine `./digest/*` exports, not the seven the
  ticket and spec prose counted; all nine are gone and the count-agnostic
  criterion (no digest subpaths) governs. The exports map now holds `.`,
  `./keyring`, `./aura-client`, and the `./*` catch-all; the catch-all
  still maps any future `src/*.ts` path, so the no-remnants guard ticket
  owns the consolidated absence contract.
- The two earlier per-ticket absence suites were relocated (preserved,
  never deleted) from `packages/shared/test/digest/` to
  `packages/shared/test/guards/`, joined by a new third suite for this
  ticket (fs reads, no imports, 14 assertions); the guard ticket
  consolidates all three. `drop-dead-shared-exports.test.ts` was deleted
  with the digest unit suites because its subject, the `aura-digest.ts`
  exports, vanished.
- `vitest.config.ts` gained `passWithNoTests: true`: deleting the three
  dev-links e2e families empties the root test tree, and the bare runner
  exits 1 with no test files; the interim flag keeps criterion 4's
  remaining-tree-goes-green literally true until manifest-and-infra-cleanup
  removes the runner and the flag together.
- The scripts package name target was chosen freely per the charter:
  `aura-digest-scripts` became `aura-skill-scripts` with a digest-free
  description, and the MCP SDK dependency was dropped (its only consumer
  was the deleted in-process digest MCP client; the embed stack stays, it
  serves rest search).
- One comment-only touch in `packages/shared/src/aura-client.ts` dropped
  the stale `aura-digest.ts` co-reference from the header; the only
  digest reference left in shared source is the settings field, which
  manifest-and-infra-cleanup owns removing.
- Commit `9643ba1` and the land-step merge and docs commits are unsigned:
  GPG pinentry times out in the headless agent environment even though
  repo practice is signed commits (re-signing was reattempted at land time
  and failed on the same pinentry timeout). A later pass with an
  interactive agent may re-sign.
- The deviation report sits at
  `docs/tasks/remove-digest/tickets/digest-core-and-build-pkg-cleanup/deviation-reports/digest-core-and-build-pkg-cleanup.md`.
  The tdd pass left it untracked, so the land step committed it together
  with these notes.
