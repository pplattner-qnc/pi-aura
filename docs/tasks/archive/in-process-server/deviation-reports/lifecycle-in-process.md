## Deviation report — lifecycle-in-process

### API surface changes

- **Planned:** Module-scope `serverHandle = {server, port, url}` in `index.ts`;
  `getDashboardUrl(): string | null` returning `serverHandle?.url ?? null`;
  `startDashboard` calls `startServer` in-process (no spawn of the server child);
  `digest-fetch`/`digest-log` switch from `readDashboardUrl()` to `getDashboardUrl()`;
  `teardownDashboard` takes only `statePath` (no `serverUrlPath`); `session_shutdown`
  likewise. `readDashboardUrl` import removed; `joinUrl` import kept.
- **Actual:** Exactly as planned.
  - `ServerHandle` interface added (`{server, port, url, done}`); module-scope
    `let serverHandle: ServerHandle | null = null`. The `done` field is an
    addition over the spec's `{server, port, url}` — it carries `startServer`'s
    `done()` close function, which `teardownDashboard` calls via
    `serverHandle.done()`. This is a minor, well-justified extension (the spec
    said `server.close()`; `done()` wraps `server.close()` + watcher cleanup).
  - `getDashboardUrl()` exported, returns `serverHandle?.url ?? null`. ✅
  - `startDashboard` calls `startServer({dashboardPath, statePath, openBrowser:
    false})` in-process; stores the result in `serverHandle`. No `spawn` of the
    server, no `writePid`, no `waitForServerUrl`. ✅
  - `digest-fetch` uses `getDashboardUrl() === null` for the "dashboard was down"
    check. ✅ `digest-log` uses `getDashboardUrl()` for URL discovery. ✅
  - `teardownDashboard(statePath)` — `serverUrlPath` param dropped; all callers
    (stop tool, session_shutdown) updated. ✅
  - `readDashboardUrl` import removed; `joinUrl` import kept. ✅
  - `startServer` imported from `./server.ts` (was previously only `openBrowser`
    was imported from there). ✅
- **Impact:** None on dependent slices. The `getDashboardUrl()` API is the seam
  slice 2 and tasks 3–4 will use. The `ServerHandle.done` field is internal to
  `index.ts` and doesn't affect the public surface.

### Abstraction usage

- **Used/was specified: yes.**
  - `server.ts`'s `startServer` handler logic — reused as-is; only the
    `serverUrlPath` option + `writeFileSync(server-url.json)` removed from
    `startServer`'s body. Handlers still read `digest.json` from disk, still
    `appendEvent` → `state.json`, still `fs.watch` for SSE. ✅
  - `state.ts`'s `writePid`/`clearPid`/`readState`/`appendEvent` stay
    exported-but-unused this slice. ✅ (Not deleted — slice 3 removes them.)
  - `listener.ts` `startListener`/`ListenerHandle` — unchanged, still
    `fs.watch`-based (slice 2 rewires it). ✅
  - `@pi-aura/shared/digest/progress-emitter` — `joinUrl` kept (digest-log uses
    it); `readDashboardUrl` import removed (replaced by `getDashboardUrl`). ✅
  - `runAuraDigest`'s `spawn` KEPT — `digest-fetch` still spawns the CLI
    (`runAuraDigest(["fetch"])` → `spawn(process.execPath, [scriptPath, ...])`).
    Task 3 rewires this. ✅ This is the critical non-regression the task
    flagged, and it was correctly preserved.

### Out-of-scope changes

- **Did NOT move backing to memory (slice 2 scope):** No `currentDigest`,
  `pushEvent`, `setCurrentDigest`, `sseClients`, `nextEventId`, or `subscribe`
  anywhere in `index.ts`. ✅
- **Did NOT delete `dist/server.mjs` or `esbuild.config.mjs` (slice 3 scope):**
  Both files still exist. ✅ The extension `npm run build` still produces
  `dist/server.mjs` via esbuild (correct — slice 3 removes it).
