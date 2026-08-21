# Handoff — engineering-foundation-sync map (run the seeding)

> **Read this first.** You are picking up the `engineering-foundation-sync`
> map in the `pi-aura` repo. The two Level-0 build tasks are **done**; what
> remains is the **manual seeding run** (done by the user, in this session),
> then the adaptation task (blocked on the seeding). This file gives you the
> context to continue cleanly. **Do not re-derive the design** — it's all in
> the task docs; read those, don't re-grill the user.
>
> **Start by reading the map**: `docs/tasks/maps/engineering-foundation-sync/map.md`
> (destination, constraints, decisions-so-far, fog). Then this handoff. Then
> the seed task doc.

## TL;DR — where things stand

**Goal of the map:** mirror the `engineering-foundation` Aura wiki space into
`pi-aura` as a first-class engineering canon, surfaced by a pi skill
(`engineering-workflow`), kept fresh by a package-author-only sync skill
(`engineering-sync`) with a three-way reconciliation flow + drift gate.

**Task status (read with `task_list`):**

| Task | Status | Notes |
|---|---|---|
| `blueprint-skills-and-sync-design` (grilling) | ✅ done | Design in its task doc |
| `cursor-rules-incorporation` (grilling) | ✅ done | Design in its task doc |
| `move-skills-to-core` (feature) | ✅ done | `skills/aura*` → `skills/core/aura*`, path refs updated |
| `engineering-workflow-skill` (feature) | ✅ done | Router SKILL.md + empty `.gitkeep`'d `resources/` skeleton |
| `engineering-sync-skill` (feature) | ✅ done | Sync skill + CLI utility built; `.IGNORE` tombstone flow added |
| `engineering-rules-extension` (feature) | ✅ done | Extension; manifest-driven ignore (no hardcoding) |
| `seed-engineering-mirror` (manual) | ⏳ **NEXT** | **Run by the user in this session** — see below |
| `adapt-blueprint-skills` (feature) | ⏳ ready (Level 1) | Blocked on the seeding |

**Dependency graph** (`task_dependency_levels engineering-foundation-sync`):

```
Level 0 (ready):   seed-engineering-mirror   (manual — USER, this session)
                          │
                          ▼
Level 1:           adapt-blueprint-skills
```

**Remaining count:** 2 tasks (1 manual by the user, 1 feature blocked on it).

## ⚠️ Before starting — commit the build work

The two done feature tasks are **not yet committed**. The next session must
start from a clean tree. First:

```bash
cd /home/pplattner/.pi/agent/git/github.com/pplattner-qnc/pi-aura
git add -A
git commit -m "engineering-sync skill + engineering-rules extension (Level-0 build)"
```

This commits:
- `packages/shared/src/aura-client.ts` + `hey-api-aura-client.ts` — two new
  client verbs (`getBlueprintFiles`, `getKnowledgeNodeVersion`) + enriched
  `mapKnowledgeNode` (surfaces `updated_at`/`body_hash`).
- `packages/shared/test/blueprint-version-verbs.test.ts` — 7 new tests.
- `scripts/src/engineering-sync.ts` — the sync CLI (fetch/finish/status +
  `.IGNORE` tombstone flow). Bundled to
  `.pi/skills/engineering-sync/dist/engineering-sync.mjs`.
- `scripts/esbuild.config.mjs`, `scripts/package.json` (js-yaml dep),
  `scripts/tsconfig.json` (exclude `*.test.ts`), `Makefile` (new dist target).
- `.pi/skills/engineering-sync/SKILL.md` — package-author-only skill doc.
- `extensions/engineering-rules.ts` + `.test.ts` — frontmatter dispatch +
  universal `@mention` + manifest-driven ignore. Registered in
  `package.json` `pi.extensions`.

## The next task: `seed-engineering-mirror` (manual)

Read `docs/tasks/seed-engineering-mirror/task.md` in full — it has the exact
steps + evidence checklist. Summary:

### Prereqs to verify first

- `node .pi/skills/engineering-sync/dist/engineering-sync.mjs status` runs
  (prints "manifest is empty or absent (initial seeding not yet run)").
- The Aura REST client + keyring PAT is configured (same path as the `aura`
  skill): `~/.pi/agent/settings.json` has `aura.baseUrl`, and the OS keyring
  has an Aura PAT (`/aura secrets discover` if not).

### The manual step (the agent is the mergetool)

1. **`fetch`** — `node .pi/skills/engineering-sync/dist/engineering-sync.mjs fetch`
   - With an empty manifest, **every** wiki item is staged as `*.NEW_REMOTE.*`
     under `skills/engineering-workflow/resources/` (15+1 rules, guides,
     workflow, INDEX, Log, blueprint manifest, 14 blueprint skills). Nothing
     is skipped on the first fetch — there are no `ignored` flags yet.
