# Architecture spec — workspaces-bootstrap

> Task: `workspaces-bootstrap` (first implementation task of the
> `aura-access-rewrite` map). Pure prefactoring: produces the shared package
> skeleton + wiring so `keyring-rewrite`, `aura-client`, `aura-secrets-command`
> have one home to import from. **No user-facing behavior changes.**

## Goal

Turn pi-aura into an npm workspaces monorepo. A new shared package
`@pi-aura/shared` at `packages/shared/` is importable by name from both the
`scripts/` esbuild sub-project and the pi extension. A single root
`npm install` populates every workspace's `node_modules` and symlinks
`@pi-aura/shared` into both consumers.

## Repository today (what we start from)

- Root `package.json`: `pi-aura` v0.3.0, `dependencies: { "@napi-rs/keyring" }`,
  plus the full `pi.*` manifest (`pi.extensions`, `pi.skills`, `pi.subagents`)
  and `peerDependencies`. Root has its own `node_modules/` + `package-lock.json`
  (gitignored).
- `scripts/package.json`: `aura-digest-scripts`, a self-contained esbuild
  project. `dependencies`: `@modelcontextprotocol/sdk`,
  `@napi-rs/keyring`. `devDependencies`: `@hey-api/client-fetch`,
  `@hey-api/openapi-ts`, `@types/node`, `esbuild`, `typescript`. Has its own
  `tsconfig.json` (ES2022 / ESNext / bundler / strict), `esbuild.config.mjs`,
  `node_modules/`, `package-lock.json` (all gitignored).
- `Makefile`: `install` does `cd scripts && npm install`; `build`/`typecheck`
  `cd scripts`; `codegen` `cd scripts && npm run codegen`.
- `scripts/src/keyring.ts`: the **existing** pre-rewrite keyring (secret-tool
  based, `createKeyring(service)` surface). This task does **not** touch it —
  `keyring-rewrite` replaces it wholesale into `packages/shared/`.
- `scripts/src/clients.ts`: still imports `@napi-rs/keyring` for the
  Atlassian OAuth path (lines ~70-82). **Out of scope** — the
  `clients-cleanup` task re-evaluates this dep.
- Pre-existing uncommitted changes on `main` (openapi-ts codegen setup:
  `Makefile`, `scripts/.gitignore`, `scripts/package.json`,
  `skills/aura-digest/SKILL.md`, plus untracked `scripts/openapi-ts.config.ts`,
  `scripts/openapi/`, `scripts/src/keyring.ts`). These belong to prior
  wayfinder/grilling commits and are unrelated to this task's work — leave
  them as-is; the task branch builds on top of current `main`.
- No automated test suite. The gate is `npm run typecheck` + `make build`
  + a manual `npm install` symlink check (per `docs/testing.md`).

## Per-slice spec

### Slice 1 — `workspaces-skeleton` (size s, no blockers)

**Exports / public API surface:** none yet. Creates the package shell only.

- New dir `packages/shared/` with:
  - `package.json`: `name: "@pi-aura/shared"`, `version: "0.0.0"`,
    `private: true`, `type: "module"`, and an `exports` field:
    ```json
    "exports": {
      ".": "./src/index.ts",
      "./*": "./src/*.ts"
    }
    ```
    The `"./*"` glob maps subpaths like `@pi-aura/shared/keyring` →
    `./src/keyring.ts` (added by a later task; the mapping is reserved now).
    **Critical:** maps to `.ts`, not `.js` — pi loads `.ts` directly and
    esbuild bundles `.ts`; a `.js` mapping would break both consumers
    (per grilling Q32: shared package exports `.ts` sources, no build step).
  - `src/index.ts`: trivial placeholder (empty or a comment). Real exports
    arrive with `keyring-rewrite` / `aura-client`.
  - `tsconfig.json`: mirrors `scripts/tsconfig.json` shape (ES2022, ESNext,
    `moduleResolution: "bundler"`, strict, the same `lib`). No `include` of
    sources outside `src/`. Standalone (does not reference the root).
  - `.gitignore`: `node_modules/`, `package-lock.json` (consistent with
    root/scripts gitignore policy — workspace lockfiles are hoisted to root,
    but keep the ignore for safety).
- **Existing abstractions to use:** copy `scripts/tsconfig.json` compiler
  options as the template for `packages/shared/tsconfig.json`.
