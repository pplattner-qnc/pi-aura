---
kind: map
slug: aura-access-rewrite
title: Rewrite the Aura access layer to drop the MCP wrapper
status: active
tasks: "[{slug: aura-access-grilling, blocked_by: [], done: false}]"
---

## Destination

The pi-aura scripts (`aura.ts`, `aura-digest.ts`) talk to Aura **exclusively
through an MCP-over-HTTP wrapper** (`mcp-client.ts` + the `bearerClient` path
in `clients.ts`): they read an MCP server entry from `~/.config/mcp/mcp.json`
(configured by `pi-mcp-adapter`), build an `McpClient`, and call Aura by MCP
tool name (`getArtifact`, `mcpUpdateArtifact`, `listTasks`, …) with
hand-maintained TypeScript shapes in `types.ts`.

Done looks like: the scripts talk to Aura's REST API **directly** using the
generated typed client (`src/generated/`, from `openapi/openapi.yaml` via
`@hey-api/openapi-ts`), with the PAT sourced from somewhere other than the
MCP server entry. The MCP wrapper for Aura is gone. The exact token source,
migration path, call-site shape, and type strategy are decided by the first
task (a grilling).

## Constraints

- **Aura only.** The Atlassian (Jira Teamwork Graph) and Bitbucket MCP
  implementations are out of scope and must not be touched. `devlinks.ts`'s
  Atlassian path and `bitbucket.ts` stay as-is.
- **No new native bindings.** The pure-JS keyring (`src/keyring.ts`) we
  already built is the credential store if a store is needed; do not add
  `@napi-rs/keyring` or similar.
- **The generated client is the substrate.** `src/generated/` exists and
  typechecks; the rewrite uses it rather than hand-rolling fetch calls.
- **Don't break the skills.** `aura.mjs` and `aura-digest.mjs` (built by
  `make`) keep working end-to-end.
- **No hidden plan.** If implementation exposes real uncertainty, stop and
  return to Wayfinder rather than improvising.

## Decisions so far

- We built `src/generated/` (244 typed SDK functions, `@hey-api/client-fetch`,
  OpenAPI 3.1) — this is the REST client the rewrite targets.
- We built `src/keyring.ts` (pure-JS, cross-platform, full CRUD) — the
  candidate credential store, **not** a 1:1 replacement of the Atlassian
  OAuth-token read path.
- Scope is **exclusively the Aura MCP**; Atlassian + Bitbucket MCP paths are
  untouched.
- The "what are we even doing" questions (token source, migration, call-site
  shape, type strategy) are deferred to a dedicated grilling task rather
  than answered upfront.

## Fog

- Where does the PAT come from at runtime? (mcp.json status quo / keyring /
  env var). Decided in the grilling task.
- Is this a pure transport swap, a transport swap + type dedupe, or a full
  access-layer redesign? Decided in the grilling task.
- Migration: do existing users need a one-time "store token" step, or is it
  zero-config if they already have mcp.json? Decided in the grilling task.
- Does `mcp-client.ts` get deleted entirely, or kept because the Atlassian
  path still uses `McpClient`? (Atlassian is out of scope, so `McpClient`
  likely stays for it — confirm in grilling.)
- Should the generated client's `baseUrl` (`http://localhost:3000/api` from
  the spec) be overridden from config at runtime, since real instances differ?
- Does removing the MCP wrapper change the user-facing `mcp.json` /
  settings shape, and is that a breaking change for installed `pi-aura` users?

## Out of scope

- The Atlassian (Jira Teamwork Graph) MCP path in `devlinks.ts`.
- The Bitbucket MCP / direct-REST path in `bitbucket.ts`.
- The Atlassian OAuth keyring-read in `clients.ts` (`readOAuthTokenFromKeyring`).
- Changes to `pi-mcp-adapter` itself.
- Re-generating `openapi.yaml` from a live Aura instance (the spec is the
  source of truth; `make codegen` regenerates).
