# Testing

The repo has two build targets with their own gates: the `scripts/` esbuild
project (bundles `aura.mjs` for the `aura` skill) and the `@pi-aura/shared`
workspace package (`.ts` sources consumed by both `scripts/` and the pi
extension). Verification is typecheck + build + the shared package's unit tests.

## Framework

- `scripts/`: `tsc --noEmit` + esbuild bundle for `aura.mjs` (no configured
  test runner; the `scripts/src/*.test.ts` suites run per-file with
  `node --experimental-strip-types`).
- `packages/shared/`: `tsc --noEmit` + `tsx --test` (Node's built-in test
  runner via `tsx` for `.ts` sources). Tests live in `packages/shared/test/`.
- `extensions/`: per-file suites run with `node --experimental-strip-types`
  (no configured runner).
- Repo root: no test runner and no test tree; the per-package runner
  convention stands.

## Run commands

```bash
# Root (workspaces root): one install populates scripts/ + packages/shared/
npm install

# packages/shared — the AuraClient interface, HeyApiAuraClient impl, keyring, settings
cd packages/shared
npm run codegen        # regenerate src/generated/ from openapi/openapi.yaml
npm run typecheck      # tsc --noEmit
npm test               # tsx --test test/*.test.ts

# scripts — the aura skill bundle
npm run typecheck      # tsc --noEmit
npm run build          # esbuild -> skills/core/aura/dist/aura.mjs

# Taskfile wrappers (run from the repo root; requires `task` on PATH —
# https://taskfile.dev; not available on NixOS by default — use npm directly
# as shown above):
task install          # root npm install
task codegen          # cd packages/shared && npm run codegen
task gen              # codegen + typecheck + build
task build            # typecheck + bundle
task openapi-sync     # refresh packages/shared/openapi/openapi.yaml from the Aura repo
```

## Mock conventions

- Inject a fake `Keyring` (returns a test PAT) over hitting the real OS
  keyring. A `FakeKeyring` implementing the `Keyring` interface is the
  standard seam; the `hey-api-aura-client` suite uses it (see
  `packages/shared/test/hey-api-aura-client.test.ts`). Assert constructed
  auth headers, not live network calls.
- Inject a fake generated SDK / `createClient` over hitting real Aura for
  `HeyApiAuraClient` mapping tests; assert the domain<->generated mapping
  without network calls.
- The `AuraClient` interface is implementation-agnostic; `scripts/src/aura.ts`
  consumes `createDefaultAuraClient()` from `@pi-aura/shared/aura-client` and
  should be unit-tested by injecting a fake `AuraClient` rather than the real
  `HeyApiAuraClient`.
- The scripts' esbuild bundle marks `dbus-next` as `external` (the optional
  `x11` require in its transitive graph can't bundle). Any new native-ish dep
  pulled in transitively via `@pi-aura/shared` must be added to
  `scripts/esbuild.config.mjs`'s `external` array or the bundle breaks.
- **Generated SDK imports need `.js` extensions under NodeNext** (the
  `tsConfigPath` lesson). The generated client in `packages/shared/src/generated/`
  is consumed by BOTH `scripts/` (`moduleResolution: bundler`) and Node's
  ESM loader (the extension suites load it dynamically; the codegen tsconfig
  `tsconfig.codegen.json` is `moduleResolution: NodeNext`). Under NodeNext,
  relative import specifiers MUST carry a `.js` extension or `tsc` fails with
  TS2307/TS2834. `@hey-api/openapi-ts` (v0.67+) auto-appends `.js` to generated
  relative imports when the resolved `output.tsConfigPath` tsconfig has
  `moduleResolution: "nodenext"`. `packages/shared/openapi-ts.config.ts` points
  `tsConfigPath` at `packages/shared/tsconfig.codegen.json` (a tiny NodeNext
  tsconfig), so `npm run codegen` emits the `.js` extensions natively — the
  generated tree is correct out-of-the-box and survives regeneration. **Do NOT
  hand-patch `.js` extensions onto generated files** (a prior attempt did;
  the next codegen run wiped them). `tsConfigPath` is resolved relative to the
  openapi-ts package dir, not the config file, so it must be an absolute path
  (the config derives it from `import.meta.url`). `.js`-extended specifiers
  also resolve under `bundler`, so the shared package's own `tsc --noEmit` is
  unaffected.

