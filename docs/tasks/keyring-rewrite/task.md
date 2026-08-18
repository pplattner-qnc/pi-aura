---
kind: task
type: feature
slug: keyring-rewrite
title: From-scratch keyring.ts in @pi-aura/shared (dbus-next Linux, no KeyringBackend seam)
map: aura-access-rewrite
status: ready
slices:
- keyring-interface-and-enum
- file-keyring-impl
- macos-keyring-impl
- secret-service-dbus-impl
- create-keyring-dispatch
---

## User-visible outcome

A from-scratch `keyring.ts` lives in `packages/shared/src/keyring/` and is
importable as `@pi-aura/shared/keyring`. It exposes a closed `SecretKey`
enumeration, a `Keyring` interface, a zero-arg `createKeyring()`, and three
concrete implementations (`FileKeyring`, `MacosKeyring`,
`SecretServiceKeyring`) that each implement `Keyring` directly — no separate
`KeyringBackend` seam. The Linux impl speaks the Secret Service D-Bus spec
via `dbus-next` (pure JS, no `secret-tool` binary). `createKeyring()` uses an
inline `switch (process.platform)` to pick the implementation, dynamically
importing the dbus-next impl only on Linux.

## User story

As the Aura access layer, I want a typed, pure-JS, cross-platform keyring with
a closed enumeration of capable secrets, so I can store and read the Aura PAT
(and future secrets) without native bindings and without depending on
`pi-mcp-adapter`'s mcp.json entry.

## Scope boundaries

- Lives in `packages/shared/src/keyring/` (split by impl per grilling Q25):
  `keyring.ts` (public: `SecretKey`, `Keyring`, `createKeyring`, errors,
  dispatch) + `file-keyring.ts` + `macos-keyring.ts` +
  `secret-service-keyring.ts`.
- `SecretKey` starts as `type SecretKey = { service: "aura"; name: "pat" }`
  (closed enum; grows by adding union members).
- `createKeyring()` takes zero args; namespace `"aura-skills"` is an internal
  constant per impl (adjustable per-OS by each impl).
- Three errors: `KeyringUnavailableError`, `KeyringLockedError`,
  `KeyringDBusError` (off `Error`, with a `code` discriminator).
- `dbus-next` declared in `packages/shared/package.json` `dependencies`;
  `secret-service-keyring.ts` is dynamically `import()`ed only in the Linux
  branch of `createKeyring()`.
- Windows is **not** implemented in this task (dropped per Q19); `win32`
  falls through to `FileKeyring`.
- Does **not** wire the keyring into `clients.ts` or the scripts yet (that's
  the AuraClient task). Standalone, tested in isolation.

## Acceptance criteria

- `@pi-aura/shared/keyring` exports: `SecretKey`, `StoredSecret`, `Keyring`,
  `createKeyring`, `KeyringUnavailableError`, `KeyringLockedError`,
  `KeyringDBusError`.
- `createKeyring()` returns a `Keyring` with a working `getSecret` /
  `setSecret` / `deleteSecret` / `listSecrets` for `SecretKey`.
- `listSecrets()` returns `{ key: SecretKey; secret: string }[]` — only
  entries matching the enumeration, via per-key probe (no side-index).
- On Linux: `SecretServiceKeyring.isAvailable()` is a static that returns
  true iff a D-Bus session bus is reachable and a Secret Service is
  registered; CRUD round-trips against the real GNOME Keyring.
- On macOS: `MacosKeyring` uses `/usr/bin/security`; CRUD round-trips.
- On any platform: `FileKeyring` works (JSON-on-disk, `chmod 0o600`).
- `createKeyring()` inline `switch (process.platform)`: `darwin` ->
  MacosKeyring (fallback File); `linux` -> SecretServiceKeyring (fallback
  File); default -> File.
- `dbus-next` is **not** loaded on macOS/file-only code paths (dynamic
  import in the Linux branch only).
- `npm run typecheck` passes in `packages/shared`; a bundled smoke test
  round-trips CRUD against the real OS keyring on the dev machine.

## Existing abstractions to use

- The existing `scripts/src/keyring.ts` (the first implementation) as the
  *reference* for the platform CLI/D-Bus calls — do not edit it; the
  rewrite replaces it. Borrow the `run()`/spawn helper, the
  `resolveBinary`/Nix-store probing, and the macOS `security` invocations.
- The Secret Service spec (freedesktop) for the dbus-next impl:
  OpenSession/DH-ietf1024-sha256-aes128-cbc-pkcs7 handshake, session
  encryption, CreateCollection/LookupItem/CreateItem/DeleteItem.

## Architecture / domain decisions

From the second grilling (keyring redesign): zero-arg `createKeyring`,
`SecretKey` enum of `{service, name}`, impls-are-`Keyring`, no
`KeyringBackend`, Linux via `dbus-next` (replace `secret-tool`), drop
Windows + side-index, `isAvailable()` static not on interface, three
errors, per-impl OS-string packing + namespace normalization, split by
impl, `dbus-next` in `dependencies` dynamically imported in the Linux
branch.
