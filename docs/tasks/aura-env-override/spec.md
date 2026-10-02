---
type: spec
title: Env-var overrides for the Aura connection
status: stable
---

## Problem Statement

The Aura connection details for both the pi extensions and the `aura` CLI
are pinned to files: `aura.baseUrl` lives in the sops-rendered settings
file, the PAT lives in the OS Keyring, and the `aura-mcp-dev` MCP server
was declared in an mcp.json file. A developer cannot point a session, a
script, or a CI run at a different Aura instance (or a different token)
without editing sops-managed files or provisioning the Keyring on that
machine. Headless environments have no interactive Keyring at all. After
the pi-native MCP migration, the file-based readers in this package also
read a dead path and a dead format, which breaks digest dev-links and PAT
discovery.

## Solution

One env-first credential story, applied at the shared loaders so every
consumer inherits it: `AURA_BASE_URL` and `AURA_PAT` override the settings
file and the Keyring respectively (empty value counts as unset; `AURA_PAT`
set means the Keyring is not read at all). The pi-aura extension takes
ownership of the Aura MCP registration: it registers a session-only server
named `aura-mcp-dev` at session start, resolving the URL from
`AURA_MCP_URL` or by deriving it from `aura.baseUrl`, and the PAT from
`AURA_PAT` or the Keyring, so the same override chain covers REST and MCP.
`/aura secrets discover` can import `AURA_PAT` into the Keyring, and its
mcp-json source learns the native mcp.json format. The digest's Atlassian
client reads the native format (with a legacy fallback), restoring
dev-links.

## User Stories

1. As a developer using pi, I want to point the aura extension and the CLI
   at a different Aura instance by exporting `AURA_BASE_URL`, so that I can
   work against staging without editing sops-managed settings.
2. As a developer using pi, I want `AURA_PAT` to override the Keyring PAT,
   so that I can test a rotated or scoped token without touching the
   Keyring.
3. As a CI pipeline author, I want to run `aura.mjs` with `AURA_BASE_URL`
   and `AURA_PAT` set, so that no OS Keyring or interactive unlock is
   needed in headless runs.
4. As a developer, I want an empty `AURA_PAT` or `AURA_BASE_URL` to count
   as unset, so that shell passthroughs like `AURA_PAT="$AURA_PAT"` never
   break resolution.
5. As a pi user, I want the aura extension, the reference engine, the
   Digest fetch, the session-start reachability probe, and the CLI to all
   honor the same env overrides, so that every Aura surface agrees on
   which instance and token are in play.
6. As a pi user, I want the reference cache to key its entries by the
   effective base URL, so that switching instances via env never
   cross-contaminates cached references.
7. As a pi user, I want the reachability probe to probe the
   env-overridden URL, so that "Aura unreachable" warnings match reality.
8. As a pi user, I want `/aura secrets discover` to offer importing
   `AURA_PAT` into the Keyring, so that an env token can be persisted for
   sessions that run without env vars.
9. As a pi user, I want the mcp-json discovery source to read the native
   mcp.json format (`url` + `headers.Authorization`), so that PAT
   provisioning keeps working for file-based setups.
10. As a pi user, I want discovery to never import a literal `${...}`
    template string as a token, so that garbage never lands in the
    Keyring.
11. As a pi user on a not-yet-migrated host, I want the legacy mcp.json
    path and format to still be readable (strictly as fallback), so that
    mixed fleets keep working during rollout.
12. As a pi user, I want the extension to register the `aura-mcp-dev` MCP
    server at session start by default, so that Aura mcp* tools are
    available without any mcp.json declaration.
13. As a pi user, I want the registered server's tool names to stay
    `mcp__aura_mcp_dev__*`, so that existing instructions and habits keep
    working unchanged.
14. As a pi user, I want the registered server to use `AURA_MCP_URL` when
    set, else derive the MCP URL from `aura.baseUrl`, so that env-driven
    sessions point MCP at the same instance as REST without a second
    setting.
15. As a pi user, I want the registered server to use `AURA_PAT` when set,
    else the Keyring PAT, so that one credential story covers REST and
    MCP.
16. As a pi user with no env vars and a provisioned Keyring, I want the
    registered server to work exactly as before, so that default sessions
    need nothing new.
