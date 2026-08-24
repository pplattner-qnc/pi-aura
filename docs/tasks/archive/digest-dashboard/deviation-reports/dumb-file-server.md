## Deviation report — dumb-file-server

### API surface changes

- **Planned (arch spec "Server HTTP surface"):** `startServer({ dashboardPath, statePath, openBrowser })` → `{ port, url, server, done }`.
- **Actual:** `startServer({ dashboardPath, statePath, serverUrlPath, openBrowser?, browserOpener? })` → `{ port, url, server, done }`. The implementation adds **`serverUrlPath`** as a required parameter and **`browserOpener`** as an optional injectable. This is a **superset** of the spec: the arch spec's "Server URL handoff" decision #5 says the server writes `~/.pi/aura/server-url.json` on listen — so `serverUrlPath` is the path to that file, made injectable for testing (the tests pass a temp-dir path). `browserOpener` is the test-injection seam the slice doc's test plan explicitly calls for ("injected `browserOpener`"). The arch spec's function signature omitted both, but they follow directly from decisions #5 and the test plan. **No impact on dependent slices** — slice 6 (`wire-extension-entry`) will pass `serverUrlPath` from the same `defaultAuraPaths()` helper the server already defines; the contract is compatible.
- **Planned (arch spec "state.json schema"):** `StateFile { pid, server_started, events: StateEvent[] }`; `StateEvent { id, ts, dir, type, payload: ActionClickPayload | AckPayload | UpdateViewPayload }`; helpers `readState`, `appendEvent`, `writePid`, `clearPid`.
- **Actual:** All types and helpers present in `state.ts` with exactly the planned shapes. `AckPayload { event_id, status: "done" | "error" }`, `UpdateViewPayload { [key: string]: unknown }`, `StateEvent` union payload, `StateFile` object — all match. `EMPTY_STATE` constant added (not in spec, harmless convenience). **No API surface deviation.**

### Abstraction usage

- Used/was specified: **yes**. `state.ts` is the shared schema + helpers module the arch spec specified (shared by `server.ts` + `listener.ts` [slice 4] + `index.ts` [slice 6]). `server.ts` imports `appendEvent` from `state.ts` and delegates the `POST /api/state` append to it — exactly per the arch spec's "`POST /api/state` → `appendEvent(statePath, event)`". The `htmlShell()` inlining of `dist/app.js` + `dist/app.css` mirrors pi-annotate's `client.ts`. The `openBrowser` (`xdg-open`/`open`/`start` + `PI_DIGEST_NO_BROWSER=1` suppression) mirrors pi-annotate. The `done()` closes server + watchers as specified.

### Out-of-scope changes

- **`listener.ts`:** NOT present (correct — slice 4). ✓
- **`index.ts` start/stop wiring:** NOT present (still the slice-1 stub `registerCommand` with `ctx.ui.notify("stub","info")`). No `spawn`, `kill`, `registerTool`, or `start`/`stop` subcommands. ✓ (Slice 5/6 implement those.)
- **`scripts/src/*`:** NOT modified by this slice. ✓
- **Self-start entry point:** `server.ts` has a bottom block that calls `startServer` with `defaultAuraPaths()` or env overrides when run directly (as `dist/server.mjs`). This is **in scope** — the arch spec says "`dist/server.mjs` — Node ESM server bundle, the detached entry", so the self-start when invoked directly is required for the detached spawn in slice 6. ✓

### Divergence from slice doc's acceptance criteria

- **`startServer({ cwd, openBrowser })` signature:** The slice doc says `startServer({ cwd, openBrowser })`, but the arch spec (which overrides the slice doc where they differ) says `startServer({ dashboardPath, statePath, openBrowser })`. The implementation uses `{ dashboardPath, statePath, serverUrlPath, openBrowser, browserOpener }` — a superset of the arch spec. The `cwd`-based signature in the slice doc was never reconciled with the arch spec's path-based approach; the implementation follows the arch spec (the higher-authority document) and adds `serverUrlPath` per decision #5. **Non-blocking; the arch spec governs.**
- **`POST /api/state` append:** The slice doc says "a JSON array; read-parse-append-write atomically". The arch spec says "`appendEvent` (atomic read-modify-write of the `StateFile`)". The implementation appends to `state.events[]` within the `StateFile` object (not a bare array), per the arch spec's `StateFile` schema. The append is serialized via a per-file promise queue (`writeQueues` Map + `enqueue`) so concurrent `POST /api/state` calls within the same process don't clobber. Tested with 10 concurrent POSTs → all 10 events preserved in order. ✓
- **`mkdirSync` dir first:** `state.ts` `ensureDir(filePath)` calls `mkdirSync(path.dirname(filePath), { recursive: true })` before every write. The server also `mkdirSync`s the `serverUrlPath` dir before writing `server-url.json`. ✓
- **`done()` closes server + `fs.watch`:** `done()` iterates `watchers[]` (closing all `FSWatcher` instances) then closes the HTTP server. ✓
- **`server-url.json` on listen:** Writes `{ url, pid: process.pid }` to `serverUrlPath` immediately on `listen` callback, before `openBrowser`. Matches decision #5. Also `console.log(url)` to stdout (harmless; the detached process has `stdio:'ignore'` so this goes nowhere, but it aids debugging when run in foreground). ✓
- **All test plan scenarios covered:** (a) `GET /` → `<div id="app">` + `<script>` + `<style>` ✓; (b) `GET /api/digest` → fixture JSON ✓; (c) `GET /events` → SSE `change` event on file touch ✓; (d) `POST /api/state` → `state.json` grows by one event ✓; (e) malformed JSON → 400 ✓; (f) concurrent appends serialized ✓; (g) `server-url.json` written ✓; (h) browser opener called when `openBrowser: true` ✓; (i) `pid`/`server_started` preserved across append ✓. Plus 5 `state.ts` helper tests. 24 total (9 Digest + 10 server + 5 state).

### `dist/server.mjs` rebuilt + committed?

- **Yes.** `dist/server.mjs` is rebuilt (8.3 KB, up from the 43-byte stub) and committed in the slice's commits (`git ls-files` confirms it's tracked). `dist/app.js` and `dist/app.css` unchanged (slice 2's bundles). ✓

### Task doc update needed?

**No.** No implementation notes need appending. The `serverUrlPath` parameter addition is a natural consequence of the arch spec's "Server URL handoff" decision #5 and doesn't change the interface contract for slice 4 (listener reads `state.json`, not `server-url.json`) or slice 6 (which passes `serverUrlPath` from `defaultAuraPaths()`).

### User attention needed?

**No.** The API surface (`startServer` + `state.ts` helpers + `StateFile`/`StateEvent` types) matches the arch spec. The `serverUrlPath` addition is a superset required by decision #5. No scope creep. All out-of-scope items correctly absent. No blockers.
