---
type: ticket
subtype: feature
title: Native mcp.json reader plus PAT discovery re-point and env source
status: stable
workflow_state: ready
blocked_by: []
---

## What to build

One shared mcp.json reader for HTTP server entries becomes the single way
pi-aura reads MCP connection details: the native path strictly first, the legacy
pi-mcp-adapter path as fallback; native entries are detected by `url` presence
(no `type` check); a bearer token is unwrapped from `headers.Authorization`;
values containing `${` are never returned as tokens. The secrets extension's
mcp-json discovery source consumes this reader, and the discovery registry gains
an env source that surfaces `AURA_PAT` as an import offer when set.

Demo: `/aura secrets discover` offers the env PAT for import and finds tokens in
a native-format mcp.json; on a not-yet-migrated host it still finds the old
`bearerToken`.

## Acceptance criteria

- [ ] The reader returns the url (plus unwrapped bearer when present) for a
      native-format entry, falls back to the legacy path and format only when the
      native file lacks the entry, and returns null when nothing matches
- [ ] A `${...}` template value is never returned as a token
- [ ] The mcp-json discovery source surfaces tokens from native-format mcp.json
      and can never import a template literal into the Keyring
- [ ] The env source offers `AURA_PAT` for import when set and is absent when
      unset
- [ ] Reader tests cover native, legacy, missing-file, and template cases via
      path injection; discovery tests use fake sources and env stubs

## Blocked by

None (can start immediately).
