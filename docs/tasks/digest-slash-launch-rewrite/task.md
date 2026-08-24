---
kind: task
type: feature
slug: digest-slash-launch-rewrite
title: Re-launch the digest as a slash-gated, tool-driven flow with zero idle context
map: aura-digest-slash-launch
status: ready
blocked_by: [digest-real-data-render-bug]
slices: [slash-command-and-tool-activation, digest-fetch-and-save-tools, skill-non-model-invokable-and-skill-injection, rewrite-skill-md-to-tool-flow, drop-register-command-keep-tool]
---

## User-visible outcome

A fresh pi session has **zero** digest footprint in the system prompt (no
`aura-digest` skill description, no `digest-dashboard-*` tool descriptions)
until the user runs `/digest`. That slash command activates the digest tools
+ injects the `aura-digest` skill into the agent context, which then runs the
flow via typed tools (no bash shell-outs): `digest-fetch` → augment →
`digest-save` → `digest-dashboard-start` → wait for clicks → act on one via
the `aura` skill → `ack` + clear → `digest-dashboard-stop` clean close. The
dashboard renders real data (the bug task fixed it).

## User story

As the user, I run `/digest` and only then does the digest machinery enter
the session — the skill loads, the tools activate, the dashboard starts, and
the agent waits for my clicks. In every other session, none of that is in
context. I never accidentally spawn a browser by idly mentioning "digest."

## Scope boundaries

- **In:** the `digest-dashboard` extension's `index.ts` (drop `registerCommand`
  → add the `/digest` command that activates tools + injects the skill; keep
  `registerTool` for start/stop but inactive by default); a new `digest-fetch`
  + `digest-save` tool (thin wrappers over `aura-digest.mjs`); the `aura-digest`
  SKILL.md frontmatter (`disable-model-invocation: true`) + body (rewrite the
  flow to call tools, not bash).
- **Out:** the `aura` skill. The server/listener/state.json/teardown mechanism
  (reused). The fetch *logic* (stays in `aura-digest.mjs`; the tool wraps it —
  D5). Refactoring fetch into `@pi-aura/shared` (deferred). Removing the `.mjs`
  CLI (kept as the impl the tool wraps). The SPA's render bug (bug task).
- **Don't break:** the click → POST → listener → pi.sendMessage → agent →
  ack+clear → hot-reload loop (reused as-is).

## Acceptance criteria

- `aura-digest` SKILL.md frontmatter has `disable-model-invocation: true`.
- The `digest-dashboard-start`/`-stop` tools are registered but **not active**
  in a fresh session (`pi.getActiveTools()` excludes them; their descriptions
  are not in the system prompt).
- A `/digest` extension command exists. Its handler: (a) `pi.setActiveTools`
  adds `digest-dashboard-start`, `digest-dashboard-stop`, `digest-fetch`,
  `digest-save`; (b) reads `skills/core/aura-digest/SKILL.md` from disk +
  `pi.sendMessage({ customType: "aura-digest-skill", content: <body>,
  display: false }, { triggerTurn: true })` injects it + triggers a turn.
- The agent, on receiving the injected skill, runs the flow via the tools
  (no `node .../aura-digest.mjs` bash commands in the skill prose).
- `digest-fetch` tool: `execute` calls `aura-digest.mjs fetch` (or imports its
  fetch function), returns `{ digest, report }` JSON + writes
  `~/.pi/aura/digest.json`; no temp-dir stdout parsing.
- `digest-save` tool: writes `last-digest.json` (thin wrapper over the `save`
  subcommand).
- `render`/`cleanup`/`diff`/`last` drop from the skill (the dashboard is the
  render; `diff`/`last` can stay as `.mjs` CLI-only if useful, not in the
  skill).
- Real-data e2e: `/digest` in a fresh session → dashboard renders real Aura
  data → a click reaches the agent → ack+clear → clean close.
- Existing 42 vitest tests stay green; new tests cover the tool activation +
  skill injection + the fetch/save tools.

## Existing abstractions to use

- `pi.setActiveTools` / `pi.getActiveTools` (extensions doc) — tool
  activation.
- `pi.sendMessage({ customType, content, display }, { triggerTurn })` —
  skill injection (extensions doc line 1381).
- `pi.registerCommand` — the `/digest` command.
- `aura-digest.mjs fetch`/`save` subcommands — the impl the tools wrap (D5
  thin wrapper).
- The landed `digest-dashboard` extension (server/listener/teardown) — reused.
- The `digest-actions-and-followup` `~/.pi/aura/digest.json` write — the
  `digest-fetch` tool ensures it still happens (the script already does it).

## Architecture / domain decisions

