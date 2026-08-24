## Deviation report — slash-command-and-tool-activation

### API surface changes

- **Planned:** `pi.registerCommand("digest", { handler })` in `index.ts`; a
  module-level `DIGEST_TOOLS` const with 4 names
  (`digest-dashboard-start`, `digest-dashboard-stop`, `digest-fetch`,
  `digest-save`); the handler calls
  `pi.setActiveTools([...new Set([...pi.getActiveTools(), ...DIGEST_TOOLS])])`
  additively, then resolves `skills/core/aura-digest/SKILL.md` via the
  extension's module dir (not sessionCwd), then calls
  `pi.sendMessage({ customType: "aura-digest-skill", content: <body>, display: false }, { triggerTurn: true })`.
  A `session_start` handler removes `DIGEST_TOOLS` from the active set
  (inactive-by-default). The old `digest-dashboard` command is kept
  temporarily (slice 5 removes it).
- **Actual:** All planned surfaces are present and match exactly.
  - `DIGEST_TOOLS` (index.ts:290–295) — the 4 names in the correct order. ✓
  - `digestCommandHandler` (index.ts:297–321) — additive `setActiveTools`,
    module-dir path resolution, `sendMessage` with `customType:
    "aura-digest-skill"`, `display: false`, `triggerTurn: true`. ✓
  - `pi.registerCommand("digest", …)` (index.ts:380) — registered, with a
    handler that delegates to `digestCommandHandler`. ✓
  - `session_start` filter (index.ts:387–391) —
    `getActiveTools().filter(n => !DIGEST_TOOLS.includes(n))` then
    `setActiveTools`. ✓
  - Old `digest-dashboard` command (index.ts:366) — preserved. ✓
- **Impact:** None. The API surface is exactly as specified. Dependent slice
  L2 (`digest-fetch-and-save-tools`) can rely on the `DIGEST_TOOLS` const and
  the `registerCommand("digest")` being in place.

### Abstraction usage

- **Used/was specified: yes.** The implementation uses exactly the abstractions
  the arch spec named:
  - `pi.registerCommand` — ✓ (the `/digest` command)
  - `pi.setActiveTools` / `pi.getActiveTools` — ✓ (additive activation + the
    `session_start` inactive-by-default filter)
  - `pi.sendMessage({ customType, content, display }, { triggerTurn })` — ✓
  - Module-dir path resolution (`path.dirname(fileURLToPath(import.meta.url))`
    + `path.resolve(moduleDir, "../../../skills/core/aura-digest/SKILL.md")`)
    — ✓. The path was verified to resolve to
    `<repo>/skills/core/aura-digest/SKILL.md` and the file exists.
  - `ExtensionAPI`, `ExtensionCommandContext` types from
    `@earendil-works/pi-coding-agent` — ✓ (already imported).
  - `readFileSync` from `node:fs` — ✓ (already imported).
  - The inactive-by-default pattern (the inverted dynamic-tool-loading example
    from extensions.md ~L2362) — ✓, implemented in the `session_start` handler.

### Out-of-scope changes

- **None.** This slice's own commits (`273e6cb`, `61bc7b6`, `7c42e29`,
  `6057a31`) touch only:
  - `.pi/extensions/digest-dashboard/index.ts` (+40 lines)
  - `test/digest-dashboard/slash-command.test.ts` (+189 lines, new file)
- The branch also contains `Digest.svelte` + `dist/app.js` changes, but those
  belong to the already-landed bug task commits (`ddca947`, `7598872`,
  `746d33a`, `70ebc35`) below this slice's base. Confirmed:
  `git diff --stat 70ebc35..slice/slash-command-and-tool-activation` shows
  only `index.ts` + `slash-command.test.ts`.
- Did NOT touch: `Digest.svelte`, `server.ts`, `listener.ts`, `state.ts`,
  `aura-digest.mjs`, or any fetch logic. ✓

### Minor divergence from slice doc (not a deviation)

- The slice doc says "resolve relative to the repo root via the extension's
  cwd/sessionCwd" for the SKILL.md path. The arch spec (user-approved)
  overrides this: "resolve via the extension's module dir, NOT sessionCwd."
  The implementation follows the arch spec (module dir), which is the correct
  choice — `sessionCwd` is the user's project, not the package, and would fail
  when the user runs `/digest` from a different repo. This is a spec-vs-slice-doc
  reconciliation, not an implementation deviation.

### Task doc update needed?

- **No.** The slice is on-spec. No `## Implementation notes` update required
  for this slice. (L3 will add `disable-model-invocation: true` to the
  SKILL.md frontmatter; L2 will register the `digest-fetch`/`digest-save`
  tools — those are separate slices.)

### User attention needed?

- **No** for the API surface — it matches the approved spec exactly.
- **Yes (residual, not a deviation):** the owed **hitl mechanism-check** is
  not yet done. The slice doc requires: "in a real pi session, run `/digest`
  → confirm the agent receives the skill content + starts executing it." The
  prior tdd-worker run completed the unit tests and typecheck but stalled
  during finalization before performing this real-session verification. This
  is the map's Fog risk (does `sendMessage` + `triggerTurn` make the agent
  *execute* the injected skill?). It must be confirmed before proceeding to
  L2–L5; if it fails, the fallback is `pi.sendUserMessage("Run the
  aura-digest skill")` + keep the skill user-invokable via `/skill:`.
