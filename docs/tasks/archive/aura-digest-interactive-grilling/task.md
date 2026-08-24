---
kind: task
type: grilling
slug: aura-digest-interactive-grilling
title: Settle the aura-digest interactive back-channel and render model
map: aura-digest-interactive
status: done
blocked_by: []
slices: []
---

## Decision to settle

How does the `aura-digest` skill become an **interactive HTML surface** whose
per-section "what's next" items are action buttons that send a concrete
instruction back to the agent — and what are the coupled shape decisions
that implementation depends on?

This is a grilling task: the agent asks one question at a time and must not
answer on the user's behalf. The settled answers become the blockers for the
feature tasks spawned next.

## Parent decisions it depends on

From the `aura-digest-interactive` map (already settled):

- The destination is **interactive buttons**, not just better prose.
- A **per-section routing table** maps each digest section (overdue /
  waiting-on-you / reviews owed / over-commitment / corrections / warnings)
  to a concrete next action + the `aura` use case / capability.
- A **clean all-clear close** ends nothing-actionable / user-declined-all
  with a one-line verdict and stop.
- **`pi-annotate` is the architectural reference**: a pi extension registers
  a tool + command; the tool starts a local `node:http` server on
  127.0.0.1:0, serves an HTML shell with **inlined** CSS + compiled Svelte
  bundle (zero runtime deps for end users), the browser POSTs results back,
  and the tool's `execute` Promise resolves with structured data returned
  to the agent — a synchronous round-trip, no background poller.
- **`pi-impeccable` is the contrast case**: a background poller +
  `pi.sendMessage({ triggerTurn })` + a dedicated reply tool, purpose-built
  for a long-running loop. Likely overkill for the digest's short pick-an-
  action interaction — but the grilling confirms this.

## Choices already known (with a recommended starting answer each)

The grilling asks these in order. Each has a recommended starting answer
(informed by the `pi-annotate` reference and the digest's short, pick-once
shape) — but the user settles each.

### Q1 — Back-channel shape (the decisive fork) — SETTLED

**Decision (user, 2026-08-24):** a **persistent, bidirectional, hot-reloading
dashboard** — neither the pure synchronous round-trip nor the simple
pi-impeccable poller, but a file-based hybrid:

- **Page-source JSON** (the digest data) — the agent writes it; the HTML page
  renders from it.
- **Detached HTTP server** — the initial render command spawns it as a detached
  background process (PID recorded); it serves the HTML **with hot reload**, so
  when the agent edits the source JSON the page updates live.
- **`state.json`** — lives next to the page-source JSON; a **bidirectional
  mailbox**: the page writes click events to it; the agent writes acks to it;
  it also holds the detached server's PID.
- **A pi tool (extension)** runs a **background listener** on `state.json` and
  forwards change-events to the agent per a schema (page → agent direction).
- **Teardown CLI subcommand** — reads `state.json`, kills the PID, deletes
  `state.json`; the listener observes the deletion and exits.

**Rejected:**
- Synchronous single-shot round-trip (pi-annotate style) — too one-shot for a
  live dashboard the agent can push updates to.
- Plain pi-impeccable poller — one-way (page → agent only), no agent → page
  hot-reload, no bidirectional ack.

**Newly opened sub-decisions (grilled next):**

- **Q1a — Hot-reload / render model:** SETTLED (revised) — **client-side SPA
  + SSE change-notify + Svelte/Vite** (user, 2026-08-24; revised from
  server-side stamp after the user flagged SPA as simpler for the script/
  server boundary). The server is a **dumb file server**: it serves a static
  shell, serves `digest.json` at `/api/digest`, and exposes an SSE `/events`
  endpoint that announces "the JSON changed" (the server `fs.watch`es
  `digest.json`). The browser (a **Svelte component built by Vite**, lib/iife,
  inlined into the shell at build time — pi-annotate style, zero runtime deps
  for end users) fetches `digest.json`, renders the table + action buttons, and
  re-renders on SSE change-notify. The agent only ever writes `digest.json`.
  This supersedes the earlier server-side-stamp decision: no stamp function to
  share, no spawn-per-change.
- **Q1b — File locations & stability:** SETTLED — **`~/.pi/aura/`** (user,
  2026-08-24): `digest.json` (page-source JSON, agent writes) and `state.json`
  (bidirectional mailbox + server PID) live beside the existing
  `last-digest.json`. Findable by convention — teardown and listener just know
  the path; matches the digest's singleton (one user, one dashboard) nature.
