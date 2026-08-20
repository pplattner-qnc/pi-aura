# Architecture spec — `clients-cleanup`

> Shared across all slice chains. Stable once approved.

Task: `docs/tasks/clients-cleanup/task.md`. Map: `aura-access-rewrite`.
**One slice, one level:** `remove-aura-bearer-client` (size s).

## Destination (from task + map)

Remove the dead Aura MCP-over-HTTP path (`bearerClient`) from
`scripts/src/clients.ts`. The Atlassian path (`atlassianClient`,
`readOAuthTokenFromKeyring`, the keyring chunk-loading logic) stays untouched.
`mcp-client.ts` stays (the Atlassian path uses `McpClient`). The
`@napi-rs/keyring` dep stays in `scripts/package.json` (the Atlassian
keyring-read needs it — the workspaces grilling's "drop @napi-rs/keyring" was
scoped to the Aura path). After this, the only remaining MCP usage in the
scripts is the Atlassian Teamwork Graph (out of scope but still needed).

## Cross-cutting facts established

- `call-site-migration` already removed every `bearerClient` call site from
  `aura.ts`/`aura-digest.ts` (they use `createDefaultAuraClient()` now).
- The only remaining `bearerClient` reference is its own definition in
  `clients.ts` (line 42) + a re-export in the dead `scripts/src/aura-client.ts`
  shim (line 6). Nothing imports `bearerClient` anymore.
- `scripts/src/aura-client.ts` is a now-dead shim that re-exports
  `bearerClient` (being removed) and `McpClient` (imported directly from
  `./mcp-client.js` by `clients.ts` + `devlinks.ts`). It is not an esbuild
  entry point; nothing imports from it. Remove it as part of this cleanup.
- `loadMcpConfig` (line 37 in `clients.ts`) is used by both `bearerClient`
  (being removed) **and** `atlassianClient` (line 146, staying) → **keep
  `loadMcpConfig`**. The `MCP_CONFIG_PATH` const + `McpServerConfig`/
  `McpConfig` interfaces are also still used by `atlassianClient` → keep.
- `@napi-rs/keyring` stays in `scripts/package.json` (`readOAuthTokenFromKeyring`
  uses it via dynamic `import("@napi-rs/keyring")`).
- `make` is not on `PATH` on this NixOS env — verify via
  `cd scripts && npm run typecheck` + `npm run build`.

## Slice 1 — `remove-aura-bearer-client` (size s)

### Exports / planned changes
- `scripts/src/clients.ts`: remove the `bearerClient` function (lines ~42-62).
  Keep `loadMcpConfig`, `readOAuthTokenFromKeyring`, `atlassianClient`, the
  keyring chunk logic, `MCP_CONFIG_PATH`, and the `McpConfig`/`McpServerConfig`
  interfaces (all used by `atlassianClient`).
- `scripts/src/aura-client.ts`: **delete the file** (dead shim — only re-exports
  `bearerClient` + `McpClient`, neither of which has an importer via this file).
- Do NOT touch `mcp-client.ts`, `atlassianClient`, `readOAuthTokenFromKeyring`,
  `devlinks.ts`, `bitbucket.ts`, `scripts/package.json` (keep `@napi-rs/keyring`).

### Existing abstractions to use
- The migrated scripts (already on `AuraClient` — no call sites to update).

### Do NOT reimplement / out of scope
- Do not remove `loadMcpConfig` (still used by `atlassianClient`).
- Do not remove `@napi-rs/keyring` from `scripts/package.json` (Atlassian path).
- Do not touch the Atlassian path or `mcp-client.ts`.
- Do not remove `scripts/src/generated/` or `scripts/openapi*` in this slice
  (the task scope is `bearerClient`; the dead generated tree removal is a
  separate concern — confirm with the user if the worker finds it in scope).
  Actually — re-reading the task: the map/task say "Remove `bearerClient`'s
  Aura path" + the `clients-cleanup` map narrative says "remove `bearerClient`'s
  Aura path + the dead `scripts/src/generated/` tree + `scripts`' `@hey-api/*`
  deps". So the dead generated tree + `@hey-api/*` deps ARE in scope. See below.

