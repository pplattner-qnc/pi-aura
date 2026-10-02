# pi-aura migration: pi-mcp-adapter → pi native (built-in) MCP

Context for this repo after the nixos-config migration landed in
`~/nixos` (modules/home-manager/applications/pi/). pi 1.0.0 ships **native MCP
support**; the nixos config no longer installs `npm:pi-mcp-adapter`, and the
MCP config file **moved and changed format**. pi-aura reads that file at
runtime in a few places, so those readers must be updated or aura-digest
dev-links and Aura PAT discovery break.

Reference docs: pi monorepo `docs/mcp.md` (on this machine:
`/nix/store/9srx0akrz64sch01qlnga15wfklyzifp-pi-coding-agent-1.0.0/lib/node_modules/pi-monorepo/docs/mcp.md`).

## 1. What changed in the nix config

- `npm:pi-mcp-adapter` removed from pi's `packages` (it *replaced* built-in
  MCP support when installed; removing it re-enables the native stack).
- Config file moved: `~/.config/mcp/mcp.json` → **`~/.pi/agent/mcp.json`**
  (still a sops-rendered template; secret placeholders are substituted at
  activation time).
- Server **names are unchanged**: `atlassian`, `atlassian-bitbucket`,
  `aura-mcp-dev`, `super-productivity`, `grafana-*`. The `aura.mcpServers`
  mapping in `~/.pi/agent/settings.json` therefore stays valid.

### Format mapping (old adapter schema → pi native schema)

| Adapter (old file)                                  | Native (new file)                                        |
| --------------------------------------------------- | -------------------------------------------------------- |
| `{"type":"http","url":U}`                           | `{"url":U}` — `type` is optional in the native schema; its presence + value selects stdio vs http |
| `{"type":"http","url":U,"auth":"bearer","bearerToken":"T"}` | `{"url":U,"headers":{"Authorization":"Bearer T"}}` |
| `{"type":"stdio","command":C,"args":[...],"env":{}}` | `{"command":C,"args":[...]}` — no `type`; empty `env` omitted |

Example: what thinkpad-p16v renders into `~/.pi/agent/mcp.json` now
(tokens elided; they are real decrypted values at activation time):

```json
{
  "mcpServers": {
    "atlassian": { "url": "https://mcp.atlassian.com/v2/mcp" },
    "aura-mcp-dev": {
      "headers": { "Authorization": "Bearer <sops-decrypted-token>" },
      "url": "https://aura.dev-anwalt.de/mcp"
    },
    "grafana-plai-prod": {
      "args": ["mcp-grafana"],
      "command": "uvx",
      "env": { "GRAFANA_URL": "https://logs.primelegal.ai/grafana", "GRAFANA_SERVICE_ACCOUNT_TOKEN": "<sops-decrypted-token>" }
    },
    "super-productivity": { "args": ["-y", "super-productivity-mcp"], "command": "npx" }
  }
}
```

Other native-schema facts worth knowing:

- Tools register as `mcp__<server>__<tool>` (non-alphanumerics → `_`).
- Default tool exposure is `codemode`: tool definitions are *not* declared to
  the model; scripts call them. The nix config can set `exposure` per server
  (`codemode`/`deferred`/`direct`/`hidden`).
- OAuth tokens live in `~/.pi/agent/mcp-auth.json` (the adapter used the
  `pi-mcp-adapter.oauth` keyring service — already unused in this branch).
- Validate a machine's config with `pi mcp list` (exit 1 on invalid/unconnected);
  `/mcp` inside a session; server logs in `~/.pi/agent/mcp.log`.

## 2. Consumers in pi-aura that must change

Find them all with:

```bash
rg -n '\.config/mcp|mcp\.json|MCP_CONFIG_PATH|bearerToken' packages/shared/src extensions/ skills/core/aura-digest/ test/
```

1. **`packages/shared/src/digest/clients.ts`** — `atlassianClient()` (used by
   `devlinks.buildAtlassianClient`, which gates digest dev-links) does
   `loadMcpConfig()` and then throws when `server.type !== "http" || !server.url`.
   Native entries have **no `type` field**, so this throws unconditionally after
   the migration → dev-links break (it degrades to a warning in
   `buildAtlassianClient`, but it will *never* connect again).
   - Change: detect http by `server.url != null` (drop the `type` check), and
     read from the new path (see §3).
2. **`extensions/aura-secrets.ts`** — `readMcpBearerToken()` reads
   `mcpServers["aura-mcp-dev"].bearerToken` as a PAT discovery source
   (`mcp-json` source in `DISCOVERY_SOURCES`). After the migration the token
   lives under `headers.Authorization`, so this source silently stops finding
   anything.
   - Change: also read `headers.Authorization` and strip the `Bearer ` prefix.
