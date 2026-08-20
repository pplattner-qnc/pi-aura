# Architecture spec — `call-site-migration`

> Shared across all slice chains. Stable once approved.

Task: `docs/tasks/call-site-migration/task.md`. Map: `aura-access-rewrite`.
Slices + dependency levels:

- **Level 1** (both unblocked, run sequentially — shared repo cwd):
  - `migrate-aura-digest` (size l) — migrate `scripts/src/aura-digest.ts`
  - `migrate-aura-cli` (size m) — migrate `scripts/src/aura.ts`
- **Level 2** (blocked by both Level-1 slices):
  - `dedupe-types` (size m) — remove duplicated Aura shapes from `scripts/src/types.ts`

## Destination (from task + map)

`aura.ts` and `aura-digest.ts` stop using `McpClient.callTool(name, args)`
and instead call the `AuraClient` interface (via `createDefaultAuraClient()`,
imported from `@pi-aura/shared/aura-client`). The hand-maintained Aura
response shapes in `scripts/src/types.ts` that overlap with the new domain
types are removed; the digest/report/diff types that have no spec equivalent
stay. The dev-links path (`devlinks.ts`) keeps `McpClient` for the Atlassian
Teamwork Graph (out of scope); only the Aura `callTool`s migrate. This task
does **not** remove `bearerClient`/`mcp-client.ts`/`atlassianClient` (that's
`clients-cleanup`).

## Cross-cutting facts established (from the `aura-client` task)

- `@pi-aura/shared/aura-client` exports: `AuraClient` interface (21 methods),
  domain types, `createDefaultAuraClient()`, `HeyApiAuraClient`,
  `AuraApiError`, `HeyApiAuraClientOptions`.
- `AuraClient` has **no `close()`** method (REST client has no persistent
  connection to close). The scripts' `client.close()` calls must be **dropped**
  (or become no-ops) in the migration — see "Seam A" below.
- `createDefaultAuraClient()` requires `aura.baseUrl` in
  `~/.pi/agent/settings.json` + a PAT in the keyring (`{service:"aura",
  name:"pat"}`, set via `/aura secrets discover`). It throws `AuraApiError`
  (or a keyring error) if the PAT is missing.
- The new shared `packages/shared/src/settings.ts` reads only `aura.baseUrl`.
  `scripts/src/settings.ts` still owns `mcpServers` + `digest` — **stays**
  (the digest still needs `mcpServers.atlassian` for `buildAtlassianClient`,
  and `digest` for dev-links). The scripts keep importing `loadSettings` from
  `./settings.js`; the AuraClient factory reads `aura.baseUrl` itself. Do not
  reconcile the two settings readers here (deferred — see open decisions).
- `AuraClient` methods throw `AuraApiError` (status + message) on SDK errors;
  scripts that currently `try/catch` MCP errors keep the same shape (the
  catch is on the error, not the tool-result).
- `make` is not on `PATH` on this NixOS env — verification uses `cd scripts &&
  npm run typecheck` + `npm run build` directly.

## Critical seams (discovered while drafting this spec)

### Seam A — `client.close()` calls (both scripts)
Both scripts call `await client.close()` after every Aura operation (aura.ts
has ~12; aura-digest.ts has 2). `AuraClient` has no `close()`. The migration
**removes all `client.close()` calls for the Aura client**. The Atlassian
`McpClient` in `devlinks.ts`/`buildAtlassianClient` **keeps** its `close()`
(Atlassian still uses `McpClient`).

### Seam B — `getKnowledgeNodeByPath` signature change (aura.ts)
Old MCP call: `client.callTool("getKnowledgeNodeByPath", { slug: opts.slug,
include_body: true })` — `slug` was the full slash-separated path (e.g.
`"daten/chat"`).
New domain method: `getKnowledgeNodeByPath(spaceSlug: string, path: string,
opts?: { includeBody? })` — two args. The CLI `--slug` flag is the full path.
The migration must **split** the CLI slug into a `spaceSlug` (first segment)
and `path` (remainder) before calling the method — OR confirm the REST API's
`getKnowledgeNodeByPath` actually takes `{ space_slug, path }` as the
generated SDK expects. Check `packages/shared/src/generated/sdk.gen.ts` for
the exact param shape of `getKnowledgeNodeByPath` and adapt the CLI flag
parsing accordingly. `getKnowledgeNode(uuid, opts)` is a simpler 1:1 swap.
The `includeBody` opt is accepted by the interface but **ignored** by the
impl (REST always returns body) — safe to pass, no behavioral effect.

