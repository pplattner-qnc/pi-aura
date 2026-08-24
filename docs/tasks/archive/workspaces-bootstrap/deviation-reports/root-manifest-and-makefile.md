## Deviation report — root-manifest-and-makefile

### API surface changes
- **Planned:** Root `package.json` adds `"workspaces": ["scripts", "packages/shared"]`,
  drops `@napi-rs/keyring` from `dependencies`, preserves `pi.*` + `peerDependencies`
  + `name`/`version`/`description`/`keywords`. `Makefile` `install` → root `npm install`;
  `build`/`typecheck`/`codegen`/`watch`/`clean` keep `cd scripts`.
- **Actual:** Matches exactly. Root `package.json` has `workspaces`, `dependencies: {}`
  (empty object kept, matching prior style — `@napi-rs/keyring` removed), all `pi.*` keys
  and `peerDependencies` intact. `Makefile` `install` is `npm install` at root; other
  targets unchanged. esbuild `external` list untouched.
- **Impact:** None. The repo is now an npm workspaces monorepo; `make install` (root
  `npm install`) populates all three `node_modules` and symlinks `@pi-aura/shared`.

### Cross-slice fix (deviation from slice-2 literal, per arch-spec amendment)
- `scripts/package.json` `@pi-aura/shared` changed from `workspace:*` → `*`. This is a
  **cross-slice fix**: the grilling's Q31 assumed `workspace:*` works, but npm does not
  support the `workspace:` protocol (pnpm/yarn convention) — `npm install` fails with
  `EUNSUPPORTEDPROTOCOL`. npm workspaces links local packages **by name** using a normal
  semver range; `"*"` is the npm-compatible equivalent and produces the same symlink.
  User-approved during slice-3 acceptance testing; arch spec amended in commit
  `58340c6`. Downstream tasks must use `"*"` (not `workspace:*`) for `@pi-aura/shared`.

### Abstraction usage
- Used/was specified: yes. Existing `Makefile` modified in place (`install` only).
  Existing root `package.json` modified in place (`pi.*` preserved). No new tsconfig
  project references, no lerna/turbo/nx — just npm workspaces, per "minimize change."

### Out-of-scope changes
- None beyond the cross-slice `workspace:*` → `*` fix (above). No source files, no
  esbuild config, no tsconfig modified. `clients.ts`/`keyring.ts` untouched.

### Divergence from the slice doc's acceptance criteria
- **Per-consumer symlink criterion (partially met, expected npm behavior):** the slice
  doc says "symlink `node_modules/@pi-aura/shared` into both consumers" and the task doc
  says "`scripts/node_modules/@pi-aura/shared` is a symlink to `../../packages/shared`".
  Actual: npm **hoists** `@pi-aura/shared` to the **root** `node_modules/@pi-aura/shared`
  → `../../packages/shared`; there is no per-consumer symlink under
  `scripts/node_modules/@pi-aura/shared`. This is standard npm workspaces hoisting
  behavior — Node's module resolution finds it from the root, so `import ... from
  "@pi-aura/shared"` resolves correctly from `scripts/`. The criterion's intent
  (workspace package resolvable by name) is met; the literal per-consumer-symlink
  wording reflects a pnpm-style layout, not npm's. Not a defect.
- **All other criteria met:** `workspaces` field present, `@napi-rs/keyring` dropped
  from root deps (after confirming no root/extension import), `pi.*`/`peerDependencies`
  preserved, `Makefile` `install` = root `npm install`, `make install && make build`
  succeeds, both `.mjs` outputs produced, `scripts` typecheck passes, `.gitignore`
  covers `packages/shared/` (unrooted globs).

### Slice-1 residual risk (verified)
- `packages/shared/package.json` devDependencies (`typescript ^5.7.0`, `@types/node
  ^22.10.0`) deduplicate cleanly with `scripts/package.json`'s identical devDependencies
  under workspaces hoisting — `npm install` emitted **no version-conflict warnings**
  (only pre-existing deprecation/audit/allow-scripts notices unrelated to this slice).
  Risk closed.

### Task doc update needed?
- Yes — append to `## Implementation notes`: slice `root-manifest-and-makefile` made
  root the workspaces root, dropped `@napi-rs/keyring` from root deps, moved `Makefile`
  `install` to root `npm install`. Cross-slice fix: `scripts/package.json`
  `@pi-aura/shared` changed `workspace:*` → `*` (npm doesn't support `workspace:`;
  arch spec amended). npm hoists the symlink to root `node_modules/`, not per-consumer.

### User attention needed?
- No. The implementation matches the (amended) arch spec. The two "deviations" are
  (a) the user-approved `workspace:*` → `*` cross-slice fix and (b) npm's hoisting
  layout differing from the slice doc's pnpm-style per-consumer-symlink wording —
  both are expected, not defects.
