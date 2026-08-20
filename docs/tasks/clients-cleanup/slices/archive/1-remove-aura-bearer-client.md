---
kind: slice
slug: remove-aura-bearer-client
title: Remove bearerClient + dead helpers from clients.ts
task: ../task.md
mode: hitl
status: todo
size: s
blocked_by: []
---

## End-to-end behavior

`bearerClient` and any now-dead helpers it relied on are removed from
`clients.ts`. The Atlassian path is untouched.

## Acceptance criteria

- `bearerClient` function removed from `clients.ts`.
- `loadMcpConfig` removed **only if** no remaining code (atlassianClient)
  uses it — if `atlassianClient` still uses `loadMcpConfig`, keep it.
- `readOAuthTokenFromKeyring`, `atlassianClient`, the keyring chunk logic
  unchanged.
- `grep -rn bearerClient scripts/src` -> no matches.
- `make typecheck` + `make build` pass.
- `aura-digest.mjs fetch` still runs (Atlassian dev-links layer intact).

## Test plan

- Seams: the typechecker is the test — if `bearerClient` is still
  referenced anywhere, the removal fails the build.
- Failure modes: removing `loadMcpConfig` that `atlassianClient` uses ->
  typecheck error -> keep it.
- Scenarios: `make build` clean; `aura-digest.mjs fetch` produces a digest
  with the dev-links layer (Atlassian) still populated.
- Edge cases: confirm `@napi-rs/keyring` stays in `scripts/package.json`
  (the Atlassian keyring-read needs it) — do not remove it here.

## Constraints / dependencies

- Blocked by `call-site-migration` (the call sites must be off
  `bearerClient` before removing it).