### Seam C — `ArtifactListItem.current_version` (aura-digest.ts)
The digest reads `a.current_version` off `pendingReviews.items` (lines ~338,
~523). The domain `ArtifactListItem` has `latest_version` (not
`current_version`); it has a `[k: string]: unknown` index signature so
`a.current_version` compiles but is `unknown`. The migration should read
`a.latest_version` instead (semantically the same — the latest version IS
the current version in T01). Flag in the deviation report; this is the kind
of field rename `dedupe-types` reconciles.

### Seam D — `getKnowledgeTree` arg (aura.ts)
Old: `client.callTool("getKnowledgeTree", { slug })`. New domain method:
`getKnowledgeTree(spaceSlug: string)` — one positional arg, not `{ slug }`.
The CLI passes the slug; the migration calls `aura.getKnowledgeTree(slug)`.

### Seam E — `verifyArtifacts(client: McpClient, ...)` (aura-digest.ts)
The `verifyArtifacts` helper takes `client: McpClient` and calls
`client.callTool<ArtifactApprovalState>("getArtifactApprovals", { id })`.
It must be retyped to `client: AuraClient` and call
`client.getArtifactApprovals(id)`. The same for the inline
`getArtifactApprovals`/`getArtifactReview`/`getTaskByHumanKey` calls in
`fetchAction` + the reviews-owed block.

### Seam F — `fetchTaskDevLinks(..., atlassian: McpClient | null, ...)` (devlinks.ts)
`devlinks.ts`'s `fetchTaskDevLinks` takes an `AuraTaskDetail` (from
`types.ts`) + the Atlassian `McpClient`. The Aura `getTaskByHumanKey` calls
that *produce* the `AuraTaskDetail` move to `AuraClient.getTaskByHumanKey`
(returning the domain `Task`). `fetchTaskDevLinks`'s signature can stay on
`AuraTaskDetail` for now (the `Task` domain type is structurally compatible —
both have `human_key`, `jira_issues`, `children`), OR it's retyped to take
`Task` — the worker's choice; `dedupe-types` removes `AuraTaskDetail` later.
The Atlassian `callTool` calls inside `fetchTaskDevLinks` **stay** (out of
scope). The `atlassian` client construction (`buildAtlassianClient`) stays.

---

## Slice 1 — `migrate-aura-digest` (size l)

### Exports / planned changes
`scripts/src/aura-digest.ts` is rewritten to use `AuraClient`:
- Remove `import { bearerClient } from "./aura-client.js"` (the re-export
  shim) — replace with `import { createDefaultAuraClient, AuraClient } from
  "@pi-aura/shared/aura-client"`.
- Remove `REQUIRED_TOOLS` + `client.assertToolsAvailable(REQUIRED_TOOLS)` +
  `await client.connect()` (no MCP tool discovery).
- `const aura = await createDefaultAuraClient();` replaces
  `const client = bearerClient(loadSettings().mcpServers.aura); await client.connect();`.
- The 8-call parallel `Promise.all` block (getBoardBriefing, getBoardSummary,
  listNotifications, getMyPriorityQueue, getMyCapacity, listArtifacts,
  listTasks x2) becomes `aura.<method>(...)` calls — **stays parallel**.
- `getTaskByHumanKey` (2 call sites: queue rows + children) →
  `aura.getTaskByHumanKey(key)` (Seam E).
- `getArtifactReview` (2 call sites: my-user-id lookup + reviews-owed) →
  `aura.getArtifactReview(id)`.
- `getArtifactApprovals` (in `verifyArtifacts`) → `aura.getArtifactApprovals(id)`.
- `verifyArtifacts(client: McpClient, ...)` → `verifyArtifacts(client:
  AuraClient, ...)`.
- Drop the 2 `await client.close()` calls (Seam A — Aura client).
- Keep `buildAtlassianClient` + `fetchTaskDevLinks` + the `atlassian.close()`.
- Keep `loadSettings` from `./settings.js` (still needed for
  `settings.mcpServers.atlassian` + `settings.digest`).

