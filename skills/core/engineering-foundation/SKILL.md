---
name: engineering-foundation
description: The anwalt.de engineering canon — development workflow (idea → merge), developer guides (LLM selection, coding conventions, PR & review, deployment), the AI-readiness standard, the house rules, and the blueprint skills. Use when the user asks about engineering process, PR/review conventions, deployment via Bitbucket Pipelines, the task lifecycle, AI-readiness, or any rule referenced from the engineering-foundation wiki space.
---

# Engineering Foundation

This skill is an entry point for the **engineering-foundation canon** — how we
build software at anwalt.de. The canon itself (workflow, guides, house rules,
blueprint skills) is **not shipped in this package**: it lives in the
`engineering-foundation` Aura wiki space, and each repo that wants it is
responsible for mirroring the pieces it needs into its own tree (e.g. adapted
`.mdc` rules under `.cursor/rules/`).

This package provides the *plumbing* that makes those per-repo mirrors active
in a pi session — the `engineering-rules` extension
(`extensions/engineering-rules.ts`), which reads the repo's `.cursor/rules/*.mdc`
and dispatches them by frontmatter (always-on / glob / manual), with a
configurable skip list. See the extension file for the settings contract.

## What this skill does

When the user asks about the canon, this skill points them at the right place:

- **House rules** — they live in the repo's `.cursor/rules/` (synced per-repo).
  The `engineering-rules` extension injects the `alwaysApply: true` ones every
  turn and lists the rest on demand. Use the `read` tool on the `.mdc` file
  in `<cwd>/.cursor/rules/` when a specific rule is relevant, or mention it
  with `@rule:<name>`.
- **Workflow, guides, blueprint skills** — these are wiki content. For the
  authoritative, up-to-date text, read the `engineering-foundation` wiki space
  via the `aura` skill (the `aura-mcp-dev` MCP server's knowledge-node tools),
  rather than expecting a static copy in this package.

## What this skill deliberately does not do

- It does not bundle a local mirror of the wiki. The earlier mirror +
  `engineering-sync` maintenance skill were removed from this package because
  keeping the canon fresh is a **per-repo concern**, not a package concern.
  Repos that want the canon mirrored locally do that in their own tree.
- It does not ship any `.mdc` rules. Rules are read from the repo's cwd by
  the `engineering-rules` extension.
