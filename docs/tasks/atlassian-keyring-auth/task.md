---
kind: task
type: feature
slug: atlassian-keyring-auth
title: "Own pi-aura's Atlassian access: API token + Basic auth in the keyring"
map: atlassian-keyring-auth
status: ready
slices:
- keyring-atlassian-secret-keys
- atlassian-basic-auth-client
- aura-secrets-edit-picker
- digest-script-own-credential
- bitbucket-shared-credential
---

## User-visible outcome

Running `digest-fetch` (and thus the `/aura-digest` dashboard) no longer breaks
with `Teamwork Graph dev-links layer skipped: ... invalid_token` when the
pi-mcp-adapter OAuth token has expired. pi-aura stores its own Atlassian email
+ API token in the same `@pi-aura/shared` keyring the Aura PAT already uses,
and authenticates to the Rovo MCP server with HTTP Basic auth. The Bitbucket
dev-links fallback reads the same keyring credential instead of the
`atlassian-bitbucket` MCP server's env. The user provisions the credential once
via `/aura secrets edit`.

## User story

- As a pi-aura user, I run `/aura secrets edit`, pick "Atlassian email", paste
  my Atlassian account email, then pick "Atlassian API token" and paste my
  token. Both land in the keyring.
- The next `digest-fetch` reads those from the keyring and authenticates to the
  Rovo MCP server with Basic auth. Teamwork Graph dev-links resolve even if the
  pi-mcp-adapter OAuth token is long expired.
- If I haven't set the Atlassian credential yet, `digest-fetch` skips the
  Teamwork Graph layer with a clear warning that names `/aura secrets edit`,
  not `invalid_token`.
- The Bitbucket fallback stops reading `ATLASSIAN_*` from the
  `atlassian-bitbucket` MCP server env and reads the same keyring credential.

## Scope boundaries

In scope:
- `@pi-aura/shared` keyring enum gains `atlassian` email + api_token keys.
- A reusable Basic-auth `McpClient` wrapper in `@pi-aura/shared` (or the
  scripts workspace, wherever the Aura client helper lives) that reads email +
  token from the keyring and sends `Authorization: Basic base64(email:token)`.
- `/aura secrets edit` gains a picker to choose which secret to edit.
- `scripts/src/clients.ts` (`atlassianClient`) switches to the new wrapper and
  the keyring; `readOAuthTokenFromKeyring` and the pi-mcp-adapter keyring read
  path are deleted (after a `grep` sweep confirms nothing else uses them).
- `scripts/src/bitbucket.ts` reads email + token from the keyring; its
  `defaultWorkspace` continues to come from settings.
- Digest warning text for the missing-credential case points at
  `/aura secrets edit`.

Out of scope (see map.md "Out of scope"):
- OAuth 3LO / refresh-token subsystem.
- A direct Teamwork Graph GraphQL client.
- Auto-discovery of the Atlassian credential.
- A separate `/atlassian secrets` slash command.
- Changes to Aura PAT discovery/storage.
- Moving `defaultWorkspace` into the keyring.

## Acceptance criteria

- [ ] `SecretKey` in `packages/shared/src/keyring/keyring.ts` includes
      `{ service: "atlassian"; name: "email" }` and
      `{ service: "atlassian"; name: "api_token" }`, and the keyring backends'
      `KNOWN_SECRET_KEYS` lists them.
- [ ] A `buildAtlassianClient` helper (or equivalent) reads the two keyring
      entries and returns an `McpClient` configured for Basic auth against the
      Rovo MCP server URL from `mcp.json` (server name from
      `settings.aura.mcpServers.atlassian`, default `"atlassian"`).
- [ ] `/aura secrets edit` presents a chooser (Aura PAT / Atlassian email /
      Atlassian API token) and edits the chosen secret with the existing
      editor + confirm flow; no new slash command is registered.
- [ ] `scripts/src/clients.ts` no longer imports or calls
      `readOAuthTokenFromKeyring`; that function and the `@napi-rs/keyring`
      keyring-read path are removed. `atlassianClient` uses the new helper.
- [ ] `scripts/src/bitbucket.ts` reads email + token from the keyring (same
      helper/secret keys), not from the `atlassian-bitbucket` MCP env.
      `defaultWorkspace` still comes from settings.
- [ ] When the Atlassian keyring entries are absent, `digest-fetch` emits a
      digest warning of the form
      `Teamwork Graph dev-links layer skipped: no Atlassian credential in keyring (run \`/aura secrets edit\`)`
      (and the Bitbucket layer degrades similarly), never `invalid_token`.
- [ ] `make build` succeeds; both `scripts` and `digest-dashboard` typecheck
      clean; `vitest run` is green with new tests covering the keyring enum,
      the Basic-auth client, the edit picker, and the missing-credential
      warning paths.

