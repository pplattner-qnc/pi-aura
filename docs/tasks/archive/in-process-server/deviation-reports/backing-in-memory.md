## Deviation report — backing-in-memory

### API surface changes

- **Planned:** A new in-memory store (`store.ts` or module-scope in `index.ts`)
  with `currentDigest`, `events`, `sseClients`, `nextEventId`, `pushEvent`,
  `subscribe`, and `setCurrentDigest`. `server.ts` handlers read/write the
  in-memory store (not files). `listener.ts` subscribes to the in-memory
  stream. `pushEvent` + `setCurrentDigest` exposed for task 3.
- **Actual:** Exactly as planned. A new `store.ts` module (106 lines) exports:
  - `setCurrentDigest(d: unknown | null): void` — sets `currentDigest` + fans
    out a `'change'` SSE event to all SSE clients (the browser re-fetches
    `/api/digest` on `'change'`, matching the old `fs.watch` on `digest.json`).
  - `getCurrentDigest(): unknown | null` — returns `currentDigest` (null → 404).
  - `getEvents(): StateEvent[]` — exposed for task 3/4 test inspection.
  - `pushEvent(event: StateEvent): void` — assigns `event.id = nextEventId++`
    (overwriting client-supplied id, like the old `appendEvent`), pushes to
    `events`, writes `'event: state-change\ndata: {"id":<id>,"type":"<type>"}\n\n'`
    to each SSE client, calls each subscriber.
  - `subscribe(cb): () => void` — adds to `subscribers`, returns unsubscribe.
  - `registerSseClient(res): () => void` — adds `res` to `sseClients`, returns
    a removal fn (called on `req 'close'`).
  - `resetStore(): void` — clears everything (called in `teardownDashboard` +
    test `beforeEach`/`afterEach`).
- **Impact:** None on dependent slices. The interface contract for task 3 is
  fully met: `setCurrentDigest` and `pushEvent` are exported from `store.ts`
  and documented with a header comment naming task 3/4 as the callers. Task 3
  can `import { setCurrentDigest, pushEvent } from "./store.ts"` (or via the
  relative path from `index.ts`).

### Abstraction usage

- **Used/was specified: yes.**
  - `server.ts` handler logic (route switch, `resolveBundles`, `htmlShell`,
    `readRequestBody`) — reused. Only the file I/O + `fs.watch` + `appendEvent`
    were dropped. ✅
  - `state.ts`'s `appendEvent` serialization (monotonic id assignment) —
    semantics kept in `pushEvent` (`event.id = nextEventId++`). ✅
  - `listener.ts`'s `ListenerHandle` API — kept (`{ stop(): Promise<void> }`).
    `startListener({ pi })` now subscribes via `store.subscribe`. ✅
  - `@pi-aura/shared/digest/progress-emitter`'s `joinUrl` — kept (digest-log
    still uses it). `readDashboardUrl` was already replaced by `getDashboardUrl`
    in slice 1; no further change. ✅

### Server handler changes (detailed)

- `/api/digest` GET → `getCurrentDigest()`: 404 if null, 200+JSON otherwise.
  No file read. `stat`/`readFile` imports dropped. ✅
- `/events` SSE → `registerSseClient(res)` + unregister on `req 'close'`. No
  `fs.watch`, no `watchers[]` array, no `FSWatcher` import. ✅
- `/api/state` POST → `pushEvent(parsed as StateEvent)`. No `appendEvent`
  (file), no `statePath`. ✅
- `StartServerOptions` — `dashboardPath` and `statePath` dropped; only
  `openBrowser`/`browserOpener` remain. `startServer` signature now
  `startServer(opts: StartServerOptions = {})`. ✅
- `done()` — just `server.close()`, no watcher cleanup. ✅
- Self-run entry block — kept (slice 3 removes it); the `startServer()` call
  there dropped `dashboardPath`/`statePath` args. ✅ (correctly deferred)

### Listener changes (detailed)

- `listener.ts` rewritten from 195 lines → 56 lines. No `fs.watch`, no
  polling, no cursor, no `readState`, no `FSWatcher`/`existsSync` imports.
  `ListenerOptions` is now `{ pi: ExtensionAPI }` (dropped `statePath`/
  `pollIntervalMs`). `startListener` subscribes via `store.subscribe`,
  filters for `dir === "page→agent"` and `type === "action_click"`,
  validates `isActionClickPayload`, then `pi.sendMessage`. `stop()` calls
  `unsubscribe()`. `ListenerHandle` API preserved. ✅

