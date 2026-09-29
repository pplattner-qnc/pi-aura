## Deviation report — 4-semantic-search-leg

### API surface changes

- **RestIndexBlob type widened (additive, backwards-compatible):**
  - **Planned:** `embedModelId: null` and `vectors: null` (slice 3 left them as literal `null` so slice 4 would "fill" them without restructuring).
  - **Actual:** `embedModelId: string | null`, `vectors: OpVectorEntry[] | null`, and two new optional fields `dims?: number`, `dtype?: VecElementType` were added to the interface. `OpVectorEntry = { operationId: string; vec: Int8Array | Float32Array }` and `VecElementType = "f32" | "i8"` are new exported types.
  - **Impact:** None — this is the planned fill operation. The widening from `null` to `string | null` / `OpVectorEntry[] | null` is the expected evolution. The `dims`/`dtype` fields are additive and required by the acceptance criteria (index must record vector representation). No downstream slices affected (this is the last slice).

- **`buildRestIndexAsync` added (new export, not in arch spec):**
  - **Planned:** Arch spec says "extend `gen-rest-index` to embed the per-op searchable text via the configured provider." It implies modifying `buildRestIndex` or adding the embedding step at the CLI level.
  - **Actual:** A new `buildRestIndexAsync()` function was added alongside the existing sync `buildRestIndex()`. The async variant calls the sync one for metadata+FTS, then separately calls `buildSemanticVectors()` and merges the result. `buildRestIndexAsync` also **re-loads `openapi.yaml`** via `loadOpenApi(openApiPath)` a second time (line 231), duplicating the load already done inside `buildRestIndex` (line 172). The loader caches per-process, so this is a correctness no-op, but it's a redundant call.
  - **Impact:** None on dependents. The `buildRestIndex` sync function is unchanged, so slice 3's tests still pass. The redundancy is a minor efficiency concern, not a contract break.

- **`restSearch` changed from sync to async:**
  - **Planned:** Arch spec listed `restSearch(index, query, out, opts)` without specifying sync/async. Slice 3 implemented it as sync (`void`).
  - **Actual:** Changed to `async (...): Promise<void>`. All existing callers (the `rest search` case in `aura.ts` main dispatch, and the test file `rest-search.test.ts`) were updated to `await restSearch(...)`.
  - **Impact:** The existing `rest-search.test.ts` tests were correctly updated to `async`/`await`. No other consumers. This is an expected and necessary change for the runtime query embedding call.

- **`RestSearchOptions` gained `embedProvider?: EmbedProvider | null`:**
  - **Planned:** Arch spec says `restSearch` accepts an injectable embed provider via opts for testability.
  - **Actual:** `embedProvider?: EmbedProvider | null` added to `RestSearchOptions`.
  - **Impact:** None — additive, enables unit testing without real network calls.

- **`loadEmbedSettings()` exported (new, not explicitly in arch spec):**
  - **Planned:** Arch spec says `createEmbedProvider(config?)` reads `aura.embed.*` settings/env. It mentions "extend `loadAuraClientSettings` or a new `loadEmbedSettings`."
  - **Actual:** A separate `loadEmbedSettings()` function was added in `provider.ts` (not in `settings.ts`). It reads `~/.pi/agent/settings.json` `aura.embed` block + env vars (`AURA_EMBED_*`). The caller in `aura.ts` calls `loadEmbedSettings()` then passes the result to `createEmbedProvider(embedSettings)`.
  - **Impact:** None. This is the "new `loadEmbedSettings`" option the arch spec allowed. It lives in `provider.ts` rather than `settings.ts` — a minor colocation choice, not a deviation.

- **`createEmbedProvider` requires `baseURL` (stricter than spec):**
  - **Planned:** Arch spec: `createEmbedProvider(config?) → provider or null`. Config: `aura.embed.provider` + `aura.embed.model` + `aura.embed.apiKey`.
  - **Actual:** `createEmbedProvider` returns `null` when `provider`, `model`, `apiKey`, OR `baseURL` are all not set. The arch spec mentioned `baseURL` as an optional config but the implementation requires it. When `baseURL` is absent → `null`.
  - **Impact:** Minor. If a user configures `aura.embed` with provider+model+apiKey but no baseURL, they get silent FTS-only instead of a clear "missing baseURL" error. Not a contract break but a UX gap.

### Abstraction usage
- Used/was specified: **yes**
  - `loadOpenApi()` from slice 1 — reused in `buildRestIndex` and `buildRestIndexAsync`. ✅
  - `bm25Search`, `rrfMerge` from slice 3 — reused unchanged in `restSearch`. ✅ The `rrfMerge` result is now actually used (slice 3 discarded it; slice 4 fixes this by sorting the merged Map).
  - `REST_INDEX` inlined blob from slice 3 — `restSearch` reads `index.vectors`, `index.embedModelId`, `index.dtype`. ✅
  - `fail()` + `rest` group branch in `aura.ts` — extended, not replaced. ✅
  - `resolveAuraCredentials()` — correctly NOT used; embeddings use a separate `aura.embed.*` config. ✅
  - Test runner discipline: `packages/shared` tests use `node:test`/`tsx`; `scripts/src` tests use `node:test`/`node --experimental-strip-types`. ✅

