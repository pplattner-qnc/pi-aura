---
kind: task
type: feature
slug: bitbucket-token-infra
title: Add the bitbucket_token SecretKey + Bitbucket credential reader
map: atlassian-bitbucket-token
status: ready
slices:
- bitbucket-token-key-and-reader
---

## User-visible outcome

The `@pi-aura/shared` keyring can store a second Atlassian API token —
`atlassian/bitbucket_token` — and a `readBitbucketCredentials(keyring)` helper
reads it together with the shared email, throwing a `/aura secrets edit`
message when either is missing. No consumer uses it yet; the manual provisioning
session + the wire task depend on it.

## User story

- (No direct user story this task — it's infrastructure.) A later task stores a
  Bitbucket-scoped PAT under `atlassian/bitbucket_token`, and `bitbucket.ts`
  reads it via `readBitbucketCredentials`.

## Scope boundaries

In scope:
- `SecretKey` adds `{ service: "atlassian"; name: "bitbucket_token" }` + all
  three backends' `KNOWN_SECRET_KEYS` list it.
- `scripts/src/clients.ts` adds `readBitbucketCredentials(keyring)` reading
  `atlassian/email` + `atlassian/bitbucket_token`, trimming whitespace, throwing
  an Error naming `/aura secrets edit` when either is missing/empty. The shared
  email read is factored into `readAtlassianEmail(keyring)` that **both**
  `readAtlassianCredentials` (Teamwork Graph) and `readBitbucketCredentials` call.
- `readAtlassianCredentials` behavior unchanged (same signature, same message).
- Tests for the new key (round-trip) + the new reader (fake keyring).

Out of scope (see map.md):
- Wiring `bitbucket.ts` or the chooser (the wire task).
- The guided walkthrough / manual provisioning (separate tasks).
- OAuth, auto-discovery, a new slash command, transport changes.

## Acceptance criteria

- [ ] `SecretKey` includes `{ service: "atlassian"; name: "bitbucket_token" }`
      with the empty-string-as-not-set contract comment; all three backends'
      `KNOWN_SECRET_KEYS` list it.
- [ ] `readBitbucketCredentials(keyring)` is exported from `clients.ts`, reads
      `atlassian/email` + `atlassian/bitbucket_token`, trims, and throws an
      Error naming `/aura secrets edit` when either is missing/empty.
- [ ] `readAtlassianEmail(keyring)` helper is factored out and called by both
      readers; the email-missing message is identical in both (no duplication).
- [ ] `readAtlassianCredentials` existing tests pass unchanged
      (behavior-preserving refactor).
- [ ] `packages/shared/test/keyring.test.ts` has a `bitbucket_token` round-trip
      block; a new clients test covers `readBitbucketCredentials` (both present,
      email/token missing/empty/whitespace → throw). No live network call.
- [ ] `make build` succeeds; `packages/shared` + `scripts` typecheck clean;
      `tsx --test` + `vitest run` green.

## Existing abstractions to use

- `@pi-aura/shared/keyring` `SecretKey` + backends — extend (mirror how
  `atlassian/api_token` was added in the prior task).
- `readAtlassianCredentials` (`scripts/src/clients.ts`) — refactor its email
  read into the shared `readAtlassianEmail`; keep signature + message.
- `FileKeyring(storePath)` test seam; fake `Keyring` for the reader test.

## Architecture / domain decisions

- The Bitbucket reader is a sibling to `readAtlassianCredentials`; the email
  read is the shared part (`readAtlassianEmail`).
- Keep `SecretKey` a closed union (extend, don't switch to `string`).

## Implementation notes

### slice: bitbucket-token-key-and-reader (landed)

- Added `{ service: "atlassian"; name: "bitbucket_token" }` to the `SecretKey` union in `packages/shared/src/keyring/keyring.ts` and to `KNOWN_SECRET_KEYS` in all three backends (`file-keyring.ts`, `macos-keyring.ts`, `secret-service-keyring.ts`), each a single `+` line mirroring `atlassian/api_token`.
- Factored `readAtlassianEmail(keyring)` out of `readAtlassianCredentials` in `scripts/src/clients.ts`; it trims and returns `""` silently when the email is missing/empty. Both `readAtlassianCredentials` (refactored, behavior-preserving — same signature, same message) and the new `readBitbucketCredentials` call it.
- `readBitbucketCredentials(keyring)` reads `atlassian/email` + `atlassian/bitbucket_token`, trims, and throws `"no Bitbucket credential in keyring (run \`/aura secrets edit\`)"` when either is missing/empty/whitespace — same message shape as `readAtlassianCredentials` (which says "no Atlassian credential"). Each reader keeps its own throw site; the email read is the shared part.
- Tests: `packages/shared/test/keyring.test.ts` gained a `bitbucket_token` round-trip block (set/get/overwrite/delete/empty-string) + updated `listSecrets` expectation to 4 keys; new `test/bitbucket-token-infra/clients.test.ts` with a fake `Keyring` covers `readAtlassianEmail` (5 tests) and `readBitbucketCredentials` (8 tests) — no live network call.
- Validation: keyring tests 30 pass, vitest 14 files/108 tests pass, `packages/shared` + `scripts` typecheck clean, `scripts` build succeeds. No regressions — existing `readAtlassianCredentials` tests pass unchanged.
- No consumer uses the new reader yet (`bitbucket.ts` and the chooser are untouched) — that is expected; the wire task and the manual provisioning session depend on this infra.
