## Deviation report — 6-skill-reorder-and-notify

### API surface changes
- **Planned:** `skills/core/aura-digest/aura-digest.md` reordered: Step 1 → `digest-dashboard-start` (ready state), Step 2 → `digest-fetch` (streams tree), augment (agent calls `digest-log`), `digest-save`, clicks, teardown. `.pi/extensions/digest-dashboard/index.ts`: `digest-fetch`'s `execute` checks `server-url.json` at start; if absent, sets a flag; at run end, if flagged, calls `ctx.ui.notify("...", "warning")` + prepends a warning line to the result text. Fetch never fails on this.
- **Actual:** All delivered as specified. The skill doc is reordered: Step 1 is `digest-dashboard-start`, Step 2 is `digest-fetch`, Step 3 is Augment (with a new `digest-log` subsection), Step 4 is Save + wait for clicks. The pipeline ASCII diagram is rewritten to show dashboard-start → fetch → orchestrator → save. All cross-references (step numbers in "Scope and handoff", "Step 4 step 4") are updated consistently. `digest-fetch`'s `execute` gained a `ctx: ExtensionContext` parameter (new — wasn't on main before) and reads `readDashboardUrl()` at start to set `dashboardWasDown`; on the success path, if flagged, it calls `ctx.ui.notify("digest-fetch: dashboard was not running, no live tree shown", "warning")` and prepends `⚠️ digest-fetch: dashboard was not running, no live tree shown.\n` to the result text. The digest JSON and `details: { dir }` are still returned — the fetch succeeds regardless.
- **Impact:** None. Slice 6 is a terminal slice (no dependents). The `ctx: ExtensionContext` parameter addition to `digest-fetch`'s `execute` signature is the necessary mechanism for the specified `ctx.ui.notify` behavior — it doesn't change the tool's params schema or return shape, only adds an optional framework context parameter that Pi passes to all tool execute functions.

### Abstraction usage
- Used/was specified: **yes**
  - **`ctx.ui.notify`** (already used by `digestCommandHandler` at lines 337, 394): used — `ctx.ui.notify("...", "warning")` called on the success path when `dashboardWasDown`. ✅
  - **`startDashboard`'s idempotency**: preserved — no changes to `startDashboard` or its idempotency check ("Digest dashboard already running" message at line 261 is intact). ✅
  - **Existing `digest-fetch` `execute` shape**: preserved — the error paths (exitCode !== 0, no output dir match, no dashboard digest, catch) are unchanged; the warning logic is inserted only on the success path between digest read and return. ✅
  - **`readDashboardUrl()`** (local helper from slice 5, supervisor decision Option A): reused — `const dashboardWasDown = readDashboardUrl() === null` at line 463. ✅
  - Did NOT reimplement `startDashboard`: confirmed — zero diff to the `startDashboard` tool registration or its `execute` function. ✅
  - Did NOT reimplement the bundle: confirmed — `skills/core/aura-digest/dist/aura-digest.mjs` has zero diff on this branch. ✅
  - Did NOT reimplement the dashboard server: confirmed — `server.ts`, `state.ts`, `listener.ts`, `Digest.svelte`, `progressTree.ts` all have zero diff. ✅
  - Did NOT reimplement the digest render path: confirmed — no changes to any dashboard rendering code. ✅

### Out-of-scope changes
- **`ctx: ExtensionContext` parameter added to `digest-fetch`'s `execute` signature** — this is a necessary signature change to access `ctx.ui.notify`, which the arch spec explicitly calls for ("calls `ctx.ui.notify("...", "warning")`"). Not a deviation — it's the mechanism for the specified behavior. The parameter is framework-provided by Pi and doesn't change the tool's user-facing params schema.
- **Existing "digest-fetch tool" test updated to write `server-url.json`** — the pre-existing test (dashboard up scenario) was updated to write `server-url.json` so it doesn't trigger the new absent-dashboard warning. This is a necessary test adaptation to keep the existing test passing with the new warning logic, not scope widening.
- No other out-of-scope changes. The diff is exactly 3 files: `index.ts` (warning logic), `aura-digest.md` (skill reorder), `fetch-save-tools.test.ts` (2 new tests + 1 existing test adaptation).

