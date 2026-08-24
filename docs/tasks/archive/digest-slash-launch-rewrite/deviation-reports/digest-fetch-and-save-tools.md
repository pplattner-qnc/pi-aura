## Deviation report — digest-fetch-and-save-tools

### API surface changes
- **Planned:** `pi.registerTool("digest-fetch", …)` returning `AgentToolResult` with `content: [{type:"text", text: JSON.stringify({digest, report})}], details: {dir}`; `pi.registerTool("digest-save", …)` taking a required string `dir` param, spawning `aura-digest.mjs save <dir>`, returning a short confirmation.
- **Actual:** Both tools registered exactly as specified. `digest-fetch` spawns `node <aura-digest.mjs> fetch`, parses the `output directory: <tmpdir>/` line from stdout, reads `<dir>/digest.json` + `<dir>/report.json`, returns both as a single JSON text content, and confirms `~/.pi/aura/digest.json` exists (error result if not). `digest-save` takes the required `dir` param, spawns `save <dir>`, returns a confirmation string. The return shapes match the confirmed user decisions (Q1: both in one JSON text + dir in details; Q2: required `dir` param).
- **Impact:** None on dependent slices. L4 (`rewrite-skill-md-to-tool-flow`) calls `digest-fetch` then `digest-save` by these exact names and shapes.

### Abstraction usage
- Used/was specified: **yes.** `spawn` from `node:child_process` (already imported in `index.ts`) wraps the `.mjs` via a `runAuraDigest` helper. The script path is resolved module-dir relative (`path.resolve(moduleDir, "../../../skills/core/aura-digest/dist/aura-digest.mjs")`), consistent with L1's path pattern. No fetch logic was ported into the tool — it stays in the `.mjs` (D5 thin wrapper). `Type` from `typebox` (already imported) defines the parameter schemas. `promptSnippet`/`promptGuidelines` correctly omitted on both new tools (per the arch spec's lazy-loading guidance); they appear only on the existing `digest-dashboard-start` tool.

### Out-of-scope changes
- **None.** All out-of-scope files verified unchanged via `git diff --quiet`:
  - `.pi/extensions/digest-dashboard/Digest.svelte` — UNCHANGED
  - `.pi/extensions/digest-dashboard/server.ts` — UNCHANGED
  - `.pi/extensions/digest-dashboard/listener.ts` — UNCHANGED
  - `.pi/extensions/digest-dashboard/state.ts` — UNCHANGED
  - `skills/core/aura-digest/SKILL.md` — UNCHANGED
  - `skills/core/aura-digest/dist/aura-digest.mjs` — UNCHANGED
  - `scripts/src/aura-digest.ts` — UNCHANGED
- The only files changed are `index.ts` (the two new `registerTool` calls + `runAuraDigest`/`resolveAuraDigestScriptPath` helpers + parameter schemas), the new test file `test/digest-dashboard/fetch-save-tools.test.ts`, and `test/digest-dashboard/start.test.ts` (test maintenance — see below).

### Test maintenance in a foreign test file
- `test/digest-dashboard/start.test.ts` asserted `registerToolCalls` had length `1`. This slice registers two additional tools, so that assertion broke. The fix: select the `digest-dashboard-start` tool by name (`find(call => call.name === "digest-dashboard-start")`) instead of by index `0`. This is correct test maintenance for an intended registration-order change, not a code fix or scope creep.

### Minor type divergence (not an API-surface deviation)
- The TDD result noted the return type is `AgentToolResult<{ dir?: string }>` (optional `dir`) rather than `{ dir: string }` (required). This is a TypeScript-typing relaxation on the error path only: error results return `details: {}` (no `dir`), success results return `details: { dir }`. The success contract — the one L4 depends on — is preserved. This is a reasonable, type-safe choice, not a deviation.

### TDD process note
- The TDD worker wrote all three acceptance-criterion tests together before implementing, then made them pass in a single GREEN cycle and committed once. Strict per-criterion RED→GREEN commits were not followed. This is a process deviation from the TDD rule but does not affect the correctness or the API surface of the delivered code.

### Divergence from acceptance criteria
- **All acceptance criteria satisfied:**
  1. `digest-fetch` registered with `execute` that spawns `aura-digest.mjs fetch`, parses output dir, reads `digest.json`/`report.json`, returns `{digest, report}` as content + `{dir}` in details, confirms dashboard file written — ✓
  2. `digest-save` registered with `execute` that spawns `save <dir>`, returns confirmation — ✓
  3. Both tools inactive by default (L1's `session_start` filter includes them in `DIGEST_TOOLS`) — ✓
  4. No bash shell-outs in skill prose (this slice only provides tools; SKILL.md unchanged) — ✓
  5. Unit-tested with a mocked `child_process.spawn` (not real Aura): 3 tests covering fetch success, fetch failure, save success — ✓

### Task doc update needed?
- **No.** The implementation matches the spec; no `## Implementation notes` append needed beyond what the land-worker will add.

### User attention needed?
- **No.** API surfaces match the confirmed decisions; the type relaxation (`dir?: string`) is an error-path-only TypeScript detail, not a behavioral deviation.
