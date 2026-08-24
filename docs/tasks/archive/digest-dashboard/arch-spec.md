# Architecture spec — digest-dashboard

> Status: **DRAFT — awaiting user approval**. No TDD until approved.
> Task: `docs/tasks/digest-dashboard/task.md`
> Slices (6, sequential): `sub-package-skeleton` → `svelte-dashboard-client` → `dumb-file-server` → `state-listener` → `teardown-subcommand` → `wire-extension-entry`.

## Goal of this spec

Fix the sub-package layout, the **two-output build** (browser bundle + server
bundle), the in-process vs detached split, the `state.json` schema, the
server's HTTP surface, the listener's forward contract, and each slice's
interface contract — so six sequential TDD chains land without re-discovering
decisions.

## The decisive structural decision (settled here)

**pi-annotate runs its server IN-PROCESS** (the extension imports `server.ts`
directly). Our grilling settled a **DETACHED** server (Q1 + Q1e:
`spawn({detached:true, stdio:'ignore'}) + unref()`, PID recorded in
`state.json`, survives session shutdown, explicit teardown). This forces a
split the reference repo doesn't have:

- **Server = detached, runnable.** Must be a standalone Node script the spawned
  `node` process can run. → build output **`dist/server.mjs`** (Node ESM,
  esbuild-bundled, `--platform=node`). The extension's `start` command runs
  `spawn(process.execPath, [<server.mjs abs path>], {detached:true,
  stdio:'ignore'})` + `child.unref()`.
- **Listener = in-process.** It needs the `pi` object (`pi.sendMessage`), so
  the extension imports `startListener` from `./listener.ts` directly (pi loads
  the extension's `.ts` via jiti, like pi-annotate). NOT detached.

So the build has **two outputs**:
1. `dist/app.js` (+ `dist/app.css`) — browser Svelte bundle (Vite lib/iife),
   inlined into the static shell the server serves.
2. `dist/server.mjs` — Node ESM server bundle (esbuild), the detached entry.

## Sub-package layout (mirror pi-annotate, with the second build output)

```
.pi/extensions/digest-dashboard/
├ package.json          # name: digest-dashboard-ext, private, type:module, pi.extensions:["./index.ts"], scripts: build (vite + esbuild), typecheck
├ tsconfig.json        # NodeNext, ES2022+DOM, strict, allowImportingTsExtensions, include **/*.ts, exclude node_modules+dist
├ vite.config.ts       # svelte() plugin; build.lib entry main.ts → iife "Digest" → dist/app.js; outDir dist; emptyOutDir:false; inlineDynamicImports:true
├ esbuild.config.mjs   # bundles server.ts → dist/server.mjs (platform=node, format=esm, bundle, external node:*, minify false)
├ index.ts             # EXTENSION ENTRY: registerCommand("digest-dashboard", {start,stop}) + optional registerTool; imports listener.ts (in-process); spawns server.mjs (detached)
├ server.ts            # the dumb file server (node:http): shell + /api/digest + SSE /events + POST /api/state. Bundled to dist/server.mjs.
�├ listener.ts         # fs.watch state.json → pi.sendMessage (in-process; imported by index.ts)
├ state.ts             # state.json schema + append/read/teardown helpers (shared by server.ts + listener.ts + index.ts)
├ main.ts              # Vite entry: mounts Digest.svelte into #app (browser bundle)
├ Digest.svelte        # the SPA component
├ digest-types.ts      # browser-facing DigestAction/DigestFollowup/Digest subset (re-declared, NOT imported from scripts/src/types.ts — keep Vite graph clean)
└ dist/                # committed build artifacts (selectively un-gitignored)
   ├ app.js            # committed (browser bundle)
   ├ app.css           # committed (browser bundle)
   └ server.mjs        # committed (server bundle — the detached entry)
```

Root `package.json` `pi.extensions` gains `"./.pi/extensions/digest-dashboard/index.ts"`.
`.gitignore` gains the selective un-ignore rule (mirror pi-annotate):
`dist/**` + `!.pi/extensions/digest-dashboard/dist/app.js` +
`!.pi/extensions/digest-dashboard/dist/app.css` +
`!.pi/extensions/digest-dashboard/dist/server.mjs`.

**devDependencies** (in the **root** `package.json` `devDependencies`, matching
pi-annotate's proven approach — Vite resolves them via walk-up from the
sub-package to the root `node_modules`): `svelte`,
`@sveltejs/vite-plugin-svelte`, `vite`, `esbuild`, `typescript`, `@types/node`.
The sub-package's own `package.json` has **no `dependencies`/`devDependencies`
field** (just `name`/`version`/`private`/`type`/`pi.extensions`/`scripts`), exactly
like pi-annotate's. The root is NOT an npm workspace for the sub-package (it's
not in `workspaces`); it's a marker `package.json`. **End users get only the
committed `dist/` — zero runtime npm deps.**

