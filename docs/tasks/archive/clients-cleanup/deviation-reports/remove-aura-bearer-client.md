## Deviation report — remove-aura-bearer-client

### API surface changes
- **Planned:** Remove `bearerClient` from `scripts/src/clients.ts`; delete the
  dead `scripts/src/aura-client.ts` shim; remove the dead codegen tree
  (`scripts/src/generated/`, `scripts/openapi/`, `scripts/openapi-ts.config.ts`);
  drop `@hey-api/client-fetch` (dep) + `@hey-api/openapi-ts` (devDep) + the
  `codegen` script from `scripts/package.json`; clean dead entries from
  `scripts/.gitignore`. Keep `loadMcpConfig`, `atlassianClient`,
  `readOAuthTokenFromKeyring`, `mcp-client.ts`, and `@napi-rs/keyring`.
- **Actual:** Exactly as planned. `bearerClient` removed (clients.ts lines
  42–62). `aura-client.ts` deleted (dead shim). `scripts/openapi/` (17635-line
  `openapi.yaml`) + `scripts/openapi-ts.config.ts` deleted.
  `scripts/package.json` lost `@hey-api/client-fetch`, `@hey-api/openapi-ts`,
  and the `codegen` script; kept `@napi-rs/keyring`, `@modelcontextprotocol/sdk`,
  `@pi-aura/shared`, `esbuild`, `typescript`, `@types/node`.
  `scripts/.gitignore` lost the `src/generated/` + `openapi-ts-error-*.log`
  lines. `loadMcpConfig` kept (line 37; `atlassianClient` uses it at line 121).
  `atlassianClient` (line 120), `readOAuthTokenFromKeyring` (line 51), the
  keyring chunk logic, `mcp-client.ts`, and `devlinks.ts` all unchanged.
- **Impact:** None — this is the last child of the `aura-access-rewrite` map.
  The scripts' Aura MCP path is fully gone; the only remaining MCP usage is
  the Atlassian Teamwork Graph (out of scope). The map is finalizable after
  this slice lands.

### Abstraction usage
- Used/was specified: **yes.** `loadMcpConfig` kept (used by `atlassianClient`);
  `@napi-rs/keyring` kept (Atlassian keyring-read via dynamic `import()`);
  `mcp-client.ts` unchanged; the Atlassian path (`atlassianClient` +
  `readOAuthTokenFromKeyring` + chunk logic) untouched. The dead `aura-client.ts`
  shim (only re-exported `bearerClient` + `McpClient`, both with direct
  importers or removed) was deleted as specified.

### Out-of-scope changes
- None. No file outside the spec's planned changes was touched.
  `mcp-client.ts`, `devlinks.ts`, `bitbucket.ts`, `Makefile`, and the shared
  package were all unchanged.

### Open decisions chosen
1. **Makefile `clean` target + `GEN_DIR`/`OPENAPI_DIR` vars:** **no Makefile
   changes needed.** The `OPENAPI_DIR` and `GEN_DIR` vars were already repointed
   to `$(SHARED_DIR)/openapi` and `$(SHARED_DIR)/src/generated` in the
   `aura-client` task. The `clean` target's `rm -rf $(GEN_DIR)` correctly
   clears `packages/shared/src/generated`. This matches the recommended option
   (repoint `GEN_DIR` to the shared generated tree) — already done.
2. **`scripts/.gitignore` `src/generated/` entry:** **removed** (recommended)
   — the `src/generated/` + `openapi-ts-error-*.log` lines are gone; the
   `.gitignore` now has only `node_modules/` + `package-lock.json`.
3. **Dead generated tree removal timing:** **removed now** (recommended) —
   `scripts/src/generated/` (gitignored, dead), `scripts/openapi/`, and
   `scripts/openapi-ts.config.ts` all removed in this slice.

### Divergence from acceptance criteria
- None material. All acceptance criteria satisfied (verified against source):
  `grep -rn bearerClient scripts/src` → no matches; `aura-client.ts` deleted;
  `atlassianClient`/`readOAuthTokenFromKeyring`/`mcp-client.ts` unchanged;
  `loadMcpConfig` kept; `@napi-rs/keyring` stays; `@hey-api/*` + `codegen`
  script gone from `scripts/package.json`; `scripts/src/generated/` +
  `scripts/openapi/` + `scripts/openapi-ts.config.ts` gone. `cd scripts && npm
  run typecheck` passes; `cd scripts && npm run build` produces both `.mjs`;
  `cd packages/shared && npm run typecheck` passes (no cross-breakage).

### Stale comment (cosmetic, non-blocking)
- `scripts/src/clients.ts` line 3 still reads `- Aura (aura-mcp-dev): HTTP +
  bearer token from ~/.config/mcp/mcp.json.` in the file header. The Aura
  bearer path (`bearerClient`) was just removed; this comment is now stale
  (the Atlassian line below it is still accurate). Cosmetic — does not affect
  typecheck/build/runtime. The land-worker or a follow-up may update it; not
  worth blocking the slice.

### Task doc update needed?
Yes — minor: append to `## Implementation notes` that the slice landed
(bearerClient + aura-client.ts shim + dead codegen tree + @hey-api deps
removed; Atlassian path + @napi-rs/keyring + loadMcpConfig kept; Makefile
unchanged since GEN_DIR was already repointed). Note the stale line-3 comment
in `clients.ts` for a future cosmetic pass.

### User attention needed?
No — scope and API surfaces match the spec exactly. All three open decisions
chose the recommended option. The only flag is a cosmetic stale comment in
`clients.ts` (non-blocking).
