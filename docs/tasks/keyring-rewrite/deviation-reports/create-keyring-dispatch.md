# Deviation report — create-keyring-dispatch

## Summary

The implementation matches the arch spec and slice doc **exactly**. Zero
deviations. The `createKeyring()` body is a single-file change to
`packages/shared/src/keyring/keyring.ts` (+40/-2 lines) that replaces the
`throw "not implemented"` stub with an inline `switch (process.platform)`
dispatch, dynamic `import()` of the Linux impl, `await` on all three
`isAvailable()` calls, and `FileKeyring` as fallback. No out-of-scope
files touched. No smoke test committed. No staged files. No user attention
needed.

## API surface changes

- **Planned:** `createKeyring()` implemented in `keyring.ts` as an inline
  `switch (process.platform)` with `case "darwin"` → `MacosKeyring` (fallback
  `FileKeyring`), `case "linux"` → dynamic `import("./secret-service-keyring.js")`
  → `SecretServiceKeyring` (fallback `FileKeyring`), `default` → `FileKeyring`.
  Throws `KeyringUnavailableError` with `tried` listing candidates if none
  available. No `dbus-next` static import.
- **Actual:** Matches exactly. The diff is 1 file (`keyring.ts`), +40/-2 lines:
  - Added `import { FileKeyring } from "./file-keyring.js"` (static).
  - Added `import { MacosKeyring } from "./macos-keyring.js"` (static).
  - Replaced the `throw new Error("not implemented")` body with the switch.
  - The dynamic `import("./secret-service-keyring.js")` is inside the
    `case "linux"` block only (line 72).
  - All three branches `await` the `isAvailable()` call before returning.
  - Each branch throws `KeyringUnavailableError` with a `tried` array naming
    the candidates that were probed (e.g. `["SecretServiceKeyring", "FileKeyring"]`).
- **Impact:** None on dependent slices. `createKeyring()` is the public entry
  point that downstream tasks (`aura-client`) will call; its signature
  (`(): Promise<Keyring>`) is unchanged from the stub.

## Abstraction usage

- Used/was specified: **yes**, all per the arch spec's "Existing abstractions to
  use" for slice 5:
  - `FileKeyring` and `MacosKeyring` are **static** imports at the top of
    `keyring.ts` (lines 3-4). Correct — the spec says "import `FileKeyring`,
    `MacosKeyring`" statically.
  - `SecretServiceKeyring` is **dynamic** `import()` only inside the
    `case "linux"` block (line 72). Correct — the spec says "dynamic-import
    `SecretServiceKeyring`" and "No `dbus-next` static import here (only the
    dynamic one inside `case "linux":`)."
  - `await` is used on **all** `isAvailable()` calls (`MacosKeyring`,
    `SecretServiceKeyring`, `FileKeyring` — three occurrences across the
    branches). Correct — this handles the mixed sync/async signatures:
    `FileKeyring.isAvailable()` returns `boolean` (sync), `MacosKeyring.isAvailable()`
    returns `boolean` (sync), `SecretServiceKeyring.isAvailable()` returns
    `Promise<boolean>` (async). `await` on a sync `boolean` is a no-op, so it
    is the safe universal approach. The arch spec's pseudocode already showed
    `await ... isAvailable()`.
  - The three impl classes are instantiated with `new` (no constructor args on
    the public `Keyring` interface). `FileKeyring` has an optional temp-path
    test hook (constructor arg), but `createKeyring()` passes no args — correct.
- **Do NOT reimplement:** confirmed — the impls are imported, not
  reimplemented. No `dbus-next` static import in `keyring.ts`.

## Out-of-scope changes

- **None.** The only file changed is `packages/shared/src/keyring/keyring.ts`.
  No other source files, package.json, tsconfig, or config were modified in
  this slice. The smoke test was written as a throwaway scratch entry and
  removed before the final commit (the tdd output confirms this; `git ls-files`
  confirms no smoke test is committed). No test artifacts added (per
  `docs/testing.md`, the repo has no test suite).

