---
kind: task
type: feature
slug: clients-cleanup
title: Remove the Aura bearerClient path from clients.ts
map: aura-access-rewrite
status: ready
slices:
- remove-aura-bearer-client
---

## User-visible outcome

`scripts/src/clients.ts` no longer exports the `bearerClient` function
(the Aura MCP-over-HTTP path). The Atlassian path (`atlassianClient`,
`readOAuthTokenFromKeyring`) stays untouched. `mcp-client.ts` stays (the
Atlassian path uses `McpClient`). Once `bearerClient` is unused and the
Atlassian path's `@napi-rs/keyring` dependency is re-evaluated, the dep
graph is consistent with the workspaces decision.

## User story

As a maintainer, I want the dead Aura MCP path removed from `clients.ts`
so the only remaining MCP usage is the Atlassian Teamwork Graph (which is
out of scope but still needed), and the codebase doesn't carry a dead
`bearerClient`.

## Scope boundaries

- Remove `bearerClient` (and its `loadMcpConfig` helper if it becomes
  unused) from `clients.ts`.
- Keep `atlassianClient`, `readOAuthTokenFromKeyring`, and the keyring
  chunk-loading logic (Atlassian path, out of scope).
- Keep `mcp-client.ts` entirely (Atlassian needs `McpClient`).
- Re-evaluate `@napi-rs/keyring` in `scripts/package.json`: the Atlassian
  path still uses it (`readOAuthTokenFromKeyring`), so it likely **stays**
  in `scripts` deps even though the workspaces grilling said drop it — the
  grilling's "drop @napi-rs/keyring" referred to the *Aura* path. Confirm
  whether the Atlassian path keeps it (it does, until/unless that's
  separately reworked).

## Acceptance criteria

- `bearerClient` removed from `clients.ts`; `grep -r bearerClient
  scripts/src` finds no references (the migration task already removed the
  call sites).
- `atlassianClient` and `readOAuthTokenFromKeyring` still present and
  unchanged.
- `mcp-client.ts` unchanged.
- `make typecheck` passes; `make build` passes; `aura-digest.mjs` `fetch`
  still runs (the Atlassian dev-links layer still works via
  `atlassianClient`).
- `@napi-rs/keyring` stays in `scripts/package.json` deps (the Atlassian
  path needs it) — documented in the task body that the workspaces
  grilling's "drop @napi-rs/keyring" is scoped to the Aura path, not the
  Atlassian keyring-read.

## Existing abstractions to use

- The migrated scripts (call sites already on `AuraClient`).

## Architecture / domain decisions

From the first grilling (Q13): remove `bearerClient`'s Aura path only; keep
`atlassianClient`/`readOAuthTokenFromKeyring`/`McpClient`. The
workspaces-grilling "drop @napi-rs/keyring" is scoped to the Aura path
(the Atlassian keyring-read still needs it — confirmed in this task's
scope boundaries).
