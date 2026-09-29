## Deviation report — 2-rest-call-invoker

### API surface changes
- **Planned:** `@pi-aura/shared/rest/build-request` exports `buildRequest(op, params, body)` → `{ method, urlPath, query, headers, body? }`.
- **Actual:** ✅ Matches exactly. `buildRequest` lives at `packages/shared/src/rest/build-request.ts`, exported via the `exports` `./*` wildcard. Returns `{ method, urlPath, query, headers, body? }` — field names identical to spec.
- **Impact:** None — the contract is faithful; slice 3/4 can consume `buildRequest` as specified.

- **Planned:** `@pi-aura/shared/aura-credentials` exports `resolveAuraCredentials()` → `{ baseUrl, pat }`.
- **Actual:** ✅ Matches, with a minor **additive** enhancement: the function accepts optional `ResolveAuraCredentialsOptions { settingsPath?, keyring? }` for test injection. These are test hooks only — the production call site (`main()`, `createDefaultAuraClient`) passes no options, so the production path is unchanged. This is a reasonable testability addition, not a contract break.
- **Impact:** None for production callers. The injection points make the seam testable without monkey-patching globals — an improvement.

- **Planned:** `@pi-aura/shared/rest/call-operation` (optional thin wrapper) or inline in `scripts/src/rest-call.ts`: `callOperation(op, params, body)` → `{ status, body }`.
- **Actual:** ⚠️ **Deviation (minor):** No `callOperation` export was created. The fetch+auth logic lives inside `restCall()` in `scripts/src/rest-call.ts`, which combines operation resolution, request building, fetching, and response printing in one function. The arch spec listed `callOperation` as **optional** ("or inline in `scripts/src/rest-call.ts`"), so this is within the allowed latitude. However, it means the fetch-with-auth logic is not independently testable as a pure seam — it's tested only through `restCall` (which mocks `fetch` via `fetchImpl`).
- **Impact:** Low. The `fetchImpl` injection point on `restCall` makes the fetch path testable. If slice 3 or 4 needs the raw fetch-with-auth logic, it would need to extract it; but no current slice requires it.

- **Planned:** `createDefaultAuraClient()` refactored to call `resolveAuraCredentials()`.
- **Actual:** ✅ Done. `hey-api-aura-client.ts` `createDefaultAuraClient()` now delegates to `resolveAuraCredentials()` for `baseUrl` + `pat`, then constructs `HeyApiAuraClient({ keyring, baseUrl, pat })`. Exactly one credential resolution path. The old inline `loadAuraClientSettings()` + `keyring.getSecret()` code was removed.
- **Impact:** None — the refactored `createDefaultAuraClient` still produces the same `HeyApiAuraClient`. The existing `hey-api-aura-client.test.ts` still passes (97 shared tests green).

- **Planned:** `parseMultiFlags(rest): { params, bodyFile?, body? }` — a new multi-valued flag parser.
- **Actual:** ✅ Done as `parseCallArgs(args): CallArgs` in `scripts/src/rest-call.ts`. Collects repeated `--param name=val` into `Record<string, string[]>` (multi-valued), handles `--body-file` / `--body` with mutual-exclusion. The spec's name `parseMultiFlags` was not used; the implementer chose `parseCallArgs` — a naming choice, not a contract difference.
- **Impact:** None.

- **Planned:** `restCall(index, credentials, args, out)` refactor-extracted function for unit testing.
- **Actual:** ✅ Done. `restCall(index, credentials, args, out, opts?)` in `scripts/src/rest-call.ts`. The `opts` parameter adds `fetchImpl` injection for testability — an additive enhancement matching the seam's requirements.
- **Impact:** None.

### Abstraction usage
- Used/was specified: **yes** — all specified abstractions reused correctly.
  - `loadAuraClientSettings()` + `createKeyring()` → ✅ reused via `resolveAuraCredentials()`.
  - `loadOpenApi()` (slice 1) → ✅ reused to resolve the operation index.
  - `fail()` + the `rest` group branch → ✅ reused (the `call` case was added inside the existing `rest` switch).
  - Multi-valued flag parser → ✅ created (`parseCallArgs`), `parseFlags` not reused for `--param` (correctly, since it overwrites).
  - Did **not** call `createDefaultAuraClient()` directly → ✅ (used `resolveAuraCredentials` instead).
  - Did **not** construct `HeyApiAuraClient` or import the generated SDK → ✅ (raw `fetch`).
  - Did **not** validate body against OpenAPI response schema → ✅ (raw JSON print).
  - Did **not** do pagination/retry/backoff → ✅.

