---
kind: slice
slug: svelte-dashboard-client
title: Build the Digest.svelte SPA (render + actions[] buttons + currentlyWorkingOn + click→POST /api/state)
task: ../task.md
mode: afk
size: l
blocked_by: [sub-package-skeleton]
---

## End-to-end behavior

The Svelte SPA renders `~/.pi/aura/digest.json` (via `/api/digest`) as the
digest sections + an action button per `actions[]` entry; clicking a button
POSTs an `action_click` event to `/api/state`; `followup.currentlyWorkingOn`
shows a spinner + "continue in pi" tooltip on the matching button and
disables the others; the SPA re-renders on SSE change-notify.

## Acceptance criteria

- `Digest.svelte` — fetches `/api/digest`, renders: summary, attention (overdue/waiting/notifications), queue table, capacity, reviews, reviews-owed, corrections, warnings, and an **actions list** — one button per `actions[]` entry using `action.label`.
- On button click: `fetch("/api/state", { method:"POST", body: JSON.stringify({ id, ts: Date.now(), dir:"page→agent", type:"action_click", payload: <the full action object from actions[]> }) })`.
- `followup.currentlyWorkingOn` (a string key like `"overdue/AURA-42"`): the button whose action matches `currentlyWorkingOn` shows a spinner + `title="continue in pi"`; all other action buttons `disabled`.
- `EventSource("/events")` — on a change notification, re-fetch `/api/digest` and re-render.
- `main.ts` — mounts `Digest.svelte` into `#app` (mirror pi-annotate's `main.ts`).
- `vite build` → `dist/app.js` (iife, Svelte runtime inlined) + `dist/app.css`; both committed.
- A `live/` fixture dir (or Vite proxy) serves a fixture `digest.json` for dev so `npm run live` renders without the server (mirror pi-annotate's `live/index.html`).
- Manual smoke: open the dev page with a fixture → table + buttons render; click → (fixture `/api/state` 200s) → no crash; set `currentlyWorkingOn` in the fixture → spinner + disabled.

## Test plan

- **Seams:** `Digest.svelte` is a pure-ish component over `digest` state — unit-test the render + the `currentlyWorkingOn` matching logic with `happy-dom` (mirror pi-annotate's `vitest.config.ts` + `happy-dom`).
- **Scenarios:** (a) fixture with 3 actions → 3 buttons with correct labels; (b) `currentlyWorkingOn:"overdue/AURA-42"` → that button spinner+tooltip, others disabled; (c) `actions: []` → "No actions" message; (d) click → `fetch` called with the `action_click` event envelope; (e) SSE notification → re-fetch.
- **Failure modes:** `/api/digest` 404/500 → show an error state, don't crash; malformed `actions[]` → skip bad entries with a console warning.
- **Edge cases:** `currentlyWorkingOn` set to a key with no matching action (stale) → no spinner, all enabled (graceful); very long `label` → truncate with ellipsis.

## Constraints and dependencies

- `blocked_by: [sub-package-skeleton]` (needs the Vite config + dir).
- Re-declare a browser-facing `DigestAction`/`DigestFollowup` subset in the sub-package (don't import `scripts/src/types.ts` into the Vite graph) — per the task note, settled in the arch spec.
- The `POST /api/state` endpoint is implemented in `dumb-file-server`; this slice can develop against a Vite dev proxy or fixture.
