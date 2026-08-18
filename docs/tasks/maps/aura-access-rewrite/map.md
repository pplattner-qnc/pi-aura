---
kind: map
slug: aura-access-rewrite
title: Rewrite the Aura access layer to drop the MCP wrapper
status: active
tasks: "[{slug: aura-access-grilling, blocked_by: [], done: true}, {slug: keyring-key-redesign-grilling, blocked_by: [], done: true}, {slug: workspaces-bootstrap, blocked_by: [], done: false}, {slug: keyring-rewrite, blocked_by: [workspaces-bootstrap], done: false}, {slug: aura-client, blocked_by: [keyring-rewrite], done: false}, {slug: call-site-migration, blocked_by: [aura-client], done: false}, {slug: aura-secrets-command, blocked_by: [keyring-rewrite], done: false}, {slug: clients-cleanup, blocked_by: [call-site-migration], done: false}]"
---

## Destination

The pi-aura scripts (`aura.ts`, `aura-digest.ts`) talk to Aura **directly via
a generated REST client** (`src/generated/`), behind an **implementation-
agnostic `AuraClient` interface** (method-per-verb, expressive domain types).
The PAT is read from the **OS keyring** (a from-scratch-rewritten
`src/keyring.ts`) at runtime; the instance base URL comes from the **`aura`
block in `~/.pi/agent/settings.json`**. A new **`/aura` slash-command**
(secrets-only) provides `discover` (scan mcp.json, offer to import the PAT
into the keyring) and `edit` (interactive prefilled editor, save back to the
keyring). The MCP-over-HTTP wrapper (`mcp-client.ts` + the `bearerClient`
Aura path in `clients.ts`) is removed from the Aura path;
`McpClient`/`atlassianClient`/`readOAuthTokenFromKeyring` stay (Atlassian out
of scope). The `aura-mcp-dev` MCP server entry in mcp.json **stays** for
agent-driven work via the `aura` skill.

## Constraints

- **Aura only.** The Atlassian (Jira Teamwork Graph) and Bitbucket MCP
  implementations are out of scope and must not be touched.
- **No new native bindings.** Use the pure-JS `src/keyring.ts` (rewritten per
  the second grilling); do not add `@napi-rs/keyring` or similar.
- **The generated client is the substrate.** The concrete client delegates to
  `src/generated/`; the `AuraClient` interface owns expressive domain types
  that are mapped to/from the generated types in the implementation only.
- **Don't break the skills.** `aura.mjs` and `aura-digest.mjs` keep working
  end-to-end; `aura.mjs`'s artifact/wiki/upload CLI stays as-is.
- **No hidden plan.** If implementation exposes real uncertainty, stop and
  return to Wayfinder.

## Decisions so far (settled by the grilling tasks)

### First grilling — `aura-access-grilling` (done)

- **Q1 Token source (runtime):** keyring only — read the PAT from the
  rewritten `src/keyring.ts` (see second grilling) at runtime.
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
- **Q9 Keyring key (parked, superseded by second grilling):** `pi-aura`/`aura`
  was the placeholder; the real keyring-key surface is reworked by the second
  grilling below.
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

### Second grilling — `keyring-key-redesign-grilling` (done)

(Sharing-topology decisions below were settled by a follow-up grilling — see
the "Third grilling" section.)


Reworks the `src/keyring.ts` **interface itself** (not just the strings).

- **Q1 What to rework:** drop `service` from `createKeyring`; namespace is an
  internal default; per-secret key becomes a named tuple `{service, name}`;
  a closed enumeration of which secrets this app can store.
- **Q2 Namespace:** literal `"aura-skills"`, fixed, **adjustable per OS**
  (e.g. Windows drops the dash).
- **Q3 Tuple names:** `{service, name}` (renamed `value` → `name`).
- **Q4 Enum shape:** discriminated union of literal-object types; `name` is a
  per-service union when a service has multiple names. Starts as
  `type SecretKey = { service: "aura"; name: "pat" }`.
- **Q5 `listSecrets`:** typed-only `{key, secret}[]`; unknowns surfaced
  separately (then dropped — see Q12).
- **Q6 Backend seam:** dropped — `SecretKey` flows to implementations.
- **Q7 Content type:** flat `string | null`.
- **Q8 Backend shape:** **drop `KeyringBackend` entirely** — concrete
  implementations *are* the `Keyring` interface.
- **Q9 `createKeyring()`:** zero args, no config.
- **Q10 Side-index:** dropped — `listSecrets` probes `getSecret` per known key.
- **Q11 `isAvailable()`:** static on each impl, **not** on the `Keyring`
  interface.
- **Q12 `listUnknownSecrets`:** dropped; `listSecrets` returns typed known
  keys only.
- **Q13 `StoredSecret`:** `{ key: SecretKey; secret: string }`.
- **Q14 OS-string packing:** per-impl (namespace = app identity; svc/name =
  the concrete secret).