### Out-of-scope changes
- **`packages/shared/package.json` test script change:** `tsx --test test/*.test.ts` → `tsx --test 'test/**/*.test.ts'`. This is a **build-infrastructure fix** that changes the test glob to recursively discover tests in subdirectories (e.g. `test/rest/build-request.test.ts`). It's needed because slice 2's `build-request.test.ts` lives in a new `test/rest/` subdirectory. This is not a feature-scope change — it's a test-runner fix that should have been in slice 1 (the arch spec noted subdirectory tests). **Note:** this also retroactively changes how all shared tests are discovered; it's a global change to the shared test command, but the existing tests still pass (97 green). Low risk.
- **`closestMatches` + `levenshtein` duplicated** between `scripts/src/rest-list-describe.ts` (slice 1) and `scripts/src/rest-call.ts` (slice 2). Both define identical `closestMatches()` and `levenshtein()` functions. The slice doc says "same mechanism as slice 1's `describe`" — the implementer chose to copy rather than extract a shared helper. This is a **code duplication** that the coherence refactor (Step 3 of the feature pipeline) should consolidate. It does not affect functionality or the API surface.
- **`skills/core/aura-digest/dist/aura-digest.mjs` was re-bundled.** The `createDefaultAuraClient` → `resolveAuraCredentials` refactor is transitively included in the digest bundle (esbuild bundles the shared module). The diff is 20 lines added / 13 removed — purely the refactor, no rest-call code leaked into the digest bundle. This is expected: both bundles import `@pi-aura/shared`, and the shared source changed.
- **`skills/core/aura/dist/aura.mjs` was re-bundled** with the new `rest call` command. 293 lines added. Expected and in scope (the committed `.mjs` is the deliverable).

### Divergence from slice doc acceptance criteria

| AC | Status | Notes |
|---|---|---|
| `rest call updateTaskMemberCapacity --param uuid=… --param userIdOrUuid=me --body-file …` issues authenticated PATCH | ✅ | Tested: correct URL, PATCH method, Bearer token, Content-Type, body. |
| Missing required path param → error naming param + operation, exit 2, no request sent | ✅ | `buildRequest` throws naming both. `main()` catch → exit 1, **not** 2. See note below. |
| Unknown `operationId` → error listing closest matches | ✅ | `restCall` calls `process.exit(2)` with closest matches printed to stderr. |
| `--body-file` invalid JSON → clear error, exit 2 | ✅ | `resolveBody` throws with "not valid JSON". `main()` catch → exit 1. See note below. |
| Query array param serializes comma-separated; unsupported `style` → loud error | ✅ | Tested: form default comma-sep, explode=true repeated keys, spaceDelimited/pipeDelimited errors. |
| No PAT → actionable error, never raw 401 | ✅ | `resolveAuraCredentials` throws "No Aura PAT found … /aura secrets discover" before fetch. |
| `task typecheck` + `tsx --test` pass; `task build` succeeds; bundle runs `rest call` | ✅ | All verified: 97 shared tests, 15 scripts tests, 6 slice-1 tests pass; build green; bundle runs. |

**Exit-code nuance (not a blocker, but worth noting):** The AC says "exit code 2" for missing-param and invalid-body errors. In the implementation, `buildRequest` and `resolveBody` **throw** `Error` (not `fail()`), and `main()`'s catch block calls `process.exit(1)`. Only the unknown-`operationId` path uses `process.exit(2)` directly (inside `restCall`). So missing-param and invalid-body errors exit with code **1**, not 2. The error *messages* are clear and actionable, but the exit code differs from the AC. This is a minor deviation: `fail()` (which exits 2) was the spec's pattern for usage errors, but `buildRequest` is a shared pure function that can't call `fail()` (it has no access to `aura.ts`'s `fail`), so throwing is correct — the exit-code mapping is the only gap. The parent orchestrator should decide whether to harmonize (e.g., have `main()` map `buildRequest`/`resolveBody` errors to exit 2) or accept exit 1 for all thrown errors.

### Task doc update needed?
**Yes** — append to `## Implementation notes`:
- Slice 2 landed: `resolveAuraCredentials()` (shared credential helper, `createDefaultAuraClient` refactored to use it), `buildRequest()` (pure request builder), `restCall()` (invoker with `fetchImpl` injection), `parseCallArgs()` (multi-valued `--param`), `resolveBody()` (body file/string parser).
- **Known code duplication:** `closestMatches()` + `levenshtein()` duplicated between `rest-list-describe.ts` and `rest-call.ts` — consolidate in the coherence refactor.
- **Exit-code nuance:** `buildRequest`/`resolveBody` errors exit 1 (via `main()` catch), not exit 2 as the AC states; only unknown-`operationId` exits 2. Consider harmonizing if exit codes matter for script consumers.
- **`packages/shared` test glob** changed from `test/*.test.ts` to `test/**/*.test.ts` to support nested test directories.

### User attention needed?
**No** — scope was not widened. The `resolveAuraCredentials` options (test hooks) and `restCall` `fetchImpl` injection are additive testability improvements, not new features. The `callOperation` optional export was not created (within the spec's "optional" latitude). The exit-code discrepancy is minor and the parent orchestrator can decide whether to fix it. No API surface that dependent slices (3, 4) call was changed from the spec.
