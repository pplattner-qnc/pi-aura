---
type: ticket
subtype: feature
title: Remove the digest skill and the morning agents
status: stable
workflow_state: ready
blocked_by: []
size: s
---

## What to build

The digest skill directory (its doc and the committed CLI bundle leftover)
is deleted, and both morning subagents plus the subagents registration in
the package manifest are removed. The skill list afterwards shows only the
two remaining core skills, and the package ships no subagents.

## Acceptance criteria

- [ ] The skill list shows only the aura and engineering-foundation skills;
      the digest skill directory is gone including its committed bundle.
- [ ] Both morning agents are gone and the package manifest registers no
      subagents.
- [ ] Typecheck and the bundle build stay green; a fresh session loads
      clean.

## Blocked by

- None (can start immediately).
