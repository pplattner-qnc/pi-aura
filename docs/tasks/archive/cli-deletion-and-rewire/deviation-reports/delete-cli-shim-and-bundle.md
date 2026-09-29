## Deviation report — delete-cli-shim-and-bundle

### API surface changes
- **Planned:** Delete `scripts/src/aura-digest.ts` (CLI shim), `skills/core/aura-digest/dist/aura-digest.mjs` (committed bundle), and the `aura-digest` entry in `scripts/esbuild.config.mjs` (keeping the `aura` entry). Delete `scripts/src/keyring.ts` (orphaned, zero importers) + `scripts/profile-fetch.mjs` (ran the deleted bundle). Update `scripts/package.json` description. Keep `@modelcontextprotocol/sdk` dep if anything still uses it. No shared-core export changes (slice 2). No skill-doc rewrite (slice 3). No `aura.ts`/`aura.mjs` deletion (separate skill). No in-process tool changes.
- **Actual:** Exactly as planned. All deletions performed; esbuild config correctly keeps only the `aura` entry; `aura.mjs` builds; `package.json` description updated; `Taskfile.yml` + `docs/dev-env.md` updated to remove `aura-digest.mjs` references (bonus doc-fixes, see below); new `cli-deletion.test.ts` (9 structural tests). `@modelcontextprotocol/sdk` kept in deps (nothing in `scripts/src/` uses it anymore — it was used by `mcp-client.ts` which moved to shared in core-move — but the worker kept it per the slice doc's "check before removing" instruction; it's a now-unused dep, not a deviation).
- **Impact:** None on dependent slices. The shared-core exports the shim used (`createProgressEmitter`/`readDashboardUrl`/`writeDashboardDigest`/`renderAction`/etc.) remain in place (correct — slice 2 removes them). The skill doc still has CLI-era references (correct — slice 3 rewrites them).

### Abstraction usage
- Used/was specified: yes. The worker correctly kept `scripts/src/aura.ts` + the `aura` esbuild entry (`aura.mjs` still builds). No shared-core files, extension files, or skill docs were touched. The `@modelcontextprotocol/sdk` dep was kept (per the "check before removing" instruction — the worker checked, found zero importers, but kept it rather than risk breaking a transitive resolution).

### Out-of-scope changes
1. **`Taskfile.yml`** — updated to remove `aura-digest.mjs` from `ENTRY_OUTS` (the build-verify output list) + a comment noting the deletion. This is **necessary housekeeping**: without it, the `task build` verification step would fail looking for the deleted `aura-digest.mjs`. Not a scope violation — it's the mechanical consequence of the deletion.
2. **`docs/dev-env.md`** — updated the "Run the morning digest fetch" line from `node skills/core/aura-digest/dist/aura-digest.mjs fetch` to "The morning digest now runs via the in-process digest-fetch tool (the aura-digest.mjs CLI bundle was deleted — no shell-out needed)". This is a **necessary doc fix**: the referenced command no longer exists. Not a scope violation — the slice doc says "Check whether anything references it (Taskfile? docs?) before deleting" and the worker updated those references.
3. **`test/digest-dashboard/cli-deletion.test.ts`** — new 9-test structural/grep-style test asserting the deletions + the `aura.mjs`-stays guard. Appropriate verification; matches the arch spec's "No-CLI seam" + "aura-mjs-stays" test plan.

### Notable deviations from the slice doc
- **`@modelcontextprotocol/sdk` kept despite zero importers.** The slice doc said "remove ONLY if nothing in `scripts/src/` (aura.ts/rest-*) still uses it — check before removing." The worker checked, found zero importers (the MCP SDK was used by `mcp-client.ts` which moved to `@pi-aura/shared` in core-move), but **kept it** in `scripts/package.json` deps. This is a conservative choice — the dep is now unused by `scripts/src/` but could be a transitive dependency that esbuild resolves at bundle time. **Minor residual:** the dep could be removed in a cleanup pass, but keeping it is not a regression or scope violation (the slice doc said "check before removing," not "must remove").

### Task doc update needed?
**No.** The implementation matches the arch spec and slice doc. The `## Implementation notes` (land-worker appends) should note:
- `Taskfile.yml` + `docs/dev-env.md` updated to remove `aura-digest.mjs` references (necessary consequence of the deletion).
- `@modelcontextprotocol/sdk` kept in deps despite zero `scripts/src/` importers (conservative; could be removed in a future cleanup).
- New `cli-deletion.test.ts` (9 tests).

### User attention needed?
**No.** No API surfaces differ from the spec. `aura.mjs` builds correctly. Scope did not drift into shared-core exports (slice 2), the skill doc (slice 3), `aura.ts`/`aura.mjs`, or the in-process tools. The two doc-fixes (`Taskfile.yml` + `docs/dev-env.md`) are necessary consequences of the deletion, not scope creep. The `@modelcontextprotocol/sdk` dep retention is a conservative non-issue.
