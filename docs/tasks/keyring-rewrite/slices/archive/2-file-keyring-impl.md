---
kind: slice
slug: file-keyring-impl
title: FileKeyring — JSON-on-disk fallback that implements Keyring
task: ../task.md
mode: hitl
status: done
size: s
blocked_by:
  - keyring-interface-and-enum
---

## End-to-end behavior

A `FileKeyring` class implements `Keyring` directly, storing secrets in a
JSON file keyed by the packed `(namespace, SecretKey)`. Works on every
platform (the always-available fallback). `chmod 0o600` on the store file.

## Acceptance criteria

- `packages/shared/src/keyring/file-keyring.ts` exports `class FileKeyring
  implements Keyring`.
- Static `FileKeyring.isAvailable()` returns `true` (always).
- `setSecret(key, secret)` writes; `getSecret(key)` reads back; `deleteSecret`
  returns true if it existed; `listSecrets()` returns `{key, secret}[]` for
  every stored enumerated key (per-key probe of the JSON map — no side-index).
- Packing: the impl chooses how `(namespace, SecretKey)` -> file keys
  (per-impl, per Q14). Namespace constant `"aura-skills"` lives here as a
  module constant.
- Store path: `~/.cache/aura-skills/store.json` (or similar); `chmod 0o600`.
- `listSecrets` returns only entries whose `(service,name)` matches the
  `SecretKey` enumeration (typed keys only — Q12 dropped unknowns).

## Test plan

- Seams: inject a temp store path (constructor arg or env) for tests so the
  real `~/.cache` isn't polluted — but the public `Keyring` interface takes
  no args, so the override is an internal/test hook, not on the interface.
- Failure modes: corrupt JSON -> `getSecret` returns null (don't throw);
  `chmod` fails on a platform that doesn't support it -> ignore.
- Scenarios: CRUD round-trip — set, get (matches), list (found), delete
  (true), get-after-delete (null). Two different `SecretKey`s (when the
  enum grows) don't collide.
- Edge cases: an entry in the JSON file that doesn't match the enum is
  ignored by `listSecrets` (not returned, not crashed on).

## Constraints / dependencies

- Blocked by `keyring-interface-and-enum`.