## `scripts/src/{rest-list-describe,rest-call,rest-search,...}.test.ts` (the `rest` CLI)

The `rest` command group (`aura.mjs rest list/describe/call/search`) added a
family of unit tests under `scripts/src/`. These run with **`node
--experimental-strip-types`**.

```bash
node --experimental-strip-types --test scripts/src/rest-list-describe.test.ts
node --experimental-strip-types --test scripts/src/rest-call.test.ts
node --experimental-strip-types --test scripts/src/rest-search.test.ts
node --experimental-strip-types --test scripts/src/gen-rest-index.test.ts
# (and rest-search-local, rest-search-semantic, gen-rest-index-local, gen-rest-index-embed, rest-code-tags, gen-rest-doc)
```

Two runner-discipline lessons (hard-won, from the `generic-openapi-cli-wrapper`
task):

1. **Use `node --experimental-strip-types` for `scripts/src` CLI tests, not
   `tsx`.** `tsx` resolves `.js`→`.ts` sibling imports transitively, which can
   *mask* a failure that `node --experimental-strip-types` (the documented
   runner for these suites) exposes: a source file importing a sibling
   **value** module with a `.js` extension breaks under
   `--experimental-strip-types` (it can't rewrite `.js`→`.ts` for value
   imports). If a `scripts/src` source needs a shared value module, import it
   via the **package path** (`@pi-aura/shared/rest/closest-match`), not a
   sibling `.js` — the package path resolves under both runners. `import type`
   with `.js` is fine (erased at runtime).
2. **`packages/shared` suites run under the shared package's own runner.**
   Run them with `cd packages/shared && npm test` (or `npx tsx --test
   test/<suite>.test.ts`). There is no root runner and no root test tree; the
   per-package runner convention stands.

### Mock-fidelity for external-library integration (the `_embedRaw` lesson)

The local-embeddings provider mocks `@huggingface/transformers`' `pipeline`.
The first implementation's mock returned the WRONG output shape (an array of
per-text tensors) while the real `pipeline(..., {pooling:'mean', normalize:true})`
returns a **single `Tensor`** with `dims=[N, hiddenDim]` and flat `data`. All
unit tests passed against the wrong-shaped mock; the real `task gen-rest-index`
build crashed (`quantizeToInt8(undefined)`). A mock whose shape doesn't match
the real library's output is worse than no test — it gives false confidence.
For external-library integration: **record the real output shape in the test**
(the `local-provider.test.ts` now asserts a single `{data, dims:[N,384]}`
tensor against a 2- and 3-text batch, with an off-by-one guard), and run a real
end-to-end gate (the actual `task gen-rest-index` with the cached model) — not
just mocked unit tests — before declaring the slice done.

## Pi extension logic tests (`extensions/*.test.ts`)

Extension modules are unit-tested as pure exported functions run with
`node --experimental-strip-types` + `node:assert/strict` (the same rule as
the `scripts/src` suites above): each `extensions/<name>.ts`
gets a sibling `<name>.test.ts` of top-level assert blocks that import the
module directly, keeping the dynamic-import seams (AuraClient, settings,
`node:sqlite`) out of the test path. Run a suite with:

```bash
node --experimental-strip-types extensions/aura-references.test.ts
node --experimental-strip-types extensions/aura-reference-cache.test.ts
```

`aura-reference-cache.test.ts` (the persistent sqlite store) exercises the
real `node:sqlite` store against temp-file databases (WAL pragma, upserts,
reopen persistence, base-URL keying, the silent in-memory fallback, the TTL
loader with injectable settings paths, and the warmup-gate decision with an
injected clock). For true cross-session concurrency it spawns real child
processes: a small driver written to a temp dir imports the store module by
absolute path and writes through its API while several children race the
same WAL file; the parent asserts exit codes, landed rows, and
`PRAGMA integrity_check`. That driver pattern (spawn + absolute-path import
+ exit-code assertions) is the seam for any future cross-process test.
