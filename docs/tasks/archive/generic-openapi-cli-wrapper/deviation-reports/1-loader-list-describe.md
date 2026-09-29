## Deviation report — 1-loader-list-describe

### API surface changes
- **Planned:** `@pi-aura/shared/openapi/loader` exports `loadOpenApi(path): OpenApiIndex`, with `BodyShape.contentType` typed as the literal `"application/json"`, `Param` with `{ name, required, schema, style?, explode?, description? }`, `OpMeta` with `{ operationId, method, path, pathParams, queryParams, body?, tags, summary?, description?, responses }`.
- **Actual:** All types exported as specified. One minor type widening: `BodyShape.contentType` is typed as `string` (not the literal `"application/json"`). The loader also adds extra passthrough fields to `ParamSchema` (`enum`, `default`, `minimum`, `maximum`, `nullable`) beyond the spec's `{ type?, format?, items? }`. These are additive and don't break the contract — slices 2/3/4 can still read the specified fields.
- **Impact:** None for dependent slices. The wider `ParamSchema` is strictly additive. The `contentType: string` vs `"application/json"` is a minor spec deviation — slice 2's `buildRequest` should not assume the literal type, but in practice the loader only ever sets `"application/json"` (or the first available content type), so runtime behavior is unaffected.

### Abstraction usage
- Used/was specified: **yes**
  - `fail()` / USAGE pattern: reused — `rest list`/`describe` dispatch added to `main()` with `fail()` for errors and USAGE block updated.
  - `js-yaml`: added to `packages/shared` deps (+ `@types/js-yaml` to devDeps) as specified.
  - `@pi-aura/shared` `./*` wildcard export: used correctly — no `exports` map edit needed for `@pi-aura/shared/openapi/loader`.
  - `skills/core/aura/resources/`: `rest-api.md` placed there as specified.
  - Taskfile `build`: `gen-rest-doc` step wired before the esbuild bundle as specified.
  - Refactor-extracted pure functions (`restList(index, out)`, `restDescribe(index, opId, out)`, `generateRestDocMd(index)`): all implemented as specified, unit-testable without spawning the process.

### Out-of-scope changes
- **Taskfile `typecheck` target widened:** The spec said "typecheck passes for both `scripts` and `packages/shared`" as an acceptance criterion, but the Taskfile `typecheck` target previously only ran `scripts` typecheck. The implementation added `cd {{.SHARED_DIR}} && npm run typecheck` to the `typecheck` task. This is a reasonable build-infra improvement to match the AC, but it's technically beyond the slice's stated deliverables (the slice doc says "add `gen-rest-doc` build step", not "add shared typecheck to Taskfile"). It does not break existing flows — the shared typecheck now runs as part of `task typecheck` and `task build`.
- **Taskfile `$$f` → `$f` change in build verification loop:** The existing build target used `$$f` (Taskfile v3 escaping for shell variables). The diff changed it to `$f`. The build still passes (verified — `task build` completes successfully), so this was either a fix or an artifact of editing the target. Not harmful but an unsolicited change to existing build logic.
- **esbuild artifact in `dist/aura.mjs`:** The re-bundled `aura.mjs` shows esbuild variable renaming (`type` → `type2` in the keyring section, `readFileSync` → `readFileSync3`, etc.) — these are automatic esbuild minification/scope-conflict renames from re-bundling, not manual edits. Expected when adding new imports to the bundle.
- **No out-of-scope code changes** to `aura-client.ts`, `keyring`, `aura-digest.ts`, or any other existing module.

### Divergence from slice doc acceptance criteria
- **`rest list` prints all ~273 operations grouped by tag** — ✅ verified: 273 operations across 29 groups (includes spec-provided duplicate-case tags like `knowledge`/`Knowledge`).
- **`rest describe updateTaskMemberCapacity`** — ✅ verified: prints PATCH, path `/tasks/{uuid}/members/{userIdOrUuid}/capacity`, path params `uuid` (string/uuid) and `userIdOrUuid` (string), body `TaskMemberCapacityUpdate`, response codes 200/400/401/403/404/500.
- **Unknown `operationId`** — ✅ verified: clear error + closest matches + exit code 2.
- **`rest-api.md` committed, contains capacity op under Capacity group** — ✅ verified: 8358 lines, `updateTaskMemberCapacity` at line 1153 under `## Capacity`, params present.
- **Byte-identical when regenerated twice** — ✅ verified: `diff` shows no change after two `gen-rest-doc` runs.
- **`task build` regenerates `rest-api.md`** — ✅ verified: `gen-rest-doc` runs before the esbuild bundle.
- **`task typecheck` passes for both packages** — ✅ verified: both `scripts` and `packages/shared` tsc pass clean.
- **Loader test suite passes under `tsx --test`** — ✅ verified: 14 tests, all pass.
- **`rest list`/`describe` test suite passes** — ✅ verified: 6 tests, all pass (via `node --experimental-strip-types`).
- **`gen-rest-doc` test suite passes** — ✅ verified: 6 tests, all pass.

### Minor deviations (not blocking)
1. **`BodyShape.contentType` typed as `string` instead of literal `"application/json"`** — the spec says `contentType: "application/json"`; the implementation uses `string`. The loader correctly resolves `"application/json"` at runtime, so this is a type-level relaxation only.
2. **`ParamSchema` is wider than specified** — includes `enum`, `default`, `minimum`, `maximum`, `nullable`, and an index signature `[k: string]: unknown`. This is additive; downstream slices get everything they need plus extra. Not a contract break.
3. **`findParamIn` helper** — the loader doesn't keep the `in` field on the returned `Param` type (it's not in the spec's `Param` interface). Instead, `parseOperation` calls a separate `findParamIn()` to re-resolve each param's `in` location by matching against the raw parameters. This is a slightly convoluted approach (re-scanning raw params for each parsed param = O(n²)) but functionally correct. A cleaner approach would have been to carry `in` through `parseParam`, but the spec's `Param` type explicitly omits `in`, so this follows the spec.
4. **`null as never` for client** — `main()` uses `const client = needsClient ? await createDefaultAuraClient() : null as never;` to avoid the eager client construction for the `rest` group. This satisfies the spec's "do not force PAT resolution for `list`/`describe`" requirement. The `null as never` is a type-level trick that lets `client` be used in other branches without TS errors. It's slightly unusual but not harmful.

### Task doc update needed?
**No.** The implementation faithfully follows the slice doc and arch spec. The minor type widening (`contentType: string`) and extra `ParamSchema` fields are additive and don't require updating the task's Implementation notes. The Taskfile `typecheck` widening is a reasonable infra improvement that makes the AC ("typecheck passes for both packages") enforceable.

### User attention needed?
**No.** The API surface matches the spec; the deviations are minor type-level widenings and build-infra improvements that don't change behavior or break downstream contracts. No scope was added or removed from the slice.
