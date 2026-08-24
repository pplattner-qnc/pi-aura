---
kind: slice
slug: workspaces-skeleton
title: Create packages/shared/ workspace package skeleton
task: ../task.md
mode: hitl
status: todo
size: s
blocked_by: []
---

## End-to-end behavior

A new `packages/shared/` directory exists as a workspace package named
`@pi-aura/shared`, private, exporting `.ts` sources via `package.json`
`exports` (with a `./keyring` subpath reserved), so it can be imported by
name. No real source yet — a placeholder `src/index.ts`.

## Acceptance criteria

- `packages/shared/package.json` with `name: @pi-aura/shared`, `private:
  true`, `version: "0.0.0"`, `type: module`, and an `exports` field mapping
  `"./*": "./src/*.ts"` (and `.` -> `./src/index.ts`).
- `packages/shared/src/index.ts` exists (trivial — e.g. an empty re-export
  or a comment placeholder).
- `packages/shared/tsconfig.json` exists (extends/borrows the scripts
  tsconfig shape: ES2022, ESNext, bundler resolution, strict).

## Test plan

- Seams: the `exports` mapping must resolve `.ts` paths (pi loads `.ts`;
  esbuild bundles `.ts`). Verify with a throwaway import in a scratch
  script: `import "./packages/shared/src/index.ts"` resolves.
- Failure modes: an `exports` field that maps to `.js` (not `.ts`) would
  break pi's direct `.ts` loading — keep it `.ts`.
- Scenarios: `cd packages/shared && npx tsc --noEmit` passes on the
  placeholder.
- Edge cases: the `"./*"` glob in `exports` must allow subpaths like
  `@pi-aura/shared/keyring` -> `./src/keyring.ts`.

## Constraints / dependencies

- None (this is the first slice of the first task).
