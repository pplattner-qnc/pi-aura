---
kind: bug
slug: atlassian-provision-test-broken-import
title: atlassian-provision.test.ts fails on develop (imports the removed scripts/src/settings.ts)
map: remove-digest
status: fixed
fix_commit: 8e51afef48ce9fe833629306b09b5793d82fe703
---

## Resolution

Fixed by deletion in the remove-digest effort (ticket
`secrets-aura-pat-only`): the entire guided-walkthrough path this bug lived
in was removed, so the failing import went with it.

- Commit `8e51afe` deleted `extensions/atlassian-provision.ts` and
  `extensions/atlassian-provision.test.ts`; the dynamic import of the
  removed `scripts/src/settings.ts` lived in the walkthrough section of
  `extensions/aura-secrets.ts`, which the same ticket slimmed down to the
  shrunk `/aura secrets {discover|edit}` surface over the single Aura PAT.
- The two Atlassian token docs (`docs/atlassian-api-token.md`,
  `docs/atlassian-api-token-walkthrough.md`) were deleted in the same
  ticket.
- The Atlassian members of the shared keyring secret-key union and the
  digest-era settings went with ticket `manifest-and-infra-cleanup`.

There is no test to re-point: the bug's own suite was part of the deleted
provisioning module, and the per-token probes it exercised are gone with
the Atlassian surface.

## Symptom

`node --experimental-strip-types extensions/atlassian-provision.test.ts`
exits non-zero with `ERR_MODULE_NOT_FOUND`: `extensions/aura-secrets.ts`
line 358 dynamically imports `scripts/src/settings.ts`, which no longer
exists in the repo.

## Root cause

The settings module moved to `@pi-aura/shared` in commit ebf592a9 (move
digest leaves to `@pi-aura/shared`), but `aura-secrets.ts` still resolves
the old `scripts/src/settings.ts` path in a dynamic import. Because the
import is dynamic, neither the typechecks nor the strip-types loader
catch it; only executing the test does.

## Evidence

- Fails identically at the base commit a6bb047e (develop tip), so it is
  pre-existing and not introduced by any current effort.
- Surfaced by the reference-engine-core ticket's verify gates on
  2026-09-29, which had to classify it as known-red and exclude it from
  the gate.

## Fix direction

Point the dynamic import at the shared settings module (or re-export the
needed helpers from it), then re-run the suite. While there, audit the
other dynamic imports in `extensions/` for references to moved
`scripts/src` paths.