- **Q1c — `state.json` schema / protocol:** SETTLED — **append-only event
  log** (user, 2026-08-24): `state.json` is an array of events
  `{id, ts, dir: "page→agent"|"agent→page", type, payload}` appended over the
  session; the listener tracks an offset and forwards new entries; teardown =
  kill PID + delete file. Robust session history; file grows (acceptable for a
  singleton session). The `payload` shape per `type` (e.g.
  `action_click: {section,key,action,instruction}`, `ack: {event_id,status}`,
  `update_view: {…partial digest…}`) is settled by Q6 below.
- **Q1d — Listener mechanics:** SETTLED — **`fs.watch` +
  `pi.sendMessage({ triggerTurn })`** (user, 2026-08-24). The extension spawns a
  managed background listener child (modeled on pi-impeccable's poller) that
  `fs.watch`es `~/.pi/aura/state.json`; on change it reads events past its
  cursor and calls `pi.sendMessage({ customType: "aura-digest-event",
  content: <action instruction>, triggerTurn: true })` to wake the agent. The
  agent acts and writes an `ack` event back to `state.json`. Rejected:
  long-running tool result (a tool resolves once, wrong for a persistent
  dashboard); polling is the fallback if `fs.watch` proves unreliable on the
  target FS.
- **Q1e — Detached-process management:** SETTLED — **Node
  `child_process.spawn(node, [server.mjs], { detached: true,
  stdio: 'ignore' })` + `child.unref()`** (user, 2026-08-24). The render command
  spawns the server detached and exits; the PID is recorded in `state.json`.
  Teardown reads the PID, `process.kill(pid)`, deletes `state.json`; the
  listener observes the deletion and exits. Cross-platform within Node, no
  shell quirks. Rejected: shell `nohup`/`&` (Windows-incompatible, escaping);
  self-daemonizing double-fork (most machinery, little gain).

### Q2 — Page lifecycle — SETTLED BY Q1

**Decision (implied by Q1, 2026-08-24):** the page is **persistent** — it
stays open across picks; the agent pushes hot-reload view updates; teardown
is an explicit CLI subcommand. The original "single-shot vs. persistent"
question is resolved by Q1's persistent-dashboard architecture. No
separate question needed.

### Q3 — Render ownership — SETTLED BY Q1a(SPA)

**Decision (implied by Q1a-SPA, 2026-08-24):** the **script**
(`aura-digest.mjs`) writes `~/.pi/aura/digest.json` only — it no longer stamps
HTML. The **browser** (Svelte component) owns rendering from `digest.json`.
The **extension** owns the dumb server (static shell + `/api/digest` + SSE
`/events`), the listener, and teardown. No stamp function to share between
script and server — the cleanest boundary. (The earlier in-process vs
pre-stamp question Q3b is moot under SPA.)

### Q4 — HTML complexity — SETTLED (revised by Q1a-SPA)

**Decision (revised, 2026-08-24):** **Svelte component built by Vite** (lib/iife,
inlined into the static shell at build time) — pi-annotate style, **zero
runtime deps for end users**. Svelte/Vite are `devDependencies` only. Chosen to
scale if the dashboard grows richer than a table+buttons. Build artifacts
(`dist/app.js` + `dist/app.css`) are committed. This revises the earlier
hand-written-vanilla-JS decision.

### Q5 — Routing table home — SETTLED

**Decision (user, 2026-08-24):** the routing table lives **in `digest.json`**.
`aura-digest.ts` computes an `actions: [...]` array — each entry
`{ section, key, action, label, instruction, aura_use_case }` — from the
existing attention / reviews / capacity / corrections / warnings data, and
the Svelte app renders buttons from it. Single source of truth = the script;
the browser and the agent share one shape. Rejected: hardcoded in the
Svelte component (duplicates script knowledge; new sections need a client
rebuild); SKILL.md-only (buttons need labels at render time, so the browser
still needs the table).

### Q6 — "Send to agent" instruction shape — SETTLED BY Q5

**Decision (implied by Q5, 2026-08-24):** **structured payload**. Each button
sends the full action object from `digest.json.actions[]` —
`{ section, key, action, label, instruction, aura_use_case }` — appended as a
`page→agent` event to `state.json` (per Q1c). The listener forwards it to the
agent, which loads the `aura` skill and acts on `aura_use_case`, using
`instruction` as the human-readable form. Robust to prose drift; the agent
routes on `action` / `aura_use_case`, not by re-parsing `instruction`. Rejected:
free-text instruction only (the agent would re-parse prose to route; Q5
already gives us the structured form for free).

### Q7 — Multi-pick / batch — SETTLED

**Decision (user, 2026-08-24):** **one action at a time**, enforced at the view
level via a `digest.json` in-flight lock. On click, the agent sets
`followup.currentlyWorkingOn` (a path/identifier of the in-progress item) in
`digest.json`; the hot-reload shows a **spinner on that button** with a
tooltip **"continue in pi"** and **disables the other action buttons**. When the
agent finishes (writes an `ack` + `update_view` event to `state.json` and
clears `currentlyWorkingOn`), the buttons re-enable. The append-only log still
records the whole session. Rejected: batch-then-execute (queue UI + Send
button + ordering + partial-failure handling — more machinery than this
cadence needs).

**Newly opened:** the exact shape of `followup.currentlyWorkingOn` (a key/path
string, e.g. `"overdue/AURA-42"` or `"reviews_owed/<artifact-id>"`) is an
implementation detail, not a grilling question — left to the feature task.

### Q8 — No-browser fallback — SETTLED

**Decision (user, 2026-08-24):** **assume a browser is always available.**
The interactive HTML page is the sole delivery surface; there is no
no-browser fallback path and no TUI-picker branch. This simplifies the
SKILL.md (one flow, no branch) at the cost of not working in pure print/
headless mode. Rejected: native TUI picker fallback (adds a second render/
pick path to maintain); static markdown fallback (loses interactivity).

## Downstream work the settled decisions unlock

All eight questions are settled. The architecture is: a **client-side Svelte
SPA** served by a **dumb file server** (static shell + `/api/digest` + SSE
`/events` that `fs.watch`es `digest.json`); the agent only writes
`~/.pi/aura/digest.json` (which now includes an `actions: [...]` routing
table); a **bidirectional append-only `state.json`** mailbox carries
`page→agent` click events and `agent→page` acks + view-updates; a **pi
extension** spawns the detached server (`spawn({detached:true,stdio:'ignore'})`
+ `unref()`, PID in `state.json`) and a **background listener** that
`fs.watch`es `state.json` and forwards clicks to the agent via
`pi.sendMessage({ triggerTurn })`; a **teardown CLI subcommand** kills the PID
and deletes `state.json` (the listener observes the deletion and exits);
execution is **one action at a time** with a `followup.currentlyWorkingOn`
in-flight lock (spinner + disabled siblings + "continue in pi" tooltip); a
browser is **always assumed available**.

This unlocks feature tasks (rough shape — final slices come from the feature
planning resource after Wayfinder spawns them):

- `digest-actions-and-followup` — `aura-digest.ts`: compute the `actions[]`
  routing table (section → {label, instruction, action, aura_use_case}) and
  the `followup.currentlyWorkingOn` field; write `~/.pi/aura/digest.json`
  (the SPA's data source). Extends the `Digest` type + `render`'s JSON output.
- `digest-dashboard-extension` — a new pi extension (or new tools on an
  existing extension) that: spawns the detached dumb server (shell +
  `/api/digest` + SSE `/events`), records the PID in `state.json`, starts the
  `state.json` `fs.watch` listener forwarding `page→agent` events via
  `pi.sendMessage`, and provides the teardown subcommand (kill PID + delete
  `state.json`).
- `digest-spa-client` — the Svelte component (Vite lib/iife, inlined into the
  static shell at build time; zero runtime deps for end users) that fetches
  `digest.json`, renders the table + action buttons from `actions[]`, handles
  the `currentlyWorkingOn` spinner/disabled state, and appends click events
  to `state.json`. Includes the Vite build wiring + committed `dist/`.
- `skl-flow-rewrite` — rewrite the `aura-digest` SKILL.md "after presenting"
  flow to: write `digest.json` → start server + listener → open page → on
  click, load `aura` → act on the one action → write `ack` + clear
  `currentlyWorkingOn` → report → clean all-clear close; document the
  per-section routing table and the teardown subcommand.

Dependencies: `digest-actions-and-followup` and `digest-spa-client` are the
data + view halves of the same surface (the SPA reads `actions[]` from
`digest.json`), so they share a `digest.json` schema decision; the extension
depends on both for an end-to-end test; the SKILL.md rewrite depends on all
three. Wayfinder wires `blocked_by` after the slugs exist.
