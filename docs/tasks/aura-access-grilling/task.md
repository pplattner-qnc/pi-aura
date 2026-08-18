---
kind: task
type: grilling
slug: aura-access-grilling
title: Decide what the Aura access rewrite even is
map: aura-access-rewrite
status: ready
blocked_by: []
---

## Decision to settle

What does "rewrite the code used for accessing Aura" concretely mean? The
pi-aura scripts currently wrap the Aura MCP (reading its connection data from
an MCP server entry configured by `pi-mcp-adapter`). We have already built a
generated REST client (`src/generated/`) and a pure-JS keyring (`src/keyring.ts`).
This task resolves, through one-question-at-a-time conversation, **the
destination of the rewrite** so that downstream implementation task(s) can be
stated precisely.

The decision has four interlocking parts that must all be settled:

1. **Token source** — where the rewritten Aura client reads the PAT/bearer
   token from at runtime.
2. **Migration / config** — whether existing users need a one-time setup
   step, and whether removing the mcp.json dependency is a breaking change
   for installed `pi-aura` users.
3. **Call-site shape** — whether this is a pure transport swap (call sites
   barely change, an adapter absorbs the MCP→REST difference), a transport
   swap + type dedupe (collapse `types.ts` Aura shapes into generated types),
   or a full access-layer redesign (a single `AuraClient` class, all call
   sites migrated, `mcp-client.ts` removed for Aura).
4. **Base URL / instance config** — how the client knows which Aura instance
   to talk to (the generated client hardcodes `http://localhost:3000/api`).

## Parent decisions it depends on

- The map's constraint that this is **Aura only**; Atlassian and Bitbucket
  MCP implementations are untouched.
- The map's constraint that `src/generated/` is the REST substrate and
  `src/keyring.ts` is the credential store (no new native bindings).
- The prior decision that the keyring is **not** a 1:1 replacement of the
  Atlassian OAuth-token read path (so its role here is purely Aura-PAT
  storage if we choose to use it).

## Choices already known

- **Token source:** (a) keep reading `mcp.json`'s `aura-mcp-dev.bearerToken`
  (status quo, zero migration, keeps the mcp.json dependency);
  (b) store the PAT in the OS keyring via `keyring.ts`, read it at runtime
  (removes the mcp.json dependency for Aura; needs a one-time store step);
  (c) env var with keyring fallback, or vice versa.
- **Call-site shape:** (a) transport swap only (smallest diff);
  (b) transport swap + dedupe the Aura shapes from `types.ts` into generated
  types where they overlap (medium);
  (c) full access-layer redesign with an `AuraClient` wrapper (largest).
- **`mcp-client.ts`:** likely **stays** because the Atlassian path still
  uses `McpClient` (out of scope) — confirm, but do not let it block the
  Aura decision.
- **Base URL:** the generated client defaults to the spec's
  `http://localhost:3000/api`; real instances differ, so runtime override
  from config (settings.json? mcp.json URL field? a new config key?) is
  almost certainly required — settle where.

## Recommended starting answer

- **Token source:** keyring (`keyring.ts`), with a small `aura.mjs`-adjacent
  setup command for the one-time store; *fallback* to `mcp.json`'s
  `bearerToken` if present, so existing users aren't broken on upgrade.
- **Call-site shape:** transport swap + type dedupe — adopt the generated
  types where `types.ts` overlaps, keep the digest-specific types in
  `types.ts`.
- **`mcp-client.ts`:** keep it (Atlassian still needs it); only the Aura
  path stops using it.
- **Base URL:** read from `settings.json` (the existing `aura.mcpServers.aura`
  already resolves to an mcp.json entry whose `url` field has the instance
  URL) — reuse that resolution rather than inventing a new config key.

This is a starting point only. Each sub-decision must be confirmed one
question at a time; do not answer on the user's behalf.

## What downstream work the answer may create

- One or more `feature` tasks to: build an `AuraClient` (or adapter) over
  the generated SDK + keyring; migrate `aura.ts` and `aura-digest.ts` call
  sites; collapse overlapping `types.ts` shapes; add a setup/store-token
  command; wire base-URL config.
- A `manual` task if a one-time user setup step (store the PAT) is required
  and can't be automated.
- A possible `prototype` task if the "transport swap vs full redesign"
  choice wants a cheap spike on one call site before committing.
- Removal of the `bearerClient` Aura path from `clients.ts` (the Atlassian
  `atlassianClient` path stays) — may be its own cleanup task.
- Updates to `README.md` and the skills' docs if the user-facing config
  shape changes (breaking change for installed users).
