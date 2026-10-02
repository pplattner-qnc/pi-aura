---
type: ticket
subtype: feature
title: Extension-owned aura-mcp-dev MCP registration
status: stable
workflow_state: ready
blocked_by: [rest-env-override]
---

## What to build

A new extension takes ownership of the Aura MCP registration. At session start
it registers a session-only server named exactly `aura-mcp-dev`, so tool names
stay `mcp__aura_mcp_dev__*` and the aura skill instructions keep working
unchanged. The URL comes from `AURA_MCP_URL` when set, else it is derived from
the effective `aura.baseUrl` via the derivation helper; the PAT comes from
`AURA_PAT` when set, else the Keyring. The `Authorization: Bearer` header is
inlined into the registered config (pi never renders registered configs; the PAT
must not be printed anywhere else). Exposure is untouched (codemode default).
Registration is attempted only when both URL and PAT resolve; otherwise exactly
one warning notification is shown and nothing is registered. Unregistration at
session shutdown is idempotent and safe when nothing was registered. The
extension does not sniff mcp.json files: pi's own precedence (a file entry with
the same name wins) keeps package users with file declarations working, with the
registration shown as overridden. The Keyring is reached through the repo's
dynamic-import seam, and the extension is listed in the package's extension
manifest.

Demo: `/mcp` lists `aura-mcp-dev` served by the extension; env vars switch the
instance without touching any file.

## Acceptance criteria

- [ ] With env vars set, the session registers `aura-mcp-dev` pointing at the
      env URL with the env PAT
- [ ] With no env vars, the session registers `aura-mcp-dev` with the derived
      URL and the Keyring PAT
- [ ] With nothing resolvable, no registration happens and exactly one warning
      is shown
- [ ] The registration name is exactly `aura-mcp-dev`, keeping tool names
      `mcp__aura_mcp_dev__*`
- [ ] Shutdown unregistration is idempotent and safe when nothing was registered
- [ ] The resolver is a pure exported function with explicit inputs, covered by
      the extension runner suite (fake Keyring, env via save/restore); the
      session-start wiring stays thin
- [ ] The extension is registered in the package manifest so pi loads it

## Blocked by

- rest-env-override
