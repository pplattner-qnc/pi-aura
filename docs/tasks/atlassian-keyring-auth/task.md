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
