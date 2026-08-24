# Engineering Foundation

> **Pi-mirror note.** Pi-adapted copy of the `engineering-foundation` wiki page; the wiki is the source of truth, kept fresh by the `engineering-sync` skill. The body is unchanged — this page carries no Cursor-specific tool-call edges, only references to the target repo's own files (AGENTS.md, CLAUDE.md, .cursor/rules, .agents/skills).


This space is the canonical home for how we build software at anwalt.de — the normative rules that govern engineering practice, and the executable building blocks (skills, entry files, guides) that agents and developers install into repositories.

It exists to give every piece of guidance exactly **one** home, addressed in exactly **one** way, so both humans and AI agents can find and trust it (see ANW-7787 / ANW-7799).

## How to read a page here

Every content page (not this one, not `log`) carries a YAML frontmatter block that answers four questions. Read the frontmatter before the body — it tells you what kind of thing you are looking at and what to do with it.

### 1. `type` — what kind of building block is this?

`type` names the **kind** of the artifact:

- **Guide** — normative, explanatory guidance (the "why" and "how we decided").
- **Rule** — an always- or glob-scoped instruction file consumed by an AI agent (e.g. a Cursor `.mdc` rule).
- **Skill** — an executable `SKILL.md` an agent can invoke to perform a defined workflow.
- **Entry File** — a project-root shim (e.g. `AGENTS.md`, `CLAUDE.md`) that wires rules/skills into a specific tool.
- **Playbook** — a narrative, step-by-step workflow description (e.g. the task lifecycle).

### 2. `tags` (frontmatter) — what is the distribution class?

The **frontmatter** `tags` field (not the node's tag column shown in the tree UI — `knowledge_get_document` does not return that column at all) says how this content travels:

- **`universal`** — the default form every target repo installs as-is; deviating is a deliberate **adaptation** (move the file to `project/` per `general-ai-docs-structure`'s adaptation convention), not an unattributed local edit of the universal copy.
- **`project`** — a template to adapt per target project; not copy-paste safe as-is.
- **`reference`** — read-only background material. It is **not** installed anywhere; it exists to be read and linked, not distributed.

### 3. `resource` — where does this belong?

- For `universal` / `project` content, `resource` is the **target path** in the repository that installs it (e.g. `.cursor/rules/anwaltde/universal/general-code-quality.mdc`).
- For `reference` content, `resource` is the **origin path** — where this was copied from, in our own repo or another wiki space.

### 4. Addressing — how do you link to a page?

Always address a page by its **node UUID** or by its **slug path** within this space (e.g. `guides/developer-guides`). Never address by `source_path` (not settable on creation, stays `null`) and never by `resource` — `resource` is metadata about origin/destination, not a lookup key.

## Finding your way around (progressive disclosure)

The tree is organised so you can go as deep as you need and no deeper:

- **`guides/`** — narrative Guides, the normative "how we build" reference. Start with `guides/ai-readiness-standard` (what makes a repository AI-ready in this house, and the objective criteria it is measured against); then `guides/developer-guides` and `guides/ai-foundation-file-map`.
- **`workflow/`** — the task-lifecycle Playbook (idea → ticket → slice → finish).
- **`blueprint/`** — the house rules and skills as real file assets (not rendered wiki pages): `blueprint/rules/` (universal Cursor rules, `.mdc`), `blueprint/skills/` (universal skills, one folder per skill, `SKILL.md` plus any companion files), and `blueprint/manifest.yaml` listing every block with its install target, checksum, version and source commit. This is what `ai-setup`/`ai-sync` and the `aiSetup`/`getBlueprintFiles` MCP tools read; it superseded the earlier `rules/`, `skills/` and `entry/` page trees (AURA-1719).

Each folder is self-explanatory once you're inside it; you do not need a map of the whole tree to use one corner of it.

## Change history

See `log` for a dated record of structural changes to this space.
