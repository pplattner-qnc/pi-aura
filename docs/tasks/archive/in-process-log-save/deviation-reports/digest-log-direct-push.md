## Deviation report — digest-log-direct-push

### API surface changes

- **Planned:** `digest-log` calls `store.pushEvent` directly (no HTTP self-POST); the "dashboard not running → skipped" branch is gone; the tool always returns `ok`; `joinUrl` dropped from `index.ts`; `getDashboardUrl` kept (digest-fetch uses it).
- **Actual:** Exactly as planned.
  - `digest-log` `execute` now calls `pushEvent({ id: 0, ts, dir: "agent→page", type: "agent_log", payload: { message: params.message } })` and returns `ok (${params.message})` unconditionally. No `getDashboardUrl`, no `joinUrl`, no `fetch` anywhere in the execute block.
  - The "dashboard not running, log skipped" early-return branch is **gone** — the tool no longer checks `getDashboardUrl()` at all.
  - The `try/catch` around `fetch(POST)` (the old "post failed, non-fatal" path) is **gone** — there's no HTTP call to fail.
  - `joinUrl` import removed from `index.ts` (was `import { joinUrl } from "@pi-aura/shared/digest/progress-emitter"`).
  - `getDashboardUrl` stays (`export function getDashboardUrl()` at line 103; used by `digest-fetch` at line 358 for the "dashboard was down" warning). ✅
- **Impact:** None on dependent slices — this is the last tool still self-HTTP-POSTing; after this, all agent-side tools are in-process + in-memory.

### Abstraction usage

- **Used/was specified: yes.**
  - `store.pushEvent` (task 2) is the direct in-memory seam. ✅ The event shape matches the arch spec: `{ id: 0, ts, dir: "agent→page", type: "agent_log", payload: { message } }` — the store assigns the monotonic id (overwrites the `0` placeholder), same as `digest-ack` and the `onProgress` adapter. ✅
  - `getDashboardUrl` kept for `digest-fetch`'s warning. ✅
  - No `joinUrl`/`fetch`/HTTP in `digest-log`. ✅

### Out-of-scope changes

- **None.** The implementation is scoped precisely to the slice doc and arch spec:
  - `digest-save` **NOT touched** — the diff doesn't modify the `digest-save` tool block (the `saveLastDigest`/`getCurrentDigest` import line is pre-existing from task 3; not part of this diff's changes). ✅
  - `server.ts` **NOT touched** — the `/api/state` POST route stays (line 155 — the browser's `action_click` still POSTs to it; only the agent's self-POST is gone). ✅
  - `store.ts` **NOT touched** — the store's `pushEvent`/`getEvents`/`resetStore` are used, not modified. ✅
  - `digest-fetch` **NOT touched** — no changes to the fetch tool or `setCurrentDigest` wiring. ✅
  - Skill doc (`aura-digest.md`) **NOT touched** — slice 2 owns the description/skill-doc polish. ✅
  - Tool `description`/`promptSnippet`/`promptGuidelines` **NOT changed** — still says "A no-op if the dashboard is not running" (stale, but slice 2 owns the fix). ✅

### The always-safe semantics

- **Matches the arch spec exactly.** The event is recorded even with no server:
  - `pushEvent` always appends to the in-memory `events` array (the store assigns the monotonic id) regardless of whether the server is running. ✅
  - SSE fan-out is a no-op when no `/events` clients are connected (the `sseClients` set is empty; the `for` loop just doesn't iterate). ✅
  - The tool returns `ok (${message})` unconditionally — no "skipped" branch, no error path. ✅
  - Verified by the test "returns ok with no server running — the event is still recorded (always-safe)": asserts `fetchSpy not called`, `result.text contains "ok"`, `result.text does NOT contain "skipped"`, `getEvents() has an agent_log event with the message`. ✅

### Test quality

- `log-tool.test.ts` rewritten comprehensively (6 tests, all pass):
  1. "calls pushEvent directly — the agent_log event is in getEvents() with the message; no fetch" — no server, asserts the event is in the store + fetch spy not called + monotonic id.
  2. "returns ok with no server running — the event is still recorded (always-safe)" — the key always-safe test.
  3. "returns ok with the server running too" — server up, event recorded, no fetch.
  4. "multiple calls each push a distinct agent_log event" — concurrent calls, distinct monotonic ids.
  5. Tool registration/params schema test (unchanged).
  6. SSE fan-out test: a connected `/events` SSE client receives the `agent_log` `state-change` event (new, in a separate `describe` block).

### Task doc update needed?

**No.** The implementation matches the arch spec and slice doc exactly. The `## Implementation notes` (land-worker) should note:
- `digest-log` now calls `store.pushEvent` directly (no HTTP self-POST); `joinUrl` import dropped.
- Always-safe semantics: the event is recorded regardless of server state; the tool returns `ok` unconditionally.
- The tool `description` still says "A no-op if the dashboard is not running" (stale — slice 2 / task 5 fixes it).

### User attention needed?

**No.** No API surfaces differ from the spec. `digest-log` calls `pushEvent` (no `fetch`); the "dashboard not running → skipped" branch is gone; the tool always returns `ok`; `joinUrl` is dropped; `getDashboardUrl` is kept. Scope did not drift — `digest-save`/`server.ts`/`store.ts`/`digest-fetch`/skill-doc/description all untouched (correctly left for slice 2 or other tasks). The always-safe semantics match the arch spec exactly.
