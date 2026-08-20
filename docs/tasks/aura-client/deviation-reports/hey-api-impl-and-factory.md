## Deviation report — hey-api-impl-and-factory

### API surface changes
- **Planned:** `HeyApiAuraClient({ keyring, baseUrl }) implements AuraClient` with
  all ~21 methods delegating to the generated SDK; `createDefaultAuraClient()`
  factory reading `aura.baseUrl` from settings + keyring PAT; `@pi-aura/shared/aura-client`
  surfacing both the interface/types and the impl/factory.
- **Actual:** All 21 methods implemented and exported. `HeyApiAuraClient` uses
  `createClient({ baseUrl })` + a request interceptor setting
  `Authorization: Bearer <pat>`; each method calls the generated SDK function
  with `{ client: this.client, ...params }`, unwraps `{ data, error, response }`,
  and maps generated → domain via private helpers. `createDefaultAuraClient()`
  reads `aura.baseUrl` via a minimal `packages/shared/src/settings.ts`, builds the
  keyring, validates the PAT (clear error → `/aura secrets discover`), and
  constructs `HeyApiAuraClient`. A sibling `hey-api-aura-client.ts` re-exports
  from `aura-client.ts` (open decision #2 = recommended sibling layout). New
  `AuraApiError` class (status + message) thrown on SDK errors.
- **Impact:** `call-site-migration` can now
  `import { AuraClient, createDefaultAuraClient } from "@pi-aura/shared/aura-client"`
  and replace `bearerClient(...)` + `callTool<T>(verb, args)` with
  `await aura.<verb>(args)`. Three seams for that task to note (see below).

### Abstraction usage
- Used/was specified: **yes.**
  - `@pi-aura/shared/keyring` — `createKeyring`, `Keyring`, `SecretKey` used as
    specified (PAT via `getSecret({ service: "aura", name: "pat" })`).
  - `@hey-api/client-fetch` `createClient` + `interceptors.request.use` — used as
    specified.
  - Generated SDK functions from `./generated/sdk.gen.js` + generated types from
    `./generated/types.gen.js` — used **only** inside `HeyApiAuraClient` private
    helpers/casts (Q8 satisfied: `aura-client.ts` interface has zero
    generated-type imports; `HeyApiAuraClient` public method signatures use only
    the slice-2 domain types).
  - `getArtifact` (not `mcpGetArtifact`) chosen per open decision #4 — the
    scripts call the non-MCP REST path.

### Out-of-scope changes
- **`packages/shared/src/settings.ts` (new, 46 lines)** — a minimal shared
  settings reader for `aura.baseUrl` (open decision #1 = recommended minimal
  reader; full move deferred to `call-site-migration`). `scripts/src/settings.ts`
  is untouched. This is in-scope per the arch spec ("add a minimal shared
  settings reader that returns `{ baseUrl?: string }`").
- **`packages/shared/test/hey-api-aura-client.test.ts` (new, 4 unit tests)** —
  construction, structural `AuraClient` check (all 21 methods present),
  `AuraApiError`, missing-PAT error. Added `tsx` devDep + `test` script +
  `test/**/*.ts` to tsconfig include. The project had no test infrastructure in
  `packages/shared`; this is a reasonable addition for the smoke-test AC.
- **`AuraApiError` class** — not in the spec but a natural extraction of the
  "throw on error (include status + message)" requirement. Re-exported from
  `aura-client.ts`. Call sites in `call-site-migration` can catch it.
- `scripts/src/clients.ts` / `mcp-client.ts` / `scripts/src/settings.ts` —
  **not touched** (correctly deferred to `clients-cleanup` / `call-site-migration`).

### Divergence from acceptance criteria

1. **`listArtifacts` / `listTasks` / `listNotifications` opts typed as
   `Record<string, unknown>`** in the impl (not the domain `ListArtifactsInput` /
   `ListTasksInput` / `ListNotificationsInput` the interface declares). The
   generated SDK's query params are a subset of the domain input types, so
   passing the full domain type triggers a type error; the impl accepts the
   wider `Record<string, unknown>` and forwards it as `query`. The interface
   signatures still use the domain types (the impl accepts a wider type —
   structurally compatible). **Impact:** `call-site-migration` must verify call
   sites pass the right query fields; the domain types are advisory there.

2. **`getKnowledgeNode` / `getKnowledgeNodeByPath` `includeBody` opt ignored.**
   The generated `getKnowledgeNode` has no `include_body` query param, and
   `getKnowledgeNodeByPath` only accepts `{ path }`. Both REST endpoints always
   return the body for documents. The impl accepts `includeBody` for interface
   compatibility but prefixes it `_opts` and doesn't forward it. **Impact:**
   `call-site-migration` should drop the `include_body: true` the scripts
   previously passed via MCP — it's not needed on the REST path.

3. **`unwrap` helper uses `unknown` not a typed generic.** The
   `@hey-api/client-fetch` `RequestResult` resolves `data` to
   `TData[keyof TData]` (a union of response-body properties by status code),
   not `TData` itself, so a clean `unwrap<TGen, TDomain>` isn't expressible.
   `unwrap<TDomain>` accepts `{ data: unknown; error: unknown; response: Response }`
   and each mapper casts `unknown` → the specific generated type internally.
   Safe because the SDK guarantees the shape when `error` is `undefined`.

4. **`BoardSummary.overdue` item shape differs.** The generated `overdue` bucket
   uses `BoardOverdueItem` (task + deadline + ampel + days), not
   `BoardAttentionItem` (kind + title + since + waiting_days + link +
   approvals_pending). The mapper maps `days` → `waiting_days` (abs value) and
   leaves `kind`/`since`/`link`/`approvals_pending` `undefined`. Domain
   `BoardItem` has these optional, so it's type-safe. **Impact:** the digest's
   overdue-attention extraction (`item.waiting_days`, `item.since`) still works
   for `waiting_on_me`/`waiting_on_others`; overdue items will have
   `waiting_days` from `days` and `since` undefined. `call-site-migration`
   should verify `aura-digest.ts`'s `toAttentionItem` handles the `since:
   undefined` case (it already uses `?? undefined`).

5. **`ArtifactReview.review_started_at` / `review_deadline_at`** — generated
   type declares them `string` (required); domain type has them
   `string | undefined` (optional). Mapper passes through directly; if the
   server returns `null`, TS won't catch it at runtime. Matches the spec's
   "don't over-encode every nullable field" guidance.

6. **`ArtifactApprovals.decisions[].decided`** — the generated
   `ArtifactDecisionRecord` has no `decided` field, so the mapper hardcodes
   `decided: true` (all decision records are decided by definition). The domain
   `ApprovalDecision` has `decided: boolean`. Correct but worth noting for
   `call-site-migration`.

### Open decisions chosen
1. **Settings home:** minimal shared reader (`packages/shared/src/settings.ts`,
   `aura.baseUrl` only) — recommended choice; full move deferred to
   `call-site-migration`. `scripts/src/settings.ts` untouched.
2. **Impl layout:** sibling `hey-api-aura-client.ts` re-exported from
   `aura-client.ts` — recommended choice; keeps the interface file clean.
3. **PAT caching:** factory-passed optional `pat` (avoids double keyring read) —
   the "permissible refinement"; constructor still stores the keyring for the
   lazy fallback when `pat` is absent.
4. **`getArtifact` vs `mcpGetArtifact`:** `getArtifact` (non-MCP REST path) —
   the scripts call this one; matches the recommendation.

### Task doc update needed?
Yes — append to `## Implementation notes`:
- Slice 3 landed: `HeyApiAuraClient` + `createDefaultAuraClient()` +
  `AuraApiError` in `packages/shared/src/hey-api-aura-client.ts`, re-exported
  from `aura-client.ts`. Minimal `settings.ts` added (full move deferred).
  4 unit tests pass; `tsx` devDep + `test` script added.
- Three seams for `call-site-migration`: (a) `listArtifacts`/`listTasks`/
  `listNotifications` impl accepts `Record<string,unknown>` (verify query fields
  at call sites); (b) `getKnowledgeNode`/`getKnowledgeNodeByPath` ignore
  `includeBody` (drop `include_body: true` — REST always returns body);
  (c) `BoardSummary.overdue` items have `since`/`link`/`approvals_pending`
  undefined (verify `aura-digest.ts` `toAttentionItem` handles that).

### User attention needed?
No — scope and API surfaces match the spec. All four open decisions chose the
recommended option. The six divergences are type-compatibility seams the
implementer flagged; none change the public `AuraClient` interface or break
`scripts/`. They are notes for the dependent `call-site-migration` task, not
user-facing scope changes.
