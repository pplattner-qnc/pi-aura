---
kind: slice
slug: scripts-joins-workspaces
title: scripts/ becomes a workspace member depending on @pi-aura/shared
task: ../task.md
mode: hitl
status: done
size: s
blocked_by:
  - workspaces-skeleton
---

## End-to-end behavior

`scripts/package.json` declares a `workspace:*` dependency on
`@pi-aura/shared` and drops `@napi-rs/keyring`. A root `npm install`
populates `scripts/node_modules` with the `@pi-aura/shared` symlink.

## Acceptance criteria

- `scripts/package.json` `dependencies` no longer has `@napi-rs/keyring`.
- `scripts/package.json` `dependencies` has `"@pi-aura/shared": "workspace:*"`.
- `esbuild.config.mjs` removes `@napi-rs/keyring` from `external` (the
  rewrite will use pure-JS deps; nothing native to externalize anymore —
  confirm no other native dep needs externalizing first).
- After `npm install` at root: `scripts/node_modules/@pi-aura/shared` is a
  symlink to `../../packages/shared`.
- A throwaway `import { } from "@pi-aura/shared"` in a scratch script under
  `scripts/` resolves (esbuild bundles it).

## Test plan

- Seams: esbuild must resolve the workspace symlink at build time. Run
  `cd scripts && npm run build` after the change — it should still produce
  both `.mjs` outputs (unchanged behavior, nothing imports shared yet).
- Failure modes: if esbuild doesn't follow the symlink, the build fails with
  a resolve error on `@pi-aura/shared` — fix the `exports`/tsconfig path.
- Scenarios: `npm run typecheck` in scripts/ still passes (no new type errors
  from the dropped/added deps).
- Edge cases: removing `@napi-rs/keyring` from `external` must not break the
  build if some file still imports it — grep `scripts/src` for
  `@napi-rs/keyring` first; the import remains in `clients.ts` (Atlassian
  path) until the cleanup task, so **keep `@napi-rs/keyring` in `external`
  for now if `clients.ts` still imports it** — re-add it to external only if
  the import survives this slice. (The cleanup task removes the import.)

## Constraints / dependencies

- Blocked by `workspaces-skeleton` (need the package to exist to depend on
  it).
- Note: `clients.ts` still imports `@napi-rs/keyring` for the Atlassian
  OAuth path (out of scope) — so `@napi-rs/keyring` must stay installable.
  **Keep it in `scripts/package.json` dependencies** for now (the cleanup
  task re-evaluates). Do NOT drop `@napi-rs/keyring` from `scripts` deps in
  this slice — only add `@pi-aura/shared`. (The grilling said drop it, but
  the Atlassian path still needs it until reviewed in the cleanup task.)
