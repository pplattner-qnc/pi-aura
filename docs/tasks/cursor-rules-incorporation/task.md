---
kind: task
type: grilling
slug: cursor-rules-incorporation
title: Decide how the 16 Cursor .mdc blueprint rules are incorporated
map: engineering-foundation-sync
status: done
blocked_by: []
slices: []
---

# DECISION RECORDED — grilling complete

Shared understanding confirmed by the user on 2026-08-21. The design tree has
been fully visited. This section is the completion evidence required by the
grilling resource: final decision, alternatives considered, constraints, and
dependent-task implications. The full per-question trail follows.

## Final decision (consolidated)

### Single directory + frontmatter-driven dispatch (the simplification)

All 15 included `.mdc` files live in **one directory**:
`skills/engineering-workflow/resources/rules/`. No split between "verbatim
reference copies" and "adapted output" — they're just the `.mdc` files. The
sync three-way flow reconciles them in place (edits/adds/deletes like any
other mirrored file). The manifest's `localPath` mapping (Q8 of the first
grilling) points all rules into this one directory.

A **single extension** (`extensions/engineering-rules.ts`, new file, one
concern per extension) reads each `.mdc` file's frontmatter at
`session_start`/`before_agent_start` and dispatches by attach mode:

| Frontmatter | Disposition (handled by the extension) |
|---|---|
| `alwaysApply: true` | Append the rule body to the system prompt every turn (always-on). |
| `globs:`, `alwaysApply: false` | List the rule (path + globs) in the system prompt every turn; agent `read`s it on demand (the `claude-rules.ts` pattern). |
| neither (manual) | List the rule in the system prompt every turn; `@mention`-able. |

**No generated `AGENTS.md`.** The extension is the single dynamic loader for
all rule dispositions; `AGENTS.md` (context-file) is not used for rules. This
keeps one directory, one extension, frontmatter-driven dispatch, no codegen
step, nothing to keep in sync. (Chosen over generating `AGENTS.md` from the
always-on 7 because we're already running the extension for the other
rules — having it handle all dispositions is simpler than splitting always-
on into a static file and the rest into the extension.)

### `@mention` is a universal overlay

All 15 included rules are `@mention`-able, regardless of baseline disposition.

- Trigger char: **`@`** (chosen, with the caveat that the provider must defer
  to the built-in path provider when the token after `@` doesn't start with
  `rule:` — to be confirmed during implementation; fall back to a dedicated
  char like `^` if `@` collision proves messy).
- The autocomplete provider (`ctx.ui.addAutocompleteProvider`, triggerCharacters
  `["@", ...]` — pi supports custom trigger chars; `github-issue-autocomplete.ts`
  is the template) offers the list of all 15 rules; selecting one inserts a
  token like `@rule:tracker-jira`.
- A `before_agent_start` hook in `engineering-rules.ts` scans the user's
  prompt for `@rule:<name>` tokens and appends the corresponding rule body to
  the system prompt for that turn (deterministic injection; the
  `engineering-workflow` skill's docs mention the convention but the hook is
  what makes it work).
- `@`-mentioning an always-on rule is a harmless duplicate (re-appends); the
  frontmatter controls only the *baseline* disposition, with `@mention` as a
  universal on-demand overlay.

### System-prompt listing of non-auto-loaded rules

Per the user's requirement: the extension lists in the system prompt every
rule that is **not** auto-loaded — i.e. the 5 glob-attached + the 2 manual
(the 7 always-on are already injected, so listing them would be redundant).
Wait, reconsider: the user said "all description-discovered rules" should be
mentioned in the system prompt, and separately that all 15 are `@mention`-
able. Reconciling: the extension lists **all non-always-on rules** (glob +
manual = 7) in the system prompt every turn, so the agent knows they exist
and can `read` or `@mention` them. The always-on 7 are injected as bodies,
not listed. (If the implementer finds it cleaner to list all 15, that's fine
too — the only hard requirement is that non-auto-loaded rules are listed.)

### Which rules are included

All 16 except **`tracker-aura`** (15 included). `tracker-aura` is marked
`ignored: true` in the manifest (with a mandatory `ignoreReason`), meaning
"reconciled as not belonging in this repo" — this repo talks to Aura via
the `aura` skill / REST client, not via task-lifecycle skills reading an
`AGENTS.md → Tracker` adapter, so the Aura tracker adapter rule doesn't
apply here.

