---
type: ticket
subtype: feature
title: Docs for env vars, MCP ownership, and the manual cutover
status: stable
workflow_state: ready
blocked_by: [rest-env-override, native-mcp-readers, digest-devlinks-native, aura-mcp-registration]
---

## What to build

The docs describe the landed connection story and the owner's manual cutover.
The dev-env doc's connection section is rewritten: the three env vars with their
precedence and empty-unset semantics, the extension-owned MCP registration, the
`pi mcp list` caveat (the server exists only where pi-aura loads), and the
numbered manual nix cutover (import the PAT via `/aura secrets discover`, then
remove the `aura-mcp-dev` declaration from the rendered mcp.json source and
re-render). The aura-digest doc's stale mcp.json wording is updated, and the
untracked migration guide at the repo root is relocated under `docs/` as tracked
reference material.

Demo: the docs describe only behavior that has actually landed.

## Acceptance criteria

- [ ] The dev-env doc documents `AURA_BASE_URL`, `AURA_PAT`, and `AURA_MCP_URL`
      with precedence and empty-unset semantics
- [ ] The dev-env doc documents the MCP ownership story, the `pi mcp list`
      caveat, and the numbered manual cutover order
- [ ] The aura-digest doc no longer claims the old mcp.json path or format for
      digest-fetch
- [ ] The migration guide lives under `docs/`, tracked in git, no longer
      untracked at the repo root
- [ ] No em-dashes anywhere in the touched prose; docs match landed behavior
      only

## Blocked by

- rest-env-override
- native-mcp-readers
- digest-devlinks-native
- aura-mcp-registration
