---
kind: slice
slug: bitbucket-shared-credential
title: "Bitbucket fallback reads the shared Atlassian keyring credential instead of its MCP env"
task: ../task.md
mode: afk
status: todo
size: s
blocked_by:
  - atlassian-basic-auth-client
---

## End-to-end behavior

`scripts/src/bitbucket.ts` reads the Atlassian email + API token from the
keyring (the same shared credential the Jira/Teamwork Graph layer uses) and
authenticates to `api.bitbucket.org` with Basic auth, instead of reading
`ATLASSIAN_USER_EMAIL` / `ATLASSIAN_API_TOKEN` from the `atlassian-bitbucket`
MCP server's env in `mcp.json`. Its `defaultWorkspace` continues to come from
`settings.aura.digest.bitbucket.workspace`.

## Acceptance criteria

- [ ] `bitbucket.ts`'s credential loader reads `{service:"atlassian",name:"email"}`
      and `{service:"atlassian",name:"api_token"}` from the keyring via
      `createKeyring()` (the same helper/keys as slice 2), not from
      `config.mcpServers["atlassian-bitbucket"].env`.
- [ ] `defaultWorkspace` is sourced from `settings.aura.digest.bitbucket.workspace`
      (via `loadSettings()`), not from the MCP env's
      `BITBUCKET_DEFAULT_WORKSPACE`. If that settings field is absent, the
      Bitbucket layer degrades with a clear warning (consistent with the
      Teamwork Graph layer's missing-credential warning).
- [ ] When the Atlassian keyring entries are absent, the Bitbucket layer is
      skipped with a warning naming `/aura secrets edit`, never an unhandled
      throw.
- [ ] The Basic-auth header construction (`Basic base64(email:token)`) is
      unchanged; only the credential source changes.
- [ ] `scripts` typechecks clean; `vitest run` is green with a test that
      asserts `bitbucket.ts`'s credential loader reads from a fake keyring and
      ignores the MCP env.

## Test plan

- **Seams**: `bitbucket.ts`'s `loadCreds` currently reads `MCP_CONFIG_PATH`
  directly. Refactor it to take a `Keyring` (injectable in tests) + a
  `defaultWorkspace` from settings, so the loader is unit-testable without
  `mcp.json`. Keep the live `bbFetch` path unchanged.
- **Failure modes**: keyring missing email or token → graceful skip + warning;
  settings missing `bitbucket.workspace` → graceful skip + warning; both
  present → returns creds with the right email/token/workspace.
- **Scenarios**: with keyring populated + workspace in settings → creds
  assembled; keyring empty → warning, no throw; workspace missing → warning.
- **Edge cases**: the `atlassian-bitbucket` MCP server env is now unused for
  credentials — confirm with a grep that nothing else reads
  `ATLASSIAN_USER_EMAIL`/`ATLASSIAN_API_TOKEN` from mcp.json in the scripts
  workspace after this slice. The MCP server config itself is not removed
  (it still powers the stdio MCP server the user may run separately); only the
  script's reliance on its env is removed.

## Constraints and dependencies

- Depends on slice 2 (shared keyring helper) and slice 1 (keys).
- Do not move `defaultWorkspace` into the keyring — it's a non-secret config
  value and stays in settings (map.md "Out of scope").
- Do not remove or edit the `atlassian-bitbucket` MCP server entry in
  `mcp.json`; that's the user's MCP config, not this repo's to manage. Only
  the script stops reading its env.
- The shared credential means one `/aura secrets edit` provisions both layers;
  do not introduce a second keyring pair for Bitbucket.
