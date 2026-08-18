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

## Implementation notes

### slice: aura-command-skeleton

Implemented the `/aura` slash-command skeleton in `extensions/aura-secrets.ts`:
registers `/aura` via `pi.registerCommand` with `description`,
`getArgumentCompletions`, and `handler`. The handler parses `args` with the
pure function `parseAuraArgs` and dispatches to stub branches for
`secrets discover` and `secrets edit`, or shows a usage warning for
unknown/empty input. `getArgumentCompletions` completes `secrets` and then
`discover`/`edit`. Added `./extensions/aura-secrets.ts` to root `package.json`
`pi.extensions`.

Additive exports for testability (not in the spec but harmless): `parseAuraArgs`,
`getArgumentCompletions`, and supporting types `AuraSubcommand`,
`ParsedAuraArgs`. The default-export extension function matches the spec
exactly. A smoke test (`extensions/aura-secrets.test.ts`, run via
`node --experimental-strip-types`) and a throwaway tsconfig
(`.work/tsconfig-aura-secrets.json`) were committed as verification
artifacts. `getArgumentCompletions("secrets")` returns the subcommand list
in addition to `"crets "` prefixes, consistent with the spec examples.

Verification: slice tests pass (parse, completions, handler dispatch);
`npm run typecheck` and `npm run build` both clean. Lint gate N/A (no
lint tooling configured in repo).

### slice: secrets-discover

Implemented the `/aura secrets discover` branch in `extensions/aura-secrets.ts`:
`DiscoverySource` interface + extensible `DISCOVERY_SOURCES` array; `mcp-json`
source reads `~/.config/mcp/mcp.json` `mcpServers["aura-mcp-dev"].bearerToken`
and returns `null` on missing/unparseable/no entry/no token. Pure `discoverPat(sources)`
for unit-testability; `handleDiscover(ui, keyringFactory, sources)` thin UI wrapper
notifies a summary, offers import via `ctx.ui.confirm` (single source) or
`ctx.ui.select` (multiple sources), and guards cancel/non-TUI mode (`undefined` →
nothing stored, notify "not stored"). Handler dispatches to `handleDiscover` with
`createKeyring` from `@pi-aura/shared/keyring`.

Deviations from plan (both deliberate, documented in source via
`// rule: dynamic-import-createKeyring`):
1. `createKeyring` is dynamically imported inside the async handler instead of
   statically, because `@pi-aura/shared/keyring`'s internal `.js` extension
   specifiers cannot be resolved by Node's `--experimental-strip-types` loader;
   a static import would break the unit-test entry point
   (`node --experimental-strip-types extensions/aura-secrets.test.ts`). Runtime
   equivalent (handler is async); pi's extension runtime resolves the package
   for static imports, so the dynamic import works there.
2. `readMcpBearerToken` is exported (minor addition beyond spec) so failure-mode
   tests can exercise the `mcp-json` parser against temp files rather than the
   user's real `~/.config/mcp/mcp.json`. Also enabled `allowImportingTsExtensions`
   and added the test file to `include` in `.work/tsconfig-aura-secrets.json`.

Residual risk (carried in slice doc): the handler's `secrets-discover` branch was
not executed end-to-end against a real pi session / real keyring; the dynamic
import of `createKeyring` (and the actual keyring write) only run in the live pi
runtime. `handleDiscover` behavior is covered by unit tests with a fake
`KeyringBackend`. Live-session smoke test remains outstanding.

Verification: slice tests pass (`discoverPat`, `DISCOVERY_SOURCES` extension,
mcp-json helper failure modes, `handleDiscover` no-PAT / confirm-store / decline /
select-store / cancel scenarios, handler dispatch); `npx tsc --noEmit -p
.work/tsconfig-aura-secrets.json` clean; `scripts` + `packages/shared` typecheck
clean; `scripts` build (esbuild bundling) clean. Lint gate N/A.
