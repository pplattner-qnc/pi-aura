---
kind: map
slug: aura-access-rewrite
title: Rewrite the Aura access layer to drop the MCP wrapper
status: active
tasks: "[{slug: aura-access-grilling, blocked_by: [], done: true}]"
---

## Destination

The pi-aura scripts (`aura.ts`, `aura-digest.ts`) talk to Aura **directly via
a generated REST client** (`src/generated/`), behind an **implementation-
agnostic `AuraClient` interface** (method-per-verb, expressive domain types).
The PAT is read from the **OS keyring** (`src/keyring.ts`) at runtime; the
instance base URL comes from the **`aura` block in
`~/.pi/agent/settings.json`**. A new **`/aura` slash-command** (secrets-only)
provides `discover` (scan mcp.json, offer to import the PAT into the keyring)
and `edit` (interactive prefilled editor, save back to the keyring). The
MCP-over-HTTP wrapper (`mcp-client.ts` + the `bearerClient` Aura path in
`clients.ts`) is removed from the Aura path; `McpClient`/`atlassianClient`/
`readOAuthTokenFromKeyring` stay (Atlassian out of scope). The `aura-mcp-dev`
MCP server entry in mcp.json **stays** for agent-driven work via the `aura`
skill.

## Constraints

- **Aura only.** The Atlassian (Jira Teamwork Graph) and Bitbucket MCP
  implementations are out of scope and must not be touched.
- **No new native bindings.** Use the pure-JS `src/keyring.ts`; do not add
  `@napi-rs/keyring` or similar.
- **The generated client is the substrate.** The concrete client delegates to
  `src/generated/`; the `AuraClient` interface owns expressive domain types
  that are mapped to/from the generated types in the implementation only.
- **Don't break the skills.** `aura.mjs` and `aura-digest.mjs` keep working
  end-to-end; `aura.mjs`'s artifact/wiki/upload CLI stays as-is.
- **No hidden plan.** If implementation exposes real uncertainty, stop and
  return to Wayfinder.

## Decisions so far (settled by the grilling task)

- **Q1 Token source (runtime):** keyring only — read the PAT from
  `src/keyring.ts` at runtime.
- **Q2 Call-site shape:** full access-layer redesign with an
  implementation-agnostic `AuraClient` interface between scripts and the SDK.
- **Q3 `/aura` command scope:** secrets-only subcommands; the existing
  `aura.mjs` artifact/wiki/upload CLI stays, not exposed as slash subs.
- **Q4 Base URL / instance:** `~/.pi/agent/settings.json` `aura` block — add
  an instance/baseUrl field; `AuraClient` reads base URL + keyring secret at
  construction.
- **Q5 `AuraClient` shape:** method-per-verb interface, expressive types.
- **Q6 `discover` sources:** mcp.json today, but an extensible discovery-source
  pattern so arbitrary sources (incl. other keychain entries) can be added
  later without rewriting the command.
- **Q7 aura-mcp-dev MCP entry:** stays — the `aura` skill + system-prompt
  instruction still use it for agent-driven work; only the scripts' direct
  dependency is removed. `/aura secrets discover` reads its bearerToken as a
  one-way import, not a removal.
- **Q8 Expressive types:** `AuraClient` (new `src/aura-client.ts`) declares
  its own expressive domain types for inputs/outputs, mapped to/from
  `src/generated/` types in the concrete `HeyApiAuraClient`. Generated types
  never leak into the interface.
- **Q9 Keyring key:** `service="pi-aura"`, `account="aura"` for now — flagged
  as likely-to-rework; treat as a swappable constant.
- **Q10 Client construction:** DI + factory — `HeyApiAuraClient({ keyring,
  baseUrl })`; `createDefaultAuraClient()` in `clients.ts` reads settings +
  builds the keyring. Scripts call the factory; tests inject a fake keyring.
- **Q11 Method coverage:** today's ~21 verbs (the exercised surface:
  getArtifact, mcpUpdateArtifact, mcpCreateArtifact, getKnowledgeNode,
  getKnowledgeNodeByPath, saveKnowledgeNodeBody, mcpWikiSearch,
  getKnowledgeTree, createKnowledgeNode, mcpCreateUploadDocument,
  mcpGetUploadDocument, getBoardBriefing, getBoardSummary, listNotifications,
  getMyPriorityQueue, getMyCapacity, listArtifacts, listTasks,
  getArtifactApprovals, getTaskByHumanKey, getArtifactReview). Grow
  deliberately, don't mirror all 244.
- **Q12 `/aura secrets` subs:** `discover` + `edit`.
- **Q13 `clients.ts` cleanup:** remove `bearerClient`'s Aura path only; keep
  `atlassianClient`/`readOAuthTokenFromKeyring`/`McpClient`.
- **Q14 `edit` semantics:** `ctx.ui.editor` prefilled with the current PAT
  from the keyring (or placeholder if none), writes back on save.

## Facts established by Wayfinder (not the user)

- pi registers a `/aura` command via `pi.registerCommand("aura", { handler,
  getArgumentCompletions })` in a `.ts` extension under `extensions/` (already
  declared in `package.json`'s `pi.extensions`). Subcommands are parsed from
  the `args` string by the handler — no built-in subcommand router.
- Commands run with full system access; can shell out via `node:child_process`
  (many examples do) and can import the bundled `aura.mjs`/scripts.
- `ctx.ui` provides `select`/`confirm`/`input`/`editor` (prefilled editable
  text)/`notify` — supports both the interactive `edit` and the
  `discover`-offer-to-import flows. `ctx.ui.editor(prompt, prefilled)` is the
  primitive for the `edit` subcommand.

## Fog

- The `pi-aura`/`aura` keyring-key surface may be reworked soon (Q9) — code
  treats it as a swappable constant.
- `list` subcommand (show stored accounts without values) was considered and
  deferred; `edit` covers the single-account surface for now.

## Out of scope

- The Atlassian (Jira Teamwork Graph) MCP path in `devlinks.ts`.
- The Bitbucket MCP / direct-REST path in `bitbucket.ts`.
- The Atlassian OAuth keyring-read in `clients.ts`
  (`readOAuthTokenFromKeyring`).
- Changes to `pi-mcp-adapter` itself.
- Re-generating `openapi.yaml` from a live Aura instance (the spec is the
  source of truth; `make codegen` regenerates).
- Exposing the `aura.mjs` artifact/wiki/upload CLI as `/aura` slash
  subcommands.
