---
kind: task
type: feature
slug: move-skills-to-core
title: Move existing skills/aura* into skills/core/ and update rippling path references
map: engineering-foundation-sync
status: done
blocked_by: []
slices: []
---

# Move existing skills to skills/core/

## Outcome

Move the existing `skills/aura/` and `skills/aura-digest/` into
`skills/core/aura/` and `skills/core/aura-digest/` so the new
`skills/engineering-workflow/` canon skill can sit alongside them under
`skills/`, and so the existing skills are visually grouped as "core" pi-aura
skills rather than mixed with the engineering canon.

## Scope

### In scope

- `git mv skills/aura skills/core/aura`
- `git mv skills/aura-digest skills/core/aura-digest`
- Update the 4 files that reference `skills/aura*` by hardcoded path:
  - `Makefile` — `AURA_DIST := skills/aura/dist` → `skills/core/aura/dist`
    (and any other `skills/aura*` dist refs).
  - `scripts/esbuild.config.mjs` — entry outfiles
    `../skills/aura/dist/aura.mjs` → `../skills/core/aura/dist/aura.mjs`,
    `../skills/aura-digest/dist/aura-digest.mjs` →
    `../skills/core/aura-digest/dist/aura-digest.mjs`.
  - ~20 doc references to `skills/aura/dist/aura.mjs` in
    `skills/core/aura/resources/**` (the moved skill's own docs) and
    `docs/dev-env.md` — update to `skills/core/aura/dist/aura.mjs`.
- Verify `make build` still produces the bundles at the new paths and the
  dist files exist after the move.

### Out of scope

- Changing `package.json` `pi.skills: ["./skills"]` — it is a single
  recursive entry; pi discovers every `SKILL.md` under `skills/` recursively,
  so `skills/core/*` and `skills/engineering-workflow/*` are all discovered
  without changing the array. **Do not touch `pi.skills`.**
- Any change to the `aura` or `aura-digest` skill *content* — this is a pure
  move + path-reference update.
- Creating `skills/engineering-workflow/` (that's
  `engineering-workflow-skill`).

## Acceptance criteria

- `git mv` used (history preserved); no copy+delete.
- `make build` succeeds and writes bundles to the new `skills/core/*/dist/`
  paths.
- `grep -rn "skills/aura/" --include="*.md" --include="*.ts" --include="*.mjs" --include="Makefile" .` (excluding `node_modules`, `package-lock.json`, and `skills/engineering-workflow/`) returns no stale `skills/aura/...` references (all updated to `skills/core/aura/...`).
- The `aura` and `aura-digest` skills still load as pi skills (discovered via
  the unchanged `pi.skills: ["./skills"]` recursive entry).

## Constraints

- `package.json` `pi.skills` must not change.
- This task is a prerequisite for `engineering-workflow-skill` (which creates
  `skills/engineering-workflow/` and would otherwise have to coordinate the
  move) and for `adapt-blueprint-skills` (which references the new layout).

## Notes

- This is a pure refactor with no behavior change; no test changes expected.
- Run `make build` + `make typecheck` to verify the esbuild pipeline still
  targets the right outpaths after the move.
