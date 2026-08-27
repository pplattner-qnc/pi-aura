---
kind: map
slug: atlassian-keyring-auth
title: "Own pi-aura's Atlassian access (API token + Basic auth, no borrowed tokens)"
status: active
tasks:
  - slug: atlassian-keyring-auth
    blocked_by: []
    done: true
---

## Destination

pi-aura manages its own Atlassian credentials (email + API token) in the
`@pi-aura/shared` keyring — the same keyring the Aura PAT already lives in —
and uses them directly to authenticate both the Jira/Teamwork Graph dev-links
layer and the Bitbucket dev-links fallback. No code path reads the
`pi-mcp-adapter` OAuth token from the OS keyring, so an expired/refreshed
adapter token can no longer break the digest with `invalid_token`.

## Constraints

- **Auth method**: HTTP Basic auth with an Atlassian email + API token,
  verified working against the Rovo MCP server
  (`https://mcp.atlassian.com/v1/mcp/authv2`) — `initialize` and `tools/list`
  return 200 and expose `getTeamworkGraphContext` / `getTeamworkGraphObject`.
  OAuth 3LO was rejected: it needs an OAuth app, a browser callback server, and
  rotated-refresh-token handling for the same endpoint — 5-8× the cost with no
  payoff for a personal dev tool that already holds a token.
- **Transport**: keep the Rovo MCP server. The raw Teamwork Graph GraphQL
  endpoint (`/gateway/api/graphql/twg`) is EAP/undocumented for standalone
  non-Forge callers, so the MCP server remains the only documented external
  path. `devlinks.ts` call sites stay unchanged.
- **Credential model**: one shared Atlassian credential (email + api_token)
  used by both the Jira/Teamwork Graph layer and the Bitbucket layer. They are
  literally the same `ATLASSIAN_USER_EMAIL` + `ATLASSIAN_API_TOKEN` values
  today; the keyring stores them once. Bitbucket's `defaultWorkspace` is a
  non-secret and stays in `settings.aura.digest.bitbucket.workspace`.
- **No auto-discovery**: the Atlassian credential is entered manually via
  `/aura secrets edit`. (Aura's discover flow stays as-is for the Aura PAT; we
  add no discovery source for the Atlassian credential.)
- **Reuse, don't fork**: extend the existing `@pi-aura/shared` keyring enum and
  the `/aura secrets` command. No new `/atlassian secrets` slash command.

## Decisions so far

- API token + Basic auth, not OAuth 3LO (verified against the live Rovo MCP
  server with the user's existing token).
- Keep the Rovo MCP server as transport; `devlinks.ts` keeps calling
  `getTeamworkGraphContext` / `getTeamworkGraphObject` over MCP.
- Single shared Atlassian credential in the keyring; Bitbucket reuses it.
- Two keyring entries — `{service:"atlassian", name:"email"}` and
  `{service:"atlassian", name:"api_token"}` — mirroring the one-value-per-entry
  Aura pattern.
- Reusable client is a thin Basic-auth `McpClient` wrapper in `@pi-aura/shared`
  (reuses `scripts/src/mcp-client.ts` transport, only swaps the auth-header
  source). No typed `AtlassianClient` interface — over-abstraction for one call
  site using two tools.
- `/aura secrets edit` grows a picker (Aura PAT / Atlassian email / Atlassian
  API token) and reuses the existing editor + confirm flow per secret.
- Scope covers Bitbucket too: `bitbucket.ts` reads the shared keyring
  credential instead of its MCP server env; its `defaultWorkspace` stays a
  non-secret in settings.

## Fog

- Whether `scripts/src/clients.ts`'s `readOAuthTokenFromKeyring` and the whole
  `pi-mcp-adapter` keyring-read path should be deleted or left as dead code
  for one release. (Leaning: delete in the same change, since nothing else
  uses it — to be confirmed by a `grep` sweep in the first task.)
- Whether `/aura secrets edit`'s picker should surface a "list / status" view
  showing which Atlassian secrets are currently set. (Defer — the existing
  Aura flow has no status view either; keep parity.)
- Whether the digest warning text should change when the keyring has no
  Atlassian credential (today it says "invalid_token"; after the swap it should
  say the credential is missing and point at `/aura secrets edit`). Captured
  as an explicit acceptance criterion in the wiring task.

## Out of scope

- OAuth 3LO / refresh-token subsystem (OAuth app, browser authorize + local
  callback server, access+refresh storage, rotated-refresh-token handling,
  401 retry).
- A direct Teamwork Graph GraphQL client bypassing the Rovo MCP server.
- Auto-discovery of the Atlassian credential from `mcp.json` env.
- A separate `/atlassian secrets` slash command.
- Any change to how the Aura PAT itself is discovered/stored (unchanged).
- Migrating `defaultWorkspace` into the keyring (it's a non-secret config
  value; stays in settings).
