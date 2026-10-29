---
type: ticket
subtype: feature
title: Slim the secrets command to the Aura PAT only
status: stable
workflow_state: ready
blocked_by: []
size: m
---

## What to build

The secrets command manages only the Aura PAT: the Atlassian token labels,
placeholders, and key mappings are removed from the chooser (the chooser
machinery itself stays, now listing the single Aura PAT item), the combined
email+token edit flow and the guided-walkthrough offer (including its
dynamic import of the provisioning module) are removed, and the usage text
drops its Atlassian mentions. The Atlassian provisioning module, its unit
tests, and the two Atlassian token docs under docs are deleted. A
module-surface test pins the shrunk export surface.

## Acceptance criteria

- [ ] The secrets edit flow offers exactly one item, the Aura PAT, and
      editing it works end to end.
- [ ] No Atlassian labels, token keys, combined flows, or guided-walkthrough
      offers remain in the extension.
- [ ] The provisioning module, its tests, and the two Atlassian token docs
      are gone from the tracked tree.
- [ ] The extension's per-file suite runs green with the Atlassian tests
      removed and a module-surface test pinning the shrunk surface.
- [ ] Typecheck stays green.

## Blocked by

- None (can start immediately).
