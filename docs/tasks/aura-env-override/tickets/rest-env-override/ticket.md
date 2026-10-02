---
type: ticket
subtype: feature
title: Env overrides for the shared Aura REST loaders
status: stable
workflow_state: ready
blocked_by: []
---

## What to build

The Aura REST connection becomes env-first at the shared loaders. `AURA_BASE_URL`
overrides the settings file's `aura.baseUrl`, and `AURA_PAT` overrides the Keyring
PAT with a full bypass: when set, the Keyring is never constructed or read (no
unlock prompt, CI-safe). An empty env value counts as unset (falsy-or semantics,
matching the existing `AURA_EMBED_*` pattern). Because every consumer resolves
through these two loaders, the CLI, the aura extensions, the Digest fetch, the
session-start reachability probe, and the reference-cache key all follow env
without any per-consumer change. This ticket also lands the pure MCP-URL
derivation helper beside the settings loader (strip a trailing `/api` segment,
append `/mcp`) for the MCP registration ticket to consume.

Demo: run `aura.mjs` (e.g. `wiki search`) against an env-pointed instance with no
Keyring available at all.

## Acceptance criteria

- [ ] With `AURA_BASE_URL` set, every Aura REST consumer resolves that URL
      regardless of the settings file; an empty value counts as unset
- [ ] With `AURA_PAT` set, the Keyring is never constructed or read and the env
      PAT is used verbatim; an empty value counts as unset
- [ ] With neither var set, behavior and error messages are unchanged (settings
      baseUrl + Keyring PAT, same actionable errors)
- [ ] The derivation helper maps a `/api` base to the `/mcp` endpoint, appends
      `/mcp` to a bare host, and never mutates its input
- [ ] The shared suite covers override precedence, empty-unset, Keyring bypass,
      unchanged fallback, and the derivation cases (process.env save/restore)
- [ ] Demo verified: `aura.mjs` works against an env-pointed instance with no
      Keyring

## Blocked by

None (can start immediately).
