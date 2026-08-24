# Architecture spec — digest-slash-launch-rewrite

> Status: DRAFT (awaiting user approval). Once approved, this is the shared
> contract every slice chain reads before implementing.

## Destination (from the map)

A fresh pi session has **zero** digest footprint in the system prompt (no
`aura-digest` skill description, no `digest-*`/`digest-dashboard-*` tool
descriptions) until the user runs `/digest`. That slash command activates the
digest tools + injects the `aura-digest` skill into the agent context, which
then drives the flow via typed tools (no bash shell-outs).

## Slice graph (linear chain — each level is one slice)

```
L1  slash-command-and-tool-activation        blocked_by: []
L2  digest-fetch-and-save-tools             blocked_by: [L1]
L3  skill-non-model-invokable-and-skill-injection  blocked_by: [L2]
L4  rewrite-skill-md-to-tool-flow            blocked_by: [L3]
L5  drop-register-command-keep-tool         blocked_by: [L4]
```

Five sequential slices, each its own dependency level. Slices run one chain
at a time (shared repo cwd); level N+1 starts only after level N landed.

---

## Existing abstractions to use (named, specific)

- **`pi.setActiveTools(names)` / `pi.getActiveTools()`** (extensions.md ~L1615)
  — additive activation. The `/digest` handler does
  `pi.setActiveTools([...new Set([...pi.getActiveTools(), ...DIGEST_TOOLS])])`.
- **`pi.sendMessage({ customType, content, display }, { triggerTurn: true })`**
  (extensions.md ~L1379) — injects the SKILL.md body into LLM context and
  triggers a turn. `deliverAs` defaults to `"steer"`; with `triggerTurn: true`
  an idle agent starts immediately.
- **`pi.registerCommand(name, { description, handler })`** (extensions.md ~L1484)
  — the `/digest` slash command.
- **`pi.registerTool({ name, label, description, parameters, execute })`**
  (extensions.md ~L1320) — `digest-fetch`, `digest-save`, and the existing
  `digest-dashboard-start`/`-stop`.
- **Inactive-by-default pattern** (extensions.md ~L2362 example): register all
  tools in the factory, then in `session_start` filter the digest tools OUT of
  the active set:
  ```ts
  const DIGEST_TOOLS = ["digest-dashboard-start", "digest-dashboard-stop", "digest-fetch", "digest-save"];
  pi.on("session_start", () => {
    const initial = pi.getActiveTools().filter((n) => !DIGEST_TOOLS.includes(n));
    pi.setActiveTools([...new Set([...initial])]);
  });
  ```
  This is the canonical dynamic-tool-loading pattern, inverted: the tools stay
  registered (so `getAllTools` sees them) but are removed from the active set
  until `/digest` adds them back.
- **`disable-model-invocation: true`** (skills.md L149) — SKILL.md frontmatter
  that hides the skill from the system prompt. Users must use `/skill:name`
  (still listed, harmless per D1).
- **`aura-digest.mjs fetch`/`save` subcommands** (scripts/src/aura-digest.ts
  ~L1147 dispatch) — the fetch/save impl the tools wrap (D5 thin wrapper).
  `fetch` prints `output directory: <tmpdir>/` to stdout + writes
  `~/.pi/aura/digest.json`; `save <dir>` writes `last-digest.json`.