- **Do NOT reimplement:** no keyring code, no settings code, no AuraClient —
  this is the empty skeleton. Do not create a build script.
- **Interface contract (for slice 2):** the package must exist and be
  importable as `@pi-aura/shared` once the root declares it a workspace + a
  consumer adds a `*` range dep. Slice 2 depends on this package existing.

### Slice 2 — `scripts-joins-workspaces` (size s, blocked by slice 1)

**Exports / public API surface:** none (wiring change to `scripts/package.json`
+ esbuild config).

- `scripts/package.json` changes:
  - **Add** `"@pi-aura/shared": "*"` to `dependencies`. ⚠️ **npm, not
    pnpm** — the grilling's Q31 said `workspace:*`, but npm does not support
    the `workspace:` protocol (it's a pnpm/yarn convention; `npm install`
    fails with `EUNSUPPORTEDPROTOCOL`). npm workspaces links local packages
    **by name** using a normal semver range and creates the symlink
    automatically; `"*"` is the npm-compatible equivalent. (Confirmed during
    slice 3 acceptance testing; user-approved correction.)
  - **Keep** `@napi-rs/keyring` in `dependencies` (⚠️ the task doc's "drop
    it" is overridden by this slice doc's nuance: `clients.ts` still imports
    it for the Atlassian OAuth path, which is out of scope until
    `clients-cleanup`. Dropping it here would break the build/typecheck.
    The cleanup task re-evaluates whether the Atlassian path keeps it.)
- `esbuild.config.mjs`:
  - **Keep** `@napi-rs/keyring` in `external` (same reason — it's still
    imported by `clients.ts`; removing it from `external` would make esbuild
    try to bundle the native `.node`, which fails). Leave `external` exactly
    as-is this slice. (The cleanup task removes the import and the external
    entry together.)
  - No change needed for `@pi-aura/shared` — esbuild follows the workspace
    symlink and bundles the `.ts` sources directly (the package has no build
    step; esbuild compiles `.ts`).
