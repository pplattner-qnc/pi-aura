---
kind: task
type: feature
slug: aura-secrets-command
title: /aura secrets slash-command (discover + edit) extension
map: aura-access-rewrite
status: ready
slices:
- aura-command-skeleton
- secrets-discover
- secrets-edit
---

## User-visible outcome

A pi extension `extensions/aura-secrets.ts` registers a `/aura` slash-command
with `secrets` subcommands: `/aura secrets discover` (scan mcp.json for an
existing PAT, offer to import it into the keyring via `ctx.ui.select`) and
`/aura secrets edit` (open `ctx.ui.editor` prefilled with the current PAT,
save back to the keyring). The command uses `@pi-aura/shared/keyring`
directly. The extensible discovery-source pattern lets more sources be
added later without rewriting the command.

## User story

As a user, I want a `/aura` slash-command to discover my existing Aura PAT
(from mcp.json) and store it in the OS keyring, and to edit it interactively,
so the scripts can authenticate via the keyring without me hand-editing
config files.

## Scope boundaries

- New file `extensions/aura-secrets.ts`; registered via
  `pi.registerCommand("aura", { handler, getArgumentCompletions })`.
- Subcommands parsed from the `args` string by the handler (no built-in
  router): `secrets discover`, `secrets edit`.
- `discover`: scans mcp.json's `aura-mcp-dev.bearerToken` today; an
  extensible `DiscoverySource[]` registry so more sources (env, other
  keychain entries) can be added later (Q6).
- `edit`: `ctx.ui.editor("Aura PAT", currentPatOrPlaceholder)` -> writes
  back to the keyring via `keyring.setSecret({service:"aura", name:"pat"})`.
- Imports `createKeyring`, `SecretKey` from `@pi-aura/shared/keyring`.
- Does **not** expose the `aura.mjs` artifact/wiki/upload verbs as slash
  subs (Q3: secrets-only).
- Does **not** touch the existing `aura-skill-instruction.ts` extension.

## Acceptance criteria

- `/aura` command registered; `/aura secrets discover` and
  `/aura secrets edit` work in a pi session.
- `getArgumentCompletions` completes `secrets` and its subcommands.
- `discover`: reads `~/.config/mcp/mcp.json`, finds the `aura-mcp-dev`
  bearerToken; if found, `ctx.ui.select` offers to store it in the keyring;
  reports which sources were checked and which had a value.
- `discover`'s `DiscoverySource[]` is an array where each source has a
  `name`, `find(): Promise<string|null>`, and adding a source is appending
  to the array.
- `edit`: reads the current PAT from the keyring, opens `ctx.ui.editor`
  prefilled, writes the result back (unless the user cancels / it's
  unchanged).
- The extension is added to root `package.json` `pi.extensions`.
- `make build` / pi load the extension without error.

## Existing abstractions to use

- `@pi-aura/shared/keyring` — `createKeyring()`, `SecretKey`.
- pi's `pi.registerCommand`, `ctx.ui.select`, `ctx.ui.editor`, `ctx.ui.notify`
  (confirmed available in the grilling's fact-finding).
- `~/.config/mcp/mcp.json` reading (existing pattern in `clients.ts`).

## Architecture / domain decisions

From the first grilling: `/aura secrets discover` + `edit` (Q12/Q14),
extensible discovery sources (Q6), `ctx.ui.editor` prefilled (Q14),
secrets-only (Q3). From the third grilling: the extension imports
`@pi-aura/shared/keyring` by name via the workspace package.