## Existing abstractions to use

- **`pi-annotate`** (`~/Projects/pi-annotate/.pi/extensions/pi-annotate/`):
  - `server.ts` — `startAnnotateServer({cwd, openBrowser, onSubmit})` →
    `{port, url, server, done}`; `node:http` on `127.0.0.1:0`; `openBrowser`
    (`xdg-open`/`open`/`start`, suppressible via env); `liveServers` set +
    `session_shutdown` cleanup. **Read before writing `server.ts`.** (Ours
    differs: no `onSubmit` callback; instead `POST /api/state` appends to
    `state.json`; + SSE `/events`; + `/api/digest`.)
  - `client.ts` — `htmlShell()` inlines `dist/app.js` + `dist/app.css` as
    strings into the served HTML. **Mirror this inlining** (read the committed
    bundle at serve time, inline into the shell).
  - `vite.config.ts` — lib/iife, `inlineDynamicImports`, `outDir dist`,
    `emptyOutDir:false`. **Mirror for `app.js`.**
  - `.gitignore` — `dist/**` + `!dist/app.js` + `!dist/app.css` pattern.
  - `index.ts` — `registerCommand` + `registerTool` shape, `session_start`/
    `session_shutdown` lifecycle.
- **`pi-impeccable`** (`pi-impeccable/extensions/impeccable.ts`): the managed
  background-listener pattern (`startPoll`/`killPoll`, `session_shutdown`
  cleanup, `pi.sendMessage({ triggerTurn })`). **Use as the listener-spawn
  template** (but ours is in-process `fs.watch`, not a spawned poller child).
- **`~/.pi/aura/digest.json`** — written by `digest-actions-and-followup`
  (`DASHBOARD_DIGEST_PATH`); the server serves it at `/api/digest`.
- **`@pi-aura/shared/*`** — NOT imported into the sub-package (keep the Vite +
  esbuild graphs clean); `digest-types.ts` re-declares the browser-facing
  subset.

## Do NOT reimplement

- Don't re-implement `buildActions`/`followup` (they live in `scripts/src/` —
  the server just reads `~/.pi/aura/digest.json`).
- Don't add a second detached process for the listener (it's in-process).
- Don't build a custom event/reply protocol (the grilling rejected the
  pi-impeccable poller shape; we use `fs.watch` + `pi.sendMessage`).
- Don't pull `scripts/src/types.ts` into the browser bundle (re-declare a
  browser-facing subset in `digest-types.ts`).

## `state.json` schema (settled here — shared by server + listener + index)

`~/.pi/aura/state.json` is an **append-only event log** (Q1c). Shape:

```ts
// digest-types.ts (shared by server.ts, listener.ts, index.ts)
export interface StateEvent {
  id: number;          // monotonic; Date.now() is fine (the listener dedupes by id)
  ts: string;          // ISO timestamp
  dir: "page→agent" | "agent→page";
  type: "action_click" | "ack" | "update_view";
  payload: ActionClickPayload | AckPayload | UpdateViewPayload;
}
export interface ActionClickPayload {
  section: string; key: string; action: string; label: string;
  instruction: string; aura_use_case: string;  // the full DigestAction
}
export interface AckPayload { event_id: number; status: "done" | "error"; }
export interface UpdateViewPayload { /* partial digest fields, e.g. followup */ }

// state.json also carries the server PID out-of-band (not an event):
// { pid: number, server_started: number, events: StateEvent[] }
export interface StateFile {
  pid: number | null;
  server_started: number | null;  // Date.now(), for PID-reuse guards
  events: StateEvent[];
}
```

Wait — the grilling (Q1c) said `state.json` is an **array of events**
(append-only), but Q1e says it **holds the PID**. Reconcile: `state.json` is a
single object `{ pid, server_started, events: StateEvent[] }` — the `events`
array is append-only; `pid`/`server_started` are set once at `start` and read by
`stop`/the listener. The `POST /api/state` endpoint appends to `events[]` (and
the server rewrites the whole file atomically: read `{pid, server_started,
events}`, push, write). The listener watches the file and reads `events` past
its cursor (by `id`).

`state.ts` owns the read/append/teardown helpers (`readState`, `appendEvent`,
`writePid`, `clearPid`), shared by `server.ts` (append on `POST /api/state`),
`listener.ts` (read past cursor), and `index.ts` (write PID at start, clear at
stop).

## Server HTTP surface (`server.ts`)

