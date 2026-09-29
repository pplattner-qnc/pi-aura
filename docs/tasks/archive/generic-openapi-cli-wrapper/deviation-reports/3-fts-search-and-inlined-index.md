## Deviation report — 3-fts-search-and-inlined-index

### API surface changes

- **Generator path:** `scripts/src/gen/gen-rest-index.ts` (subdir) → actual `scripts/src/gen-rest-index.ts` (flat).
  - **Planned:** arch spec placed the generator in a `gen/` subdir.
  - **Actual:** placed flat alongside other `scripts/src/` files, matching the `gen-rest-doc.ts` convention from slice 1.
  - **Impact:** none — `gen-rest-doc.ts` (slice 1) is also flat; consistency is maintained. Slice 4 imports it by the actual path.

- **`serializeRestIndexBlob` determinism:** arch spec mentioned "sorted keys" for determinism; actual uses plain `JSON.stringify(blob)`.
  - **Planned:** deterministic JSON serialization with sorted keys.
  - **Actual:** `JSON.stringify(blob)` with no explicit key sorting. Determinism is achieved instead by sorting operations by `operationId` before building the blob, so insertion order is stable across runs. Verified: two consecutive runs produce byte-identical output.
  - **Impact:** none in practice — the output is deterministic. But if `Object.values()` or `loadOpenApi()` ever changed key iteration order, the `docFreq` object keys could reorder. Low risk.

- **`genRestIndex()` is `async`** (uses `await import()` for `CODE_TAGS`); `gen-rest-doc` is synchronous.
  - **Planned:** synchronous generator entry, matching `gen-rest-doc.ts`.
  - **Actual:** `async` because it lazily imports `CODE_TAGS`/`resolveCodeTags` to keep `buildRestIndex` testable without the CLI value-import chain.
  - **Impact:** the Taskfile `gen-rest-index` step uses `npx tsx` instead of `node --experimental-strip-types` (inconsistent with `gen-rest-doc`). Minor — both work.

- **`restSearch` discards `rrfMerge` output.** The function calls `rrfMerge([ftsRanking])` but doesn't use the returned `Map` — it prints results directly from `ftsHits`.
  - **Planned:** RRF stub that produces the ranking; `restSearch` should use the merged result.
  - **Actual:** `rrfMerge` is invoked (exercising the code path) but its return value is unused. Results come from `bm25Search` directly.
  - **Impact:** none functionally (RRF(FTS)=FTS), but it's dead code that may confuse slice 4. Slice 4 should replace this with `rrfMerge([semantic, fts])` and use the result.

- **`SlimOpMeta` omits `description` field entirely.**
  - **Planned:** arch spec said "slim metadata shape (only the fields list/describe/call actually read)" and the slice doc said "drop long descriptions from the FTS text but keep a truncated form in metadata."
  - **Actual:** `description` is completely absent from `SlimOpMeta`. The `getRestIndex()` function in `aura.ts` doesn't set `description` when converting `SlimOpMeta` → `OpMeta`.
  - **Impact:** `rest describe` in the bundled CLI never prints the operation description (line 104 of `rest-list-describe.ts` checks `if (op.description)` — always falsy in the inlined blob). In dev mode (YAML fallback), `describe` shows descriptions. This is a minor degradation of `describe` output for end users of the committed bundle. The description text is still in the FTS index (searchable), so search recall is unaffected.

- **`getRestIndex()` dev-mode fallback reads `openapi.yaml` at runtime.**
  - **Planned:** slice doc says "the bundled CLI is self-contained and does not read `openapi.yaml` at runtime."
  - **Actual:** `getRestIndex()` has a fallback: `if (REST_INDEX) { ... } else { loadOpenApi(openApiPath) }`. Since `REST_INDEX` is always present (inlined), the fallback is dead code in the bundle. But it still contains an `openapi.yaml` path reference in the committed `.mjs` (grep confirmed). The fallback is for dev/source mode where the generated index might not exist yet.
  - **Impact:** none for end users — `REST_INDEX` is always inlined. The dead fallback adds a tiny amount of bundle size and an `openapi.yaml` string reference. Could be cleaned up but is not a functional issue.