## Existing abstractions to use

- `@pi-aura/shared/keyring` (`SecretKey`, `Keyring`, `createKeyring`,
  `FileKeyring`/`SecretServiceKeyring`/`MacosKeyring`) — extend the `SecretKey`
  enum; do not fork the keyring.
- `scripts/src/mcp-client.ts` (`McpClient`) — reuse as the transport; only the
  auth header changes.
- `scripts/src/settings.ts` (`loadSettings`, `McpServerNames`,
  `AuraDigestSettings.bitbucket.workspace`) — server names + workspace already
  live here.
- `extensions/aura-secrets.ts` (`parseAuraArgs`, `decideEditAction`,
  `handleEdit`, `getArgumentCompletions`) — extend the edit handler with a
  chooser; keep the pure `decideEditAction` seam testable.
- `scripts/src/devlinks.ts` — call sites (`atlassian.callTool(...)`) stay
  unchanged; only the `atlassian` client's construction changes.

## Architecture / domain decisions

- One shared Atlassian credential serves Jira/Teamwork Graph and Bitbucket
  (they are the same `ATLASSIAN_USER_EMAIL` + `ATLASSIAN_API_TOKEN` today).
- Basic auth, not OAuth: verified that the Rovo MCP server returns the TWG
  tools under Basic auth with the user's existing token.
- Keep the Rovo MCP server as transport; do not build a direct GraphQL client.
- `defaultWorkspace` is a non-secret config value; it stays in
  `settings.aura.digest.bitbucket.workspace`, not the keyring.
- The pi-mcp-adapter keyring-read path is deleted in this change (nothing else
  consumes it). Confirm with a `grep` sweep before deleting.

## Implementation notes

### slice: keyring-atlassian-secret-keys (landed)

- `SecretKey` union in `packages/shared/src/keyring/keyring.ts` extended from
  1 to 3 members: added `{ service: "atlassian"; name: "email" }` and
  `{ service: "atlassian"; name: "api_token" }`. Both carry an inline comment
  documenting the empty-string-as-not-set contract, mirroring the Aura PAT.
- `KNOWN_SECRET_KEYS` in all three backends (`file-keyring.ts`,
  `macos-keyring.ts`, `secret-service-keyring.ts`) lists both new keys, so
  `listSecrets` probes them with no per-backend special casing.
- New test file `packages/shared/test/keyring.test.ts` (18 tests) covers
  set/get/overwrite/delete/missing/empty-string round-trips for both new keys
  plus an `aura/pat` regression block, all through the `FileKeyring(storePath)`
  test seam (no platform dependency).
- No consumer files touched. The two new keys are writable but unused after
  this slice — downstream slices (2–5) will read them.
- Verified: `tsc --noEmit` exit 0; `tsx --test` 54 pass / 0 fail (36 pre-existing
  + 18 new). No divergence from the slice spec.

### slice: atlassian-basic-auth-client (landed)

- `scripts/src/clients.ts` now builds the Atlassian `McpClient` with HTTP Basic
  auth (`authHeader: "Basic " + base64(email:token)`) instead of the
  pi-mcp-adapter OAuth `Bearer` token. The email + API token are read from the
  `@pi-aura/shared` keyring via a new `readAtlassianCredentials(keyring)`
  helper that trims whitespace on read and throws an error naming
  `/aura secrets edit` when either value is missing/empty.
- `atlassianClient(serverName, opts?)` gained an optional `AtlassianClientOptions`
  seam (`keyring?`, `configPath?`) for test injection; production callers omit
  it and `createKeyring()` + `~/.config/mcp/mcp.json` are used at runtime.
  `loadMcpConfig` was exported to serve as the config-path seam.
- `readOAuthTokenFromKeyring` is **kept** (not deleted) per the slice spec —
  slice 4 will remove it after the grep sweep. The module comment was updated
  to reflect the Basic-auth switch.
- `McpClient` gained a readonly `get authHeader()` accessor so unit tests can
  assert the constructed header without a network call.
- New test file `test/atlassian-keyring-auth/clients.test.ts` (16 tests) covers:
  both keys present → correct Basic header (decode + compare email:token);
  no Bearer; whitespace trimming; email/token missing/empty → `/aura secrets edit`
  throw; server missing / not http / no url → existing "not found or not http"
  throw; default server name. Uses a `FakeKeyring` implementing the `Keyring`
  interface and temp `mcp.json` files.
- Skill bundle dist files (`aura.mjs`, `aura-digest.mjs`) were rebuilt to
  pick up the slice-1 keyring enum changes and the new `authHeader` getter.
### slice: aura-secrets-edit-picker (landed)

