## Deviation report — drop-register-command-keep-tool

### API surface changes

- **Planned:** Remove `pi.registerCommand("digest-dashboard", …)` from
  `index.ts`. Keep `registerTool` for `digest-dashboard-start`/`-stop`
  (registered, inactive by default). `/digest` is the sole slash entry. Final
  real-data e2e passes via the new flow.
- **Actual:** `pi.registerCommand("digest-dashboard", …)` is removed.
  `pi.registerCommand("digest", …)` is the sole slash command. The
  `registerTool` calls for `digest-dashboard-start`, `digest-fetch`, and
  `digest-save` remain (3 registered tools). The `session_start` inactive-by-
  default filter + `DIGEST_TOOLS` const are intact. `startDashboard` and
  `teardownDashboard` are kept (used by the `digest-dashboard-start` tool's
  `execute` callback and the `session_shutdown` handler).
- **Impact on dependent slices:** None — this is the terminal slice. No
  downstream consumers. The removal of the old command is the intended end
  state.

### Abstraction usage

- Used/was specified: **yes.** `pi.registerCommand("digest", …)` (the sole
  slash entry), `pi.registerTool` (start/fetch/save), `pi.setActiveTools`/
  `pi.getActiveTools` (the `session_start` inactive-by-default filter), and the
  `DIGEST_TOOLS` const are all reused from L1–L2 as-is. `teardownDashboard` is
  reused by `session_shutdown`. No new abstractions were introduced; the
  removal is a pure deletion of dead code.
- Dead code correctly removed (only the old command used these):
  - `parseSubcommand` (parsed `/digest-dashboard start|stop` args)
  - `stopHandler` wrapper (routed the old command's `stop` subcommand)
  - `startHandler` wrapper (routed the old command's `start` subcommand)
  - the module-level `extensionApi` closure binding (only `startHandler`
    needed it; the `registerTool` `execute` callbacks receive `pi` via the
    factory closure and `ctx` via the tool context)
- The already-running error message was updated from "Use
  `/digest-dashboard stop` first" to "Use the `digest-dashboard-stop` tool
  first" — a necessary fix since the referenced command no longer exists.

### Out-of-scope changes

- **None.** All out-of-scope files are unchanged in this slice's diff
  (verified via `git diff --quiet`):
  - `.pi/extensions/digest-dashboard/Digest.svelte` — UNCHANGED
  - `.pi/extensions/digest-dashboard/server.ts` — UNCHANGED
  - `.pi/extensions/digest-dashboard/listener.ts` — UNCHANGED
  - `.pi/extensions/digest-dashboard/state.ts` — UNCHANGED
  - `skills/core/aura-digest/SKILL.md` — UNCHANGED
  - `scripts/src/aura-digest.ts` — UNCHANGED
- The only files changed are `index.ts` (removal + error-message fix) and two
  test files (`slash-command.test.ts` added an "old command not registered"
  assertion; `teardown.test.ts` removed the `digest-dashboard command` describe
  block that exercised the now-deleted command handler).

### Missing `digest-dashboard-stop` tool — pre-existing, not introduced here

- **Finding:** The arch spec and SKILL.md (L4 rewrite) reference a
  `digest-dashboard-stop` **tool** (e.g. arch-spec L5 "keep `registerTool` for
  start/stop"; SKILL.md L222 "Stop the dashboard by calling the
  `digest-dashboard-stop` tool"; SKILL.md L262 the clean-close uses
  `digest-dashboard-stop`). `DIGEST_TOOLS` lists `"digest-dashboard-stop"`.
  However, `index.ts` registers only **three** tools: `digest-dashboard-start`,
  `digest-fetch`, `digest-save`. There is **no** `pi.registerTool("digest-
  dashboard-stop", …)` call. This is **pre-existing**: the original `main`
  also had no `digest-dashboard-stop` tool (only the `/digest-dashboard stop`
  slash subcommand, which called `teardownDashboard` directly). The feature
  task's L1 added `"digest-dashboard-stop"` to `DIGEST_TOOLS` (so `/digest`
  activates it) and L4's SKILL.md rewrite instructs the agent to call it — but
  no slice ever added the actual `registerTool`. Activating an unregistered
  tool name is a no-op (per extensions.md), so `setActiveTools` silently
  ignores it.
- **Severity:** Medium. The dashboard can still be stopped via
  `session_shutdown` (which calls `teardownDashboard`), but the SKILL.md
  clean-close instructs the agent to call a tool that doesn't exist — the
  agent will get an "unknown tool" error at clean-close time.
- **This is not a deviation of L5** — L5's scope was removing the old command
  and keeping the existing `registerTool` calls. The gap was inherited from
  the earlier slices' design (the map's D2 says "tools stay registered but
  inactive by default" and D4/D5 name `digest-dashboard-stop` as a tool, but
  no slice was tasked with *adding* it — the original code only had a slash
  subcommand). This should be flagged to the parent for the coherence-refactor
  or post-landing phase: either add a `digest-dashboard-stop` `registerTool`
  that calls `teardownDashboard`, or change the SKILL.md clean-close to use
  `session_shutdown` / the existing mechanism.

### Out-of-scope changes (none)

- Confirmed: no files outside the slice's scope were touched.

### Task doc update needed?

- **Yes.** Append to `## Implementation notes`:
  - L5 removed `registerCommand("digest-dashboard", …)` + dead helpers
    (`parseSubcommand`, `startHandler`, `stopHandler`, `extensionApi`).
    `/digest` is the sole slash entry.
  - **Pre-existing gap (not introduced by L5):** there is no
    `digest-dashboard-stop` `registerTool` — the SKILL.md clean-close
    references a tool that doesn't exist. The dashboard is stopped via
    `session_shutdown` → `teardownDashboard`. A `digest-dashboard-stop` tool
    should be added (or the SKILL.md clean-close adjusted) in a follow-up.
  - Owed hitl final e2e (fresh session → `/digest` → full flow → clean close)
    was not run by the automated chain.

### User attention needed?

- **Yes — for the `digest-dashboard-stop` tool gap.** The SKILL.md clean-close
  instructs the agent to call `digest-dashboard-stop`, but that tool was never
  registered (pre-existing, inherited from the original code's slash-subcommand
  design). This needs a follow-up fix: add the `registerTool` or adjust the
  skill prose. The L5 slice itself is correct (it removed the old command and
  kept the existing tools as specified).