### Abstraction usage
- Used/was specified: **yes** — `loadOpenApi()` (slice 1), `fail()`/USAGE pattern, `OutSink` type from `rest-list-describe.ts`, esbuild import-inlining, Taskfile build wiring. All specified abstractions are used correctly.
- `bm25Search`/`buildFtsIndex`/`rrfMerge` exported from `@pi-aura/shared/rest/fts` as specified — correct.
- `CODE_TAGS`/`resolveCodeTags` in `scripts/src/rest-code-tags.ts` as specified — correct.
- `RestIndexBlob` includes `embedModelId: null` and `vectors: null` as specified for slice 4 — correct contract.

### Out-of-scope changes

- **`getRestIndex()` function added to `aura.ts`** — converts `REST_INDEX.metadata` (slim) → `OpenApiIndex` (full `OpMeta` shape). This is the mechanism for switching `list`/`describe`/`call` to the inlined blob. In scope per the slice doc ("switched to read from the inlined metadata blob").
- **No changes to the loader** — correct (slice doc says "Do NOT change the loader's parse logic").
- **No semantic leg implemented** — correct (slice 4 scope).

### Missing acceptance-criteria items (divergence from slice doc)

1. **Code-tag validation NOT implemented.** The slice doc's failure modes require:
   - "Code-tag targeting an unknown `operationId` → loud build error naming the id"
   - "Code-tag targeting a tag group that doesn't exist in the spec → loud build error"
   - The `rest-code-tags.ts` file documents these in comments ("A code-tag referencing an unknown operationId → loud build error") but **no validation code exists**. `buildRestIndex` does not validate `CODE_TAGS.byOp` keys against the parsed operation index, nor `CODE_TAGS.byTagGroup` keys against the spec's tags. A stale code-tag silently does nothing.
   - **Impact:** a maintainer adding a code-tag for a typo'd `operationId` gets no build-time feedback. The tag is silently ignored.

2. **Duplicate `operationId` build error NOT implemented.** The slice doc says "Duplicate operationId in the index → loud build error." The loader (slice 1) may handle this, but `buildRestIndex` does not re-check. No test covers this case.

3. **Unknown `operationId` closest matches still use Levenshtein, not FTS.** The slice doc says: "Unknown `operationId` errors in `rest call`/`describe` now use the FTS index to list closest matches (replacing slice 1's substring fallback)." The actual implementation still uses the `closestMatches`/`levenshtein` functions from slices 1–2 — `rest-list-describe.ts` and `rest-call.ts` were **not modified** to use the FTS index. The inlined `REST_INDEX` is available in `aura.ts` but not wired into the error paths of `restCall`/`restDescribe`.
   - **Impact:** the closest-matches suggestions are Levenshtein-based (string similarity), not FTS-based (semantic/text relevance). The AC is not met for this item.

4. **Rationale does not distinguish code-tag provenance.** The slice doc AC says "the rationale surfaces the code-side `capacity` tag as a match reason." The actual rationale shows matched query terms (e.g., `terms: set, capacity, commitment`) but does not label which terms came from spec text vs code-tags. Since "capacity" appears in both the spec summary and the code-tag, the rationale is ambiguous. The AC is partially met — the tag contributes to the match, and "capacity" appears in the terms list, but there's no explicit "code-tag" label.
   - **Impact:** minor — the user/agent can see that "capacity" matched, but can't tell if it was the code-tag or the spec text that drove the match.

### Task doc update needed?
**Yes** — append to `## Implementation notes`:
- `SlimOpMeta` omits `description` from the inlined metadata to fit the size budget. `rest describe` in the bundled CLI does not print operation descriptions (the field is absent). If this is undesired, add a truncated `description` to `SlimOpMeta` or accept the loss. The description text is still in the FTS index for search.
- Code-tag validation (unknown `operationId` / unknown tag group → loud build error) was specified but not implemented. Should be added before or during slice 4, or descoped.
- Closest-matches for unknown `operationId` in `rest call`/`describe` still use Levenshtein (slice 1/2 fallback), not the FTS index. The AC said "now use the FTS index." Should be wired in a follow-up or during the coherence refactor.
- `rrfMerge` output is unused in `restSearch` (dead code). Slice 4 should replace with `rrfMerge([semantic, fts])` and use the result.

### User attention needed?
**Yes** — three AC items from the slice doc are not met:
1. Code-tag validation (loud build errors for unknown ops/tag groups) — not implemented.
2. Unknown `operationId` closest matches via FTS — still Levenshtein.
3. Rationale does not explicitly label code-tag provenance (minor — the term appears but isn't labeled).

The first two should be addressed (either in-slice or as follow-up). The third is a minor presentation issue.