- `/aura secrets edit` now shows a chooser (`ui.select`) with three options —
  "Aura PAT", "Atlassian email", "Atlassian API token" — plus a cancel option.
  Selecting cancel exits with "no change" and writes nothing to the keyring.
- New pure exported function `pickSecretKey(choice: string | undefined): SecretKey | null`
  maps chooser labels to `SecretKey` values: `"Aura PAT"` → `{service:"aura",name:"pat"}`,
  `"Atlassian email"` → `{service:"atlassian",name:"email"}`, `"Atlassian API token"` →
  `{service:"atlassian",name:"api_token"}`, and `undefined`/unknown → `null`.
- `handleEdit` was generalized with three optional parameters (`key`, `label`,
  `placeholder`) defaulting to the existing Aura PAT behavior, so prior callers and
  tests are unaffected. The confirm dialog now uses the label dynamically
  (`"Save empty ${label}?"`). `decideEditAction` is unchanged.
- New exported orchestrator `handleSecretEdit(ui, keyringFactory)` shows the chooser,
  maps the choice via `pickSecretKey`, reads the current value from the keyring,
  and routes through `handleEdit` with the correct key/label/placeholder.
- Constants `SECRET_LABELS` (readonly tuple of the three labels) and
  `SECRET_PLACEHOLDERS` (label → placeholder string) keep the mapping in one place.
  The Atlassian token label is explicitly "Atlassian API token" (not just "API token")
  to disambiguate from the Aura PAT.
- `extensions/aura-secrets.test.ts` gained `pickSecretKey` pure tests (6 assertions)
  and edit-handler chooser routing tests (5 scenarios): each secret → correct key,
  cancel → no keyring write / editor never opened, distinct labels. A new
  `makeMockEditChooserUi` fake supports `select` + `editor` + `confirm` + `notify`.
- `/aura secrets discover` is unchanged (still only discovers the Aura PAT from
  `mcp.json`); no new slash command registered; `getArgumentCompletions` unchanged.
- Divergence notes from the TDD worker: (1) `handleEdit` was generalized with
  defaulted optional parameters rather than a thin wrapper, to keep existing
  Aura PAT tests passing without changes; (2) `handleSecretEdit` is exported as a
  new orchestrator (mirroring how `handleEdit`/`handleDiscover` are exported for
  testing); (3) `pickSecretKey` accepts `string | undefined` (not just `string`)
  because `ui.select` returns `undefined` for cancel/non-TUI — tests cover this.
- Verified: `node --experimental-strip-types extensions/aura-secrets.test.ts` all
  tests passed; `npx vitest run` 12 files / 81 tests passed; `npx tsc --noEmit -p
  scripts/tsconfig.json` clean. No blockers from verification.

### slice: digest-script-own-credential (landed)

- `readOAuthTokenFromKeyring` and the entire pi-mcp-adapter OAuth keyring-read
  path (the `@napi-rs/keyring` dynamic import, `createHash` import, and the
  chunked-reassembly logic) were deleted from `scripts/src/clients.ts`. The
  `atlassianClient` now exclusively uses `readAtlassianCredentials(keyring)`
  (from slice 2) to read the email + API token from the `@pi-aura/shared`
  keyring and sends HTTP Basic auth. `devlinks.ts` call sites are unchanged.
- The module comment in `clients.ts` was updated to remove the "kept below for
  slice 4 to delete" note, and the `node:crypto` import was removed (no longer
  needed after deleting the sha256 account-name computation).
- `scripts/src/keyring.ts`: a comment that referenced `@napi-rs/keyring` by
  name was generalized to "other keyring libs" since the project no longer
  depends on that library directly.
- New tests in `test/atlassian-keyring-auth/clients.test.ts` (slice 4 block,
  5 tests): assert `readOAuthTokenFromKeyring` is no longer exported from
  `clients.ts`; verify `atlassianClient` throws a `/aura secrets edit` message
  when the keyring is empty; verify wrapping that error yields a warning
  containing `Teamwork Graph dev-links layer skipped` and `/aura secrets edit`;
  verify the warning does NOT contain `invalid_token`; verify the exact warning
  format matches
  `Teamwork Graph dev-links layer skipped: No Atlassian credential in keyring (run \`/aura secrets edit\`)`.
- The grep sweep (`grep -rn "readOAuthTokenFromKeyring\|pi-mcp-adapter.oauth\|sha256-" scripts/src`)
  was performed by the TDD worker; no remaining references to the old path
  were found in `scripts/src` or the digest-dashboard extension.
- TDD worker divergence notes: the missing-credential tests replicate the
  try/catch wrapping shape from `devlinks.ts`'s `buildAtlassianClient` rather
  than injecting a fake keyring into `buildAtlassianClient` directly, because
  `buildAtlassianClient` does not accept an injectable keyring seam. This is
  a test-level choice and does not affect production behavior.


