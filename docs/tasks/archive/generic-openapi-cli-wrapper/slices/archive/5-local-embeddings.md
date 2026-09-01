---
kind: slice
slug: 5-local-embeddings
title: Always-on local embeddings (transformers.js) replace the opt-in cloud seam as the default
task: ../task.md
mode: afk
status: done
size: l
blocked_by: []
---

## End-to-end behavior

`rest search` runs its **semantic leg by default, always on, with no
configuration** — using a **local, CPU-only** embedding model that the CLI
**auto-fetches** from Hugging Face on first use into a local cache. No cloud
API is called per query, no API key is required, no GPU is needed. The
motivating vocabulary-mismatch case from the task body — `rest search "commit
allocation"` surfacing `updateTaskMemberCapacity` (whose spec summary reads
"Set member capacity commitment") — now works out of the box, because the
semantic leg matches *intent*, not terms.

This reverses slice 4's design where the semantic leg was **opt-in** (only
active when `aura.embed.*` was configured) and **cloud-only** (OpenAI-style
`/v1/embeddings`), and where the shipped index carried `vectors: null,
embedModelId: null` because no provider was configured in the build
environment — leaving the feature inert for anyone who installed the CLI.
Slice 4 built the embedding *seam* and the cosine/RRF plumbing correctly; this
slice swaps the default provider behind that seam from "cloud, opt-in,
inert-when-unconfigured" to "local, always-on, auto-fetched".

Done looks like:

- A fresh checkout, `task build`, then `node aura.mjs rest search "commit
  allocation"` (no `aura.embed.*` settings, no env vars) ranks
  `updateTaskMemberCapacity` in the top results with the rationale noting the
  **semantic** leg matched — on the first run the model downloads to
  `~/.pi/aura/huggingface` (one-time), and subsequent runs use the cache.
- The committed, inlined `REST_INDEX` ships with **real op-vectors** +
  `embedModelId: "Xenova/multilingual-e5-small"` (the build embeds all 273
  ops via the local provider), so the semantic leg is active even before the
  query is embedded — the query is the only runtime embed call.
- The model is **multilingual (English + German)** and higher quality than
  MiniLM-L6-v2: `Xenova/multilingual-e5-small` (384-dim, ~118 MB quantized
  ONNX, CPU-only via `@huggingface/transformers` + `onnxruntime-node`).
- `createEmbedProvider()` returns the **local provider by default** (no
  settings needed). `aura.embed.*` becomes an **optional override** to use a
  cloud provider instead — it is no longer the *enable switch* for the
  semantic leg. The model-id guard now reads "index built with the local
  model, runtime uses the local model → match → semantic runs" by default.
- The model weights are **never inlined** into `aura.mjs`; they live in the
  local cache. Only the 273 op-vectors (384-dim × int8 × 273 ≈ 0.13 MB) are
  inlined, so the size-budget assertion (3 MB) still holds.

## User story

As an agent (or developer) running `rest search` for a REST operation whose
summary is in English or German but whose concept I'd phrase differently, I
want the semantic leg to just work — no API key, no cloud, no configuration,
no GPU — so "commit allocation" finds "Set member capacity commitment" and
"Kapazität zuweisen" finds the same op, out of the box.

## Scope

### In scope

- A **`LocalEmbedProvider`** (in `@pi-aura/shared/embed`, e.g.
  `local-provider.ts`) implementing the existing `EmbedProvider` interface
  (`modelId` + `embed(texts): Promise<Float32Array[]>`), backed by
  `@huggingface/transformers` `pipeline("feature-extraction", ...)`.
  - Model: `Xenova/multilingual-e5-small` (384-dim, multilingual EN+DE).
  - Lazy singleton pipeline (load on first `embed` call; cache the instance).
  - **E5 query/passage prefix convention**: prefix the query with `"query: "`
    and the build-time op texts with `"passage: "` (E5 retrieval requires this
    for best quality). Bake this into the provider's call sites (the build
    embeds `passage:`-prefixed op text; the runtime query embed embeds a
    `query:`-prefixed query) so callers don't have to remember.
  - Mean-pool the `feature-extraction` output (last_hidden_state → mean over
    tokens), L2-normalize, return `Float32Array[]`.
  - Set the transformers.js `env.cacheDir` to `~/.pi/aura/huggingface` (the dir
    already exists) so the model auto-downloads there on first use.
  - `modelId` = `"Xenova/multilingual-e5-small"` (matches the build-time
    recorded id so the runtime guard passes by default).
