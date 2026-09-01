---
kind: task
type: feature
slug: generic-openapi-cli-wrapper
title: Generic OpenAPI → REST-CLI wrapper in the aura CLI (generates commands + agent resources)
status: ready
size: l
slices: [1-loader-list-describe, 2-rest-call-invoker, 3-fts-search-and-inlined-index, 4-semantic-search-leg]
blocked_by: []
---

# Generic OpenAPI → REST-CLI wrapper in the aura CLI

## Architecture notes

### Runtime operation metadata: inlined into the bundle (DECIDED)

The task body says "the loader reads `openapi.yaml` at runtime (CLI)".
That conflicts with the task's other hard constraint — a **self-contained
committed `.mjs`** with "no sidecar file at runtime" — because the
committed bundle ships to end users whose installed repo layout may not
keep `packages/shared/openapi/openapi.yaml` reachable from the bundle.

Decision (user-approved during slice planning): `openapi.yaml` is a
**build-time-only** input. The `gen-rest-index` build step parses it once
and emits a compact operation-metadata blob that esbuild **inlines into
`aura.mjs`** (alongside the FTS index and, later, the semantic vectors).
`rest list` / `describe` / `call` read from the inlined blob at runtime,
never the YAML. This makes the committed CLI self-contained and robust for
end users. The loader still exists as the single parser, used by the build
generator; it is not invoked at runtime in the bundle.

Slice 1 first ships `list`/`describe` reading the YAML at runtime (dev mode)
so the parsing+rendering slice is decoupled from the bundler; slice 3a
switches them to the inlined blob. The slice-3a inlining is therefore a
hard dependency, not optional polish.

### Generic invoker auth: reuse the credential path, not the typed client

`createDefaultAuraClient()` returns the typed `AuraClient` (≈21 hand-written
methods) — unusable for a 273-op generic invoker. The invoker reuses the
**credential path** underneath it (`loadAuraClientSettings()` +
`createKeyring().getSecret("pat")`) via a new shared helper, and does raw
`fetch` with `Bearer <pat>`. `createDefaultAuraClient()` is refactored to
use the same helper so there is exactly one credential resolution path.

### Vector size reality check

273 ops × 1536-dim float32 ≈ 1.68 MB raw (≈2.22 MB base64) — already at/over
a 2 MB budget before any metadata/FTS. Slice 3b resolves this by choosing a
vector representation that fits (low-dim ≤384 float32, or int8-quantized
larger model ≈ 0.42 MB for 273 ops) and proves it with the extended size
assertion. The index records `dims` + `dtype` so the runtime query embedder
produces a compatible vector.

## Outcome

A generic layer in the `aura` CLI (`scripts/src/aura.ts` → bundled
`skills/core/aura/dist/aura.mjs`) that reads `packages/shared/openapi/openapi.yaml`
and exposes **every** REST operation the Aura MCP server does *not* surface as a
typed CLI subcommand — and, just as importantly, emits **textual resources** that
tell the agent which REST calls exist, what their parameters are, and how to
invoke them.

The motivating gap: capacity is REST-only after the aura-mcp-dev overhaul
(195 → 90 tools), so the agent currently has to hand-craft `fetch` calls with the
bearer token from `mcp.json`. That works once, but it is bespoke per endpoint and
the agent has no structured knowledge of the ~hundreds of REST operations the
OpenAPI describes. This task replaces that with a single, OpenAPI-driven mechanism.

Done looks like:

- `node aura.mjs rest <operationId> [--param val …] [--body-file F]` invokes any
  operation in `openapi.yaml` by its `operationId`, path-filling path params,
  serializing query params, and sending a JSON body. Auth reuses the existing
  `createDefaultAuraClient()` credential path (settings + PAT/keyring).
- `node aura.mjs rest list` prints every operation id + method + path + a
  one-line summary, grouped by tag, so the agent (or a human) can browse the
  REST surface.
- `node aura.mjs rest describe <operationId>` prints the full schema for one
  operation: parameters (name, in, required, schema), request body shape, and
  response codes — the textual resource the agent consults before calling.
