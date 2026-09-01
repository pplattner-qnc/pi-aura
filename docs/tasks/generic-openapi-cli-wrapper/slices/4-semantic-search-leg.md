---
kind: slice
slug: 4-semantic-search-leg
title: The semantic leg of rest search — embeddings, cosine, RRF, model-id guard
task: ../task.md
mode: afk
status: todo
size: l
blocked_by: [3-fts-search-and-inlined-index]
---

## End-to-end behavior

`rest search` gains a **semantic** leg: at build time each operation's
searchable text is embedded into a vector; at runtime the query is embedded
(one call) and cosine-ranked against the inlined op vectors; the semantic
and FTS rankings are merged by **reciprocal-rank fusion (RRF)**. The
semantic leg is **independently skippable**: when no embedding provider is
configured at runtime, `search` falls back to FTS-only (slice 3) with a
one-line note; when the runtime query embedder uses a different model than
the index was built with, the semantic leg is **skipped with a warning**
(never a silent cross-model cosine). The combined index stays within the
size budget.

This is the slice that makes "set my capacity" surface the capacity op even
when the vocabulary differs entirely ("commit allocation"), because the
semantic leg matches *intent*, not terms.

## What this slice delivers

- An **embedding provider seam** in `@pi-aura/shared` settings/env: a small
  interface (`EmbedProvider { embed(texts: string[]): Promise<Float32Array[]>;
  modelId: string }`) and a factory `createEmbedProvider()` that reads config
  from the `aura` settings block (e.g. `aura.embed.provider` +
  `aura.embed.model` + `aura.embed.apiKey`/env) and supports at least one
  provider (OpenAI-style HTTP `/v1/embeddings` via fetch; the exact provider
  is an implementation decision, but it must be configurable, not
  hardcoded). When no provider is configured, `createEmbedProvider()`
  returns `null`.
- **Build-time op vectors:** the `gen-rest-index` step embeds every
  operation's searchable text (the same text slice 3 builds: name +
  summary + description + OpenAPI tags + code-side tags) using the
  configured provider, and stores the vectors in the inlined index
  alongside the FTS index and metadata. The **index records the embedding
  model id** it was built with.
- **Model-id guard:** the inlined index stores `embedModelId`. At runtime,
  `rest search` reads the configured provider's model id; if it differs
  from the index's recorded id, the semantic leg is **skipped with a
  warning** (`index built with <X>, runtime provider is <Y> — semantic leg
  skipped, FTS-only results`), never a silent cross-model cosine.
- **Runtime query embedding:** `rest search` embeds the query (one call)
  via the configured provider, computes cosine similarity against the
  inlined op vectors, ranks operations, and merges with the FTS ranking via
  **RRF** (reciprocal-rank fusion, k≈60). Prints ranked `operationId`s with
  a one-line rationale noting *which leg* matched (semantic / FTS / both)
  and the fused score.
- **Graceful fallback:** no provider configured → skip the semantic leg,
  return `RRF(FTS) = FTS` results with the `semantic leg skipped (no
  embedding provider)` note (slice 3's behavior, now real).
- **Size budget maintained:** the combined metadata + FTS + vectors blob
  must still fit the size budget. Vectors dominate (273 ops × dims × 4
  bytes). The generator must use a vector representation that fits: either
  a low-dim model (e.g. 384-d → ~0.42 MB raw for 273 ops) or **int8
  quantization** of a larger model (1536-d int8 → ~0.42 MB). The build
  assertion from slice 3 is extended to cover the combined blob; if vectors push
  it over budget, the build fails loudly with hints (lower-dim model,
  quantize, prune). The chosen representation is recorded in the index
  metadata (dims, dtype) so the runtime query embedder produces a
  compatible vector.
- The `USAGE` block's `rest search` line is unchanged (the command surface
  is the same; the leg is internal).

## Acceptance criteria

- `node aura.mjs rest search "set my capacity commitment"` with an
  embedding provider configured ranks `updateTaskMemberCapacity` in the top
  results, and the rationale notes the semantic leg matched.
