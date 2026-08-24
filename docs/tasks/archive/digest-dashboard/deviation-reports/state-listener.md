## Deviation report — state-listener

### API surface changes
- **Planned (arch spec "Listener (listener.ts)"):** `startListener({ pi, statePath })` → `{ stop() }` (in-process; called by `index.ts` on `start`).
- **Actual:** `startListener({ pi, statePath, pollIntervalMs? })` → `{ stop(): Promise<void> }`. The implementation adds an optional `pollIntervalMs` parameter (default 100ms) for a **polling fallback safety net** alongside `fs.watch`. This is a superset of the spec: the slice doc's constraints explicitly anticipate this ("the arch spec may add a polling fallback (Q1d noted this) — not in this slice unless needed"). The worker chose to include it. `stop()` returns a `Promise<void>` (the spec said `{ stop() }` without specifying the return type). Both additions are backward-compatible supersets. **No impact on dependent slices** — slice 6 calls `startListener({ pi, statePath })`; the optional `pollIntervalMs` defaults; `stop()` awaiting a promise is fine.
- **`pi.sendMessage` call shape:** Matches the spec exactly: `{ customType: "aura-digest-event", content: payload.instruction, details: payload, triggerTurn: true, deliverAs: "steer" }`. ✓
- **`display: true` added** to the `sendMessage` message object (not in the spec's call shape). This makes the forwarded event visible in the TUI as a custom message. The spec's `pi.sendMessage` shape didn't include `display`, but the pi docs say `display: true` shows the message in the TUI (it still participates in LLM context). This is a minor enhancement — the user sees the click event arrive in the TUI. **Non-blocking; advisory.**

### Abstraction usage
- Used/was specified: **yes**. `listener.ts` imports `readState` and types from `state.ts` (the shared schema module from slice 3), exactly as the arch spec specified ("shared by server.ts + listener.ts + index.ts"). It imports `ActionClickPayload` from `digest-types.ts` for the runtime type guard. The cursor is by `event.id` (monotonic), matching the arch spec ("read events past the last-seen id cursor"). It does not re-implement `readState` or the `StateFile`/`StateEvent` schema.
- **In-process (NOT a spawned child):** confirmed. `listener.ts` is a module imported by `index.ts` (will be wired in slice 6). It receives `pi: ExtensionAPI` as a parameter — a spawned child cannot receive the `pi` object. The arch spec's "Do NOT reimplement: Don't add a second detached process for the listener (it's in-process)" is satisfied. ✓

### Detailed behavior checklist

| Spec requirement | Implementation | Status |
|---|---|---|
| `fs.watch(statePath)` → on change, `readState`, read past cursor | `watch(statePath, ...)` + `scan()` calls `readState` + `processEvents` | ✓ |
| Cursor by `id` (monotonic) | `cursor` starts at `0`, `if (event.id <= cursor) continue; cursor = event.id` | ✓ |
| Forward `page→agent` `action_click` via `pi.sendMessage({customType, content, details, triggerTurn, deliverAs})` | Exact match | ✓ |
| Ignore `agent→page` events | `if (event.dir === "page→agent" && event.type === "action_click")` — acks/update_views with `dir:"agent→page"` don't match | ✓ |
| Exit on `state.json` deletion | `rename` event + `!existsSync` → `scheduleDeletionCleanup()` (500ms grace) → `cleanup()` resolves `stopPromise` | ✓ |
| `fs.watch` error/replace → re-open; cursor stays by `id` | `rename` event with `existsSync` true → close + re-open watcher; cursor unchanged | ✓ |
| Start cursor at max `id` (no replay) | `cursor = initial.events.reduce((max, e) => Math.max(max, e.id ?? 0), 0)` before `openWatcher()` | ✓ |
| Malformed event → skip + log, don't throw | `isActionClickPayload` guard → `console.error(...)` + `continue` | ✓ |
| `sendMessage` failure → log, don't throw | `try/catch` around `pi.sendMessage` → `console.error` | ✓ (bonus, not in spec) |

### Polling fallback (addition, not deviation)
The implementation adds a `setInterval(scan, pollIntervalMs)` alongside `fs.watch`. This is the "polling fallback" the slice doc's constraints explicitly anticipated ("the arch spec may add a polling fallback (Q1d noted this) — not in this slice unless needed"). The worker chose to include it. It means the listener scans `state.json` every 100ms even without a `fs.watch` event, making it robust on filesystems where `fs.watch` is unreliable (network mounts, some Linux inotify configurations). The cursor dedupes by `id`, so the dual `fs.watch` + polling path can't double-forward. **This is a robustness improvement, not a deviation** — it aligns with Q1d's note.

### Deletion grace period (addition)
The implementation uses a 500ms grace period (`scheduleDeletionCleanup`) before treating a `rename` + missing-file as teardown, to distinguish an atomic replace (file briefly gone) from a real deletion. The spec said "On `state.json` deletion: clean up the watcher, resolve `stop()`" without specifying the grace period. The grace period is a reasonable refinement for atomic-write safety. **Non-blocking.**

### Out-of-scope changes
- **Teardown subcommand (slice 5):** NOT present. `index.ts` is still the slice-1 stub (`registerCommand` with `ctx.ui.notify("stub","info")`). No `stop` handler, no PID kill, no `session_shutdown` cleanup. ✓
- **Start/stop wiring (slice 6):** NOT present. No `spawn`, no `writePid`, no `openBrowser`, no `startListener` call from `index.ts`. ✓
- **`scripts/src/*`:** NOT modified. ✓
- **`server.ts`:** NOT modified (still slice 3's implementation). ✓
- **`Digest.svelte` / `main.ts`:** NOT modified. ✓

### Tests — all 7 scenarios from the test plan

| Scenario | Test | Status |
|---|---|---|
| (a) append 1 `action_click` → 1 `sendMessage` | "forwards a single page→agent action_click via sendMessage" | ✓ |
| (b) append 2 → 2 forwards in order | "forwards two action_click events in order" | ✓ |
| (c) `agent→page` `ack` → no `sendMessage` | "ignores agent→page ack events but advances the cursor" | ✓ |
| (d) delete `state.json` → listener exits | "exits and resolves stop() when state.json is deleted" | ✓ |
| (e) atomic replace → cursor advances, no re-forward | "does not replay events after an atomic replace of state.json" | ✓ |
| Edge: cursor at max id (no replay) | "starts with the cursor at the max existing event id (no replay)" | ✓ |
| Failure: malformed event → skip + log | "skips malformed events without throwing and advances the cursor" | ✓ |

All 7 test scenarios present and passing. 7 listener tests + 24 prior = 31 total across 4 files.

### Task doc update needed?
**No.** No implementation notes need appending. The `pollIntervalMs` parameter and `display: true` are superset additions that don't change the interface contract for slice 5 (teardown) or slice 6 (wire-extension-entry). Slice 6 calls `startListener({ pi, statePath })` with the two required params; the optional `pollIntervalMs` defaults.

### User attention needed?
**No.** The API surface matches the spec. The polling fallback and deletion grace period are robustness improvements anticipated by the slice doc's own constraints (Q1d). The `display: true` addition makes click events visible in the TUI (minor enhancement). No scope creep. No blockers.
