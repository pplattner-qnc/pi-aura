## Deviation report — dashboard-event-plumbing

### API surface changes
- **Planned:** `StateEvent.type` gains `"progress"` and `"agent_log"`; new `ProgressPayload` (mirrors scheduler's `ProgressEvent`: id, label, parentId?, status, startedAt, endedAt?, kind) and `AgentLogPayload` (message: string); `/events` SSE gains a `state.json` watcher emitting `event: state-change` with the new event's id + type.
- **Actual:** All delivered exactly as specified.
  - `ProgressPayload` — `{ id: string, label: string, parentId?: string, status: "running"|"done"|"error", startedAt: number, endedAt?: number, kind: string }`. Matches arch spec field-by-field. ✅
  - `AgentLogPayload` — `{ message: string }`. ✅
  - `StateEvent.type` — `"action_click" | "ack" | "update_view" | "progress" | "agent_log"`. ✅
  - `StateEvent.payload` — union extended to include `ProgressPayload | AgentLogPayload`. ✅
  - `/events` SSE — second `fs.watch` on `opts.statePath` added; on change, reads `state.json`, emits `event: state-change\ndata: {"id":N,"type":"..."}\n\n` with the last event's id + type. Matches arch spec wire format. ✅
  - Import change: `server.ts` now imports `readState` (in addition to `type StateEvent`) from `state.ts` — needed to read the last event on state.json change. ✅ justified.
- **Impact:** No deviations from the planned API surface. Dependent slices (3, 4, 5) can consume `ProgressPayload`/`AgentLogPayload` and the `state-change` SSE event as specified.

### Abstraction usage
- Used/was specified: **yes**. `appendEvent`'s write queue (serialization) — reused unchanged for the new event types. `readState` — reused to read the last event on state.json change. Existing `/events` SSE structure — extended, not forked. `readRequestBody` — reused for POST body parsing. The existing `digest.json` `event: change` watcher — untouched, still fires. ✅
- Did NOT reimplement: the `digest.json` watcher (still the original `watch(opts.dashboardPath)`), the `action_click` listener (`listener.ts` untouched), `writePid`/`clearPid` (untouched). All confirmed by diff: only `state.ts` and `server.ts` changed among source files. ✅

### Out-of-scope changes
- **`digest-types.ts` (browser-facing StateEvent copy): correctly left alone.** The tdd-worker edited it, then reverted it (commit `98a61d4e`). The diff confirms zero changes to `digest-types.ts`, `listener.ts`, `index.ts`, `Digest.svelte`, `app.js`, or `app.css`. This is consistent with the arch spec, which assigns the browser-side type union update to slice 4 (svelte-tree-view). `state.ts` is the server-side source of truth; `server.ts` imports `StateEvent` from `state.ts`, so typecheck passes without the `digest-types.ts` change. ✅
- **No other files touched.** Diff is strictly `state.ts` (+22), `server.ts` (+35/-3), `test/digest-dashboard/server.test.ts` (new, 191 lines), `test/digest-dashboard/state.test.ts` (new, 85 lines). Matches the slice scope ("Changes to state.ts and server.ts. No Svelte view yet."). ✅

### Task doc update needed?
- **No.** All acceptance criteria from the slice doc are met. No divergence to append to `## Implementation notes`.

### Detailed acceptance-criteria comparison

| Slice doc criterion | Met? | Evidence |
|---|---|---|
| `StateEvent.type` union includes `"progress"` and `"agent_log"` | ✅ | `state.ts:24` — `type: "action_click" \| "ack" \| "update_view" \| "progress" \| "agent_log"` |
| `ProgressPayload` mirrors scheduler's `ProgressEvent` (id, label, parentId?, status, startedAt, endedAt?, kind) | ✅ | `state.ts:19-26` — all 7 fields present, types match (string, string, string?, union, number, number?, string) |
| `agent_log` carries `message: string` | ✅ | `state.ts:29` — `AgentLogPayload { message: string }` |
| `appendEvent` accepts and persists both new types unchanged (same write queue) | ✅ | `appendEvent` body unchanged; tests `state.test.ts` "appendEvent persists a progress event", "appendEvent persists a progress event with parentId", "appendEvent persists an agent_log event", "appendEvent serializes concurrent progress and agent_log writes" all pass |
| `/events` SSE adds a `state.json` watcher sending `event: state-change` with the new event's `id` + `type` | ✅ | `server.ts:172-198` — `openStateWatcher()` watches `opts.statePath`, reads `readState`, emits `event: state-change\ndata: {"id":${latest.id},"type":"${latest.type}"}\n\n` |
| Existing `digest.json` `event: change` behavior is unchanged | ✅ | `server.ts:163-168` — original `watch(opts.dashboardPath)` untouched. Regression test "still emits digest.json change events alongside state-change (regression)" passes |
| A client connected to `/events` receives `state-change` when a `progress` event is POSTed | ✅ | `server.test.ts` "emits a state-change SSE event when a progress event is POSTed" — asserts `event: state-change` received, data contains `"id":1` + `"type":"progress"`, and event lands in `state.json` |
| A client connected to `/events` receives `state-change` when an `agent_log` event is POSTed | ✅ | `server.test.ts` "emits a state-change SSE event when an agent_log event is POSTed" — same assertions for `agent_log` |
| Existing `action_click`/`ack`/`update_view` handling and the listener are unchanged | ✅ | `listener.ts` has zero diff; existing `action_click` POST test ("appends an event via POST /api/state") still passes |
| Concurrent POSTs serialize with monotonic ids | ✅ | `server.test.ts` "serializes concurrent progress POSTs with monotonic ids" — 5 concurrent POSTs, ids [1,2,3,4,5] |
| No Svelte changes | ✅ | `Digest.svelte`, `app.js`, `app.css` — zero diff |
| No bundle changes | ✅ | `dist/` artifacts — zero diff (the tdd-worker ran `npm run build` once, producing a transient `app.css` change, but reverted it) |
| Must not change the existing `page→agent` `action_click` listener contract | ✅ | `listener.ts` — zero diff |

### Residual risks

1. **`state.json` watcher may miss the first event if the file doesn't exist at SSE connect time.** The `openStateWatcher` function catches the `ENOENT` from `watch()` silently and never retries — if `state.json` is created *after* the SSE connects, the watcher won't reattach. The tests seed `state.json` before connecting (`writeFileSync(statePath, ...)`), so they don't cover this edge case. In production, `digest-dashboard-start` writes the PID (via `writePid` → `appendEvent`'s `ensureDir` + `writeFileSync`) before the browser connects, so `state.json` should exist by the time the SSE opens — but a race (server starts, browser connects to `/events` before `writePid` runs) would silently miss early progress events. **Low risk** in practice (the PID write happens in `index.ts` before `startDashboard` returns), but worth noting for slice 4 (the Svelte view should re-fetch `state.json` on connect to catch any events that fired before the watcher attached).

2. **`state-change` SSE carries only the *last* event's id+type, not all new events since the previous change.** If multiple events are appended between two `fs.watch` notifications (coalesced by the OS), only the last one's id+type is sent. The browser must re-fetch the full `state.json` to get all missed events. This is fine for the intended consumer (slice 4 re-fetches on each `state-change`), but the SSE data is a *hint*, not a complete delta. **Low risk** — the arch spec says the browser re-fetches, not that it relies on the SSE payload alone.

3. **`digest-types.ts` (browser copy) does not yet know about `"progress"`/`"agent_log"`.** This is a deliberate scope decision (slice 4 owns it), but it means the TypeScript types for the browser-side `StateEvent` are out of sync with `state.ts` until slice 4 lands. Any code that imports `StateEvent` from `digest-types.ts` (rather than `state.ts`) will type-narrow incorrectly for the new types. **No risk** for slice 2 (server.ts imports from `state.ts`), but slice 4 must update `digest-types.ts` to mirror the `state.ts` union.
