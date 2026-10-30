---
type: ticket
subtype: feature
title: Refresh the root docs to the post-removal package
status: stable
workflow_state: done
blocked_by:
- digest-skill-and-agents-removal
- manifest-and-infra-cleanup
size: m
---

## What to build

The five root docs describe the package as it now is: the README loses the
digest skill row, the agents table, the morning-routine usage section, and
the digest design-principle lines; the glossary loses the digest terms and
rewords the client-consumer relationships; the agent conventions doc loses
the digest skill line; the testing doc loses its digest and Atlassian
sections and re-points its keyring example to a remaining test; the dev-env
doc drops its digest reproduction mention. The now-stale bug report for the
Atlassian provisioning import (the bug this effort fixed by deletion) is
archived to the bugs archive with a resolution note, so the
no-Atlassian-mentions seam holds across docs. No doc mentions the digest
anywhere outside the task tree's history.

## Acceptance criteria

- [ ] The five root docs (README, glossary, agent conventions, testing,
      dev-env) contain no digest or Atlassian-provisioning mentions.
- [ ] The testing doc's runner and mock-convention descriptions match the
      post-removal reality (no root vitest, remaining suites only).
- [ ] The README's skill and agent tables match what the package actually
      ships.
- [ ] The stale Atlassian provisioning bug report is archived with a
      resolution note; no active bug report mentions it.
- [ ] No em-dashes appear in any touched prose.

## Blocked by

- digest-skill-and-agents-removal (the docs describe the final skill and
  agent surface).
- manifest-and-infra-cleanup (the docs describe the final runner and
  dependency reality).

## Implementation notes

- Landed on `task/root-docs-refresh` as merge commit `7c40a22`
  (`ticket(root-docs-refresh): Refresh the root docs to the post-removal
  package`); the working branch `ticket/root-docs-refresh` (tip `1bd5841`,
  5 commits forked from the stack tip `ce774b6`) was deleted by the land
  step after the clean no-ff merge, its tip staying reachable as
  `7c40a22^2`. The merged tree is identical to the verifier's branch tip.
  Gates at merge time (verifier on the branch tip): shared runner 169/169
  across 40 suites (the guard now 40 tests), all 7 extension
  strip-types suites green, shared and scripts `tsc --noEmit` green,
  `task build` green and byte-stable, em-dash scan over added/modified
  diff lines 0 hits.
- Divergence from the doc's "doc edits and one archive operation only"
  contract, all disclosed by the tdd pass and audited green by the
  verifier: the ticket's tests live as 7 new tests in 4 describe blocks
  appended to the no-remnants guard (per that guard's consolidation
  contract, ending its byte-freeze at the `ce774b6` tip); the README
  skill table gained the shipped `engineering-foundation` row (required by
  acceptance criterion 3); the testing doc's runner, suite-list,
  runner-discipline, and esbuild-externals descriptions were re-pointed
  at post-removal reality; and one stale `digest-dashboard` clause was
  scrubbed from the `packages/shared/openapi-ts.config.ts` comment
  (comment-only, no behavior change).
- The archived bug report moved as a git rename to
  `docs/bugs/archive/atlassian-provision-test-broken-import.md` with
  `status: fixed` and a `## Resolution` note; `docs/bugs/` holds no
  active reports mentioning Atlassian provisioning (asserted by the
  guard's bug-archive tests).
- Residuals carried for the audit-update-aura-instructions effort (per
  the map's settled inventory, outside this ticket's enumerated edits):
  the README Commands section still claims no user-facing commands are
  registered and its intro still says "skills, agents, and workflows";
  AGENTS.md still says agents live under `agents/`; CONTEXT.md's PAT and
  Keyring entries still describe the pre-keyring-rewrite reality. Also
  cosmetic: `docs/testing.md` line 30's inline comment reads
  `test/*.test.ts` while the script globs `test/**/*.test.ts` (pre-existing
  line, untouched); `scripts/esbuild.config.mjs` still lists dead
  `@napi-rs/keyring` externals (aura-skill build config is off-limits
  effort-wide).
- The deviation report sits at
  `docs/tasks/remove-digest/tickets/root-docs-refresh/deviation-reports/root-docs-refresh.md`.
  The tdd pass left it untracked, so the land step committed it together
  with these notes. The ticket doc itself carried no `## Implementation
  notes` section when landed; the land step added it.
