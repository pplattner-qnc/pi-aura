---
kind: slice
slug: bitbucket-token-key-and-reader
title: "Add the bitbucket_token SecretKey + readBitbucketCredentials + shared readAtlassianEmail"
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: []
---

## End-to-end behavior

The keyring knows a third Atlassian secret — `atlassian/bitbucket_token` — and
`readBitbucketCredentials(keyring)` reads it with the shared email, throwing a
`/aura secrets edit` message when either is missing. The email read is factored
into `readAtlassianEmail(keyring)` shared by both readers. No consumer yet.

## Acceptance criteria

- [ ] `SecretKey` adds `{ service: "atlassian"; name: "bitbucket_token" }` with
      the empty-string-as-not-set contract comment.
- [ ] `KNOWN_SECRET_KEYS` in all three backends lists it.
- [ ] `readBitbucketCredentials(keyring)` exported from `clients.ts`: reads
      `atlassian/email` + `atlassian/bitbucket_token`, trims, throws an Error
      naming `/aura secrets edit` when either is missing/empty.
- [ ] `readAtlassianEmail(keyring)` factored out; both
      `readAtlassianCredentials` and `readBitbucketCredentials` call it. The
      email-missing message is identical in both (no duplication).
- [ ] `readAtlassianCredentials` existing tests pass unchanged.
- [ ] `packages/shared/test/keyring.test.ts` gains a `bitbucket_token`
      round-trip block (set/get/overwrite/delete/empty-string).
- [ ] New clients test for `readBitbucketCredentials` (fake keyring): both
      present → `{email, token}`; email/token missing/empty/whitespace → throws
      `/aura secrets edit`. No live network call.
- [ ] `make build` succeeds; `packages/shared` + `scripts` typecheck clean;
      `tsx --test` + `vitest run` green.

## Test plan

- **Seams**: `FileKeyring(storePath)` for the keyring round-trip; a fake
  `Keyring` for `readBitbucketCredentials` (mirror the prior task's slice-2
  clients test pattern).
- **Failure modes**: missing email, missing token, empty-string token,
  whitespace-only token → the `/aura secrets edit` throw.
- **Scenarios**: both present → correct `{email, token}`; existing
  `readAtlassianCredentials` tests still pass (regression — the email refactor is
  behavior-preserving).
- **Edge cases**: `readAtlassianEmail` returns trimmed email or empty string;
  both readers call it so the email-missing message is identical.

## Constraints and dependencies

- Depends on nothing (leaf infra).
- Do not change `readAtlassianCredentials`'s signature or message — only
  refactor its email read into the shared helper.
- Do not wire `bitbucket.ts` or the chooser (the wire task).
- Keep `SecretKey` a closed union.
