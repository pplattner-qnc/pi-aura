# Architecture spec — `core-move`

> Prefactoring: move the aura-digest core out of `scripts/src/` into the
> `@pi-aura/shared` package so the `digest-dashboard` extension can import
> it without a TS6059 `rootDir` violation. **No behavior change.** The CLI
> keeps working via a thin shim that imports the moved core (deleted in
> task 5).

## Decision (de-risked by probe)

**Home: `@pi-aura/shared`, under `packages/shared/src/digest/`.**

A probe confirmed the critical premise: the extension's `tsc --noEmit`
(`moduleResolution: NodeNext`, `rootDir: "."`) imports
`@pi-aura/shared/digest/<x>` with **zero TS6059 errors** when the subpath is
declared in the shared `package.json` `exports` map. So the existing workspace
package is the shared home — no new `@pi-aura/digest-core` package is needed.

### Export mapping

The shared `package.json` `exports` currently uses a `./*` → `./src/*.ts` catch-all.
For the digest modules we declare **explicit subpaths** (mirrors the existing
`./keyring`, `./aura-client` explicit entries), so each module has a clean
public path and we don't rely on the catch-all's `.ts`-suffix quirk:

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./keyring": "./src/keyring/index.ts",
  "./aura-client": "./src/aura-client.ts",
  "./digest/scheduler": "./src/digest/scheduler.ts",
  "./digest/progress-emitter": "./src/digest/progress-emitter.ts",
  "./digest/build-actions": "./src/digest/build-actions.ts",
  "./digest/write-dashboard-digest": "./src/digest/write-dashboard-digest.ts",
  "./digest/types": "./src/digest/types.ts",
  "./digest/settings": "./src/digest/settings.ts",
  "./digest/aura-digest": "./src/digest/aura-digest.ts",
  "./digest/devlinks": "./src/digest/devlinks.ts",
  "./digest/clients": "./src/digest/clients.ts",
  "./digest/mcp-client": "./src/digest/mcp-client.ts",
  "./digest/bitbucket": "./src/digest/bitbucket.ts",
  "./*": "./src/*.ts"
}
```

Import specifiers in code use the **no-extension** form (`@pi-aura/shared/digest/scheduler`),
matching how `@pi-aura/shared/keyring` is already imported everywhere. The
`exports` values point at `.ts` source (TypeScript `moduleResolution: bundler`
in `packages/shared` and `NodeNext` in the extension both resolve the source).

## Source layout

```
packages/shared/src/digest/
  types.ts
  settings.ts
  scheduler.ts
  progress-emitter.ts
  build-actions.ts
  write-dashboard-digest.ts
  aura-digest.ts          # slice 2
  devlinks.ts             # slice 2
  clients.ts             # slice 2
  mcp-client.ts          # slice 2
  bitbucket.ts           # slice 2
packages/shared/test/digest/
  scheduler.test.ts          # moved from scripts/src/ (slice 1)
  aura-digest-progress.test.ts   # moved from scripts/src/ (slice 1)
  build-actions.test.ts     # moved from scripts/src/ (slice 1)
  write-dashboard-digest.test.ts # moved from scripts/src/ (slice 1)
