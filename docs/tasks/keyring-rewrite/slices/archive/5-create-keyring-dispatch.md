---
kind: slice
slug: create-keyring-dispatch
title: createKeyring() inline switch + isAvailable probe loop
task: ../task.md
mode: hitl
status: done
size: s
blocked_by:
  - macos-keyring-impl
  - secret-service-dbus-impl
---

## End-to-end behavior

`createKeyring()` is implemented: an inline `switch (process.platform)` (per
Q22) dispatches to the platform's impl, with `FileKeyring` as fallback. On
Linux, the `SecretServiceKeyring` is dynamically `import()`ed (per Q24) so
`dbus-next` isn't loaded on other platforms.

## Acceptance criteria

- `createKeyring()` body: `switch (process.platform)`:
  - `case "darwin"`: try `MacosKeyring` (static `isAvailable()`); if false,
    fall through to `FileKeyring`.
  - `case "linux"`: `const { SecretServiceKeyring } = await
    import("./secret-service-keyring.js")`; try it; if false, fall through
    to `FileKeyring`.
  - `default`: `FileKeyring`.
- Throws `KeyringUnavailableError` (with `tried` listing the candidates)
  only if no candidate is available — but `FileKeyring.isAvailable()` is
  always true, so in practice it never throws unless the filesystem is
  unwritable.
- The dynamic `import()` of the Linux impl is the **only** place
  `dbus-next`'s module graph is reachable; macOS/file code paths never load
  it.
- A bundled smoke test: `createKeyring()` on the Linux dev box returns a
  `SecretServiceKeyring` and CRUD round-trips.

## Test plan

- Seams: `process.platform` is the dispatch key — verify the switch covers
  `darwin`, `linux`, default.
- Failure modes: on Linux with no D-Bus, `SecretServiceKeyring.isAvailable`
  -> false, and `createKeyring()` falls through to `FileKeyring` (not an
  error).
- Scenarios: `createKeyring()` on dev box -> `SecretServiceKeyring`;
  set/get/list/delete round-trip via the returned `Keyring`.
- Edge cases: confirm a macOS-built bundle (cross-compile thought
  experiment) never `require`s `dbus-next` — the dynamic import is inside
  the `case "linux":` branch only.

## Constraints / dependencies

- Blocked by `macos-keyring-impl` and `secret-service-dbus-impl` (both impls
  must exist to dispatch).