- After a root `npm install`: `scripts/node_modules/@pi-aura/shared` is a
  symlink → `../../packages/shared`. (Verified post-install; the symlink is
  created by npm workspaces by name match — the `*` range is ignored for
  workspace packages — not by this slice's code.)
- **Existing abstractions to use:** the existing `esbuild.config.mjs`
  `baseConfig` (don't touch it). The existing `scripts/tsconfig.json` (its
  `moduleResolution: "bundler"` already resolves workspace packages by name).
- **Do NOT reimplement:** no new esbuild plugin, no `alias` config, no manual
  symlink. npm workspaces + bundler resolution handle it.
- **Interface contract (for slice 3):** `scripts/` is now a workspace member
  with `@pi-aura/shared` resolvable. Slice 3 (root manifest) makes the root
  the workspaces root so `npm install` at root wires it all up.
- **Note on the `external` list:** the slice doc's "confirm no other native
  dep needs externalizing" check — grep `scripts/src` confirms only
  `@napi-rs/keyring` is native/external; `@modelcontextprotocol/sdk` and
  `@hey-api/*` are pure JS and bundle fine. So `external` stays as-is.

### Slice 3 — `root-manifest-and-makefile` (size s, blocked by slice 2)

**Exports / public API surface:** none (root manifest + Makefile wiring).

- Root `package.json` changes:
  - **Add** `"workspaces": ["scripts", "packages/shared"]`.
  - **Remove** `@napi-rs/keyring` from root `dependencies` (the extension
    path no longer needs it directly once the keyring rewrite lives in
    `@pi-aura/shared`; this task drops the root dep now — the shared package
    will declare its own deps in `keyring-rewrite`). ⚠️ confirm nothing in
    `extensions/` or root imports `@napi-rs/keyring` first; `extensions/`
    currently only has `aura-skill-instruction.ts` (check it doesn't import
    the keyring — it doesn't, it's a skill-instruction stub). Safe to drop.
  - **Preserve** `pi.extensions`, `pi.skills`, `pi.subagents`,
    `peerDependencies`, `name`, `version`, `description`, `keywords`
    unchanged.
- `Makefile` changes:
  - `install` target: `npm install` (at root), **not** `cd scripts && npm install`.
  - `build`/`typecheck`/`codegen`/`watch`/`clean`: **keep** `cd scripts` —
    they operate on the scripts sub-project; minimize change. (`clean` may
    additionally `rm -rf packages/shared/node_modules` — optional, low risk.)
  - `all: install build` stays.
- `.gitignore`: confirm root `.gitignore` (`node_modules/`,
  `package-lock.json`) covers the new `packages/shared/node_modules` and
  `packages/shared/package-lock.json` (the patterns are unrooted globs, so
  they match at any depth — already covered). No edit needed unless the
  pattern is rooted (`/node_modules`); it isn't.
- After `make install && make build` from a clean state (rm all `node_modules`
  first): root `npm install` populates root + scripts + packages/shared
  `node_modules`, symlinks `@pi-aura/shared` into both consumers, and
  `make build` still produces `skills/aura-digest/dist/aura-digest.mjs` and
  `skills/aura/dist/aura.mjs` (nothing imports shared yet — unchanged bundles).
- **Existing abstractions to use:** the existing `Makefile` targets
  (modify `install` in place; keep the rest). The existing root
  `package.json` (modify in place; preserve `pi.*`).
- **Do NOT reimplement:** no root `tsconfig.json` with project references
  (optional per slice doc; skip to minimize change — keep `cd scripts`
  typecheck). No `lerna`/`turbo`/`nx`. Just npm workspaces.
- **Interface contract:** this is the last slice; the repo install topology
  matches the grilling decision. Downstream tasks (`keyring-rewrite` etc.)
  add real source to `packages/shared/src/` and real deps to its
  `package.json`.

## Cross-slice interface contracts (summary)

```
slice 1: packages/shared/ exists, importable by name (once wired)
slice 2: scripts/ depends on @pi-aura/shared ("*" range; npm-compatible, not workspace:*); external list untouched
slice 3: root is the workspaces root; make install = root npm install
```

No slice changes any runtime behavior of `aura.mjs` / `aura-digest.mjs`.
Nothing imports `@pi-aura/shared` yet — the bundles are byte-for-byte
equivalent (modulo the dropped root dep, which isn't bundled into skills).

## Abstraction usage summary

- `scripts/tsconfig.json` → template for `packages/shared/tsconfig.json`.
- `scripts/esbuild.config.mjs` → unchanged (bundler resolution + workspace
  symlink handle the new dep).
- `Makefile` → modify `install` only.
- Root `package.json` → add `workspaces`, drop `@napi-rs/keyring`.
- `.gitignore` files → already cover the new paths (unrooted globs).

## Out of scope (explicit)

- Writing the keyring, AuraClient, or settings source (later tasks).
- Touching `scripts/src/keyring.ts`, `clients.ts`, `devlinks.ts`,
  `bitbucket.ts`, the Atlassian path.
- Removing `@napi-rs/keyring` from `scripts/package.json` (kept; cleanup task).
- Removing `@napi-rs/keyring` from `esbuild.config.mjs` `external` (kept;
  cleanup task).
- A root `tsconfig.json` with project references (optional, skipped).
- A `packages/shared` build step (none — exports `.ts`).
- Re-generating `openapi.yaml` / `src/generated/`.
- Committing the pre-existing uncommitted openapi-ts changes (leave them;
  the task branch starts from current `main` working tree).

## Risk notes

- **npm workspaces hoisting + native dep:** `@napi-rs/keyring` has a
  platform-specific optional dep (`@napi-rs/keyring-linux-x64-gnu`). Under
  workspaces hoisting it may resolve at the root `node_modules`. The
  `external` list in esbuild already names both, so the bundle is unaffected;
  runtime resolution from `scripts/` follows Node's resolution up to root
  `node_modules`, which is fine. No action this task.
- **`exports` `"./*"` glob + subpath without extension:** a consumer writes
  `import { ... } from "@pi-aura/shared/keyring"` (no `.ts`). The
  `"./*": "./src/*.ts"` mapping means npm resolves `keyring` →
  `./src/keyring.ts`. pi (loading `.ts`) and esbuild (bundling `.ts`) both
  accept this. Verified by the slice 1 test plan's throwaway import.
- **Pre-existing dirty `main`:** the task branch is created from the current
  working tree (uncommitted openapi-ts changes ride along). These are not
  this task's concern; they were left by the wayfinder/grilling passes.
