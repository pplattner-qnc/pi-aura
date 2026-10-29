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
