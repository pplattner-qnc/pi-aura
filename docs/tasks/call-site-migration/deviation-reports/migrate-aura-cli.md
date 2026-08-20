## Deviation report — migrate-aura-cli

### API surface changes
- **Planned:** `scripts/src/aura.ts` migrates from `McpClient.callTool(verb,
  args)` to the `AuraClient` interface via `createDefaultAuraClient()`. All 11
  Aura verbs become `AuraClient` methods; all `client.close()` calls dropped
  (Seam A — `AuraClient` has no `close()`); workdir model unchanged; local
  `ArtifactDetail`/`WikiNodeDetail`/`UploadDocumentDetail` interfaces replaced
  by domain types where covered.
- **Actual:** All 11 Aura calls migrated to `AuraClient` methods exactly per
  the arch spec's verb→method mapping table. `const client = await
  createDefaultAuraClient()` replaces `bearerClient(...).connect()`. All 11
  async subcommand functions retyped `client: McpClient` → `client:
  AuraClient`. All `await client.close()` calls removed. The local
  `ArtifactDetail`, `WikiNodeDetail`, `UploadDocumentDetail` interfaces
  **all removed** — replaced by domain `Artifact`, `KnowledgeNode`,
  `UploadDocument`. Field reads use the domain type fields correctly:
  `detail.latest_version` (not `current_version`), `node.id` (not `uuid`),
  `node.latest_version` (not `version`), `p.content` (not `text`).
  `import { loadSettings }` removed (no longer used — the factory reads
  `aura.baseUrl` itself). `import { bearerClient }` + `import type {
  McpClient }` removed.
- **Impact:** `dedupe-types` (Level 2) can now treat `aura.ts` as fully
  migrated — it imports only domain types from `@pi-aura/shared/aura-client`,
  no `types.ts` Aura-response shapes. The `clients-cleanup` task can later
  remove `bearerClient`'s Aura path knowing `aura.ts` no longer imports it.

### Abstraction usage
- Used/was specified: **yes.**
  - `@pi-aura/shared/aura-client` — `createDefaultAuraClient`, `AuraClient`,
    and domain types `Artifact`, `KnowledgeNode`, `WikiSearchResult`,
    `KnowledgeTree`, `UploadDocument`, `ArtifactKind` imported and used as
    specified. Generated types do not leak (all public method signatures use
    domain types).
  - The workdir model (`freshWorkdir`/`writeWorkdir`/`removeWorkdir`/
    `readWorkdirMeta`/`cleanupStale`), `parseFlags`, and `LARGE_BODY_THRESHOLD`
    are unchanged — only the Aura calls changed, per the scope boundary.
  - `bitbucket.ts`, `devlinks.ts`, `mcp-client.ts`, `clients.ts` were **not**
    touched (correctly out of scope).

### Out-of-scope changes
- **`skills/aura/dist/aura.mjs` rebuilt** — the build artifact is committed
  per the repo convention ("the compiled .mjs files are committed to the
  skill's dist/"). `npm run build` regenerated it; the diff is large (the
  bundle now pulls `@pi-aura/shared/aura-client` + `@hey-api/client-fetch`
  instead of the MCP SDK). This is expected for a migration that changes the
  dependency graph, not an out-of-scope source change.
- **`docs/tasks/call-site-migration/impeccable-note-migrate-aura-cli.md`**
  (untracked) — the ui-noter wrote `no_ui_work` (this is a CLI script with no
  UI surfaces). Advisory only; not gating.
- No test files added. The slice doc's test plan mentions seams/fakes for
  unit-testing the workdir lifecycle, but no test file was created — the
  verification was typecheck + build (the repo has no `scripts/` test runner;
  the shared package's `tsx --test` covers `HeyApiAuraClient`, not the
  script call sites). Manual smoke (`node aura.mjs artifact get <uuid>`)
  requires a real Aura instance + stored PAT.

### Divergence from acceptance criteria

1. **`wikiSearch` output format change** — The old code printed
   `- ${it.title}  [${it.slug}]  (score.toFixed(3))` from a loosely-typed
   response (`{slug?, title?, score?}`). The domain `WikiSearchHit` has
   `title`, `space_slug`, `url`, `excerpt`, `heading_path`, `match_source`,
   `id` — but **no `slug` or `score` field**. The migration prints
   `- ${it.title}  [${it.space_slug}]  (${it.url})` instead. This is a minor
   user-visible output change: the search-result line now shows the
   `space_slug` + `url` instead of the node `slug` + numeric `score`. The
   domain type simply doesn't carry those old fields. Flag for
   `dedupe-types` awareness (the `WikiSearchHit` domain type is the single
   source now — if `score`/`slug` are needed, the domain type in
   `@pi-aura/shared/aura-client` must add them, not `aura.ts`).
2. **`artifactCreate` `kind` cast** — The CLI `--kind` flag is a `string`,
   but `CreateArtifactInput.kind` expects `ArtifactKind`
   (`"PLAN"|"REVIEW"|"GENERIC"`). The migration casts
   `opts.kind as ArtifactKind` to satisfy the type system. No behavioral
   change — the runtime value is passed to the API as-is. An invalid kind
   string would now surface as an API error rather than a local type error
   (acceptable; the CLI has no validation layer today).
3. **`created.id` / `res.id` no longer nullable** — The old code used
   `created.id ?? "?"` and `res.uuid ?? "(created, no uuid returned)"`
   defensively (the MCP response was loosely typed with optional fields).
   The domain `Artifact` (`id: string`) and `KnowledgeNode` (`id: string`)
   have **required** `id`, so the `?? "?"` / `?? "(created...)"` fallbacks
   were removed. If the API ever returns a missing `id`, the scripts now
   print `undefined` rather than a friendly placeholder — but the domain
   type contract says `id` is always present, so this is correct per the
   type contract.

### Open decisions chosen
- **Seam B (`getKnowledgeNodeByPath` slug split):** Implemented. The CLI
  `--slug` is split at the first `/` into `spaceSlug` (first segment) +
  `path` (remainder). If no `/`, the whole slug is the space slug and `path`
  is `""`. Confirmed against the generated SDK's param shape
  (`GetKnowledgeNodeByPathData` takes `path: { slug: string }` + `query:
  { path: string }`). Matches the arch spec recommendation.
- **Seam D (`getKnowledgeTree` positional):** Implemented as
  `client.getKnowledgeTree(slug)` — one positional arg, not `{ slug }`.
  Matches the arch spec.
- **Seam A (`client.close()` dropped):** All `await client.close()` calls
  removed. `AuraClient` has no `close()`. Matches the arch spec.
- **`includeBody` opt (open decision #5):** Passed as `{ includeBody: true }`
  to `getKnowledgeNode` and `getKnowledgeNodeByPath` for clarity. The impl
  ignores it (REST always returns body). Matches the recommendation.
- **Local interfaces (open decision #3):** All three
  (`ArtifactDetail`/`WikiNodeDetail`/`UploadDocumentDetail`) removed — the
  domain types cover all fields the scripts read. Matches the
  recommendation.

### Task doc update needed?
No — `aura.ts` migration is self-contained. The `dedupe-types` slice (Level
2) will handle the `types.ts` consolidation. The one note for
`call-site-migration`'s `## Implementation notes`: the `wikiSearch` output
format changed (space_slug + url instead of slug + score) — minor, flag if
the user notices search output differs.

### User attention needed?
No — scope and API surfaces match the spec. The `wikiSearch` output format
change is minor and user-visible only in the `wiki search` subcommand's
stdout; it's a consequence of the domain type not carrying `slug`/`score`.
No out-of-scope source changes. Typecheck + build pass.
