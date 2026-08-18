# Architecture spec — aura-secrets-command

> Task: `aura-secrets-command` (third implementation task of the
> `aura-access-rewrite` map). Builds a pi extension that registers a
> `/aura` slash-command with `secrets discover` + `secrets edit` subcommands,
> using `@pi-aura/shared/keyring` directly. This task gives the user the
> keyring-import UX (store the PAT from mcp.json, edit it interactively)
> that `aura-client`'s smoke test will rely on.

## Goal

`extensions/aura-secrets.ts` registers `/aura` with two `secrets` subcommands:
- **`/aura secrets discover`** — scans an extensible list of `DiscoverySource`s
  (today: mcp.json's `aura-mcp-dev.bearerToken`) for an existing PAT, reports
  which sources were checked and which had a value, and offers to store the
  found PAT in the keyring via `ctx.ui.select`.
- **`/aura secrets edit`** — opens `ctx.ui.editor` prefilled with the current
  PAT (or a placeholder), writes the result back to the keyring.

## Repository today (what we start from)

- `keyring-rewrite` is merged to `main`: `@pi-aura/shared/keyring` exists,
  exporting `createKeyring`, `SecretKey`, `StoredSecret`, `Keyring`,
  `KeyringUnavailableError`, `KeyringLockedError`, `KeyringDBusError`.
  `createKeyring()` returns a `Keyring` (Linux → `SecretServiceKeyring`,
  macOS → `MacosKeyring`, fallback → `FileKeyring`).
- `node_modules/@pi-aura/shared` → `../../packages/shared` (npm workspaces
  symlink, from `workspaces-bootstrap`). The `exports` map has `./keyring`
  → `./src/keyring/index.ts`. Pi loads extension `.ts` directly and resolves
  `@pi-aura/shared/keyring` via this symlink (grilling Q32).
- `extensions/aura-skill-instruction.ts` is the only existing extension
  (a system-prompt injector; `pi.on("before_agent_start", ...)`). This task
  does **not** touch it.
- Root `package.json` `pi.extensions` = `["./extensions/aura-skill-instruction.ts"]`.
  This task appends `./extensions/aura-secrets.ts`.
- No root `tsconfig.json` — pi loads extension `.ts` directly (no esbuild
  step for extensions). Typecheck for extensions: there's no committed
  gate today; the slice docs say "pi loads the extension without error".
  (The `scripts/` tsconfig doesn't include `extensions/`.) The
  `aura-client` task may add a shared tsconfig later; for now, verify the
  extension loads in pi + a manual `tsc --noEmit` against a throwaway
  tsconfig that includes the extension + resolves `@pi-aura/shared`.
- `~/.config/mcp/mcp.json` is the discovery source; it has
  `mcpServers["aura-mcp-dev"].bearerToken` (the PAT to import). The
  existing `scripts/src/clients.ts` `loadMcpConfig` reads this file — borrow
  the pattern, but the extension reads it itself (it's a pi extension, not
  a script).
- `ctx.ui` primitives (confirmed from pi docs/examples): `notify(msg,
  "info"|"warning"|"error")`, `select(title, options[])` →
  `string|undefined`, `confirm(title, msg)` → `boolean`,
  `input(title, placeholder)` → `string|undefined`,
  `editor(title, prefilled)` → `string|undefined` (returns `undefined` on
  cancel or in non-TUI/RPC mode). `pi.registerCommand("name",
  { description, getArgumentCompletions, handler })` where `handler:
  async (args, ctx) => {...}` and `getArgumentCompletions: (prefix) =>
  AutocompleteItem[] | null` with `AutocompleteItem = { value, label }`.

## Per-slice spec

### Slice 1 — `aura-command-skeleton` (size s, no blockers)

**Exports / public API surface:**
- `extensions/aura-secrets.ts`: `export default function (pi: ExtensionAPI)`
  calling `pi.registerCommand("aura", { description,
  getArgumentCompletions, handler })`.
- `handler(args: string, ctx)`: splits `args` (trim + split on whitespace)
  and dispatches on the first token (`secrets`), then the second
  (`discover`/`edit`). Unknown/empty → `ctx.ui.notify(usage, "warning")`.
  The `secrets discover` and `secrets edit` branches are **stubs** in this
  slice — `ctx.ui.notify("not implemented", "info")` (or a TODO). They're
  implemented in slices 2 and 3.
- `getArgumentCompletions(prefix: string)`: returns `AutocompleteItem[]`:
  - completes `secrets` when the prefix doesn't yet include it
  - completes `discover`/`edit` when the prefix is `secrets ` (or `secrets
    d`/`secrets e`)
  - returns `null` when nothing matches
- Root `package.json` `pi.extensions`: append `./extensions/aura-secrets.ts`
  alongside `./extensions/aura-skill-instruction.ts`.
- **Existing abstractions to use:** the `ExtensionAPI` import from
  `@earendil-works/pi-coding-agent` (same as the existing
  `aura-skill-instruction.ts`); the `pi.registerCommand` API from pi docs.
- **Do NOT reimplement:** the keyring (import from `@pi-aura/shared/keyring`
  only if needed; the skeleton may not need it yet — the stubs don't call
  the keyring). The discovery logic (slice 2). The edit logic (slice 3).
- **Interface contract (for slices 2-3):** the handler's dispatch shape —
  `secrets discover` and `secrets edit` branches that slices 2 and 3 fill in.
  Keep the dispatch in a way that's easy to extend (e.g. a `switch` on the
  second token, or a small subcommand map). Slices 2 and 3 will replace the
  stubs with real implementations.

### Slice 2 — `secrets-discover` (size m, blocked by slice 1)

**Exports / public API surface:** implements the `secrets discover` branch
of the handler in `extensions/aura-secrets.ts` (replacing the stub).
- A `DiscoverySource` interface: `{ name: string; find(): Promise<string |
  null> }`.
- A `DISCOVERY_SOURCES: DiscoverySource[]` array (extensible — adding a
  source is appending an object). Today: one source, `mcp-json`, that reads
  `~/.config/mcp/mcp.json` `mcpServers["aura-mcp-dev"].bearerToken`
  (borrow the `loadMcpConfig` pattern from `scripts/src/clients.ts`: read +
  JSON.parse + navigate `mcpServers[serverName].bearerToken`; return `null`
  if missing/unparseable).
- `discover` handler: `const keyring = await createKeyring();` runs each
  source's `find()`, collects `{ name, value: string|null }[]` results;
  `ctx.ui.notify` a summary of which sources were checked and which had a
  value.
- If a PAT is found: `ctx.ui.select("Import Aura PAT from:", [<source
  names with values>])` offers the choice (if multiple sources find
  different PATs) or a single confirm; on confirm, `await
  keyring.setSecret({service:"aura", name:"pat"}, selectedPat)` + notify
  success.
- If no PAT found: notify "no PAT found in any source" (warning).
- Imports `createKeyring`, `SecretKey` from `@pi-aura/shared/keyring`.
- **Existing abstractions to use:** `createKeyring()` + `setSecret` from
  `@pi-aura/shared/keyring`; the mcp.json read pattern from
  `scripts/src/clients.ts` (`loadMcpConfig`); `ctx.ui.select` + `ctx.ui.notify`.
- **Do NOT reimplement:** the keyring. The `/aura secrets edit` flow (slice
  3). The command skeleton (slice 1).
- **Interface contract:** the `DiscoverySource` pattern + `DISCOVERY_SOURCES`
  array is the extension point — future sources (env, other keychain
  entries) append to the array. Slice 3 (`secrets-edit`) is independent.
- **Residual risk (from slice doc):** end-to-end test needs a pi session.
  Extract the discovery + keyring logic into a pure function (e.g.
  `async function discoverPat(sources): Promise<{name, value}[]>`) so it's
  unit-testable without pi; the handler calls it and does the UI.

### Slice 3 — `secrets-edit` (size s, blocked by slice 1)

**Exports / public API surface:** implements the `secrets edit` branch of
the handler in `extensions/aura-secrets.ts` (replacing the stub).
- `edit` handler:
  - `const keyring = await createKeyring();`
  - `const current = await keyring.getSecret({service:"aura", name:"pat"});`
  - `const edited = await ctx.ui.editor("Aura PAT", current ??
    "<paste your Aura PAT here>");`
  - If `edited` is `undefined`/`null` (user cancelled, or non-TUI/RPC mode
    where `editor` returns undefined) → `ctx.ui.notify("no change",
    "info")`.
  - If `edited === current` → `ctx.ui.notify("unchanged", "info")`.
  - Else `await keyring.setSecret({service:"aura", name:"pat"}, edited)` +
    `ctx.ui.notify("saved", "info")`.
  - If `current` is null, the placeholder makes it obvious no PAT was
    stored before.
- Empty-string guard (from slice doc edge case): if `edited === ""`,
  confirm with `ctx.ui.confirm("Save empty PAT?", "An empty PAT won't
  authenticate. Save anyway?")` before storing; on decline, notify "no
  change".
- Error handling: keyring locked → `KeyringLockedError` →
  `ctx.ui.notify(error.message, "error")`.
- Imports `createKeyring`, `SecretKey` from `@pi-aura/shared/keyring`.
- **Existing abstractions to use:** `createKeyring()` + `getSecret` +
  `setSecret` from `@pi-aura/shared/keyring`; `ctx.ui.editor` + `ctx.ui.notify`
  + `ctx.ui.confirm`.
- **Do NOT reimplement:** the keyring. The discovery flow (slice 2). The
  skeleton (slice 1).
- **Interface contract:** this is the last slice; `/aura secrets edit`
  round-trips the PAT through the keyring.
- **Residual risk (from slice doc):** `ctx.ui.editor` returns `undefined`
  in non-TUI (RPC) mode — guard for that (don't treat `undefined` as a
  value to store).

## Cross-slice interface contracts (summary)

```
slice 1: /aura command skeleton + dispatch (secrets discover/edit stubs) + completions
slice 2: secrets discover (DiscoverySource[] + mcp-json source + import offer)  [blocked by 1]
slice 3: secrets edit (keyring getSecret -> ctx.ui.editor -> setSecret)          [blocked by 1]
```

Slices 2 and 3 both branch off slice 1; they're independent of each other.
Dependency levels:
- **Level 0:** `aura-command-skeleton`
- **Level 1:** `secrets-discover`, `secrets-edit` (sequential: shared cwd)

## Abstraction usage summary

- `@pi-aura/shared/keyring` → `createKeyring`, `SecretKey`, errors (from
  `keyring-rewrite`).
- `pi.registerCommand` + `ctx.ui.{notify, select, confirm, editor}` → pi
  extension API (from docs/examples).
- `scripts/src/clients.ts` `loadMcpConfig` → mcp.json read pattern (borrow;
  the extension reads mcp.json itself, not via the script).
- `@earendil-works/pi-coding-agent` `ExtensionAPI` type (same import as the
  existing extension).

## Out of scope (explicit)

- Exposing the `aura.mjs` artifact/wiki/upload CLI as `/aura` subcommands
  (Q3: secrets-only).
- The `list` subcommand (deferred — in map Fog).
- Migrating `aura.ts`/`aura-digest.ts` to use the keyring (that's
  `call-site-migration`).
- Touching `aura-skill-instruction.ts`.
- A new root `tsconfig.json` for extension typecheck (optional; the
  `aura-client` task may add a shared tsconfig. For now, verify the
  extension loads in pi).

## Risk notes

- **No extension typecheck gate today:** there's no root tsconfig including
  `extensions/`, and `scripts/tsconfig.json` doesn't include it. The slice
  docs say "pi loads the extension without error" as the gate. The
  tdd-worker should verify the extension at least type-checks via a
  throwaway `tsc --noEmit` with a minimal tsconfig that includes the
  extension + resolves `@pi-aura/shared` (or by confirming pi loads it).
  If a real gate is wanted, flag it — but don't block on it (the `aura-client`
  task may add a shared tsconfig).
- **`ctx.ui.editor`/`select` in non-TUI mode:** return `undefined`. Both
  slice 2 (discover) and slice 3 (edit) must guard for `undefined` (cancel
  → no write, no crash).
- **mcp.json may be absent/unparseable:** the `mcp-json` source returns
  `null` (don't throw); `discover` reports "no PAT found".
- **End-to-end test needs a pi session:** the discovery + keyring logic
  should be extracted into pure functions (unit-testable without pi); the
  handler is the thin UI wrapper. The on-box gate is: pi loads the
  extension + `/aura` + Tab completes `secrets` + the stubs/discover/edit
  notify correctly. Real keyring round-trip: `/aura secrets discover` with
  a real mcp.json bearerToken stores the PAT; `getSecret` (via a smoke
  script) confirms it.
