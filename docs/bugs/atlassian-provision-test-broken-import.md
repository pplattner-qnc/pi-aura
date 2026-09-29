---
kind: bug
slug: atlassian-provision-test-broken-import
title: atlassian-provision.test.ts fails on develop (imports the removed scripts/src/settings.ts)
status: reported
---

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
