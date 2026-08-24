# Architecture spec — adapt-blueprint-skills

> User-approved decisions (captured via `ask_user_question`):
> - **Scope**: Move the 14 adapted skills to top-level `skills/engineering-workflow/<name>/SKILL.md` (design Q6 layout), and **update the sync manifest + sync utility so future reconciliations point at the new locations**.
> - **`.cursor/rules` path refs**: Keep literal — they are target-repo paths, not pi-side paths.
> - **Slicing**: 2 slices (edge-fixes, then layout+router+manifest).

## Background — what already happened (do NOT redo)

The `seed-engineering-mirror` run (commit `7def2b1`, "adapt on first seed too —
no verbatim copies kept") **already adapted all 14 skills in place** at
`skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md`. The
drift manifest (`.pi/engineering-foundation.json`) records `adaptedSha256` for
all 14 `SKILL.md` files; there are no verbatim copies on disk. So the bulk of
the original task premise ("adapt from verbatim sources") is already done.

This task is therefore **not** a from-scratch adaptation. It is:

1. **Fix the residual Cursor-edges the seed missed** (small, bounded).
2. **Move the 14 skills to the design-Q6 top-level layout** and keep the sync
   manifest + sync utility pointing at the new locations so the next `fetch`
   reconciles in place (not against a stale path).

## Slice 1 — residual Cursor-edge fixes (all 14 skills, in place)

**Exports:** none — edits to existing `SKILL.md` files at
`resources/blueprint/skills/<name>/SKILL.md`.

**Existing abstractions to use:** the adaptation pattern already established by
the seed (visible in the other 13 skills): `Cursor's Q&A module` →
`ask_user_question`; Cursor editor-window phrasing → pi-generic "editor".
Mirror that exact wording so the 14 skills stay consistent.

**Do NOT reimplement:** do not reformat the bodies; do not touch the
substantive content. Only the named Cursor-edge strings below change.

**Edge inventory (exhaustive — verified by `grep` across all 14):**

Only **two** skills have residual Cursor tool-call edges:

- `task-refine/SKILL.md` — 6 occurrences of "Q&A module" / "Cursor's Question &
  Answer (Q&A) module" / "Q&A tool" / "Q&A call", plus one editor-context
  example "Cursor's 'open and recently viewed files'".
  - `:26` "ask the user via the Q&A module" → "ask the user via
    `ask_user_question`"
  - `:28` "(e.g. Cursor's \"open and recently viewed files\")" → "(e.g. an
    IDE's automatically injected \"open and recently viewed files\" context)"
    — keep the *concept* (an auto-injected editor context is not an explicit
    reference), drop the Cursor brand.
  - `:36` "using Cursor's Question & Answer (Q&A) module — the structured
    multiple-choice question tool" → "using pi's `ask_user_question` tool — the
    structured multiple-choice question tool"
  - `:48` "via the Q&A module" → "via `ask_user_question`"
  - `:50` "right before the Q&A call" → "right before the `ask_user_question`
    call"
  - `:64` "via the Q&A tool" → "via `ask_user_question`"
- `task-implement/SKILL.md` — 2 occurrences of "Editor Window … Cursor window":
  - `:59` "open it in the current Editor Window without a second Cursor
    window" → "open it in their editor"
  - `:205` "open it in the current Editor Window" → "open it in their editor"

**Explicitly NOT edges (leave verbatim — substantive content about target
tooling, not tool-call shape):**
- `ai-setup/SKILL.md` — "works well with Cursor or Claude Code", "onboard this
  repo for Cursor/Claude Code", "Target tools: Cursor, Claude Code, or both".
  These describe *which IDEs the anwalt.de repos target*, a substantive
  onboarding question. Keep verbatim.
- `pr-review/SKILL.md:31` — the "Pi-mirror note" about `emit_review` is a
  deliberate, already-documented adaptation. Keep.
- `task-slice/SKILL.md:110` — "the agent works in normal mode; there is no
  plan-creation tool to call" is **already the pi-adapted** phrasing
  (CreatePlan dropped). Keep.
- All `.cursor/rules/anwaltde/universal/<rule>.mdc` path references
  (worklog-personal-tracking, task-artifact-conventions) across ~10 skills —
  **target-repo paths**, kept literal per the user decision.

**Interface contract for slice 2:** none — slice 2 moves files, so slice 1's
edits land at the `resources/` path and slice 2 carries them to the top-level
path via `git mv` (preserving history). Slice 1 must not introduce new
Cursor-specific phrasing that slice 2 would have to re-find.

**Test plan (slice 1):**
- `grep -rin "Q&A module\|Q&A tool\|Q&A call\|Cursor's Question\|Cursor window\|Editor Window" skills/engineering-workflow/resources/blueprint/skills/` returns **nothing**.
- `git diff` for the two edited files shows **only** the edge rewrites above; substantive body unchanged.
- No `AskQuestion`/`SwitchMode`/`CreatePlan` literals appear (already true; re-confirm).
- `description` frontmatter in all 14 still starts with "anwalt.de engineering-workflow skill." (unchanged by this slice).

**Size:** s — two files, ~10 small string replacements.

**blocked_by:** (none — this is the first slice)

## Slice 2 — move to design-Q6 top-level layout + router + sync manifest + sync utility

**Exports:** the 14 invokable pi skills at
`skills/engineering-workflow/<name>/SKILL.md` (design Q6 layout), with the
`task-untangle` companion `.ts` files moved alongside its `SKILL.md`.

**Existing abstractions to use:**
- `git mv` to move files (preserves history; the sync manifest's `localPath`
  is a string, updated separately).
- The drift manifest at `.pi/engineering-foundation.json` — update each
  blueprint-skill entry's `localPath` to the new location.
- The sync utility's `blueprintPathToLocal` (`scripts/src/engineering-sync.ts`)
  — update the `blueprint/skills/...` branch to map to
  `skills/engineering-workflow/<name>/SKILL.md` (top-level), and the
  `task-untangle` companions to `skills/engineering-workflow/task-untangle/<file>.ts`.
- The `engineering-workflow` router (`skills/engineering-workflow/SKILL.md`) —
  its "Blueprint skills" table row + the "Blueprint skills are pi-adapted"
  prose section.

**Do NOT reimplement:** do not rewrite `blueprintPathToLocal` from scratch;
change only the skills branch (rules already map to `resources/rules/` and stay
there). Do not touch the wiki-doc path mapping (`wikiNodeToLocalPath`).

**Concrete changes:**

1. **Move files** (14 skills + 4 task-untangle `.ts` companions):
   - `git mv skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md skills/engineering-workflow/<name>/SKILL.md` for each of the 14.
   - `git mv skills/engineering-workflow/resources/blueprint/skills/task-untangle/{bundle,check-bundle,serve-plans,views}.ts skills/engineering-workflow/task-untangle/`.
   - Remove the now-empty `resources/blueprint/skills/` directory tree (the
     `resources/blueprint/manifest.yaml` stays — it still lives under
     `resources/blueprint/`).

2. **Update the drift manifest** (`.pi/engineering-foundation.json`):
   - For each of the 14 `blueprint/skills/<name>/skill.md` entries: change
     `localPath` from `skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md`
     to `skills/engineering-workflow/<name>/SKILL.md`.
   - For the 4 `blueprint/skills/task-untangle/*.ts` entries: change `localPath`
     to `skills/engineering-workflow/task-untangle/<file>.ts`.
   - Leave `sourceSha256`, `adaptedSha256`, `auraChecksumOrVersion`,
     `auraUpdatedAt` untouched (the content didn't change, only the path).
     Recompute `adaptedSha256` only if the move changed the file (it shouldn't —
     `git mv` preserves bytes; verify with `sha256sum` before/after).

3. **Update the sync utility** (`scripts/src/engineering-sync.ts`):
   - In `blueprintPathToLocal`: the `blueprint/skills/<name>/skill.md` branch
     maps to `skills/engineering-workflow/<name>/SKILL.md` (top-level), not
     `resources/blueprint/skills/<name>/SKILL.md`. The `task-untangle`
     companions map to `skills/engineering-workflow/task-untangle/<file>`.
     Rules keep mapping to `resources/rules/`. The blueprint manifest keeps
     mapping to `resources/blueprint/manifest.yaml`.
   - **Keep the rules + manifest under `resources/blueprint/`** — only the
     *skills* move to top-level. This is the design-Q6 layout: invokable
     sub-skills at `skills/engineering-workflow/<name>/`, reference material
     (manifest, rules) under `resources/`.

4. **Update the `engineering-workflow` router** (`skills/engineering-workflow/SKILL.md`):
   - Table row "Blueprint skills" — change path from
     `resources/blueprint/skills/<name>/SKILL.md` to
     `<name>/SKILL.md` (now siblings of the router, not under `resources/`).
   - "Blueprint skills are pi-adapted" section — update the path reference and
     the framing: the 14 are now **invokable pi sub-skills** discovered
     recursively under `skills/engineering-workflow/`, not "reference material
     under `resources/`". Keep the adaptation description (AskQuestion→…,
     SwitchMode→…, etc.) verbatim.
   - The "What lives where" table's `resources/` rows that are unaffected
     (INDEX, Log, workflow, guides, manifest, rules) stay as-is.

5. **Update the sync skill's wiki-dir→repo-dir table**
   (`.pi/skills/engineering-sync/SKILL.md`, line ~155) and the verification
   checklist path references: `blueprint/skills/<name>/SKILL.md` →
   `skills/engineering-workflow/<name>/SKILL.md` (+ the `.ts` companions).

6. **Update the sync test** (`scripts/src/engineering-sync.test.ts`) only if
   any assertion pins a `blueprint/skills` path (audit: the current tests use
   generic `/x/skills/ai-setup/SKILL.md` paths for `suffixed`, and
   `resources/rules/...` for tombstone tests — none pin the blueprint-skills
   location. So likely no test change needed; verify, don't assume).

**Interface contract:** the 14 skills are invokable as `/skill:<name>`
(pi discovers `SKILL.md` recursively under `skills/`), the sync manifest's
`localPath` matches the on-disk path so the next `fetch` reconciles in place,
and the sync utility's `blueprintPathToLocal` agrees with the manifest.

**Test plan (slice 2):**
- `find skills/engineering-workflow -name SKILL.md -not -path "*/resources/*"` lists exactly 15 files (the router + 14 sub-skills).
- `find skills/engineering-workflow/resources/blueprint/skills` returns nothing (dir removed); `resources/blueprint/manifest.yaml` still exists.
- `ls skills/engineering-workflow/task-untangle/` lists `SKILL.md bundle.ts check-bundle.ts serve-plans.ts views.ts`.
- The manifest's 14 blueprint-skill `localPath` values all start with `skills/engineering-workflow/` and **not** `skills/engineering-workflow/resources/`. Each `localPath` file exists.
- `node .pi/skills/engineering-sync/dist/engineering-sync.mjs status` runs and reports the seeded manifest with no unresolved three-way files.
- `cd scripts && npm run typecheck` passes (the `blueprintPathToLocal` change type-checks).
- `cd packages/shared && npm test` green (no shared-client change, but guard against regressions).
- `node --experimental-strip-types scripts/src/engineering-sync.test.ts` green.
- `sha256sum` of one moved `SKILL.md` before/after the `git mv` is identical (content preserved).
- pi discovers all 14 as skills: their `name` frontmatter is unique and matches the directory.

**Size:** m — file moves + manifest JSON edit + sync-utility code edit + router
prose edit + sync-skill prose edit.

**blocked_by:** ["1-edge-fixes"] — edge fixes land first at the old path, then
move with the files. (Moves + edge-fixes in one slice would conflate
content edits with structural moves; the dependency keeps them clean.)

## Architecture notes (shared)

- The `task-untangle` companion `.ts` files (`bundle.ts`, `check-bundle.ts`,
  `serve-plans.ts`, `views.ts`) are **not** adapted (manifest: no
  `adaptedSha256`) — they are code, not prose, and the seed copied them
  verbatim. They move with `task-untangle/SKILL.md` to
  `skills/engineering-workflow/task-untangle/` because the skill references
  them as "in this skill's folder" (line 298).
- `blueprint/manifest.yaml` (the wiki's blueprint manifest, with `checksum`
  per file) stays at `resources/blueprint/manifest.yaml` — it is reference
  material, not an invokable skill. Only the 14 `SKILL.md` (+ the 4 `.ts`
  companions) move.
- The drift manifest is the single source of truth for "where does this
  mirrored item live". The sync utility's `blueprintPathToLocal` must agree
  with it. After this task, a future `fetch` that detects a wiki change to
  `blueprint/skills/task-refine/skill.md` will stage
  `skills/engineering-workflow/task-refine/SKILL.NEW_REMOTE.md` next to the
  adapted file — which is the point of keeping them in sync.
- **No CI.** Verification is the unit tests (`engineering-sync.test.ts`) +
  `status` + `typecheck` + the find/grep checks in each slice's test plan.
