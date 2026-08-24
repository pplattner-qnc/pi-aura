---
kind: slice
slug: macos-keyring-impl
title: MacosKeyring — security CLI impl of Keyring
task: ../task.md
mode: hitl
status: done
size: m
blocked_by:
  - keyring-interface-and-enum
---

## End-to-end behavior

A `MacosKeyring` class implements `Keyring` via `/usr/bin/security`
(find-generic-password / add-generic-password / delete-generic-password /
dump-keychain). Static `isAvailable()` returns true iff `process.platform
=== "darwin"` and the `security` binary exists.

## Acceptance criteria

- `packages/shared/src/keyring/macos-keyring.ts` exports `class
  MacosKeyring implements Keyring`.
- Static `MacosKeyring.isAvailable()` -> `process.platform === "darwin"`
  and `/usr/bin/security` exists.
- CRUD round-trips via `security` using the per-impl packing of `(namespace,
  SecretKey)` into the two OS strings (per Q14) — namespace constant
  `"aura-skills"` here; normalization is identity on macOS (Q16).
- `listSecrets()` parses `security dump-keychain` for matching entries and
  re-reads each secret (don't trust the dump for secret values).
- `setSecret` does delete-then-add (no upsert).

## Test plan

- Seams: this slice can only be **verified** on macOS. On the Linux dev box,
  the slice is implemented + typechecked, and `isAvailable()` is confirmed
  to return false (platform guard). Full CRUD verification is a manual step
  on a macOS host — note this in the slice's residual risks.
- Failure modes: `security` returns 44 (secItemNotFound) on get/delete ->
  `getSecret` returns null, `deleteSecret` returns false.
- Scenarios (on macOS): CRUD round-trip against the real keychain.
- Edge cases: a keychain prompt for permission — the impl assumes the
  keychain is unlocked; a locked keychain surfaces as `KeyringLockedError`
  (wrap `security` errors).

## Constraints / dependencies

- Blocked by `keyring-interface-and-enum`.
- Residual risk: CRUD verification needs a macOS host (not available here).
  Implement + typecheck + isAvailable-false-on-Linux is the deliverable on
  this box.
