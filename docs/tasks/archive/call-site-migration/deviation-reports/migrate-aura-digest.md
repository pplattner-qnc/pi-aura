## Deviation report — migrate-aura-digest

### API surface changes
- **Planned:** `aura-digest.ts` constructs `const aura = await
  createDefaultAuraClient()` instead of `bearerClient(...).connect()`; all
  Aura `callTool` calls replaced with `aura.<method>(...)`; `REQUIRED_TOOLS` /
  `assertToolsAvailable` removed; the two Aura `client.close()` calls dropped;
  the dev-links Aura `getTaskByHumanKey` migrated but the Atlassian
  `McpClient.callTool` path kept; `make build` produces the `.mjs`.
- **Actual:** All of the above landed exactly as specified. The 8-call
  parallel `Promise.all` block + `getTaskByHumanKey` (×2) + `getArtifactReview`
  (×2) + `getArtifactApprovals` (in `verifyArtifacts`) are all `AuraClient`
  methods now. `REQUIRED_TOOLS` + `assertToolsAvailable` + `connect()` gone.
  Both Aura `client.close()` calls removed (Seam A). The Atlassian
  `buildAtlassianClient` + `fetchTaskDevLinks` + `atlassian.close()` are
  untouched (out of scope, correctly kept). `verifyArtifacts` retyped to
  `client: AuraClient` (Seam E). Seam C applied: `a.current_version` →
  `a.latest_version` at 3 sites (the digest `version` field, the report
  `pending_review_summary.current_version` mapping, and
  `extractVerifyTargets` `reported_version`). `loadSettings` kept (still
  needed for `settings.mcpServers.atlassian` + `settings.digest`).