scripts/src/aura-digest.ts   # slice 2: thin CLI shim importing the shared core
```

`scripts/src/keyring.ts` stays (it is the digest bundle's local keyring
re-export; the moved core imports `@pi-aura/shared/keyring` directly per the
slice doc). It is dropped only if confirmed to be a pure re-export used
solely by the digest core — otherwise it stays untouched.

## Slice 1 — `leaf-core-to-shared` (size m)

### Exports (public API surface added to `@pi-aura/shared`)

- `@pi-aura/shared/digest/scheduler` → `scheduler.ts` (unchanged exports:
  `runTasks`, `keyOf`, and the `Kind`/`KindMap`/`TaskRef`/`NodeHandle`/
  `ProgressEvent`/`Progress`/`ProgressStatus`/`SchedulerOptions`/`RunResult`/`Ctx`/`Hashable`/`ReducerResult` types)
- `@pi-aura/shared/digest/progress-emitter` → `progress-emitter.ts`
  (`readDashboardUrl`, `createProgressEmitter`, `defaultServerUrlPath`, and the
  `ProgressEventLike`/`ProgressStateEvent`/`ProgressEmitter`/`ProgressEmitterOptions` types)
- `@pi-aura/shared/digest/build-actions` → `build-actions.ts` (`buildActions`)
- `@pi-aura/shared/digest/write-dashboard-digest` → `write-dashboard-digest.ts`
  (`writeDashboardDigest`)
- `@pi-aura/shared/digest/types` → `types.ts` (all `Digest*`/`RawAuraData`/... interfaces)
- `@pi-aura/shared/digest/settings` → `settings.ts` (`loadSettings`, `AuraSettings`,
  `AuraDigestSettings`, `McpServerNames`)

### Existing abstractions to use

- `@pi-aura/shared/aura-client` and `@pi-aura/shared/settings` — `types.ts`
  already imports from these; keep those imports (the import specifiers are
  package-relative and remain valid from the new location).
- `@pi-aura/shared/keyring` — leaf modules don't import it directly yet; no change.
- `scripts/esbuild.config.mjs` — unchanged structure; the `aura-digest` entry
  still points at `src/aura-digest.ts` (which, after slice 1, re-imports the
  moved leaves via the shared path). esbuild follows the workspace symlink +
  bundles the shared source into `aura-digest.mjs` (it already does this for
  `@pi-aura/shared/aura-client`).

### Do NOT reimplement

- Do not rewrite `scheduler`'s reducer/kind machinery — move the file verbatim.
- Do not change `progress-emitter`'s batching/coalescing logic — move verbatim.
- Do not touch `types.ts` interfaces — move verbatim.
- Do not change the `exports` catch-all (`./*`); only add explicit `./digest/*` entries.

### Seams (the boundaries under test)

1. **Shared package export seam:** `@pi-aura/shared/digest/<leaf>` resolves and
   the shared `typecheck` passes (`packages/shared/tsconfig.json` includes
   `src/**/*.ts` + `test/**/*.ts`).
2. **CLI bundle seam:** `scripts/src/aura-digest.ts` imports the moved leaves
   via `@pi-aura/shared/digest/*`; `scripts` `typecheck` + esbuild `build` pass;
   `dist/aura-digest.mjs fetch` produces byte-identical output.
3. **Cross-import seam (the gate for tasks 2–4):** a scratch
   `import { runTasks } from "@pi-aura/shared/digest/scheduler"` in a temporary
   extension file typechecks under the extension's `tsc --noEmit`. (Verified
   ad-hoc, then the scratch file is deleted — it is not committed.)
4. **Moved-leaf test seam:** the moved tests pass under `packages/shared`
   `tsx --test test/digest/*.test.ts`.

### Interface contract for slice 2

After slice 1, the leaf modules live in shared and import each other via the
shared path. Slice 2 moves `aura-digest.ts` (and `devlinks`/`clients`/
`mcp-client`/`bitbucket`), which import these leaves. The contract slice 1
leaves for slice 2:

- `@pi-aura/shared/digest/scheduler` exports `runTasks` + the scheduler types.
- `@pi-aura/shared/digest/progress-emitter` exports `readDashboardUrl` +
  `createProgressEmitter`.
- `@pi-aura/shared/digest/build-actions` exports `buildActions`.
- `@pi-aura/shared/digest/write-dashboard-digest` exports `writeDashboardDigest`.
- `@pi-aura/shared/digest/types` exports the `Digest*` / `RawAuraData` / ... types.
- `@pi-aura/shared/digest/settings` exports `loadSettings` + `AuraSettings`.

Internal leaf-to-leaf imports (e.g. `build-actions.ts` imports `./types.js`)
become `@pi-aura/shared/digest/types` after the move. (Keep the `.js`
extension in any *relative* import that remains within the shared package,
e.g. between two files both under `packages/shared/src/digest/` — TypeScript
`moduleResolution: bundler` in the shared tsconfig allows extensionless, but
to match the existing in-package style we keep relative imports extensionless
or `.js` per each file's current convention; **prefer extensionless relative
imports inside `packages/shared/src/digest/`** to match `keyring/index.ts`
which uses `.js` — check the moved file's existing style and preserve it.)

## Slice 2 — `aura-digest-and-deps-to-shared` (size l)

### Exports added

- `@pi-aura/shared/digest/aura-digest` → `aura-digest.ts`, exporting
  `fetchAction`, `renderAction`, `saveAction`, `diffAction`, `cleanupAction`,
  `lastAction` (the actions `main()` dispatches), plus the `USAGE` string.
- `@pi-aura/shared/digest/devlinks`, `.../clients`, `.../mcp-client`,
  `.../bitbucket` → their modules (unchanged public surface).

### Seams

1. **`fetchAction` extension-import seam (the gate for tasks 2–4):** a scratch
   `import { fetchAction } from "@pi-aura/shared/digest/aura-digest"` in a
   temporary extension file typechecks under `tsc --noEmit`. (Ad-hoc, deleted.)
2. **CLI shim seam:** `scripts/src/aura-digest.ts` becomes a thin entry that
   imports the actions from shared and runs `main()` dispatch on `process.argv`.
   `scripts` typecheck + build pass; `aura-digest.mjs` behaves identically.
3. **Shared typecheck + moved-tests seam:** `packages/shared` typecheck and
   `tsx --test` green.

### Interface contract for slice 3 / tasks 2–4

- `@pi-aura/shared/digest/aura-digest` exports `fetchAction` (the in-process
  entry point task 2 calls from the extension).
- `@pi-aura/shared/digest/progress-emitter` exports `readDashboardUrl` (slice 3
  replaces the extension's local duplicate with this).

### `fail()` seam decision (recorded)

`aura-digest.ts`'s `fail(msg, usage?, code)` currently calls `process.exit`.
In the shared core, `fail` **throws** instead of `process.exit`-ing. The CLI
shim's `main().catch(...)` already does `process.exit(1)` on any thrown error;
for the `fail` path the shim catches the thrown error, prints usage if
present, and exits with the code. This keeps the core side-effect-free for
in-process callers (tasks 2–4) while preserving CLI behavior. The tdd-worker
implements `fail` as `throw new FailError(msg, usage, code)` (a small private
Error subclass) and the shim translates it. **Verify** the CLI's exit code for
`unknown action` / `missing action` stays `2` (the current `fail` default) —
the shim's catch must read the code off the thrown `FailError`.

## Slice 3 — `remove-readDashboardUrl-duplicate` (size s)

### What changes

- `.pi/extensions/digest-dashboard/index.ts`: delete the local `readDashboardUrl`
  (lines ~386–401) and the local `joinUrl` (~403–407) if it was duplicated; import
  `readDashboardUrl` from `@pi-aura/shared/digest/progress-emitter`.
- If `joinUrl` is used elsewhere in `index.ts` (the `digest-log` POST path uses
  `joinUrl(dashboardUrl, "/api/state")` at line ~611), keep a `joinUrl` in the
  extension OR export `joinUrl` from shared `progress-emitter`. **Decision:
  export `joinUrl` from `@pi-aura/shared/digest/progress-emitter`** so there's a
  single source of truth, and re-point the extension's call. (The slice doc
  allows this — it says "and the `joinUrl` helper if it was also duplicated".)
- `test/digest-dashboard/**` (and any `log-tool.test.ts`): update mocks of the
  local helper to mock the shared import.

### Seams

1. **De-duplication seam:** `index.ts` has no local `readDashboardUrl`/`joinUrl`
   definitions; it imports them from shared.
2. **Extension typecheck seam:** `tsc --noEmit` passes.
3. **Behavior seam:** `digest-log` no-op path (no `server-url.json`) still
   returns ok; POST path still POSTs. `log-tool.test.ts` passes.
4. **Full suite seam:** vitest + shared `tsx --test` + both typechecks green.

### Interface contract

None — this is the final slice; it consumes slice 2's `readDashboardUrl`/
`joinUrl` exports. It leaves the extension able to import shared digest
helpers cleanly, closing the TS6059 workaround from `digest-live-progress-tree`.

## Whole-task determinism gate

After every slice, and once more at coherence: run `aura-digest.mjs fetch`
before and after the slice's diff; the `digest.json` output must be
byte-identical (dev_links order, reviews_owed, warnings). The CLI output is
the behavioral contract — it must not change.

## Out of scope (explicit)

- The in-process server/fetch/log/save rewiring (tasks 2–5 of the map).
- Deleting the CLI bundle or `scripts/esbuild.config.mjs` (task 5).
- Touching the extension's tools' runtime behavior.
- Changing `types.ts` interface shapes.
- Reconciling `scripts/src/settings.ts` with `packages/shared/src/settings.ts`
  (a separate, later call-site-migration task).
- The `digest-dashboard` Svelte UI / `server.ts` / `progressTree.ts`.

## Baseline (captured at spec time)

- `scripts` typecheck: green
- extension typecheck: green
- vitest root suite: **20 files / 210 tests pass**
- shared `tsx --test`: **149 tests pass**
- Probe: extension imports `@pi-aura/shared/digest/*` with no TS6059 ✅