Partition of the 15 included rules (by baseline disposition, read from each
file's frontmatter):

- **7 always-on** (`alwaysApply: true`): `general-code-quality`,
  `general-db-destructive-ops`, `general-english-comments`,
  `general-language-policy`, `general-shared-state-and-handoff`,
  `general-ai-docs-structure`, `tracker-selection`. All included per the
  user's "they're there for a reason" — even the anwalt.de-structural ones,
  injected as-is.
- **5 glob-attached** (`globs:`, `alwaysApply: false`):
  `general-markdown-format`, `locale-json-safety`,
  `task-artifact-conventions`, `task-phase-tracking`,
  `task-preflight-checks`.
- **2 manual** (`alwaysApply: false`, no globs): `tracker-jira`,
  `tracker-mirror`.

(All 15 are also `@mention`-able as a universal overlay.)

### Manifest additions (from the first grilling's Q8 + this grilling)

The drift manifest (`.pi/...`) gains:

- **`ignore` flag + mandatory `ignoreReason`** per entry: instead of a local
  hash, an entry can be `ignored: true` with an `ignoreReason`, meaning
  "reconciled as not belonging in this repo" (used for `tracker-aura`).
- **`localPath` mapping** per entry: flexible target path so adapted files
  can land anywhere; for rules, all point into
  `skills/engineering-workflow/resources/rules/`.

### Description-discovered rules are resources, not invokable skills

Per the user's "make them into the resources, but also make sure to include
a system prompt mention of all description-discovered rules": the rules are
**not** separate pi skills (no `/skill:general-code-quality` — there's no
per-skill disable of `/skill:name` in pi, and making each rule a skill is
structurally wrong: a skill carries a *workflow*, a rule carries a
*guardrail*, per `general-ai-docs-structure` itself). Rules live as
`resources/rules/*.mdc` files the `engineering-workflow` skill surfaces on
demand + the `engineering-rules.ts` extension makes active. There is no
`/skill:<rule>` to invoke because there's no such skill — achieving the
user's "cannot be user-invoked" goal by construction.

## Important alternatives considered

- **`AGENTS.md` digest for the always-on 7** (Q1, prev round) — rejected:
  a static file can't dynamically read 7 `.mdc` bodies; would need codegen,
  and the extension is already running for the other rules.
- **Reference-only verbatim (no enforcement)** — rejected: the user wants
  rules active via their native pi mechanism.
- **Adapt all 16 into pi instruction extensions** — rejected: mixes a sync
  task with a porting task; the frontmatter-driven extension handles
  dispositions without porting each rule.
- **Make each rule a pi skill** — rejected: structurally wrong (rule ≠
  workflow) and can't disable `/skill:name` per-skill.
- **`@`-mention for only the 2 manual rules** — rejected: user wants all 15
  `@mention`-able.
- **Generated `AGENTS.md`** — rejected in favor of the extension handling
  all dispositions (one mechanism, no codegen).
- **Split rules across reference/ vs adapted/ dirs** — rejected: since
  every rule uses a custom mechanism, one directory + frontmatter dispatch
  is simpler.

## Constraints

- `engineering-rules.ts` is a new extension in `extensions/` (one concern
  per extension; keeps `aura-skill-instruction.ts` focused on the aura-skill
  reminder). It must be added to `package.json` `pi.extensions`.
- The extension reads `.mdc` frontmatter to dispatch; it must handle the
  three attach modes (`alwaysApply: true`, `globs:` + `alwaysApply: false`,
  neither) and the universal `@mention` overlay.
- The `@`-mention provider must defer to the built-in path provider when
  the token after `@` doesn't start with `rule:` (to avoid clobbering pi's
  `@file` path syntax); fall back to a dedicated char if this proves messy.
- Rules are **not** pi skills; there is no `/skill:<rule>` command.
- The manifest gains `ignored` + `ignoreReason` + `localPath` fields.
- `tracker-aura` is the only ignored rule.
- The mirror is read-only; corrections go to the wiki, then re-sync.

## Dependent-task implications