3. **`skills/core/aura-digest/dist/aura.mjs`** — committed esbuild bundle that
   still contains older code (`bearerClient()` expecting `bearerToken`,
   bitbucket `loadCreds()` reading `atlassian-bitbucket.env` from mcp.json).
   Must be **rebuilt** after the source changes (see §4) and the rebuilt
   bundle committed.
4. **`skills/core/aura-digest/aura-digest.md`** (~line 66) — doc text says
   `digest-fetch` reads `~/.config/mcp/mcp.json`; update path + format wording.
5. **Tests** — `test/atlassian-keyring-auth/clients.test.ts`,
   `test/atlassian-keyring-auth/bitbucket.test.ts`,
   `test/wire-bitbucket-reader/wire-bitbucket-reader.test.ts` (fixture JSON +
   temp `mcp.json` path seams).
6. `packages/shared/src/digest/bitbucket.ts` — comment-only mcp.json mention
   (creds now come from the keyring); update the comment while touching the area.

Not affected: Aura REST calls (`createDefaultAuraClient` + PAT via keyring /
settings.json), Bitbucket REST readers (keyring-based in this branch).

## 3. Recommended reader shape

Small helper in `clients.ts` (or `@pi-aura/shared/mcp-config`) that all
consumers share:

```ts
export interface McpHttpServer {
  url: string;
  bearerToken?: string; // unwrapped from headers.Authorization
}

/** Read an http MCP server entry from pi's native mcp.json, falling back to
 *  the legacy pi-mcp-adapter file/format (~/.config/mcp/mcp.json with
 *  `bearerToken` fields) for hosts that haven't rebuilt yet. */
export function loadMcpHttpServer(name: string, configPath?: string): McpHttpServer | null {
  const candidates = configPath
    ? [{ path: configPath, legacy: true }]
    : [
        { path: join(homedir(), ".pi", "agent", "mcp.json"), legacy: false },
        { path: join(homedir(), ".config", "mcp", "mcp.json"), legacy: true },
      ];
  for (const { path, legacy } of candidates) {
    try {
      const server = JSON.parse(readFileSync(path, "utf8")).mcpServers?.[name];
      if (!server) continue;
      const url = typeof server.url === "string" ? server.url : null;
      if (!url) continue;
      let bearerToken: string | undefined;
      const auth = server.headers?.Authorization ?? server.headers?.authorization;
      if (typeof auth === "string" && auth.startsWith("Bearer ")) bearerToken = auth.slice(7);
      else if (typeof server.bearerToken === "string") bearerToken = server.bearerToken; // legacy
      return { url, bearerToken };
    } catch { /* missing/unparseable → try next */ }
  }
  return null;
}
```

- `atlassianClient()` uses this for the `url` (auth itself comes from the
  keyring) and drops the `type !== "http"` check.
- `aura-secrets.readMcpBearerToken()` uses the same helper for the PAT source
  (and keeps returning `null` gracefully when nothing is found).
- The legacy fallback is belt-and-braces: all hosts rebuild from the same
  flake, so you may instead cut over outright — but then also note that
  sops-nix leaves the stale `~/.config/mcp/mcp.json` symlink behind after the
  first `switch` (it must be removed manually:
  `rm ~/.config/mcp/mcp.json && rmdir ~/.config/mcp`), and a legacy fallback
  would happily keep reading that stale file, so if you implement the
  fallback, prefer the new path strictly first (as above).

## 4. Build, test, land

```bash
task install        # first time only: build deps into scripts/node_modules
task typecheck      # tsc --noEmit
task build          # esbuild bundles into skills/*/dist (committed output)
npm test --workspace @pi-aura/shared   # or: cd packages/shared && npx tsx --test 'test/**/*.test.ts'
```

- Fixture JSONs in the touched tests should get a native-format example
  (`headers.Authorization`) and, if the legacy fallback is implemented, keep
  one legacy-format fixture asserting the fallback path.
- Commit the rebuilt `skills/core/aura-digest/dist/aura.mjs` together with the
  source changes (dist is committed so package users don't build).
- Follow this repo's normal task workflow / commit conventions.

## 5. Sanity checklist on a migrated host

- [ ] `cat ~/.pi/agent/mcp.json` — native format, correct server names.
- [ ] `pi mcp list` — all enabled servers connect (aura-mcp-dev authenticates
      via its `Authorization` header; exit code 0).
- [ ] In a pi session, `/mcp` shows the servers; aura tools reachable as
      `mcp__aura_mcp_dev__*` (codemode exposure by default).
- [ ] `/aura secrets edit` PAT discovery still finds the Aura PAT (keyring
      source, plus the updated `mcp-json` source).
- [ ] aura-digest `digest-fetch` dev-links return Atlassian results again.
