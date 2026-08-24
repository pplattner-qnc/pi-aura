---
kind: task
type: feature
slug: adapt-blueprint-skills
title: First-pass pi-adaptation of the 14 engineering-foundation blueprint skills
map: engineering-foundation-sync
status: active
blocked_by:
- engineering-workflow-skill
- seed-engineering-mirror
slices:
- edge-fixes: done
- move-to-top-level
---

# First-pass pi-adaptation of the 14 blueprint skills

## Outcome

Produce the 14 pi-adapted, invokable pi skills at
`skills/engineering-workflow/<name>/SKILL.md`, adapted from the verbatim
blueprint sources at `skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md`
(deposited by `engineering-workflow-skill`). The adaptation makes each skill
work with the pi agent by rewriting Cursor-specific edges to pi idioms;
the substantive body is otherwise carried verbatim.

## Scope

### In scope

- One pi-adapted skill per blueprint skill (14 total), each at
  `skills/engineering-workflow/<name>/SKILL.md` with correct pi frontmatter
  (`name`, `description`).
- Adapt the Cursor-specific edges to pi idioms:
  - `AskQuestion` → pi's `ask_user_question` tool (note the 2–4 options
    constraint, the 16-char header limit, the "Type something." reserved row).
  - `SwitchMode` (Cursor plan/normal mode) → drop or replace with the pi
    equivalent if one exists (the agent works in normal mode; no plan-mode
    shim needed unless the skill relies on it — record the decision per
    skill).
  - `CreatePlan` → drop (pi has no plan-creation tool; the skill's plan
    output becomes a chat block).
  - `AGENTS.md` key lookups (`Merge target branch`, `Worktree root`,
    `Stack-token derivation`, `Test commands`, etc.) → keep the *concept*
    but note that the keys live in the target repo's `AGENTS.md` (which the
    anwalt.de repos have); the pi-adapted skill instructs the agent to read
    `AGENTS.md` rather than assume a pi-side register.
  - Keep the anwalt.de Jira/Bitbucket/`task`/worktree/`fork-db` assumptions
    (those MCPs are or will be installed); only the *tool-call shape* is
    adapted.
- The substantive body (workflow steps, quality bars, anti-patterns,
  checklists) is otherwise carried verbatim.
- Each adapted skill's `description` must make clear it targets the
  anwalt.de engineering workflow (so it's not invoked outside that context).

### Out of scope

- Rewriting the skills into pi-native equivalents (e.g. replacing the whole
  task lifecycle with pi's task-workflow). This is an edge-adaptation, not a
  port. A full port would spawn a new map.
- The 16 `.mdc` Cursor rules (that's `cursor-rules-incorporation`).
- The sync utility (that's `engineering-sync-skill`).

## Acceptance criteria

- 14 skills exist at `skills/engineering-workflow/<name>/SKILL.md`, each
  discoverable by pi (via `pi.skills: ["./skills"]` recursive discovery).
- Each adapted skill's frontmatter has `name` + `description`.
- No remaining `AskQuestion`/`SwitchMode`/`CreatePlan` Cursor tool calls;
  each replaced or dropped per the adaptation rules above.
- `AGENTS.md` key lookups are preserved as "read `AGENTS.md` for X"
  instructions, not assumed.
- The substantive body matches the verbatim source except for the adapted
  edges (a diff should show only the edge changes).
- Each adapted skill's `description` scopes it to the anwalt.de engineering
  workflow.

## Constraints

- The adaptation is only for making content work with the pi agent, not a
  content change (per the design: "reconciliation/adaptation is ONLY for
  making sure it works with Pi agent").
- The anwalt.de tooling assumptions (Jira/Bitbucket/`task`/worktree/`fork-db`)
  stay; only the Cursor tool-call shape is adapted.
- The verbatim source under
  `skills/engineering-workflow/resources/blueprint/skills/<name>/SKILL.md`
  is the source of truth; future changes flow through the three-way
  reconciliation (the agent is the mergetool), not a deterministic adapter.

## Implementation notes

### Slice 1 — edge-fixes (landed)

- All 8 specified Cursor-edge edits applied across two files:
  - `skills/engineering-workflow/resources/blueprint/skills/task-refine/SKILL.md` — 6 "Q&A module"/"Q&A tool"/"Q&A call"/"Cursor's Question" mentions → `ask_user_question`; the "Cursor's 'open and recently viewed files'" editor-context example → IDE-generic phrasing.
  - `skills/engineering-workflow/resources/blueprint/skills/task-implement/SKILL.md` — 2 "Editor Window … Cursor window" mentions → "their editor".
- Verified: `grep -rin "Q&A module\|Q&A tool\|Q&A call\|Cursor's Question\|Cursor window\|Editor Window"` returns nothing; `grep -rin "AskQuestion\|SwitchMode\|CreatePlan"` returns nothing (both pre-existing and post-edit). All 14 `description` frontmatters start with "anwalt.de engineering-workflow skill.". `.cursor/rules/anwaltde/universal/<rule>.mdc` refs untouched (27 occurrences across 7 skills). `ai-setup/SKILL.md`, `pr-review/SKILL.md`, `task-slice/SKILL.md` "Do NOT touch" items intact.
- The deviation report (`deviation-reports/edge-fixes.md`) claimed "no implementation was applied" — that was stale: it predates commit `2f8341e` which applied the `task-implement` edits. The final `git diff main...HEAD` shows exactly the 8 edge rewrites and nothing else.
- Slice doc archived to `slices/archive/1-edge-fixes.md`.

## Notes

- This task depends on `engineering-workflow-skill` (which deposits the
  verbatim sources) and `engineering-sync-skill` (whose three-way flow will
  keep the adapted skills fresh after the first pass). The first pass itself
  is a one-time adaptation per skill.
- Whether to slice this per-skill (14 slices) or batch is a slicing
  decision for the implementer; the skills are independent of each other.
