# Handoff — engineering-foundation-sync map (run the seeding, v2)

> **Read this first.** You are picking up the `engineering-foundation-sync`
> map in the `pi-aura` repo to run the **`seed-engineering-mirror`** manual
> task. A previous session (call it v1) built the sync skill, attempted the
> seeding, found and fixed bugs in the sync utility + shared client, then —
> at the user's direction — discarded the seeding **results** and kept only
> the **fixes** (commit `a325425`). You are re-doing the seeding on top of
> those fixes, now with a stricter, user-review-gated flow. **Do not
> re-derive the design** — it's all in the task docs; read those, don't
> re-grill the user.

## TL;DR — where things stand

**Goal of the map:** mirror the `engineering-foundation` Aura wiki space into
`pi-aura` as a first-class engineering canon, surfaced by a pi skill
(`engineering-workflow`), kept fresh by a package-author-only sync skill
(`engineering-sync`).

**What's done and committed:**
- All Level-0 build tasks (design, skills move, `engineering-workflow` skill,
  `engineering-sync` skill + CLI, `engineering-rules` extension) — commit
  `d83a5a5`.
- The sync-utility/client fixes from the v1 seeding attempt — commit
  `a325425` (HEAD). See "Fixes already on `main`" below.

**What's NOT done (your job):** the seeding run itself. v1 produced a
fully-seeded mirror (43 resources + `.pi/engineering-foundation.json`) but
the user chose to discard it and re-do it under the new flow. The working
tree is clean except for a stray, unrelated `stacked-branch-pattern.md`.

## The flow you MUST follow (this changed after v1)

The `engineering-sync` skill now mandates a **live change-inventory file**
and a **user-review gate before `finish`**. Read `.pi/skills/engineering-sync/SKILL.md`
in full — it is the source of truth. Summary of the run shape:

1. **Start the inventory immediately.** Create `.pi/engineering-sync-inventory.md`
   and append to it **as you work** — every file you open, read, run, or
   change (source fixes, generated bundles, files read but untouched, files
   created by the run). Do NOT reconstruct it from memory at the end.
2. **`fetch`** — `node .pi/skills/engineering-sync/dist/engineering-sync.mjs fetch`
   - With an empty manifest, every item is staged as `*.NEW_REMOTE.*` under
     `skills/engineering-workflow/resources/` (15+1 rules, 4 guides, 2
     workflow, INDEX, Log, blueprint manifest, 14 blueprint skills, 4
     task-untangle `.ts` companions). ~43 items total.
