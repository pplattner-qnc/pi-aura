---
type: map
title: Env-var overrides for the Aura connection
status: stable
blocked_by: []
---

## Destination

Both the pi extensions and the `aura.mjs` CLI resolve their Aura REST
connection through the shared loaders, and that connection is overridable
via `AURA_BASE_URL` and `AURA_PAT` env vars: env wins over
`~/.pi/agent/settings.json` (`aura.baseUrl`) and the OS keyring PAT, an env
PAT bypasses the keyring entirely, and `/aura secrets discover` can import
`AURA_PAT` into the keyring. The pi-aura extension owns the Aura MCP
registration: it registers a session-only `aura-mcp-dev` at session
start, resolving URL and PAT env-first exactly like the REST chain
(`AURA_MCP_URL` else derived from `aura.baseUrl`; `AURA_PAT` else
keyring), and the nix mcp.json declaration is removed after the PAT
migrates to the keyring. The migration-guide follow-up work (pi-aura
readers of the new `~/.pi/agent/mcp.json`: dev-links atlassianClient,
readMcpBearerToken, bundle rebuild, docs, tests) is part of this
effort's scope and flows to `to-spec` alongside the env-override work.

## Constraints

- Env wins over both the settings file and the keyring, mirroring the
  `AURA_EMBED_*` precedence in `packages/shared/src/embed/provider.ts`; an
  empty env var counts as unset.
- The single credential resolution path stays single: `AURA_BASE_URL` is
  applied inside `loadAuraClientSettings()` and `AURA_PAT` inside
  `resolveAuraCredentials()`, so every consumer (CLI typed verbs, `rest
  call`, aura-references, aura-feedback, digest fetch, reachability probe,
  reference-cache key) inherits the override.
- `AURA_PAT` set means the keyring is not read at all (no unlock prompt;
  CI/headless-friendly).
- MCP registration rules: register under the exact name `aura-mcp-dev`
  (tool names must stay `mcp__aura_mcp_dev__*`); register only when a URL
  and a PAT resolve, notifying once when they do not; the inlined PAT may
  live in the registered config but must never be printed anywhere else;
  the server exists only where pi-aura loads, so shell commands (`pi mcp
  list`) and keyring-less, env-less sessions have no Aura MCP.
- Tests use the existing seams (settingsPath, injected keyring, vitest); the
  real keyring is unavailable in automated runs.
- Repo conventions: no em-dashes in prose; the docs home for the env vars is
  the "Aura instance + PAT" section of `docs/dev-env.md` (currently stale:
  it claims the PAT is read from mcp.json).

## Decisions so far

- Scope is `baseUrl` + PAT only; mcpServers names, Atlassian/Bitbucket
  credentials, and the rest of the `aura.*` block are not env-overridable.
- Names: `AURA_BASE_URL` + `AURA_PAT` (follows the `AURA_EMBED_*`
  precedent; PAT is the glossary term). Rejected: `PI_AURA_*`,
  `AURA_URL`/`AURA_TOKEN`.
- PAT semantics: fully bypass the keyring when `AURA_PAT` is set. Rejected:
  env as fallback only when the keyring is empty.
- Placement: in the shared loaders. Rejected: only in
  `resolveAuraCredentials()`, because the reachability probe (aura-tasks)
  and the reference cache (aura-references) read `loadAuraClientSettings()`
  directly and would miss the baseUrl override.
- Discovery: `/aura secrets discover` gains an env source offering to
  import `AURA_PAT` into the keyring.
- MCP registration settled (supersedes the earlier keep-literal decision,
  taken before the extension-ownership pivot): the pi-aura extension
  registers a session-only server named `aura-mcp-dev` at session start
  (identical `mcp__aura_mcp_dev__*` tool names, so the aura skill
  instructions keep working), resolving the connection env-first like
  the REST chain: URL from `AURA_MCP_URL` else derived from `aura.baseUrl`
  (strip a trailing `/api` segment when present, then append `/mcp`), PAT
  from `AURA_PAT` else the OS keyring. The nix-side mcp.json declaration
  is removed after the PAT migrates to the keyring. Rejected: the
  sops-rendered literal entry (REST/MCP split), the nix launch wrapper
  (decrypted PAT in pi's process env; rejected by the owner), a
  differently-named session-only server (split tool namespace and
  unavoidable coexistence).
- Mid-execution MCP modification (research): pi 1.0.0 extensions can
  register/unregister session-only servers at any time (later
  registrations connect right away, re-registration replaces, and `${VAR}`
  header templates resolve from pi's env at connect), but a
  file-configured server can never be modified or shadowed by an
  extension: same-name registrations are dropped even when the file entry
  is disabled. Human levers are `/mcp` (reconnect, enable/disable,
  exposure) and `/reload` after external file edits. A registered
  server's config is never rendered by `/mcp` (registeredConfig is
  internal, used only for change detection), so inlining a resolved PAT
  does not leak on screen.
- Migration follow-up work (guide §2) lives in this effort, not its own
  effort; it is implementation input for `to-spec`, with no open decisions
  (the untracked `pi-native-mcp-migration-guide.md` at the repo root
  prescribes the fixes).

## Fog

- Where the env vars are documented beyond `docs/dev-env.md` (aura skill
  docs vs README) is a spec-level detail, not blocking.

## Out of scope

- Atlassian/Bitbucket credential env overrides.
- Embed settings (already env-capable via `AURA_EMBED_*`).
- CLI flags such as `--base-url`.
- The stale `../scripts/src/settings.ts` import at
  `extensions/aura-secrets.ts:358` (latent bug in the guided-walkthrough
  path; deserves its own effort).
