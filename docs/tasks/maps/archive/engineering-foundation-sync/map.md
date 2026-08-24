---
kind: map
slug: engineering-foundation-sync
title: Mirror the engineering-foundation wiki space into pi-aura as a first-class engineering canon
status: done
tasks:
- blueprint-skills-and-sync-design
- cursor-rules-incorporation
- move-skills-to-core
- engineering-workflow-skill
- engineering-sync-skill
- seed-engineering-mirror
- adapt-blueprint-skills
- engineering-rules-extension
---

# engineering-foundation-sync

## Destination

The `engineering-foundation` Aura wiki space is the authoritative engineering
canon (development workflow, developer guides, deployment via Bitbucket
Pipelines, the house rules, and the blueprint skills). Fetching it live via
MCP every turn is cumbersome and costs LLM context. The goal is a first-class
local home in this pi package that an agent reaches through a pi skill, kept
fresh against the wiki with an automated drift check.

Concretely, done looks like:

- An `engineering-workflow` pi skill surfaces the canon from a bundled
  `resources/` tree so the agent reads local files instead of doing wiki
  round-trips.
- The full `engineering-foundation` content (guides, workflow, blueprint rules
  + skills + manifest) is mirrored locally.
- A sync skill (driving a utility script) pulls the latest state from the
  wiki on demand; a freshness gate flags drift (e.g. in CI) so stale content
  cannot ship silently.