`startServer({ dashboardPath, statePath, openBrowser })` →
`{ port, url, server, done }` (mirror pi-annotate's shape; `dashboardPath` =
`~/.pi/aura/digest.json`, `statePath` = `~/.pi/aura/state.json`).

- `GET /` → the static shell HTML with `dist/app.js` + `dist/app.css`
  **inlined** (read at serve time from the committed bundle beside the server
  entry — the bundled `server.mjs` resolves `dist/app.js` via
  `path.dirname(fileURLToPath(import.meta.url))`).
- `GET /api/digest` → read `dashboardPath`, return JSON (404 if absent).
- `GET /events` → SSE: `fs.watch(dashboardPath)` → on change push
  `event: change\ndata: {}\n\n`; clean up watcher on close.
- `POST /api/state` → read body (a `StateEvent`), `appendEvent(statePath,
  event)` (atomic read-modify-write of the `StateFile`); respond `{ ok: true }`.
- `openBrowser(url)` — `xdg-open`/`open`/`start` (suppressible via
  `PI_DIGEST_NO_BROWSER=1`).
- `done()` → close server + `fs.watch`.

The server prints its URL to **stdout** as a single JSON line
`{"url":"http://127.0.0.1:<port>/"}` so the spawning `index.ts` `start` can
read it before detaching (the parent reads stdout, captures the URL, then
the child detaches). Arch-spec decision: the parent reads the URL line from
the child's stdout in the brief window before `stdio:'ignore'` takes effect —
**NO**, `stdio:'ignore'` means no stdout capture. Instead: the server writes
its URL to a temp file (`~/.pi/aura/server-url.txt`) the parent reads after
spawn; OR the parent passes the port as an env var and the server binds it.
**Settled:** the parent passes `PORT=0` (random) is wrong (parent needs the
chosen port). **Cleanest:** the server writes
`~/.pi/aura/server-url.json` = `{"url":"...","pid":<self pid>}` immediately on
listen; the parent polls for that file briefly (e.g. 50ms × 100) to get the
URL, then opens the browser. (The listener's `fs.watch` could also observe it,
but the parent reading the file is simplest.) The `start` handler reads
`server-url.json`, opens the browser, and the server-url file is cleaned up at
teardown alongside `state.json`.

## Listener (`listener.ts`)

`startListener({ pi, statePath })` → `{ stop() }` (in-process; called by
`index.ts` on `start`).

- `fs.watch(statePath)` → on change, `readState(statePath)`, read `events`
  past the last-seen `id` cursor.
- For each new event with `dir:"page→agent"` and `type:"action_click"`:
  `pi.sendMessage({ customType:"aura-digest-event",
    content: event.payload.instruction, details: event.payload,
    triggerTurn:true, deliverAs:"steer" })`.
- Ignore `agent→page` events (those are for the page, not the agent).
- On `state.json` deletion (teardown signal): clean up the watcher, resolve
  `stop()`.
- On `fs.watch` error/replace (atomic write): re-open; cursor stays by `id`.
- Start cursor at the current max `id` (don't replay history on a mid-session
  start).

## Extension (`index.ts`)

`pi.registerCommand("digest-dashboard", { handler, getArgumentCompletions })`:
- `start` — `spawn(process.execPath, [server.mjs abs path], { detached:true,
  stdio:'ignore' })` + `child.unref()`; `writePid(statePath, child.pid)`; poll
  for `~/.pi/aura/server-url.json` → read URL → `openBrowser(url)`; call
  `startListener({ pi, statePath })` in-process; notify "Dashboard running at
  <url>".
- `stop` — read `pid` from `state.json`; `process.kill(pid)` (SIGTERM; SIGKILL
  fallback after timeout); `clearPid` + delete `state.json` + delete
  `server-url.json` (the listener observes `state.json` deletion and exits);
  notify.
- `session_shutdown` — if a PID is recorded, kill it + clean files (don't
  leak a detached server).
- Optional `pi.registerTool("digest-dashboard-start", …)` so the SKILL.md
  flow can start via a tool call — **settled: yes, add it** (the `skl-flow-rewrite`
  task needs the agent to start the dashboard programmatically).

`session_start` — store `ctx`/`cwd` for the listener.

## Slice interface contracts

### Slice 1 — `sub-package-skeleton` (m)
**Exports:** the dir + `package.json` + `tsconfig.json` + `vite.config.ts` +
`esbuild.config.mjs` + `.gitignore` entries + stub `index.ts` (registerCommand
with start/stop no-ops) + root `package.json` `pi.extensions` entry. `vite
build` → stub `dist/app.js`; `node esbuild.config.mjs` → stub `dist/server.mjs`.
**Contract for slice 2:** the build pipeline + dir exist.