- Per the map's D1–D5: slash-gated, not model-invokable; tools inactive by
  default; `/digest` activates + injects; tool-ify fetch (thin wrapper); keep
  the `.mjs` as impl.
- The skill injection is the one runtime-uncertainty (map Fog): if
  `pi.sendMessage` + `triggerTurn` doesn't make the agent *execute* the
  injected SKILL.md, fall back to `pi.sendUserMessage("Run the aura-digest
  skill")` + keep the skill reachable via `/skill:`. The first slice verifies
  the mechanism.

## Slices

### 1. `slash-command-and-tool-activation` (m)
The `/digest` command + tool activation (setActiveTools) + skill injection
(sendMessage). Verify the mechanism end-to-end (the agent executes the
injected skill). Keep the existing command/tool temporarily so nothing
breaks during the transition.

### 2. `digest-fetch-and-save-tools` (m)
The `digest-fetch` + `digest-save` tools (thin wrappers over `aura-digest.mjs`
fetch/save). Typed returns. `digest-fetch` writes `~/.pi/aura/digest.json`.
Unit-test the tools with a fake `AuraClient`/fixture (no real Aura).

### 3. `skill-non-model-invokable-and-skill-injection` (s)
Set `disable-model-invocation: true` on the `aura-digest` SKILL.md frontmatter.
Confirm the skill is out of the system prompt in a fresh session (zero idle
context). Confirm the `/digest` injection still loads it.

### 4. `rewrite-skill-md-to-tool-flow` (m)
Rewrite the `aura-digest` SKILL.md body: drop the bash shell-outs; the flow
calls `digest-fetch` → augment → `digest-save` → `digest-dashboard-start` →
wait → act → `digest-dashboard-stop`. Keep the routing table + clean close +
ack/clear `node -e` one-liners (those are agent-side writes, not fetch).

### 5. `drop-register-command-keep-tool` (s)
Remove the old `/digest-dashboard` `registerCommand` (replaced by `/digest`).
Keep `registerTool` for start/stop (now inactive-by-default). Final e2e.

## Notes

- The feature is blocked-by the bug task (no point tool-ifying a dashboard
  that doesn't render).
- Slice 1 verifies the skill-injection mechanism early (the map's Fog) — if
  it fails, return to Wayfinder before building slices 2–5.

## Implementation notes

### Slice 1: slash-command-and-tool-activation (landed)

- `.pi/extensions/digest-dashboard/index.ts` (+40 lines): added the
  `/digest` extension command via `pi.registerCommand("digest", { handler })`,
  keeping the old `digest-dashboard` command temporarily for the transition
  (slice 5 removes it).
- `DIGEST_TOOLS` const (4 names: `digest-dashboard-start`,
  `digest-dashboard-stop`, `digest-fetch`, `digest-save`).
- `digestCommandHandler`: additively activates the 4 tools via
  `pi.setActiveTools([...new Set([...pi.getActiveTools(), ...DIGEST_TOOLS])])`,
  resolves `skills/core/aura-digest/SKILL.md` via the extension's module dir
  (`path.dirname(fileURLToPath(import.meta.url))` +
  `path.resolve(moduleDir, "../../../skills/core/aura-digest/SKILL.md")` —
  module dir, not sessionCwd, per the arch spec), then injects it via
  `pi.sendMessage({ customType: "aura-digest-skill", content: skillBody, display: false }, { triggerTurn: true })`.
  Path-failure errors are reported via `ctx.ui.notify(..., "error")`.
- `session_start` filter: `pi.getActiveTools().filter(n => !DIGEST_TOOLS.includes(n))`
  then `setActiveTools` — the digest tools are inactive by default in a fresh
  session.
- `test/digest-dashboard/slash-command.test.ts` (189 lines, 6 new tests):
  handler activates the 4 tools; injects the skill content; `triggerTurn: true`;
  idempotent on double `/digest`; SKILL.md path resolution; error reporting on
  path failure.
- Verification: typecheck clean (`.pi/extensions/digest-dashboard && npm run
  typecheck`); full vitest suite green (49 tests / 8 files).
- Residual (owed hitl mechanism-check, NOT yet done): run `/digest` in a fresh
  pi session and confirm the agent actually receives the injected
  `aura-digest-skill` content and starts executing it via
  `sendMessage` + `triggerTurn`. This is the slice's core Fog question (does
  the injection make the agent *execute* the skill?) and remains the
  outstanding human-in-the-loop verification. The automated unit tests only
  assert that `sendMessage`/`setActiveTools` are *called* with the right
  arguments — they do not prove the runtime executes the injected turn. If
  it fails, the fallback is `pi.sendUserMessage("Run the aura-digest skill")`
  + keep the skill user-invokable via `/skill:`.
