## Deviation report — file-keyring-impl

### API surface changes
- **Planned:** `packages/shared/src/keyring/file-keyring.ts` exports `class
  FileKeyring implements Keyring` with static `isAvailable()` → `true` (always),
  CRUD against a JSON-on-disk store keyed by packed `(namespace, SecretKey)`,
  namespace constant `"aura-skills"`, store path `~/.cache/aura-skills/store.json`
  with `chmod 0o600`, `listSecrets()` returns typed known keys only via per-key
  probe (no side-index), constructor path-override test hook.
- **Actual:** Matches exactly. `FileKeyring implements Keyring`; static
  `isAvailable()` returns `true`; CRUD round-trips; `packKey(key)` →
  `${key.service}/${key.name}` (reversible, unhashed); `NAMESPACE = "aura-skills"`
  module constant; `DEFAULT_STORE_PATH = ~/.cache/aura-skills/store.json`;
  `save()` uses `writeFile(..., { mode: 0o600 })` + best-effort `chmod(0o600)`
  with catch; `listSecrets()` iterates `KNOWN_SECRET_KEYS` and returns only
  matching string entries; `load()` swallows corrupt JSON → empty map;
  constructor takes optional `storePath` override.
- **Impact:** None on dependent slices. `FileKeyring` is the universal
  fallback for slice 5's dispatch; its interface contract is met.

### Abstraction usage
- Used/was specified: yes. The `Keyring` interface, `SecretKey`, and
  `StoredSecret` are imported from `./keyring.js` (type-only import for the
  interface and types — correct). The reference `FileBackend` pattern
  (`scripts/src/keyring.ts`) was borrowed: JSON-on-disk map, `chmod 0o600`
  best-effort with catch, `~/.cache/<namespace>/store.json` path, corrupt-JSON
  → empty. The old `KeyringBackend` seam, `{account, secret}` shape, and
  side-index were **not** copied — correct.
- The `internal.ts` exec helpers (slice 1) were **not** used — correct (file
  backend uses `node:fs/promises`, no CLI spawning).

### Out-of-scope changes
- **`KNOWN_SECRET_KEYS` constant array** (`[{ service: "aura", name: "pat" }]`)
  added to `file-keyring.ts` as the probe set for `listSecrets()`. Not in the
  slice doc or arch spec, but it's the natural, minimal way to enumerate the
  closed `SecretKey` union at runtime (TypeScript unions aren't iterable).
  Justified: `listSecrets()` must probe per known key (Q10), and this array is
  the single source of truth that grows with the enum. A comment notes "Add
  new union members here as the enum grows." Minor, acceptable.
- **`.work/file-keyring-smoke.ts` committed to the slice branch.** The arch
  spec's risk notes said the smoke test should be "a throwaway (or a
  scratch)" — it was committed alongside the implementation rather than kept
  untracked. The `docs/tasks/keyring-rewrite/.work/` dir is not gitignored.
  This is a minor process deviation (scratch test artifact committed), not a
  code defect. The land-worker should consider whether to keep or drop it on
  landing; it's harmless but adds a non-source file to the task branch.

### Divergence from the slice doc's acceptance criteria
- **Packing reversible?** Yes — `packKey` produces `${service}/${name}`.
  `listSecrets()` recovers the `SecretKey` by probing `KNOWN_SECRET_KEYS`
  (not by unpacking the string), so the pack doesn't even need to be
  reversible for `listSecrets` to work. `getSecret`/`setSecret`/`deleteSecret`
  all use `packKey` consistently. ✅
- **`listSecrets` recovers `SecretKey`?** Yes — it iterates
  `KNOWN_SECRET_KEYS` and returns `{ key: known, secret }` for matches. The
  `key` is a proper `SecretKey` literal object, not a reconstructed string. ✅
- **No side-index?** Yes — `listSecrets` probes the JSON map per known key;
  there is no separate index file or account-index (unlike the old
  `SecretServiceBackend`). ✅ (Q10)
- **Typed keys only?** Yes — unknown map entries (e.g. `"foo/bar"`,
  `"other/service"`) are ignored by `listSecrets` (not returned, not crashed
  on). Verified by the smoke test. ✅ (Q12)
- **Corrupt JSON → null/empty?** Yes — `load()` catches all errors and returns
  `{}`; `getSecret` returns null, `listSecrets` returns `[]`. Verified by
  smoke test. ✅
- **`chmod` failures ignored?** Yes — `chmod` is wrapped in try/catch. ✅
- **Constructor path-override test hook?** Yes — `constructor(storePath?:
  string)`. ✅
- **`FileKeyring` not in the public barrel?** Correct — `index.ts` does not
  re-export `FileKeyring`; it's exported only from `file-keyring.ts`. Matches
  the task-level export contract (impls are imported directly by the dispatch
  slice, not via the barrel). ✅

### Task doc update needed?
- **Yes — minor:** append to `## Implementation notes` that slice
  `file-keyring-impl` added a `KNOWN_SECRET_KEYS` runtime array in
  `file-keyring.ts` to enumerate the closed `SecretKey` union for
  `listSecrets()` probing. Other impls (macos, secret-service) may want a
  similar pattern or a shared `KNOWN_SECRET_KEYS` in `keyring.ts` — consider
  consolidating in the coherence refactor or slice 5. Also note the
  `.work/` smoke test was committed (decide whether to keep or gitignore
  `.work/` going forward).

### User attention needed?
- **No.** The implementation matches the arch spec and slice doc. The only
  deviations are a justified `KNOWN_SECRET_KEYS` runtime array (the natural
  way to probe a closed TS union) and a committed scratch smoke-test file
  (minor process). No scope change, no API surface difference, no blockers.
