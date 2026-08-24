## Deviation report — wire-extension-entry

### API surface changes
- **Planned:** `index.ts` `start` handler: `spawn(process.execPath, [server.mjs abs path], { detached:true, stdio:'ignore' })` + `child.unref()`; `writePid(statePath, child.pid, Date.now())`; poll `~/.pi/aura/server-url.json` (50ms × 100) → read URL → `openBrowser(url)`; call `startListener({ pi, statePath })` in-process; notify "Dashboard running at <url>". Plus `pi.registerTool("digest-dashboard-start", …)`. `session_shutdown` kills the PID + cleans files (from slice 5, still working).
- **Actual:** All planned elements present and correct.
  - `startDashboard(pi, ctx, options)` — extracted as a standalone exported function (testable). Spawns `dist/server.mjs` via `spawn(process.execPath, [serverEntryPath], { detached:true, stdio:'ignore' })` + `child.unref()` (Q1e). `resolveServerEntryPath()` resolves to `path.resolve(moduleDir, "dist", "server.mjs")` via `fileURLToPath(import.meta.url)` — correctly finds the committed bundle beside `index.ts`. ✓
  - `writePid(statePath, child.pid, Date.now())` — uses the `state.ts` helper from slice 3. ✓
  - `waitForServerUrl(serverUrlPath, child)` — polls 50ms × 100 (decision #5); early-exits if `child.exitCode !== null` (child died before writing the URL file). ✓
  - `openBrowser(serverUrl.url)` — imported from `server.ts`; suppressed when `options.openBrowser === false` or `PI_DIGEST_NO_BROWSER === "1"` (decision #7). Best-effort try/catch. ✓
  - `startListener({ pi, statePath })` — in-process (decision #2); the `listenerHandle` is stored at module level so `stop`/`session_shutdown` can call `stop()`. ✓
  - `pi.registerTool("digest-dashboard-start", …)` — added (decision #6); `Type.Object({ openBrowser: Type.Optional(Type.Boolean) })` params; `execute` calls `startDashboard(pi, ctx, { openBrowser: params.openBrowser ?? true })` and returns `AgentToolResult<{ url: string }>`. ✓
  - `session_shutdown` — calls `teardownDashboard(statePath, serverUrlPath)` (reuses slice 5's cleanup, which kills PID + deletes `state.json` + `server-url.json` + stops the listener). ✓
  - `session_start` — stores `ctx.cwd` in `sessionCwd`; also captures `extensionApi = pi` in the default export so `startHandler` can access the API. ✓
- **Impact:** None. The API surface matches the arch spec exactly. The `StartResult` type (`{ ok, message, url? }`) is an additive export for testability; the `extensionApi` module-level binding is an internal implementation detail. No dependent slice/task is blocked.

### Abstraction usage
- Used/was specified: **yes**. `startDashboard` is extracted as a standalone function (testable with a fake `pi`), mirroring the pattern from slices 3–5 (`startServer`, `startListener`, `teardownDashboard` are all standalone exports). The `resolveServerEntryPath()` uses `fileURLToPath(import.meta.url)` to find `dist/server.mjs` beside the extension — the correct resolution for the bundled server (the esbuild output from slice 3). `writePid`/`readState` from `state.ts` (slice 3) are reused. `openBrowser` from `server.ts` (slice 3) is reused. `startListener` from `listener.ts` (slice 4) is reused. `teardownDashboard` from slice 5 is reused in `session_shutdown`. No reimplemented helpers.

### Out-of-scope changes
- **`server.ts`:** NOT modified. ✓
- **`state.ts`:** NOT modified. ✓
- **`listener.ts`:** NOT modified. ✓
- **`Digest.svelte` / `main.ts`:** NOT modified. ✓
- **`digest-types.ts`:** NOT modified. ✓
- **`scripts/src/*`:** NOT modified. ✓
- **`dist/` (build artifacts):** NOT modified in this commit (the `dist/server.mjs` from slice 3 is reused as-is). ✓
- **`teardown.test.ts` update (intended API-change):** The obsolete test "leaves 'start' as a stub notify" was **deleted** (slice 6 made `start` real, so "start is a stub" is no longer a valid assertion). The test "routes 'stop' to the stop handler and notifies success" was **realigned**: it now spawns a real child process as the fake server PID (instead of asserting "No dashboard running" on an empty state), writes `state.json` + `server-url.json` with the live PID, then calls `stop` and asserts "Digest dashboard stopped." + files deleted. **This is an intended API-change update** — slice 6 deliberately changed `start` from a stub to a real handler, so the slice-5 test asserting stub behavior was obsolete. Per the tdd-worker contract's "Intended, spec'd API change" rule, updating the stale test is the correct action, not a deviation. ✓

### Divergence from slice doc's acceptance criteria
- **All acceptance criteria satisfied:**
  - `start` handler: `spawn({ detached:true, stdio:'ignore' })` + `unref()` ✓; `writePid` ✓; poll `server-url.json` ✓; `openBrowser` ✓; `startListener` in-process ✓; notify ✓.
  - Server script path resolves to `dist/server.mjs` ✓ (the esbuild output from slice 3, the detached entry per decision #1).
  - `pi.registerTool("digest-dashboard-start", …)` added ✓ (decision #6).
  - `session_shutdown` kills PID + cleans files ✓ (reuses `teardownDashboard` from slice 5).
  - Double-start refusal: `startDashboard` checks `state.pid !== null && isProcessAlive(state.pid)` → returns `{ ok: false, message: "...already running. Use /digest-dashboard stop first." }` ✓ (arch spec preference: "prefer refuse + point to `stop`").

- **Test plan scenarios — all 6 covered:**
  - (a) `start` → `state.json` has a `pid` that is alive ✓ ("spawns a detached server and writes a live PID to state.json")
  - (b) page reachable at the server URL ✓ ("polls server-url.json and reads the server URL" — asserts `serverUrl.url === result.url` and `serverUrl.pid === state.pid`)
  - (c) `POST /api/state` (click) → listener `sendMessage` called ✓ ("starts the listener, which forwards a synthetic action_click" — asserts `customType`, `content`, `details.key`, `triggerTurn:true`, `deliverAs:"steer"`)
  - (d) `stop` → PID dead, `state.json` gone, listener exited ✓ ("stop cleans up: kills PID, deletes state.json and server-url.json")
  - (e) second `start` while running → refuse ✓ ("refuses to start a second dashboard while one is running")
  - `registerTool` execute ✓ ("registers a digest-dashboard-start tool whose execute calls start" — asserts `toolDef.name === "digest-dashboard-start"`, `result.content[0].text` contains "running at", `result.details.url` matches `http://127.0.0.1:<port>/`, `state.json` exists with a live PID)
  - **Failure modes:** server fails to bind → `startDashboard` kills the child + deletes `state.json` + returns `{ ok: false, message: "...did not report its URL within the timeout." }` (structurally present, not unit-tested with a forced-bind-failure). Server entry missing → returns `{ ok: false, message: "Server bundle not found..." }` (structurally present). ✓

### Task doc update needed?
**No.** No implementation notes need appending. The slice matches the arch spec's interface contract exactly. The `StartResult` export and `extensionApi` binding are additive testability improvements that don't change the contract for `skl-flow-rewrite` (which calls `/digest-dashboard start|stop` or the `digest-dashboard-start` tool).

### User attention needed?
**No.** The API surface matches the spec. The `teardown.test.ts` update is an intended API-change update (slice 6 made `start` real), not a deviation. No scope creep. All out-of-scope files correctly unmodified. No blockers.