### Slice 2 — `svelte-dashboard-client` (l)
**Exports:** `Digest.svelte` + `main.ts` + `digest-types.ts` (browser-facing
subset). `vite build` → committed `dist/app.js`+`dist/app.css`. Fetches
`/api/digest`, renders sections + action buttons from `actions[]`, handles
`followup.currentlyWorkingOn` (spinner + "continue in pi" tooltip + disabled
siblings), `POST /api/state` on click, `EventSource("/events")` re-render.
**Contract for slice 3:** the `dist/app.{js,css}` the server inlines.
**Test seam:** `Digest.svelte` over fixture digest (`happy-dom`/vitest, mirror
pi-annotate); dev via `live/` fixture or Vite proxy.

### Slice 3 — `dumb-file-server` (m)
**Exports:** `server.ts` `startServer({dashboardPath, statePath, openBrowser})`
+ `state.ts` (readState/appendEvent/writePid/clearPid). `esbuild` → committed
`dist/server.mjs`. Serves shell (inlining `dist/app.{js,css}`) + `/api/digest`
+ SSE `/events` + `POST /api/state`. Writes `server-url.json` on listen.
**Contract for slice 4:** the `state.json` schema + `state.ts` helpers.
**Test seam:** `startServer` with injected `browserOpener` + temp `HOME`; unit
test all four endpoints + SSE + append.

### Slice 4 — `state-listener` (m)
**Exports:** `listener.ts` `startListener({ pi, statePath })` → `{stop()}`.
`fs.watch` + cursor + `pi.sendMessage` forward. Exits on `state.json` deletion.
**Contract for slice 5:** the listener's delete-exit contract (teardown relies
on it).
**Test seam:** fake `pi` (capture `sendMessage`) + temp `state.json`.

### Slice 5 — `teardown-subcommand` (s)
**Exports:** `index.ts` `stop` handler + `session_shutdown` cleanup. Reads
PID, kills, clears files. Idempotent on missing/dead PID.
**Contract for slice 6:** the cleanup path exists to wire `start` against.
**Test seam:** temp `HOME` + spawned `sleep` child as fake PID.

### Slice 6 — `wire-extension-entry` (m)
**Exports:** `index.ts` `start` (spawn detached `server.mjs` + writePid +
poll server-url + openBrowser + startListener) + `pi.registerTool(
"digest-dashboard-start", …)`. End-to-end: `start` → page renders
`~/.pi/aura/digest.json`; click → `state.json` event → listener forwards;
`stop` cleans up.
**Contract for downstream (`skl-flow-rewrite`):** `/digest-dashboard start|stop`
commands + a `digest-dashboard-start` tool; `~/.pi/aura/digest.json` +
`state.json` + `server-url.json` are the runtime files.
**Test seam:** `start` with `openBrowser:false` + temp `HOME` + fixture
`digest.json`; assert PID alive + listener forwards a synthetic click.

## Decisions settled here (for the TDD workers)

1. **Two build outputs:** `dist/app.js`+`dist/app.css` (Vite lib/iife, browser)
   and `dist/server.mjs` (esbuild, Node ESM, detached entry). Both committed.
2. **Server detached; listener in-process.** The server is `spawn`ed; the
   listener is imported by `index.ts` (needs `pi`).
3. **`state.json` is a `StateFile` object** `{ pid, server_started, events:
   StateEvent[] }` — `events` is append-only, `pid` set once. (Reconciles Q1c's
   "append-only log" with Q1e's "holds the PID".)
4. **Browser-facing types re-declared** in `digest-types.ts` (no
   `scripts/src/types.ts` import into the Vite/esbuild graphs).
5. **Server URL handoff:** server writes `~/.pi/aura/server-url.json` on
   listen; `start` polls for it (50ms × up to 100) to get the URL before
   opening the browser. (Avoids `stdio:'ignore'` stdout capture.)
6. **`pi.registerTool("digest-dashboard-start", …)` IS added** (the
   `skl-flow-rewrite` task + the agent need to start the dashboard
   programmatically; not just the slash command).
7. **`openBrowser` suppressible** via `PI_DIGEST_NO_BROWSER=1` (for tests /
   headless, though Q8 assumes a browser).
8. **Build tooling devDeps live at the ROOT** `package.json` `devDependencies`
   (`svelte`, `vite`, `@sveltejs/vite-plugin-svelte`, `esbuild`, `typescript`,
   `@types/node`) — Vite resolves them via walk-up to root `node_modules` (mirror
   pi-annotate). The sub-package `package.json` has no deps field. End users get
   only the committed `dist/`.

## Out of scope (do not touch)

- `skl-flow-rewrite` (the SKILL.md choreography).
- `scripts/src/*` (the data half is done; the server just reads the file).
- The `aura` skill.
- The markdown render path.
