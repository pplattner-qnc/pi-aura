---
type: ticket
subtype: feature
title: Slim the secrets command to the Aura PAT only
status: stable
workflow_state: done
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

## Implementation notes

- Landed on `task/secrets-aura-pat-only` as merge commit `2567bf6`
  (`ticket(secrets-aura-pat-only): Slim the secrets command to the Aura PAT
  only`); the working branch `ticket/secrets-aura-pat-only` (tip `be247d6`,
  forked from `task/digest-skill-and-agents-removal` at `e327de2`) was
  deleted by the land step after the merge, its tip staying reachable as
  `2567bf6^2`. Gates at merge time (verifier on the branch tip): all seven
  per-file extension suites green, `packages/shared` `npm test` 210 pass /
  0 fail, root vitest 4 files / 55 tests green, `scripts` and
  `packages/shared` `tsc --noEmit` clean, the esbuild bundle green; lint
  not-run because no linter is configured anywhere in the repo. Diff vs
  fork point: 6 files, +99/-1953.
- AC3 (tracked-tree shape) is verified by `git ls-files` commands, not by a
  test: the arch spec's seam list for this ticket deliberately omits the
  tracked-tree seam (structural absence assertions are routed to the final
  guard ticket), so no test was added at an unlisted seam.
- Interface contract kept for `manifest-and-infra-cleanup`: no extension
  source reads the digest settings namespace after this ticket (the only
  read lived in the deleted guided-walkthrough block), so that ticket can
  remove the field as planned.
- `docs/bugs/atlassian-provision-test-broken-import.md` is now stale: this
  ticket fixed that bug by deletion. `root-docs-refresh`'s
  no-Atlassian-provisioning-mentions seam will trip on it unless the
  report is archived first, by the orchestrator or that ticket's scope.
- The shared keyring `SecretKey` union and the backend key lists still
  carry the three Atlassian members (`email`, `api_token`,
  `bitbucket_token`); no remove-digest ticket owns shrinking them. Flagged
  for the end-of-effort coherence pass.
- `docs/testing.md` still documents the deleted guided-provisioning suite
  (`root-docs-refresh` owns doc-content refresh); the three e2e vitest
  families under `test/` stay green until
  `digest-core-and-build-pkg-cleanup` deletes them.
- The deviation report sits at
  `docs/tasks/remove-digest/tickets/secrets-aura-pat-only/deviation-reports/secrets-aura-pat-only.md`.
  The tdd pass left it untracked, so the land step committed it together
  with these notes.
