## Deviation report — macos-keyring-impl

### API surface changes
- **Planned:** `packages/shared/src/keyring/macos-keyring.ts` exports
  `class MacosKeyring implements Keyring`. Static `isAvailable()` →
  `process.platform === "darwin"` and `/usr/bin/security` exists. CRUD via
  `/usr/bin/security` (find/add/delete-generic-password, dump-keychain).
  Per-impl packing of `(namespace, SecretKey)` into the two OS strings (Q14);
  namespace `"aura-skills"`, normalization identity on macOS (Q16).
  `setSecret` = delete-then-add (no upsert). `deleteSecret` returns true iff
  existed. `getSecret` returns null on exit 44. `listSecrets()` parses
  `dump-keychain`, re-reads each secret. Locked keychain →
  `KeyringLockedError`.
- **Actual:** Matches exactly. One new file (`macos-keyring.ts`, 146 lines).
  `MacosKeyring` implements `Keyring`; static `isAvailable()` returns
  `process.platform === "darwin" && isFile("/usr/bin/security")` (uses the
  `isFile` helper from `internal.ts`); CRUD uses `run()` from `internal.ts`.
  Packing: `-s "aura-skills"` (namespace as service) + `-a "<service>/<name>"`
  (e.g. `"aura/pat"`) — one of the two options the arch spec recommended.
  `setSecret` = delete-then-add; `deleteSecret` returns `exitCode === 0`;
  `getSecret` returns null on exit 44; `listSecrets` parses `dump-keychain`
  blocks, filters via `unpackKey`, re-reads via `getSecret`. Locked keychain
  detected via best-effort stderr scan → `KeyringLockedError("macos-keychain", …)`.
- **Impact:** None on dependent slices. Slice 5 (`create-keyring-dispatch`)
  calls `MacosKeyring.isAvailable()` and CRUD — both present and correctly
  shaped. No public API surface change (the class is not re-exported from the
  barrel, consistent with "not exported from the public keyring barrel").

