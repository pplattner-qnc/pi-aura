---
kind: task
type: feature
slug: adapt-blueprint-skills
title: First-pass pi-adaptation of the 14 engineering-foundation blueprint skills
map: engineering-foundation-sync
status: done
blocked_by:
- engineering-workflow-skill
- seed-engineering-mirror
slices:
- edge-fixes: done
- move-to-top-level: done
---

# First-pass pi-adaptation of the 14 blueprint skills

## Outcome

Produce the 14 pi-adapted, invokable pi skills at
`skills/engineering-workflow/<name>/SKILL.md`, adapted from the verbatim
blueprint sources at `skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md`
(deposited by `engineering-workflow-skill`). The adaptation makes each skill
work with the pi agent by rewriting Cursor-specific edges to pi idioms;
the substantive body is otherwise carried verbatim.

## Scope

### In scope

- One pi-adapted skill per blueprint skill (14 total), each at
  `skills/engineering-workflow/<name>/SKILL.md` with correct pi frontmatter
  (`name`, `description`).
- Adapt the Cursor-specific edges to pi idioms:
  - `AskQuestion` → pi's `ask_user_question` tool (note the 2–4 options
    constraint, the 16-char header limit, the "Type something." reserved row).
  - `SwitchMode` (Cursor plan/normal mode) → drop or replace with the pi
    equivalent if one exists (the agent works in normal mode; no plan-mode
    shim needed unless the skill relies on it — record the decision per
    skill).
  - `CreatePlan` → drop (pi has no plan-creation tool; the skill's plan
    output becomes a chat block).
  - `AGENTS.md` key lookups (`Merge target branch`, `Worktree root`,
    `Stack-token derivation`, `Test commands`, etc.) → keep the *concept*
    but note that the keys live in the target repo's `AGENTS.md` (which the
    anwalt.de repos have); the pi-adapted skill instructs the agent to read
    `AGENTS.md` rather than assume a pi-side register.
  - Keep the anwalt.de Jira/Bitbucket/`task`/worktree/`fork-db` assumptions
    (those MCPs are or will be installed); only the *tool-call shape* is
    adapted.
- The substantive body (workflow steps, quality bars, anti-patterns,
  checklists) is otherwise carried verbatim.
