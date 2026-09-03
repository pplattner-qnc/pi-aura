# Architecture spec — `cli-deletion-and-rewire`

> Task 5 of 5 (final) in `in-process-aura-digest`. Delete the `aura-digest` CLI
> bundle + shim + esbuild entry + the shared-core exports only the CLI used,
> and rewrite the `aura-digest` skill doc off the CLI. After this, the map's
> Destination is complete: everything runs in-process via tools; no CLI.

## Current state (after tasks 1–4)

All agent-side tools are in-process + in-memory (tasks 2–4). The **only**
remaining CLI surface is scaffolding tasks 1–4 left in place so the CLI path
stayed green:

- `scripts/src/aura-digest.ts` — the thin CLI shim: `main()` dispatches
  `fetch`/`render`/`save`/`diff`/`cleanup`/`last` on `process.argv`; the `fetch`
  case writes the temp-dir files + `~/.pi/aura/digest.json` (logic it took over
  from `fetchAction` in task 3). Catches `FailError` → `process.exit`.
- `skills/core/aura-digest/dist/aura-digest.mjs` — the committed esbuild bundle
  of the shim.
- `scripts/esbuild.config.mjs` — builds **two** entries: `aura-digest.mjs`
  (delete) AND `aura.mjs` (the `aura` skill's bundle — **keep**). Remove only
  the `aura-digest` entry.
- Shared-core exports used **only** by the shim (grep-confirmed):
  `createProgressEmitter`, `readDashboardUrl`, `defaultServerUrlPath`,
  `joinUrl` (`progress-emitter.ts` — the whole module is CLI-era; the
  in-process `digest-fetch` uses `store.pushEvent` directly, and the extension
  dropped `readDashboardUrl`/`joinUrl` in tasks 2/4); `writeDashboardDigest`
  (`write-dashboard-digest.ts` — writes `~/.pi/aura/digest.json`, which the
  in-process path doesn't do); the action exports `renderAction`/`saveAction`/
  `diffAction`/`cleanupAction`/`lastAction` (only the shim calls them;
  `fetchAction` stays — `digest-fetch` uses it); `USAGE`, `FailError`,
  `DASHBOARD_DIGEST_PATH` (shim-only).
- `scripts/profile-fetch.mjs` — runs the committed `aura-digest.mjs` for
  profiling → dies with the bundle (remove or flag).
- The `aura-digest` skill doc still describes the bundle (lines 3, 15, 63,
  76, 84, 350) and the CLI flow → rewrite off the CLI.
- Tests: `skill-md-prose.test.ts` asserts "no bash shell-outs to
  `aura-digest.mjs`" (a guard — stays, but the skill-doc references it
  asserts-against change); `packages/shared/test/digest/aura-digest-progress.test.ts`
  + `write-dashboard-digest.test.ts` test the now-dead modules.

**Note:** the `c80ef96d`/`e56e96ec` lifecycle fixes (orphan/stale-`server-url.json`
handling) the map mentioned are **already structurally gone** — task 2 removed
the whole spawned-child + `server-url.json` + pid machinery. No separate
sweep needed for them.

## Slice split (3 slices, sequential)

### Slice 1 — `delete-cli-shim-and-bundle` (size m)
**Delete the CLI shim, the bundle, and the esbuild entry (keep `aura.mjs`).**

- Delete `scripts/src/aura-digest.ts` (git rm).
- Delete `skills/core/aura-digest/dist/aura-digest.mjs` (git rm — committed).
- `scripts/esbuild.config.mjs`: remove the `aura-digest` entry (entryPoints
  `src/aura-digest.ts` → `skills/core/aura-digest/dist/aura-digest.mjs`).
  **Keep the `aura` entry** (`src/aura.ts` → `skills/core/aura/dist/aura.mjs`).
  The config still builds `aura.mjs`.
- `scripts/package.json`: update `description` (currently "Deterministic Aura
  digest fetch + render script" — stale; the `aura` skill's bundle is the main
  thing now). `build` script stays (`node esbuild.config.mjs` still builds
  `aura.mjs`). Remove the `@modelcontextprotocol/sdk` dep if only the digest
  shim used it (check — `aura.ts`/`rest-*` may still use it; keep if used).
- `scripts/src/keyring.ts` (orphaned since core-move, 601 lines, zero
  importers) — **delete it** (this task is the cleanup task; the orphan is
  CLI-era dead code). Confirm zero importers first (grep).
- `scripts/profile-fetch.mjs`: it runs the deleted bundle → delete it (or, if
  it has reusable profiling logic, strip the bundle dependency — but simplest
  is delete; it's a one-off profiler for the now-gone CLI fetch). Check whether
  anything references it (Taskfile? docs?) before deleting.
- Confirm `scripts` typecheck + the `aura.mjs` build still pass after the
  shim's removal.

### Slice 2 — `drop-dead-shared-exports` (size m)
**Remove the shared-core exports only the CLI shim used.**

- `packages/shared/src/digest/progress-emitter.ts`: the whole module
  (`createProgressEmitter`/`readDashboardUrl`/`defaultServerUrlPath`/`joinUrl` +
  the `ProgressEventLike`/`ProgressEmitterOptions`/`ProgressEmitter` types) is
  used **only** by the deleted shim. **Delete the file** + its export subpath
  in `packages/shared/package.json`. (The in-process `digest-fetch` uses
  `store.pushEvent`; the extension dropped these in tasks 2/4. Confirm zero
  importers with grep before deleting — the core's `aura-digest.ts` no longer
  imports it (task 3 slice 1 removed that).)
- `packages/shared/test/digest/aura-digest-progress.test.ts`: tests the deleted
  `createProgressEmitter` — delete it.
- `packages/shared/src/digest/write-dashboard-digest.ts` +
  `packages/shared/test/digest/write-dashboard-digest.test.ts`: writes
  `~/.pi/aura/digest.json` (the in-process path doesn't) — only the deleted
  shim imported `writeDashboardDigest`. **Delete both** + the export subpath.
- `packages/shared/src/digest/aura-digest.ts`: remove the now-dead exports
  `renderAction`/`saveAction`/`diffAction`/`cleanupAction`/`lastAction`/`USAGE`/
  `FailError`/`DASHBOARD_DIGEST_PATH` (only the deleted shim used them).
  **Keep** `fetchAction` (the in-process `digest-fetch` uses it) and
  `saveLastDigest` (the in-process `digest-save` uses it). The `fail()` helper
  (throws `FailError`) becomes dead with `FailError` — delete it (or keep if
  something still throws; grep). `DASHBOARD_DIGEST_PATH` is dead (in-process
  doesn't write `digest.json`) — delete.
- Update `packages/shared/package.json` `exports` to drop the removed subpaths
  (`./digest/progress-emitter`, `./digest/write-dashboard-digest`).
- Confirm shared typecheck + `tsx --test` pass (the deleted tests' count drops).

### Slice 3 — `rewrite-skill-doc-and-tests` (size m)
**Rewrite the `aura-digest` skill doc off the CLI; fix tests; friction log.**

- `skills/core/aura-digest/aura-digest.md`: rewrite the CLI-era references
  (lines 3 description, 15, 63, 76, 84, 350 + any others) to describe the
  in-process tools flow (no `aura-digest.mjs`, no `dist/`, no `task build` for
  the digest bundle, no "bundled by esbuild"). The skill already drives the
  flow through tools (the tools are the source of truth); just remove the
  CLI-era framing/provenance. Keep the routing table, the step choreography,
  the digest contract. (This is the "full skill-doc rewrite" tasks 2–4
  deferred here.)
- `test/digest-dashboard/skill-md-prose.test.ts`: it asserts "no bash
  shell-outs to `aura-digest.mjs`" — keep that guard (still valid), but update
  any assertion that checks the skill doc *describes* the bundle (it
  shouldn't anymore). Re-run; fix failures.
- Audit other docs/skills that reference `aura-digest.mjs` (grep the whole
  repo) — rewire to the tools. Check `README.md`, `docs/testing.md`,
  `Taskfile.yml`, other skill docs.
- `docs/testing.md`: update the `scripts/` build section (the `aura-digest`
  bundle is gone; the `aura` bundle stays) + the codegen/tsConfigPath note
  (unchanged) + any `aura-digest.mjs` reference.
- **Friction log:** record anything that wanted wider skill-choreography
  redesign (the task doc calls for this) as a `submit_feedback` or a note in
  the task doc's Implementation notes — turn into a separate map/task if
  warranted, never absorbed here.
- Final gate: full vitest + shared `tsx --test` + all typechecks + the
  `aura.mjs` build green; no `aura-digest.mjs`/`dist/aura-digest` anywhere;
  the skill doc references only the tools.

## Existing abstractions to use

- The in-process tools (tasks 2–4) — the skill doc points at them.
- `fetchAction` + `saveLastDigest` (kept shared-core exports).
- `submit_feedback` for the friction log.

## Do NOT (out of scope / other considerations)

- Do NOT delete the `aura.mjs` bundle / `scripts/src/aura.ts` / the `aura`
  skill (separate skill; the `aura` bundle stays).
- Do NOT touch the in-process tools / store / server (tasks 2–4 — done).
- Do NOT change the digest data model.
- Do NOT redesign the skill choreography beyond removing CLI-era framing
  (collect as friction).

## Seams (boundaries under test)

1. **No-CLI seam:** no `aura-digest.mjs`/`dist/aura-digest` anywhere; no
   `scripts/src/aura-digest.ts`; esbuild config builds only `aura.mjs`.
2. **No-dead-exports seam:** no `createProgressEmitter`/`readDashboardUrl`/
   `writeDashboardDigest`/`renderAction`/`saveAction`/`diffAction`/
   `cleanupAction`/`lastAction`/`USAGE`/`FailError`/`DASHBOARD_DIGEST_PATH`
   in the shared core (only `fetchAction` + `saveLastDigest` remain for the
   digest actions).
3. **Skill-doc seam:** the skill doc references only the tools; no
   `aura-digest.mjs`/`dist/`/`task build` for the digest.
4. **Green seam:** full vitest + shared `tsx --test` + all typechecks +
   `aura.mjs` build green.

## Interface contract (none — this is the final task)

After this task, the map is complete: the `aura-digest` skill is fully
tool-driven + in-process; no CLI. The `core-move` (task 1) shared-core
digest modules that remain are exactly: `scheduler`, `build-actions`,
`types`, `settings`, `aura-digest` (with `fetchAction` + `saveLastDigest`),
`devlinks`, `clients`, `mcp-client`, `bitbucket`. Everything else CLI-era is
gone.

## Baseline (on task/cli-deletion-and-rewire off develop)

- ext/shared/scripts typecheck: green · shared `tsx --test`: 195 · root vitest: 21 files / 224 tests
- CLI exit codes: 2/2/0 (the `aura-digest.mjs` bundle still exists at baseline; this task deletes it)
- `aura.mjs` build: green (stays)
