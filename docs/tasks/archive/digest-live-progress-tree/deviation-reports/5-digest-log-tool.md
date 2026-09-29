## Deviation report — 5-digest-log-tool

### API surface changes
- **Planned:** A `digest-log` pi tool registered in `.pi/extensions/digest-dashboard/index.ts` with params `{ message: string }`. It POSTs `{ dir: "agent→page", type: "agent_log", payload: { message } }` to `/api/state` of the running dashboard (URL from `~/.pi/aura/server-url.json`). If `server-url.json` is absent, returns `{ ok: true, message: "dashboard not running, log skipped" }` — never fails the agent's call.
- **Actual:** All delivered as specified. `pi.registerTool({ name: "digest-log", parameters: logToolParameters })` with `logToolParameters = Type.Object({ message: Type.String(...) })`. The `execute` function reads `server-url.json` via a local `readDashboardUrl()` helper; if null, returns `{ content: [{ type: "text", text: "digest-log: dashboard not running, log skipped" }] }` (never throws). If the URL is present, it POSTs `JSON.stringify({ id: 0, ts: ..., dir: "agent→page", type: "agent_log", payload: { message } })` to `joinUrl(dashboardUrl, "/api/state")`. POST failures are caught and return an ok result (best-effort, non-fatal). `digest-log` is added to the `DIGEST_TOOLS` array so `/aura-digest` activates it.
- **Impact:** No dependent-slice impact. Slice 6 (skill-reorder-and-notify) expects `digest-log` to be an activated tool — it is. Slice 4's log list consumes `agent_log` events from `state.json`; this tool produces them. The wire shape matches `AgentLogPayload` from slice 2.

### Abstraction usage
- Used/was specified: **yes**
  - **`pi.registerTool` pattern:** Used — follows the exact same registration shape as the other `digest-*` tools (`digest-fetch`, `digest-save`, `digest-dashboard-start`, `digest-dashboard-stop`): `name`, `label`, `description`, `promptSnippet`, `promptGuidelines`, `parameters` (TypeBox schema), `async execute(toolCallId, params, signal, onUpdate)`.
  - **`/api/state` POST:** Used — the tool POSTs to the existing `/api/state` endpoint. It constructs the `StateEvent` body itself (`{ id: 0, ts, dir, type, payload }`) and lets the server's `appendEvent` assign the real monotonic `id`.
  - **`AgentLogPayload` from slice 2:** The POST body's `type: "agent_log"` and `payload: { message }` match slice 2's `AgentLogPayload` shape. The tool doesn't import the type (it constructs the body inline), but the wire format is identical.
  - **Did NOT reimplement the POST handler:** Confirmed — `server.ts` has zero diff on this branch.
  - **Did NOT reimplement the SSE listener:** Confirmed — no `EventSource`, `fs.watch`, or `readState`/`writeState` in the diff.
  - **Did NOT reimplement `appendEvent`:** Confirmed — `state.ts` has zero diff on this branch.
  - **Did NOT reimplement `startDashboard` or the dashboard server:** Confirmed — only `index.ts` is changed in the extension (plus test files).

### Out-of-scope changes

- **`readDashboardUrl` duplicated locally in `index.ts`** — KNOWN + ACCEPTED (supervisor decision, Option A). The arch spec said "reuse `readDashboardUrl` from `scripts/src/progress-emitter.ts`," but importing across the `scripts/`↔`.pi/extensions/` project boundary breaks the extension's `tsc --noEmit` (TS6059: file outside `rootDir`). The helper is 8 trivial lines (`existsSync` + `readFileSync` + `JSON.parse` try/catch) with a comment noting it mirrors `progress-emitter.ts` by design. `index.ts` already reads `server-url.json` the same way at lines 136-138. This is accepted, not a deviation.