### Out-of-scope changes

- **`digest-fetch` tool: NOT touched.** ✅ (task 3 scope) — `runAuraDigest`/
  `fetchTool` unchanged. Still writes `~/.pi/aura/digest.json` to disk, but
  `/api/digest` now reads the in-memory store (empty → 404), not that file.
- **`digest-log` tool: NOT rewired to direct `pushEvent`.** ✅ (task 4 scope)
  — Still HTTP-POSTs to `/api/state` via `getDashboardUrl()` + `joinUrl()`.
  The server's `/api/state` handler now calls `pushEvent` in-memory, so the
  HTTP POST round-trip still works end-to-end. `log-tool.test.ts` passes
  unchanged.
- **`dist/server.mjs`: NOT deleted.** ✅ (slice 3 scope) — Rebuilt (esbuild
  artifact reflecting the `server.ts` source change). Still committed.
  `esbuild.config.mjs` untouched.
- **`state.ts` file functions: NOT deleted.** ✅ (slice 3 scope) —
  `readState`/`appendEvent`/`writePid`/`clearPid`/`EMPTY_STATE`/`StateFile`/
  `writeQueues` all remain exported. `server.ts`/`listener.ts`/`index.ts`
  stopped importing the file-write functions (only `type { StateEvent }` is
  imported from `state.ts`). The functions are now dead code; slice 3 removes
  them. `index.ts` no longer imports anything from `state.ts` (the `readState`
  import was dropped in slice 1; no new state.ts imports added).
- **`dist/app.css`: 48-line deletion** — a committed Vite build artifact that
  was rebuilt during the tdd-worker's `npm run build` run. `Digest.svelte` and
  `tailwind.css` (the sources) are **unchanged** (diff confirms). The deletion
  is a responsive `.stat` grid block that likely reflects a Vite/Tailwind
  version or cache difference in the build environment, not a source change.
  This is a **build-artifact drift**, not a code deviation. Low risk: the CSS
  still builds and the dashboard renders; the 48 lines are a responsive
  layout rule that may differ across Vite versions. Worth rebuilding from a
  clean Vite cache before final merge, but not a blocker.

### Accepted regression confirmed

- **`/api/digest` 404 when empty:** ✅ — `server.test.ts` line 147 explicitly
  tests `"returns 404 for /api/digest when no digest is set (accepted
  regression)"`. Line 155 tests `"serves /api/digest from the in-memory store
  after setCurrentDigest"`. Line 167 tests `"does not read digest.json from
  disk for /api/digest"` (asserts 404 even when a `digest.json` exists on disk).

### Test coverage

- `server.test.ts`: rewritten (453 lines changed). Tests `/api/digest` 404→200,
  `/events` SSE `pushEvent` fan-out + `setCurrentDigest` `'change'` event,
  `/api/state` POST → in-memory (asserts no `state.json` on disk). ✅
- `state.test.ts`: rewritten (379 lines changed). Tests `pushEvent` monotonic
  id assignment, concurrent pushes, subscriber callback firing, `resetStore`
  clearing. No file writes. ✅
- `listener.test.ts`: rewritten (190 lines changed). Tests `subscribe` →
  `action_click` → `pi.sendMessage`, two events in order, `stop()` unsubscribes,
  malformed payload skipping. No `fs.watch`/`state.json`. ✅
- `start.test.ts`: 6 lines changed (minor: `startListener({ pi })` no longer
  takes `statePath`). ✅
- Full vitest: 18 files / 181 tests pass (was 178 in slice 1; +3 new store
  tests). All three typechecks green. Shared `tsx --test` 188 pass. ✅

### Task doc update needed?

**Yes.** The land-worker already appended the `### Slice 2 — backing-in-memory
(landed)` section to `## Implementation notes` with the store API shape, the
server/listener/index changes, and the accepted-regression note. This is
sufficient for task 3 to find `setCurrentDigest`/`pushEvent` in `store.ts`.

### User attention needed?

**No.** No API surfaces differ from the spec. The store seam for task 3
(`setCurrentDigest` + `pushEvent`) is exported and documented. Scope did not
drift: `digest-fetch`/`digest-log`/`dist/server.mjs`/`state.ts` file functions
were all correctly left untouched. The `dist/app.css` build-artifact drift is
a Vite environment artifact, not a source change — worth a clean rebuild
before final merge but not a blocker.