### Dead generated tree + `@hey-api/*` deps (also in scope per the map)
The `call-site-migration` arch-spec lessons + the map's `clients-cleanup`
narrative say this task also removes:
- `scripts/src/generated/` (the old generated tree — now dead; the scripts
  reach Aura via `packages/shared/src/generated/` through `HeyApiAuraClient`).
- `scripts/openapi/` + `scripts/openapi-ts.config.ts` (the old codegen config
  — now dead; the codegen lives in `packages/shared/`).
- `scripts/package.json`: remove `@hey-api/client-fetch` (dep) +
  `@hey-api/openapi-ts` (devDep) + the `codegen` script (the codegen moved to
  `packages/shared`). Keep `@napi-rs/keyring`, `@modelcontextprotocol/sdk`,
  `@pi-aura/shared`, `esbuild`, `typescript`, `@types/node`.
- `scripts/.gitignore`: the `src/generated/` + `openapi-ts-error-*.log` entries
  are now dead (the generated tree is gone) — remove them (optional, cosmetic).
- `Makefile`: the `codegen` target was already repointed to `packages/shared`
  in the `aura-client` task; the `OPENAPI_DIR := $(SCRIPTS_DIR)/openapi` +
  `GEN_DIR := $(SCRIPTS_DIR)/src/generated` vars are now dead in `scripts` —
  check if the `clean` target still references `$(GEN_DIR)` and update it
  (the `clean` target removes `$(GEN_DIR)` which is now `scripts/src/generated`
  — keep or drop based on whether the dir still exists; since we're removing
  it, drop the `$(GEN_DIR)` reference from `clean`, or repoint `GEN_DIR` to
  the shared package's generated dir).

> **Note:** The task doc's explicit scope is `bearerClient` removal; the
> generated-tree + `@hey-api/*` removal comes from the map narrative + the
> `call-site-migration` lessons. Both are the natural "clients-cleanup" scope
> (remove everything the Aura path left dead). The worker should do both;
> flag in the deviation report if it splits or defers either.

### Acceptance criteria (from slice doc + task)
- `bearerClient` removed from `clients.ts`; `grep -rn bearerClient scripts/src`
  → no matches.
- `scripts/src/aura-client.ts` deleted (dead shim).
- `atlassianClient` + `readOAuthTokenFromKeyring` + `mcp-client.ts` unchanged.
- `loadMcpConfig` kept (atlassianClient uses it).
- `scripts/src/generated/` + `scripts/openapi/` + `scripts/openapi-ts.config.ts`
  removed; `scripts/package.json` loses `@hey-api/*` + `codegen` script.
- `@napi-rs/keyring` stays in `scripts/package.json`.
- `cd scripts && npm run typecheck` passes; `cd scripts && npm run build`
  passes (both `.mjs` produced); the Atlassian dev-links path still works
  (`atlassianClient` intact).

### Test plan
- The typechecker is the test: if `bearerClient`/the generated tree is still
  referenced, the removal fails the build.
- `cd scripts && npm run typecheck` + `npm run build` clean.
- `grep -rn bearerClient scripts/src` → no matches.
- `grep -rn "@hey-api" scripts/src scripts/package.json` → no matches in
  `scripts/src` (the `@hey-api/*` deps are gone from `scripts/package.json`).

### Interface contract (for map finalization)
After this slice, the scripts' Aura MCP path is fully gone; the only MCP
usage is the Atlassian Teamwork Graph. The `aura-access-rewrite` map is then
finalizable (this is its last child).

## Open decisions (flag in deviation reports, don't block)

1. **`Makefile` `clean` target + `GEN_DIR`/`OPENAPI_DIR` vars:** after
   removing `scripts/src/generated/`, the `clean` target's `rm -rf $(GEN_DIR)`
   is a no-op (or removes a non-existent dir). Recommendation: repoint
   `GEN_DIR` to `$(SHARED_DIR)/src/generated` so `make clean` still clears the
   shared generated tree, OR drop the `$(GEN_DIR)` reference. Flag the choice.
2. **`scripts/.gitignore` `src/generated/` entry:** remove (dead) or keep
   (harmless). Recommendation: remove for cleanliness. Flag.
3. **Dead generated tree removal timing:** remove in this slice (per the map
   narrative) or defer. Recommendation: remove now — it's the natural
   `clients-cleanup` scope and the task is the last map child. Flag.