17. As a pi user with no resolvable URL or PAT, I want one clear
    notification that Aura MCP is unavailable, so that I know why the
    tools are missing instead of discovering it at call time.
18. As a package user who keeps a file-configured `aura-mcp-dev`, I want
    my file declaration to keep working (files take precedence over
    extension registrations), so that upgrading pi-aura never breaks my
    setup.
19. As a developer, I want docs to state that `aura-mcp-dev` appears only
    in sessions with pi-aura loaded, so that a missing entry in `pi mcp
    list` is not mistaken for breakage.
20. As a digest user, I want digest dev-links to work again after the
    mcp.json migration, so that the Atlassian client reads the native
    format (url-based, no `type` field).
21. As a repo maintainer, I want the rebuilt aura-digest bundle committed
    together with the source changes, so that package users get working
    dev-links without building anything.
22. As a developer, I want `docs/dev-env.md` to describe the env vars,
    their precedence, and the MCP ownership story, so that setup is
    self-serve.
23. As the nix config owner, I want the manual cutover documented (import
    the PAT into the Keyring, then remove the `aura-mcp-dev` declaration
    from the rendered mcp.json source), so that the switch is deliberate
    and reversible.
24. As an agent working in a pi session, I want env overrides to resolve
    identically in the extension and the CLI, so that a mixed
    extension-plus-CLI workflow never talks to two different Aura
    instances.
25. As a developer, I want the registered MCP config to never leak the PAT
    into any UI or log output, so that the credential stays in process
    memory only.

## Implementation Decisions

- **Env precedence lives inside the shared loaders.** The shared settings
  loader applies `AURA_BASE_URL` over the settings file's `aura.baseUrl`,
  and the shared credential resolver applies `AURA_PAT` over the Keyring.
  Both use falsy-or semantics (empty string = unset), matching the
  existing `AURA_EMBED_*` pattern. No consumer reads `process.env`
  directly for these two names.
- **`AURA_PAT` fully bypasses the Keyring.** When set, the Keyring is not
  constructed or read at all: no unlock prompt, CI-safe. When unset, the
  existing Keyring path and its actionable errors are unchanged.
