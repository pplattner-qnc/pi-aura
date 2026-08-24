## Deviation report — keyring-interface-and-enum

### API surface changes
- **Planned:** `packages/shared/src/keyring/keyring.ts` exports `SecretKey`
  (`{ service: "aura"; name: "pat" }`), `StoredSecret` (`{ key: SecretKey;
  secret: string }`), `Keyring` interface (getSecret/setSecret/deleteSecret/
  listSecrets — no `isAvailable`/`backendId`), three error classes
  (`KeyringUnavailableError` with `code`/`tried`, `KeyringLockedError` with
  `code`/`backendId`, `KeyringDBusError` with `code`), and a `createKeyring()`
  stub that throws `"not implemented"`. `index.ts` barrel re-exports the
  public surface. `package.json` `exports` adds `"./keyring"`.
- **Actual:** Matches exactly. Every type, interface method signature, error
  class (with `code = "..." as const` discriminator, `tried`/`backendId`),
  and the `createKeyring()` stub (`throw new Error("not implemented")`) match
  the spec and slice doc verbatim. `index.ts` re-exports the public surface
  and does **not** re-export `internal.ts` (correct — it's internal).
  `package.json` adds the explicit `"./keyring": "./src/keyring/index.ts"`
  mapping alongside the existing `./*` glob.
- **Impact:** None on dependent slices. The interface contract (Keyring,
  SecretKey, StoredSecret, 3 errors, createKeyring stub) is exactly what
  slices 2-5 code against.

### Abstraction usage
- Used/was specified: yes. The three error classes (`KeyringUnavailableError`,
  `KeyringLockedError`) are faithful ports of the reference
  `scripts/src/keyring.ts` shape (`code = "..." as const` discriminator +
  `tried`/`backendId`), with `KeyringDBusError` added new (not in the
  reference). `internal.ts` ports `run()`/`resolveBinary`/`isFile`/
  `ExecError`/`ToolMissingError` directly from the reference (the spawn helper,
  Nix-store probing, ENOENT/EACCES → ToolMissingError mapping, ignoreExitCodes).
  The `KeyringBackend` seam, the `service` arg, the `{account, secret}` shape,
  and the side-index were correctly **not** copied.

### Out-of-scope changes
- **`internal.ts` (pre-authorized).** The arch spec's "Shared exec helper home"
  section explicitly decided to create `internal.ts` in slice 1 and flagged
  it as a justified divergence (the slice doc's deliverables list didn't
  mention it, but slice 3's macOS backend needs the exec helpers). The
  tdd-worker correctly added it here and self-reported it. This is **not a
  blocker** — it's the spec'd approach. The file is 116 lines, a
  straightforward port; the barrel does not re-export it.
- **`typecheck` npm script added** to `packages/shared/package.json`. The
  slice's acceptance criterion says "`npm run typecheck` in `packages/shared`
  passes," but the package had no `scripts` block (only the inherited devDeps).
  The tdd-worker added `"typecheck": "tsc --noEmit"` to make the criterion
  achievable. Minimal, justified, no scope widening.
- **Scratch test files** (`packages/shared/scratch/keyring-types.ts`,
  `packages/shared/scratch/runtime.mjs`). Per `docs/testing.md` (no automated
  test suite), verification used scratch TypeScript (discriminated-union
  type checks via `@ts-expect-error`) and a bundled-ESM runtime smoke test
  (`createKeyring()` throws "not implemented"). These are committed (tracked).
  Minor concern: the scratch dir is not gitignored and is included in the
  slice commit — see residual risks.

### Divergence from the slice doc's acceptance criteria
- All acceptance criteria **met**:
  - `keyring.ts` exports `SecretKey` (literal union, with the "add a union
    member" comment), `StoredSecret`, `Keyring` (no `isAvailable`/`backendId`),
    the three error classes with correct `code` discriminators and
    `tried`/`backendId`, and `createKeyring()` stub. ✅
  - `index.ts` re-exports the public surface. ✅
  - `package.json` `exports` maps `./keyring` → `./src/keyring/index.ts`. ✅
  - `npm run typecheck` passes. ✅ (confirmed independently: exit 0)
- Test-plan criteria met:
  - `SecretKey` discriminated-union behavior: `{ service: "aura", name: "pat" }`
    type-checks; `{ service: "aura", name: "other" }` does not (`@ts-expect-error`
    in scratch test). ✅
  - `Keyring` interface has no `isAvailable`/`backendId` (scratch test uses
    `@ts-expect-error` on both). ✅
  - `createKeyring()` throws "not implemented" (runtime smoke test passes). ✅

### Task doc update needed?
- Yes — append to `## Implementation notes`: slice `keyring-interface-and-enum`
  created the public surface plus `internal.ts` (pre-authorized exec-helpers
  port for slice 3) and a `typecheck` npm script. Scratch tests in
  `packages/shared/scratch/` are committed; consider gitignoring them or
  keeping them as lightweight regression checks (see residual risks).

### User attention needed?
- No. The two deviations (`internal.ts`, `typecheck` script) are
  pre-authorized/justified, do not change the API surface, and do not affect
  dependent slices. The implementation matches the arch spec and slice doc.

### Residual risks
- **Scratch test files are committed** (`packages/shared/scratch/`). They're
  outside `src/` so `npm run typecheck` (tsconfig `include: ["src/**/*.ts"]`)
  does not cover them — they pass only when typechecked standalone
  (`npx tsc --noEmit scratch/keyring-types.ts`). Consider either gitignoring
  `scratch/` (throwaway verification, per `docs/testing.md`) or adding it to
  the tsconfig include so it's continuously typechecked. Low risk either way.
- **`internal.ts` `ExecResult`/`ToolMissingError`/`ExecError` are exported**
  from `internal.ts` but not re-exported by the barrel. Slice 3 imports them
  via `./internal.js` — verify slice 3 uses the `.js` extension consistently
  (the barrel uses `./keyring.js`; `internal.ts` is only imported internally).

### Files reviewed
- `packages/shared/src/keyring/keyring.ts` — public surface, matches spec ✅
- `packages/shared/src/keyring/index.ts` — barrel, no internal re-export ✅
- `packages/shared/src/keyring/internal.ts` — exec helpers port, correct ✅
- `packages/shared/package.json` — `./keyring` export + typecheck script ✅
- `packages/shared/scratch/keyring-types.ts` — discriminated-union checks ✅
- `packages/shared/scratch/runtime.mjs` — runtime smoke test ✅
