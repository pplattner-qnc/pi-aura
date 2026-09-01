# Architecture Spec — generic-openapi-cli-wrapper

Shared across all slice chains. Each slice implements against this spec and
the slice doc. The tdd-worker tests **only at the seams listed here**.

Conventions discovered from the repo (authoritative for all slices):

- **Two packages, two build paths:**
  - `packages/shared` (`@pi-aura/shared`): `module: ESNext`, `moduleResolution: bundler`, `strict`. Tests run with `tsx --test test/*.test.ts` (its own `"test"` script) using **`node:test`** + `node:assert/strict` (see `keyring.test.ts`, `review-verbs.test.ts`). The shared `exports` map currently is `{ ".": "./src/index.ts", "./keyring": "...", "./aura-client": "...", "./*": "./src/*.ts" }` — the `./*` wildcard means a new `openapi` module at `src/openapi/loader.ts` is importable as `@pi-aura/shared/openapi/loader` with **no** `exports` edit.
  - `scripts/` (the CLI bundle): `typecheck` via `tsc --noEmit` (`tsconfig.json` excludes `*.test.ts`), `build` via `node esbuild.config.mjs` → `skills/core/aura/dist/aura.mjs`. The root `vitest.config.ts` includes only `test/**/*.test.ts`, `scripts/src/scheduler.test.ts`, and `scripts/src/aura-digest-progress.test.ts` — **other `scripts/src/*.test.ts` files are run directly** with `node --experimental-strip-types <file>` (see the `build-actions.test.ts` header). So: a new `scripts/src/rest*.test.ts` should use **`node:test`** + `node:assert/strict` and be run via `node --experimental-strip-types` (or `tsx`), NOT added to the vitest include.
