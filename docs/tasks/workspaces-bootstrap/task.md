---
kind: task
type: feature
slug: workspaces-bootstrap
title: Restructure repo into npm workspaces with @pi-aura/shared
map: aura-access-rewrite
status: ready
slices:
- workspaces-skeleton
- scripts-joins-workspaces
- root-manifest-and-makefile
---

## User-visible outcome

The pi-aura repo becomes an npm workspaces monorepo. A new shared package
`@pi-aura/shared` lives at `packages/shared/` and is importable by name from
both the `scripts/` esbuild sub-project and the pi extension. A single
`npm install` at the repo root (run by `pi install` and by `make install`)
populates every workspace's `node_modules` and symlinks `@pi-aura/shared`
into both consumers. `@napi-rs/keyring` is dropped from all manifests.

This task is pure prefactoring: it produces the shared package skeleton and
the wiring so the keyring rewrite (next task) has a home, and so the
AuraClient / settings / extension can all import from one place. No
user-facing behavior changes yet.

## User story

As a maintainer, I want the keyring/AuraClient/settings source to live in one
package that both the skill bundles and the `/aura` extension import by name,
so the rewrite doesn't duplicate code across two build targets.

## Scope boundaries

- Creates `packages/shared/` with a `package.json` (name `@pi-aura/shared`,
  private, no build step — exports `.ts` sources via `exports`) and a
  placeholder `src/index.ts`.
- Root `package.json` gains `"workspaces": ["scripts", "packages/shared"]`,
  keeps the pi manifest (`pi.*`), drops `@napi-rs/keyring` from
  `dependencies`.
- `scripts/package.json` drops `@napi-rs/keyring`, gains
  `"@pi-aura/shared": "workspace:*"`.
- `Makefile` `install` target becomes a root `npm install`.
- Does **not** write the keyring, AuraClient, or settings (those are later
  tasks) — only the skeleton + wiring.
- Does **not** touch `devlinks.ts`, `bitbucket.ts`, or the Atlassian path.

## Acceptance criteria

- `packages/shared/package.json` exists with name `@pi-aura/shared`, private,
  `exports` mapping a `./keyring` subpath (placeholder for now), `type:
  module`.
- `packages/shared/src/index.ts` exists (can be a trivial re-export or
  empty placeholder).
- Root `package.json` has `"workspaces": ["scripts", "packages/shared"]` and
  no `@napi-rs/keyring` in `dependencies`.
- `scripts/package.json` has `"@pi-aura/shared": "workspace:*"` and no
  `@napi-rs/keyring`.
- `npm install` at the repo root succeeds, populates
  `scripts/node_modules` and `packages/shared/node_modules`, and creates a
  symlink `node_modules/@pi-aura/shared` -> `packages/shared`.
- `make build` still produces `skills/aura-digest/dist/aura-digest.mjs` and
  `skills/aura/dist/aura.mjs` (unchanged behavior — nothing imports the
  shared package yet).
- `make install` runs a root `npm install`.
- The existing `aura.mjs` / `aura-digest.mjs` still run end-to-end (the MCP
  path is untouched in this task).

## Existing abstractions to use

- The existing `Makefile` install/build/typecheck targets (adjust the install
  target; build/typecheck keep working).
- The existing `scripts/package.json` (modify in place; don't rewrite).
- The existing root `package.json` pi manifest (preserve all `pi.*` keys).

## Architecture / domain decisions

From the third grilling (sharing topology): npm workspace package, both
targets import by name via `exports`, shared package exports `.ts` (no build
step), root is the workspaces root, `@napi-rs/keyring` dropped.

## Implementation notes

### workspaces-skeleton (landed)

Created `packages/shared/` skeleton: `package.json` (name `@pi-aura/shared`,
`private: true`, `version: 0.0.0`, `type: module`, `exports` mapping `.` and
`./*` to `.ts` sources), placeholder `src/index.ts`, `tsconfig.json` mirroring
`scripts/tsconfig.json`, and `.gitignore`.

**Deviation (minor, justified):** added `devDependencies`
(`typescript: ^5.7.0`, `@types/node: ^22.10.0`) to `packages/shared/package.json`.
Neither the slice doc nor arch spec listed them, but the slice's own test-plan
gate (`cd packages/shared && npx tsc --noEmit`) fails without a local
`typescript` dep — npm's `tsc` package shadows the compiler binary otherwise.
These are build-time deps, so they don't conflict with the grilling's
single-source-runtime-deps rule (Q27). Under workspaces hoisting (slice 3)
these should deduplicate with `scripts/package.json`'s identical devDependencies
— verify no version conflict during slice 3's clean-install test.

Gate: `npx tsc --noEmit` in `packages/shared` passes; `scripts` typecheck and
build still green (both `.mjs` outputs produced). No UI work.
