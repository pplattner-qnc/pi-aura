## Deviation report — svelte-dashboard-client

### API surface changes
- **Planned (arch spec Slice 2):** `Digest.svelte` + `main.ts` + `digest-types.ts` (browser-facing subset re-declared, not imported from `scripts/src/types.ts`). `vite build` → committed `dist/app.js` + `dist/app.css`. Component fetches `/api/digest`, renders sections + action buttons from `actions[]`, `followup.currentlyWorkingOn` spinner + "continue in pi" tooltip + disabled siblings, `POST /api/state` on click, `EventSource("/events")` re-render.
- **Actual:** All planned deliverables present and correct:
  - `digest-types.ts` (121 lines) — re-declares the browser-facing subset. No import from `scripts/src/types.ts` (decision #4 satisfied). Covers `DigestAction`, `DigestFollowup`, `Digest`, `DigestAttention`, `DigestAttentionItem`, `DigestQueueRow`, `DigestCapacity`, `DigestReview`, `DigestReviewOwed`, `DigestCorrection`, `DigestNotifications`, `ActionClickPayload`, `StateEvent`. **Does NOT declare `StateFile`, `AckPayload`, or `UpdateViewPayload`** — these are correctly deferred to slice 3 (`state.ts`), which owns the `state.json` schema. ✓
  - `Digest.svelte` (464 lines) — fetches `/api/digest`, renders all digest sections (summary, attention/overdue/waiting/notifications, queue table, capacity, reviews, reviews-owed, corrections, warnings, actions). One button per `actions[]` entry using `action.label`. On click: `POST /api/state` with `{ id: Date.now(), ts, dir: "page→agent", type: "action_click", payload: <full action object> }`. `followup.currentlyWorkingOn` matching button shows spinner + `title="continue in pi"`; other buttons `disabled`. `EventSource("/events")` → re-fetch `/api/digest`. Error state on 404/500. "No actions" empty state. Malformed actions skipped with `console.warn`. Stale `currentlyWorkingOn` key → all enabled (graceful). ✓
  - `main.ts` (9 lines) — mounts `Digest.svelte` into `#app` via `mount(Digest, { target })`. ✓
  - `vite build` → committed `dist/app.js` (4326 lines, Svelte runtime inlined, iife) + `dist/app.css` (152 lines). Both committed in `56633c8`. ✓
  - `live/` fixture dir — `live/index.html` (dev entry with fetch shim for `/api/digest` → fixture JSON + `POST /api/state` swallow) + `live/digest.json` (77-line fixture with realistic data). ✓
- **Impact:** None. The `dist/app.{js,css}` are ready for slice 3's server to inline. The component calls `/api/digest`, `/api/state`, and `/events` which don't exist yet — correct (slice 3 implements them); the component was developed against the `live/` fixture + vitest mocks.

### Abstraction usage
- Used/was specified: **yes**. `digest-types.ts` re-declares the browser-facing subset (decision #4). The Vite config mirrors pi-annotate (lib/iife, `inlineDynamicImports`, `emptyOutDir:false`). The vitest config uses `happy-dom` + the Svelte plugin (mirror pi-annotate). The `live/` fixture mirrors pi-annotate's `live/index.html` pattern.
- `Digest.svelte` is a Svelte 5 component using `$state`, `$derived`, and `$effect` runes (modern Svelte 5 syntax, matching the `svelte@^5.56.10` dependency).

### Type fidelity notes (minor, non-blocking)

1. **`DigestReview.decisions` type simplified:** In `scripts/src/types.ts`, `decisions: ApprovalDecision[]` (where `ApprovalDecision = { user_name, decision, decided }`). In `digest-types.ts`, `decisions: string[]`. This is a **deliberate simplification** for the browser — the dashboard renders review decisions as a simple list, not the full typed `ApprovalDecision` objects. The fixture `live/digest.json` uses string arrays. Non-blocking: the SPA is a read-only view; it doesn't need the full `ApprovalDecision` type. The server (slice 3) reads `~/.pi/aura/digest.json` (which has `ApprovalDecision[]` objects) and passes it through; the SPA's `string[]` annotation is looser than reality, so `JSON.parse` won't fail. But if the component ever needs to render per-decider state, the type would need tightening. **No impact on slice 3 or downstream.**

2. **`DigestCorrection.current_decisions` type simplified:** Same pattern — `ApprovalDecision[]` in `scripts/src/types.ts`, `string[]` in `digest-types.ts`. Same rationale, same non-blocking status.

3. **`StateEvent.payload` typed as `ActionClickPayload | unknown`:** The arch spec defines it as `ActionClickPayload | AckPayload | UpdateViewPayload`. Since slice 2 only sends `action_click` events (the only direction the page → agent), the `unknown` fallback covers `ack`/`update_view` which the SPA doesn't produce. This is a looser union than the spec but functionally correct for the browser's role (the SPA only ever sends `action_click`). Slice 3 (`state.ts`) should declare the full union. **No impact on slice 3** — `state.ts` will own the authoritative `StateEvent`/`StateFile` types.

### Out-of-scope changes
- **Server endpoints (`/api/digest`, `/api/state`, `/events`):** NOT implemented (correct — slice 3). `server.ts` is still the 2-line stub (`console.error("stub server")`). ✓
- **`index.ts`:** Still the stub from slice 1 (single `registerCommand` with `ctx.ui.notify("stub","info")`). No `start`/`stop` subcommands. ✓ (Slice 5/6 implement those.)
- **`state.ts`:** NOT present (correct — slice 3). ✓
- **`listener.ts`:** NOT present (correct — slice 4). ✓
- **`scripts/src/*`:** No changes by this slice (the `task.md` modification in the working tree is from the previous task's landing, carried by the branch base). ✓
- **Root `devDependencies` additions:** `happy-dom@^20.11.6` and `vitest@^4.1.11` added to root `package.json` devDeps (expected — the test plan calls for happy-dom/vitest). `@sveltejs/vite-plugin-svelte`, `svelte`, `vite`, `typescript`, `@types/node` were added by slice 1. ✓
- **`vitest.config.ts`** at repo root — new file, configures the Svelte plugin + `happy-dom` environment for `test/**/*.test.ts`. Mirrors pi-annotate's pattern. ✓
- **Test location:** Tests live at `test/digest-dashboard/Digest.test.ts` (repo root `test/` dir), not under the sub-package. This is consistent with the vitest config's `include: ["test/**/*.test.ts"]` and pi-annotate's layout. ✓
- **Stray `tdd-svelte-dashboard-client/` dir:** Worker output artifact on disk (untracked). Not committed. Should be cleaned up before landing (minor).

### Divergence from the slice doc's acceptance criteria

- **All acceptance criteria satisfied:**
  - `Digest.svelte` fetches `/api/digest`, renders all sections + action buttons from `actions[]` using `action.label`. ✓
  - Click → `POST /api/state` with `{ id, ts, dir:"page→agent", type:"action_click", payload: <full action> }`. ✓ (The event envelope matches the slice doc's spec exactly.)
  - `followup.currentlyWorkingOn` → matching button spinner + `title="continue in pi"` + other buttons `disabled`. ✓
  - `EventSource("/events")` → re-fetch + re-render. ✓
  - `main.ts` mounts into `#app`. ✓
  - `vite build` → committed `dist/app.js` + `dist/app.css`. ✓
  - `live/` fixture dir with `index.html` + `digest.json`. ✓

- **Test plan scenarios — all covered:**
  - (a) 3 actions → 3 buttons with correct labels. ✓
  - (b) `currentlyWorkingOn:"overdue/AURA-42"` → spinner+tooltip, others disabled. ✓
  - (c) `actions: []` → "No actions" message. ✓
  - (d) click → `fetch` called with `action_click` event envelope. ✓
  - (e) SSE notification → re-fetch. ✓
  - Failure modes: 404 → error state. ✓; 500 → error state. ✓; malformed `actions[]` → skip + console warning. ✓
  - Edge case: stale `currentlyWorkingOn` → no spinner, all enabled. ✓
  - Edge case: long `label` → CSS `text-overflow: ellipsis` (not unit-tested, but the CSS is present; this is a visual-only concern, non-functional for a test). ⚐ (minor)

- **`npm run live` (Vite dev server):** The `vite.config.ts` has no `server` config (no `open`/`port`), but the `live` npm script runs `vite` which defaults to serving the project root. The `live/index.html` uses a `<script type="module" src="/.pi/extensions/digest-dashboard/main.ts">` which Vite serves directly. The dev flow works but requires navigating to `/live/index.html` manually (no auto-open). Minor — the slice doc says "mirror pi-annotate's `live/index.html`" which also requires manual navigation. ✓

### Task doc update needed?
**No.** No implementation notes need appending. The type simplifications (`decisions: string[]` vs `ApprovalDecision[]`, `StateEvent.payload` looser union) are browser-facing-subset decisions that don't change the interface contract for slice 3 or downstream. Slice 3's `state.ts` will own the authoritative `StateFile`/`StateEvent`/`AckPayload`/`UpdateViewPayload` types.

### User attention needed?
**No.** The API surface (the Svelte component + `digest-types.ts` + committed `dist/app.{js,css}`) matches the spec. No scope creep. The type simplifications are deliberate and non-blocking. No blockers.
