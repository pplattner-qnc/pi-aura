---
kind: task
type: feature
slug: engineering-workflow-skill
title: Build the engineering-workflow skill + mirror non-skill engineering-foundation content
map: engineering-foundation-sync
status: done
blocked_by: [move-skills-to-core]
slices: []
---

# engineering-workflow skill + skeleton

## Outcome

Create the user-facing `engineering-workflow` pi skill at
`skills/engineering-workflow/SKILL.md` and the directory skeleton under
`skills/engineering-workflow/resources/` that the `engineering-sync` skill will
populate on the first `fetch`. **This task delivers the skeleton + the
user-facing SKILL.md router only — it does NOT hand-transcribe the mirrored
content.** The prose docs, the `.mdc` rules, the `manifest.yaml`, and the
verbatim blueprint skill bodies are all seeded by the `engineering-sync` skill's
first `fetch` run (empty manifest → everything is "new"), which is the
sha256-verified path. Hand-transcribing them would defeat the drift gate.

## Scope

### In scope

- `skills/engineering-workflow/SKILL.md` — the user-facing skill (frontmatter
  `name: engineering-workflow`, `description` covering the canon). Routes the
  agent to the right `resources/` file per topic (progressive-disclosure,
  mirrors `skills/core/aura/SKILL.md`).
- The **directory skeleton** under `resources/`, kept in git via `.gitkeep`
  files (git won't track empty dirs):
  - `resources/guides/`, `resources/workflow/`, `resources/rules/`,
    `resources/blueprint/skills/<name>/` (one dir per of the 14 blueprint
    skills).
  - `resources/INDEX.md`, `resources/Log.md`, `resources/blueprint/manifest.yaml`
    are NOT written here — the sync skill fetches them.

### Out of scope

- Hand-transcribing the prose docs, rules, manifest, or verbatim skill bodies
  — that is the `engineering-sync` skill's `fetch` job (sha256-verified).
- The `engineering-sync` skill + utility (that's `engineering-sync-skill`).
- The pi-adaptation of the 14 blueprint skills (that's
  `adapt-blueprint-skills`).
- The `engineering-rules.ts` extension (that's `engineering-rules-extension`).
- Editing wiki content (mirror is read-only).

## Acceptance criteria

- `skills/engineering-workflow/SKILL.md` exists with correct frontmatter and
  is discoverable by pi (via `pi.skills: ["./skills"]` recursive discovery).
- Every non-skill wiki doc in the `engineering-foundation` space is mirrored
  under `resources/` (guides, workflow, Index, Log, manifest.yaml, rules,
  verbatim blueprint skills).
- The `SKILL.md` routes the agent to the right resource per topic and notes
  the Cursor-flavoured/reference distinction for the blueprint skills.
- `resources/blueprint/manifest.yaml` is present and matches the live wiki
  manifest (the sync utility will keep it fresh; here we seed it).

## Constraints

- The mirrored content is committed (ships to end users).
- Content is fetched via the existing REST client + keyring PAT
  (`createDefaultAuraClient`), not MCP.
- `skills/aura/resources/process/` is unrelated and not touched.

## Notes

- The first-pass mirror can be done with a one-shot fetch script (or manual
  `getKnowledgeNode`/`getBlueprintFiles` calls) since the sync utility
  (`engineering-sync-skill`) doesn't exist yet. The committed manifest
  (`.pi/...`) is seeded by the first `fetch` later, but the content itself
  lands here.
