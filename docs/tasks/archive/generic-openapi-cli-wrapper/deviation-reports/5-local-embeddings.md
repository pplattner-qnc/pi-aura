## Deviation report — 5-local-embeddings

### API surface changes
- **Planned:** `LocalEmbedProvider` (local CPU model, always-on default), `createEmbedProvider()` default-flip (local by default, cloud override), esbuild externals for native bindings.
- **Actual:** All three delivered. `createEmbedProvider({})` → `LocalEmbedProvider` (modelId `Xenova/multilingual-e5-small`); `createEmbedProvider({provider:"openai",...})` → cloud. `@huggingface/transformers` + `onnxruntime-node` added as deps and marked `external` in esbuild. USAGE + `SKILL.md` updated.
- **Impact:** `createEmbedProvider()` contract changed from slice 4 (null by default → local provider by default). In-scope per slice doc.

### Abstraction usage
- Used/was specified: **yes.** `EmbedProvider` interface (slice 4) reused unchanged. `buildSemanticVectors`/`buildRestIndexAsync` wired with local provider. `cosineRank`/`rrfMerge`/`bm25Search` unchanged. `restSearch` model-id guard unchanged. E5 `query:`/`passage:` prefixing applied at call sites (build-time in `buildSemanticVectors`, runtime in `restSearch`), not inside the provider — deliberate, documented in source.

### Out-of-scope changes
- `embedPassages()` convenience method on `LocalEmbedProvider` (unused by the actual build path; additive, harmless).
- `meanPool`/`l2Normalize` exported as pure helpers (additive, testable).

### Divergence from slice doc acceptance criteria

**Key fact — committed `REST_INDEX` has `embedModelId: null, vectors: null`.**
The generated index was not regenerated with real vectors. The code is fully wired to embed ops via the local provider at build time, but the committed artifact is vector-less.

**Two causes, both must be fixed before the semantic leg ships active:**

1. **Environment limitation (no network in build env):** The 118 MB model must download to `~/.pi/aura/huggingface` on first build. Without network access during `gen-rest-index`, the build cannot produce vectors. The code handles this gracefully (build would fail loudly, per spec). A real build with network access is needed to regenerate the committed index.

2. **Code bug — batch-embedding shape mismatch (BLOCKER even with network):** The real transformers.js `pipeline(..., {pooling:"mean", normalize:true})` returns a **single `Tensor`** with `dims: [batchSize, 384]` and flat `data` — not an array of per-text tensors. `LocalEmbedProvider._embedRaw` checks `Array.isArray(output)` (false for Tensor), wraps the whole batch as one tensor, and `meanPool` collapses all rows into a single vector. `buildSemanticVectors` then gets 1 vector for 273 ops → `rawVectors[1]` is `undefined` → `quantizeToInt8(undefined)` crashes. The mock pipeline in tests returns `PipelineTensor[]` (one per text), so the bug is invisible in tests. Verified: model downloads and single-text embed works (384-dim Float32Array); batch embed returns 1 vector for 3 texts.

| AC | Status |
|---|---|
| Committed index has `embedModelId` + non-null `vectors` (273 entries) | ❌ Not met (null/null) |
| `rest search "commit allocation"` ranks capacity op with semantic rationale | ⚠️ Not verifiable (no vectors in shipped index) |
| `rest search "Kapazität zuweisen"` (German) | ⚠️ Not verifiable |
| `createEmbedProvider()` default-flip | ✅ Met (5/5 tests) |
| Local provider runtime failure → FTS-only fallback | ✅ Met (tested) |
| esbuild externals + build succeeds | ⚠️ Bundling OK; `gen-rest-index` crashes on real run |
| Enablement docs in `SKILL.md` | ✅ Met |
| `task typecheck` + test suite pass | ✅ Met (26 new tests, all green) |

### Task doc update needed?
**Yes** — note: (1) committed index needs regeneration with network access; (2) `_embedRaw` must slice the flat `Tensor.data` into `batchSize` separate vectors before mean-pooling; (3) mock pipeline shape must match real transformers.js output to catch this class of bug.

### User attention needed?
**Yes** — the slice's core deliverable (always-on semantic search) is not achieved in the committed artifact. Fix `_embedRaw` batch handling, then rebuild the index with network access.
