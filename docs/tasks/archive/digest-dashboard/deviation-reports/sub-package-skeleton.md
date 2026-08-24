## Deviation report — sub-package-skeleton

### API surface changes
- **Planned (arch spec "Sub-package layout"):** `.pi/extensions/digest-dashboard/` with `package.json` (marker, no deps), `tsconfig.json`, `vite.config.ts`, `esbuild.config.mjs`, `index.ts` stub (registerCommand with start/stop no-ops), `main.ts` stub, `server.ts` stub. Root `package.json` gains the `pi.extensions` entry + devDeps at root. Two build outputs: `dist/app.js` (Vite) + `dist/server.mjs` (esbuild). `.gitignore` selective un-ignore rules.
- **Actual:** All planned files present and correct:
  - `package.json` — `digest-dashboard-ext`, `0.1.0`, `private:true`, `type:module`, `pi.extensions:["./index.ts"]`, `scripts:{build,typecheck}`. **No deps/devDeps fields** (matches decision #8). ✓
  - `tsconfig.json` — `ES2022`, `NodeNext`, `ES2022+DOM`, `strict`, `allowImportingTsExtensions`, `include:["**/*.ts"]`, `exclude:["node_modules","dist"]`, `types:["node"]`. ✓ (Matches spec; adds `declaration`/`declarationMap`/`sourceMap`/`outDir`/`rootDir` — harmless extras consistent with pi-annotate.)
  - `vite.config.ts` — `svelte()` plugin, `build.lib` entry `main.ts` → iife `Digest` → `app.js`, `outDir dist`, `emptyOutDir:false`, `inlineDynamicImports:true`, `minify:false`. ✓
  - `esbuild.config.mjs` — bundles `server.ts` → `dist/server.mjs`, `platform:"node"`, `format:"esm"`, `bundle:true`, `external:["node:*"]`, `minify:false`. ✓
  - `index.ts` — default export `function(pi)`, `pi.registerCommand("digest-dashboard", { handler })` with `ctx.ui.notify("stub","info")`. ✓ (Stub only — no start/stop subcommands yet; the slice doc's acceptance criterion says "stub `index.ts`" with a generic handler, which matches. The arch spec's Slice 1 contract says "registerCommand with start/stop no-ops" — the actual handler is a single generic notify, not two subcommands. **Minor deviation**: the handler doesn't parse `start`/`stop` subcommands. Non-blocking: slice 5+6 implement those; the slice doc's own criterion is looser ("stub `index.ts`").)
  - `main.ts` — one-line comment stub. ✓
  - `server.ts` — two-line stub (`console.error("stub server")`). ✓
- **Impact:** None. The skeleton provides the build pipeline + dir for later slices. The single-handler-vs-start/stop-subcommands deviation is cosmetic — slice 6 (`wire-extension-entry`) implements the real `start`/`stop` dispatch.

### Root package.json
- **Planned:** `pi.extensions` array includes `"./.pi/extensions/digest-dashboard/index.ts"`; devDeps at root (`svelte`, `vite`, `@sveltejs/vite-plugin-svelte`, `typescript`, `@types/node`, `esbuild`).
- **Actual:**
  - `pi.extensions` — entry added: `"./.pi/extensions/digest-dashboard/index.ts"`. ✓
  - devDeps — `@sveltejs/vite-plugin-svelte: "^6.2.4"`, `@types/node: "^26.2.0"`, `svelte: "^5.56.10"`, `typescript: "^7.0.2"`, `vite: "^7.3.6"`. ✓
  - **`esbuild` is NOT in root devDeps** — it's absent from `devDependencies`. However, esbuild IS resolvable at root `node_modules/esbuild` (hoisted from the `scripts` workspace, which declares `esbuild: "^0.24.0"` in its own devDeps). The `esbuild.config.mjs` `import { build } from "esbuild"` resolves correctly and the build works. **Minor deviation from decision #8** (which lists `esbuild` among root devDeps), but functionally correct — the hoist makes it available. A fresh clone without `scripts/` installed would fail, but `scripts/` is always installed (it's a workspace). Non-blocking; note for robustness.
