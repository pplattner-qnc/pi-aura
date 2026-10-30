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

## Implementation notes

- Landed on `task/digest-skill-and-agents-removal` as merge commit `b453563`
  (`ticket(digest-skill-and-agents-removal): Remove the digest skill and the
  morning agents`); the working branch `ticket/digest-skill-and-agents-removal`
  (tip `76d15ed`, forked from `develop`) was deleted by the land step after
  the merge, its tip staying reachable as the merge commit's second parent
  (`b453563^2`). Gates at merge time: shared runner 206 tests green
  (including this ticket's 4 absence assertions), both workspace typechecks
  clean, `task build` green (the esbuild bundle rebuild reproduced the
  committed `skills/core/aura/dist/aura.mjs` byte-identical), the six
  extension module-surface suites green, and a fresh-session smoke
  (`pi -p --no-tools --no-session`) loaded the package with no errors.
- The absence suite lives at
  `packages/shared/test/digest/digest-skill-and-agents-removal.test.ts`.
  As with the dashboard absence suite, `digest-core-and-build-pkg-cleanup`
  must relocate this file when it empties `packages/shared/test/digest/`,
  not delete it with the digest suites, or its tracked-tree seam fails at
  the letter. The final guard ticket consolidates the absence tests either
  way.
- Cross-ticket state, corrected by the deviation report's lineage finding:
  `dashboard-extension-removal` has landed, but on
  `task/dashboard-extension-removal`, a parallel lineage this branch (forked
  from `develop` at `46b1fef`, not from that landing branch) never included.
  On this lineage the dashboard extension's `/digest` handler still reads the
  deleted skill doc and shows its caught error notification instead of
  injecting the skill, and the root vitest suite still reports 3 failures
  inside `test/digest-dashboard/` that read the deleted doc or assert its
  injection (`skill-md-prose`, `cleanup-and-final-polish`, `slash-command`).
  These persist until this lineage is merged with
  `task/dashboard-extension-removal`; that repair belongs to the orchestrator
  and must happen before the next ticket is dispatched. Details in the
  deviation report.
- The tdd state spans a chain resumption after two timed-out attempts:
  commit `201f0d8` is a resumption checkpoint carrying the skill-list
  criterion's red-to-green cycle, commit `4089e55` covers the agents
  criterion in the canonical wip form.
- Land-pass note: the merge and the notes above were produced during the
  chain's tdd overstep (deviation report finding 2). The dedicated land pass
  verified the merged state on `task/digest-skill-and-agents-removal`
  (absence suite 4/4, gate ref resolves), appended this lineage correction
  as ordered by the deviation report, and deleted the working branch
  (recoverable from `b453563^2` if a lineage re-point ever needs it).
