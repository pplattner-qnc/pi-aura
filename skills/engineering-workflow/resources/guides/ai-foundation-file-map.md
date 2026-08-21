# AI Foundation File Map — Plain Language

> **Pi-mirror note.** Pi-adapted copy of the `engineering-foundation` wiki page; the wiki is the source of truth, kept fresh by the `engineering-sync` skill. The body is unchanged — this page carries no Cursor-specific tool-call edges, only references to the target repo's own files (AGENTS.md, CLAUDE.md, .cursor/rules, .agents/skills).


**This page has a source and is not one itself.** What each file below is for is decided by the rule `general-ai-docs-structure` and lived out in this house's `AGENTS.md` (its `## Configuration` table, its rule map, and its skill inventory). This page only renders that in plain language, for a repository owner who does not want to read a rule file to understand what they are looking at. If this page and `AGENTS.md`/`general-ai-docs-structure` ever disagree, the rule and `AGENTS.md` are right — that disagreement is exactly the kind of drift `ai-sync` exists to catch.

## The entry files

| File | What it does | Who reads it | Where it's decided |
|---|---|---|---|
| `AGENTS.md` | The one tool-neutral configuration layer: every repo-specific value (tracker, infra commands, worklog path, …) plus pointers to the rule map and skill inventory. Never carries rule *content* itself. | Any AI agent, and any human wanting a repo's configuration at a glance | `general-ai-docs-structure` |
| `CLAUDE.md` | A thin shim for Claude Code, which does not read `AGENTS.md` natively and does not evaluate rule `globs`. Carries one `@import` line per always-on rule plus a pointer to `AGENTS.md` — no content of its own. | Claude Code specifically | `general-ai-docs-structure` |

## The rule tree — `.cursor/rules/anwaltde/`

| Location | What it holds | Who reads it |
|---|---|---|
| `universal/` | Rules liftable to any repository in this house — no repo-specific fact baked in | Cursor automatically (via its attach mode); Claude Code only if imported in `CLAUDE.md` |
| `project/` | Rules genuinely specific to *this* repository — either always were, or started as a `universal/` rule and were deliberately adapted | same as above |

A rule's attach mode is exactly one of two: `alwaysApply: true` (always in context — must have a `CLAUDE.md` import) or scoped by `globs` (attached only when a matching file is open). A rule is never both.

Moving a rule from `universal/` to `project/` is a **move, not a copy** — two copies with the same `globs` would give an agent two contradictory instructions on the same topic. A move carries three mandatory follow-up edits (the `CLAUDE.md` import if it is always-on, the origin column in `AGENTS.md`'s rule map, and any skill-inventory path pointing at it), and is logged in `.aura/ai-setup/adaptations.md` with which universal original it came from, the source version at the time, and why. This convention lives in `general-ai-docs-structure` itself.

## The skill tree — `.agents/skills/anwaltde/`

| Location | What it holds |
|---|---|
| `universal/` | Slash-command skills liftable to any repository in this house |
| `project/` | Slash-command skills genuinely specific to this repository |

A skill's slash command comes from its own frontmatter `name` field, never from its folder name — and every skill must be listed in `AGENTS.md`'s `## Skills` table with a `name` and `description`, and its path must actually exist.

Rules and skills outside `anwaltde/` (vendor or third-party) are a different thing entirely — they are not this house's own control artifacts and are never touched by `ai-setup` or `ai-sync`.

## The decision memory — `.aura/ai-setup/`

| File | What it holds |
|---|---|
| `index.md` | A small register of the other two files — no `type` of its own |
| `decisions.md` | One line per checkpoint that needed a real decision (not just a file check): what was decided, why, and when — including "this deliberately does not apply here" with its reason, so the next run doesn't ask again |
| `adaptations.md` | Which rule or skill was moved from `universal/` to `project/`, from which universal original, at which source version, for what reason and scope |

This directory is committed to the repository (not gitignored) because it is shared knowledge for the next developer or agent — but it deliberately stays outside `.aura/docs/`, the documentation bundle that gets wiped and regenerated on every doc run, so it survives that process untouched. Its readers are the two skills themselves (`ai-setup` writes to it, `ai-sync` reads it), not Aura's own ingest — the directory does not appear in Aura's knowledge search.

## Two configuration keys that tie it together

`AGENTS.md`'s `## Configuration` table carries two keys specific to this system: where the decision memory lives (pointing at `.aura/ai-setup/`), and what "central" currently means for `ai-sync`'s comparisons (today this repository via git; the wiki once the MCP-side distribution ships). Both are owned by `general-ai-docs-structure`, and neither skill hardcodes either value.

## Related pages

- [AI-Readiness Rollout](../workflow/ai-readiness-rollout) — the four-bucket reconciliation model and the six invariants both skills obey when acting on the files above.
- [AI-Readiness Standard for Repositories](./ai-readiness-standard) — the full normative standard these files exist to satisfy.