2. **Reconcile** each `*.NEW_REMOTE.*` cluster (you, the agent, are the
   mergetool):
   - **Verbatim copies** (guides, workflow, INDEX, Log, blueprint manifest,
     14 blueprint skill SKILL.mds, the 15 included rules): create the plain
     local file (`c.md` / `c.mdc`) from the `NEW_REMOTE` content, then delete
     the `NEW_REMOTE` file.
   - **`tracker-aura`** (doesn't belong in this repo): do **not** create the
     local `.mdc`. Instead write a tombstone
     `skills/engineering-workflow/resources/rules/tracker-aura.IGNORE` whose
     content is the ignore reason (e.g. "this repo talks to Aura via the aura
     skill / REST client"). Leave its `NEW_REMOTE` in place — `finish`
     consumes both.
   - **`engineering-workflow` SKILL.md router** (authored file): reconcile its
     routing table against the fetched `INDEX.md` structure (the sync surfaces
     a structure digest for this).
3. **`finish`** — `node .pi/skills/engineering-sync/dist/engineering-sync.mjs finish`
   - Refuses (exit 1, prints list) if any `*.OLD_REMOTE.*` / `*.NEW_REMOTE.*`
     / `*.CURRENT.*` remain. `.IGNORE` tombstones are consumed (not refused).
   - On success: writes `.pi/engineering-foundation.json` (the drift
     manifest, with `tracker-aura` recorded as `ignored: true`).
4. **Verify** — `find skills/engineering-workflow/resources -type f` lists
   the expected files (15 rules, tracker-aura absent; 4 guides; 2 workflow;
   INDEX; Log; blueprint/manifest.yaml; 14 blueprint skills). Spot-check 2–3
   sha256s vs `manifest.yaml`. Confirm
   `find ... -name '*.OLD_REMOTE.*' -o -name '*.NEW_REMOTE.*' -o -name '*.CURRENT.*' -o -name '*.IGNORE'`
   returns nothing.

### Mark it done

- Set `seed-engineering-mirror` status to `done` in its task doc frontmatter.
- Commit the seeded mirror + the new `.pi/engineering-foundation.json`.
- `adapt-blueprint-skills` then unblocks (Level 1).

## How the `.IGNORE` + manifest-driven ignore works (no hardcoding)

- The sync utility has **no hardcoded rule names**. `tracker-aura` gets
  ignored solely because the agent writes a `tracker-aura.IGNORE` tombstone
  during seeding, which `finish` records as `ignored: true` in the manifest.
- The `engineering-rules` extension derives its ignored set **only** from
  `.pi/engineering-foundation.json`'s `ignored: true` flags — no hardcoded
  skip. If the manifest is absent/empty (before seeding), the extension
  loads all rules (it no-ops if the rules dir is empty).
- Both sides read the same manifest, so ignore decisions live in one place.
- On later `fetch` runs, items already marked `ignored: true` are skipped
  (not re-staged).

## What you do NOT do

- **Do not re-grill the user.** All design decisions are in the grilling task
  docs + the map's Decisions/Fog. If something seems undecided, read those.
- **Do not hand-transcribe wiki content** into `resources/`. The sync
  utility's `fetch` is the only sha256-verified path.
- **Do not touch `skills/core/aura/resources/process/`** — unrelated canon.
- **Do not change `package.json` `pi.skills`** — single recursive entry.

## How to run things

- Build (if needed): `cd scripts && npm run build` (or `make build` if make
  is installed — not on NixOS). Typecheck: `cd scripts && npm run typecheck`.
- Tests: `cd packages/shared && npm test` (30 tests); `node --experimental-strip-types extensions/engineering-rules.test.ts`; `node_modules/.bin/tsx scripts/src/engineering-sync.test.ts` (from repo root).
- The sync CLI: `node .pi/skills/engineering-sync/dist/engineering-sync.mjs {fetch|finish|status}`.

## Quick orientation commands

```bash
# task statuses
task_list (kind: task)

# the map + graph
cat docs/tasks/maps/engineering-foundation-sync/map.md
task_dependency_levels engineering-foundation-sync
task_frontier engineering-foundation-sync

# the task doc to run
cat docs/tasks/seed-engineering-mirror/task.md

# the two grilling docs (full design context) if needed
cat docs/tasks/blueprint-skills-and-sync-design/task.md
cat docs/tasks/cursor-rules-incorporation/task.md

# the built sync skill + its docs
cat .pi/skills/engineering-sync/SKILL.md
node .pi/skills/engineering-sync/dist/engineering-sync.mjs status
```
