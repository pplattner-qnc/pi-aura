---
type: task
subtype: grilling
title: Decide how the Aura MCP connection is applied at runtime (live mcp patching)
status: stable
workflow_state: done
blocked_by: []
---

## Decision to settle

How the Aura MCP connection reaches pi at runtime, given the settled REST
env override and the research finding that file-configured servers cannot
be modified or shadowed by extensions mid-session.

## Parent decisions

- `mcp-env-override` (settled first as keep-literal, then superseded by
  the pivot below): no sops-rendered Authorization header template, no nix
  launch wrapper (the decrypted PAT would live in pi's process env).
- REST env override (settled): `AURA_BASE_URL` + `AURA_PAT`, env wins,
  applied in the shared loaders.
- Research (recorded in the map): extensions can register/unregister
  session-only servers at any time (later registrations connect right
  away, re-registration replaces, `${VAR}` header templates resolve from
  pi's env at connect); file-configured servers always win same-name
  contests, even when disabled.

## Outcome (settled)

The pi-aura extension owns the Aura MCP registration. It registers a
session-only server named `aura-mcp-dev` at session start, so tool names
stay `mcp__aura_mcp_dev__*` and the aura skill instructions keep working
unchanged. The connection resolves env-first exactly like the REST chain:
URL from `AURA_MCP_URL` else derived from `aura.baseUrl` (strip a trailing
`/api` segment when present, then append `/mcp`), PAT from `AURA_PAT`
else the OS keyring. The registered config may inline the resolved PAT:
`/mcp` never renders it (registeredConfig is internal, used only for
change detection). The nix-side `mcp.json` declaration is removed by the
owner after the PAT migrates to the keyring (`/aura secrets discover`,
once it reads the new mcp.json format).

Consequences accepted: the server exists only where pi-aura loads (shell
commands such as `pi mcp list` do not load extensions, so they stop
listing it); a session with no resolvable URL/PAT has no Aura MCP (notify
once); other pi-aura users keeping a file declaration are unaffected (the
file entry takes precedence, the registration is shadowed in `/mcp`).

Rejected options: the sops-rendered literal entry (REST/MCP split, no env
override for MCP), the nix launch wrapper (rejected by the owner: decrypted
PAT in the process env), a differently-named session-only server (split
tool namespace, unavoidable coexistence with the file server), and
`pi mcp add` or direct edits of the sops-rendered file (clobbered at the
next render).

## Downstream work

Extension implementation tickets (session_start registration lifecycle,
credential resolution sharing the REST seam, the once-only failure
notify), the `pi mcp list` doc note, tests; the owner's manual nix-side
removal of the `aura-mcp-dev` declaration plus PAT migration via
`/aura secrets discover`.