### Verb → AuraClient method mapping (digest)
| Old callTool verb | New AuraClient method | Notes |
|---|---|---|
| `getBoardBriefing` `{locale:"en"}` | `aura.getBoardBriefing({locale:"en"})` | |
| `getBoardSummary` | `aura.getBoardSummary()` | |
| `listNotifications` `{limit,sort_by,sort_dir}` | `aura.listNotifications({limit,sort_by,sort_dir})` | |
| `getMyPriorityQueue` | `aura.getMyPriorityQueue()` | |
| `getMyCapacity` | `aura.getMyCapacity()` | |
| `listArtifacts` `{pending_review:true, limit:10}` | `aura.listArtifacts({pending_review:true, limit:10})` | Seam C: read `latest_version` not `current_version` |
| `listTasks` `{role,view,status_slug,limit}` | `aura.listTasks({role,view,status_slug,limit})` | two calls with different `status_slug` |
| `getTaskByHumanKey` `{key}` | `aura.getTaskByHumanKey(key)` | Seam E; returns domain `Task` |
| `getArtifactReview` `{id}` | `aura.getArtifactReview(id)` | |
| `getArtifactApprovals` `{id}` | `aura.getArtifactApprovals(id)` | in `verifyArtifacts` |

### Existing abstractions to use
- `@pi-aura/shared/aura-client` — `AuraClient`, `createDefaultAuraClient`,
  domain types (`BoardBriefing`, `BoardSummary`, `NotificationList`,
  `PriorityQueue`, `Capacity`, `ArtifactList`, `TaskList`, `Task`,
  `ArtifactApprovals`, `ArtifactReview`).
- `scripts/src/devlinks.ts` — `buildAtlassianClient`, `fetchTaskDevLinks`
  (unchanged — Atlassian stays on `McpClient`).
- `scripts/src/settings.ts` — `loadSettings` (unchanged).

### Do NOT reimplement / out of scope
- Do not migrate `devlinks.ts`'s Atlassian `callTool` calls.
- Do not remove `bearerClient`/`mcp-client.ts`/`atlassianClient`
  (`clients-cleanup`).
- Do not remove `AuraTaskDetail`/`ArtifactApprovalState`/`ArtifactReview`
  from `types.ts` yet — that's `dedupe-types` (Level 2). This slice may still
  import them if needed during the transition, but prefer the domain types.
- Do not touch `scripts/src/settings.ts`.

### Interface contract (for `dedupe-types`)
After this slice, `aura-digest.ts` imports domain types from
`@pi-aura/shared/aura-client` and the `callTool`/`bearerClient`/`McpClient`
Aura path is gone from it. `AuraTaskDetail`/`AuraArtifactList`/`AuraTaskList`/
`AuraBoardBriefing`/`AuraBoardSummary`/`AuraNotificationList`/
`AuraPriorityQueue`/`AuraCapacity`/`ArtifactApprovalState`/`ArtifactReview`/
`AuraTaskDetail` imports from `./types.js` may still exist (for `devlinks.ts`
or transitional casts) — `dedupe-types` removes the ones that become unused.

---

## Slice 2 — `migrate-aura-cli` (size m)

### Exports / planned changes
`scripts/src/aura.ts` is rewritten to use `AuraClient`:
- `import { bearerClient } from "./clients.js"` → `import {
  createDefaultAuraClient, AuraClient } from "@pi-aura/shared/aura-client"`.
- `const client = bearerClient(settings.mcpServers.aura); await
  client.connect();` → `const aura = await createDefaultAuraClient();`.
- Every `client.callTool<...>("verb", args)` → `aura.<method>(args)`.
- Every `async function X(client: McpClient, ...)` → `async function X(client:
  AuraClient, ...)`.
- Drop all `await client.close()` calls (Seam A).
- `getKnowledgeNodeByPath` (Seam B): the CLI `--slug` is the full path; split
  into `spaceSlug` (first segment) + `path` (remainder) before calling
  `aura.getKnowledgeNodeByPath(spaceSlug, path, { includeBody: true })`.
  Confirm the split against the generated SDK's param shape. `getKnowledgeNode`
  is `aura.getKnowledgeNode(uuid, { includeBody: true })`.
- `getKnowledgeTree` (Seam D): `aura.getKnowledgeTree(slug)` (positional).
- Keep `loadSettings` from `./settings.js` (still needed? aura.ts uses
  `settings.mcpServers.aura` for `bearerClient` — after migration, aura.ts
  may not need `loadSettings` at all unless used elsewhere; remove the import
  if unused).
- The workdir model (`freshWorkdir`/`writeWorkdir`/`removeWorkdir`/`readWorkdirMeta`)
  is **unchanged** — only the Aura calls change.