- **`spawn`/`execFile` from `node:child_process`** — how the `digest-fetch`/
  `digest-save` tools invoke the `.mjs` (matching the existing
  `digest-dashboard` extension's `spawn` style in index.ts).
- **`ExtensionContext` / `ExtensionCommandContext`** types from
  `@earendil-works/pi-coding-agent` (already imported in index.ts).
- **`Type` from `typebox`** (already imported in index.ts) — tool parameter schemas.

## Do NOT reimplement

- **The fetch logic.** It stays in `aura-digest.mjs`; the `digest-fetch` tool is
  a typed face over it (D5 thin wrapper). Do not port the AuraClient /
  MCP-over-HTTP / verification logic into the tool.
- **The dashboard server / listener / state.json / teardown.** They are reused
  as-is (the bug task just fixed the SPA render). Only `index.ts`'s command/tool
  registration + the `session_start` active-set management change.
- **The `aura` skill.** Unchanged — only routed into on a click.
- **The `node -e` ack/clear one-liners** in SKILL.md (agent-side writes to
  `state.json`/`digest.json`, not fetch). They stay verbatim.
- **The SPA's render / Digest.svelte.** The bug task fixed it; this feature
  does not touch it.

---

## Per-slice interface contract

### L1 — `slash-command-and-tool-activation` (size: m, hitl)

**Exports (planned public surface):**
- A `/digest` extension command in `index.ts`:
  `pi.registerCommand("digest", { handler })`.
- The handler: (a) `pi.setActiveTools([...new Set([...pi.getActiveTools(), ...DIGEST_TOOLS])])`
  where `DIGEST_TOOLS` is a module-level `const` (includes the not-yet-built
  `digest-fetch`/`digest-save` names — activating a not-yet-registered name is
  a no-op per docs, so this is safe during the transition); (b) read
  `skills/core/aura-digest/SKILL.md` from disk (resolve via the extension's
  module dir, NOT sessionCwd — the skill lives in the package, so
  `path.resolve(moduleDir, "../../../../skills/core/aura-digest/SKILL.md")`
  or a `SKILL_MD_PATH` constant); (c) `pi.sendMessage({ customType:
  "aura-digest-skill", content: <body>, display: false }, { triggerTurn: true })`.
- Keep the old `digest-dashboard` command temporarily (slice 5 removes it).

**Interface contract for dependents:** the `DIGEST_TOOLS` const + the
`/digest` command exist. L2 adds the `digest-fetch`/`digest-save` tool
registrations (already named in `DIGEST_TOOLS`). The skill-injection mechanism
is verified end-to-end this slice (the map's Fog): if `sendMessage` +
`triggerTurn` doesn't make the agent *execute* the injected SKILL.md, fall back
to `pi.sendUserMessage("Run the aura-digest skill")` + record the de-escalation.

**Test seam:** fake `pi` capturing `setActiveTools` + `sendMessage` calls.
Unit: handler → active set includes the 4 digest tools + `sendMessage` called
with the SKILL.md body + `triggerTurn: true`.

### L2 — `digest-fetch-and-save-tools` (size: m, afk)

**Exports:**
- `pi.registerTool("digest-fetch", …)` — `execute` spawns
  `node <skill>/dist/aura-digest.mjs fetch`, parses stdout for the
  `output directory: <tmpdir>/` line, reads `<tmpdir>/digest.json` +
  `<tmpdir>/report.json`, returns `AgentToolResult` with
  `{ content: [{type:"text", text: JSON.stringify({digest, report})}], details: {dir} }`.
  Confirms `~/.pi/aura/digest.json` exists (the script writes it).
- `pi.registerTool("digest-save", …)` — `execute` spawns
  `aura-digest.mjs save <dir>`, returns a short confirmation. Takes `dir` as a
  parameter (the `digest-fetch` result's `details.dir`).
- Both tools registered in the factory, inactive by default (the `session_start`
  filter from L1's pattern — L1 only adds the command; the `session_start`
  inactive-filter is added here or in L1; see "shared" below).

**Interface contract for dependents:** the two tools are callable by name and
return typed JSON. L4's SKILL.md rewrite calls `digest-fetch` then
`digest-save` instead of bash.

**Test seam:** mock `child_process.spawn` (or a fixture tmpdir the real `.mjs`
writes when given a stubbed AuraClient — prefer the spawn mock to avoid real
Aura). Unit: `digest-fetch` returns `{digest, report}` + writes the dashboard
file; `digest-save` writes `last-digest.json`; fetch failure → error result
(doesn't throw).

### L3 — `skill-non-model-invokable-and-skill-injection` (size: s, hitl)

**Exports:** one frontmatter line on `skills/core/aura-digest/SKILL.md`:
`disable-model-invocation: true`.

**Interface contract for dependents:** the skill is hidden from the system
prompt. L4 rewrites the body confident the description isn't idle context.

**Test seam:** hitl verification (fresh-session system-prompt inspection). No
unit test — it's a pi-runtime behavior.

### L4 — `rewrite-skill-md-to-tool-flow` (size: m, hitl)

**Exports:** the rewritten `aura-digest` SKILL.md body. Step 1 calls the
`digest-fetch` tool (returns `{digest, report}`); the orchestrator fills
`summary` + re-ranks `actions[]` from `report` (judgment, unchanged). Step 4
calls `digest-dashboard-start` (tool) + `digest-save` (tool). `render`/
`cleanup`/`diff`/`last` drop from the skill. The routing table, the
`node -e` ack/clear one-liners, the clean close, and the `aura`-skill handoff
stay.

**Interface contract for dependents:** the skill prose no longer contains
`node .../aura-digest.mjs` bash commands. L5 does the final e2e against this
prose.

**Test seam:** reader (the agent) follows it end-to-end against the landed
tools (hitl e2e). Plus a grep assertion: no `aura-digest.mjs` in the skill body.

### L5 — `drop-register-command-keep-tool` (size: s, hitl)

**Exports:** removal of `pi.registerCommand("digest-dashboard", …)` from
`index.ts`. `registerTool` for start/stop stays (inactive by default). `/digest`
is the sole slash entry.

**Interface contract:** none (terminal slice). Final real-data e2e: fresh
session → zero digest context → `/digest` → full flow → dashboard renders real
data → click → agent acts → ack+clear → clean close.

**Test seam:** verify `/digest-dashboard` is gone (not in slash listing);
`/digest` runs the full flow; zero idle context in a fresh session.

---

## Shared / cross-cutting decisions

- **`DIGEST_TOOLS` const** (module-level in `index.ts`):
  `["digest-dashboard-start", "digest-dashboard-stop", "digest-fetch", "digest-save"]`.
  Defined in L1 (the `/digest` handler needs it); L2's new tools are already
  named in it.
- **Inactive-by-default `session_start` filter:** added in L1 alongside the
  command (the `/digest` handler and the `session_start` filter reference the
  same `DIGEST_TOOLS` const, so they belong together). The existing
  `session_start` handler (currently only sets `sessionCwd`) gains the
  active-set filter.
- **SKILL.md path resolution:** the extension lives at
  `.pi/extensions/digest-dashboard/index.ts`; the skill lives at
  `skills/core/aura-digest/SKILL.md`. Resolve via the module dir
  (`path.resolve(moduleDir, "../../../../skills/core/aura-digest/SKILL.md")`)
  or a constant — NOT via `sessionCwd` (which is the user's project, not the
  package). L1 settles the exact path.
- **The `digest-fetch`/`digest-save` tools' `promptSnippet`/`promptGuidelines`:**
  omit them (per the dynamic-tool-loading doc, lazily-loaded tools should rely
  on `description` only, since `promptSnippet`/`promptGuidelines` rebuild the
  system prompt and can invalidate the prefix). They're inactive by default
  anyway, so no idle-context cost.
- **Build:** after any `index.ts` change, the extension is rebuilt by the
  existing `npm run build` (vite for the SPA + esbuild for `server.mjs`). The
  `index.ts` itself is loaded as TS by pi (no separate build for it). The
  `digest-fetch`/`digest-save` tools spawn the already-built
  `skills/core/aura-digest/dist/aura-digest.mjs`.

## Architecture notes for the chains

- **L1 is the mechanism-verify slice** (map Fog). The tdd-worker must confirm
  `sendMessage` + `triggerTurn` actually makes the agent *execute* the injected
  skill. If it doesn't, fall back per the slice doc + record it. Do not proceed
  to L2–L5 if the mechanism fails — return to Wayfinder.
- **L2 is afk** — the two tools are pure typed wrappers, fully unit-testable
  with a spawn mock. No hitl needed.
- **L3 is a one-liner + hitl verification** — fast.
- **L4 is hitl** — the skill prose rewrite is judgment work; the chain's
  ui-noter is advisory (no UI), the deviation-reporter checks the prose stays
  on-spec.
- **L5 is hitl** — final real-data e2e; the bug task's fix means the dashboard
  renders real data now.

## Confirmed decisions (user-approved 2026-08-24)

1. **`digest-fetch` return shape:** both `digest` + `report` in a single JSON
   text content; `dir` in `details`.
2. **`digest-save` parameter:** required string `dir` param = the fetch
   result's `details.dir`. Stateless.
3. **SKILL.md path:** module-dir relative —
   `path.resolve(moduleDir, "../../../../skills/core/aura-digest/SKILL.md")`.

Spec approved — per-slice TDD chains may run.