- **`createEmbedProvider()` default flip**: return the `LocalEmbedProvider`
  by default (no config). `aura.embed.*` settings (provider/model/apiKey/baseURL
  + `AURA_EMBED_*` env) become an **optional override** to use a cloud provider
  instead — when `aura.embed.provider` is set, honor it (cloud path from slice
  4); otherwise return the local provider. `null` is still a valid return only
  when the local provider fails to initialize in a way the caller should
  degrade from (see graceful fallback).
- **`gen-rest-index` build embeds ops via the local provider by default**:
  `genRestIndex()` constructs the local provider (no settings needed), embeds
  all 273 op texts (`passage:`-prefixed), and the committed `REST_INDEX` ships
  with real `vectors` + `embedModelId: "Xenova/multilingual-e5-small"`. The
  build is async and does a **one-time model download** (cached in
  `~/.pi/aura/huggingface`) — subsequent builds use the cache. The build must
  not require network on every run (cache hit after first download).
- **`restSearch` uses the inlined vectors + local query embed by default**:
  the `case "search"` path constructs the local provider (or uses the override)
  and runs the semantic leg when the runtime provider's modelId matches the
  index's `embedModelId` (true by default). The "no provider" fallback note
  ("semantic leg skipped (no embedding provider)") now only fires when the
  local provider genuinely fails to initialize — not on a normal install.
- **esbuild externals**: mark `@huggingface/transformers` and its
  `onnxruntime-*` native-binding deps `external` in
  `scripts/esbuild.config.mjs` (the repo already does this for
  `@napi-rs/keyring` / `dbus-next` — same native-binding pattern), so Node
  resolves them from `node_modules` at runtime. Add `@huggingface/transformers`
  + `onnxruntime-node` to `scripts/package.json` dependencies (and
  `@pi-aura/shared` if the provider lives there).
- **Graceful fallback preserved**: if the local provider fails at runtime
  (e.g. model download blocked, ONNX runtime missing), `rest search` degrades
  to FTS-only with a one-line actionable note (do NOT hard-fail the whole
  search). If the local provider fails at **build** time, the build fails
  loudly (build-time, so loud is correct) with the error + a hint to check
  network/cache.
- **Enablement docs**: a short note in the `aura` skill (and/or
  `resources/rest-api.md`) that the semantic leg is on by default via a local
  model that auto-caches to `~/.pi/aura/huggingface` on first use, and that
  `aura.embed.*` can override it with a cloud provider if desired.
- Tests for: the local provider (mocked `pipeline`/transformers — do not
  download a real model in unit tests; assert modelId, prefixing, mean-pool,
  cacheDir), `createEmbedProvider` default-flip (local by default; cloud when
  configured), the build embedding path (mocked provider → real vectors +
  modelId recorded), and `restSearch` always-on semantic leg (mocked provider
  → semantic ranking via RRF with the inlined vectors; the motivating
  "commit allocation" → capacity op case against a fixture).

### Out of scope

- Bundling the model weights into `aura.mjs` or the repo (they auto-download
  to the local cache; never inlined).
- A GPU code path (CPU-only is the decision; ONNX runtime CPU).
- Supporting more than one local model (one curated default; cloud override
  covers "I want a different model").
- Changing the FTS leg, `rrfMerge`, `cosineRank`, the `RestIndexBlob` shape,
  or the model-id guard logic (those are correct from slices 3–4; this slice
  only changes the *default provider* and the *build-time embedding step*).
- Removing the cloud provider — it stays as an opt-in override.

## Acceptance criteria

