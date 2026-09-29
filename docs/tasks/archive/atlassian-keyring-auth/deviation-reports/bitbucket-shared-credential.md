## Deviation report — bitbucket-shared-credential

### API surface changes
- **Planned:** No new exports. `bitbucket.ts`'s `loadCreds` is refactored to take
  a `Keyring` + a `defaultWorkspace: string` (injectable), instead of reading
  `mcp.json` env. The live call path (`bbFetch`) constructs the Basic header
  from the keyring creds. Only the credential source changes.
- **Actual:** `loadCreds(keyring, defaultWorkspace)` is exported (for testing)
  and reads email+token via the shared `readAtlassianCredentials(keyring)` from
  `clients.ts`. The `bbFetch` function and all three exported REST helpers
  (`listWorkspaceRepos`, `searchRepoPRs`, `searchRepoBranches`) were threaded
  with a `Keyring` parameter (replacing the old `serverName` param). The
  `fetchTaskDevLinks` signature in `devlinks.ts` changed from
  `(task, settings, mcpServers, atlassian)` to
  `(task, settings, keyring, atlassian)` — the `McpServerNames` param was
  replaced by a `Keyring`. The call site in `aura-digest.ts` was updated
  (`createKeyring()` + new arg order).
- **Impact:** None on dependent slices — this is the final slice (leaf). The
  `fetchTaskDevLinks` signature change is slightly broader than the spec's
  "only the credential source changes" wording, but it's the natural
  consequence of threading the keyring to `bitbucket.ts` (the old `mcpServers`
  param existed solely to pass the `atlassian-bitbucket` server name down to
  `loadCreds`, which no longer reads `mcp.json`).

### Abstraction usage
- Used/was specified: **yes**.
  - `readAtlassianCredentials` (slice 2) reused — imported from `clients.ts`,
    not duplicated. ✓
  - `loadSettings()` / `settings.bitbucket.workspace` — the workspace is read
    from `settings.bitbucket.workspace` in `devlinks.ts` (line 258), threaded
    to `loadCreds` as the `defaultWorkspace` arg. The slice doc said "via
    `loadSettings()`"; the implementation reads it from the `settings` object
    that `aura-digest.ts` already loads via `loadSettings()` and passes as
    `settings.digest` to `fetchTaskDevLinks`. Same source, one level up. ✓
  - Basic-auth header construction unchanged: `Authorization: "Basic " +
    Buffer.from(`${creds.email}:${creds.token}`).toString("base64")` —
    byte-identical to the pre-slice code. ✓
  - `bbFetch` REST paths unchanged: `/repositories/${workspace}`,
    `/repositories/${workspace}/${repo}/pullrequests`,
    `/repositories/${workspace}/${repo}/refs/branches` — all preserved. ✓

### bitbucket.ts reads email+token from keyring via readAtlassianCredentials (shared, not duplicated)?
- **Yes.** `bitbucket.ts` imports `readAtlassianCredentials` from `./clients.js`
  and calls it with the injected `Keyring`. No keyring read logic is
  duplicated; the shared helper from slice 2 is reused. ✓

### defaultWorkspace from loadSettings() not MCP env?
- **Yes.** `devlinks.ts:258` reads `settings.bitbucket.workspace` (which
  `aura-digest.ts` loaded via `loadSettings()` and passed as `settings.digest`).
  The `BITBUCKET_DEFAULT_WORKSPACE` env var is no longer read anywhere in
  `scripts/src`. Grep for `BITBUCKET_DEFAULT_WORKSPACE` in `scripts/src`
  returns nothing. ✓

### Basic-auth header construction unchanged; bbFetch REST paths unchanged?
- **Yes.** The header line is byte-identical. The three REST endpoint paths
  (`/repositories/...`, `.../pullrequests`, `.../refs/branches`) and the
  `api.bitbucket.org/2.0` base URL are unchanged. ✓

### Missing keyring → graceful skip + warning naming /aura secrets edit (no throw)?
- **Yes.** `readAtlassianCredentials` throws the `/aura secrets edit` message
  when email/token are missing/empty. `devlinks.ts` wraps this in a
  pre-check (lines 263-272): it catches the throw and pushes
  `Bitbucket dev-links layer skipped: <reason>` into `errors`, sets
  `bbCreds = null`, and skips the entire Bitbucket layer. No unhandled throw
  escapes. The test "wrapping the thrown error yields a layer-skip warning"
  verifies this. ✓

