---
type: task
subtype: grilling
title: Decide whether and how the aura-mcp-dev MCP connection picks up env overrides
status: stable
workflow_state: done
blocked_by: []
---

## Decision to settle

Whether the `aura-mcp-dev` MCP server connection (pi 1.0.0 native MCP; the
pi-mcp-adapter extension is removed) picks up `AURA_*` env overrides, and if
so, in what shape.

## Parent decisions

None open. `AURA_BASE_URL` + `AURA_PAT` are settled for the REST path.

## Facts (pi 1.0.0 native MCP)

- Config lives in `~/.pi/agent/mcp.json` (a sops-nix rendered symlink),
  native schema: `{"url": U, "headers": {"Authorization": "Bearer T"}}`.
- `headers` and stdio `env` values support `${VAR}`/`$VAR` templates and
  whole-value `!command` shell execution (stdout cached for the process
  lifetime, 10s timeout). A template referencing an unset var fails loudly
  at connect (resolveHeadersOrThrow), not with an empty string.
  `pi mcp add --url U --bearer-token-env-var NAME` writes exactly
  `"Authorization": "Bearer ${NAME}"`, the sanctioned env-driven shape.
- The `url` field is literal: no env interpolation, no command. An
  env-driven MCP URL is impossible in native pi today; instance switching
  for MCP stays a file-level change (sops re-render or project
  `.pi/mcp.json`).
- `readMcpBearerToken` in `extensions/aura-secrets.ts` reads the literal
  token field of the old adapter format from the old path; the migration
  guide already requires re-pointing it at `headers.Authorization` of the
  new file. With the `"Bearer ${AURA_PAT}"` template form it would read the
  literal template string, so template values must be skipped (the decided
  env discovery source covers the env case anyway).

## Choices already known

- (a) PAT env-driven header: render `"Authorization": "Bearer ${AURA_PAT}"`
  in the sops-nix template. One PAT var then drives REST + MCP; an unset
  var fails loudly. The URL stays literal.
- (b) Keep the rendered literal token: env overrides stay REST-only; the
  MCP server keeps its sops-managed connection.
- (c) PAT via `!command` with fallback (e.g. `"!sh -c 'echo Bearer
  ${AURA_PAT:?must be set}'"` or a shell fallback to another secret
  source): env-with-fallback semantics are possible because the command
  runs in a shell, but pi-aura ships no keyring-reader CLI, and command
  results cache for the process lifetime (rotation needs a restart).

## Recommended starting answer

(a): it uses pi's sanctioned `--bearer-token-env-var` shape, unifies the
PAT across REST + MCP, and fails loudly rather than silently when unset.
(c) buys fallback at the cost of shipping a secret-printing command; (b)
leaves the PAT story split.

## Downstream work

The `mcp-live-patching` task (how the config change is applied); a
`readMcpBearerToken` template guard; docs for the chosen shape.