- `node aura.mjs rest search "commit allocation"` (no `aura.embed.*`, no env)
  ranks `updateTaskMemberCapacity` in the top results, and the rationale
  notes the **semantic** leg matched — on a clean cache the first run
  downloads the model to `~/.pi/aura/huggingface`, and a second run uses the
  cache (no network).
- `node aura.mjs rest search "Kapazität zuweisen"` (German query) also ranks
  `updateTaskMemberCapacity` highly (multilingual model).
- The committed `scripts/src/generated/rest-index.ts` ships with
  `embedModelId: "Xenova/multilingual-e5-small"` and a non-null `vectors`
  array (273 entries, 384-dim) — verified by inspecting the generated file.
- The inlined index stays under the 3 MB size budget (op-vectors ~0.13 MB +
  existing metadata/FTS); `task build` asserts it and passes.
- `createEmbedProvider()` with no settings returns a provider whose
  `modelId === "Xenova/multilingual-e5-small"` (the local default); with
  `aura.embed.provider` set, returns the cloud provider.
- The model-id guard passes by default (index built with the local model =
  runtime local model → semantic runs); `rest search` no longer prints the
  "semantic leg skipped (no embedding provider)" note on a normal install.
- If the local provider fails at runtime (simulated), `rest search` degrades
  to FTS-only with an actionable one-line note (no hard-fail, no crash).
- `@huggingface/transformers` + `onnxruntime-node` are `external` in
  `scripts/esbuild.config.mjs`; `task build` succeeds (bundle does not try to
  inline the native binding).
- The `aura` skill (or `resources/rest-api.md`) documents that the semantic
  leg is on by default via a local auto-cached model.
- `task typecheck` + the full test suite pass; the build does not require
  network on a cache hit.

## Existing abstractions to use

- `EmbedProvider` interface + `createEmbedProvider` (slice 4,
  `packages/shared/src/embed/provider.ts`) — the seam this slice re-defaults.
- `buildSemanticVectors` / `buildRestIndexAsync` (slice 4,
  `scripts/src/gen-rest-index.ts`) — the build-time embed step; wire the local
  provider in as the default `embedFn`/provider.
- `cosineRank` / `rrfMerge` / `bm25Search` (slices 3–4) — unchanged.
- `restSearch` (slice 4, `scripts/src/rest-search.ts`) — the model-id guard
  and RRF merge are correct; only the provider construction flips to local.
- `scripts/esbuild.config.mjs` `external` list — add the new native-binding
  deps (same pattern as `@napi-rs/keyring`).
- `~/.pi/aura/huggingface` — existing cache dir; point transformers.js
  `env.cacheDir` here.

## Architecture / domain decisions

- **Always-on, not opt-in.** The semantic leg is the whole point of the
  search; shipping it inert defeated the task's motivating example. Local
  embeddings remove the configuration barrier.
- **Local, not cloud.** A cloud API per query is a privacy/dependency/cost
  barrier and requires a key; a local CPU model removes all three. The model
  auto-downloads once and caches.
- **Auto-fetch, not bundled.** The ~118 MB model weights download to
  `~/.pi/aura/huggingface` on first use, never inlined into `aura.mjs`. This
  resolves the task's original "out of scope: bundling a local embedding
  model… would exceed the size budget" objection — the weights are not in the
  bundle, only the tiny op-vectors are.
- **`@huggingface/transformers` + `onnxruntime-node` as real runtime deps.**
  Marked `external` in esbuild (native binding, like the keyring). The `aura`
  skill is no longer a fully self-contained single `.mjs` — it needs these
  installed in `node_modules`. This is the necessary tradeoff for local
  embeddings and was approved by the user.
- **`Xenova/multilingual-e5-small`** — 384-dim, EN+DE, ~118 MB quantized,
  CPU-only, higher quality than MiniLM-L6-v2. E5 requires `query:`/`passage:`
  prefixes for best retrieval; baked into the provider.
- **Cloud stays as an override.** `aura.embed.*` flips to a cloud provider;
  it's no longer the enable switch. The model-id guard still prevents silent
  cross-model cosine (a cloud override with a different model still skips the
  semantic leg with a warning).