- **`aura.ts` dispatch** (`main()`): `group = argv[2]`, `sub = argv[3]`, `rest = argv.slice(4)`. `parseFlags(rest)` returns `Record<string,string>` — **overwrites repeated keys** (so `--param a --param b` loses `a`); the `rest call` slice must use a multi-valued flag parser, not `parseFlags`. `main()` calls `createDefaultAuraClient()` **eagerly at the top** (line 405) before group dispatch — the `rest` group must **not** force PAT resolution for `list`/`describe` (no network); only `call` (and, later, `search`'s query embed) need credentials/network. The `rest` branch should construct its client lazily inside the `call` handler.
- **`fail(msg, usage?, code=2)`** is the existing error helper (`console.error` + optional USAGE + `process.exit(code)`). The `rest` group reuses it.
- **USAGE block** is a single `const USAGE` template string at the top of `aura.ts`; each slice appends its `rest ...` lines.
- **`js-yaml`** is already a `scripts` dependency; it is **not** currently a `packages/shared` dependency. The loader lives in `packages/shared`, so slice 1 adds `js-yaml` (+ `@types/js-yaml`) to `packages/shared/package.json` `dependencies`/`devDependencies`.
- **esbuild config** (`scripts/esbuild.config.mjs`): bundles `src/aura.ts` → `../skills/core/aura/dist/aura.mjs`, `external: ["@napi-rs/keyring", "...", "dbus-next"]`, `platform: node`, `format: esm`, `target: node22`. Inlining a generated index = importing a generated module from `src/` so esbuild bundles it (no new esbuild option). `scripts/tsconfig.json` **does** set `resolveJsonModule: true`, so either a generated `.json` import or a `.ts` const works. **Prefer emitting a `.ts` module** (`export const REST_INDEX = {...}`) for determinism and to keep the bundle import graph explicit, but `.json` is acceptable too. Note: `packages/shared/src/generated/` (the generated SDK client) is **committed** (not gitignored) — same precedent applies: a generated index under `scripts/src/generated/` can be committed and regenerated on build.
- **Taskfile.yml** is the build entrypoint (`task build` = `typecheck` + `build` + verify). New build steps (`gen-rest-doc`, `gen-rest-index`) are added as `tasks:` and wired into `build:`'s `cmds:` before the esbuild bundle.

---

## Slice 1 — `1-loader-list-describe` (size m)

### Exports (public API surface)
- `@pi-aura/shared/openapi/loader`:
  - `loadOpenApi(path: string): OpenApiIndex` — parse once, cache per process.
  - `type OpenApiIndex = Record<string, OpMeta>` (keyed by `operationId`).
  - `type OpMeta = { operationId, method, path, pathParams: Param[], queryParams: Param[], body?: BodyShape, tags: string[], summary?, description?, responses: ResponseEntry[] }`.
  - `type Param = { name, required, schema: { type?, format?, items? }, style?, explode?, description? }`.
  - `type BodyShape = { contentType: "application/json", schemaRef?: string, schemaInline?: object, required: boolean }`.
  - `type ResponseEntry = { code: string, description: string, schemaRef?: string }`.
  - Exports a `parseOpenApi(path): object` (the raw parse) only if reused by the generator; otherwise keep `loadOpenApi` as the sole entry. **Keep one entry point** (`loadOpenApi`); the generator in slice 3/3a imports it.
- `@pi-aura/shared/openapi/serialize` (NO — serialization lives in slice 2). Slice 1 is **read-only**.
- CLI subcommands `rest list` and `rest describe` — internal to `scripts/src/aura.ts`, no new public export.

### Existing abstractions to use
- `fail(msg, usage?, code)` in `scripts/src/aura.ts` for errors + USAGE.
- The `main()` dispatch switch (`group`/`sub`/`rest`) — add an `else if (group === "rest")` branch.
- `js-yaml` (`scripts` dep) — add to `packages/shared` deps for the loader.
- `skills/core/aura/resources/` — the existing resources dir; `rest-api.md` goes there.

### Do NOT reimplement
- Do not hand-maintain a command registry — the loader is the only parser.
- Do not reimplement YAML parsing — use `js-yaml`.
- Do not implement `call`/`search`/code-tags/FTS/embeddings here.

### Seams (test only at these)
1. `loadOpenApi(path)` → `OpenApiIndex` (pure; file-based; no network). **Test runner: `node:test` via `tsx --test` in `packages/shared/test/`**; fixture OpenAPI YAML files under `packages/shared/test/openapi-fixtures/`.
2. `rest list` / `rest describe` stdout → run the CLI dispatch with a stubbed `process.argv` against a **fixture** OpenAPI (small file), assert stdout. **Test runner: `node --experimental-strip-types` / `tsx` on a new `scripts/src/rest-list-describe.test.ts`** (NOT vitest), per the `build-actions.test.ts` convention. The test calls a refactor-extracted `restList(index, out)` / `restDescribe(index, opId, out)` function (not `main`) so it's unit-testable without spawning the process.
3. The `gen-rest-doc` generator `generateRestDocMd(index): string` → markdown (pure; over the loader index). **Runner: `node:test` / `tsx` in `scripts/src/` (or a `scripts/src/gen/` subdir).**

### Interface contract (for dependents)
- `OpenApiIndex` shape (above) is the contract slices 2, 3, 3a consume. **It must include `body`, `queryParams` with `style`/`explode`, `tags`, `summary`, `description`** even though slice 1's `list`/`describe` don't all print them — slices 3/3a need them. If slice 1 omits a field a later slice needs, that's a contract break; include the full shape now.
- `loadOpenApi(path)` is the single parser; the build generators (slice 3a's `gen-rest-index`) call it with the real `packages/shared/openapi/openapi.yaml` path.

---

## Slice 2 — `2-rest-call-invoker` (size m)

### Exports
- `@pi-aura/shared/rest/build-request`:
  - `buildRequest(op: OpMeta, params: Record<string,string|string[]>, body?: unknown): { method, urlPath, query: string, headers: Record<string,string>, body?: string }` — pure path-fill + query serialize + body attach. **No network, no auth.**
- `@pi-aura/shared/aura-credentials`:
  - `resolveAuraCredentials(): Promise<{ baseUrl: string, pat: string }>` — the shared credential helper. Reuses `loadAuraClientSettings()` + `createKeyring().getSecret({ service:"aura", name:"pat" })`. Throws the same actionable errors as `createDefaultAuraClient()` for missing baseUrl / missing PAT.
- `@pi-aura/shared/rest/call-operation` (optional thin wrapper) or inline in `scripts/src/rest-call.ts`:
  - `callOperation(op, params, body): Promise<{ status, body }>` — fetches `${baseUrl}${urlPath}${query}` with `Authorization: Bearer <pat>` + `Content-Type: application/json` (when body). Returns status + raw JSON.
- CLI subcommand `rest call` — internal.

### Existing abstractions to use
- `loadAuraClientSettings()` + `createKeyring()` from `@pi-aura/shared` (the primitives `createDefaultAuraClient()` uses).
- `loadOpenApi()` from slice 1 to resolve the operation.
- `fail()` + the `rest` group branch from slice 1.
- A **multi-valued flag parser** for `--param` (new; `parseFlags` overwrites). Add `parseMultiFlags(rest): { params: Record<string,string[]>, bodyFile?, body? }` or reuse/extend carefully — `--param k=v` may repeat.

### Do NOT reimplement
- Do not call `createDefaultAuraClient()` (returns typed `AuraClient`, useless for 273 ops). Reuse the **credential path**, not the typed client.
- Do not construct `HeyApiAuraClient` or import the generated SDK.
- Do not validate the body against the OpenAPI response schema.
- Do not do pagination auto-follow / retry / backoff.

### Seams
1. `buildRequest(op, params, body)` → request shape (pure; **no network, no auth**). **Runner: `node:test`/`tsx` in `packages/shared/test/`**; fixture `OpMeta` objects (path-fill, query array comma-sep, body attach, missing-param errors, extra-param errors, unsupported `style` error).
2. `resolveAuraCredentials()` → `{ baseUrl, pat }` (mock the settings file path + a fake keyring; assert it calls `loadAuraClientSettings` + `createKeyring().getSecret` — same path as `createDefaultAuraClient`). **Runner: `node:test`/`tsx` in `packages/shared/test/`.**
3. `rest call` end-to-end → stdout + exit, with `fetch` mocked (global `fetch` stub) and credentials stubbed. Assert method, url, `Authorization` header, body, printed JSON, exit code. **Runner: `node --experimental-strip-types`/`tsx` on a new `scripts/src/rest-call.test.ts`.** Refactor extract a `restCall(index, credentials, args, out)` function for unit testing without spawning.

### Interface contract (for dependents)
- `resolveAuraCredentials()` is the single credential path. **`createDefaultAuraClient()` is refactored in this slice to call `resolveAuraCredentials()`** (so there's exactly one resolution path). This is a contract change to an existing export — note it in the deviation report; it's in-scope per the slice doc ("refactor `createDefaultAuraClient()` to use the new helper").
- `buildRequest`'s output is what `callOperation` fetches; no later slice changes it.

---

## Slice 3 — `3-fts-search-and-inlined-index` (size l)

### Exports
- `@pi-aura/shared/rest/fts`:
  - `buildFtsIndex(ops: SearchableOp[]): FtsIndex` — pure BM25 stats.
  - `bm25Search(index: FtsIndex, query: string, k?: number): FtsHit[]` — ranked hits with rationale.
  - `rrfMerge(rankings: (readonly string[])[], k?: number): Map<string, number>` — RRF over N legs; `rrfMerge([ftsRanking])` ≡ FTS ranking (stub for 3 → 4 upgrade).
  - `type SearchableOp = { operationId, text: string }` — the per-op searchable text (name+summary+description+tags+code-tags).
  - `type FtsHit = { operationId, score, terms: string[] }`.
- `scripts/src/rest-code-tags.ts`:
  - `CODE_TAGS: { byOp: Record<string, string[]>, byTagGroup: Record<string, string[]> }` — curated, non-user-facing.
  - `resolveCodeTags(op: OpMeta): string[]` — merge by-op + by-group for an operation.
- `scripts/src/gen/gen-rest-index.ts` (build-time generator):
  - `buildRestIndex(openApiPath: string, codeTags: ...): RestIndexBlob` — reads `openapi.yaml` via `loadOpenApi`, builds searchable text + FTS index + **slim metadata blob**, returns the inlined index object.
  - `type RestIndexBlob = { version, metadata: OpMeta[] (slim), fts: FtsIndex, embedModelId: null, vectors: null }` (vectors null in this slice; slice 4 fills them).
  - Writes a `.ts` module: `export const REST_INDEX: RestIndexBlob = {...}` to `scripts/src/generated/rest-index.ts` (gitignored or committed? — **committed is simpler and matches the "no sidecar" constraint**; the generator regenerates it on build). Verify `.gitignore` does not exclude `src/generated/`.
- CLI subcommand `rest search` — internal; reads the inlined `REST_INDEX`.

### Existing abstractions to use
- `loadOpenApi()` (slice 1) in the generator.
- `fail()` + the `rest` group branch (add `search`).
- esbuild import-inlining (no new esbuild option): `import { REST_INDEX } from "./generated/rest-index.js"` (or `.ts`) in `aura.ts`/`rest-search.ts`.
- Taskfile `build` cmds: add `gen-rest-index` step before the esbuild bundle (and `gen-rest-doc` from slice 1 if not already in `build`).

### Do NOT reimplement
- Do not re-parse `openapi.yaml` at runtime in the bundle — the bundle imports `REST_INDEX`.
- Do not implement embeddings/cosine/query-embed here (slice 4). `rrfMerge` here is `RRF(FTS)=FTS`.
- Do not duplicate the FTS index in a sidecar `.json` at runtime.

### Seams
1. `buildFtsIndex(ops)` / `bm25Search(index, query)` → BM25 (pure; fixture ops). **Runner: `node:test`/`tsx` in `packages/shared/test/`.**
2. `rrfMerge(rankings)` → RRF math (pure; fixture rankings; assert `rrfMerge([fts])` ≡ fts order; assert two-leg merge with a fake semantic ranking previews slice 4). **Same runner.**
3. `resolveCodeTags(op)` → tags (pure; fixture code-tag map + ops; assert by-op + by-group merge). **Runner: `node:test`/`tsx` in `scripts/src/` (it's a scripts-side curated map).**
4. The build size assertion → exits non-zero with actual size + hints when a fixture index exceeds a tiny budget; passes under it. **Runner: `node:test`/`tsx` on the generator's assert function.**
5. `rest search` → stdout + rationale (FTS from a real/fixture `REST_INDEX`), including the `semantic leg skipped (no embedding provider)` note. **Runner: `node --experimental-strip-types`/`tsx` on a new `scripts/src/rest-search.test.ts`**, testing a refactor-extracted `restSearch(index, query, out, opts)`.

### Interface contract (for slice 4)
- `RestIndexBlob` shape must include `embedModelId` (null here) and `vectors` (null here) so slice 4 only **fills** those fields, doesn't restructure the blob.
- `rrfMerge` must accept a variable number of rankings so slice 4 passes `[semanticRanking, ftsRanking]` without a signature change.
- `bm25Search` returns an ordered `operationId[]` (or `FtsHit[]` with `operationId`) so slice 4's semantic ranking has a compatible type for RRF.

---

## Slice 4 — `4-semantic-search-leg` (size l)

### Exports
- `@pi-aura/shared/embed`:
  - `interface EmbedProvider { modelId: string; embed(texts: string[]): Promise<Float32Array[]> }`.
  - `createEmbedProvider(config?): Promise<EmbedProvider | null>` — reads `aura.embed.*` settings/env; returns `null` when none configured. Supports at least one HTTP provider (OpenAI-style `/v1/embeddings` via `fetch`); configurable, not hardcoded.
- `@pi-aura/shared/embed/cosine`:
  - `cosineRank(queryVec: Float32Array|Int8Array, opVecs: { operationId, vec }[], dtype: "f32"|"i8"): { operationId, score }[]` — pure; quantizes the query to `dtype` if needed.
- Build-time: extend `gen-rest-index` to embed the per-op searchable text via the configured provider, store vectors (as `i8` or low-dim `f32`, per the size decision) + `embedModelId` + `{ dims, dtype }` in the blob. When no provider at build → `vectors: null, embedModelId: null` (build does not fail).
- Runtime `rest search`: embed the query (one call), `cosineRank`, `rrfMerge([semanticRanking, ftsRanking])`. Model-id guard: if `provider.modelId !== REST_INDEX.embedModelId` → skip semantic leg with a warning.

### Existing abstractions to use
- `resolveAuraCredentials()`? No — embeddings use a **separate** `aura.embed.*` config, not the Aura PAT. Read settings via the shared settings module (extend `loadAuraClientSettings` or a new `loadEmbedSettings`).
- `REST_INDEX` (slice 3), `bm25Search`, `rrfMerge` (slice 3) — unchanged.
- `fail()` + the `rest` group `search` handler — extended, not replaced.

### Do NOT reimplement
- Do not re-embed ops at runtime — op vectors are precomputed at build.
- Do not bundle a local ONNX model or weights.
- Do not silently compare vectors from different models — guard and skip.
- Do not hard-fail `search` on a runtime embed HTTP error — degrade to FTS-only with a warning.

### Seams
1. `createEmbedProvider(config)` → provider or `null` (mock config + HTTP; assert null when absent). **Runner: `node:test`/`tsx` in `packages/shared/test/`.**
2. `buildSemanticVectors(ops, provider)` → vectors + `embedModelId` (provider mocked to deterministic vectors; assert dims/model recorded; null provider → no vectors). **Same runner.**
3. `cosineRank(queryVec, opVecs, dtype)` → ranked ids + scores (pure; fixture vectors; i8 query quantization). **Same runner.**
4. `rrfMerge([semantic, fts])` → fused (already tested in slice 3; re-test with real two legs here). **Same runner.**
5. Model-id guard: index built with model A, runtime model B → warning + no cosine (assert the warning string + that cosine isn't called). **Same runner.**
6. `rest search` → stdout + rationale (provider + fetch mocked; semantic rationale when present; fallback note when absent; warning on mismatch). **Runner: `node --experimental-strip-types`/`tsx` on `scripts/src/rest-search.test.ts` (extended).**

### Interface contract
- This is the last slice; no downstream contract beyond the task's acceptance criteria.

---

## Cross-slice notes

- **Test runner discipline:** `packages/shared` tests use `node:test` + `tsx --test`; `scripts/src` CLI/generator tests use `node:test` + `node --experimental-strip-types` (or `tsx`) and are **not** added to the root `vitest.config.ts` `include`. The tdd-worker must match the runner to the package.
- **Lazy client in `main()`:** slice 1 adds the `rest` branch; `rest list`/`describe` must not trigger `createDefaultAuraClient()` (eager at line 405). Either move the eager call into the branches that need it, or guard it behind `group !== "rest"`. Slice 2's `rest call` then calls `resolveAuraCredentials()` (not `createDefaultAuraClient`) lazily. **This is a refactor of `main()`'s top** — keep it minimal and note it.
- **`resolveJsonModule`:** `scripts/tsconfig.json` **does** set `resolveJsonModule: true`, so either a generated `.json` or a `.ts` const works. Emit a `.ts` const (`export const REST_INDEX = {...}`) for determinism + explicit import graph. (The `.gitignore` does not exclude `scripts/src/generated/`, and `packages/shared/src/generated/` is committed as precedent — so committing the generated index is the established pattern.)
- **Determinism:** `gen-rest-doc` and `gen-rest-index` output must be byte-identical across runs (sort operations/tags deterministically) so `task build` twice produces no diff — slice 1's AC requires this for `rest-api.md`; apply the same to the index.
