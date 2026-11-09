---
type: ticket
subtype: feature
title: Move out the engineering surfaces
status: stable
workflow_state: ready
blocked_by: []
size: m
---

## What to build

The two engineering surfaces leave this package for their new home in the other package (the plugin repo), which becomes the sole delivery vehicle for the engineering canon. This package performs the removal; the receiving side is the other package's work.

Removed here: the engineering-foundation skill directory (the router skill with its resources) and the engineering-rules extension with its test. The router's rewrite worklist does not become work in this repo; the audit findings for it travel with the move (they are recorded in the effort's planning tasks).

Everything that names the removed surfaces updates with the removal: the package manifest lists exactly the six surviving extensions; the README's skill and extension tables drop the moved-out entries; the project instructions file drops the bullets describing the engineering-foundation skill layout and the rules extension.

## Acceptance criteria

- [ ] The package manifest lists exactly the six surviving extensions; the skill tree contains no engineering-foundation skill.
- [ ] The README and the project instructions file contain no claim about the removed surfaces.
- [ ] The guard tests fail on re-introducing the removed names.
- [ ] Typecheck and the test list pass after the removal.

## Blocked by

None (can start immediately).
