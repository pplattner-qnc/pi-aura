---
kind: slice
slug: edge-fixes
size: s
status: done
blocked_by: []
---

# Slice 1 — residual Cursor-edge fixes (all 14 skills, in place)

## What

Fix the Cursor-specific tool-call edges the seed-mirror adaptation missed.
Only **two** skills have residuals (verified by grep across all 14):

- `task-refine/SKILL.md` — 6 "Q&A module"/"Q&A tool"/"Q&A call" mentions +
  one "Cursor's 'open and recently viewed files'" editor-context example.
- `task-implement/SKILL.md` — 2 "Editor Window … Cursor window" mentions.

## Where (current path — slice 2 moves them)

- `skills/engineering-workflow/resources/blueprint/skills/task-refine/SKILL.md`
- `skills/engineering-workflow/resources/blueprint/skills/task-implement/SKILL.md`

## Exact edits

### `task-refine/SKILL.md`

- `:26` "ask the user via the Q&A module" → "ask the user via
  `ask_user_question`"
- `:28` "(e.g. Cursor's \"open and recently viewed files\")" → "(e.g. an
  IDE's automatically injected \"open and recently viewed files\" context)"
- `:36` "using Cursor's Question & Answer (Q&A) module — the structured
  multiple-choice question tool" → "using pi's `ask_user_question` tool — the
  structured multiple-choice question tool"
- `:48` "via the Q&A module" → "via `ask_user_question`"
- `:50` "right before the Q&A call" → "right before the `ask_user_question`
  call"
- `:64` "via the Q&A tool" → "via `ask_user_question`"

### `task-implement/SKILL.md`

- `:59` "open it in the current Editor Window without a second Cursor window"
  → "open it in their editor"
- `:205` "open it in the current Editor Window" → "open it in their editor"

## Do NOT touch (substantive content, not edges)

- `ai-setup/SKILL.md` — "Cursor or Claude Code", "Cursor/Claude Code",
  "Target tools: Cursor, Claude Code, or both" (target-tooling questions).
- `pr-review/SKILL.md:31` — the "Pi-mirror note" about `emit_review` (already
  a deliberate adaptation).
- `task-slice/SKILL.md:110` — "no plan-creation tool to call" (already the
  pi-adapted CreatePlan-drop phrasing).
- All `.cursor/rules/anwaltde/universal/<rule>.mdc` path refs across ~10
  skills — target-repo paths, kept literal per user decision.

## Test plan

- `grep -rin "Q&A module\|Q&A tool\|Q&A call\|Cursor's Question\|Cursor window\|Editor Window" skills/engineering-workflow/resources/blueprint/skills/` → **empty**.
- `grep -rin "AskQuestion\|SwitchMode\|CreatePlan" skills/engineering-workflow/resources/blueprint/skills/` → **empty** (already true; re-confirm).
- `git diff` for the two files shows **only** the edge rewrites above; the substantive body is unchanged.
- All 14 `description` frontmatters still start with "anwalt.de engineering-workflow skill." (unchanged by this slice).

## Size

s — two files, ~10 small string replacements.
