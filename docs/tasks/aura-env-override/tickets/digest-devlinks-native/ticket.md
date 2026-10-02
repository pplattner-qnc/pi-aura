---
type: ticket
subtype: bug
title: Digest dev-links on native mcp.json plus bundle rebuild
status: stable
workflow_state: ready
blocked_by: [native-mcp-readers]
---

## What to build

The Digest's Atlassian client connects again after the pi-native MCP migration:
it detects http by `url` presence through the shared mcp.json reader (dropping
the unconditional `type` check that currently breaks it) while keeping its
Keyring-based auth, so digest dev-links return Atlassian results again. The
aura-digest bundle is rebuilt and committed together with the source change, and
the Bitbucket reader's stale mcp.json comment is corrected while in the area.

Demo: `digest-fetch` dev-links return Atlassian results (or, minimally, the
gated dev-links warning no longer fires on a native host).

## Acceptance criteria

- [ ] The Atlassian client resolves the url from a native-format mcp.json entry
      (no `type` field) and no longer throws the unconditional type error
- [ ] Legacy-format fixtures still resolve through the reader's fallback
- [ ] The root vitest suites carry native-format fixtures alongside legacy ones
- [ ] The aura-digest bundle is rebuilt and committed together with the source
      change
- [ ] The Bitbucket reader's comment no longer references the dead mcp.json
      credential path

## Blocked by

- native-mcp-readers