- **Q15 `SecretKey` home:** `keyring.ts`.
- **Q16 Namespace normalization:** per-impl (depends on platform).
- **Q17 Linux impl:** **replace `secret-tool` with `dbus-next` Secret
  Service** (pure-JS D-Bus; OpenSession/DH handshake + AES/GCM session
  encryption).
- **Q18 Rewrite scope:** from-scratch `keyring.ts`.
- **Q19 Windows:** dropped from this rewrite (ship macOS + Linux + file).
- **Q20 Priority / dispatch:** `process.platform` decides candidates.
- **Q21 Errors:** three — `KeyringUnavailableError`, `KeyringLockedError`,
  `KeyringDBusError` (off `Error`, with a `code` discriminator).
- **Q22 Dispatch shape:** inline `switch (process.platform)` inside
  `createKeyring()` (Linux branch dispatches to the dbus-next
  `SecretServiceKeyring`, not secret-tool).
- **Q23 `dbus-next` dep:** `dependencies`, static at the module level.
- **Q24 Import tension:** dynamic `import()` inside the `case "linux":` branch
  (so macOS/file never load `dbus-next`'s module graph).
- **Q25 File split:** split by impl — `keyring.ts` (public: `SecretKey`,
  `Keyring`, `createKeyring`, errors, dispatch) +
  `keyring/macos-keyring.ts` + `keyring/secret-service-keyring.ts` +
  `keyring/file-keyring.ts`.

### Third grilling — sharing topology between `scripts/` and the extension (done)

The keyring (and later `AuraClient`, `settings`) is used by **two build
targets**: the `scripts/` esbuild sub-project (bundles `.mjs` for the skills)
and the pi **extension** (`/aura` slash-command `.ts`, loaded directly by pi).
They resolve deps from different `node_modules`.

- **Q26 Shared source home:** an **npm workspace package**.
- **Q27 Shared runtime deps:** declared **once** in the shared package's own
  `package.json` (settled by Q26 — no per-target duplication).
- **Q28 `scripts/` role:** joins the workspaces — root `package.json` declares
  `"workspaces": ["scripts", "packages/shared"]`.
- **Q29 Import style:** by name via `package.json` `exports` —
  `import { createKeyring } from "@pi-aura/shared/keyring"`.
- **Q30 Pkg home + name:** directory `packages/shared/`, npm name
  `@pi-aura/shared`.
- **Q31 Root `package.json`:** add `workspaces` + `@pi-aura/shared` (workspace)
  + `dbus-next`; **drop `@napi-rs/keyring`** (the rewrite drops it). The shared
  package's own `package.json` declares `dbus-next` + `@hey-api/client-fetch`
  (single-source); workspace install propagates them. `scripts/package.json`
  drops `@napi-rs/keyring`, gains `@pi-aura/shared`.
- **Q32 Shared build:** the shared package exports **`.ts` sources** (no build
  step); both consumers compile/bundle it themselves (pi loads `.ts`, esbuild
  bundles `.ts`). Zero build artifact to commit.
- **Q33 Makefile install:** changes from `cd scripts && npm install` to a
  **root `npm install`** (root is the workspaces root); one install populates
  `scripts/node_modules` + `packages/shared/node_modules` + symlinks
  `@pi-aura/shared` into both.

**Consequence folded in:** pi's root `npm install` (run on `pi install` of this
package) populates everything via the workspaces symlink — no separate
per-target install.

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
- `dbus-next` (v0.10.2) is pure JS (no `.node` bindings); its deps include
  `event-stream` (a 2018 supply-chain-noted package, dev/debug transitive —
  auditable, worth pinning). No maintained pure-JS Secret Service *library*
  exists for Node; the dbus-next impl must speak the D-Bus protocol itself.

## Task graph

1. `aura-access-grilling` (grilling, **done**) — settled the overall
   destination (14 decisions across 5 rounds).
2. `keyring-key-redesign-grilling` (grilling, **done**) — settled the
   `src/keyring.ts` interface redesign (25 decisions across 7 rounds).
3. Sharing-topology grilling (inline, **done**) — settled how the keyring /
   `AuraClient` / `settings` source is shared between the `scripts/` esbuild
   project and the pi extension (8 decisions: npm workspace package
   `@pi-aura/shared` at `packages/shared/`, both `scripts/` and the extension
   import it by name via `exports`, root is the workspaces root).

Implementation tasks (from-scratch `keyring.ts` rewrite in `packages/shared/`;
`AuraClient` + factory; call-site migration + type dedupe; `/aura secrets`
extension; `clients.ts` cleanup; repo restructure to workspaces) are spawned
by the next Wayfinder pass now that all three grillings are closed.

## Fog

- `list` subcommand (show stored accounts without values) was considered and
  deferred; `edit` covers the single-account surface for now.
- Windows keyring support deferred (Q19) — file fallback covers Windows
  users meanwhile; a later feature task would grill the CredRead approach.

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
- A Windows keyring backend in this rewrite (deferred — file fallback only).
