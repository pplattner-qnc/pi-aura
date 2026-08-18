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

## Implementation notes

### slice(keyring-interface-and-enum): SecretKey enum, Keyring interface, errors, and barrel

- Merged `slice/keyring-interface-and-enum` into `task/keyring-rewrite`.
- `packages/shared/src/keyring/keyring.ts` exports the closed `SecretKey`
  discriminated union (`{ service: "aura"; name: "pat" }`), `StoredSecret`,
  the `Keyring` interface, the three error classes
  (`KeyringUnavailableError`, `KeyringLockedError`, `KeyringDBusError`), and
  `createKeyring()` (throws "not implemented").
- `packages/shared/src/keyring/index.ts` barrels the public surface; the
  exec helpers (`run`, `resolveBinary`, `isFile`, `ExecError`,
  `ToolMissingError`) live in `internal.ts` and are **not** re-exported by
  the barrel (pre-authorized by the architecture spec for slice 3's use).
- `packages/shared/package.json` adds the `"./keyring"` export and a
  minimal `"typecheck": "tsc --noEmit"` script.
- Verification: `npm run typecheck` passed in `packages/shared`; scratch
  TypeScript and bundled-ESM runtime checks passed (`createKeyring()`
  throws `Error("not implemented")`). No committed test suite exists per
  `docs/testing.md`.
- Deviations (per TDD worker): (1) `internal.ts` created in this slice
  instead of slice 3 — the architecture spec pre-authorizes it; (2) the
  `typecheck` npm script was added to satisfy the acceptance criterion; (3)
  scratch tests used in lieu of a committed suite.

### slice(file-keyring-impl): FileKeyring — JSON-on-disk fallback that implements Keyring

- Merged `slice/file-keyring-impl` into `task/keyring-rewrite`.
- `packages/shared/src/keyring/file-keyring.ts` exports `class FileKeyring
  implements Keyring`: `isAvailable()` returns `true` (always-available fallback);
  CRUD round-trips against a JSON store keyed by `${service}/${name}`;
  `listSecrets()` probes the closed `SecretKey` enumeration and ignores unknown
  map entries; corrupt JSON is swallowed (treated as empty store); the store
  directory is `mkdir -p`-ed, the file is written with mode `0o600` (chmod
  failures ignored).
- The namespace constant `"aura-skills"` lives in this module and builds the
  default store path (`~/.cache/aura-skills/store.json`). A constructor arg
  allows injecting a temp store path for tests (internal seam, not on the
  `Keyring` interface).
- `FileKeyring` is exported only from `file-keyring.ts` (intentionally **not**
  re-exported from the public barrel), matching the task-level export contract.
- Verification: `npm run typecheck` passed in `packages/shared` and
  `scripts`; an esbuild-bundled smoke test round-tripped CRUD and confirmed
  store file mode `600`. No committed test suite exists per `docs/testing.md`.
- Deviations (per TDD worker): none beyond the slice plan. The first esbuild
  smoke run served as the RED step; an unused `unpackKey` helper was removed
  before the first GREEN commit.

### slice(macos-keyring-impl): MacosKeyring — security CLI impl of Keyring

- Merged `slice/macos-keyring-impl` into `task/keyring-rewrite`.
- `packages/shared/src/keyring/macos-keyring.ts` exports `class MacosKeyring
  implements Keyring`: `static isAvailable()` returns `true` iff
  `process.platform === "darwin"` and `/usr/bin/security` exists; CRUD
  round-trips via `security find-generic-password` / `add-generic-password` /
  `delete-generic-password` / `dump-keychain`. `setSecret` does
  delete-then-add (no upsert); `deleteSecret` returns `false` on exit 44
  (secItemNotFound); `listSecrets` parses `dump-keychain` blocks and re-reads
  each secret via `getSecret` (never trusts dump text for values).
- Per-impl packing (Q14): namespace `"aura-skills"` is the `-s` (service)
  attribute and the account stores `${service}/${name}` (e.g. `"aura/pat"`),
  making `listSecrets` recovery unambiguous and keeping the namespace scoped
  under a single macOS service attribute. This is one of the two recommended
  packing options in the slice doc.
- Locked-keychain detection is a best-effort string scan of `security` stderr
  for known macOS messages, mapping to `KeyringLockedError`. Exact error text
  may vary by OS version.
- `MacosKeyring` is exported only from `macos-keyring.ts` (intentionally
  **not** re-exported from the public barrel), matching the task-level export
  contract.
- Verification: `npm run typecheck` passed in `packages/shared` and
  `scripts`; a `tsx` runtime check confirmed
  `MacosKeyring.isAvailable() === false` on `process.platform === "linux"`
  (platform guard). Full CRUD round-trip against a real keychain was **not**
  performed because the dev box is Linux and lacks `/usr/bin/security` — this
  is the expected residual risk called out in the slice doc and arch spec (a
  manual macOS-host verification step). No committed test suite exists per
  `docs/testing.md`.
- Deviations (per TDD worker): the `-s "aura-skills"` / `-a "<service>/<name>"`
  packing choice (documented in source) over the alternative
  namespace-as-account-prefix option; both were equally valid per the slice
  doc.

### slice(secret-service-dbus-impl): SecretServiceKeyring — dbus-next Secret Service impl of Keyring

- Merged `slice/secret-service-dbus-impl` into `task/keyring-rewrite`.
- `packages/shared/src/keyring/secret-service-keyring.ts` exports `class
  SecretServiceKeyring implements Keyring` — a Linux Secret Service D-Bus
  backend using `dbus-next` with the `DH-ietf1024-sha256-aes128-cbc-pkcs7`
  handshake and AES-128-CBC + PKCS#7 encryption. Static top-level
  `import dbus from "dbus-next"` (file is only dynamically loaded on Linux by
  the upcoming dispatch slice).
- Added `dbus-next@^0.10.2` to `packages/shared/package.json` `dependencies`
  (hoisted to root `node_modules`).
- `static async isAvailable()` probes the session bus + Secret Service with a
  3-second timeout guard and an `error` event listener (prevents dbus-next from
  crashing/hanging when the session bus socket is absent).
- DH handshake uses Node's `getDiffieHellman("modp2")` (IETF MODP 1024-bit /
  Oakley Group 2). Key derivation matches libsecret: HKDF-SHA256 with
  salt = 32 zero bytes, info = empty, IKM = DH shared secret padded to
  128 bytes.
