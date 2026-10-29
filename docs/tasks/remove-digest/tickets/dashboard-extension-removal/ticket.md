---
type: ticket
subtype: feature
title: Remove the digest dashboard extension
status: stable
workflow_state: ready
blocked_by: []
size: m
---

## What to build

The interactive digest dashboard is gone end to end: the extension package
(in-process HTTP server, Svelte SPA with its committed front-end bundles,
in-memory store, listener, fixtures, per-extension manifest) is deleted, its
registration is removed from the package manifest, the gitignore exception
lines that kept its front-end bundles tracked go away, and its vitest suite
under the root test tree is deleted with it. A fresh pi session afterwards
shows no dashboard launch command, no digest tools, and no dashboard server;
the remaining test trees still run.

## Acceptance criteria

- [ ] A fresh pi session in the repo loads with no extension load errors and
      offers no digest launch command or digest tools.
- [ ] The extension package, its committed front-end bundles, and its
      registration entry are gone from the tracked tree.
- [ ] The gitignore no longer carries the dashboard's dist exception lines.
- [ ] The dashboard's vitest suite is deleted; the remaining root test
      trees still run green.
- [ ] Typecheck and the bundle build stay green.

## Blocked by

- None (can start immediately).

## Implementation notes

- Landed on `task/dashboard-extension-removal` as merge commit `e3ad58c`
  (`ticket(dashboard-extension-removal): Remove the digest dashboard
  extension`); the working branch `ticket/dashboard-extension-removal`,
  forked from `develop`, was deleted after the merge. Gates at merge time:
  shared runner 206 tests green (including this ticket's 4 absence
  assertions), root vitest 55 tests green over the remaining trees,
  `task typecheck` clean, `task build` green.
- The absence suite lives at
  `packages/shared/test/digest/dashboard-extension-removal.test.ts`.
  `digest-core-and-build-pkg-cleanup` must relocate this file when it
  empties `packages/shared/test/digest/`, not delete it with the digest
  suites, or its tracked-tree seam fails at the letter. The final guard
  ticket consolidates the absence tests either way.
- The `.gitignore` comment above `dist/**` was rewritten because its only
  rationale named the dashboard bundles; the `dist/**` rule itself is
  untouched. Both `!.pi/extensions/digest-dashboard/dist/*` exception
  lines are gone.
- The fresh-session behavioral smoke (no digest launch command, no digest
  tools, clean load) is covered only by structural proxies here; the arch
  spec assigns the interactive registration smoke to
  `no-remnants-guard-and-archive`.
