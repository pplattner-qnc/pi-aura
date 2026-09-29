## Deviation report — dead-code-and-bundle-sweep

### server.ts self-run block deleted? Pure library module?

- **Planned:** Delete the self-run entry block (`if (invokedPath === modulePath)` + signal/exit cleanup + `defaultAuraPaths` if now unused). `server.ts` becomes a pure library module exporting `startServer` + `openBrowser` + helpers.
- **Actual:** Exactly as planned. The entire bottom block (lines 226–269 in the pre-slice file) is deleted — the `process.argv[1]` check, the `defaultAuraPaths` function, the `SIGTERM`/`SIGINT`/`SIGHUP` signal handlers, the `cleanup` function, and the `startServer().catch(...)` call. The `rmSync` import was also removed (no longer needed). `server.ts` now exports only `DigestServer`, `StartServerOptions`, `openBrowser`, and `startServer` — a pure library module. The `os` import was removed (`defaultAuraPaths` was the only consumer).
- **Impact:** None. The server is started in-process by `index.ts` (slice 1); the self-run entry was dead code.

### dist/server.mjs + esbuild.config.mjs deleted? package.json vite-only? .gitignore server.mjs exception removed?

- **Planned:** Delete `dist/server.mjs` + `.pi/extensions/digest-dashboard/esbuild.config.mjs`. Update `package.json` `build` to `vite build`. Remove the root `.gitignore` `!.pi/extensions/digest-dashboard/dist/server.mjs` keep-exception.
- **Actual:** Exactly as planned.
  - `dist/server.mjs` (252 lines) deleted.
  - `esbuild.config.mjs` (16 lines) deleted.
  - `package.json` `build` changed from `"vite build && node esbuild.config.mjs"` to `"vite build"`.
  - Root `.gitignore` line `!.pi/extensions/digest-dashboard/dist/server.mjs` removed (the `app.js`/`app.css` exceptions remain).
  - Verified: `npm run build` (vite-only) produces only `dist/app.js` + `dist/app.css` (no `server.mjs`).
- **Impact:** None. The extension is loaded via `pi.extensions` → `./index.ts` (source, not a bundle); `server.ts` is imported in-process.

### state.ts file functions removed while KEEPING types?

- **Planned:** Delete `writePid`, `clearPid`, `readState`, file-write `appendEvent`, `EMPTY_STATE`, `StateFile`, `writeQueues`/`ensureDir`/`enqueue` helpers. Keep `StateEvent`/`AckPayload`/`UpdateViewPayload` types.
- **Actual:** Exactly as planned. All file-based functions and helpers removed: `StateFile` interface, `EMPTY_STATE` const, `writeQueues` map, `ensureDir`/`enqueue` helpers, `readState`, `appendEvent` (file), `writePid`, `clearPid`. The `node:fs` and `node:path` imports were also removed (no longer needed). `state.ts` now exports only the three type interfaces: `AckPayload`, `UpdateViewPayload`, `StateEvent`. The file comment was updated to reflect its new role ("Shared types for the digest dashboard state events").
- **Impact:** None. All consumers (`store.ts`, `listener.ts`, `server.ts`) already use the in-memory `store.ts` API from slice 2; no code imports the removed functions.

### progressTree.ts handled correctly?

- **Planned:** If `progressTree.ts` imported `StateFile` from `state.ts`, rewire it to `getEvents()` from `store.ts` (or `StateEvent[]`). If only comments referenced `StateFile`, update the comments. Do NOT wrongly delete it if it had importers.
- **Actual:** `progressTree.ts` never imported `StateFile` — it only mentioned "StateFile's events array" in JSDoc comments on `extractProgressEvents` and `extractAgentLogEvents`. The worker correctly updated the comments to say "an events array" (removing the `StateFile` reference) and the function signatures already took `StateEvent[]` (not `StateFile`). No code change was needed; only two comment lines were updated. `progressTree.ts` is imported by `Digest.svelte` (the Svelte view), so it was correctly left in place.
- **Impact:** None. The type-only change in comments has no runtime effect.

### Out-of-scope changes

- **Did NOT delete `scripts/esbuild.config.mjs`** (task 5): ✅ Confirmed — `git diff` shows no changes under `scripts/`.
- **Did NOT change the Svelte view** (`Digest.svelte`): ✅ Confirmed — no diff.
- **Did NOT change `digest-types.ts`**: ✅ Confirmed — no diff.
- **Did NOT rewire `digest-fetch`/`digest-log`/`digest-save`** (tasks 3/4): ✅ Confirmed — `index.ts` diff is only a one-word comment fix ("no writePid" → "no waitForServerUrl" in a comment).
- **Did NOT remove `store.ts` API** (task 3): ✅ Confirmed — `store.ts` diff is only a comment clarification ("like the old appendEvent did" → "like the old file-based appendEvent did"). All 7 exports (`setCurrentDigest`, `getCurrentDigest`, `getEvents`, `pushEvent`, `subscribe`, `registerSseClient`, `resetStore`) are unchanged.

### Additional changes (within scope, not deviations)

- **New test `test/digest-dashboard/dead-code-sweep.test.ts`** (131 lines): A structural/grep-style test verifying the dead code is gone — asserts `state.ts` has no `writePid`/`clearPid`/`readState`/`appendEvent`/`EMPTY_STATE`/`StateFile`/`writeQueues`/`ensureDir`/`enqueue`/`mkdirSync`/`writeFileSync`, asserts `server.ts` has no `process.argv[1]`/`defaultAuraPaths`/`SIGTERM`/`SIGHUP`/`beforeExit`, asserts `esbuild.config.mjs` + `dist/server.mjs` don't exist, asserts `package.json` build is `"vite build"`, and asserts the remaining type exports (`StateEvent`/`AckPayload`/`UpdateViewPayload`) + `startServer`/`openBrowser` exports are still present. This is a well-scoped verification test that locks in the dead-code removal.
- **Comment updates in 3 test files** (`DigestTree.test.ts`, `log-tool.test.ts`, `start.test.ts`): Stale references to `StateFile`, `appendEvent's write queue`, and `writePid` in comments were updated to reflect the in-memory store. No test logic changed.

### Task doc update needed?

**No.** The implementation matches the arch spec and slice doc exactly. The `## Implementation notes` section should note:
- `state.ts` is now type-only (3 interfaces); all file functions removed.
- `server.ts` is a pure library module (no self-run entry, no `defaultAuraPaths`).
- `dist/server.mjs` + `esbuild.config.mjs` deleted; `npm run build` is vite-only.
- Root `.gitignore` `server.mjs` keep-exception removed.
- New `dead-code-sweep.test.ts` locks in the removal.

### User attention needed?

**No.** No API surfaces differ from the spec. All dead code was fully removed. Scope did not drift — no out-of-scope files were touched. `progressTree.ts` was handled correctly (comment-only update, no code change). The `store.ts` interface contract for task 3 is fully preserved. All three typechecks pass, vitest 19 files / 201 tests pass, `vite build` produces only `app.js`/`app.css`, and grep confirms no dead references remain (only in comments + the new sweep test's negative assertions).
