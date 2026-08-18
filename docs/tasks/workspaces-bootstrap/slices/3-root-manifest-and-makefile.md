---
kind: slice
slug: root-manifest-and-makefile
title: Root package.json becomes workspaces root; Makefile install moves to root
task: ../task.md
mode: hitl
status: todo
size: s
blocked_by:
  - scripts-joins-workspaces
---

## End-to-end behavior

Root `package.json` declares the workspaces, drops `@napi-rs/keyring` from
its own `dependencies` (the extension no longer needs it directly), and
keeps the full pi manifest. `Makefile` `install` runs a single root
`npm install` that populates all workspaces.

## Acceptance criteria

- Root `package.json` has `"workspaces": ["scripts", "packages/shared"]`.
- Root `package.json` `dependencies` no longer lists `@napi-rs/keyring`.
- Root `package.json` preserves `pi.extensions`, `pi.skills`,
  `pi.subagents`, `peerDependencies` unchanged.
- `Makefile` `install` target: `npm install` (at root), not `cd scripts &&
  npm install`.
- `Makefile` `build`/`typecheck` keep working (they `cd scripts` — fine; or
  move to root if a root tsconfig project-references setup is added —
  optional, keep `cd scripts` to minimize change).
- `make install && make build` succeeds end-to-end and produces both `.mjs`
  outputs.
- `git status` shows the restructure; `.gitignore` still ignores
  `node_modules` and `package-lock.json` at both root and `scripts/` and
  `packages/shared/`.

## Test plan

- Seams: a fresh clone flow — `make install` (root npm install) must
  populate `scripts/node_modules`, `packages/shared/node_modules`, and root
  `node_modules`, and symlink `@pi-aura/shared` into both consumers.
- Failure modes: a workspace path typo (`packages/shared` vs
  `packages/shared/`) makes npm silently skip it — verify the symlink exists
  after install.
- Scenarios: `make build` after `make install` on a clean `node_modules`
  (rm -rf all node_modules first) succeeds.
- Edge cases: pi's `pi install` of this package runs `npm install` at root
  per the docs — confirm the workspaces `npm install` is what pi triggers
  (it is — pi runs `npm install` if `package.json` exists).

## Constraints / dependencies

- Blocked by `scripts-joins-workspaces`.
- This slice makes the repo's install topology match the grilling's
  decision (root workspaces root).
