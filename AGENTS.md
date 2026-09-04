# Agent conventions for pi-aura

pi-aura is a Pi package: install with `pi install`, no Claude Code plugin
manifest, no `skills.sh`. Skills are organized under `skills/core/`, agents
under `agents/`, and pi extensions under `extensions/` plus
`.pi/extensions/`. The task-workflow lives under `docs/tasks/`.

## Skill layout

Skills live under `skills/core/` (a single bucket, not the workflow
package's engineering/productivity split):

- `skills/core/aura/`: reference skill for working with Aura
- `skills/core/aura-digest/`: the morning routine
- `skills/core/engineering-foundation/`: router for the anwalt.de
  engineering canon in the Aura wiki

Every skill is listed in the top-level `README.md` skill table. When you
add, rename, or change a skill's behaviour, re-sync its `README.md` entry
so the table stays accurate.

## Invocation split

Every `SKILL.md` is either user-invoked (`disable-model-invocation: true`
in frontmatter, reachable only by the human typing `/skill:<name>`) or
model-invoked (omit the flag; model- or user-reachable). Pi uses frontmatter
only: there is no `agents/openai.yaml` (that is a Codex-specific file; we
are Pi-native). The two representations stay in sync: a skill is one or the
other, not both.

Dependencies between skills are expressed as an operative instruction to
invoke the named skill, not as deep file cross-references. One skill per
instruction. User-invoked skills are phrased as instructions for the human
("tell the user to run `/skill:<name>`"), never reached by the model.

## Task-workflow

Work is planned and executed via a dependency-aware task graph under
`docs/tasks/` (maps, tasks, slices, archive). The workflow skills
(setup-workflow, task-overview, wayfinder, implement-task, finalize-task,
to-spec, to-tickets, tdd, code-review, etc.) come from the
`task-workflow` package and operate on this tree. `docs/tasks/state.yaml`
holds the current `task`/`slice` pointers and the `schema_version` stamp;
it is tracked in git so the freshness stamp persists across clones.

Bugs live under `docs/bugs/` (active reports) with an `archive/` subfolder;
rejected requests live in `docs/tasks/out-of-scope/`; decisions live in
`docs/adr/`; per-repo skill config lives in `docs/agents/`.

## No em-dashes

No em-dashes anywhere in this repo's prose (`SKILL.md` files, docs,
`README.md`, `CHANGELOG.md`, ADRs, code comments). Where a sentence reaches
for one, rewrite it instead with a comma, colon, period, parentheses, or a
conjunction, whichever the sentence actually wants; never do a blind
character substitution.