### Out-of-scope changes
- **`quantizeToInt8()` exported from `@pi-aura/shared/embed/cosine`** — this is the int8 quantization function. It's used by `buildSemanticVectors` in `gen-rest-index.ts` to quantize vectors at build time, and by `cosineRank` to quantize the query at runtime. This is in-scope per the slice doc ("int8 quantization of a larger model" / "quantize the query if the index is int8"). The export from `cosine.ts` (a shared package) rather than `gen-rest-index.ts` (scripts) is a slightly broader visibility than necessary, but it makes the quantization logic testable in the shared test suite. No issue.
- **No changes to `rest list`/`describe`/`call`** — confirmed. The slice doc constraint "Do NOT change `rest list`/`describe`/`call`" is respected. ✅
- **No local ONNX model or weights bundled** — confirmed. ✅
- **Taskfile.yml unchanged** — the `gen-rest-index` step from slice 3 is reused; slice 4's embedding is invoked inside `genRestIndex()` which dynamically imports the provider. No Taskfile change needed. ✅

### Divergence from slice doc acceptance criteria

1. **"index built with model A, runtime provider model B → warning naming both models"** — ✅ Satisfied. The warning string is: `semantic leg skipped: index built with "${index.embedModelId}", runtime provider is "${provider.modelId}" — FTS-only results`. Tested in `rest-search-semantic.test.ts`.

2. **"no silent cross-model cosine comparison"** — ✅ Satisfied. The model-id guard short-circuits before any `cosineRank` call. Tested.

3. **"build inlines metadata + FTS + vectors within size budget"** — ✅ Satisfied. Build succeeds with no embedding provider configured (vectors null). The size-budget assertion is extended with vector-aware remediation hints. When a provider IS configured and vectors blow the budget, `assertSizeBudget` throws. However, **this path was only tested with mock fixtures** (tiny budget triggers the assertion), not with a real embedding provider + real OpenAPI spec. The actual size budget compliance with real 273-op vectors is not verified in CI (no embedding provider configured in CI). This is acceptable per the slice doc ("build does not fail — the semantic leg is opt-in") but the real-world budget compliance is untested.

4. **"runtime query embedder honors dtype"** — ✅ Satisfied. `cosineRank` quantizes the query to i8 when `dtype === "i8"` and the query is `Float32Array`. Tested in `cosine.test.ts`.

5. **"task build succeeds when no provider at build → vectors:null, embedModelId:null"** — ✅ Satisfied. Build passes without embedding config; the generated `REST_INDEX` has `embedModelId: null, vectors: null`.

6. **"rest search with provider → rationale notes semantic leg matched"** — ✅ Satisfied. Result lines include `leg: semantic`, `leg: both`, or `leg: FTS`. Tested.

7. **"rest search with no provider → FTS-only with note"** — ✅ Satisfied. Prints `semantic leg skipped (no embedding provider) — FTS-only results`. Tested.

8. **"task typecheck + full test suite pass"** — ✅ Satisfied. `tsc --noEmit` clean for both packages; 131 shared tests + 41 scripts tests + 210 vitest tests all pass.

### Minor observations (not deviations, not blockers)

- **`buildRestIndexAsync` double-loads `openapi.yaml`**: `buildRestIndex` calls `loadOpenApi(openApiPath)` at line 172, then `buildRestIndexAsync` calls it again at line 231 to rebuild `searchableOps` for the embedding step. The loader caches per-process, so this is a no-op functionally, but the `searchableOps` construction (sort + map + `buildSearchableText`) is duplicated. A refactor could pass the `searchableOps` from `buildRestIndex` to the embedding step, but this is a minor efficiency concern in a build-time-only path.

- **`createEmbedProvider` returns `null` for non-"openai" providers**: The slice doc says "supports at least one HTTP provider." The implementation only supports `provider === "openai"` and returns `null` for anything else. This satisfies "at least one" but means a user configuring `provider: "ollama"` gets silent FTS-only with no indication that the provider type was unrecognized. Not a deviation (the spec says "at least one"), but a UX gap.

- **USAGE block**: The `rest search` line was already present from slice 3 and correctly remains unchanged. ✅

### Task doc update needed?
**No.** No implementation notes need updating in the task doc. The deviations are all additive type widenings or expected async conversions that match the arch spec's slice-4 contract ("slice 4 only **fills** those fields, doesn't restructure the blob").

### User attention needed?
**No.** The API surface matches the arch spec's planned contract. The `RestIndexBlob` widening is the expected fill operation. The `restSearch` sync→async change is necessary for runtime query embedding. No scope was widened beyond the slice doc. The only items worth noting for the coherence refactor (Step 3) are:
- The double `loadOpenApi` call in `buildRestIndexAsync` (minor redundancy).
- `createEmbedProvider` silently returning `null` for unrecognized provider types and missing `baseURL` (could be a warning instead of silent null).
