---
kind: task
type: feature
slug: engineering-rules-extension
title: Build the engineering-rules.ts extension (frontmatter dispatch + universal @mention + system-prompt listing)
map: engineering-foundation-sync
status: done
blocked_by:
- engineering-workflow-skill
slices: []
---

# engineering-rules.ts extension

## Outcome

Build `extensions/engineering-rules.ts` — a single extension that reads the
15 included `.mdc` rule files from
`skills/engineering-workflow/resources/rules/`, dispatches each by its
frontmatter attach mode, provides a universal `@mention` overlay for all 15,
and lists the non-auto-loaded rules in the system prompt every turn.

## Scope

### In scope

- `extensions/engineering-rules.ts` — new file (one concern per extension;
  keeps `aura-skill-instruction.ts` focused on the aura-skill reminder).
- Add it to `package.json` `pi.extensions`.
- **Frontmatter-driven dispatch** at `session_start` (scan the rules dir)
  + `before_agent_start`:
  - `alwaysApply: true` (7 rules) → append the rule body to
    `event.systemPrompt` every turn (always-on).
  - `globs:`, `alwaysApply: false` (5 rules) → list the rule path + globs
    in the system prompt every turn (the `claude-rules.ts` pattern; agent
    `read`s on demand). Not true glob-matching (pi doesn't expose that);
    list-and-`read`.
  - neither (2 rules: `tracker-jira`, `tracker-mirror`) → list in the
    system prompt + `@mention`-able.
- **Universal `@mention` overlay** for all 15 rules:
  - `ctx.ui.addAutocompleteProvider` with `triggerCharacters: ["@", ...]`
    (pi supports custom trigger chars; `github-issue-autocomplete.ts` is
    the template).
  - When the text after `@` starts with `rule:`, offer the 15 rules;
    selecting one inserts a token like `@rule:tracker-jira`.
  - **Defer to the built-in path provider** when the token after `@`
    doesn't start with `rule:` (avoid clobbering pi's `@file` path syntax).
  - Fall back to a dedicated char (e.g. `^`) if the `@` collision proves
    messy during implementation.
- **`before_agent_start` `@rule:` resolver** — scan the user's prompt for
  `@rule:<name>` tokens and append the corresponding rule body to the
  system prompt for that turn (deterministic injection; the
  `engineering-workflow` skill's docs mention the convention but this hook
  makes it work).
- **System-prompt listing of non-auto-loaded rules** — the extension lists
  the non-always-on rules (glob + manual = 7) in the system prompt every
  turn so the agent knows they exist and can `read` or `@mention` them.
  (Implementer may list all 15 if cleaner; the hard requirement is that
  non-auto-loaded rules are listed.)
- **Ignore `tracker-aura`** — the extension must not load or list rules
  marked `ignored: true` in the manifest (`.pi/...`). Concretely, skip
  `tracker-aura.mdc`. (The manifest's `ignored`/`ignoreReason` fields are
  defined by the `engineering-sync-skill` task; this extension reads them
  to know what to skip. If the manifest doesn't exist yet during initial
  bring-up, the extension can hardcode the `tracker-aura` skip and switch
  to manifest-driven once the sync utility lands.)

### Out of scope

- Generating or maintaining an `AGENTS.md` for rules (rejected: the
  extension handles all dispositions dynamically; no codegen).
- Making rules into pi skills (rejected: structurally wrong + can't
  disable `/skill:name` per-skill; rules are resources).
- True glob-matching (pi doesn't expose "files in context"); the
  list-and-`read` pattern is the shipped idiom.
- The sync utility / manifest format (that's `engineering-sync-skill`);
  this extension only *reads* the manifest's `ignored` flags.

## Acceptance criteria

- `extensions/engineering-rules.ts` exists, is registered in
  `package.json` `pi.extensions`, and loads without errors.
- The 7 `alwaysApply: true` rules' bodies appear in the system prompt
  every turn (verified via `ctx.getSystemPrompt()` or a test).
- The 5 `globs:` rules are listed (path + globs) in the system prompt; the
  agent can `read` them on demand.
- The 2 manual rules are listed + `@mention`-able.
- All 15 rules are `@mention`-able: typing `@rule:` offers the 15 rules;
  selecting one inserts `@rule:<name>`; the resolver appends the rule body
  for that turn.
- `@` followed by a non-`rule:` token defers to the built-in path
  provider (no clobbering of `@file`).
- `tracker-aura` is never loaded or listed.

## Constraints

- One concern per extension — this file owns rule dispatch + `@mention`;
  it does not touch the aura-skill reminder (that's
  `aura-skill-instruction.ts`).
- The extension reads `.mdc` frontmatter to dispatch; it must not
  hardcode the disposition per rule (read the frontmatter).
- Rules are NOT pi skills; there is no `/skill:<rule>` command.
- The `@`-mention provider must defer to the built-in path provider for
  non-`rule:` tokens.
- `tracker-aura` is ignored (manifest-driven once the sync utility
  exists; hardcoded skip until then).

## Notes

- This task depends on `engineering-workflow-skill` (which deposits the
  15 `.mdc` files into `resources/rules/`).
- The `claude-rules.ts` example and `github-issue-autocomplete.ts`
  example in the pi docs are the two templates for this extension
  (rule-listing pattern + autocomplete provider pattern respectively).
- The extension is loaded only after project trust (project-local
  extension), which is fine for a pi package's consumers.
