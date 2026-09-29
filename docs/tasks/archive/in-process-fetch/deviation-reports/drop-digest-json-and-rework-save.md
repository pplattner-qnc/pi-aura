## Deviation report — drop-digest-json-and-rework-save

### API surface changes

- **Planned:** Extract a `saveLastDigest(digest)` helper in the shared core
  (alongside `fetchAction`), extracted from `saveAction`. `digest-save` calls
  it from `getCurrentDigest()`. No `dir` param. No spawn. Error when no
  current digest. `runAuraDigest`/`resolveAuraDigestScriptPath`/`spawn`/
  `SpawnResult` removed from `index.ts`. The CLI `saveAction` stays (task 5
  deletes it).
- **Actual:** Exactly as planned.
  - `saveLastDigest(digest, lastDigestPath?)` exported from
    `@pi-aura/shared/digest/aura-digest` — extracted from the old `saveAction`
    body (the `LastDigestStore` construction + `writeFileSync`). Takes an
    optional `lastDigestPath` (defaults to `~/.pi/aura/last-digest.json`). The
    CLI `saveAction` now calls `saveLastDigest(digest)` after reading
    `<dir>/digest.json` — so both the CLI and the in-process path share one
    implementation. ✅
  - `digest-save` `execute`: `getCurrentDigest()` → `saveLastDigest(digest)`.
    No `runAuraDigest`, no spawn. The `saveToolParameters` is now
    `Type.Object({})` (no `dir`). Returns a clear error "digest-save: no
    current digest to save — run digest-fetch first" when `getCurrentDigest()`
    is null. ✅
  - `runAuraDigest`, `resolveAuraDigestScriptPath`, `SpawnResult`, and the
    `spawn` import are **removed** from `index.ts`. Grep confirms zero
    references. ✅
  - The `vi.mock("node:child_process", ...)` spawn mock is **removed** from
    `fetch-save-tools.test.ts` (along with `nextSpawnOutcome`, the `EventEmitter`
    import, and the `writeFileSync` import that set up the old fixture). The
    "no spawn" test was simplified to assert in-process success without the
    hostile-spawn-outcome trick. ✅
  - The CLI `saveAction` + the shim (`scripts/src/aura-digest.ts`) are
    **untouched** — `saveAction` still reads `process.argv[3]`, reads
    `<dir>/digest.json`, and calls `saveLastDigest(digest)`. The CLI path
    stays functional. ✅
- **Impact:** None on dependent tasks. `saveLastDigest` is the shared seam
  both paths use. Task 4 can further polish `digest-save` (or use
  `saveLastDigest` directly); task 5 deletes `saveAction` + the CLI shim.

### Abstraction usage