### Verb → AuraClient method mapping (cli)
| Old callTool verb | New AuraClient method | Notes |
|---|---|---|
| `getArtifact` `{id}` | `aura.getArtifact(id)` | returns domain `Artifact` (has `body`, `latest_version`) |
| `mcpUpdateArtifact` `{id,mode,body,summary,...}` | `aura.mcpUpdateArtifact({id,mode,body,summary,...})` | |
| `mcpCreateArtifact` `{title,kind,body,summary}` | `aura.mcpCreateArtifact({title,kind,body,summary})` | |
| `getKnowledgeNode` `{uuid,include_body}` | `aura.getKnowledgeNode(uuid,{includeBody:true})` | |
| `getKnowledgeNodeByPath` `{slug,include_body}` | `aura.getKnowledgeNodeByPath(spaceSlug,path,{includeBody:true})` | Seam B: split slug |
| `saveKnowledgeNodeBody` `{uuid,body,summary}` | `aura.saveKnowledgeNodeBody({uuid,body,summary})` | |
| `mcpWikiSearch` `{query,space_slug,limit}` | `aura.mcpWikiSearch({query,space_slug,limit})` | |
| `getKnowledgeTree` `{slug}` | `aura.getKnowledgeTree(slug)` | Seam D: positional |
| `createKnowledgeNode` `{space_slug,kind,title,slug}` | `aura.createKnowledgeNode({space_slug,kind,title,slug})` | |
| `mcpCreateUploadDocument` `{filename,content_base64,mime_type}` | `aura.mcpCreateUploadDocument({filename,content_base64,mime_type})` | |
| `mcpGetUploadDocument` `{id}` | `aura.mcpGetUploadDocument(id)` | |

### Existing abstractions to use
- `@pi-aura/shared/aura-client` — `AuraClient`, `createDefaultAuraClient`,
  domain types (`Artifact`, `KnowledgeNode`, `WikiSearchResult`,
  `KnowledgeTree`, `UploadDocument`, `UpdateArtifactResult`).
- The local `ArtifactDetail`/`WikiNodeDetail`/`UploadDocumentDetail`
  interfaces in `aura.ts` (lines ~119, ~126, ~294) can be **replaced** by the
  domain types where they match, or kept if they carry fields the domain type
  lacks. `dedupe-types` consolidates; this slice prefers the domain types.

### Do NOT reimplement / out of scope
- Do not change the workdir model or CLI arg parsing.
- Do not touch `bitbucket.ts`, `devlinks.ts`, `mcp-client.ts`, `clients.ts`
  (Atlassian path).
- Do not remove `bearerClient` (`clients-cleanup`).
- `LARGE_BODY_THRESHOLD` behavior is preserved (it gates a local file path,
  not an Aura call).

### Interface contract (for `dedupe-types`)
After this slice, `aura.ts` imports domain types from
`@pi-aura/shared/aura-client`; the local `ArtifactDetail`/`WikiNodeDetail`/
`UploadDocumentDetail` interfaces are either removed (if superseded) or
kept (if they carry extra fields) — `dedupe-types` removes the now-unused
ones.

---

## Slice 3 — `dedupe-types` (size m, Level 2)

### Exports / planned changes
`scripts/src/types.ts` loses the Aura-API-response shapes that now have
domain-type equivalents. The digest/report/diff types that have no spec
equivalent **stay**.

### Types to remove (duplicated by domain types)
- `AuraArtifact`, `AuraArtifactList` → `Artifact`/`ArtifactListItem`/`ArtifactList`
  (from `@pi-aura/shared/aura-client`). Watch Seam C: `current_version` →
  `latest_version`.
- `AuraTask`, `AuraTaskList` → `Task`/`TaskList`.
- `AuraTaskDetail` → `Task` (the domain `Task` has `jira_issues` + `children`).
  `devlinks.ts`'s `fetchTaskDevLinks` param retyped to `Task`.
- `AuraBoardBriefing` → `BoardBriefing`.
- `AuraBoardSummary`, `AuraBoardSummaryItem`, `AuraBoardSummaryBucket` →
  `BoardSummary`/`BoardItem`/`BoardBucket`.