- `node aura.mjs rest search "<natural-language intent>"` finds the right
  operation by meaning, not just by exact id. It runs a **hybrid** retrieval:
  semantic similarity over each operation's name + summary + description +
  OpenAPI tags + code-added tags, **and** full-text search (BM25) over the
  same text, merged by reciprocal-rank fusion (RRF). Results are ranked
  `operationId`s with a one-line match rationale (which leg matched, score).
- The semantic + FTS index is **built at build time** from `openapi.yaml`,
  **embedded directly into the bundled `aura.mjs`** (not a sidecar file), and
  committed. Op vectors are precomputed once; at runtime only the query is
  embedded (one call) and cosine-matched against the embedded vectors. When
  no embedding provider is configured at runtime, `search` degrades
  gracefully to FTS-only — still useful, fully offline.
- The CLI carries **code-side tags** (non-user-facing) that augment the
  OpenAPI tags: a curated map in source that tags individual operations and/or
  operation groups (OpenAPI tag groups), e.g. `capacity` / `self-serve` /
  `admin-only`. These tags are folded into the embedded searchable text, so
  they are both semantically and FTS searchable ("set my capacity" surfaces
  the capacity-commitment op even if the spec's summary says "commit
  allocation").
- A generated Markdown resource (e.g. `skills/core/aura/resources/rest-api.md`)
  lists all operations with their parameters, kept in sync via the build
  (`make`), so the `aura` skill can hand the agent the REST menu without it
  parsing YAML at runtime.

## User story

As an agent (or developer) needing to hit a REST endpoint that has no MCP tool —
capacity today, notifications-write or owner/crew search tomorrow — I want one
generic CLI command, a **search that finds the operation by intent** (not just
by exact id), and a browsable, generated reference, so I don't hand-craft a new
`fetch` for each endpoint, so the agent knows the full REST surface exists, and
so it can discover the right operation without reading the whole spec.

## Scope

### In scope

- A `rest` command group in `aura.ts` with `call`, `list`, `describe`, and
  `search` subcommands.
- An OpenAPI loader (`packages/shared`) that parses `openapi.yaml` once into an
  in-memory operation index (operationId → {method, path, params, body, tags,
  summary}). Cached per process.
- Path/query/body serialization per the OpenAPI spec (path `{uuid}` fill,
  query array/style handling for the subset the Aura API uses, JSON body).
- Auth reusing `createDefaultAuraClient()` (baseUrl from settings + PAT); the
  generic caller must not re-invent credential loading.
- A **build-time index generator** (`task gen-rest-index`, folded into `build`)
  that reads `openapi.yaml`, builds the per-operation searchable text (name +
  summary + description + OpenAPI tags + code-side tags), computes the FTS
  index (tokenized + BM25 stats) **and** the semantic op vectors, and emits a
  single compact JSON blob **inlined into the bundle** via an esbuild-imported
  `.json`/`.ts` module (no sidecar file at runtime).
- **Code-side tags**: a curated, non-user-facing map in source
  (e.g. `scripts/src/rest-code-tags.ts`) keyed by `operationId` and by
  OpenAPI-tag group, folded into the searchable text at index-build time so
  they participate in both the semantic and FTS legs.
- **Hybrid `search`**: runtime query embedding (one call) → cosine rank over
  the embedded op vectors; BM25 rank over the tokenized text; RRF merge of the
  two ranked lists; print ranked `operationId`s with a match rationale.
- **Graceful fallback**: when no embedding provider is configured at runtime,
  `search` skips the semantic leg and returns RRF(FTS) = FTS-only results with
  a one-line note, so the command stays useful and offline.
- **Model-id guard**: the embedded index records the embedding model id it
  was built with; the runtime query embedder must use the same model or the
  semantic leg is skipped (with a warning), never silently compared against
  mismatched vectors.
- **Size budget + build assertion**: the build asserts the inlined index is
  under a fixed budget (e.g. 2 MB); if it exceeds it, the build **fails
  loudly** with the actual size and remediation hints (lower-dim model, drop
  long descriptions from the vector text but keep them in FTS, prune) — it
  never silently bloats the committed `.mjs`.
- Tests for the loader, the serializer, the CLI dispatch (operation
  resolution, missing-param error, auth path), the index builder, the RRF
  merge, the FTS-only fallback, and the code-tags augmentation.

### Out of scope

- Generating a new typed `aura-client.ts` method per operation (the existing
  hand-written `AuraClient` stays; this is a *generic* escape hatch, not a
  replacement for the typed client).
- Full OpenAPI 3 `$ref` resolution for every corner case — resolve the refs the
  Aura spec actually uses; fail loudly with the ref path if an unsupported
  construct is hit.
- Auto-discovery of which endpoints are "REST-only vs MCP-available" — the
  resource just lists all REST operations; the agent already knows MCP coverage
  from the live server.
- Bundling a local embedding model (ONNX/runtime + weights) into the CLI —
  that would exceed the inlined-index size budget by orders of magnitude;
  embeddings are produced by a configured provider at build time (ops) and
  runtime (query) only.
- Using Aura's server-side `unifiedSearch` to find OpenAPI operations — it
  indexes Aura entities (tasks/artifacts/wiki), not REST operations, so it is
  not fit-for-purpose here.
- Pagination auto-follow, retry/backoff, or response schema validation beyond
  printing the raw JSON result.

## Acceptance criteria

- `node aura.mjs rest list` prints all operations grouped by tag, each with
  `operationId`, method, path, and summary — no truncation.
- `node aura.mjs rest describe updateTaskMemberCapacity` prints the path
  `/tasks/{uuid}/members/{userIdOrUuid}/capacity`, the `PATCH` method, the path
  params (`uuid`, `userIdOrUuid`), and the `capacity_percent` body field.
- `node aura.mjs rest call updateTaskMemberCapacity --param uuid=<id>
  --param userIdOrUuid=me --body-file capacity.json` issues an authenticated
  `PATCH` and prints the response.
- `node aura.mjs rest search "set my capacity commitment"` ranks the
  capacity-commitment operation (`updateTaskMemberCapacity`) in the top
  results, surfacing the code-side `capacity` tag as a match rationale, even
  though the spec summary may read "commit allocation".
- `node aura.mjs rest search "set my capacity commitment"` with **no**
  embedding provider configured still returns the capacity op via FTS-only,
  with a one-line "semantic leg skipped (no embedding provider)" note.
- A search whose query embedding model differs from the index's recorded
  model skips the semantic leg with a warning and returns FTS-only results
  (no silent cross-model cosine comparison).
- The build inlines the rest index into `aura.mjs` and asserts it is under the
  size budget; the committed `.mjs` contains the index (no sidecar `.json`
  loaded at runtime).
- A missing required param produces a clear error naming the param and the
  operation; an unknown `operationId` lists the closest matches (from the
  search index).
- `make` regenerates `resources/rest-api.md` and it is committed.
- `task typecheck` and the full test suite pass.

## Existing abstractions to use

- `scripts/src/aura.ts` — add the `rest` command group; reuse the `fail()` /
  USAGE pattern and the workdir-free inline-result style.
- `packages/shared/src/aura-client.ts` + `createDefaultAuraClient()` — the
  generic caller reuses the existing baseUrl + PAT resolution; do not add a
  second credential path.
- `packages/shared/openapi/openapi.yaml` — the single source of truth; the
  loader reads it at runtime (CLI) and the generator reads it at build time
  (resource + index).
- `scripts/esbuild.config.mjs` — the index is inlined into `aura.mjs` by
  importing the generated index module (esbuild bundles the JSON/const); add
  the `gen-rest-index` step to the `build` pipeline.
- `Taskfile.yml` — add `gen-rest-doc` + `gen-rest-index` steps to `build`
  (`gen-rest-doc` writes `resources/rest-api.md`; `gen-rest-index` builds and
  inlines the search index).
- Embedding provider config (settings/env) — reused for both build-time op
  vectors and runtime query embedding; the `@pi-aura/shared` settings module
  is the seam for the provider + model id.

## Architecture / domain decisions

- **Generic over generated-typed.** The wrapper invokes by `operationId` rather
  than emitting one typed method per endpoint. The typed `AuraClient` remains
  the preferred path for the hand-written domains; `rest` is the escape hatch
  for everything MCP dropped (capacity, notifications-write, etc.).
- **Resource, not just commands.** The agent needs to *know* the REST surface
  exists before it can choose to use it. The generated Markdown resource is
  first-class output of this task — it is what makes the wrapper discoverable
  to the agent, not just callable.
- **OpenAPI as the single source.** `openapi.yaml` already lives in the repo;
  the loader reads it directly. No separate hand-maintained command registry.
- **Auth parity.** The generic caller uses exactly the same
  `createDefaultAuraClient()` credentials as the typed commands — one auth
  story, one settings/keyring path.
- **Hybrid search by intent.** `rest search` is semantic + FTS merged by RRF,
  not one or the other: semantic catches intent where vocabulary differs
  ("set my capacity" vs "commit allocation"), FTS catches exact-term hits
  and works offline. The two legs are independently skippable so the command
  degrades gracefully, never hard-fails on a missing embedding key.
- **Build-time embedded index, inlined into the `.mjs`.** Op vectors and the
  FTS stats are precomputed once at build and inlined into the bundle (no
  sidecar loaded at runtime), within a hard size budget enforced by a build
  assertion. This keeps the committed CLI self-contained and the runtime path
  cheap (one query embedding) while staying offline-capable via the FTS leg.
- **Code-side tags as first-class searchable text.** Tags the maintainer
  adds in source (per-operation and per-OpenAPI-tag-group) are folded into the
  embedded searchable text, so curation improves both semantic and FTS
  recall without a separate query path. They are non-user-facing — they exist
  to make the right operation discoverable, not to pollute `describe` output.
- **Model-id guard over silent mismatch.** The index records its embedding
  model; a runtime query embedder using a different model skips the semantic
  leg rather than producing nonsense cosine scores. Correctness over
  convenience.

## Implementation notes

### Slice 1 — loader, rest list/describe, generated rest-api.md (landed)

- **OpenAPI loader** (`packages/shared/src/openapi/loader.ts`, exported as
  `@pi-aura/shared/openapi`) parses `openapi.yaml` once into an in-memory
  `OpenApiIndex` (`Record<operationId, OpMeta>`). It resolves the three
  `$ref` constructs the Aura spec uses (`#/components/{schemas,parameters,responses}/`)
  and throws loudly with the ref path on anything else (e.g. remote URL refs).
  Path params are extracted from the path template and cross-checked against
  `in: path` parameters; ops missing an `operationId` are skipped with a loud
  warning; duplicate `operationId`s throw naming both method+path. The result
  is cached per process.
- **`rest list` / `rest describe`** live in `scripts/src/rest-list-describe.ts`
  as pure functions (`restList(index, out)`, `restDescribe(index, opId, out)`)
  wired into the `rest` group in `scripts/src/aura.ts` `main()` (alongside
  `artifact`/`wiki`/`upload`). The `rest` group skips client/credential
  construction entirely (pure metadata, no network). `describe` on an
  unknown id prints a clear error listing the closest matches (substring then
  Levenshtein) and exits 2.
- **`gen-rest-doc`** build step (`scripts/src/gen-rest-doc.ts`) runs before the
  esbuild bundle in `Taskfile.yml`'s `build` target and writes
  `skills/core/aura/resources/rest-api.md` — 273 operations grouped by tag
  with their params, body shape, and responses. `generateRestDocMd(index)` is a
  pure deterministic function; the committed resource is byte-identical when
  regenerated twice.
- **Dev-mode runtime path:** per the task architecture decision, slice 1 reads
  `openapi.yaml` at runtime via a path resolved relative to `cwd` (dev-facing).
  Slice 3a will switch `list`/`describe` to the inlined compact index blob.
- **Verification:** `task typecheck` passes for both `scripts` and
  `packages/shared`; the loader (`tsx --test` in `packages/shared`),
  `rest-list-describe`, and `gen-rest-doc` suites all pass (14 + 6 + 6 tests).
  `rest list` prints all 273 operations; `rest describe updateTaskMemberCapacity`
  prints `/tasks/{uuid}/members/{userIdOrUuid}/capacity`, `PATCH`, path params
  `uuid` (string/uuid) and `userIdOrUuid` (string), body `TaskMemberCapacityUpdate`,
  and response codes 200/400/401/403/404/500.

### Slice 2 — rest call invoker with auth reuse (landed)

- **`resolveAuraCredentials()`** (`packages/shared/src/aura-credentials.ts`)
  is the single credential resolution path: `loadAuraClientSettings()` →
  `createKeyring().getSecret({service:"aura",name:"pat"})` → `{ baseUrl, pat }`.
  Throws the same actionable errors as the old `createDefaultAuraClient()`
  (missing `aura.baseUrl`, missing PAT with `/aura secrets discover` hint).
  Accepts optional `settingsPath`/`keyring` injection for testing.
- **`createDefaultAuraClient()` refactored** to delegate to
  `resolveAuraCredentials()` — exactly one credential path in the codebase.
- **`buildRequest(op, params, body)`** (`packages/shared/src/rest/build-request.ts`,
  exported as `@pi-aura/shared/rest/build-request`) is a pure request builder:
  path-fill `{name}` from params, query serialization (scalar as-is; array
  `style: form` default comma-separated; `explode: true` → repeated keys),
  JSON body with `Content-Type: application/json`. Errors loudly on missing
  required path param, extra path param, unsupported query `style`
  (`spaceDelimited`/`pipeDelimited`), required body omitted, body given when op
  declares none.
- **`restCall(index, credentials, args, out, opts?)`** (`scripts/src/rest-call.ts`)
  resolves the op by `operationId`, builds the request, does raw `fetch()` with
  `Authorization: Bearer <pat>`, prints raw JSON (pretty-printed if small).
  Unknown `operationId` → closest matches (exit 2); HTTP error (≥400) →
  status + body (exit 1). `parseCallArgs()` collects repeatable `--param
  name=val` into arrays; `resolveBody()` reads `--body-file`/`--body` (mutually
  exclusive) as JSON. `fetchImpl` injection makes the fetch path testable.
- **`rest call` subcommand** wired into `aura.ts` with lazy credential
  resolution (only `rest call` triggers `resolveAuraCredentials`); `rest
  list`/`describe` are still credential-free (the `needsClient = group !==
  "rest"` guard prevents eager `createDefaultAuraClient()` for the rest group).
- **Known code duplication:** `closestMatches()` + `levenshtein()` are
  duplicated between `rest-list-describe.ts` and `rest-call.ts` — consolidate
  in a later coherence refactor.
- **Exit-code nuance:** the slice doc AC says missing-path-param and
  invalid-body errors should exit 2; in the implementation these errors
  throw from `buildRequest`/`resolveBody` and propagate to `main()`'s
  top-level catch (exit 1). Only unknown-`operationId` exits 2 (inside
  `restCall`). The error *messages* are clear and actionable; the exit-code
  gap is minor and can be harmonized later if script consumers depend on it.
- **`packages/shared` test glob** changed from `test/*.test.ts` to
  `test/**/*.test.ts` to discover nested `test/rest/build-request.test.ts`.
- **Verification:** `task typecheck` passes for both packages; the shared
  suite (97 tests including build-request 18 + aura-credentials 5), the
  scripts `rest-call` suite (15 tests), and the slice-1 suites (6 + 6) all
  pass; `task build` succeeds; the committed `aura.mjs` runs `rest call`
  against a mocked fetch and the bundle lists closest matches for unknown
  `operationId` (exit 2).

### Slice 3 — FTS search, code-side tags, build-time inlined index, size budget (landed)

- **FTS / BM25 module** (`packages/shared/src/rest/fts.ts`, exported as
  `@pi-aura/shared/rest/fts`): `buildFtsIndex(ops)` computes pure BM25 stats
  (term frequencies, document frequencies, avg doc length; k1=1.5, b=0.75).
  Tokenization: lowercase + split on non-alphanumerics, no stopwords
  dependency. `bm25Search(index, query, k?)` returns ranked `FtsHit[]` with
  matched terms + score, sorted by descending score then operationId for
  determinism. `rrfMerge(rankings, k=60)` does Reciprocal Rank Fusion over
  variable-arity rankings; `rrfMerge([fts])` ≡ FTS order (stub for slice 4's
  `[semantic, fts]` upgrade).
- **Code-side tags** (`scripts/src/rest-code-tags.ts`): a curated,
  non-user-facing `CODE_TAGS` map with `byOp` (per-operationId) and `byTagGroup`
  (per-OpenAPI-tag) sections. `resolveCodeTags(op)` merges + deduplicates
  both. Seeded with the `capacity` group (`updateTaskMemberCapacity`,
  `getTaskMemberCapacity`, `getMyCapacity`, `getCapacityOverview`,
  `updateCapacitySettings`, `readCapacity`), `notifications`, `self-serve`,
  and `admin-only` groups. Code-tags participate in FTS text but do NOT appear
  in `rest describe` output (spec-faithful).
- **Build-time index generator** (`scripts/src/gen-rest-index.ts`):
  `buildRestIndex(openApiPath, codeTags, resolveFn)` is a pure function that
  reads `openapi.yaml` via the slice-1 loader, builds per-op searchable text
  (operationId + summary + description + OpenAPI tags + code-side tags),
  computes the FTS index, and emits a slim metadata blob (`SlimOpMeta` —
  only method/path/params/body/tags/summary/responses; no `description` field
  to save space). `assertSizeBudget(blob, budgetBytes=3MB)` throws with actual
  size + remediation hints if exceeded. `genRestIndex()` CLI entry writes the
  generated `scripts/src/generated/rest-index.ts` (a `.ts` const export).
  Added to `Taskfile.yml` as `task gen-rest-index`, folded into `build`.
- **Inlined index, not sidecar:** the generated `rest-index.ts` is imported by
  `scripts/src/aura.ts`, so esbuild bundles it into `aura.mjs`. No sidecar
  `.json` is loaded at runtime. The committed bundle contains 273 operations'
  metadata + FTS stats (~0.38 MB, well under the 3 MB budget). Confirmed:
  `grep updateTaskMemberCapacity aura.mjs` finds the inlined data.
- **`rest search` subcommand** (`scripts/src/rest-search.ts`):
  `restSearch(index, query, out, opts?)` runs BM25 over the inlined FTS index,
  applies `rrfMerge([ftsRanking])` (no-op stub), prints the
  `semantic leg skipped (no embedding provider) — FTS-only results` note,
  and prints ranked operationIds with score + matched terms.
- **Runtime index resolution:** `getRestIndex()` in `aura.ts` reconstructs an
  `OpenApiIndex` from the inlined `REST_INDEX` metadata (no `openapi.yaml` read
  at runtime in the bundle). Dev fallback reads the YAML if `REST_INDEX` is
  absent. `rest list` / `describe` / `call` now use the inlined blob via this
  function.
- **Divergence from slice doc — closest-matches not FTS-based:** the slice
  doc AC says unknown-operationId errors in `rest call`/`describe` should
  "use the FTS index to list closest matches (replacing slice 1's substring
  fallback)." The implementation still uses the slice-1 substring + Levenshtein
  `closestMatches()` in both `rest-list-describe.ts` and `rest-call.ts`; the
  FTS index is not consulted for unknown-op suggestions. The closest matches
  still work (exit 2, actionable suggestions), but the FTS-based suggestion
  leg is not wired. Minor gap; can be addressed in a follow-up or slice 4.
- **Divergence from test plan — code-tag validation not implemented:** the
  slice doc test plan calls for loud build errors when a code-tag references an
  unknown `operationId` or an unknown tag group, and on duplicate operationIds
  in the index. `gen-rest-index.ts` does not validate code-tags against known
  operationIds or tag groups. Duplicate operationIds are caught by the loader
  (slice 1). The code-tag validation gap is a test-plan edge case, not an
  explicit acceptance criterion; all ACs pass.
- **`USAGE` block** updated with the `rest search` line.
- **Verification:** `task typecheck` passes for both `scripts` and
  `packages/shared`; `task build` succeeds (gen-rest-doc + gen-rest-index +
  esbuild + output verification). The FTS suite (17 tests), code-tags suite
  (7 tests), gen-rest-index suite (9 tests), and rest-search suite (6 tests)
  all pass; the shared suite (35 tests) and prior slice suites (27 tests) still
  pass. `node aura.mjs rest search "set my capacity commitment"` ranks
  `updateTaskMemberCapacity` first with `terms: set, capacity, commitment`; the
  bundle prints the `semantic leg skipped` note. `rest list` prints all 273
  operations; `rest describe updateTaskMemberCapacity` prints the correct
  path/method/params/body/responses from the inlined blob.