### Missing workspace → graceful skip + workspace-specific warning?
- **Yes.** `loadCreds` throws a workspace-specific message
  (`"Bitbucket workspace not set in settings (configure
  settings.aura.digest.bitbucket.workspace)"`) when `defaultWorkspace` is
  empty. `devlinks.ts`'s pre-check catches this and pushes
  `Bitbucket dev-links layer skipped: <reason>`. The test asserts the warning
  mentions "workspace" and does NOT mention `/aura secrets edit`. ✓

### atlassian-bitbucket MCP server entry NOT touched; only the script stops reading its env?
- **Yes.** No `mcp.json` file appears in the diff. The `atlassian-bitbucket`
  entry in `~/.config/mcp/mcp.json` is the user's MCP config and is not
  modified. The script no longer reads its `env`; the only reference to
  "atlassian-bitbucket" is in a comment in `bitbucket.ts` explaining the
  server is stdio. ✓

### defaultWorkspace NOT moved into the keyring?
- **Yes.** `SecretKey` in `packages/shared/src/keyring/keyring.ts` has no
  `workspace` member. `defaultWorkspace` is passed as a plain string arg to
  `loadCreds`. ✓

### Out-of-scope changes
- **`fetchTaskDevLinks` signature change** (devlinks.ts): the third param
  changed from `McpServerNames` to `Keyring`. This is slightly broader than
  the arch spec's "only the credential source changes" wording for slice 5,
  but it's the minimal necessary change — the old `mcpServers` param existed
  solely to pass the `atlassian-bitbucket` server name to `loadCreds`, which
  no longer reads `mcp.json`. The call site in `aura-digest.ts` was updated
  consistently. The `McpServerNames` import was removed from `devlinks.ts`
  (it's still used elsewhere in `aura-digest.ts` for `buildAtlassianClient`).
  This is a justified, in-scope consequence of the credential-source swap.
- **Dist rebuild** (`skills/core/aura-digest/dist/aura-digest.mjs`): committed
  build artifact, the compiled output of the `devlinks.ts` + `bitbucket.ts` +
  `aura-digest.ts` source changes. Normal `make build` step, not out-of-scope
  source work.
- **`aura-digest.ts`** (4 lines): imports `createKeyring`, creates the
  keyring instance, passes it to `fetchTaskDevLinks`. This is the necessary
  call-site update for the signature change above.
- No source files outside the spec were touched. `clients.ts`, `settings.ts`,
  `aura-secrets.ts`, and the keyring package source are all unchanged.

### Acceptance-criteria divergence
- `bitbucket.ts`'s credential loader reads from the keyring via
  `createKeyring()` — **met via injection**. `loadCreds` takes a `Keyring`
  param; the live call path in `aura-digest.ts` calls `createKeyring()` and
  threads it through. The slice doc said "via `createKeyring()` (the same
  helper/keys as slice 2)"; the implementation injects the keyring (created
  by the orchestrator) rather than calling `createKeyring()` inside
  `loadCreds` itself — this is the test seam the arch spec asked for
  ("injectable in tests"). ✓
- `defaultWorkspace` from `settings.aura.digest.bitbucket.workspace` via
  `loadSettings()`, not MCP env — **met**. ✓
- Missing keyring → skip + `/aura secrets edit` warning, no throw — **met**. ✓
- Basic-auth header construction unchanged — **met**. ✓
- `scripts` typechecks clean; `vitest run` green with a test asserting
  `loadCreds` reads from a fake keyring and ignores MCP env — **met**
  (`tsc --noEmit` exit 0; 95 tests pass / 0 fail including 9 new bitbucket
  tests; test uses `FakeKeyring`, no `mcp.json` read). ✓

### Task doc update needed?
No. The arch spec's slice 5 section is accurate: `loadCreds` is refactored
with an injectable `Keyring` + `defaultWorkspace`, `readAtlassianCredentials`
is reused, the Basic-auth header and REST paths are unchanged, and
`defaultWorkspace` stays a non-secret in settings. The
`fetchTaskDevLinks` signature change is a natural consequence not explicitly
called out in the spec, but it doesn't affect any downstream slice (slice 5
is the leaf). No `## Architecture notes` or `## Implementation notes` append
is required.

### User attention needed?
No. Scope was followed; the API surface matches the spec. The
`fetchTaskDevLinks` signature change (replacing `McpServerNames` with
`Keyring`) is the only unplanned surface change, and it's the minimal
necessary consequence of the credential-source swap — fully covered by the
updated call site and tests.