- **Single resolution path preserved.** The CLI's typed verbs and `rest
  call`, the reference engine, the feedback extension, the Digest fetch,
  the reachability probe, and the reference-cache key all resolve through
  the two loaders; none of them changes.
- **MCP URL derivation.** A pure helper derives the MCP URL from
  `aura.baseUrl` by stripping a trailing `/api` segment when present and
  appending `/mcp` (a baseUrl without the `/api` suffix gets `/mcp`
  appended as-is). `AURA_MCP_URL` wins whenever set. No new settings
  field is introduced.
- **Extension-owned MCP registration.** A new extension registers a
  session-only server named exactly `aura-mcp-dev` on `session_start` and
  unregisters it on `session_shutdown` (idempotent). The config carries
  `url` plus an inlined `Authorization: Bearer <pat>` header (pi never
  renders registered configs, verified against pi 1.0.0; the PAT must not
  be printed anywhere else). No `exposure` override: the codemode default
  applies. Registration is attempted only when both URL and PAT resolve;
  otherwise the extension notifies once (warning) and registers nothing.
  The extension does not sniff mcp.json files: pi's own precedence (a
  file entry with the same name wins) keeps package users with file
  declarations working, with the registration listed as overridden.
- **Shared mcp.json reader.** One shared helper reads an HTTP server entry
  by name: the native path strictly first, the legacy path as fallback;
  native entries are detected by `url` presence (no `type` check); a
  bearer token is unwrapped from `headers.Authorization`; values
  containing `${` are never returned as tokens (template guard). The
  digest's Atlassian client and the secrets extension's mcp-json
  discovery source both consume this helper; the Atlassian client drops
  its `type !== "http"` check and keeps its Keyring-based auth.
- **Discovery env source.** The discovery registry gains an env source
  that surfaces `AURA_PAT` (when set) as an import offer, named after the
  variable so the user can tell it apart from file sources.
- **Bundle and docs.** The aura-digest esbuild bundle is rebuilt and
  committed with the source changes. The dev-env doc's connection section
  is rewritten (env vars, precedence, MCP ownership, the `pi mcp list`
  caveat, the manual nix cutover steps); the aura-digest doc's mcp.json
  wording is updated; the untracked migration guide moves under `docs/`
  as reference material.

## Testing Decisions

- A good test asserts external behavior only: given an env state, a
  settings fixture, a fake Keyring, or an mcp.json fixture, expect the
  resolved credentials, the derived URL, the registration payload (or the
  skip-plus-message outcome), the discovery results, or the reader's
  entry. No internals, no live network, no real Keyring, ever.
- **Seam 1 (existing, extended):** the shared settings loader and
  credential resolver keep their injection points (`settingsPath`,
  injected `Keyring`); env precedence (override wins, empty = unset,
  `AURA_PAT` bypass) is tested by mutating `process.env` with
  save/restore in the shared package's runner (`tsx --test`, `node:test` +
  `node:assert/strict`). Prior art: the existing `aura-credentials` suite.
- **Seam 2 (new, tiny, pure):** `deriveMcpUrl` is tested directly in the
  same shared suite (trailing `/api` stripped, bare host appended,
  env override handled by the caller).
- **Seam 3 (new extension, pure resolver):** the registration resolver
  takes explicit inputs (env URL candidate, base URL, env PAT candidate,
  Keyring) and returns the payload or an unresolvable outcome; tested
  under the extension runner (`node --experimental-strip-types`,
  `node:assert/strict`, fake Keyring). The `session_start` wiring stays
  thin and untested, consistent with every other extension here. Prior
  art: the secrets and reference-cache extension suites.
- **Seam 4 (existing):** the discovery registry is tested with fake
  sources and env stubs; the mcp-json source is tested against temp
  mcp.json fixtures in both formats plus the template-guard case. Prior
  art: the secrets extension suite.
- **Seam 5 (new, one home):** the shared mcp.json reader is tested with
  native, legacy, and missing-file fixtures via its `configPath`
  injection; the digest Atlassian client tests gain native-format
  fixtures. Prior art: the `test/atlassian-keyring-auth` suites
  (mkdtemp fixtures + injected paths, vitest).
- The rebuilt bundle is verified by the build gate (`tsc --noEmit` +
  esbuild), not by unit tests; no new native dependencies are introduced,
  so the esbuild externals list is untouched.

## Out of Scope

- Env overrides for Atlassian or Bitbucket credentials, mcpServers name
  mappings, or the digest sub-block.
- Embed settings (already env-capable via `AURA_EMBED_*`).
- CLI flags such as `--base-url` or `--pat` on `aura.mjs`.
- The stale guided-walkthrough settings import in the secrets extension
  (latent bug on a dead path; its own effort).
- Any nix-side change: removing the `aura-mcp-dev` declaration from the
  rendered mcp.json source and migrating the PAT are the owner's manual
  steps, documented by this effort but not implemented in this repo.
- Any pi harness change: no workaround is built for the absence of an
  extension API to modify or deregister file-configured servers.
- The mcp.json `${VAR}` template and `!command` forms: not chosen; the
  reader's template guard exists only to refuse importing such literals.

## Further Notes

- The effort map records the supersession history: the MCP side was first
  settled as "keep the sops-rendered literal token", then pivoted to
  extension-owned registration after the owner rejected the nix launch
  wrapper and chose to remove the file declaration. The rejected options
  (wrapper, keep-literal, differently-named session-only server,
  `pi mcp add` on the rendered file) and their reasons live in the map.
- Consequence accepted by the owner: the registered server exists only
  where pi-aura loads, so shell commands (`pi mcp list`) and SDK sessions
  without the package stop listing `aura-mcp-dev`; a session with a
  locked or empty Keyring and no env vars has no Aura MCP (the once-only
  notification covers this).
- Consequence for other pi-aura users: keeping a file-configured
  `aura-mcp-dev` is fully supported (the file entry wins; the extension's
  registration is shadowed and shown as overridden in `/mcp`).
- The manual cutover order matters: land this work, run
  `/aura secrets discover` (which by then reads the native mcp.json
  format) to import the PAT into the Keyring, then remove the nix
  declaration and re-render.
- The reference cache's base-URL keying inherits the override for free
  because it reads the shared settings loader; multi-instance switching
  stays cache-safe.
