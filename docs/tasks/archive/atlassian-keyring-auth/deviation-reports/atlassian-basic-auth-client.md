## Deviation report — atlassian-basic-auth-client

### API surface changes
- **Planned:** `atlassianClient` rewritten in `scripts/src/clients.ts` to read
  the keyring + send Basic auth; a new `readAtlassianCredentials(keyring)` helper
  exported for shared use by `atlassianClient` and `bitbucket.ts` (slice 5).
- **Actual:** Exactly that, plus two small additions:
  1. `loadMcpConfig(path)` was exported (was module-private). Needed so tests can
     inject a temp `mcp.json`. Justified — it's the seam the arch spec named.
  2. An `AtlassianClientOptions` interface (`{ keyring?, configPath? }`) was added
     as the optional 2nd arg to `atlassianClient`. The spec's signature was
     `atlassianClient(serverName?: string): Promise<McpClient>`; the implementation
     is `atlassianClient(serverName?, opts?)`. This is a backward-compatible
     widening (production callers omit `opts`) and is the test seam the spec asked
     for ("factor a loadMcpConfig(path) helper that's already present — use it" +
     "inject a fake Keyring"). Both additions are test seams, not behavior changes.
- **Impact:** None on dependent slices. Slice 4 calls `atlassianClient()` with no
  opts (unchanged call site). Slice 5 imports `readAtlassianCredentials` (present,
  exported, correct signature). The `opts` parameter is optional and ignored by
  production callers.

### Abstraction usage
- Used/was specified: **yes**.
  - `McpClient` (`scripts/src/mcp-client.ts`) reused as the transport — **unchanged**
    except for a new `get authHeader()` getter added so tests can assert the header
    without a network call. This is a read-only accessor on existing state, not a
    transport change; justified by the spec's "assert the authHeader" seam.
  - `createKeyring()` reused (imported from `@pi-aura/shared/keyring`).
  - `loadMcpConfig(path)` reused (now exported for the test seam).
  - `devlinks.ts` **not touched** (confirmed: empty diff). ✓
  - `settings.ts` **not touched** (confirmed: empty diff). ✓
  - `@napi-rs/keyring` / `pi-mcp-adapter` keyring **not imported by the new path**
    (the new `atlassianClient` body uses only `@pi-aura/shared/keyring`). ✓

### readOAuthTokenFromKeyring left present (NOT deleted — slice 4 deletes it)
- **Confirmed present and intact.** `readOAuthTokenFromKeyring` (line 54), the
  `@napi-rs/keyring` dynamic import (line 59), and the `pi-mcp-adapter.oauth`
  service constant (line 66) all remain in `clients.ts`. The new `atlassianClient`
  body no longer calls `readOAuthTokenFromKeyring`, so it's now dead code — exactly
  as the spec intended ("build alongside the old path so the tree stays
  compilable between slices"; "slice 4 only deletes the old implementation").
  The module header comment correctly notes it's "kept below for slice 4 to
  delete after the grep sweep". ✓

### Out-of-scope changes
- **Dist rebuilds** (`skills/core/aura-digest/dist/aura-digest.mjs`,
  `skills/core/aura/dist/aura.mjs`, `.pi/skills/engineering-sync/dist/engineering-sync.mjs`):
  these are committed build artifacts in this repo. The diff is the compiled
  output of the `clients.ts` + `mcp-client.ts` source changes (verified: the
  added/removed lines correspond exactly to `readAtlassianCredentials`,
  `atlassianClient`'s Basic-auth body, and the `authHeader` getter; plus the
  slice-1 `KNOWN_SECRET_KEYS` additions already landed). This is the normal
  `make build` step, not out-of-scope source work.
- No source files outside the spec were touched. `devlinks.ts`, `settings.ts`,
  `bitbucket.ts`, `aura-secrets.ts`, and the keyring package are all unchanged.

### Acceptance-criteria divergence
- `atlassianClient` reads the keyring + sends `Basic` auth, not `Bearer` — **met**
  (source: `authHeader: "Basic " + credential`; test: "does not send Bearer auth").
- Reads `{service:"atlassian",name:"email"}` + `{name:"api_token"}` via
  `createKeyring()` — **met**. Production path calls `createKeyring()`; tests
  inject a `FakeKeyring` via `opts.keyring`.
- Throws `/aura secrets edit` message when either is missing/empty — **met**
  (`readAtlassianCredentials` throws `"No Atlassian credential in keyring (run
  \`/aura secrets edit\`)"`; 6 tests cover missing/empty email + token at both
  the helper and client level).
- Server URL from `mcp.json` (must be `type:"http"`) — **met**. Missing/non-http/
  no-url server throws the preserved "not found or not http" message (3 tests).
- Server name from `settings.aura.mcpServers.atlassian` — **met via the call
  site**, not inside `atlassianClient`. The orchestrator
  (`scripts/src/aura-digest.ts:474`) calls
  `buildAtlassianClient(settings.mcpServers.atlassian)`, which forwards to
  `atlassianClient(serverName)`. The arch spec's "Migration note" explicitly
  preserved `atlassianClient`'s `(serverName?)` signature so `devlinks.ts` stays
  untouched; the settings-reading correctly stays one level up. This is a spec
  nuance (slice doc criterion 1 said "reads ... from settings"; the arch-spec
  migration note said "keep the name+signature"), not a deviation — the
  migration note governs.
- Trim whitespace on read — **met** (`rawEmail?.trim() ?? ""`; test: "trims
  whitespace on both values" + "trims whitespace in stored values before building
  the header").
- No live network call in tests — **met** (tests assert `client.authHeader`, never
  call `connect()`).
- `readOAuthTokenFromKeyring` kept — **met** (present, now dead code).
- typecheck + vitest green — **met** (`tsc --noEmit` exit 0; 81 tests pass = 16
  new + 65 existing).

### Task doc update needed?
No. The `readAtlassianCredentials(keyring)` interface contract in the arch spec
is accurate: it's exported, takes a `Keyring`, returns `{email, token}`, throws
the `/aura secrets edit` message on missing/empty. Slice 5 can consume it as
specified. The `AtlassianClientOptions` test seam is a minor addition not in the
spec's literal signature, but it's the injection mechanism the spec's "Seams"
section asked for — no contract change for downstream slices.

### User attention needed?
No. Scope was followed; the API surface matches the spec (with justified,
backward-compatible test-seam additions). The `authHeader` getter on `McpClient`
and the exported `loadMcpConfig` are the only unplanned surface additions, both
test-only, both consistent with the spec's seam instructions.