- `AuraNotification`, `AuraNotificationList` → `Notification`/`NotificationList`.
- `AuraPriorityQueue`, `AuraPriorityQueueItem` → `PriorityQueue`/`PriorityQueueItem`.
- `AuraCapacity`, `AuraCapacityTask` → `Capacity`/`CapacityTask`.
- `AuraHumanKey` → `HumanKeyRef`.
- `ArtifactApprovalState`, `ArtifactApprovalDecision` → `ArtifactApprovals`/
  `ApprovalDecision`. Note: `ArtifactApprovalState` is embedded in
  `ArtifactVerification` (`current: ArtifactApprovalState | null`) and in
  `AuraReport` — retype those to `ArtifactApprovals | null`.
- `ArtifactReview` → the domain `ArtifactReview`. Note: the domain
  `ArtifactReview` is the review-overview shape; the digest's
  `ArtifactApprovalDecision` is embedded in `DigestReview`/`DigestCorrection`
  — retype to `ApprovalDecision`.

### Types to KEEP (digest/report/diff — no spec equivalent)
`Digest`, `DigestAttention`, `DigestAttentionItem`, `DigestQueueRow`,
`DigestCapacity`, `DigestReview`, `DigestReviewOwed`, `DigestCorrection`,
`DigestDiff`, `RawAuraData`, `AuraReport`, `ArtifactToVerify`,
`ArtifactVerification`, `ArtifactApprovalDecision` (if not removable — it's
embedded in `DigestReview`/`DigestCorrection`; prefer importing
`ApprovalDecision` from the shared domain), `LastDigestStore`,
`TaskDevLinks`, `DevLinkPullRequest`, `DevLinkBranch`.

### Existing abstractions to use
- `@pi-aura/shared/aura-client` domain types (the single source).
- `scripts/src/types.ts` (the digest types that remain).

### Do NOT reimplement / out of scope
- Do not change runtime behavior — this is a type-source consolidation.
- Do not remove `bearerClient`/`mcp-client.ts` (`clients-cleanup`).
- Do not touch `devlinks.ts`'s Atlassian types (`TwgContextResult`, etc.).

### Interface contract (for `clients-cleanup`)
After this slice, `scripts/src/types.ts` contains only digest/report/diff/
dev-link types. The Aura-API-response shapes are single-sourced in
`@pi-aura/shared/aura-client`. `clients-cleanup` can then remove
`bearerClient`'s Aura path + `scripts/src/generated/` + the `@hey-api/*`
deps from `scripts/package.json` knowing no script imports the old types.

### Test plan (the typechecker is the test)
- Removing a duplicated type that's still referenced → compile error → migrate
  that reference to the domain type (or keep the type if genuinely distinct).
- A domain type slightly different from the hand-maintained one (e.g. an
  extra optional field) → type error at the call site → reconcile in the
  domain type or the call site (flag in deviation report; prefer the domain
  type as-is and adjust the call site).
- `cd scripts && npm run typecheck` clean; `cd scripts && npm run build`
  clean; the built `aura-digest.mjs` `fetch` still produces the same
  `digest.json` shape.

---

## Open decisions (flag in deviation reports, don't block)

1. **Settings reconciliation:** `scripts/src/settings.ts` (mcpServers + digest)
  vs `packages/shared/src/settings.ts` (baseUrl only). Recommendation: **do
  not** reconcile here — keep both; the scripts keep `loadSettings` for
  mcpServers/digest, the factory reads baseUrl itself. Full reconciliation is
  a later cleanup. Flag if the worker merges them.
2. **`fetchTaskDevLinks` signature:** keep `AuraTaskDetail` param or retype
  to `Task`? Recommendation: retype to `Task` (the domain type covers it);
  `AuraTaskDetail` is then removable. Flag the choice.
3. **`aura.ts` local interfaces** (`ArtifactDetail`/`WikiNodeDetail`/
  `UploadDocumentDetail`): remove if the domain type covers the fields, or
  keep if they carry extra fields the scripts read. Recommendation: remove
  where covered, keep where not; `dedupe-types` finishes the job. Flag.
4. **`getKnowledgeNodeByPath` slug split:** the CLI `--slug` is the full path;
  the REST method takes `(spaceSlug, path)`. Confirm the split logic against
  the generated SDK + the openapi spec (`/knowledge/spaces/{slug}/nodes/by-path?path=...`).
  The first segment is the space slug; the rest is the path. Flag if the
  worker discovers the SDK takes a different shape.
5. **`includeBody` opt:** accepted by the interface, ignored by the impl (REST
  always returns body). Safe to pass `{ includeBody: true }` for clarity or
  omit it. Flag the choice.
