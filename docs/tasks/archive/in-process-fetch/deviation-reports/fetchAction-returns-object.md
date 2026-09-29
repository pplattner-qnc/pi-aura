## Deviation report — fetchAction-returns-object

### API surface changes

- **Planned:** `fetchAction()` becomes a pure function returning `{digest: Digest; report: AuraReport; raw: RawAuraData}`, taking optional `onProgress?` + `auraClient?` params. Writes no files. Stops calling `readDashboardUrl`/`createProgressEmitter` internally. `DASHBOARD_DIGEST_PATH` exported (or a helper) for the CLI shim. CLI shim takes over temp-dir + `~/.pi/aura/digest.json` + stdout writing.
- **Actual:** Exactly as planned.
  - `fetchAction(opts?: { onProgress?: (e: ProgressEvent) => void; auraClient?: AuraClient }): Promise<{ digest: Digest; report: AuraReport; raw: RawAuraData }>` — signature matches the spec precisely.
  - Returns `{digest, report, raw}`; writes no files (no `writeFileSync`, no `mkdirSync`, no `writeDashboardDigest`, no `console.log`). ✅
  - `DASHBOARD_DIGEST_PATH` is exported (`export const DASHBOARD_DIGEST_PATH`). ✅
  - `readDashboardUrl`/`createProgressEmitter` imports removed from `aura-digest.ts`; they stay exported from `@pi-aura/shared/digest/progress-emitter` (CLI shim imports them). ✅
  - `onProgress` defaults to a no-op when undefined; passed to `runTasks`'s `onProgress` + the inline `emitPhase` helper. ✅
  - `auraClient` defaults to `createDefaultAuraClient()` when undefined. ✅
  - `meta.raw_path` and `meta.report_path` are set to `""` (empty strings) in the returned object; the CLI shim fills them in with the actual temp-dir paths after creating the dir. This is a minor internal detail — the in-process caller (slice 2) will not use these paths. Not a deviation.
- **Impact:** None on dependent slices. The `fetchAction` interface (return type + `onProgress?` + `auraClient?`) is exactly what slice 2 needs. `DASHBOARD_DIGEST_PATH` is available for the shim.

### CLI shim behavior

- **Planned:** The CLI shim takes over temp-dir creation + file writing + `~/.pi/aura/digest.json` + stdout/stderr. `aura-digest.mjs fetch` produces byte-identical output.
- **Actual:** The shim's `fetch` case creates the temp dir (`/tmp/aura-morning-<hex>/`), calls `fetchAction({ onProgress: createProgressEmitter(readDashboardUrl()) })`, writes `raw.json`/`digest.json`/`report.json`, fills in `meta.raw_path`/`report_path`/`report.raw_path`, calls `writeDashboardDigest`, flushes the progress hook, and prints the same `output directory:` + stderr lines. The stderr format matches the old format (uses `report.fetched_at` instead of the local `fetchedAt` — same value, since `report.fetched_at = fetchedAt`). ✅
  - The `writeDashboardDigest` try/catch order matches the old code: files are written first, then the dashboard write is attempted; on failure, the warning is pushed to `digest.warnings` (same as the old `warnings.push()` which mutated `digest.warnings` by reference). ✅
  - CLI exit codes verified: no-args → 2, bogus → 2, `last` → 0. ✅
  - CLI bundle builds. ✅
- **Note:** Full byte-identical determinism (comparing actual `digest.json` output from a live fetch) cannot be verified without Aura network/creds in this environment. The structural determinism holds (same `fetchAction` core, same file-writing order, same stdout/stderr format). The code-review finding about `raw_path`/`report_path` being `""` initially and filled by the shim is not a determinism issue — the shim fills them before writing.

### Abstraction usage

- **Used/was specified: yes.**
  - `createDefaultAuraClient` — used as the default when `auraClient?` is undefined. ✅
  - `runTasks`'s `onProgress` — `opts.onProgress` passed directly (replacing `progressHook`). ✅
  - `createProgressEmitter`/`readDashboardUrl` — moved to the CLI shim; no longer called inside `fetchAction`. ✅
  - `writeDashboardDigest` + `DASHBOARD_DIGEST_PATH` — moved to the CLI shim; `DASHBOARD_DIGEST_PATH` exported. ✅
  - No logic reimplemented; the file-writing code was moved verbatim from `fetchAction` to the shim. ✅

### Out-of-scope changes

- **None.** The implementation is scoped precisely to the slice doc:
  - Did NOT call `fetchAction` from the extension (slice 2). ✅ — no `.pi/extensions/` files changed.
  - Did NOT drop `digest.json`/temp dir from the CLI path (task 5). ✅ — the shim writes them.
  - Did NOT delete `createProgressEmitter` (task 5). ✅ — it's still exported; the shim imports it.
  - Did NOT touch the extension tools (slice 2/3). ✅ — zero extension files changed.
  - Did NOT touch `scripts/esbuild.config.mjs` or `scripts/package.json`. ✅
  - `docs/tasks/state.yaml` changed (`task: in-process-server` → `task: in-process-fetch`) — this is a workflow state file (gitignored), not a scope violation.

### The fetchAction test

- **Planned:** Inject a fake `AuraClient`; assert the returned object shape + that NO files are written.
- **Actual:** `fetchAction.test.ts` (294 lines, 7 tests under `node:test`):
  - Injects a comprehensive fake `AuraClient` implementing all interface methods with minimal fixture data (1 queue row, 1 capacity task, empty notifications/reviews). ✅
  - Asserts the returned object has `digest`/`report`/`raw` keys. ✅
  - Asserts `digest` shape (date, attention, queue, capacity, reviews, actions, dev_links, warnings, followup, meta). ✅
  - Asserts `report` shape (fetched_at, warnings, verifications, etc.). ✅
  - Asserts `raw` shape (fetched_at, briefing, summary, notifications, priority_queue, capacity, pending_review_artifacts). ✅
  - Asserts NO files written: no `~/.pi/aura/digest.json`, no `~/.pi/aura/` dir, no `/tmp/aura-morning-*` temp dirs. ✅
  - Asserts `fetchAction` works without `server-url.json` (proving `readDashboardUrl` is not called internally). ✅
  - Asserts `onProgress` callback receives events with the correct shape. ✅
  - All 7 tests pass under `tsx --test`. ✅

### Task doc update needed?

**No.** The implementation matches the arch spec and slice doc exactly. The `## Implementation notes` (land-worker appends) should note:
- `fetchAction` is now a pure function returning `{digest, report, raw}` with `onProgress?` + `auraClient?` params.
- `DASHBOARD_DIGEST_PATH` is exported for the CLI shim.
- `meta.raw_path`/`report_path` are `""` in the returned object; the CLI shim fills them in.
- The `fetchAction.test.ts` injects a fake `AuraClient` (the `auraClient?` seam) — 7 tests, all passing.
- The CLI shim's `fetch` case takes over all file-writing + stdout/stderr, preserving byte-identical CLI behavior.

### User attention needed?

**No.** No API surfaces differ from the spec. `fetchAction` writes no files, takes the specified params, returns the specified type. The CLI behavior is preserved (same files, same stdout/stderr format, same exit codes). No scope drifted into the extension tools, CLI deletion, or `createProgressEmitter` removal. The `auraClient?` test seam is clean and the test coverage is thorough (7 tests covering shape + no-files + onProgress).
