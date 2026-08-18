---
kind: slice
slug: secrets-discover
title: /aura secrets discover — extensible discovery sources + import offer
task: ../task.md
mode: hitl
status: done
size: m
blocked_by:
  - aura-command-skeleton
---

## End-to-end behavior

`/aura secrets discover` scans an extensible list of `DiscoverySource`s
(today: mcp.json's `aura-mcp-dev.bearerToken`) for an existing PAT, reports
which sources were checked and which had a value, and offers (via
`ctx.ui.select`) to store the found PAT into the keyring.

## Acceptance criteria

- A `DiscoverySource` interface: `{ name: string; find(): Promise<string |
  null> }`.
- A `DISCOVERY_SOURCES: DiscoverySource[]` array (extensible — adding a
  source is appending an object). Today: one source, `mcp-json`, that reads
  `~/.config/mcp/mcp.json` `mcpServers.aura-mcp-dev.bearerToken`.
- `discover` handler: runs each source's `find()`, collects results;
  `ctx.ui.notify` a summary of which sources were checked and which had a
  value.
- If a PAT is found: `ctx.ui.select` offers to store it in the keyring via
  `keyring.setSecret({service:"aura", name:"pat"})`; on confirm, store +
  notify success.
- If multiple sources find different PATs, offer a choice of which to
  import.
- Uses `createKeyring()` from `@pi-aura/shared/keyring`.

## Test plan

- Seams: `DISCOVERY_SOURCES` is the extension point — add a throwaway
  source (env var) in a test to confirm the array pattern works.
- Failure modes: mcp.json missing / no `aura-mcp-dev` entry / no
  `bearerToken` -> source returns null; `discover` reports "no PAT found
  in any source".
- Scenarios: with a real mcp.json bearerToken on the dev box, `/aura
  secrets discover` finds it, offers import, stores it; `getSecret` then
  returns it.
- Edge cases: user declines the import -> nothing stored, notify "not
  stored". PAT already in keyring -> offer to overwrite (confirm).

## Constraints / dependencies

- Blocked by `aura-command-skeleton`.
- Residual: end-to-end test needs a pi session; the discovery + keyring
  logic can be unit-tested by extracting it into a pure function.