- The existing `skills/aura/resources/process/` (from the parallel
  `how-we-work-in-aura` node — bird's-eye, all roles) stays untouched; the two
  are independent and both can coexist.

## Constraints

- This is a pi package (not a Cursor repo, not the anwalt.de app repo).
- The `aura-mcp-dev` MCP server exposes `getBlueprintFiles` (for
  `blueprint/` files) and `getKnowledgeNode` / `getKnowledgeTree` (for the
  wiki nodes). `manifest.yaml` carries sha256 + version per blueprint file —
  a native drift primitive.
- Build pipeline: `scripts/src/*.ts` → esbuild → `skills/<skill>/dist/*.mjs`
  with `make` targets (`build`, `typecheck`, `codegen`). New scripts go through
  this pipeline.
- Package shape: `package.json` exposes `pi.skills: ["./skills"]` and
  `pi.subagents.agents: ["./agents"]`. Top-level `skills/<name>/SKILL.md`
  becomes an invokable pi skill; nested dirs under a skill are resources.
- The anwalt.de Jira/Bitbucket/`task verify`/worktree/`fork-db` assumptions in
  the blueprint skills are acceptable — those MCPs are (or will be) installed.
  The skills being Cursor-flavoured is not a blocker by itself.
- The older `skills/aura/resources/process/` is parallel, not overlapping;
  leave it alone.

## Decisions so far

- The 14 blueprint skills and the 16 `.mdc` Cursor rules are part of the canon
  the mirror must represent — not dropped.
- The 14 blueprint skills ship **registered + pi-adapted at the edges**
  (Cursor-specific tool calls adapted to pi idioms; bodies otherwise
  verbatim).
- **Two skills, split by advertising:** `engineering-workflow` (user-facing,
  top-level) and `engineering-sync` (non-advertised, repo-local at
  `.pi/skills/engineering-sync/`).
- **Sync utility uses the existing REST client + keyring PAT**
  (`createDefaultAuraClient` / `@pi-aura/shared` generated client from
  `openapi/openapi.yaml`), not MCP.
- **Drift gate = committed JSON manifest** keyed by wiki canonical identity
  (blueprint path / knowledge-node uuid), storing local sha256 + Aura edit
  metadata + optional `adaptedSha256`.
- **Derivative skills reconciled by tracking source + output separately:**
  verbatim source under `resources/blueprint/...` (sha256-checked vs
  `manifest.yaml`); adapted skill generated from it by an adapter. Gate
  checks verbatim source; second check confirms adapted output matches a
  fresh adapter run.
- **Repo layout:** existing `skills/aura*` → `skills/core/aura*`;
  `skills/engineering-workflow/` holds the user-facing canon skill **and**
  adapted blueprint skills as `skills/engineering-workflow/<name>/SKILL.md`;
  `engineering-sync` at `.pi/skills/`. **`package.json` `pi.skills` needs no
  change** (single recursive entry covers all), but the move ripples into
  Makefile, esbuild config, and ~20 doc path references that must be updated.
- **Three-way reconciliation IS the adaptation mechanism (all files).** No
  deterministic adapter; the agent is the mergetool: `OLD_REMOTE` +
  `NEW_REMOTE` + `CURRENT` (our pi-adapted version) → "new wiki + our pi
  adaptations". Applies to every file (verbatim docs + adapted skills); the
  adaptation is only for making content work with the pi agent, not a content
  change. Verbatim reference copies are kept as the `OLD_REMOTE`/`NEW_REMOTE`
  source of truth. Manifest stores both wiki sha256 and local adapted sha256.
- **Mirrored files are committed; sync skill is package-author-only.**
  The skills/resources ship to end users; `engineering-sync` is a maintenance
  tool for the author, not an end-user skill (its description must say so).
  Git history preserves deletions, so **deletions skip the three-way flow**
  (`fetch` auto-deletes the local file + records the removal); only edits and
  additions go through the three-way reconciliation.
- **Three-way flow edges:** additions write only `NEW_REMOTE_<name>` (agent
  creates the file); edits write `c.OLD_REMOTE.md` + `c.NEW_REMOTE.md` +
  `c.CURRENT.md` (**suffix** naming, in-place next to `c.md`, visible in
  `git status`); `finish` refuses on incomplete reconciliation.
- **`finish` refuses on incomplete reconciliation** (exits non-zero, prints
  unresolved files, does not update the manifest).
- **Manifest path: under `.pi/`** (not gitignored, invisible to user-facing
  skill discovery since pi only loads `SKILL.md` from `.pi/skills/`, not
  arbitrary JSON); exact filename TBC in implementation.
- **Initial seeding = first `fetch` with empty manifest** (no `init`
  subcommand); everything is "new", `NEW_REMOTE_*` written for all, agent
  reconciles, `finish` seeds the manifest.
- **Cursor `.mdc` rules (16) incorporated via a single frontmatter-driven
  extension.** All 15 included rules live in one directory
  (`skills/engineering-workflow/resources/rules/`); a new
  `extensions/engineering-rules.ts` reads each file's frontmatter and
  dispatches: `alwaysApply: true` → inject body every turn; `globs:` → list
  in system prompt (claude-rules.ts pattern); neither → list + `@mention`.
  All 15 are `@mention`-able via `ctx.ui.addAutocompleteProvider`\  (trigger `@`, deferring to the built-in path provider for non-`rule:`
  tokens) + a `before_agent_start` resolver. No generated `AGENTS.md`.
  `tracker-aura` is ignored (`ignored: true` + `ignoreReason` in the
  manifest). Rules are resources, NOT pi skills (no `/skill:<rule>`).
- **Manifest gains `ignored` + `ignoreReason` + `localPath` fields**
  (ignore flag = reconciled as not belonging in this repo; localPath =
  flexible target path; for rules all point into `resources/rules/`).
- `skills/aura/resources/process/` is unrelated (parallel wiki node,
  bird's-eye) and stays as-is with no cross-link.

## Fog

- All design questions settled across both grillings (blueprint-skills-
  and-sync-design + cursor-rules-incorporation). Frontier empty.
- Implementation tasks graduate from Fog: (1) `engineering-workflow` skill
  + mirror non-skill content (now incl. `resources/rules/` one-dir); (2)
  `engineering-sync` skill + utility (now incl. manifest
  `ignored`/`ignoreReason`/`localPath` fields); (3) move existing skills to
  `skills/core/` + update 4 rippling path refs; (4) first-pass adaptation
  of the 14 blueprint skills; (5) **new** `engineering-rules-extension`
  (frontmatter dispatch + universal `@mention` + system-prompt listing).
- Exact `@`-collision behavior (defer to built-in path provider vs
  dedicated char) — confirm during implementation of
  `engineering-rules-extension`.
- Whether to list all 15 or only the 7 non-always-on rules in the system
  prompt — implementer's call; the hard requirement is that non-auto-
  loaded rules are listed.

## Out of scope

- Adapting the 14 blueprint skills into pi-native skills (separate effort per
  skill; this map only carries them, it does not port them). If grilling
  lands on "adapt", that work spawns a new map.
- Replacing or rewriting `skills/aura/resources/process/` (independent canon,
  left as-is).
- Mirroring other wiki spaces (only `engineering-foundation`).
- Editing the wiki content itself — the mirror is read-only; corrections go
  to the wiki, then re-sync.

## Deviation: `adapt-blueprint-skills` overtook by the seed

The `seed-engineering-mirror` run (commit `7def2b1`, "adapt on first seed
  too — no verbatim copies kept") changed the seeding flow *after* the map's
  decisions were written: the seed adapts every file in place, so the 14
  blueprint skills arrived already pi-adapted at
  `skills/engineering-workflow/resources/blueprint/skills/`. The
  `adapt-blueprint-skills` task (originally scoped as a from-scratch
  adaptation from verbatim sources) therefore became (1) fixing the 8
  residual Cursor-edges the seed missed and (2) moving the 14 skills to the
  design-Q6 top-level layout `skills/engineering-workflow/<name>/SKILL.md` with
  the drift manifest + sync utility + router rewired to the new locations.
  The map's "verbatim source under `resources/blueprint/...` + adapted
  derivative generated from it" decision (Q5) is superseded in practice by
  the seed's adapt-in-place flow — there are no verbatim copies on disk; the
  manifest records `adaptedSha256` directly against the wiki `sourceSha256`.
  The three-way reconciliation model still holds for steady-state syncs.
