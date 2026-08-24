## Deviation report — rewrite-skill-md-to-tool-flow

### API surface changes
- **Planned:** The `aura-digest` SKILL.md body rewritten so the flow calls typed tools (`digest-fetch` → augment → `digest-save` → `digest-dashboard-start` → wait for clicks → act via `aura` → `ack`+clear → `digest-dashboard-stop`). `render`/`cleanup`/`diff`/`last` subcommand sections dropped from the skill. The routing table, `node -e` ack/clear one-liners, clean close, and `aura`-skill handoff stay. Frontmatter untouched (L3 owns it). No bash shell-outs to `aura-digest.mjs` in the flow.
- **Actual:** All of the above implemented exactly as specified. Step 1 calls `digest-fetch` (returns `{digest, report}` text + `details.dir`). Step 2 (Augment) reads `report`, fills `summary` + re-ranks `actions[]`, writes corrected digest to `<dir>/digest.json`. Step 3 calls `digest-save` (passing `details.dir`) + `digest-dashboard-start` tool. Clean close calls `digest-dashboard-stop` tool. `render`/`cleanup`/`diff`/`last` subcommand sections are gone. The `### Diff against last digest` subsection survives but is rewritten to tell the orchestrator to compare against `~/.pi/aura/last-digest.json` manually (no `aura-digest.mjs diff` bash). The routing table, `node -e` ack/clear one-liners, clean close, and `aura`-skill handoff are all kept. Frontmatter is byte-for-byte identical to L3's version (`name`, `description`, `disable-model-invocation: true`).
- **Impact:** None on dependent slices. L5 (`drop-register-command-keep-tool`) does the final e2e against this prose; the prose is tool-complete and references no removed/old slash commands.

### Abstraction usage
- Used/was specified: **yes.** The skill calls the `digest-fetch`, `digest-save`, `digest-dashboard-start`, and `digest-dashboard-stop` tools by the exact names registered in L1/L2's `index.ts`. The `digest-fetch` return shape (`{digest, report}` JSON text + `details.dir`) matches L2's tool contract and the user-approved Q1/Q2 decisions. The `digest-save` tool's required `dir` parameter is passed `details.dir` from fetch — exactly as specified. The `node -e` one-liners (agent-side writes to `state.json`/`digest.json`) are kept verbatim — they are not fetch, so they correctly stay as bash.

### Out-of-scope changes
- **None.** Only 2 files changed: `skills/core/aura-digest/SKILL.md` (the body rewrite) and `test/digest-dashboard/skill-md-prose.test.ts` (new prose-verification test). No `index.ts`, `Digest.svelte`, `server.ts`, `listener.ts`, `state.ts`, or `scripts/src/` changes. No frontmatter changes.
- **Minor prose addition (not a scope change):** Step 2 now explicitly tells the orchestrator to use `<dir>/raw.json` (where `<dir>` is `details.dir` from `digest-fetch`) when it needs `getBoardBriefing` data for the summary. The old skill referenced `$OUT/raw.json`; this is a path-variable rename (forced by dropping `$OUT`), not new scope.
- **Step numbering shift (not a deviation):** The old skill had Steps 1–4 (Fetch → Augment → Render → Start dashboard). The new skill has Steps 1–3 (Fetch → Augment → Start dashboard), since Render dropped and the old Step 4 merged into Step 3. The content preserved from the old Step 4 (save, start, wait for clicks, act, ack/clear, clean close) is all present in the new Step 3 + Clean close subsection. This is the expected consolidation from dropping `render`.

### Frontmatter check
- **Not touched.** The frontmatter on the slice branch is byte-identical to the task branch (L3's landed version): `name: aura-digest`, the same `description:`, and `disable-model-invocation: true`. L3 owns the frontmatter; L4 correctly did not modify it. ✓

### Specific acceptance-criteria verification

| Criterion | Status | Evidence |
|---|---|---|
| Step 1 calls `digest-fetch` tool (no bash) | ✓ | `SKILL.md:71` — "Call the `digest-fetch` tool. It runs `aura-digest.mjs fetch` under the hood" — no `node .../aura-digest.mjs fetch` bash command in the body |
| Step 3 calls `digest-save` + `digest-dashboard-start` tools | ✓ | `SKILL.md:143-149` — item 1 calls `digest-save` with `dir` param; item 3 calls `digest-dashboard-start` tool |
| `render`/`cleanup`/`diff`/`last` dropped from skill | ✓ | No `## Render`, `## Cleanup`, `## Diff`, or `## Last` sections. No `node .../aura-digest.mjs (render|cleanup|diff|last)` bash commands. The `### Diff against last digest` subsection remains but is rewritten (manual compare, no bash). |
| Routing table kept | ✓ | `## Routing table` section at `SKILL.md:227` — content intact |
| `node -e` ack/clear one-liners kept | ✓ | Two `node -e` bash blocks at `SKILL.md:187` (set lock) + `SKILL.md:197` (ack + clear) — verbatim from the old skill |
| Clean close kept | ✓ | `### Clean close` section — calls `digest-dashboard-stop` tool (not the old `/digest-dashboard stop` slash) |
| `aura`-skill handoff kept | ✓ | `## Scope and handoff` at `SKILL.md:245` — "load the `aura` skill" + conventions list intact; Step 3 item 5 says "Load the `aura` skill" |
| No `$OUT` / `sed` plumbing | ✓ | `grep -c 'OUT=\|sed -n'` = 0 in the new body |
| No `/digest-dashboard` slash references | ✓ | `grep '/digest-dashboard'` = 0 in the new body (old slash replaced by tools) |

### Test coverage
- New `test/digest-dashboard/skill-md-prose.test.ts` (6 tests):
  1. No bash shell-outs to `aura-digest.mjs fetch/render/cleanup/save/diff/last` — passes.
  2. No `## Render`/`## Cleanup`/`## Diff`/`## Last` section headings — passes.
  3. No `$OUT` or `sed -n` plumbing — passes.
  4. Tool-driven flow present (`digest-fetch`, `digest-save`, `digest-dashboard-start`, `digest-dashboard-stop`, augment/re-rank) — passes.
  5. Routing table kept — passes.
  6. `node -e` ack/clear one-liners kept — passes.
- Full vitest suite: **58/58 tests across 10 files** — all passing.
- Extension typecheck: clean.

### Task doc update needed?
No. The slice's `## Implementation notes` (appended by the land-worker) should record that the Step numbering collapsed from 4 steps to 3 (Render dropped, old Step 4 merged into Step 3) and that the `### Diff against last digest` subsection was rewritten to a manual-compare instruction (no `aura-digest.mjs diff` bash). These are expected consequences of dropping `render`/`diff` from the skill, not deviations from the spec.

### User attention needed?
No. The API surface matches the arch spec exactly. No scope was added or removed. The only behavioral change a user would notice is that the flow is now tool-driven (by design). The owed hitl mechanism-check (run `/digest` in a fresh session, confirm the agent executes the injected skill) and the real-data e2e are L5's responsibility — this slice's prose + grep tests are green.
