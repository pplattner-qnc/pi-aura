---
kind: slice
slug: keyring-atlassian-secret-keys
title: "Extend the @pi-aura/shared keyring enum with atlassian email + api_token keys"
task: ../task.md
mode: afk
status: done
size: s
blocked_by: []
---

## End-to-end behavior

The `@pi-aura/shared` keyring knows about two new secrets — an Atlassian account
email and an Atlassian API token — so that `/aura secrets edit` can store them
and the digest script + Bitbucket fallback can read them. This slice delivers
only the keyring plumbing (the closed `SecretKey` enum and the backends' known
keys list); no consumer reads or writes the new keys yet.

## Acceptance criteria

- [ ] `packages/shared/src/keyring/keyring.ts` `SecretKey` union adds
      `{ service: "atlassian"; name: "email" }` and
      `{ service: "atlassian"; name: "api_token" }`.
- [ ] `packages/shared/src/keyring/file-keyring.ts` `KNOWN_SECRET_KEYS`
      includes both new keys so `listSecrets` probes them.
- [ ] The macOS and (Linux) Secret Service backends enumerate/discover these
      keys by the same `service/name` pair — no per-backend special casing
      beyond what the Aura PAT already needs.
- [ ] A round-trip test writes then reads each new key through `createKeyring`
      (using the `FileKeyring` test seam) and asserts the stored value returns
      unchanged.
- [ ] `packages/shared` typechecks (`tsc --noEmit`) and its existing tests
      stay green.

## Test plan

- **Seams**: `FileKeyring` accepts a `storePath` constructor arg — point tests
  at a temp file. `createKeyring` is platform-dependent, so test the new keys
  through `FileKeyring` directly (the Aura tests already do this).
- **Failure modes**: a missing key returns `null` from `getSecret`, not an
  exception. `listSecrets` only reports keys that are actually set.
- **Scenarios**: set/get email; set/get api_token; overwrite; delete;
  `listSecrets` with both set, with neither set, with one set.
- **Edge cases**: empty string value (keyring stores it; `getSecret` returns
  `""`, which callers must treat as "not set" — document this contract in a
  comment on the new keys, mirroring the Aura PAT handling).

## Constraints and dependencies

- Do not change the Aura PAT key or any existing keyring behavior.
- Keep `SecretKey` a closed union (the file comment says "Add a union member to
  add a capable secret") — extend, don't switch to `string`.
- No consumer changes in this slice (the digest script and `/aura secrets` are
  later slices), so the new keys are writable but unused after this slice —
  that is expected and fine.