### Divergence from slice doc acceptance criteria

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Skill doc Step 1 is `digest-dashboard-start`; the pipeline diagram + prose reflect dashboard-first → fetch-streams → augment (with `digest-log`) → save → clicks → teardown | ✅ Met | Step 1 is "Start the dashboard" (`digest-dashboard-start`). Step 2 is "Fetch" (`digest-fetch`). Step 3 is "Augment (orchestrator judgment, with `digest-log`)" — includes a new `digest-log` subsection. Step 4 is "Save, then wait for clicks". The pipeline ASCII diagram shows `digest-dashboard-start → digest-fetch → orchestrator → digest-save`. All prose and cross-references updated consistently (e.g. "Scope and handoff" references "Step 4 step 4" instead of "Step 3 step 5"). |
| 2 | `digest-dashboard-start` called when already running is still a no-op (existing idempotency preserved) | ✅ Met | No changes to `startDashboard` or its idempotency. Line 261: `"Digest dashboard already running. Use the digest-dashboard-stop tool first."` is intact. The skill doc explicitly says "If the dashboard is already running, it is a no-op — call it without worrying about double-starts." |
| 3 | A `/aura-digest` run with the dashboard down: fetch succeeds, digest written, and a single pi-TUI warning + result-text warning appear at the end (no per-event noise) | ✅ Met | Test "shows a single warning (notify + result text) when dashboard was not running" verifies: `result.details.dir` is returned (fetch succeeded), result text contains `"digest"` (digest written + returned), exactly 1 warning notify with `severity: "warning"` and message containing "dashboard was not running", result text contains "dashboard was not running". The `dashboardWasDown` flag is read once at start and evaluated once at the end — one-shot, not per-event. |
| 4 | A run with the dashboard up: no warning, tree streams live (E2E with 3+4) | ✅ Met (code+test) | Test "shows no warning when dashboard is running" verifies: 0 warning notifies, no warning text in result, JSON is clean and parseable (`parsed.digest` + `parsed.report` match fixtures). The E2E "tree streams live" part is manual/browser-qa per the test plan and is not automated — but the code path is correct: when `readDashboardUrl()` returns non-null, `dashboardWasDown` is false, no warning is emitted, and the bundle's progress events stream to the dashboard (slice 3's `onProgress` hook). |

### Critical confirmation: digest-fetch NEVER fails on dashboard-absent
The `dashboardWasDown` flag is checked **only on the success path** — after `runAuraDigest(["fetch"])` exits 0, after the output directory is parsed, after `digest.json` and `report.json` are read, and after the dashboard `digest.json` is confirmed present. The warning is prepended to the success text and `details: { dir }` is still returned. If the fetch itself fails (exitCode !== 0, no dir match, no dashboard digest, catch block), the warning is never reached — the error paths return early with failure text. The dashboard being absent does not cause any error path to fire. ✅ Confirmed: the fetch succeeds and writes the digest regardless of dashboard state.

### Task doc update needed?
**Yes.** The task doc's `## Implementation notes` section has no entry for slice 6. The following should be appended:

```
### slice: 6-skill-reorder-and-notify (landed)

- `skills/core/aura-digest/aura-digest.md` reordered: Step 1 → `digest-dashboard-start` (ready state, browser open), Step 2 → `digest-fetch` (streams live tree), Step 3 → Augment (orchestrator judgment, with `digest-log` per sub-step), Step 4 → `digest-save` + wait for clicks → teardown. Pipeline ASCII diagram and all cross-references updated.
- `.pi/extensions/digest-dashboard/index.ts`: `digest-fetch`'s `execute` gained a `ctx: ExtensionContext` parameter and a one-shot dashboard-absent warning: `dashboardWasDown = readDashboardUrl() === null` at start; on the success path, if flagged, calls `ctx.ui.notify("digest-fetch: dashboard was not running, no live tree shown", "warning")` and prepends a `⚠️` warning line to the result text. The fetch still succeeds — digest + report + `details.dir` are returned regardless.
- Reused `readDashboardUrl()` (local helper from slice 5, supervisor decision Option A) and the existing `ctx.ui.notify` pattern (lines 337, 394). `startDashboard` idempotency preserved (no changes). No reimplementation of `startDashboard`, the bundle, the dashboard server, or the digest render path.
- Tests: 205 pass across 20 files (was 203/20, +2 new tests in `fetch-save-tools.test.ts`: "shows a single warning when dashboard was not running" and "shows no warning when dashboard is running"). Existing "digest-fetch tool" test updated to write `server-url.json` (avoid false-triggering the warning). Typecheck clean (scripts + extension).
```

### User attention needed?
**No.** No scope changed, no API surfaces differ from the spec, and all 4 acceptance criteria are met. The `ctx: ExtensionContext` parameter addition is the necessary mechanism for the specified `ctx.ui.notify` behavior, not a scope change. The slice is `mode: hitl` — the skill-doc reorder + TUI notify benefit from a human check, but no deviation requires user attention before landing.