- **Impact:** None for the skeleton. If `esbuild` is ever removed from `scripts/package.json` devDeps, the sub-pkg's `esbuild.config.mjs` would break — but that's unlikely given scripts depends on it for its own build.

### .gitignore selective un-ignore rules
- **Planned:** `dist/**` + `!.pi/extensions/digest-dashboard/dist/app.js` + `!.../dist/app.css` + `!.../dist/server.mjs`.
- **Actual:** Exactly as planned:
  ```
  dist/**
  !.pi/extensions/digest-dashboard/dist/app.js
  !.pi/extensions/digest-dashboard/dist/app.css
  !.pi/extensions/digest-dashboard/dist/server.mjs
  ```
  `git check-ignore -v` confirms all three `!` rules match (the files are trackable). `git add --dry-run` confirms `app.js` and `server.mjs` can be added. ✓
- **Note:** `dist/` files are **not yet tracked/committed** — the worker built them (they exist on disk) but did not `git add` them. This is acceptable for the skeleton slice (the files are stubs; later slices commit real builds), but the land-worker should commit the built `dist/` artifacts or leave them for slice 2+3 to commit. The `.gitignore` rules are correctly in place for when they are added.

### Two build outputs
- **Planned:** `vite build` → `dist/app.js` AND `esbuild` → `dist/server.mjs` both work.
- **Actual:** Both work:
  - `npx vite build` → `dist/app.js` (36 bytes, empty stub — "Generated an empty chunk: main" is expected for a comment-only `main.ts`). ✓
  - `node esbuild.config.mjs` → `dist/server.mjs` (43 bytes). ✓
  - `npm run build` (which runs both via `vite build && node esbuild.config.mjs`) works. ✓
- **Impact:** None. The build pipeline is functional.

### Out-of-scope changes
- **Real Svelte component (`Digest.svelte`):** NOT present (correct — slice 2). ✓
- **Real server logic (`server.ts`):** NOT present (stub only — slice 3). ✓
- **`listener.ts`:** NOT present (correct — slice 4). ✓
- **`state.ts`:** NOT present (correct — slice 3). ✓
- **`digest-types.ts`:** NOT present (correct — slice 2). ✓
- **`scripts/src/*`:** NOT modified by this slice (the diff shows `scripts/src/` changes, but those are carried over from the `task/digest-actions-and-followup` base branch, not added by this slice's three commits `7f5a63e`, `ad18eb3`, `94178ac`). ✓
- **Stray file `test-skeleton.mjs` (67 lines):** This is a **scratch verification script** committed to the sub-pkg dir. It's a useful test (validates package.json shape, tsconfig, builds, root wiring) but it's a `.mjs` test file in the extension dir, not under any test runner config. **Should probably not be committed** — it's a one-off verification artifact, not a permanent test. Recommend the land-worker remove it or move it to a `test/` dir if kept. **Minor finding.**

### Abstraction usage
- Used/was specified: **yes**. The `vite.config.ts` mirrors pi-annotate's (lib/iife, `inlineDynamicImports`, `emptyOutDir:false`, `outDir dist`). The `esbuild.config.mjs` follows the arch spec's `platform:"node"`, `format:"esm"`, `external:["node:*"]`. The `.gitignore` pattern mirrors pi-annotate's selective un-ignore. The sub-pkg `package.json` is a marker (no deps), matching pi-annotate. devDeps at root, matching decision #8.

### Task doc update needed?
**No.** No implementation notes need appending. The skeleton is clean and matches the spec. The two minor deviations (single-handler stub vs start/stop subcommands; `esbuild` not in root devDeps but hoisted) don't change the interface contract for slice 2.

### User attention needed?
**No.** The API surface (dir + build pipeline + root wiring) matches the spec. No scope creep. The stray `test-skeleton.mjs` is a cleanup nit, not a scope issue.
