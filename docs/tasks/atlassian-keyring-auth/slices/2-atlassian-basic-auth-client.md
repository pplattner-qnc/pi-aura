---
kind: slice
slug: atlassian-basic-auth-client
title: "Reusable Basic-auth Atlassian McpClient reading email+token from the keyring"
task: ../task.md
mode: afk
status: todo
size: m
blocked_by:
  - keyring-atlassian-secret-keys
---

## End-to-end behavior

A reusable helper builds an `McpClient` for the Rovo Atlassian MCP server that
authenticates with HTTP Basic auth using the email + API token stored in the
keyring (from slice 1). It is the drop-in replacement for the current
`atlassianClient` in `scripts/src/clients.ts`, which today reads the
pi-mcp-adapter OAuth token. This slice delivers the helper + tests; the digest
script is wired to it in slice 4.

## Acceptance criteria

- [ ] A `buildAtlassianClient` helper (or `atlassianClient`, if kept in the same
      module) lives where the Aura client helpers live (follow the existing
      `@pi-aura/shared` vs `scripts/src/` split — match `HeyApiAuraClient`'s
      home). It reads the Atlassian server URL + server name from
      `settings.aura.mcpServers.atlassian` (default `"atlassian"`) and the
      server entry in `~/.config/mcp/mcp.json` (must be `type: "http"`).
- [ ] It reads `{service:"atlassian",name:"email"}` and
      `{service:"atlassian",name:"api_token"}` from the keyring via
      `createKeyring()`. If either is missing/empty, it throws an error whose
      message names `/aura secrets edit` (this message becomes the digest
      warning in slice 4).
- [ ] It returns an `McpClient` configured with
      `authHeader: "Basic " + base64(`${email}:${token}`)` and the server URL.
      It does **not** send `Bearer`.
- [ ] It does not import `@napi-rs/keyring` or touch the pi-mcp-adapter
      keyring. (That code is removed in slice 4, not here.)
- [ ] Unit tests cover: both keys present → returns a client with the correct
      Basic header (assert the header, not a live call); email missing → throws
      the `/aura secrets edit` message; token missing → same; malformed
      `mcp.json` server entry → throws the existing "not found / not http"
      message.

## Test plan

- **Seams**: inject a fake `Keyring` (the `Keyring` interface is small: implement
  it in the test) and a fake/inlined `mcp.json` content (the existing code reads
  `MCP_CONFIG_PATH`; mirror its seam or factor a `loadMcpConfig(path)` helper
  that's already present in `scripts/src/clients.ts` — use it).
- **Failure modes**: missing keyring entry, empty-string entry, missing server
  in `mcp.json`, server not `type:"http"`, missing `url`.
- **Scenarios**: happy path asserts the constructed `McpClient`'s `authHeader`
  equals the expected Basic value (decode and compare email:token). Do not make
  a live network call in the unit test — the live Basic-auth reachability was
  already verified manually during planning and is not a unit-test concern.
- **Edge cases**: whitespace in the stored email/token (trim? document the
  contract — recommend trimming on read so a trailing newline from the editor
  doesn't break auth).

## Constraints and dependencies

- Depends on slice 1 for the `SecretKey` members.
- Reuse `scripts/src/mcp-client.ts` (`McpClient`) as the transport — only the
  auth-header source changes. Do not write a parallel HTTP client.
- Do not delete `readOAuthTokenFromKeyring` yet (slice 4 does that, after the
  grep sweep). This slice must build alongside the old path so the tree stays
  compilable between slices.
- Keep the helper's home consistent with where the Aura client (`HeyApiAuraClient`)
  lives; if that's `@pi-aura/shared`, put it there and export it, so the
  digest script and any future consumer share one helper.