DEVIATION: CLEAN

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Slice 6 changes exactly 3 files (index.ts +21 lines, aura-digest.md skill reorder, fetch-save-tools.test.ts +127 lines) — all within the slice's specified scope. No changes to server.ts, state.ts, listener.ts, Digest.svelte, progressTree.ts, scheduler.ts, or the bundle (aura-digest.mjs). The ctx: ExtensionContext parameter is the necessary mechanism for the specd ctx.ui.notify behavior. The existing test adaptation (writing server-url.json) is necessary to keep the pre-existing test passing. No scope widening."
    }
  ],
  "changedFiles": [
    ".pi/extensions/digest-dashboard/index.ts",
    "skills/core/aura-digest/aura-digest.md",
    "test/digest-dashboard/fetch-save-tools.test.ts"
  ],
  "testsAddedOrUpdated": [
    "test/digest-dashboard/fetch-save-tools.test.ts (+2 new tests: 'shows a single warning when dashboard was not running', 'shows no warning when dashboard is running'; existing 'digest-fetch tool' test updated to write server-url.json)"
  ],
  "commandsRun": [
    {
      "command": "npx vitest run --config vitest.config.ts",
      "result": "passed",
      "summary": "205 tests pass across 20 files (was 203/20, +2 new tests)"
    },
    {
      "command": "cd scripts && npm run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit clean, no errors"
    },
    {
      "command": "cd .pi/extensions/digest-dashboard && npx tsc --noEmit",
      "result": "passed",
      "summary": "Extension typecheck clean (no TS6059 or other errors)"
    },
    {
      "command": "git diff --stat main..slice/6-skill-reorder-and-notify",
      "result": "passed",
      "summary": "3 files changed, +219/-28 lines. No out-of-scope source files."
    },
    {
      "command": "git diff main..slice/6-skill-reorder-and-notify -- .pi/extensions/digest-dashboard/server.ts .pi/extensions/digest-dashboard/state.ts .pi/extensions/digest-dashboard/listener.ts .pi/extensions/digest-dashboard/Digest.svelte .pi/extensions/digest-dashboard/progressTree.ts scripts/src/scheduler.ts",
      "result": "passed",
      "summary": "Zero diff — server.ts, state.ts, listener.ts, Digest.svelte, progressTree.ts, scheduler.ts all untouched (did NOT reimplement any specd abstraction)"
    },
    {
      "command": "git status --short",
      "result": "passed",
      "summary": "No slice-6 files staged; only pre-existing untracked files (extensions/aura-tasks.ts, aura-health.test.ts, proposed task dirs) unrelated to this slice"
    }
  ],
  "validationOutput": [
    "vitest: 20 files, 205 tests, all passed, 0 failed (was 203, +2 new)",
    "scripts typecheck: clean (tsc --noEmit, 0 errors)",
    "extension typecheck: clean (tsc --noEmit, 0 errors)",
    "server.ts/state.ts/listener.ts/Digest.svelte/progressTree.ts/scheduler.ts: zero diff (not reimplemented)",
    "startDashboard idempotency: preserved (line 261 'already running' message intact, no changes to startDashboard)",
    "digest-fetch NEVER fails on dashboard-absent: dashboardWasDown checked only on success path, digest + details.dir still returned",
    "skill doc Step 1 = digest-dashboard-start, Step 2 = digest-fetch, Step 3 = augment with digest-log, Step 4 = save + clicks (verified full diff)"
  ],
  "residualRisks": [
    "E2E 'tree streams live' (criterion 4 second half) is manual/browser-qa per the test plan — not automated. Code path is correct but unverified end-to-end.",
    "slice is mode: hitl — skill-doc reorder + TUI notify benefit from a human check per the slice doc"
  ],
  "noStagedFiles": true,
  "diffSummary": "Slice 6 reorders the aura-digest skill doc (Step 1 = digest-dashboard-start → Step 2 = digest-fetch → Step 3 = augment with digest-log → Step 4 = save + clicks → teardown) with updated pipeline diagram and cross-references, and adds a one-shot dashboard-absent warning to digest-fetch's execute (ctx.ui.notify('warning') + result-text prepend, flag read once at start, evaluated once at end, fetch never fails). 3 files, +219/-28 lines, 2 new tests.",
  "reviewFindings": [
    "no blockers — implementation faithfully matches the arch spec and slice doc; all 4 acceptance criteria met; no reimplementation of startDashboard/bundle/dashboard-server/digest-render-path; digest-fetch never fails on dashboard-absent"
  ],
  "manualNotes": "The ctx: ExtensionContext parameter added to digest-fetch's execute signature is the necessary mechanism for the specd ctx.ui.notify call — it is framework-provided by Pi and does not change the tool's user-facing params schema. The slice is mode: hitl, so a human check of the skill-doc reorder and the TUI notify behavior is recommended per the slice doc."
}
```
