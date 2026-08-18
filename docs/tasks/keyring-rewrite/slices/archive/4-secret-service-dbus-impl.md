---
kind: slice
slug: secret-service-dbus-impl
title: SecretServiceKeyring — dbus-next Secret Service impl of Keyring (Linux)
task: ../task.md
mode: hitl
status: done
size: xl
blocked_by:
  - file-keyring-impl
---

## End-to-end behavior

A `SecretServiceKeyring` class implements `Keyring` by speaking the
Freedesktop Secret Service D-Bus spec via `dbus-next` (pure JS, no
`secret-tool` binary). Static `isAvailable()` returns true iff
`process.platform === "linux"`, a D-Bus session bus is reachable, and a
Secret Service is registered. CRUD round-trips against the real GNOME
Keyring.

## Acceptance criteria

- `packages/shared/src/keyring/secret-service-keyring.ts` exports `class
  SecretServiceKeyring implements Keyring`.
- Statically imports `dbus-next` at the top of this file (Q23: `dependencies`,
  static at the module level) — but this **file** is only dynamically
  imported by `createKeyring()` in the Linux branch (Q24), so macOS/file
  paths never load it.
- `dbus-next` is in `packages/shared/package.json` `dependencies`.
- Static `SecretServiceKeyring.isAvailable()` -> linux + session bus
  reachable + Secret Service registered (catches D-Bus errors -> false).
- CRUD via the Secret Service spec:
  - OpenSession (DH-ietf1024-sha256-aes128-cbc-pkcs7) to establish an
    encrypted session; AES-128-CBC + PKCS#7 padding for the secret payload.
  - GetCollection / create items in the default collection.
  - LookupItem by attributes; CreateItem; DeleteItem.
  - Per-impl packing of `(namespace, SecretKey)` -> D-Bus attributes (per
    Q14). Namespace constant `"aura-skills"` here; normalization is identity
    on Linux (Q16).
- `listSecrets()` probes `getSecret` per known `SecretKey` (no side-index,
  per Q10).
- Errors: a locked keyring -> `KeyringLockedError`; D-Bus-level failures ->
  `KeyringDBusError`.

## Test plan

- Seams: the dev box is Linux with GNOME Keyring — verify against the real
  keyring. Use a distinctive test `SecretKey` (e.g. `{service:"aura",
  name:"pat"}`) and clean up after.
- Failure modes: no session bus (`DBUS_SESSION_BUS_ADDRESS` unset) ->
  `isAvailable()` false; Secret Service not registered -> false; locked
  collection -> `KeyringLockedError`.
- Scenarios: CRUD round-trip — set, get (matches), list (found), delete
  (true), get-after-delete (null). Two different keys don't collide.
- Edge cases: a secret written by `secret-tool` (old impl) under a
  different attribute scheme is **not** found by the new impl (different
  packing) — that's expected; the `/aura secrets discover` command migrates
  PATs, not old keyring entries.
- Residual risk: the D-Bus protocol layer (handshake + AES/GCM) is a few
  hundred lines and easy to get subtly wrong; cross-check against the
  `secret-service-rs` reference and the spec. If the encryption is too
  fiddly, a fallback: store the secret unencrypted via the
  `org.freedesktop.Secret.Generic` plaintext session (spec allows it for
  non-secret payloads) — but the PAT *is* secret, so do the encryption.

## Constraints / dependencies

- Blocked by `file-keyring-impl` (so there's a working fallback while this
  is built).
- This is the largest slice; if it risks stalling, split the D-Bus
  handshake (OpenSession + encryption) from the CRUD methods into two
  slices. Prefer to keep it one slice and reassess.
