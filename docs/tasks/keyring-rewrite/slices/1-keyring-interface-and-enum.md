---
kind: slice
slug: keyring-interface-and-enum
title: SecretKey enum, Keyring interface, errors, and barrel
task: ../task.md
mode: hitl
status: todo
size: s
blocked_by: []
---

## End-to-end behavior

The public surface of `@pi-aura/shared/keyring` exists: the `SecretKey`
enumeration, the `Keyring` interface, `StoredSecret`, the three error
classes, and the barrel file that exports them. `createKeyring()` is
declared (returns `Promise<Keyring>`) but not yet implemented — it throws
"not implemented" until the dispatch slice. No impls yet.

## Acceptance criteria

- `packages/shared/src/keyring/keyring.ts` exports:
  - `type SecretKey = { service: "aura"; name: "pat" }` (closed enum; the
    comment notes "add a union member to add a capable secret").
  - `interface StoredSecret { key: SecretKey; secret: string }`.
  - `interface Keyring { getSecret(key): Promise<string|null>;
    setSecret(key, secret): Promise<void>; deleteSecret(key):
    Promise<boolean>; listSecrets(): Promise<StoredSecret[]>; }`
    (no `backendId`, no `isAvailable` — those aren't on the interface per
    Q11).
  - `class KeyringUnavailableError extends Error` with `code =
    "KEYRING_UNAVAILABLE"` and `tried: string[]`.
  - `class KeyringLockedError extends Error` with `code =
    "KEYRING_LOCKED"` and `backendId: string`.
  - `class KeyringDBusError extends Error` with `code =
    "KEYRING_DBUS_ERROR"`.
  - `export async function createKeyring(): Promise<Keyring>` (throws
    "not implemented" for now).
- `packages/shared/src/keyring/index.ts` re-exports the public surface.
- `packages/shared/package.json` `exports` maps `./keyring` ->
  `./src/keyring/index.ts`.
- `npm run typecheck` in `packages/shared` passes.

## Test plan

- Seams: the `SecretKey` enum must be a discriminated union of literal
  objects (Q4) — verify `const k: SecretKey = { service: "aura", name: "pat"
  }` type-checks and `{ service: "aura", name: "other" }` does **not**.
- Failure modes: if `name` is a flat string (not a literal), invalid names
  type-check — keep it a literal.
- Scenarios: a scratch import `import { SecretKey, createKeyring } from
  "@pi-aura/shared/keyring"` resolves and `createKeyring()` throws the
  not-implemented error.
- Edge cases: the `Keyring` interface has **no** `isAvailable` (Q11) and no
  `backendId` — confirm neither leaks onto it.

## Constraints / dependencies

- Blocked by `workspaces-bootstrap` (the package must exist).
