# Architecture spec — keyring-rewrite

> Task: `keyring-rewrite` (second implementation task of the
> `aura-access-rewrite` map). Writes a from-scratch `keyring.ts` into
> `packages/shared/` (the workspace package created by `workspaces-bootstrap`,
> now merged to `main`). The old `scripts/src/keyring.ts` (secret-tool-based,
> `KeyringBackend` seam) is the *reference* but is **not edited** here — it
> stays until `call-site-migration` rewires callers and `clients-cleanup`
> removes the old import path.

## Goal

A typed, pure-JS, cross-platform keyring living in `packages/shared/src/keyring/`,
importable as `@pi-aura/shared/keyring`. It exposes a closed `SecretKey`
enumeration, a `Keyring` interface, a zero-arg `createKeyring()`, and three
concrete implementations (`FileKeyring`, `MacosKeyring`, `SecretServiceKeyring`)
that each implement `Keyring` directly — **no `KeyringBackend` seam** (grilling
Q8). The Linux impl speaks the Secret Service D-Bus spec via `dbus-next` (pure
JS, replacing the `secret-tool` binary). `createKeyring()` uses an inline
`switch (process.platform)` and dynamically `import()`s the Linux impl only on
Linux, so `dbus-next`'s module graph never loads on macOS/file paths.

## Repository today (what we start from)

- `packages/shared/` exists on `main` (merged from `workspaces-bootstrap`):
  `package.json` (`@pi-aura/shared`, private, `exports` mapping `.` and
  `./*` to `.ts` sources), `src/index.ts` (placeholder), `tsconfig.json`
  (mirrors scripts: ES2022/ESNext/bundler/strict), `devDependencies`
  (`typescript`, `@types/node`). **No `dependencies` yet** — this task adds
  `dbus-next`.
- The `exports` field is currently `".": "./src/index.ts", "./*": "./src/*.ts"`.
  Slice 1 adds an explicit `"./keyring": "./src/keyring/index.ts"` subpath
  (the `./*` glob would already resolve it, but the slice doc asks for the
  explicit mapping — add it for clarity/discoverability).
- `scripts/src/keyring.ts` is the **reference** implementation (the first
  keyring). Surface today: `createKeyring(service)` (service-bound), a
  `KeyringBackend` seam with `MacosKeychainBackend` / `SecretServiceBackend`
  (secret-tool) / `WindowsCredmanBackend` / `FileBackend`, `StoredSecret =
  {account, secret}`, errors `KeyringUnavailableError` / `KeyringLockedError`.
  The rewrite **borrows** the `run()`/spawn helper, `resolveBinary`/Nix-store
  probing, and the macOS `security` invocation patterns — but changes the
  types (`StoredSecret` → `{key: SecretKey; secret}`), drops the
  `KeyringBackend` seam, drops the `service` arg (zero-arg `createKeyring`),
  drops the side-index (dbus-next reads attributes directly), and replaces
  secret-tool with dbus-next.