- CRUD via `org.freedesktop.Secret.Service/Collection/Item`. Default
  collection resolution: alias `default` →
  `/org/freedesktop/secrets/collection/login` → `CreateCollection("default")`
  if absent. Attribute packing:
  `{ "xdg:schema": "aura-skills", service, name }`.
- `listSecrets()` probes each known `SecretKey` with `getSecret` (no side-index,
  per Q10).
- Locked collection/item errors map to `KeyringLockedError`; other D-Bus
  errors map to `KeyringDBusError` (`wrapDbusError`/`isLockedDbusError` inspect
  D-Bus error type/text).
- `SecretServiceKeyring` is exported only from `secret-service-keyring.ts`
  (intentionally **not** re-exported from the public barrel), matching the
  task-level export contract.
- Verification: `npm run typecheck` passed in `packages/shared` and `scripts`;
  `scripts` build passed (both aura-digest/aura bundles); a bundled smoke test
  round-tripped CRUD against the real GNOME Keyring on the dev box (set OK,
  get matches, list found, delete true, get-after-delete null). Negative
  probes: `DBUS_SESSION_BUS_ADDRESS=` and a nonexistent socket path both return
  `isAvailable() === false` without crashing/hanging. No committed test suite
  exists per `docs/testing.md`.
- Deviations (per TDD worker, all non-blocking):
  (1) `isAvailable()` returns `Promise<boolean>` rather than `boolean` —
  D-Bus reachability can only be verified asynchronously; the pending
  `create-keyring-dispatch` slice must `await` it.
  (2) `org.freedesktop.Secret.Item` properties in `CreateItem` must be
  fully qualified (`"org.freedesktop.Secret.Item.Attributes"` /
  `"org.freedesktop.Secret.Item.Label"`) — shorter names are rejected by
  GNOME Keyring (implementation detail surfaced by D-Bus monitoring).
  (3) The HKDF-SHA256 key derivation (zero salt/info) was reverse-engineered
  from libsecret 0.21.7 source because the spec wording was ambiguous on key
  derivation.
  (4) `isAvailable()` includes the timeout guard + error listener noted above.
