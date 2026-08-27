---
kind: slice
slug: digest-script-own-credential
title: "Wire the digest script's Atlassian client to the keyring (Basic auth); delete the pi-mcp-adapter token read"
task: ../task.md
mode: afk
status: done
size: m
blocked_by:
  - atlassian-basic-auth-client
---

## End-to-end behavior

`scripts/src/clients.ts`'s `atlassianClient` now returns the Basic-auth client
from slice 2 (reading the keyring), and the pi-mcp-adapter OAuth keyring-read
path (`readOAuthTokenFromKeyring` and the `@napi-rs/keyring` chunked-reassembly
code) is deleted. `digest-fetch` no longer breaks with `invalid_token` when
the adapter token has expired, because it no longer reads that token at all.

## Acceptance criteria

- [ ] `atlassianClient` (or its replacement) uses slice 2's helper — it reads
      the Atlassian email + token from the keyring and sends Basic auth to the
      Rovo MCP server. `scripts/src/devlinks.ts` call sites are unchanged.
- [ ] `readOAuthTokenFromKeyring` and the `@napi-rs/keyring` import +
      chunked-reassembly logic are removed from `scripts/src/clients.ts`.
- [ ] A `grep -rn "readOAuthTokenFromKeyring\|pi-mcp-adapter.oauth\|sha256-" scripts/src` (and the dashboard extension) returns nothing before the
      slice is considered done — confirm nothing else consumed the old path.
- [ ] When the Atlassian keyring entries are absent, `digest-fetch` emits a
      digest warning of the form
      `Teamwork Graph dev-links layer skipped: no Atlassian credential in keyring (run \`/aura secrets edit\`)`,
      not `invalid_token`. The skip is graceful — the digest still renders
      (the dashboard hardening from the prior fix already tolerates a missing
      dev-links layer).
- [ ] `make build` succeeds; `scripts` typechecks clean; `vitest run` is green
      with a test that asserts the missing-credential warning text.

## Test plan

- **Seams**: `atlassianClient` is called from `devlinks.ts` via
  `buildAtlassianClient` (slice 2) which accepts an injectable keyring. Test
  the digest-script wiring by injecting a fake keyring + fake
  `buildAtlassianClient` (or by asserting on the thrown message that becomes
  the warning — `devlinks.ts` already turns a thrown client error into a
  per-task `errors.push` and a top-level warning; extend that test).
- **Failure modes**: no keyring entry → warning names `/aura secrets edit`;
  empty-string entry → same; mcp.json server missing → existing "not found"
  error path.
- **Scenarios**: with the keyring populated, `digest-fetch` would call the
  client (assert the call happens with a Basic header — can be done at the
  `buildAtlassianClient` unit level, not a live call); with the keyring empty,
  the warning is emitted and the digest still completes.
- **Edge cases**: confirm the `grep` sweep covers the digest-dashboard
  extension too (it also imports from scripts/src? check `.pi/extensions/digest-dashboard`).

## Constraints and dependencies

- Depends on slice 2 (the helper) and slice 1 (the keys).
- Delete, don't keep-dead: the old `readOAuthTokenFromKeyring` is removed in
  this slice after the grep sweep proves nothing else uses it. Keeping it
  would leave a second, misleading auth path.
- Do not change `devlinks.ts` call sites — the swap is entirely in
  `clients.ts` / the helper.
- The dashboard already tolerates a skipped dev-links layer (the recent
  `invalid_token` fix hardened `Digest.svelte`); verify this slice's
  missing-credential warning still produces a valid digest the dashboard can
  render.