### Abstraction usage
- **`internal.ts` exec helpers — used/was specified: yes.** Imports `run`,
  `isFile`, `ExecError` from `./internal.js` (created in slice 1 per the arch
  spec's "Shared exec helper home" decision). Does not reimplement `run()` or
  `spawn`. Correct.
- **Reference `MacosKeychainBackend` patterns — used/was specified: yes.** The
  `security` args (`find-generic-password -s … -a … -w`,
  `delete-generic-password -s … -a …`, `add-generic-password -s … -a … -w`,
  `dump-keychain`), exit-code handling (44 = secItemNotFound, 128), and the
  `dump-keychain` block parsing regex (`/"svce"<blob>="([^"]*)"/`,
  `/"acct"<blob>="([^"]*)"/`, split on `/(?=^keychain: ")/m`) are all borrowed
  faithfully from the reference. Adapted to `SecretKey` (the reference used
  `service`/`account` strings directly; the new impl packs `(namespace,
  SecretKey)` and recovers the typed key via `unpackKey`). Correct.
- **`Keyring` interface — imported, not reimplemented.** Imports
  `Keyring`, `SecretKey`, `StoredSecret`, `KeyringLockedError` from
  `./keyring.js`. Correct.

### Out-of-scope changes
- None. One new file only (`macos-keyring.ts`). No changes to `keyring.ts`,
  `internal.ts`, `index.ts`, `file-keyring.ts`, `package.json`, `tsconfig.json`,
  or any file outside `packages/shared/src/keyring/`. No new deps. No dispatch
  logic. Confirmed via `git diff task/keyring-rewrite..HEAD --name-only` (one
  file) and no staged files.

### Divergence from the slice doc's acceptance criteria

All criteria met. Two minor design choices documented in the implementation
(neither is a deviation — both are within the spec's allowed options):

1. **Packing choice (documented, not a deviation):** The impl uses
   `-s "aura-skills"` (namespace as the macOS service attribute) and
   `-a "<service>/<name>"` (e.g. `"aura/pat"`) as the account. The arch spec
   offered two options — "namespace as `-s`, name as `-a`" OR
   "pack `${service}/${name}` as account" — and the impl chose a hybrid that
   combines both (namespace as `-s`, packed `service/name` as `-a`). This is
   a valid choice: it keeps entries scoped under `aura-skills` (single
   macOS service) while making the original `SecretKey` unambiguously
   recoverable from `dump-keychain` (the `unpackKey` function matches on
   `${service}/${name}`). The slice doc says "namespace constant
   `aura-skills`" and "per-impl packing of `(namespace, SecretKey)` into the
   two OS strings (per Q14)" — both satisfied.
2. **Locked-keychain detection (documented, not a deviation):** The
   `mapError` method scans `ExecError.stderr` for known macOS locked-keychain
   message fragments ("user interaction is not allowed", "a password is
   required", "keychain is locked", etc.) and maps to `KeyringLockedError`.
   This is best-effort (exact text may vary by OS version), which the
   tdd-worker's divergence note flags. The slice doc requires "a locked
   keychain surfaces as `KeyringLockedError` (wrap `security` errors)" —
   satisfied. The approach mirrors how the reference backend relied on
   `security` exit codes / error text.
3. **`KNOWN_SECRET_KEYS` array (not a deviation):** A module-level
   `readonly SecretKey[]` lists the enum's members for `unpackKey` to match
   against. The comment notes "Add new union members here as the enum grows."
   This is the per-key-probe pattern (Q10) adapted to the dump-keychain
   approach: `listSecrets` parses the dump but only yields entries whose
   `svce`/`acct` match a known `SecretKey` — so unknown entries are
   effectively dropped (Q12). This is consistent with the closed-enum design.
   Not a deviation, but the tdd-worker should keep this array in sync if the
   enum grows — a single source-of-truth concern (minor residual risk).

### The macOS CRUD verification gap (residual risk, expected)

- **Full CRUD round-trip was NOT performed** because the dev box is Linux
  (no `/usr/bin/security`). This is the expected residual risk called out in
  both the slice doc ("CRUD verification needs a macOS host (not available
  here). Implement + typecheck + isAvailable-false-on-Linux is the deliverable
  on this box.") and the arch spec. The slice doc's "Scenarios (on macOS):
  CRUD round-trip against the real keychain" is a manual step deferred to a
  macOS host.
- **What was verified on this box:**
  - `npm run typecheck` in `packages/shared` → exit 0 (strict TS, no errors).
  - `MacosKeyring.isAvailable()` returns `false` on `process.platform ===
    "linux"` (confirmed via esbuild-bundled smoke + `npx tsx` runtime check).
- **What needs manual macOS verification:** `getSecret`/`setSecret`/
  `deleteSecret`/`listSecrets` round-trip against the real keychain, exit-44
  (secItemNotFound) handling, and locked-keychain → `KeyringLockedError`
  mapping. The `dump-keychain` parsing regex and `packKey`/`unpackKey`
  round-trip are code-correct but untested against real `security` output.

### Task doc update needed?
- **Yes — append to `## Implementation notes`:** Slice `macos-keyring-impl`
  implemented `MacosKeyring` using `internal.ts` exec helpers (`run`,
  `isFile`, `ExecError`) and the reference `MacosKeychainBackend` patterns.
  Packing: `-s "aura-skills"` + `-a "<service>/<name>"` (e.g. `"aura/pat"`).
  Locked-keychain detection is best-effort stderr scan →
  `KeyringLockedError`. `KNOWN_SECRET_KEYS` array must stay in sync with the
  `SecretKey` enum as it grows. **macOS CRUD round-trip is a manual
  verification step deferred to a macOS host** — only typecheck +
  `isAvailable() === false` were verified on this Linux box.

### User attention needed?
- **No.** The implementation matches the arch spec and slice doc. No API
  surface change, no out-of-scope additions, no scope widening. The macOS
  CRUD verification gap is the expected residual risk documented in the slice
  doc and arch spec — not a defect or a scope change requiring a user decision.