- **Used/was specified: yes.**
  - `store.getCurrentDigest()` (task 2) — `digest-save` reads from it. ✅
  - `saveLastDigest` extracted to the shared core (arch spec: "export it from
    the shared core, exported alongside `fetchAction`"). ✅
  - The CLI `saveAction` delegates to `saveLastDigest` (single source of truth
    for the `LastDigestStore` shape + write path). ✅
  - `digest-log` is **unchanged** — still `getDashboardUrl()` + `joinUrl` +
    HTTP-POST `/api/state` (task 4 rewires it). ✅ Not prematurely rewired.
  - No `~/.pi/aura/digest.json` write from the in-process path. The
    `dashboardPath` in `defaultAuraPaths()` is a dead return value now (no
    in-process code reads it — `digest-fetch` populates the in-memory store;
    `digest-save` reads from `getCurrentDigest()`), but it's a harmless
    leftover, not a behavior change. ✅ (minor: see Out-of-scope)
  - No temp dir, no `raw.json`/`report.json` from the in-process path. ✅

### Out-of-scope changes

1. **`defaultAuraPaths().dashboardPath` is now dead** — the `dashboardPath`
   field (`path.join(auraDir, "digest.json")`) is returned by `defaultAuraPaths`
   but no in-process code reads it (the `statePath` is still used by
   `teardownDashboard`/`session_shutdown`). This is a harmless leftover from
   the file-based era; it's not a scope violation, but a future cleanup could
   drop the `dashboardPath` field. Not blocking.
2. **Skill doc (`aura-digest.md`) updated minimally** — 28 insertions / 35
   deletions. The changes update the pipeline diagram (`aura-digest.mjs fetch`
   → `fetchAction()`, `details.dir` → `in-memory`, `digest-save` → "saves the
   in-memory digest"), the Step 2 prose (no spawned child, no temp dir, no
   `details.dir`), and the `last-digest.json` description. This is in-scope per
   the arch spec ("update it minimally; a full skill-doc rewrite is task 5").
   **One stale reference remains:** line 74 still says `digest-fetch`
   internally invokes `aura-digest.mjs fetch` (it now calls `fetchAction()`
   in-process) — but the surrounding prose (lines 74–82) is about the MCP
   config + native binding resolution, which is a CLI-era detail that's
   genuinely task-5 scope (the whole CLI bundle is deleted there). Not a
   deviation; it's the "minimal update, not a full rewrite" the spec called
   for. The `aura-digest.mjs` references in the frontmatter description +
   Prerequisites section are similarly CLI-era context (task 5 rewrites those).
3. **No out-of-scope rewrites.** `digest-log` not touched. The CLI
   shim/bundle/`saveAction` not deleted. The digest data model and Svelte view
   not changed. ✅

### No `~/.pi/aura/digest.json` / no temp dir (confirm)

- Grep `index.ts` for `digest.json`/`DASHBOARD_DIGEST_PATH`/
  `writeDashboardDigest`: the only hits are the `defaultAuraPaths()`
  `dashboardPath` field (dead return value) + the `digest-save` tool's
  description text + result message — no file writes. ✅
- The CLI shim (`scripts/src/aura-digest.ts`) still imports
  `writeDashboardDigest` + `DASHBOARD_DIGEST_PATH` and writes the dashboard
  file for the CLI path — that's correct (task 5 deletes it). ✅
- No temp dir creation in the in-process path. ✅

### CLI `saveAction` still works (task 5 deletes it)

- `saveAction` is still exported from `@pi-aura/shared/digest/aura-digest`; it
  reads `process.argv[3]`, reads `<dir>/digest.json`, calls `saveLastDigest`.
  The CLI shim still imports + dispatches it. The esbuild build produces
  `aura-digest.mjs` + `aura.mjs`. CLI exit codes: no-args → 2, bogus → 2. ✅

### Verification results

| Check | Result |
|-------|--------|
| `packages/shared` `tsc --noEmit` | ✅ clean (exit 0) |
| `scripts` `tsc --noEmit` | ✅ clean (exit 0) |
| Extension `tsc --noEmit` | ✅ clean (exit 0) |
| `packages/shared` `tsx --test` | ✅ 195 pass / 0 fail |
| `npx vitest run` (root) | ✅ 19 files / 207 tests pass / 0 fail |
| esbuild build | ✅ both bundles built |
| CLI exit codes | ✅ no-args=2, bogus=2 |
| Grep: no `spawn`/`runAuraDigest`/`resolveAuraDigestScriptPath`/`SpawnResult` in `index.ts` | ✅ clean |
| Grep: no spawn mock in `fetch-save-tools.test.ts` | ✅ clean |
| `digest-log` unchanged (HTTP-POST `/api/state`) | ✅ |
| CLI `saveAction` present + functional | ✅ |
| No in-process `~/.pi/aura/digest.json` write | ✅ |

### Task doc update needed?

**No.** The implementation matches the arch spec + slice doc. The land-worker
should note in `## Implementation notes`:
- `saveLastDigest(digest, lastDigestPath?)` extracted to the shared core;
  both the CLI `saveAction` and the in-process `digest-save` use it.
- `digest-save` is now in-process (no spawn, no `dir`); reads
  `getCurrentDigest()`.
- `runAuraDigest`/`resolveAuraDigestScriptPath`/`spawn`/`SpawnResult` removed
  from `index.ts`; the spawn mock removed from tests.
- `defaultAuraPaths().dashboardPath` is now a dead return value (harmless
  leftover; a future cleanup can drop it).
- The skill doc was minimally updated (CLI-era `aura-digest.mjs` references in
  the description/prerequisites remain — task 5 rewrites those).

### User attention needed?

**No.** No API surfaces differ from the spec. `digest-save` no longer spawns.
Scope did not drift. The CLI `saveAction` is intact. The one stale skill-doc
reference (line 74, `aura-digest.mjs fetch`) is the "minimal update, not a full
rewrite" the spec authorized; task 5 owns the full rewrite. The dead
`dashboardPath` in `defaultAuraPaths` is a harmless leftover, not a behavior
change.