- **Did NOT rewire `digest-fetch` (task 3 scope):** `digest-fetch` still calls
  `runAuraDigest(["fetch"])` which spawns the CLI shim. ✅
- **Did NOT delete `writePid`/`clearPid` from `state.ts` (slice 3 scope):** Both
  functions still exported. ✅
- **Did NOT touch `listener.ts` (slice 2 scope):** Unchanged. ✅
- **Did NOT touch `Digest.svelte` or `digest-types.ts`:** Unchanged. ✅
- **`server.ts` self-run entry block stays (slice 3 removes it):** The
  `if (invokedPath === modulePath)` block at the bottom of `server.ts` is
  preserved, still referencing `serverUrlPath` for its own cleanup. ✅ The
  `defaultAuraPaths` in the self-run block still returns `serverUrlPath` — this
  is expected per the spec ("the self-run entry block stays for now — slice 3
  removes it").

**One out-of-scope-but-necessary change (not a deviation):**
- `dist/server.mjs` was rebuilt (9 lines changed) — this is the esbuild
  bundle reflecting the `server.ts` source change (the removed
  `writeFileSync`/`mkdirSync` import + `serverUrlPath` option). The bundle is a
  committed build artifact so this is expected housekeeping. Not a scope
  violation.

### `ServerHandle.done` field (minor extension)

The spec said `{server, port, url}`; the implementation added `done: () =>
Promise<void>`. `teardownDashboard` calls `serverHandle.done()` instead of
`serverHandle.server.close()` directly. `done()` wraps `server.close()` + closes
the `fs.watch` watchers (the `watchers` array in `startServer`'s closure). This
is correct and arguably better than calling `server.close()` alone (which would
leak the watchers). Not a deviation — it's using the existing `DigestServer.done`
contract that `startServer` already returns.

### Task doc update needed?

**No.** The implementation matches the arch spec and slice doc. The
`## Implementation notes` (land-worker appended) should note:
- `serverHandle` is `{server, port, url, done}` (the `done` field wraps
  `server.close()` + watcher cleanup from `startServer`).
- `teardownDashboard` signature changed from `(statePath, serverUrlPath)` to
  `(statePath)`.
- `getDashboardUrl()` is the new exported URL-discovery function.
- `runAuraDigest`'s spawn was KEPT (digest-fetch/digest-save still spawn the CLI).

### User attention needed?

**No.** No API surfaces differ from the spec (the `done` field is a minor
internal extension, not a public API change). The lifecycle logic matches the
spec exactly (in-process start, deterministic close, no spawn/pid/waitForServerUrl).
No scope drifted — backing-to-memory, bundle deletion, digest-fetch rewiring,
and state.ts dead-code removal are all correctly deferred to their owning
slices/tasks. The critical `runAuraDigest` spawn was preserved (digest-fetch
still spawns the CLI — task 3 rewires it).

### Verification results

| Check | Result |
|-------|--------|
| Extension `tsc --noEmit` | ✅ clean (exit 0) |
| Scripts `tsc --noEmit` | ✅ clean (exit 0) |
| Shared `tsc --noEmit` | ✅ clean (exit 0) |
| Root vitest | ✅ 18 files / 178 tests pass (was 177; +1 new test) |
| Extension `npm run build` (vite + esbuild) | ✅ builds `app.js`/`app.css` + `server.mjs` |
| `runAuraDigest` spawn kept | ✅ `digest-fetch` still spawns CLI |
| `server-url.json` not written by `startServer` | ✅ `writeFileSync` removed from `startServer` body |
| `writePid`/`clearPid` still exported in `state.ts` | ✅ (slice 3 removes) |
| `dist/server.mjs` + `esbuild.config.mjs` still exist | ✅ (slice 3 removes) |
| `listener.ts` / `Digest.svelte` / `state.ts` untouched | ✅ |
| No in-memory backing added | ✅ (slice 2) |