- **`engineering-workflow-skill`** task: scope now includes the
  `resources/rules/` directory (all 15 `.mdc` files) as part of the mirror,
  NOT `resources/blueprint/rules/` (the original location in the first
  grilling — superseded by this grilling's "one directory" decision).
- **`engineering-sync-skill`** task: scope includes the manifest's
  `ignored`/`ignoreReason`/`localPath` fields; the sync utility must handle
  the ignore flag (don't fetch/record `tracker-aura`) and the flexible
  path mapping for rules.
- **New task: `engineering-rules-extension`** — build the
  `extensions/engineering-rules.ts` extension: frontmatter dispatch
  (always-on inject / glob list / manual list), universal `@mention`
  provider + `before_agent_start` resolver, system-prompt listing of non-
  auto-loaded rules. Register in `package.json` `pi.extensions`.

## Remaining fog / newly discovered work

- Exact `@`-collision behavior (defer to built-in path provider vs switch
  to a dedicated char) — confirm during implementation of
  `engineering-rules-extension`.
- Whether to list all 15 or only the 7 non-always-on rules in the system
  prompt — implementer's call; the hard requirement is that non-auto-loaded
  rules are listed.

---

# Full per-question trail (for the implementer)

## Round 1 — disposition

### Q1 — Disposition of the 16 `.mdc` rules

User decision (after open discussion + reviewing all 16 rule bodies): use
the **native pi mechanism per rule**, include **all 16 except
`tracker-aura`**, and add manifest support for an **`ignore` flag (with
mandatory `ignoreReason`) + `localPath` mappings**.

## Round 2 — mechanisms (pi loading capabilities research)

Research findings (pi docs + examples):

- **Context files (`AGENTS.md`/`CLAUDE.md`)** — pi's native always-on
  mechanism, loaded at startup from `~/.pi/agent/`, parent dirs, cwd.
- **Skills** — pi's native description-discovered, on-demand `read`
  mechanism (progressive disclosure). Per-skill `disable-model-invocation`
  frontmatter hides from auto-discovery (keeps `/skill:name`); **no
  per-skill disable of `/skill:name`**. `enableSkillCommands` is global.
- **Extensions** — programmatic; can append to `systemPrompt` in
  `before_agent_start` (always-on) and register autocomplete providers
  with custom `triggerCharacters` (e.g. `@`, `#`, `$`).
- **Glob-attached rules** — NOT supported out of the box; the shipped
  `examples/extensions/claude-rules.ts` implements the list-and-`read`
  pattern (lists rule filenames in the system prompt, agent `read`s the
  relevant one on demand).
- **Manual `@mention`** — NOT built-in, but achievable via
  `ctx.ui.addAutocompleteProvider` with a custom trigger char + a
  `before_agent_start` resolver.

### Q1 (R2) — Always-on 7 mechanism → extension (not AGENTS.md)

Chose: the extension handles all dispositions (no generated `AGENTS.md`).
One directory, one extension, frontmatter-driven dispatch, no codegen.

### Q2 (R2) — Glob-attached 5 → claude-rules.ts-style extension

Chose: new file `extensions/engineering-rules.ts` (one concern per
extension); list-only pattern mirroring `claude-rules.ts` (list rule paths
+ globs in the system prompt, agent `read`s on demand — not true
glob-matching, which pi doesn't expose).

### Q3 (R2) — Manual `@mention` → extend via autocomplete provider

Chose: `ctx.ui.addAutocompleteProvider` with `triggerCharacters: ["@"]`,
dispatching to the built-in path provider when the token isn't `rule:`.
`github-issue-autocomplete.ts` is the template.

### Q4 (R2) — Description-discovered rules → resources, not skills

Chose: rules are `resources/rules/*.mdc`, surfaced by the
`engineering-workflow` skill + made active by the extension. Not pi
skills — no `/skill:<rule>` (structurally wrong + can't disable the
command per-skill). Plus a system-prompt mention of all description-
discovered (non-auto-loaded) rules.

## Round 3 — final frontier

### Q1 (R3) — `@`-mention trigger char → `@`

Chose `@` (familiar; provider defers to built-in path provider when the
token after `@` doesn't start with `rule:`). Fall back to a dedicated char
if collision proves messy during implementation.

### Q2 (R3) — `@mention` runtime → before_agent_start hook

Chose: a `before_agent_start` hook in `engineering-rules.ts` scans the
prompt for `@rule:<name>` tokens and appends the rule body for that turn.
Deterministic injection; the skill docs mention the convention but the
hook makes it work.

### Q3 (R3) — Which rules are `@mention`-able → all 15

Chose: all 15 included rules are `@mention`-able (universal overlay over
the baseline disposition).

### Q4 (R3) — System-prompt listing of non-auto-loaded rules → extension

Chose: the extension lists all non-always-on rules (glob + manual = 7) in
the system prompt every turn so the agent knows they exist and can `read`
or `@mention` them. The always-on 7 are injected as bodies, not listed.

## The simplification (post-R3)

Since every rule uses a custom mechanism, all 15 `.mdc` files live in one
directory (`skills/engineering-workflow/resources/rules/`) and the
extension dispatches by frontmatter. No split between reference/ and
adapted/ for rules. This supersedes the first grilling's
`resources/blueprint/rules/` location for rules.
