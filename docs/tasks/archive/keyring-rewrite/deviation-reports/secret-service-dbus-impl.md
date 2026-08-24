## Deviation report — secret-service-dbus-impl

### API surface changes
- **Planned:** `packages/shared/src/keyring/secret-service-keyring.ts` exports
  `class SecretServiceKeyring implements Keyring`; static `isAvailable()` returns
  `boolean` (slice doc: "Static `SecretServiceKeyring.isAvailable()` -> linux +
  session bus reachable + Secret Service registered"). `dbus-next` in
  `packages/shared/package.json` `dependencies`.
- **Actual:** Matches, **except** `isAvailable()` returns `Promise<boolean>` not
  `boolean`. D-Bus reachability can only be verified asynchronously (the probe
  calls `getProxyObject` + `ReadAlias("default")`, both async). This is a
  necessary, correct deviation: a synchronous `isAvailable()` cannot probe a
  D-Bus socket. **Impact:** the dependent `create-keyring-dispatch` slice (slice 5)
  must `await SecretServiceKeyring.isAvailable()` — the arch spec's dispatch
  pseudocode already uses `await`, so this aligns. The `MacosKeyring.isAvailable()`
  (slice 3) also returns `Promise<boolean>` for consistency. No API-surface
  breakage for downstream; the `Keyring` interface itself (which excludes
  `isAvailable` per Q11) is unchanged.
- **Actual (rest):** `dbus-next@^0.10.2` added to `dependencies` (verified);
  hoisted to root `node_modules` by npm workspaces (verified). Static top-level
  `import dbus, { Variant, type MessageBus } from "dbus-next"` (Q23 — verified).
  No `secret-tool` usage (verified). `Keyring`/`SecretKey`/`StoredSecret` and
  `KeyringLockedError`/`KeyringDBusError` imported from `./keyring.js` (verified —
  no reimplementation of the interface or errors).

### Abstraction usage
- **dbus-next used correctly:** yes — `sessionBus()`, `getProxyObject`,
  `getInterface`, `OpenSession`, `ReadAlias`, `CreateCollection`,
  `Collection.SearchItems`, `Collection.CreateItem`, `Item.GetSecret`,
  `Item.Delete` all used via the `org.freedesktop.Secret.*` interfaces. The
  `Variant` wrapper is used correctly for D-Bus typed values (e.g.
  `new Variant("ay", clientPublic)` for the DH public key,
  `new Variant("a{ss}", attributes)` for the attribute map).
- **Keyring interface imported:** yes — `implements Keyring` and the four
  methods (`getSecret`/`setSecret`/`deleteSecret`/`listSecrets`) match the
  interface from slice 1. No `backendId`/`isAvailable` on the instance (those
  are statics, per Q11).
- **No `secret-tool`:** confirmed — no `spawn`/`run`/CLI calls; the `internal.ts`
  exec helpers from slice 1 are **not** imported (correct — dbus-next is a JS
  lib, not a CLI, per arch spec).
- **No side-index:** confirmed — `listSecrets()` probes `getSecret` per
  `KNOWN_SECRET_KEYS` (Q10). This is the simplification the rewrite delivers
  (the old `secret-tool` backend needed a JSON side-index because `search`
  doesn't print attributes; dbus-next reads item attributes directly).

### Out-of-scope changes
- **`scripts/src/keyring-smoke-secret-service.ts`** — a 53-line bundled smoke
  test under `scripts/src/`. The slice doc's test plan says "verify against the
  real keyring" on the dev box; this scratch file is the verification vehicle.
  It's committed (tracked, not gitignored). ⚠️ **Minor scope question:** it
  lives under `scripts/src/` (the scripts esbuild project), not under
  `packages/shared/` or a `.work/` scratch dir. It's not included in the
  esbuild entry points (`aura.ts`/`aura-digest.ts`), so it doesn't affect the
  skill bundles, but it will be typechecked by `scripts/tsconfig.json` (which
  includes `src/**/*.ts`). This is harmless (typecheck passes) but the file
  should probably be removed before the task is finalized, or moved to a
  `.work/` scratch dir, since it's a one-off verification artifact, not a
  permanent test. **Not a blocker** — note for the coherence refactor.
- **`package-lock.json`** — regenerated at root (dbus-next + transitives
  added). Expected and correct (workspace install). Gitignored per `.gitignore`,
  so not committed.

### Divergence from the slice doc's acceptance criteria

| Criterion | Status | Notes |
|-----------|--------|-------|
| `class SecretServiceKeyring implements Keyring` | ✅ met | Verified |
| Static `import dbus-next` at top (Q23) | ✅ met | `import dbus, { Variant, ... } from "dbus-next"` |
| `dbus-next` in `dependencies` | ✅ met | `^0.10.2` in `packages/shared/package.json` |
| `isAvailable()` -> linux + bus + service | ✅ met (async) | Returns `Promise<boolean>` — see API surface note |
| OpenSession DH-ietf1024-sha256-aes128-cbc-pkcs7 | ✅ met | `getDiffieHellman("modp2")` (IETF MODP 1024 / Oakley Group 2) |
| AES-128-CBC + PKCS#7 | ✅ met | `createCipheriv("aes-128-cbc", ...)`; PKCS#7 is Node's default CBC padding |
| GetCollection / default collection | ✅ met | `ReadAlias("default")` → login path → `CreateCollection` fallback |
| LookupItem / CreateItem / DeleteItem | ✅ met | `SearchItems` + `CreateItem` + `Item.Delete` |
| Attribute packing (Q14, namespace `aura-skills`) | ✅ met | `{ "xdg:schema": "aura-skills", service, name }` — matches arch spec example |
| `listSecrets` per-key probe (Q10, no side-index) | ✅ met | Probes `KNOWN_SECRET_KEYS` |
| Locked → `KeyringLockedError`; D-Bus → `KeyringDBusError` | ✅ met | `isLockedDbusError` + `wrapDbusError` |
| File only dynamically imported (Q24) | ✅ met (structural) | This file statically imports dbus-next, but is only `import()`ed in the Linux branch of `createKeyring()` (slice 5). Verified by structure — slice 5 owns the dynamic import. |

### Key derivation divergence (important, justified)
- **The spec said:** OpenSession DH + AES-128-CBC. The slice doc mentioned
  cross-checking against `secret-service-rs` and the spec, with a fallback to
  plaintext `org.freedesktop.Secret.Generic` session if encryption was "too
  fiddly."
- **The actual:** the tdd-worker **reverse-engineered the KDF from libsecret
  0.21.7 source** (`secret-session.c`, `egg-dh.c`, `egg-hkdf.c`) + captured
  `dbus-monitor` traffic. The correct KDF is **HKDF-SHA256** with a 32-zero-byte
  salt and empty info (not a plain SHA-256 of the shared secret), and the DH
  shared secret is **left-padded to 128 bytes** before HKDF. The spec's wording
  ("DH-ietf1024-sha256-aes128-cbc-pkcs7") was ambiguous on the KDF — this is a
  **spec gap, not an implementation error**. The worker did the right thing
  (reverse-engineered the reference impl rather than guessing). This is a
  workflow finding (the spec underspecified the KDF), not a project defect.
- **D-Bus property names:** `CreateItem` properties must be fully qualified
  (`"org.freedesktop.Secret.Item.Attributes"`, `"org.freedesktop.Secret.Item.Label"`)
  — shorter names are rejected by GNOME Keyring. Implementation detail
  surfaced by D-Bus introspection, not a spec divergence.
- **Timeout guard + error listener:** `isAvailable()` has a 3-second
  `Promise.race` timeout and an `error` event listener to prevent dbus-next
  from crashing/hanging when the session bus socket is absent. Not in the
  spec but necessary for robustness (verified: `DBUS_SESSION_BUS_ADDRESS=`
  → `isAvailable() === false` without crashing).

### Was the slice split into 4a/4b?
- **No.** The slice was kept as one (`4-secret-service-dbus-impl.md` only —
  no `4a`/`4b` files). The arch spec pre-authorized the split ("if it risks
  stalling"), but the worker completed it in one slice. This is the preferred
  outcome ("prefer to keep it one slice and reassess"). Clean — no split
  artifacts to reconcile.

### dbus-next version pinning + event-stream audit
- **dbus-next:** pinned at `^0.10.2` in `packages/shared/package.json`
  `dependencies` (matches the grilling's Q23 + the map's "Facts established by
  Wayfinder" note about v0.10.2). Resolved to `0.10.2` in the lockfile. ✅
- **`event-stream` audit:** ⚠️ **`event-stream@3.3.4` is a *runtime*
  transitive dependency of `dbus-next`** (confirmed in the lockfile:
  `dbus-next` → `dependencies: { ..., 'event-stream': '3.3.4', ... }`).
  The grilling noted `event-stream` as "a 2018 supply-chain-noted package,
  dev/debug transitive — auditable, worth pinning." The lockfile shows it's
  **not** dev-only — it's a runtime dep of `dbus-next` (dbus-next uses it for
  its debug/message-logging layer). `event-stream@3.3.4` is the **post-incident
  version** (the 2018 `event-stream@3.3.6` crypto-miner injection affected only
  `>=3.3.6`; `3.3.4` predates the compromise). So the pinned `3.3.4` is the
  *safe* version, but it's worth a follow-up note: if a `npm audit` or
  `npm update` ever bumps `event-stream` past 3.3.5, it would enter the
  compromised range. **Recommendation for the task doc:** pin
  `dbus-next@0.10.2` exactly (drop the `^`) so a transitive bump can't pull a
  newer `event-stream`, OR add an npm `overrides` entry pinning
  `event-stream@3.3.4` at the root. This is advisory — not a blocker for this
  slice, but a security-hardening note for the coherence refactor or the
  `clients-cleanup` task.

### Task doc update needed?
- **Yes — append to `## Implementation notes`:**
  1. `SecretServiceKeyring.isAvailable()` returns `Promise<boolean>` (async
     D-Bus probe); slice 5's dispatch must `await` it (the arch-spec pseudocode
     already does).
  2. The KDF is HKDF-SHA256 (32-zero salt, empty info, DH secret padded to 128
     bytes), reverse-engineered from libsecret 0.21.7 — the spec was ambiguous
     on this; the implementation is the source of truth now.
  3. `event-stream@3.3.4` is a *runtime* (not dev) transitive dep of `dbus-next`;
     it's the safe pre-compromise version, but consider pinning `dbus-next`
     exactly or adding an npm `overrides` pin for `event-stream`.
  4. `scripts/src/keyring-smoke-secret-service.ts` is a committed one-off smoke
     test under `scripts/src/` — consider removing or moving to `.work/` before
     task finalization.

### User attention needed?
- **No.** The `isAvailable()` return-type change (`boolean` → `Promise<boolean>`)
  is necessary and aligns with the arch-spec dispatch pseudocode (which
  `await`s it). The KDF reverse-engineering is a justified resolution of a spec
  gap. The `event-stream` finding is advisory hardening, not a blocker. No
  scope change or API-surface difference requires a user decision.