- The same search with **no** embedding provider configured returns the
  capacity op via FTS-only and prints the `semantic leg skipped (no
  embedding provider)` note (slice 3's AC, now exercised for real).
- A search whose runtime query embedding model **differs** from the
  index's recorded model skips the semantic leg with a warning naming both
  models and returns FTS-only results — **no silent cross-model cosine
  comparison**.
- The build inlines metadata + FTS + vectors into `aura.mjs` within the
  size budget; the build assertion fails loudly if the combined blob
  exceeds the budget.
- The inlined index records its `embedModelId` and vector representation
  (dims, dtype); the runtime query embedder honors `dtype` (e.g. int8
  query vector for an int8 index).
- `task build` (with `gen-rest-index` including the embedding step)
  succeeds when a provider is configured; when no provider is configured at
  build time, the build emits an index with **no vectors** (vectors
  omitted, `embedModelId: null`) and the CLI runs FTS-only at runtime
  (build does not fail — the semantic leg is opt-in).
- `task typecheck` + the full test suite pass.

## Test plan

### Seams (test only at these)
- `createEmbedProvider(config)` → provider or `null` (mock the config +
  the HTTP call; assert `null` when absent, a provider when present).
- The index builder's embedding step `buildSemanticVectors(ops, provider)`
  → vectors + `embedModelId` (provider mocked to deterministic vectors;
  assert dims + model id recorded). When provider is `null` → no vectors,
  `embedModelId: null`.
- `cosineRank(queryVec, opVecs)` → ranked ids + scores (pure; fixture
  vectors).
- `rrfMerge([semanticRanking, ftsRanking])` → fused ranking (pure; fixture
  rankings; assert RRF math with k≈60, and that `RRF(FTS)=FTS` when semantic
  absent).
- The model-id guard: index built with model A, runtime provider model B
  → semantic leg skipped with a warning string (assert the warning + that
  no cosine is computed).
- `rest search` → stdout + rationale (provider + fetch mocked; assert
  semantic-leg rationale when provider present, fallback note when
  absent, warning when model mismatched).

### Failure modes / edge cases
- No provider at build → index with no vectors, `embedModelId: null`;
  runtime search is FTS-only with the note (build does not fail).
- No provider at runtime, but index has vectors (built elsewhere with a
  provider) → FTS-only with the note.
- Model mismatch (build model ≠ runtime model) → warning + FTS-only, no
  cosine.
- Provider HTTP error at runtime (query embed fails) → degrade to FTS-only
  with a one-line warning (do not hard-fail the whole search).
- Provider HTTP error at build (op embed fails) → build fails loudly
  naming the operation + the error (build-time, so loud is correct).
- Vectors exceed the size budget → build fails with actual size + hints
  (lower-dim model / quantize / prune).
- Quantized index (int8) + a query vector produced as float32 → mismatch
  caught and the query vector is quantized to match (or the leg is
  skipped with a warning, per the dtype guard).

### Scenarios
- "set my capacity commitment" with provider → capacity op top-3,
  rationale notes semantic leg.
- "commit allocation" (vocabulary mismatch with the user's phrasing) →
  still surfaces the capacity op via the semantic leg where FTS alone
  might miss it.
- Model mismatch → warning + FTS-only, no crash.

## Constraints and dependencies

- **Build-time embedding requires a provider** but the build must not
  *fail* when one is absent — it emits a no-vectors index (FTS-only is a
  valid, shipped configuration). The build only fails when a provider IS
  configured and the embedding call fails, or when vectors blow the budget.
- **One embedding call at runtime** (the query) — cheap. Op vectors are
  precomputed at build. Do not re-embed ops at runtime.
- **Vector representation is decided here:** low-dim (≤384) float32 OR
  int8-quantized larger model, chosen to fit the budget. Record `dims` +
  `dtype` in the index. The runtime query embedder must produce a
  compatible vector (quantize the query if the index is int8). This is the
  slice that resolves the task's "size reality check" (1536-d float32 ≈
  1.68 MB for 273 ops — already at/over a 2 MB budget before metadata; the
  slice picks a representation that fits and proves it with the assertion).
- **Model-id guard over silent mismatch:** correctness over convenience;
  never silently compare vectors from different models.
- Reuse the slice-3 FTS index, RRF stub (now real two-leg merge), code-side
  tags, size assertion, and inlining mechanism. This slice only **adds**
  the semantic leg; it does not change the FTS leg's contract.
- Do NOT add a local ONNX embedding model or bundle weights (out of scope;
  would blow the budget). Embeddings come from a configured provider only.
- Do NOT change `rest list`/`describe`/`call` (they are metadata-only; the
  semantic leg is search-internal).
