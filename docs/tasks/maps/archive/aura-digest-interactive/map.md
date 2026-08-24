---
kind: map
slug: aura-digest-interactive
title: Make the Aura digest interactive — per-section action buttons that route back to the agent
status: done
tasks: "[{slug: aura-digest-interactive-grilling, blocked_by: [], done: true}, {slug: digest-actions-and-followup, blocked_by: [], done: true}, {slug: digest-dashboard, blocked_by: [digest-actions-and-followup], done: true}, {slug: skl-flow-rewrite, blocked_by: [digest-dashboard], done: true}]"
---

## Destination

The `aura-digest` skill stops being a one-way markdown dump and becomes an
**interactive surface**: after the digest data is gathered, it is rendered as
an **HTML page** (served locally by the agent, opened in the user's browser)
whose per-section "what's next" items are **action buttons**. Clicking a button
sends a concrete instruction back to the agent (per the back-channel the
grilling task settles — see Decisions). The agent then loads the `aura` skill
and acts on exactly that one item, reporting the outcome.

Concretely, done looks like:

- The user runs the digest (e.g. `/aura-digest` or `aura-digest.mjs ...`).
- The agent gathers the data as today (fetch → augment), then **opens an
  HTML page** in the browser showing the digest with an action bar / per-item
  buttons (e.g. *Advance AURA-42*, *Review plan v3*, *Flag 112% capacity*).
- The user clicks one. The chosen instruction is delivered to the agent.
- The agent loads the `aura` skill and executes just that action, then reports.
- A **per-section routing table** (overdue / waiting-on-you / reviews owed /
  over-commitment / corrections / warnings → concrete next action + the
  `aura` use case / capability to load) governs which button becomes which
  instruction and which capability the agent routes to.
- A **clean all-clear close** when nothing is actionable or the user declines
  all: a one-line verdict ("Nothing needs you right now — N tasks committed,
  capacity X%, no reviews owed.") and stop — no dangling prompt.

## Constraints

- **Aura only.** The Atlassian (Jira Teamwork Graph) and Bitbucket paths in
  the scripts are out of scope.
- **Don't break the existing markdown path.** The skill's current
  `render` → stdout/file markdown pipeline stays available (scripted use,
  non-interactive contexts). The interactive HTML is an **additive** render
  mode / delivery surface, not a replacement.
- **Zero runtime npm deps for end users.** Mirroring `pi-annotate`: any
  browser bundle (CSS/JS/Svelte) is **built and inlined** at build time; the
  published package ships no runtime browser deps. Build tooling
  (Vite/Svelte/Tailwind) lives in `devDependencies` only.
- **Back-channel is the settled decision.** The grilling task (below) picks
  the back-channel. Implementation tasks are blocked on it.
- **Scope discipline.** This map touches `aura-digest` only. No general Aura
  workflow changes, no changes to the `aura` skill itself beyond what routing
  into it needs.
- **No hidden plan.** If implementation exposes real uncertainty, stop the
  task with a discovery and return to Wayfinder.

## Decisions so far

All eight grilling questions settled (2026-08-24); see
`aura-digest-interactive-grilling/task.md` for the full Q&A.

- **Destination is interactive, not just better prose.** The "what's next"
  list becomes clickable buttons, not a static ranked list to read.
- **Per-section routing table is in** and lives **in `digest.json`** as an
  `actions: [...]` array (`{section, key, action, label, instruction,
  aura_use_case}`), computed by `aura-digest.ts`. Single source of truth; the
  browser renders buttons from it; the agent routes on the structured action.
- **Clean all-clear close is in.** Nothing-actionable / user-declined-all ends
  with a one-line verdict and stop.
- **`pi-annotate` is the architectural reference** for the local-server /
  inlined-bundle / zero-runtime-deps discipline (build-time inlining, no npm
  deps at serve time).
- **Q1 — back-channel: persistent, bidirectional, hot-reloading dashboard.**
  The render command spawns a **detached HTTP server** (Node
  `spawn({detached:true, stdio:'ignore'})` + `unref()`, PID recorded in
  `state.json`); the agent writes `~/.pi/aura/digest.json`; a `state.json`
  beside it is an **append-only bidirectional mailbox**
  (`{id,ts,dir,type,payload}` events — page writes clicks, agent writes
  acks/view-updates); a **pi extension** spawns a **background listener** that
  `fs.watch`es `state.json` and forwards `page→agent` events to the agent via
  `pi.sendMessage({ triggerTurn })`; a **teardown CLI subcommand** kills the
  PID, deletes `state.json`, and the listener observes the deletion and exits.
  Files live in **`~/.pi/aura/`** (beside `last-digest.json`).
- **Q1a — render model: client-side SPA + SSE change-notify + Svelte/Vite**
  (revised from server-side stamp). Dumb file server: static shell +
  `/api/digest` + SSE `/events` that `fs.watch`es `digest.json`; the Svelte
  app fetches + renders + re-renders on change; the agent only writes
  `digest.json`.
- **Q4 — HTML complexity: Svelte component built by Vite** (lib/iife, inlined
  into the static shell at build time); Svelte/Vite are `devDependencies`
  only; build artifacts (`dist/`) committed. Zero runtime deps for end users.
- **Q3 — render ownership: script writes `digest.json` only** (no HTML
  stamping); the browser owns rendering; the extension owns the dumb server +
  listener + teardown.
- **Q6 — instruction shape: structured payload** (the full action object from
  `actions[]`), not free text.
- **Q7 — one action at a time** with a `followup.currentlyWorkingOn` in-flight
  lock in `digest.json` (spinner on the clicked button + "continue in pi"
  tooltip + disabled siblings); cleared on `ack` + `update_view`.
- **Q8 — assume a browser is always available.** No no-browser fallback path.

## Fog

- The exact shape of `followup.currentlyWorkingOn` (a key/path string, e.g.
  `"overdue/AURA-42"`) is an implementation detail, not a grilling question —
  deferred to the `digest-actions-and-followup` task.
- **RESOLVED — where the Svelte/Vite client lives** (Wayfinder reassessment,
  2026-08-24): mirror `pi-annotate`'s layout. A new
  **`.pi/extensions/digest-dashboard/`** sub-package holds the Svelte client
  (`Digest.svelte`, `main.ts`) **and** the extension's Node code
  (`server.ts` dumb file server + SSE, `listener.ts` `fs.watch` + forward,
  `index.ts` tool/command/teardown) + its own `package.json`. A **root-level
  `vite.config.ts`** builds `main.ts` → `dist/app.js` (lib/iife, inlined into
  the static shell at build time; `dist/app.js` + `dist/app.css` committed,
  selectively un-gitignored like `pi-annotate`). The extension entry is added
  to the root `package.json` `pi.extensions` list. `svelte`/`vite`/
  `@sveltejs/vite-plugin-svelte` are `devDependencies` (root or the sub-pkg);
  end users get the pre-built bundle, zero runtime deps. This co-locates the
  browser client with its serving extension and matches the proven
  `pi-annotate` pattern. `digest-spa-client` and `digest-dashboard-extension`
  are therefore **co-developed in the same sub-package** (one feature task
  with two slice groups, or two tasks sharing the dir — settled at task
  creation below).

## Out of scope

- The Atlassian (Jira Teamwork Graph) and Bitbucket MCP / REST paths.
- Changes to the `aura` skill's content beyond what's needed to route into
  it from the digest's buttons.
- Auto-running actions without an explicit user click (the "auto-run safe
  actions" mode was considered and deferred — it mutates shared Aura state
  without per-action approval; out of scope for this map).
- Replacing the markdown render path (it stays for scripted/non-interactive
  use).
- A Windows-specific browser opener beyond the `xdg-open`/`open`/`start`
  fallback already used by `pi-annotate`.

## Task graph

1. `aura-digest-interactive-grilling` (grilling, **done**) — settled all
   eight questions.
2. `digest-actions-and-followup` (feature) — the **data half**: `aura-digest.ts`
   + `types.ts` compute the `actions[]` routing table + `followup.currentlyWorkingOn`
   and write `~/.pi/aura/digest.json` (the SPA's live data source). Lives in the
   existing `scripts/` esbuild workspace. `blocked_by: []`.
3. `digest-dashboard` (feature) — the **whole `.pi/extensions/digest-dashboard/`
   sub-package** (fog resolution merges the SPA client + the extension into one
   task, since they share the dir + Vite build): the Svelte component (Vite
   lib/iife → inlined `dist/app.js`), the dumb file server (static shell +
   `/api/digest` + SSE `/events`), the `state.json` `fs.watch` listener forwarding
   via `pi.sendMessage`, and the teardown subcommand. `blocked_by:
   [digest-actions-and-followup]` (consumes the `actions[]` schema).
4. `skl-flow-rewrite` (feature) — rewrite the `aura-digest` SKILL.md
   "after presenting" flow (write `digest.json` → start server + listener →
   open page → on click, load `aura` → act on one action → write `ack` + clear
   `currentlyWorkingOn` → report → clean all-clear close) + the routing-table
   reference + teardown subcommand. `blocked_by: [digest-dashboard]`.

Wayfinder wires `blocked_by` after all slugs exist; the order above is the
intended dependency chain. Slices come from the feature planning resource.