- **Impact:** None on dependent slices beyond what the spec predicted. The
  `dedupe-types` slice (Level 2) can now remove the unused `Aura*` imports
  from `types.ts` and reconcile `RawAuraData` to domain types (removing the
  transitional cast — see divergence #1).

### Abstraction usage
- Used/was specified: **yes.**
  - `@pi-aura/shared/aura-client` — `createDefaultAuraClient`, `AuraClient`,
    and domain types (`BoardItem`, `Notification`, `PriorityQueueItem`,
    `Task`, `ArtifactListItem`) imported and used as specified.
  - `scripts/src/devlinks.ts` — `buildAtlassianClient`, `fetchTaskDevLinks`
    kept on `McpClient` (Atlassian path untouched, as specified).
  - `scripts/src/settings.ts` — `loadSettings` kept (mcpServers + digest),
    as specified (settings reconciliation deferred).
  - The `AuraTaskDetail`-vs-`Task` open decision (#2) chose "keep
    `fetchTaskDevLinks` on `AuraTaskDetail`" — the domain `Task` from
    `aura.getTaskByHumanKey()` is structurally compatible, so TS accepts it;
    `dedupe-types` retypes `fetchTaskDevLinks` to `Task`.

### Out-of-scope changes
- **`scripts/esbuild.config.mjs`** — `dbus-next` added to the esbuild
  `external` array (alongside the existing `@napi-rs/keyring` entries). This
  is a build-config change outside `aura-digest.ts` but is **required** for
  the migration: `createDefaultAuraClient()` transitively imports the keyring
  (`@pi-aura/shared/keyring`), which on Linux uses `dbus-next`; its
  `address-x11.js` has an optional `require("x11")` that isn't installed and
  can't be resolved at bundle time. The old `bearerClient` path didn't pull
  in `dbus-next`. Without this, `npm run build` fails. Same external-marking
  pattern as the existing `@napi-rs/keyring` entry; no runtime behavior
  change (Node resolves `dbus-next` from `node_modules` at runtime).
- **Stale comment on line 21** — the file header still says "does tool
  discovery first (assertToolsAvailable)…". That's a leftover from the MCP
  era; not updated. Cosmetic only — no code impact. `dedupe-types` or a
  cleanup pass can fix it.

### Divergence from acceptance criteria

1. **`RawAuraData` cast (`as unknown as RawAuraData`)** — the domain types
   use `undefined` where the transitional `RawAuraData` types in `types.ts`
   use `null` (e.g. `PriorityQueueItem.level`, `capacity_percent`). Since
   `RawAuraData` is the `raw.json` contract typed from `types.ts` (not domain
   types), a direct assignment fails the typecheck. The worker used
   `as unknown as RawAuraData` at the assignment boundary. This is
   **transitional** — `dedupe-types` (Level 2) reconciles `RawAuraData` to
   domain types and removes the cast. Flagged for that slice.

2. **`undefined` → `null` normalization at capacity boundary** — domain
   `CapacityTask.capacity_percent` and `PriorityQueueItem.capacity_percent`
   are `number | undefined`, but the digest's `DigestQueueRow.capacity_pct`
   is `number | null`. The worker added `?? null` at the 3 sites where
   capacity values flow from domain types into the digest struct. This is a
   null/undefined normalization, not a behavioral change (JSON serializes
   them differently but the downstream render already handles `null`).

3. **`dbus-next` esbuild external** — see "Out-of-scope changes" above.
   Required for the build to succeed; a legitimate consequence of pulling in
   the shared keyring via `createDefaultAuraClient()`.

4. **`fetchTaskDevLinks` signature unchanged** — per open decision #2, kept
   on `AuraTaskDetail` (structurally compatible with domain `Task`).
   `dedupe-types` retypes it.

5. **Unused domain type imports removed** — after migration, several domain
   types (`BoardBriefing`, `BoardSummary`, `NotificationList`,
   `PriorityQueue`, `Capacity`, `ArtifactList`, `TaskList`,
   `ArtifactApprovals`) were no longer directly referenced (the
   `Promise.all` destructuring infers them; `verifyArtifacts` gets
   `ArtifactApprovals` via the return type). Removed to satisfy
   `noUnusedLocals`.

### Open decisions chosen
- **Seam C (`current_version` → `latest_version`):** applied at 3 sites —
  `version: a.latest_version ?? 0` (digest review), `current_version:
  a.latest_version` (report `pending_review_summary` — field name stays
  `current_version` per the `AuraReport` type; value sourced from domain
  `latest_version`), `reported_version: a.latest_version ?? null`
  (`extractVerifyTargets`). Correct: the latest version IS the current
  version in T01.
- **Seam E (`verifyArtifacts` retyped):** `verifyArtifacts(client: AuraClient,
  ...)` + `client.getArtifactApprovals(c.artifact_id)`. Applied as specified.
- **Seam A (Aura `close()` dropped):** both Aura `client.close()` calls
  removed; the Atlassian `atlassian.close()` kept. Applied as specified.
- **Open decision #2 (`fetchTaskDevLinks`):** kept on `AuraTaskDetail`
  (recommended deferral to `dedupe-types`).
- **Open decision #1 (settings reconciliation):** deferred — both readers
  kept, as recommended.

### Task doc update needed?
Yes — append to `## Implementation notes`:
- Slice `migrate-aura-digest` done: all 12 Aura `callTool` calls →
  `AuraClient` methods; `REQUIRED_TOOLS`/`assertToolsAvailable`/`connect()`
  removed; 2 Aura `client.close()` dropped; Atlassian `McpClient` path
  untouched. `verifyArtifacts` retyped to `AuraClient`. Seam C
  (`current_version`→`latest_version`) applied at 3 sites.
- **Build-config note:** `dbus-next` added to `scripts/esbuild.config.mjs`
  `external` (transitively pulled in by `createDefaultAuraClient()` → keyring
  on Linux; its optional `x11` dep can't bundle). `migrate-aura-cli` will
  inherit this fix (same `external` array, shared config).
- **For `dedupe-types`:** remove the `as unknown as RawAuraData` cast by
  reconciling `RawAuraData` to domain types; retype `fetchTaskDevLinks` to
  `Task`; remove the now-unused `Aura*` types from `types.ts`; the 3 `?? null`
  normalizations can stay or fold into the `RawAuraData` reconciliation.

### User attention needed?
No — scope and API surfaces match the spec. All acceptance criteria met
(`createDefaultAuraClient()` used, all Aura calls migrated, Atlassian kept,
`REQUIRED_TOOLS`/`assertToolsAvailable` removed, `make build`/`npm run build`
produces the `.mjs`). The `dbus-next` external addition is an out-of-scope
build-config change, but it's a necessary consequence of the migration (not
a scope expansion) and uses the same external-marking pattern already in the
file. The stale line-21 comment is cosmetic. The `RawAuraData` cast is
transitional and flagged for `dedupe-types`.