- **`slash-command.test.ts` updated from 4 to 5 digest tools** — KNOWN + SPECD. The slice doc calls for `digest-log` to be activated by `/aura-digest` (it's added to `DIGEST_TOOLS`). The test assertions were updated from `toHaveLength(4)` to `toHaveLength(5)` and `expect(activeTools).toContain("digest-log")` was added. This is an intended API change, not a deviation.

- **`joinUrl` helper added to `index.ts`** — a 3-line utility to safely join a base URL with a path. Trivial, no scope concern.

- **`id: 0` in the POST body** — the tool sends `id: 0` as a placeholder; the server's `appendEvent` overwrites it with the real monotonic id. This matches how the existing `digest-fetch` tool's progress events work (slice 3's emitter also sends `id: 0`). Not a deviation — it's the established wire convention.

### Divergence from slice doc acceptance criteria

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | `digest-log` is registered with params `{ message: string }` | ✅ Met | `pi.registerTool({ name: "digest-log", parameters: Type.Object({ message: Type.String(...) }) })`. Test: "is registered with params { message: string }" verifies the schema has a single string `message` field. |
| 2 | POSTs `{ dir: "agent→page", type: "agent_log", payload: { message } }` to `/api/state` | ✅ Met | The `execute` function POSTs `JSON.stringify({ id: 0, ts: ..., dir: "agent→page", type: "agent_log", payload: { message: params.message } })` to `joinUrl(dashboardUrl, "/api/state")`. Test: "POSTs an agent_log event to /api/state and returns ok when dashboard is up" verifies the URL, method, body fields, and payload message. |
| 3 | If `server-url.json` absent, returns `{ ok: true, message: "dashboard not running, log skipped" }` — never fails | ✅ Met | `readDashboardUrl()` returns null → returns `{ content: [{ type: "text", text: "digest-log: dashboard not running, log skipped" }] }`. Test: "returns ok, no throw, no fetch when server-url.json is absent" verifies zero fetch calls and the text contains "dashboard not running" and "skipped". Additionally, POST failures are caught (test: "never throws even if the POST fails (best-effort)"). |
| 4 | Agent can call it between augment sub-steps; line appears in dashboard log list | ✅ Met (by construction) | The tool POSTs `agent_log` events that slice 4's log list renders. No automated end-to-end test with slice 4 (the test plan lists it as manual/verified-with-slice-4), but the wire format matches `AgentLogPayload` exactly, and the concurrent-calls test confirms multiple messages each POST. |

### Residual risks
- The no-op path return text says `"digest-log: dashboard not running, log skipped"` rather than exactly `{ ok: true, message: "dashboard not running, log skipped" }` — the tool returns an `AgentToolResult` with `content` text, not a plain `{ ok, message }` object. This matches the return shape of all other `digest-*` tools (they all return `AgentToolResult` with `content` text), so it's the correct API shape for a pi tool, not a deviation.
- No automated end-to-end test with slice 4 (the test plan lists it as manual). The wire format is verified in isolation.
- `id: 0` placeholder relies on the server overwriting it — this is the established convention (slice 3's emitter does the same), but if the server ever stopped overwriting, events would collide on id 0.

### Task doc update needed?
**Yes.** The task doc's `## Implementation notes` section needs an entry for slice 5. The following should be appended:

```
### slice: 5-digest-log-tool (landed)

- New `digest-log` pi tool registered in `.pi/extensions/digest-dashboard/index.ts`: params `{ message: string }`; POSTs `{ dir: "agent→page", type: "agent_log", payload: { message } }` to `/api/state`. No-op (ok return, never throws) if `~/.pi/aura/server-url.json` is absent; POST failures are caught (best-effort). Added to `DIGEST_TOOLS` array so `/aura-digest` activates it.
- `readDashboardUrl` duplicated locally in `index.ts` (8 lines, mirrors `scripts/src/progress-emitter.ts` by design — cross-project import blocked by extension tsconfig `rootDir`). Supervisor decision: Option A.
- `joinUrl` helper added (3 lines, safe URL join).
- Tests: 203 pass across 20 files (was 198/19, +5 tests in 1 new file `log-tool.test.ts`). `slash-command.test.ts` updated from 4 to 5 digest tools. Extension typecheck clean, scripts typecheck clean.
```

### User attention needed?
**No.** No scope changed beyond the known+accepted `readDashboardUrl` duplication (supervisor decision) and the specd `DIGEST_TOOLS` update. All 4 acceptance criteria are met. The implementation faithfully follows the arch spec and slice doc.

DEVIATION: CLEAN

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Slice 5 adds only the digest-log tool registration + POST helper + readDashboardUrl duplicate + joinUrl helper + tests. No server.ts, state.ts, listener.ts, Digest.svelte, or progressTree.ts changes. No scheduler/scheduler.ts changes. The readDashboardUrl duplication is a known+accepted supervisor decision (Option A, cross-project import blocked by TS6059). The slash-command.test.ts 4→5 update is a known+specd API change. No scope widening."
    }
  ],
  "changedFiles": [
    ".pi/extensions/digest-dashboard/index.ts",
    "test/digest-dashboard/log-tool.test.ts",
    "test/digest-dashboard/slash-command.test.ts"
  ],
  "testsAddedOrUpdated": [
    "test/digest-dashboard/log-tool.test.ts (new, 222 lines, 5 tests: registration, POST-when-up, no-op-when-down, best-effort-on-failure, concurrent-calls)",
    "test/digest-dashboard/slash-command.test.ts (modified — 4→5 digest tools, added digest-log containment + count assertion)"
  ],
  "commandsRun": [
    {
      "command": "cd scripts && npm run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit clean, 0 errors"
    },
    {
      "command": "cd .pi/extensions/digest-dashboard && npx tsc --noEmit",
      "result": "passed",
      "summary": "Extension typecheck clean (readDashboardUrl local duplicate keeps rootDir valid)"
    },
    {
      "command": "npx vitest run --config vitest.config.ts",
      "result": "passed",
      "summary": "203 tests pass across 20 files (was 198/19, +5 tests, +1 new file)"
    },
    {
      "command": "git diff --name-only main..slice/5-digest-log-tool | grep -E 'server.ts|state.ts|listener.ts|Digest.svelte|progressTree'",
      "result": "passed",
      "summary": "Zero matches — no SSE/appendEvent/digest-render reimplementation"
    },
    {
      "command": "git diff main..slice/5-digest-log-tool -- .pi/extensions/digest-dashboard/index.ts | grep -E 'appendEvent|EventSource|fs.watch|readState|writeState'",
      "result": "passed",
      "summary": "Zero matches — no POST handler, SSE listener, or appendEvent reimplementation in index.ts"
    }
  ],
  "validationOutput": [
    "scripts typecheck: clean (tsc --noEmit, 0 errors)",
    "extension typecheck: clean (tsc --noEmit, 0 errors)",
    "vitest: 20 files, 203 tests, all passed, 0 failed",
    "server.ts/state.ts/listener.ts/Digest.svelte/progressTree.ts: zero diff (not reimplemented)",
    "index.ts: no appendEvent/EventSource/fs.watch/readState/writeState references (no reimplementation)",
    "digest-log registered with Type.Object({ message: Type.String }) — matches spec",
    "POST body: { dir: 'agent→page', type: 'agent_log', payload: { message } } — matches AgentLogPayload",
    "No-op path: returns 'digest-log: dashboard not running, log skipped', 0 fetch calls — never throws",
    "POST failure path: caught, returns ok — best-effort, non-fatal"
  ],
  "residualRisks": [
    "No automated end-to-end test with slice 4 (test plan lists as manual) — wire format verified in isolation",
    "id:0 placeholder relies on server appendEvent overwriting — established convention but a server change could cause id collisions"
  ],
  "noStagedFiles": true,
  "diffSummary": "Slice 5 adds a digest-log pi tool to index.ts (registerTool with { message: string } params, POSTs agent_log to /api/state, no-op + best-effort if dashboard down), a local readDashboardUrl duplicate (supervisor decision, 8 lines + comment), a joinUrl helper (3 lines), and 5 new tests in log-tool.test.ts. slash-command.test.ts updated from 4 to 5 digest tools. +317/-4 lines across 3 files. No server.ts/state.ts/listener.ts/Digest.svelte changes.",
  "reviewFindings": [
    "no blockers — all 4 acceptance criteria met, no reimplementation of POST handler/SSE/appendEvent, known+accepted readDashboardUrl duplication ratified, known+specd DIGEST_TOOLS update ratified"
  ],
  "manualNotes": "The readDashboardUrl duplication (Option A) was a supervisor decision made during the tdd-worker chain after the worker correctly identified that the arch spec's cross-project import instruction would break the extension typecheck. The slash-command.test.ts 4→5 update is an intended API change per the slice doc."
}
```
