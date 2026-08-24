## Deviation report — secrets-discover

### Summary

The implementation matches the arch spec and slice doc on the public API
surface and all acceptance criteria. The `DiscoverySource` pattern,
`DISCOVERY_SOURCES` array, `mcp-json` source, import-offer flow, and
pure-function extraction are all present and correct. No blockers.

### API surface changes
- **Planned:** `DiscoverySource` interface, `DISCOVERY_SOURCES` array, the
  `mcp-json` source, the `discover` handler branch, import offer via
  `ctx.ui.select`, `createKeyring` + `setSecret` from `@pi-aura/shared/keyring`.
- **Actual:** Matches. `handleDiscover(ui, keyringFactory, sources)` is the
  thin UI wrapper; `discoverPat(sources)` is the pure function. Import offer
  uses `ctx.ui.confirm` for a single source and `ctx.ui.select` for multiple.
- **Impact:** None.

### Abstraction usage
- `createKeyring` from `@pi-aura/shared/keyring` — used correctly.
- mcp.json read (`readMcpBearerToken`) re-derived inline (the extension is a
  pi extension, not a script; it does not import from `scripts/src/clients.ts`).
- `ctx.ui.select` / `ctx.ui.confirm` / `ctx.ui.notify` — per the pi API.

### Out-of-scope changes
- None. The `secrets edit` branch remains a stub (slice 3).

### Acceptance criteria
- `DiscoverySource` extensible array ✅ (adding a source = appending an
  object; tested with a throwaway env source).
- `mcp-json` source reads `mcpServers["aura-mcp-dev"].bearerToken`, returns
  `null` on missing/unparseable/no entry/no token ✅.
- Import offer via `ctx.ui.select`; guards `undefined` (cancel/non-TUI) →
  nothing stored, notify "not stored" ✅.
- Summary notify of sources checked + which had a value; "no PAT found"
  when none ✅.
- Pure-function extraction (`discoverPat`) for unit-testability ✅ (residual
  risk addressed).

### Task doc update needed?
- No — the land-worker appended the slice-2 implementation note to
  `## Implementation notes` already.

### User attention needed?
- No.
