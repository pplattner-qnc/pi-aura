---
kind: slice
slug: move-to-top-level
size: m
status: ready
blocked_by: ["edge-fixes"]
---

# Slice 2 — move to design-Q6 top-level layout + router + sync manifest + sync utility

## What

Move the 14 adapted skills (+ `task-untangle`'s 4 `.ts` companions) from
`skills/engineering-workflow/resources/blueprint/skills/<name>/` to top-level
`skills/engineering-workflow/<name>/` (design Q6), and update everything that
references the old path so the next `fetch` reconciles in place:

- the drift manifest (`.pi/engineering-foundation.json`) `localPath` entries,
- the sync utility's `blueprintPathToLocal` (`scripts/src/engineering-sync.ts`),
- the `engineering-workflow` router's table + "Blueprint skills are pi-adapted"
  section,
- the sync skill's wiki-dir→repo-dir table + verification-checklist paths.

## Why this scope (user decision)

The seed put the skills under `resources/blueprint/skills/` because that's where
`fetch` wrote the `NEW_REMOTE` files. Design Q6 wanted invokable sub-skills at
`skills/engineering-workflow/<name>/SKILL.md`. pi discovers them recursively
either way, so they're already invokable — but the user chose to move them to
the Q6 layout **and** keep the sync manifest pointing at the new locations, so
future reconciliations land in the right place.

## Concrete changes

### 1. Move files (`git mv`, preserves history)

For each of the 14 skills:

```
git mv skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md \
       skills/engineering-workflow/<name>/SKILL.md
```

For `task-untangle`'s 4 companions:

```
git mv skills/engineering-workflow/resources/blueprint/skills/task-untangle/{bundle,check-bundle,serve-plans,views}.ts \
       skills/engineering-workflow/task-untangle/
```

Then remove the now-empty `resources/blueprint/skills/` directory tree.
`resources/blueprint/manifest.yaml` stays (it's reference material, not a skill).

### 2. Drift manifest (`.pi/engineering-foundation.json`)

For each of the 14 `blueprint/skills/<name>/skill.md` entries: change
`localPath` from `skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md`
to `skills/engineering-workflow/<name>/SKILL.md`.

For the 4 `blueprint/skills/task-untangle/*.ts` entries: change `localPath` to
`skills/engineering-workflow/task-untangle/<file>.ts`.

Leave `sourceSha256`, `adaptedSha256`, `auraChecksumOrVersion`, `auraUpdatedAt`
untouched (content unchanged; only the path moves). Verify with `sha256sum`
before/after the `git mv` that the bytes are identical — if they are, the
`adaptedSha256` is still correct and does not need recomputation.

### 3. Sync utility (`scripts/src/engineering-sync.ts`)

In `blueprintPathToLocal`: the `blueprint/skills/<name>/skill.md` branch maps
to `skills/engineering-workflow/<name>/SKILL.md` (top-level), and the
`task-untangle` companions map to `skills/engineering-workflow/task-untangle/<file>`.
**Rules keep mapping to `resources/rules/`** and the **blueprint manifest keeps
mapping to `resources/blueprint/manifest.yaml`** — only the *skills* move to
top-level.

### 4. `engineering-workflow` router (`skills/engineering-workflow/SKILL.md`)

- "Blueprint skills" table row: change path `resources/blueprint/skills/<name>/SKILL.md`
  → `<name>/SKILL.md`.
- "Blueprint skills are pi-adapted" section: update the path reference and the
  framing — the 14 are now **invokable pi sub-skills** discovered recursively
  under `skills/engineering-workflow/`, not "reference material under
  `resources/`". Keep the adaptation description (AskQuestion→…, SwitchMode→…,
  etc.) verbatim.
- Unaffected `resources/` rows (INDEX, Log, workflow, guides, manifest, rules)
  stay as-is.

### 5. Sync skill (`.pi/skills/engineering-sync/SKILL.md`)

- wiki-dir→repo-dir table (~line 155): `blueprint/skills/<name>/SKILL.md` →
  `skills/engineering-workflow/<name>/SKILL.md` (+ the `.ts` companions →
  `skills/engineering-workflow/task-untangle/<file>`).
- Verification-checklist path references: update any
  `resources/blueprint/skills/<name>/SKILL.md` to the new top-level path.

### 6. Sync test (`scripts/src/engineering-sync.test.ts`)

Audit only — the current tests use generic `/x/skills/ai-setup/SKILL.md` paths
for `suffixed` and `resources/rules/...` for tombstone tests; none pin the
blueprint-skills location. Verify, don't assume; change only if an assertion
pins the old path.

## Test plan

- `find skills/engineering-workflow -name SKILL.md -not -path "*/resources/*"` → exactly **15** files (router + 14 sub-skills).
- `find skills/engineering-workflow/resources/blueprint/skills` → **nothing** (dir removed); `skills/engineering-workflow/resources/blueprint/manifest.yaml` still exists.
- `ls skills/engineering-workflow/task-untangle/` → `SKILL.md bundle.ts check-bundle.ts serve-plans.ts views.ts`.
- All 14 manifest blueprint-skill `localPath` values start with `skills/engineering-workflow/` and **not** `skills/engineering-workflow/resources/`; each `localPath` file exists on disk.
- `node .pi/skills/engineering-sync/dist/engineering-sync.mjs status` runs, reports the seeded manifest, no unresolved three-way files.
- `cd scripts && npm run typecheck` green.
- `node --experimental-strip-types scripts/src/engineering-sync.test.ts` green.
- `cd packages/shared && npm test` green (guard against regressions; no shared change expected).
- `sha256sum` of one moved `SKILL.md` is identical before and after the `git mv` (content preserved).
- The 14 skills' `name` frontmatter is unique and matches its directory; pi discovers all 14.

## Size

m — file moves + manifest JSON edit + sync-utility code edit + router prose
edit + sync-skill prose edit.