- Each adapted skill's `description` must make clear it targets the
  anwalt.de engineering workflow (so it's not invoked outside that context).

### Out of scope

- Rewriting the skills into pi-native equivalents (e.g. replacing the whole
  task lifecycle with pi's task-workflow). This is an edge-adaptation, not a
  port. A full port would spawn a new map.
- The 16 `.mdc` Cursor rules (that's `cursor-rules-incorporation`).
- The sync utility (that's `engineering-sync-skill`).

## Acceptance criteria

- 14 skills exist at `skills/engineering-workflow/<name>/SKILL.md`, each
  discoverable by pi (via `pi.skills: ["./skills"]` recursive discovery).
- Each adapted skill's frontmatter has `name` + `description`.
- No remaining `AskQuestion`/`SwitchMode`/`CreatePlan` Cursor tool calls;
  each replaced or dropped per the adaptation rules above.
- `AGENTS.md` key lookups are preserved as "read `AGENTS.md` for X"
  instructions, not assumed.
- The substantive body matches the verbatim source except for the adapted
  edges (a diff should show only the edge changes).
- Each adapted skill's `description` scopes it to the anwalt.de engineering
  workflow.

## Constraints

- The adaptation is only for making content work with the pi agent, not a
  content change (per the design: "reconciliation/adaptation is ONLY for
  making sure it works with Pi agent").
- The anwalt.de tooling assumptions (Jira/Bitbucket/`task`/worktree/`fork-db`)
  stay; only the Cursor tool-call shape is adapted.
- The verbatim source under
  `skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md`
  is the source of truth; future changes flow through the three-way
  reconciliation (the agent is the mergetool), not a deterministic adapter.

## Implementation notes

### Architecture lesson (task-level)

- **The seed already did the adaptation.** Commit `7def2b1` ("adapt on first
  seed too — no verbatim copies kept") changed the seeding flow *after* this
  task was written, so the 14 skills arrived already pi-adapted at
  `resources/blueprint/skills/`. The task's original premise ("adapt from
  verbatim sources") was stale; the real work was (1) fixing the few residual
  Cursor-edges the seed missed and (2) relocating to the design-Q6 top-level
  layout with the sync manifest + utility rewired. Future blueprint-content
  tasks should check the drift manifest's `adaptedSha256` presence before
  assuming verbatim sources.
- **Workflow friction (recorded to telemetry):** (a) the `implement-task`
  skill's `subagent({chain:[...]})` syntax is not supported by the actual
  `subagent` tool (`workflowScript` API); a stored-but-unawaited `runs.run`
  is rejected at static-validation time, which produced a false-negative on
  slice 1 *after* the tdd-worker had committed (the deviation report was
  stale as a result). (b) `node --experimental-strip-types` can't run the
  sync test (`@pi-aura/shared` `.js` re-export issue) — use `tsx`. Both are
  documented in `docs/testing.md` and in telemetry feedback.

### Slice 1 — edge-fixes (landed)

- All 8 specified Cursor-edge edits applied across two files:
  - `skills/engineering-workflow/resources/blueprint/skills/task-refine/SKILL.md` — 6 "Q&A module"/"Q&A tool"/"Q&A call"/"Cursor's Question" mentions → `ask_user_question`; the "Cursor's 'open and recently viewed files'" editor-context example → IDE-generic phrasing.
  - `skills/engineering-workflow/resources/blueprint/skills/task-implement/SKILL.md` — 2 "Editor Window … Cursor window" mentions → "their editor".
- Verified: `grep -rin "Q&A module\|Q&A tool\|Q&A call\|Cursor's Question\|Cursor window\|Editor Window"` returns nothing; `grep -rin "AskQuestion\|SwitchMode\|CreatePlan"` returns nothing (both pre-existing and post-edit). All 14 `description` frontmatters start with "anwalt.de engineering-workflow skill.". `.cursor/rules/anwaltde/universal/<rule>.mdc` refs untouched (27 occurrences across 7 skills). `ai-setup/SKILL.md`, `pr-review/SKILL.md`, `task-slice/SKILL.md` "Do NOT touch" items intact.
- The deviation report (`deviation-reports/edge-fixes.md`) claimed "no implementation was applied" — that was stale: it predates commit `2f8341e` which applied the `task-implement` edits. The final `git diff main...HEAD` shows exactly the 8 edge rewrites and nothing else.
- Slice doc archived to `slices/archive/1-edge-fixes.md`.

### Slice 2 — move-to-top-level (landed)

- Moved all 14 `SKILL.md` + 4 `task-untangle` `.ts` companions from `resources/blueprint/skills/<name>/` to top-level `skills/engineering-workflow/<name>/` (design Q6 layout) via `git mv` (100% rename, bytes preserved — `sha256sum` verified identical before/after). The now-empty `resources/blueprint/skills/` directory tree was removed (14 `.gitkeep` files deleted); `resources/blueprint/manifest.yaml` stays.
- Drift manifest (`.pi/engineering-foundation.json`): all 18 blueprint-skill `localPath` entries (14 `SKILL.md` + 4 `.ts`) updated from `skills/engineering-workflow/resources/blueprint/skills/...` to `skills/engineering-workflow/<name>/...`. Zero entries remain at the old path; each `localPath` file exists on disk. Hash fields (`sourceSha256`, `adaptedSha256`, `auraChecksumOrVersion`, `auraUpdatedAt`) untouched.
- Sync utility (`scripts/src/engineering-sync.ts`): `blueprintPathToLocal` gained an `under.startsWith("skills/")` branch mapping to top-level `skills/engineering-workflow/<name>/<file>`; rules branch and manifest fall-through unchanged. Dist rebuilt (`engineering-sync.mjs`).
- Router (`skills/engineering-workflow/SKILL.md`): table row path + "Blueprint skills are pi-adapted" section reframed as invokable pi sub-skills discovered recursively; adaptation description kept verbatim.
- Sync skill (`.pi/skills/engineering-sync/SKILL.md`): wiki-dir→repo-dir table + verification-checklist paths + manifest example JSON updated to top-level paths. Zero remaining `resources/blueprint/skills` references in any source/prose file.
- Verification: `find ... -name SKILL.md -not -path "*/resources/*"` → exactly 15 (router + 14 sub-skills); `task-untangle/` has `SKILL.md bundle.ts check-bundle.ts serve-plans.ts views.ts`; `cd scripts && npm run typecheck` green; `node ...engineering-sync.mjs status` → 44 entries, no unresolved three-way files; `cd packages/shared && npm test` → 30 pass / 0 fail.
- Pre-existing (not caused by this slice): `node --experimental-strip-types scripts/src/engineering-sync.test.ts` fails with `ERR_MODULE_NOT_FOUND` for `packages/shared/src/hey-api-aura-client.js` — identical failure on the seed commit and on the task branch before the slice. The `tracker-aura.mdc` rule file referenced in the manifest also does not exist on disk (pre-existing on the task branch, not a rules file this slice touches).
- Deviation report: `deviation-reports/move-to-top-level.md`.
- Slice doc archived to `slices/archive/2-move-to-top-level.md`.

## Notes

- This task depends on `engineering-workflow-skill` (which deposits the
  verbatim sources) and `engineering-sync-skill` (whose three-way flow will
  keep the adapted skills fresh after the first pass). The first pass itself
  is a one-time adaptation per skill.
- Whether to slice this per-skill (14 slices) or batch is a slicing
  decision for the implementer; the skills are independent of each other.