3. **Reconcile** each `*.NEW_REMOTE.*` cluster (you are the mergetool —
   **you adapt every file, including on the first seed**; no verbatim copies
   are kept, a verbatim Cursor file is useless here):
   - **Adapt each file** (guides, workflow, INDEX, Log, blueprint manifest,
     14 blueprint skill SKILL.mds, the 15 included rules): write the plain
     local file (`c.md` / `c.mdc`) at the same path as the `NEW_REMOTE`,
     starting from the `NEW_REMOTE` body and applying the pi adaptations the
     skill describes (`AskQuestion`→`ask_user_question`, `SwitchMode`→drop,
     `CreatePlan`→drop, `AGENTS.md` lookups→read the target repo's `AGENTS.md`;
     keep the anwalt.de Jira/Bitbucket/`task`/worktree/`fork-db` assumptions).
     **Do NOT delete the diff files** — keep `*.NEW_REMOTE.*` (and any
     `*.OLD_REMOTE.*` / `*.CURRENT.*`) in place for the user to review.
   - **`tracker-aura`** (doesn't belong in this repo): do not create the
     local `.mdc`. Write a tombstone
     `skills/engineering-workflow/resources/rules/tracker-aura.IGNORE` whose
     content is the ignore reason. Leave its `NEW_REMOTE` in place.
   - **`engineering-workflow` SKILL.md router** (authored file): reconcile
     its routing table against the fetched `INDEX.md` structure if a
     `SKILL.NEW_REMOTE.md` was staged (on the first run it may not be — see
     "The authored-router gotcha" below).
4. **Ask the user to review.** Do NOT run `finish`, and do NOT delete any
   diff files, until the user explicitly approves the inventory + the
   reconciled mirror. Use `ask_user_question` or just stop and present it.
5. **After the user approves**, delete all diff files for every cluster
   (`*.OLD_REMOTE.*`, `*.NEW_REMOTE.*`, `*.CURRENT.*`), then run `finish`.
   - `finish` refuses (exit 1) if any diff files remain. `.IGNORE`
     tombstones are consumed (not refused). On success it writes
     `.pi/engineering-foundation.json` (the drift manifest, with
     `tracker-aura` recorded as `ignored: true`).
6. **Verify** — `find skills/engineering-workflow/resources -type f` lists
   the expected files (15 rules with tracker-aura absent; 4 guides; 2
   workflow; INDEX; Log; blueprint/manifest.yaml; 14 blueprint skills + 4
   task-untangle companions). Spot-check 2–3 sha256s vs `manifest.yaml`.
   Confirm `find ... -name '*.OLD_REMOTE.*' -o -name '*.NEW_REMOTE.*' -o
   -name '*.CURRENT.*' -o -name '*.IGNORE'` returns nothing.

### The authored-router gotcha (v1 found this)

`surfaceAuthoredDiff` only stages a `SKILL.NEW_REMOTE.md` for the router when
an authored manifest entry **already exists**. On the first run there is no
entry, so nothing is staged for the router and `finish` bootstraps the
authored entry itself (with the current wiki structure signature). This is
expected — the router is committed as-is (it was already reconciled against
the INDEX during the build). You likely won't touch the router on the first
seeding; just let `finish` bootstrap it.

## Fixes already on `main` (v1 found these — you should NOT need to re-fix)

Commit `a325425` fixed the sync utility + shared client so `fetch` enumerates
the full wiki. If `fetch` now stages ~43 items on the first run, the fixes are
working. If it stages only a handful or 403s, something regressed — check
these (all in `a325425`):

- `packages/shared/src/hey-api-aura-client.ts` — `mapKnowledgeNode` maps
  nested `children` recursively (the REST wiki tree is nested; without this
  `guides/*` and `workflow/*` are invisible).
- `scripts/src/engineering-sync.ts`:
  - `getBlueprintFiles` called with full `blueprint/manifest.yaml` (bare
    `manifest.yaml` → 403).
  - `parseBlueprintManifest` reads `entries:` + nested `files:` per dir.
  - `fetchWikiItems` recurses nested `children`.
  - `wikiNodeToLocalPath` uses full slug-path chain; `index`/`log` →
    `INDEX.md`/`Log.md`.
  - `blueprintPathToLocal` routes rules → `resources/rules/`.
  - `finish` gate excludes a `NEW_REMOTE` paired with an `.IGNORE` tombstone;
    stem extraction strips `.NEW_REMOTE`.
  - `fetchBlueprintItems` respects `ignored` (so tracker-aura isn't
    re-staged after the first run); authored router entry bootstrapped on
    first seeding.
  - Authored-router structure signature uses nested slug paths.

**Do not re-fix these unless a regression test fails.** If `fetch` works,
skip straight to reconcile + the user-review gate.

## ⚠️ Prerequisites to verify first

- `node .pi/skills/engineering-sync/dist/engineering-sync.mjs status` runs
  (prints "manifest is empty or absent (initial seeding not yet run)").
- The Aura REST client + keyring PAT is configured: `~/.pi/agent/settings.json`
  has `aura.baseUrl`, and the OS keyring has an Aura PAT (`/aura secrets
  discover` if not). v1 verified both.
- `cd scripts && npm run build` produces
  `.pi/skills/engineering-sync/dist/engineering-sync.mjs` (already built at
  HEAD `a325425`).

## How to run things

- The sync CLI: `node .pi/skills/engineering-sync/dist/engineering-sync.mjs {fetch|finish|status}`.
- Build (if needed): `cd scripts && npm run build`. Typecheck: `cd scripts && npm run typecheck`.
- Tests: `cd packages/shared && npm test` (30 tests);
  `node_modules/.bin/tsx scripts/src/engineering-sync.test.ts` (from repo root).

## Mark it done (after the user approves + finish succeeds)

- Set `seed-engineering-mirror` status to `done` in its task doc frontmatter
  (`docs/tasks/seed-engineering-mirror/task.md`).
- Commit the seeded mirror + `.pi/engineering-foundation.json` (keep the
  `.pi/engineering-sync-inventory.md` too — it's the run's audit trail).
- `adapt-blueprint-skills` then unblocks (Level 1).

## What you do NOT do

- **Do not re-grill the user.** All design decisions are in the grilling task
  docs + the map's Decisions/Fog. If something seems undecided, read those.
- **Do not hand-transcribe wiki content** into `resources/`. The sync
  utility's `fetch` is the only sha256-verified path.
- **Do not delete diff files or run `finish` before the user approves.**
  This is the new hard rule.
- **Do not touch `skills/core/aura/resources/process/`** — unrelated canon.
- **Do not change `package.json` `pi.skills`** — single recursive entry.

## Quick orientation commands

```bash
# the map + graph
cat docs/tasks/maps/engineering-foundation-sync/map.md
task_dependency_levels engineering-foundation-sync

# the task doc to run
cat docs/tasks/seed-engineering-mirror/task.md

# the skill (source of truth for the flow)
cat .pi/skills/engineering-sync/SKILL.md

# verify clean start
git log --oneline -2          # expect d83a5a5 (build) + a325425 (fixes)
git status --short            # expect only ?? stacked-branch-pattern.md
node .pi/skills/engineering-sync/dist/engineering-sync.mjs status
```
