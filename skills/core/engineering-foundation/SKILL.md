---
name: engineering-foundation
description: Router and guide for the anwalt.de engineering canon, which lives in the "engineering-foundation" Aura wiki space. Use when the user asks about engineering process (idea → merge), PR/review conventions, coding standards, deployment via Bitbucket Pipelines, AI-readiness, the task lifecycle, the house rules, or the blueprint skills — or when you need to find your way around that wiki space.
---

# Engineering Foundation

The anwalt.de engineering canon lives in the Aura wiki space
**`engineering-foundation`**. Fetch it live via the `aura` skill / `aura-mcp-dev`
MCP; this package bundles none of it. Each repo mirrors the pieces it wants into
its own tree (e.g. `.cursor/rules/*.mdc`).

## Router — which node answers a question

| Question / topic | Node path (under `engineering-foundation`) |
|---|---|
| How to read a page in this space (frontmatter `type`/`tags`/`resource`, addressing) | `index` |
| What changed in the space, and when | `log` |
| AI-readiness — the criteria a house repo is measured against | `guides/ai-readiness-standard` |
| LLM selection / coding conventions / PR & review / deployment standards | `guides/developer-guides` (one doc, §1 LLM, §2 coding, §3 PR & review, §4 deployment) |
| Bitbucket pipeline variants, release/hotfix flow, CodeArtifact | `guides/deployment-ber-bitbucket-pipelines` |
| Plain-language map of every steering file/folder (AGENTS.md, .cursor/rules, .agents/skills, …) | `guides/ai-foundation-file-map` |
| The task-lifecycle playbook (idea → ticket → slice → finish) | `workflow/development-workflow` |
| AI-readiness rollout — the four-bucket reconciliation model + six invariants | `workflow/ai-readiness-rollout` |
| The house rules as `.mdc` files (universal Cursor rules) | `blueprint/rules/` (browse the tree for the list) |
| The blueprint skills (task-lifecycle, ai-setup/sync, pr-review, …) | `blueprint/skills/` (browse, or see `blueprint/manifest.yaml` for the authoritative list + install target + checksum + version) |
| The authoritative building-block list (install target, checksum, version, source commit) | `blueprint/manifest.yaml` |

**How to fetch a node** — two handoffs (prefer the first for short docs, the
second for long ones):

- **MCP (short docs, body into context):**
  `getKnowledgeNodeByPath({ slug: "engineering-foundation", path: "guides/developer-guides" })`
- **`aura.mjs` workdir model (long docs, body kept out of context):**
  `node skills/core/aura/dist/aura.mjs wiki get --slug "engineering-foundation/guides/developer-guides"`
  → body lands at `$WD/body.md`; read it with the `read` tool.

See the `aura` skill (`skills/core/aura/SKILL.md` → resources/usecases/wiki-knowledge.md)
for the full wiki verb set (`getKnowledgeTree`, `searchKnowledge`, …).

## Guide through the space

### Reading conventions (every content page carries frontmatter)

Read a page's frontmatter before its body — it tells you what kind of thing you
are looking at and how to treat it (the `index` node documents this in full):

- **`type`** — `Guide` (normative "why/how"), `Rule` (a `.mdc` an agent consumes),
  `Skill` (an executable `SKILL.md`), `Entry File` (a project-root shim like
  `AGENTS.md`), `Playbook` (a narrative workflow, e.g. the task lifecycle).
- **`tags`** — the distribution class: `universal` (the form every repo installs
  as-is), `project` (a template to adapt per repo), `reference` (read-only
  background, installed nowhere).
- **`resource`** — for `universal`/`project`, the **target path** in a repo that
  installs it; for `reference`, the **origin path** it was copied from.
- **Addressing** — always by **node UUID** or **slug path** (e.g.
  `guides/developer-guides`), never by `source_path` or `resource`.

### Progressive disclosure (go as deep as you need, no deeper)

The tree is organised so you can find one corner without mapping the whole:

- **`guides/`** — the normative "how we build" reference. Start with
  `guides/ai-readiness-standard`, then `developer-guides` and `ai-foundation-file-map`.
- **`workflow/`** — the task-lifecycle playbook.
- **`blueprint/`** — the rules and skills as real file assets (not rendered
  pages): `blueprint/rules/`, `blueprint/skills/`, and `blueprint/manifest.yaml`
  (the index of every block with install target + checksum + version). This is
  what `ai-setup`/`ai-sync` and the `aiSetup`/`getBlueprintFiles` MCP tools read.

### How `blueprint/` maps into a repo

The `blueprint/` subtree is the source; a repo installs pieces from it:

- **`blueprint/rules/<name>.mdc`** → the repo's `.cursor/rules/` (per-repo
  mirror). In a pi session these are read by the `engineering-rules` extension
  (`extensions/engineering-rules.ts`, shipped by this package): `alwaysApply: true`
  rules are injected into the system prompt every turn; `globs:` rules are
  listed on demand; the rest are `@rule:<name>`-able. Rules to skip are set via
  `aura.cursorRules.ignore` in `~/.pi/agent/settings.json` (global, all CWDs)
  and/or `<cwd>/.pi/settings.json` (project-local) — an array of globs relative
  to `.cursor/rules/`. See the extension file for the full settings contract.
- **`blueprint/skills/<name>/SKILL.md`** → the repo's `.agents/skills/` (or
  equivalent), where they become invokable pi sub-skills. This package does not
  ship them.

### Source of truth

The wiki is the source of truth. If a mirrored piece looks stale, re-fetch from
the wiki rather than editing the mirror by hand; if the wiki content itself is
wrong, the correction goes to the wiki, then re-sync downstream.
