## Deviation report — teardown-subcommand

### API surface changes
- **Planned (arch spec "Extension (index.ts)"):** `index.ts` `stop` handler + `session_shutdown` cleanup; reads PID from `state.json`, `process.kill(pid)` (SIGTERM + SIGKILL fallback), deletes `state.json` + `server-url.json`; idempotent on missing/dead PID; `session_start` stores `ctx`/`cwd`; `session_shutdown` kills leaked PID + cleans files.
- **Actual:** All planned deliverables present and correct:
  - `index.ts` (153 lines) — replaced the slice-1 stub with a real extension. `registerCommand("digest-dashboard", { handler })` dispatches on `parseSubcommand(args)`: `stop` → `stopHandler`, `start` → `startHandler` (stub), else → usage warning. ✓
  - `stopHandler` calls the extracted `teardownDashboard(statePath, serverUrlPath)` helper (testable; reads `~/.pi/aura/state.json` via `readState` from `state.ts`, kills PID, deletes files, returns `TeardownResult { ok, message }`), then `ctx.ui.notify(result.message, result.ok ? "info" : "error")`. ✓
  - `terminateProcess(pid)` — SIGTERM, 2s grace, then SIGKILL if still alive. `ESRCH` (already dead) is caught and returns silently. ✓
  - `teardownDashboard` — if `state.json` absent → `{ ok: true, message: "No dashboard running." }` (idempotent, no error). ✓ If PID is `null` or dead → skips kill, deletes files. ✓ If `readState` throws → deletes files + returns error message. ✓
  - `deleteFiles(statePath, serverUrlPath)` — `existsSync` + `rmSync({ force: true })` for both files; catches+logs errors. ✓
  - `session_start` — `sessionCwd = ctx.cwd`. ✓
  - `session_shutdown` — calls `teardownDashboard(statePath, serverUrlPath)` (kills leaked PID + cleans files). ✓
  - `defaultAuraPaths()` helper — `~/.pi/aura/` with `digest.json`/`state.json`/`server-url.json` paths. ✓
- **Impact:** None. The `stop` handler + `session_shutdown` cleanup contract matches the spec. The `start` handler is a stub (`"start: not yet implemented"` notify) — correct for slice 5 (slice 6 implements it). No `pi.registerTool` present — correct (slice 6 adds it). No `listener`/`startListener` import — correct (slice 6 wires it).

### Abstraction usage
- Used/was specified: **yes**. `readState` from `state.ts` (slice 3's helper) is imported and used to parse `state.json` — exactly per the arch spec's "`state.ts` owns read/append/teardown helpers (shared by server.ts + listener.ts + index.ts)". The `session_shutdown` cleanup mirrors pi-annotate's `liveServers` cleanup pattern (kill + clean, don't leak). The `defaultAuraPaths()` mirrors `DASHBOARD_DIGEST_PATH`/`LAST_DIGEST_PATH` conventions from the scripts workspace.

### Out-of-scope changes
- **`start` handler (spawn + writePid + openBrowser + startListener):** NOT implemented — stub notify only. ✓ (Slice 6 implements the real `start`.)
- **`pi.registerTool("digest-dashboard-start", …)`:** NOT present. ✓ (Slice 6 adds it per arch spec decision #6.)
- **`listener.ts` / `startListener` import:** NOT present in `index.ts`. ✓ (Slice 6 wires the in-process listener.)
- **`scripts/src/*`:** NOT modified. ✓
- **`server.ts` / `state.ts` / `Digest.svelte`:** NOT modified by this slice. ✓

### Divergence from slice doc's acceptance criteria
- **All acceptance criteria satisfied:**
  - `stop` handler reads `state.json`, parses `pid`, `process.kill(pid)` (SIGTERM + SIGKILL fallback), deletes `state.json` + `server-url.json`, notifies "Digest dashboard stopped." ✓
  - `state.json` absent → "No dashboard running." (idempotent). ✓
  - Dead PID (`ESRCH`) → deletes file + notify (no throw). ✓
  - `session_shutdown` kills leaked PID + deletes files. ✓
  - Listener delete-exit contract — this slice just deletes the file (the listener observes deletion, per slice 4). ✓
  - Unit tests: live PID killed + files deleted; no file → idempotent; dead PID → file deleted, no throw. ✓ (Plus: stop route + notify; start stub; session_shutdown kills leaked PID — 6 tests total.)

- **Test plan scenarios — all covered:**
  - (a) `state.json` with live PID → child killed, file deleted, "stopped" notify. ✓
  - (b) no `state.json` → "No dashboard running", exit 0. ✓
  - (c) `state.json` with dead PID → file deleted, no throw. ✓
  - (d) `session_shutdown` with leaked PID → killed. ✓
  - **Failure mode (process.kill permission error):** Not explicitly tested with a permission-denied scenario, but the `terminateProcess` try/catch + `teardownDashboard` error-return path covers it structurally (returns `{ ok: false, message: "Failed to stop dashboard process: ..." }` + still deletes files). The `deleteFiles` catch+log covers file-delete errors. **Minor gap (non-blocking):** no test exercises the permission-error path; the code path is covered by the `catch` blocks but not by an assertion. The slice doc's failure-mode scenario is structurally handled but not unit-tested.
  - **Edge case (PID reuse):** The arch spec's "may add this guard" (`server_started` timestamp check) is **not implemented** — `teardownDashboard` kills the PID without verifying the `server_started` timestamp matches. The slice doc said "arch spec may add this guard" — it's optional. `state.ts` does record `server_started` (slice 3), so the data is available for slice 6 to add the guard if desired. **Non-blocking; explicitly optional per the slice doc.**

- **`TeardownResult` type added:** The arch spec didn't specify a return type for the stop handler; the implementation adds `TeardownResult { ok: boolean; message: string }` so `stopHandler` can choose `info` vs `error` severity. This is a clean, minimal addition that improves the handler's UX. **Non-blocking; good design.**

### Task doc update needed?
**No.** No implementation notes need appending. The slice matches the spec's interface contract. The `TeardownResult` type and `defaultAuraPaths()` helper are additive improvements that don't change the contract for slice 6 (which will call `teardownDashboard` indirectly via `stopHandler` and reuse `defaultAuraPaths()`).

### User attention needed?
**No.** The API surface matches the spec. The `stop` handler + `session_shutdown` cleanup + idempotent-on-missing/dead-PID are all correct. No scope creep. The two minor gaps (permission-error path untested; PID-reuse guard not implemented) are both explicitly optional per the slice doc. No blockers.
