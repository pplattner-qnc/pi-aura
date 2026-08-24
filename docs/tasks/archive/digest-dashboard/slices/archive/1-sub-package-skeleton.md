---
kind: slice
slug: sub-package-skeleton
title: Create the .pi/extensions/digest-dashboard sub-package skeleton
task: ../task.md
mode: afk
size: m
blocked_by: []
status: done
---

## End-to-end behavior

A new `.pi/extensions/digest-dashboard/` sub-package exists, loads cleanly in pi (via the root `package.json` `pi.extensions` entry), and `vite build` produces a (stub) `dist/`. No behavior yet — this is prefactoring so later slices have a home.

## Acceptance criteria

- `.pi/extensions/digest-dashboard/package.json` — `{ name, version, private:true, type:"module", pi:{ extensions:["./index.ts"] } }` (mirror pi-annotate's sub-pkg).
- `.pi/extensions/digest-dashboard/tsconfig.json` — `target ES2022`, `module NodeNext`, `lib ES2022+DOM`, `strict`, `allowImportingTsExtensions`, `include ["**/*.ts"]`, `exclude ["node_modules","dist"]`.
- `.pi/extensions/digest-dashboard/vite.config.ts` — `svelte()` plugin, `build.lib` entry `main.ts` → iife `Digest` → `dist/app.js`, `outDir dist`, `emptyOutDir:false`, `inlineDynamicImports:true` (mirror pi-annotate).
- `.pi/extensions/digest-dashboard/index.ts` — default export `function(pi){ pi.registerCommand("digest-dashboard", { description, handler: async (args,ctx)=>{ ctx.ui.notify("stub","info"); } }) }`.
- Root `package.json` `pi.extensions` array includes `"./.pi/extensions/digest-dashboard/index.ts"`.
- `.gitignore` gains `dist/**` + `!.pi/extensions/digest-dashboard/dist/app.js` + `!.pi/extensions/digest-dashboard/dist/app.css` (selective un-ignore, mirror pi-annotate).
- `svelte`, `vite`, `@sveltejs/vite-plugin-svelte` added as `devDependencies` (root or sub-pkg — arch spec settles; pi-annotate puts them at root).
- `vite build` succeeds (empty/stub `main.ts`); `pi` loads the extension without error.

## Test plan

- **Seams:** `pi` extension load — verify `pi` discovers the extension from the root `pi.extensions` entry (jiti load, no throw).
- **Scenarios:** (a) `/digest-dashboard` command shows the stub notify; (b) `vite build` exits 0 with a `dist/app.js`.
- **Failure modes:** a bad `vite.config.ts` (wrong entry path) → build fails fast; a missing `pi.extensions` entry → command not found.
- **Edge cases:** ensure the sub-pkg's `tsconfig` doesn't conflict with the root or `scripts/` tsconfigs (separate `include`).

## Constraints and dependencies

- None blocking. Sets the build discipline for slices 2–6.
- Do not add the Svelte component or server yet — stubs only.
