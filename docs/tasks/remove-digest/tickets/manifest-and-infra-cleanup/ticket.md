---
type: ticket
subtype: feature
title: Prune the package manifest and infra to the post-removal shape
status: stable
workflow_state: ready
blocked_by: [dashboard-extension-removal, digest-core-and-build-pkg-cleanup, secrets-aura-pat-only]
size: m
---

## What to build

With every digest cluster deleted, the package shape catches up: the digest
settings namespace leaves the shared settings type (its consumers are gone),
the shared keyring secret-key union loses its three Atlassian members (dead
type surface after the provisioning removal; routed here from the level-0
deviation reports because the coherence pass cannot change API surfaces),
the root vitest configuration and the now-empty root test tree are deleted,
the root devDependency list is pruned to what remains actually used (the
Svelte/Vite/Tailwind/daisyui/fontsource/vitest/happy-dom stack, the two
profiling tools, and anything else verifiably unused), and the build
manifest's digest-era comment goes away. A local install with the pruned
manifest resolves cleanly.

## Acceptance criteria

- [ ] The shared settings type has no digest namespace, the keyring
      secret-key union has no Atlassian members, and the shared suite
      stays green.
- [ ] The root vitest configuration is gone and no root test tree remains.
- [ ] The root manifest's devDependencies contain only deps that remaining
      files or flows verifiably use.
- [ ] The build manifest carries no digest-era comment; targets are
      unchanged and green.
- [ ] A fresh npm install plus typecheck, build, and the remaining suites
      are green.

## Blocked by

- dashboard-extension-removal (its suite needs root vitest until it is
  gone, and the dashboard build needs the frontend stack).
- digest-core-and-build-pkg-cleanup (the last digest source and e2e test
  trees must be gone before the test tree empties and the settings field
  loses its consumers).
- secrets-aura-pat-only (the secrets extension must stop reading the digest
  settings namespace).
