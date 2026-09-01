---
kind: slice
slug: 3-fts-search-and-inlined-index
title: rest search (FTS-only), code-side tags, build-time inlined index, and the size budget
task: ../task.md
mode: afk
status: todo
size: l
blocked_by: [1-loader-list-describe]
---

## End-to-end behavior

The agent can find the right REST operation **by intent**, not just by
exact id, and works **fully offline**. `node aura.mjs rest search
"<natural-language intent>"` runs a **full-text (BM25)** retrieval over
every operation's searchable text — name + summary + description + OpenAPI
tags + **code-side tags** — and prints ranked `operationId`s with a
one-line match rationale. The FTS index is **built at build time** from
`openapi.yaml`, **inlined directly into the bundled `aura.mjs`** (no
sidecar file), and committed. The build **asserts the inlined index is
under a fixed size budget** and fails loudly if it exceeds it. When the
semantic leg (slice 4) is absent, `search` returns FTS-only results with a
one-line note — useful and offline.

This slice makes the REST surface *discoverable by meaning*: "set my
capacity commitment" surfaces `updateTaskMemberCapacity` even though the
spec summary reads "Set member capacity commitment", because the code-side
`capacity` tag participates in the FTS text.

## What this slice delivers

- **Code-side tags** (`scripts/src/rest-code-tags.ts`): a curated,
  non-user-facing map keyed by `operationId` and by OpenAPI-tag group, e.g.
  `capacity` / `self-serve` / `admin-only`. Folded into each operation's
  searchable text at index-build time so they participate in both FTS (this
  slice) and the semantic leg (slice 4). Seed it with at least the `capacity`
  group (so the AC's "set my capacity" search works) and a handful of
  obvious ones; it is extensible in source.
- A **build-time index generator** (`task gen-rest-index`, folded into
  `Taskfile.yml`'s `build`) that:
  - reads `openapi.yaml` via the slice-1 loader,
  - builds the per-operation searchable text (name + summary + description
    + OpenAPI tags + code-side tags),
  - computes the **FTS index** (tokenized lowercase, BM25 stats: term
    frequencies, document frequencies, avg doc length),
  - **also emits a compact operation-metadata blob** (the parsed index:
    method/path/params/body/tags/summary — the data `list`/`describe`/
    `call` need at runtime), so the bundled CLI is self-contained and does
    not read `openapi.yaml` at runtime (DECIDED — see task Architecture
    notes),
  - emits a single JSON module (e.g.
    `scripts/src/generated/rest-index.json` or a `.ts` const) that esbuild
    inlines into `aura.mjs`.
- **Inlining via esbuild import:** the generated index module is imported by
  `scripts/src/aura.ts` (or a `rest/` submodule) so esbuild bundles it into
  `aura.mjs`. **No sidecar `.json` is loaded at runtime.** The committed
  `.mjs` contains the index.
- A **size-budget build assertion:** the build asserts the inlined index is
  under a fixed budget (start at **3 MB** for the combined metadata + FTS
  blob — see decision below; the metadata blob is the bulk). If it exceeds
  the budget, the build **fails loudly** with the actual size and
  remediation hints (drop long descriptions from the FTS text but keep a
  truncated form in metadata, prune unused fields, reduce metadata
  granularity). It never silently bloats the committed `.mjs`.
- `rest list` / `rest describe` / `rest call` (slices 1–2) are switched to
  read from the inlined metadata blob instead of reading `openapi.yaml` at
  runtime, so the bundled CLI is self-contained. (In dev/source mode, the
  loader still reads the YAML for the generator; at runtime the bundle uses
  the inlined blob.)
- A **`rest search`** subcommand: tokenizes the query, ranks operations by
  BM25 over the inlined FTS index, prints ranked `operationId`s each with a
  one-line rationale (top matching terms + score). When no semantic leg is
  present (this slice), print a one-line note: `semantic leg skipped (no
  embedding provider) — FTS-only results`. The RRF merge machinery is
  stubbed here as `RRF(FTS) = FTS` so slice 4 only adds the semantic leg.
- Unknown `operationId` errors in `rest call`/`describe` now use the FTS
  index to list closest matches (replacing slice 1's substring fallback).
- The `USAGE` block gains the `rest search` line.

## Acceptance criteria

- `node aura.mjs rest search "set my capacity commitment"` ranks
  `updateTaskMemberCapacity` in the top results, and the rationale
  surfaces the code-side `capacity` tag as a match reason, even though the
  spec summary may read "Set member capacity commitment".
- `rest search "set my capacity commitment"` with **no** embedding provider
  configured returns the capacity op via FTS-only and prints the one-line
  `semantic leg skipped (no embedding provider)` note.
- The build inlines the rest index (metadata + FTS) into `aura.mjs`; the
  committed `.mjs` contains the index (grep the bundle for a known
  operationId string), and **no sidecar `.json` is loaded at runtime**.
- The build asserts the inlined index is under the size budget; forcing it
  over budget (e.g. by raising a fake size in a test fixture) fails the
  build loudly with the actual size + remediation hints.
- `rest list` / `rest describe` / `rest call` still work and now read from
  the inlined blob (no `openapi.yaml` read at runtime in the bundled CLI).
- A missing-required-param / unknown-op error lists closest matches via
  the FTS index.
- `task build` (with `gen-rest-index`) succeeds; `task typecheck` + the
  full test suite pass.

## Test plan

### Seams (test only at these)
- The index builder `buildFtsIndex(opsWithTags)` → FTS index (pure; tested
  against a small fixture of operations + code-tags; assert BM25 stats).
- The RRF stub `rrfMerge([ftsRanking])` → identical to FTS ranking when
  only one leg; `rrfMerge([fts, semantic])` shape tested with a fake
  semantic ranking (previews slice 4's contract).
- `rest search` → stdout + rationale (FTS mocked or real index fixture;
  assert top result + the skipped-leg note).
- The build assertion → exits non-zero with size + hints when a fixture
  index exceeds a tiny budget; passes when under it.

### Failure modes / edge cases
- Query with no matching terms → empty results + a note (not a crash).
- Operation with empty searchable text (no summary/description/tags) →
  still indexed (name only), not dropped.
- Code-tag targeting an unknown `operationId` → loud build error naming the
  id (tags must reference real ops).
- Code-tag targeting a tag group that doesn't exist in the spec → loud
  build error.
- Index over the size budget → build fails with actual size + hints.
- Duplicate operationId in the index → loud build error.

### Scenarios
- "set my capacity commitment" → `updateTaskMemberCapacity` top-3, with the
  `capacity` code-tag in the rationale.
- "list my notifications" → a notifications list op ranks highly.
- A query that matches only via a code-tag (not the spec text) → the
  code-tag is the rationale.

## Constraints and dependencies

- **Inlined, not sidecar:** the index is an esbuild-imported module; no
  runtime file read. This is the hard constraint from the task ("no
  sidecar file at runtime").
- **Metadata blob inlined too (DECIDED):** per the task Architecture
  notes decision, the parsed operation metadata is inlined alongside the
  FTS index so the bundled CLI is self-contained for end users. Slice 1's
  runtime YAML read is replaced here.
- **Size budget:** the combined metadata + FTS blob must fit the budget.
  The metadata blob (273 ops × ~full fields) dominates; if it threatens
  the budget, the generator should emit a *slim* metadata shape (only the
  fields `list`/`describe`/`call` actually read: method, path, params,
  body content-type + ref name, tags, summary, response codes) and keep
  long descriptions only in the FTS text, not duplicated in metadata.
- **BM25, not TF-IDF:** standard BM25 with k1≈1.5, b≈0.75; tokenization is
  lowercase + split on non-alphanumerics (simple, no stopwords dependency).
- **Code-side tags are non-user-facing:** they appear in `search` rationale
  but NOT in `rest describe` output (the describe output stays spec-faithful).
- Do NOT implement the semantic leg (embeddings, cosine, query embedding)
  here — that is slice 4. The RRF stub here is `RRF(FTS)=FTS`; slice 4 swaps in
  `RRF(semantic, FTS)`.
- Do NOT change the loader's parse logic; only where the runtime reads the
  index from (YAML → inlined blob).