## Divergence from the slice doc's acceptance criteria

- **`createKeyring()` body: `switch (process.platform)`:** ✅ met — the body
  is `switch (process.platform)` with `case "darwin"`, `case "linux"`,
  `default`.
- **`case "darwin"`: try `MacosKeyring` (static `isAvailable()`); if false,
  fall through to `FileKeyring`:** ✅ met — `if (await MacosKeyring.isAvailable())`
  returns `new MacosKeyring()`; else falls through to `await FileKeyring.isAvailable()`
  → `new FileKeyring()`.
- **`case "linux"`: dynamic `import()` → try `SecretServiceKeyring`; if false,
  fall through to `FileKeyring`:** ✅ met — `const { SecretServiceKeyring } =
  await import("./secret-service-keyring.js")`; `if (await SecretServiceKeyring.isAvailable())`
  returns `new SecretServiceKeyring()`; else falls through to `FileKeyring`.
- **`default`: `FileKeyring`:** ✅ met.
- **Throws `KeyringUnavailableError` with `tried` listing candidates:** ✅ met
  — each branch throws with an array naming the candidates probed
  (`["MacosKeyring", "FileKeyring"]`, `["SecretServiceKeyring", "FileKeyring"]`,
  `["FileKeyring"]`). In practice unreachable since `FileKeyring.isAvailable()`
  always returns `true`, but the throw is present for completeness.
- **The dynamic `import()` is the only place `dbus-next`'s module graph is
  reachable; macOS/file paths never load it:** ✅ met — `grep` confirms the
  only reference to `secret-service-keyring` in `keyring.ts` is the dynamic
  `import()` path string on line 72/73, inside `case "linux"`. No static import.
- **Bundled smoke test: `createKeyring()` on Linux returns `SecretServiceKeyring`
  and CRUD round-trips:** ✅ met (per tdd output) — the smoke test confirmed
  `backend: SecretServiceKeyring` + `ok` on Linux; the fallback path with
  `DBUS_SESSION_BUS_ADDRESS=` returned `backend: FileKeyring` + `ok`.

## Mixed sync/async `isAvailable()` handling

- **Correct.** All three `isAvailable()` calls are `await`ed:
  - `await MacosKeyring.isAvailable()` — `MacosKeyring.isAvailable(): boolean`
    (sync); `await boolean` is a no-op.
  - `await SecretServiceKeyring.isAvailable()` — `SecretServiceKeyring.isAvailable():
    Promise<boolean>` (async, from slice 4); `await` is required here.
  - `await FileKeyring.isAvailable()` — `FileKeyring.isAvailable(): boolean`
    (sync); `await boolean` is a no-op.
- Using `await` universally is the correct approach for mixed sync/async
  signatures: it satisfies the async case without affecting the sync cases.
  The arch spec's pseudocode for slice 5 already used `await` on the
  `isAvailable()` calls. No divergence.

## Task doc update needed?

- **Yes — append to `## Implementation notes`:** slice `create-keyring-dispatch`
  implemented `createKeyring()` as an inline `switch (process.platform)` with
  `await` on all `isAvailable()` calls (handling the mixed sync/async
  signatures from slices 2-4), dynamic `import()` of the Linux impl inside
  `case "linux"` only, and `FileKeyring` fallback in every branch. No
  deviation from the spec. `createKeyring()` is now the public entry point for
  downstream tasks. Note: the smoke test confirmed both the normal Linux path
  (`SecretServiceKeyring`) and the no-D-Bus fallback path (`FileKeyring`)
  round-trip CRUD successfully.

## User attention needed?

- **No.** The implementation matches the arch spec and slice doc exactly.
  No API surface changes, no out-of-scope additions, no divergence from any
  acceptance criterion. The mixed sync/async `isAvailable()` handling is
  correct. No scope change or decision is needed from the user.
