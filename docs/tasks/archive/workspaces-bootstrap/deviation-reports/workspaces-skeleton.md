## Deviation report — workspaces-skeleton

### API surface changes
- **Planned:** `packages/shared/package.json` with `name: @pi-aura/shared`,
  `version: "0.0.0"`, `private: true`, `type: "module"`, and an `exports`
  field mapping `"."` → `./src/index.ts` and `"./*"` → `./src/*.ts`.
- **Actual:** Matches exactly. The `exports` field, name, version, private
  flag, and type all match the spec. The `.ts` (not `.js`) mapping — the
  critical constraint — is correct.
- **Impact:** None on dependent slices. The package skeleton is
  importable-by-name ready for slice 2 to add `workspace:*`.

### Abstraction usage
- Used/was specified: yes. `packages/shared/tsconfig.json` mirrors the
  `scripts/tsconfig.json` compiler options (ES2022, ESNext, bundler
  resolution, strict, lib ES2022, same `noUnusedLocals`/`noUnusedParameters`/
  `noImplicitReturns`/`esModuleInterop`/`skipLibCheck`/`resolveJsonModule`/
  `isolatedModules`/`types`). The arch spec said "copy `scripts/tsconfig.json`
  compiler options as the template" — this was followed faithfully.

### Out-of-scope changes
- **Added `devDependencies` (`typescript: ^5.7.0`, `@types/node: ^22.10.0`)
  to `packages/shared/package.json`.** Neither the slice doc nor the arch
  spec listed them. The slice doc's test plan requires
  `cd packages/shared && npx tsc --noEmit` to pass, and without a local
  `typescript` dependency `npx tsc` resolved to the deprecated
  `tsc@2.0.4` npm package (a well-known npm name-shadowing pitfall), making
  the gate fail. The worker added these deps to make the stated gate
  achievable as a standalone package before workspace wiring is in place
  (slice 3 makes root the workspaces root, which would hoist typescript;
  but this slice runs before that). This is a reasonable, minimal deviation
  driven by the spec's own test-plan requirement.
  - ⚠️ **Potential concern for slice 3 / keyring-rewrite:** the grilling
    decision (Q27) says shared runtime deps are declared once in the shared
    package's own `package.json`. `typescript` and `@types/node` are
    devDependencies (build-time, not runtime), so they don't conflict with
    the "single-source runtime deps" rule. However, under npm workspaces
    hoisting (after slice 3), the root `npm install` may deduplicate these
    against `scripts/package.json`'s existing identical `devDependencies`.
    No breakage expected, but slice 3 should verify the hoisted resolution
    doesn't produce version conflicts.
- **Ran `cd packages/shared && npm install`** to install the
  devDependencies locally. This created a `packages/shared/node_modules/`
  directory (gitignored, so not committed). This is a side effect of the
  devDependencies addition, not a scope change per se, but it means the
  repo now has a third `node_modules` directory before workspaces wiring
  exists. Harmless (gitignored) but worth noting for slice 3's
  "rm -rf all node_modules first" clean-install test.

### Task doc update needed?
- **Yes — append to `## Implementation notes`:** The
  `packages/shared/package.json` includes `devDependencies` (typescript,
  @types/node) not anticipated by the arch spec. These are needed for the
  slice's `npx tsc --noEmit` gate to resolve the correct compiler (npm's
  `tsc` package shadows the binary otherwise). Under workspaces hoisting
  (slice 3), these should deduplicate with scripts' existing identical
  devDependencies — verify no version conflict after the root install.

### User attention needed?
- **No.** The deviation (adding devDependencies) is minimal, justified by
  the spec's own test-plan gate, does not change the API surface, and does
  not affect dependent slices. No scope change or API surface difference
  that requires a user decision.