- This task does **not** wire the keyring into `clients.ts` or the scripts
  (that's `aura-client` / `call-site-migration`). Standalone, tested in
  isolation.
- No automated test suite (per `docs/testing.md`): the gate is
  `npm run typecheck` in `packages/shared` + a bundled esbuild smoke test
  that round-trips CRUD against the real OS keyring on the dev machine.

## Type/shape decisions (from the grilling, settled)

- `SecretKey` = discriminated union of literal-object types; starts as
  `type SecretKey = { service: "aura"; name: "pat" }` (Q4). Grows by adding
  union members. `name` is a per-service literal union when a service has
  multiple names.
- `StoredSecret` = `{ key: SecretKey; secret: string }` (Q13).
- `Keyring` interface: `getSecret(key): Promise<string|null>`,
  `setSecret(key, secret): Promise<void>`,
  `deleteSecret(key): Promise<boolean>`,
  `listSecrets(): Promise<StoredSecret[]>` (Q11: **no** `isAvailable`, **no**
  `backendId` on the interface — those are statics on each impl).
- `createKeyring()` = zero args (Q9). Namespace `"aura-skills"` is an internal
  per-impl constant (Q2, adjustable per-OS).
- Three errors off `Error` with a `code` discriminator (Q21):
  `KeyringUnavailableError` (`code = "KEYRING_UNAVAILABLE"`, `tried: string[]`),
  `KeyringLockedError` (`code = "KEYRING_LOCKED"`, `backendId: string`),
  `KeyringDBusError` (`code = "KEYRING_DBUS_ERROR"`).
- `listSecrets` returns typed known keys only (Q12: unknowns dropped) via
  per-key probe (Q10: no side-index).
- File split by impl (Q25): `keyring.ts` (public surface + dispatch) +
  `file-keyring.ts` + `macos-keyring.ts` + `secret-service-keyring.ts` +
  `index.ts` barrel.
- `isAvailable()` is a **static** on each impl, not on the `Keyring`
  interface (Q11).
- `dbus-next` in `packages/shared/package.json` `dependencies`, dynamically
  `import()`ed only in the Linux branch of `createKeyring()` (Q23/Q24).
- Windows: not implemented (Q19); `win32` falls through to `FileKeyring`.

## Per-slice spec

### Slice 1 — `keyring-interface-and-enum` (size s, no blockers)

**Exports / public API surface:**
- `packages/shared/src/keyring/keyring.ts`:
  - `type SecretKey = { service: "aura"; name: "pat" }` (literal union; comment
    notes "add a union member to add a capable secret").
  - `interface StoredSecret { key: SecretKey; secret: string }`.
  - `interface Keyring { getSecret(key: SecretKey): Promise<string|null>;
    setSecret(key: SecretKey, secret: string): Promise<void>;
    deleteSecret(key: SecretKey): Promise<boolean>;
    listSecrets(): Promise<StoredSecret[]> }` — no `isAvailable`, no
    `backendId`.
  - `class KeyringUnavailableError extends Error` (`code = "KEYRING_UNAVAILABLE"
    as const`, `tried: string[]`).
  - `class KeyringLockedError extends Error` (`code = "KEYRING_LOCKED" as
    const`, `backendId: string`).
  - `class KeyringDBusError extends Error` (`code = "KEYRING_DBUS_ERROR" as
    const`).
  - `export async function createKeyring(): Promise<Keyring>` — throws
    `"not implemented"` for now (body is `throw new Error("not implemented")`).
- `packages/shared/src/keyring/index.ts`: re-exports the public surface from
  `./keyring.js`.
- `packages/shared/package.json` `exports`: add explicit
  `"./keyring": "./src/keyring/index.ts"` (alongside the existing `./*` glob).
- **Existing abstractions to use:** the error-class shape from the reference
  `scripts/src/keyring.ts` (`KeyringUnavailableError`/`KeyringLockedError` with
  `code` discriminator + `tried`/`backendId`) — copy the pattern, change
  `StoredSecret` to the new shape.
- **Do NOT reimplement:** any backend this slice. No `FileKeyring`/`MacosKeyring`/
  `SecretServiceKeyring` yet. No `run()` helper yet (lives in the impl slices).
- **Interface contract (for slices 2-5):** the `Keyring` interface, `SecretKey`
  enum, `StoredSecret`, and the three error classes are the contract every impl
  slice codes against. `createKeyring()` is declared but throws — slice 5
  implements it.

### Slice 2 — `file-keyring-impl` (size s, blocked by slice 1)

**Exports:** `packages/shared/src/keyring/file-keyring.ts` exports
`class FileKeyring implements Keyring`.
- Static `FileKeyring.isAvailable()` → `true` (always).
- CRUD against a JSON-on-disk store keyed by the packed `(namespace,
  SecretKey)`. Namespace constant `"aura-skills"` (module constant here, per
  Q2). Per-impl packing (Q14): the impl chooses how `(namespace, SecretKey)`
  → a file key string (e.g. `${namespace}:${service}/${name}` or a hashed key).
  Keep it simple and reversible (listSecrets must recover the `SecretKey` from
  the stored key, so prefer an unhashed `${service}/${name}`-style key, or
  store `{service, name, secret}` objects in the JSON array).
- Store path `~/.cache/aura-skills/store.json`; `mkdir -p` the dir;
  `chmod 0o600` on the store file (ignore chmod failures on platforms that
  don't support it).
- `listSecrets()` returns only entries matching the `SecretKey` enumeration
  (typed keys only — Q12); per-key probe of the JSON map (Q10: no side-index).
- **Test hook:** inject a temp store path via a constructor arg for tests
  (the public `Keyring` interface takes no args, but `FileKeyring`'s
  constructor may take an optional path override — internal/test hook).
- **Existing abstractions to use:** the `FileBackend` in the reference
  `scripts/src/keyring.ts` (JSON-on-disk, `chmod 0o600`, `~/.cache` path) —
  borrow the file-handling pattern, change the key shape to `SecretKey`.
- **Do NOT reimplement:** the `Keyring` interface (import from
  `./keyring.js`). No dispatch logic.
- **Interface contract (for slice 5):** `FileKeyring.isAvailable()` + the
  `Keyring` CRUD. Slice 5 uses `FileKeyring` as the fallback in every branch.

### Slice 3 — `macos-keyring-impl` (size m, blocked by slice 1)

**Exports:** `packages/shared/src/keyring/macos-keyring.ts` exports
`class MacosKeyring implements Keyring`.
- Static `MacosKeyring.isAvailable()` → `process.platform === "darwin"` and
  `/usr/bin/security` exists.
- CRUD via `/usr/bin/security` (find/add/delete-generic-password,
  dump-keychain). Per-impl packing of `(namespace, SecretKey)` → the two OS
  strings (`-s <namespace>` service, `-a <name>` account; or pack
  `${service}/${name}` into one — the reference uses `service`/`account`
  separately; keep namespace `"aura-skills"` as the `-s` value and `name` as
  the `-a` value, or pack `${service}/${name}` as account for uniqueness).
  Namespace normalization is identity on macOS (Q16).
- `setSecret` = delete-then-add (no upsert). `deleteSecret` returns true iff
  it existed. `getSecret` returns null on exit 44 (secItemNotFound).
- `listSecrets()` parses `security dump-keychain` for matching entries
  (svce/acct) and re-reads each secret (don't trust the dump for values).
- A locked keychain surfaces as `KeyringLockedError` (wrap `security` errors).
- **Test hook:** the `run()`/spawn helper needs to be available. **Decision:
  put the shared `run()` + `resolveBinary` + `ExecError`/`ToolMissingError`
  helpers in `keyring.ts` (slice 1) OR a small `internal.ts` — see
  "Shared exec helper home" below.** Slice 3 imports it.
- **Existing abstractions to use:** the `MacosKeychainBackend` in the
  reference (the `security` args, exit-code handling, `dump-keychain` parsing)
  — borrow the invocation patterns, adapt to `SecretKey`.
- **Do NOT reimplement:** the `Keyring` interface, the exec helper (import it).
  No dispatch.
- **Residual risk (from slice doc):** CRUD verification needs a macOS host
  (not available on this Linux dev box). On this box: implement + typecheck +
  confirm `isAvailable()` returns false (platform guard). Full CRUD is a
  manual macOS step — note in residual risks.
- **Interface contract (for slice 5):** `MacosKeyring.isAvailable()` + CRUD.
  Slice 5 dispatches to it in the `darwin` branch.

### Slice 4 — `secret-service-dbus-impl` (size xl, blocked by slice 2)

**Exports:** `packages/shared/src/keyring/secret-service-keyring.ts` exports
`class SecretServiceKeyring implements Keyring`.
- Statically `import ... from "dbus-next"` at the top of this file (Q23:
  `dependencies`, static at module level). This file is only dynamically
  `import()`ed by `createKeyring()` in the Linux branch (Q24), so macOS/file
  paths never load it.
- `dbus-next` added to `packages/shared/package.json` `dependencies` (this
  slice). After adding it, run `npm install` at root (workspaces) so the dep
  propagates; verify `dbus-next` resolves from `packages/shared/node_modules`
  (or the hoisted root).
- Static `SecretServiceKeyring.isAvailable()` → `process.platform === "linux"`
  + a D-Bus session bus reachable + a Secret Service registered (catch D-Bus
  errors → false).
- CRUD via the Secret Service spec (freedesktop):
  - `OpenSession` (DH-ietf1024-sha256-aes128-cbc-pkcs7) → encrypted session;
    AES-128-CBC + PKCS#7 padding for the secret payload.
  - Get the default collection (`/org/freedesktop/secrets/collection/login`
    or the alias `default`); create it if absent.
  - `LookupItem` by attributes; `CreateItem`; `DeleteItem`.
  - Per-impl packing of `(namespace, SecretKey)` → D-Bus attributes (Q14):
    e.g. `{ "xdg:schema": "aura-skills", "service": "aura", "name": "pat" }`
    or `{ "aura-skills.service": "aura", "aura-skills.name": "pat" }`. Pick a
    schema and stay consistent. Namespace normalization is identity on Linux
    (Q16).
- `listSecrets()` probes `getSecret` per known `SecretKey` (Q10: no
  side-index — dbus-next reads item attributes directly, unlike the old
  secret-tool backend which needed the index).
- Errors: locked collection → `KeyringLockedError`; D-Bus-level failures →
  `KeyringDBusError`.
- **Existing abstractions to use:** the `run()` helper is **not** used here
  (dbus-next is a JS lib, not a CLI). The reference `SecretServiceBackend`
  shows the *attribute packing* and the CRUD flow conceptually, but the
  transport is entirely different (D-Bus protocol vs `secret-tool` CLI).
  Cross-check the encryption/handshake against the `secret-service-rs`
  reference and the spec.
- **Do NOT reimplement:** the `Keyring` interface, the exec helper. No
  dispatch. No `secret-tool` fallback.
- **Residual risk (from slice doc):** the D-Bus protocol layer (handshake +
  AES) is a few hundred lines and easy to get subtly wrong. If it risks
  stalling, **split** this slice into `4a-secret-service-dbus-handshake`
  (OpenSession + encryption) and `4b-secret-service-dbus-crud` (CRUD methods),
  chained via `blocked_by`. Prefer one slice and reassess; the failure
  toolbelt's first step is "split" anyway.
- **Interface contract (for slice 5):** `SecretServiceKeyring.isAvailable()`
  + CRUD. Slice 5 dispatches to it in the `linux` branch via dynamic `import()`.

### Slice 5 — `create-keyring-dispatch` (size s, blocked by slices 3 + 4)

**Exports:** implements `createKeyring()` in `keyring.ts` (replacing the
`throw "not implemented"`).
- Body: inline `switch (process.platform)` (Q22):
  - `case "darwin"`: try `MacosKeyring` (static `isAvailable()`); if false,
    fall through to `FileKeyring`.
  - `case "linux"`: `const { SecretServiceKeyring } = await
    import("./secret-service-keyring.js")`; try it; if false, fall through to
    `FileKeyring`.
  - `default`: `FileKeyring`.
- Throws `KeyringUnavailableError` (with `tried` listing candidates) only if
  no candidate is available — but `FileKeyring.isAvailable()` is always true,
  so in practice it never throws unless the filesystem is unwritable.
- The dynamic `import()` of the Linux impl is the **only** place
  `dbus-next`'s module graph is reachable from non-Linux platforms. macOS/file
  code paths never load it.
- **Existing abstractions to use:** all three impl classes (import
  `FileKeyring`, `MacosKeyring`; dynamic-import `SecretServiceKeyring`).
- **Do NOT reimplement:** the impls. No `dbus-next` static import here (only
  the dynamic one inside `case "linux":`).
- **Interface contract:** this is the last slice; `createKeyring()` is the
  public entry point downstream tasks (`aura-client`) call.

## Shared exec helper home (cross-slice decision)

Slices 3 (macOS `security`) needs the `run()`/`spawn helper, `resolveBinary`,
and `ExecError`/`ToolMissingError` from the reference. Slice 2 (file) and
slice 4 (dbus) do **not** need it (file uses `node:fs`; dbus uses `dbus-next`).

**Decision:** put the exec helpers (`run`, `resolveBinary`, `isFile`,
`ExecError`, `ToolMissingError`) in a small `packages/shared/src/keyring/internal.ts`
created in **slice 1** alongside the interface (it's part of the public
surface's support code), OR in `macos-keyring.ts` itself in slice 3.

**Recommendation:** create `internal.ts` in slice 1 (size stays `s` — it's a
straightforward port of the reference helpers). This keeps `macos-keyring.ts`
(slice 3) focused on the `security` invocations and avoids a circular import
(`keyring.ts` defining helpers that `macos-keyring.ts` uses would be fine, but
a dedicated `internal.ts` is cleaner and slice-1's `index.ts` barrel can
choose not to re-export it). Slice 1's deliverables list in the slice doc
doesn't mention it, so the tdd-worker should add it as a justified
divergence (like the devDependencies in workspaces-bootstrap slice 1) — flag
this in the slice-1 task prompt so it's not a surprise.

## Cross-slice interface contracts (summary)

```
slice 1: Keyring interface, SecretKey enum, StoredSecret, 3 errors,
         createKeyring() stub, internal.ts exec helpers, ./keyring exports map
slice 2: FileKeyring implements Keyring (always-available fallback)
slice 3: MacosKeyring implements Keyring (darwin; uses internal.ts helpers)
slice 4: SecretServiceKeyring implements Keyring (linux; dbus-next; adds dep)
slice 5: createKeyring() inline switch dispatch (dynamic import on linux)
```

Dependency levels (from `task_dependency_levels`):
- **Level 0:** `keyring-interface-and-enum`
- **Level 1:** `file-keyring-impl`, `macos-keyring-impl` (sequential: shared cwd)
- **Level 2:** `secret-service-dbus-impl`
- **Level 3:** `create-keyring-dispatch`

## Abstraction usage summary

- Reference `scripts/src/keyring.ts` → borrow `run()`/spawn, `resolveBinary`/
  Nix-store probing (into `internal.ts`), macOS `security` invocation patterns
  (slice 3), and the error-class shape (slice 1). **Do not copy** the
  `KeyringBackend` seam, the `service` arg, the `{account, secret}` shape, or
  the side-index.
- `packages/shared/` (from `workspaces-bootstrap`) → add `src/keyring/`
  subtree; add `./keyring` to `exports`; add `dbus-next` to `dependencies`.
- `packages/shared/tsconfig.json` → unchanged (already strict ES2022/bundler).

## Out of scope (explicit)

- Wiring the keyring into `clients.ts` or `aura.ts`/`aura-digest.ts` (that's
  `aura-client` / `call-site-migration`).
- Removing the old `scripts/src/keyring.ts` (stays as reference until
  `call-site-migration`/`clients-cleanup`).
- A Windows keyring backend (Q19; `win32` → `FileKeyring`).
- The `list` subcommand or `/aura secrets` command (separate task
  `aura-secrets-command`).
- Re-generating `openapi.yaml` / `src/generated/`.
- Touching `devlinks.ts`, `bitbucket.ts`, the Atlassian path.

## Risk notes

- **dbus-next encryption (slice 4):** the OpenSession DH handshake + AES-128-CBC
  + PKCS#7 is the riskiest part. The slice doc pre-authorizes a split into
  handshake + CRUD if it stalls. The dev box is Linux with GNOME Keyring, so
  real CRUD verification is possible here (unlike macOS, which is manual).
- **`dbus-next` version pinning:** the grilling noted `dbus-next@0.10.2` and
  its `event-stream` transitive dep (supply-chain-noted, dev/debug). Pin
  `dbus-next` and audit the lockfile for `event-stream`; if it's a runtime
  transitive, flag it. (Per map "Facts established by Wayfinder".)
- **macOS verification gap (slice 3):** full CRUD can only be verified on a
  macOS host. On this Linux box, the deliverable is implement + typecheck +
  `isAvailable() === false`. The tdd-worker should note this as a residual
  risk, not block on it.
- **`internal.ts` in slice 1:** the slice doc doesn't list it, but the macOS
  impl needs the exec helpers. Flag this in the slice-1 prompt so the
  tdd-worker adds it as a justified divergence (mirrors the devDependencies
  divergence in workspaces-bootstrap slice 1).
- **No test suite:** the gate is `npm run typecheck` in `packages/shared` +
  a bundled esbuild smoke test (one-off entry, bundled, run with `node`)
  that round-trips CRUD against the real GNOME Keyring on the dev box. The
  tdd-worker should write the smoke test as a throwaway (or a
  `scripts/src/keyring-smoke.ts`-style scratch) — confirm the slice docs'
  "Test plan" expectations (typecheck + smoke) are the real gate.
