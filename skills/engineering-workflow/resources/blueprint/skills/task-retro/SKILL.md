---
name: task-retro
description: anwalt.de engineering-workflow skill. Capture a workflow retrospective for the session and append it as a single, fixed-template entry under `.aura/optimizations/retros/`. Use when the user invokes /task-retro, asks to "reflect on how the work went", "log workflow/process learnings", "record optimizations for the development workflow", or wants a retrospective for continuous workflow improvement. Also invoked (offered, never automatic) from /task-finish Step 0, and only there when the session surfaced a genuine workflow-/process-level problem. The focus is the workflow *around* the task (tooling, setup, DevX, recurring process friction) — not a per-task postmortem of this ticket's domain logic. The AI self-analyses the session itself and writes an English entry directly, then shows it. Works with or without a tracker item or plan file.
---

# Implementation retrospective into the optimizations log (`/task-retro`)

Turn the ad-hoc "how did that implementation go?" reflection into a structured, comparable log entry. The AI analyses the just-finished work **itself** (no interview), writes one Markdown file per retrospective into `.aura/optimizations/retros/`, and shows the result. The point is a growing, uniformly formatted body of DevX/workflow findings that can be reviewed and acted on later.

## When to apply

- The user invokes **`/task-retro`** or asks to reflect on / log workflow learnings from the current session.
- `/task-finish` Step 0 offers it before closing a ticket — but **only** when its two-part test flags a genuine workflow-/process-level problem (the user still opts in; never automatic).

**Scope is the workflow, not the task.** A retro entry is about the *way* the work got done — tooling/MCP ergonomics, environment/setup friction, process-caused fix cycles, recurring cross-task pain — and how to improve it. It is **not** a postmortem of this ticket's own domain logic. A plain plan deviation or a merely complex/large task is *not*, on its own, retro material.

**Manual invocation always writes.** When the user invokes `/task-retro` directly, always write an entry (they asked for it) — but keep the substance workflow-focused. If the session genuinely surfaced nothing workflow-relevant, say so honestly in the entry (a short "no workflow-level problem this session" note) rather than inventing task-specific filler. The two-part gate in `task-finish` governs only whether the retro is *offered* automatically, never whether a manual invocation writes.

**Plan-independent:** unlike the old copy-pasted prompt, this skill does **not** require a specific plan path. It runs against whatever the current session actually did.

## Step 1 — Derive the context (from this session)

Determine, from the current chat session (chat history, the ticket implemented here, edited files, git diff — same disambiguation as `task-finish` Step 1):

- **The task** worked on in *this* session, if any — from the plan's repo-header tracker link if a plan file exists (reuse the clickable `[<human_key>](…)` link as it stands; parse the UUID out of the link when a raw id is needed), else from the key named in the conversation. Do **not** infer it from a passively open, unrelated file.
- **Short description** — one line on what the work was about.

**Ticketless is allowed**, and so is trackerless. If no task can be resolved — or the repo has `Tracker: none` — still proceed and fill the `Task:` field with `n/a`. A plan file is optional; when present, use it for context but never require it.

## Step 2 — Self-analyse the implementation (no interview)

Reflect honestly on the session. Do **not** ask the user questions — analyse it yourself. Keep the *context* brief and put the *substance* on the workflow:

- **What was built** — brief context only (1–2 lines: what the work was about, which artifacts). This just lets a later reader / `/retro-harvest` place the entry; it is not the point of the retro.
- **What took long / problems (workflow-level)** — concrete time sinks and blockers **whose cause lies in the workflow around the task**: broad/slow test runs, environment/setup friction, tooling/MCP ergonomics, process-caused avoidable fix cycles, repeated cross-task pain. Do **not** log difficulty that was just this ticket's domain logic, nor a plain plan deviation, as a "problem". Be specific and candid; a vague "went fine" has no value.
- **Improvement suggestions (workflow-level)** — actionable, each naming the canonical owner artifact that would *change the process*: a skill, a rule, a script, the Taskfile, tooling/MCP, the dev setup. Suggestions must target the workflow, not this ticket's code.

If, after honest reflection, the session surfaced **no** workflow-level problem, do not manufacture one: note it plainly (see "Manual invocation always writes" above) and keep the entry short.

## Step 3 — Write the entry directly

Write the entry **directly** (no pre-write confirmation), then show the rendered entry in the chat.

### Location and file name

- Directory: `.aura/optimizations/retros/` (create it if it does not exist; the parent `.aura/optimizations/` is kept free for other optimization artifacts).
- File name: `<YYYY-MM-DD>-<KEY>.md` — e.g. `2026-07-14-ANW-7588.md`. Use today's date.
- **Ticketless:** `<YYYY-MM-DD>-<short-slug>.md` (kebab-case slug from the short description).
- **Collision** (a file for the same date + key already exists): append `-2`, `-3`, … (`2026-07-14-ANW-7588-2.md`). Never overwrite an existing entry.

### Template (one file per entry, English)

The entry is always written in **English** (the skill and the log are control/analysis artifacts; the skill text itself is English per `general-language-policy`). Keep the field structure stable so entries stay comparable and later machine-readable:

```markdown
# Retro <YYYY-MM-DD> — <short title>

- **Task:** [<human_key>](<deep link, per the tracker adapter's reference format>)
- **What it was about:** <1–2 sentences>
- **What was built:** <concrete artifacts: files, endpoints, components, tests>
- **What took long / problems:** <concrete time sinks & blockers, with cause where known>
- **Improvement suggestions:** <actionable suggestions, ideally with the canonical owner>
```

Fill a missing `Task:` value with `n/a` — do not drop the line. Entries written before this field was unified carry separate `Jira:` / `Aura:` lines instead, and are **not** migrated — so anything that reads this field must accept both shapes. (`/retro-harvest` is unaffected: it reads only `Improvement suggestions`.)

## Step 4 — Report

Show the written file's path and the rendered entry in the chat. Keep it short — the entry itself is the deliverable.

**Worklog update (mandatory).** Record the retro in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (the rule owns the format, day-rollover, and gitignore mechanics — do not restate them). Writing a retro is a self-contained step, so log it in the done section as `Retro geschrieben: <KEY|slug> — ✅` (this is a different file from the retro log itself: the worklog is the day's live activity list, the retro log is the analysis artifact).

## Out of scope

- **No auto-aggregation or dashboard** — this skill only produces individual entries; reviewing/prioritising them is a separate, later step, owned by `/retro-harvest` (`.agents/skills/anwaltde/universal/task/retro-harvest/SKILL.md`), which harvests the accumulated logs into refinable tasks.
- **No fixing** of the findings — the skill records improvement suggestions, it does not implement them (that is `/retro-harvest` → the tasks it creates).
- **No interview** — the AI analyses the session itself; it does not ask the user retro questions.
- **No mirroring of the entry into the tracker** (no artifact, no comment) — the log is repo-side only.

## Anti-patterns

- **Requiring a plan path.** The skill is plan-independent; a plan file is optional context, never a precondition.
- **Aborting when there is no ticket.** Ticketless and trackerless retros are valid — fill `Task:` with `n/a` and write anyway.
- **Overwriting an existing entry.** On a same-date/key collision, add a `-2`/`-3` suffix; never clobber.
- **Interviewing the user.** Analyse the session yourself and write directly; do not ask retro questions.
- **Writing the entry in German.** Log entries are English (analysis artifact); only user-facing chat around it follows the user's language.
- **Running automatically from `task-finish`.** It is only ever offered there; the user must opt in.
- **Vague, non-actionable content.** Name concrete time sinks, causes, and owner artifacts — a generic "went fine" defeats the purpose.
- **Logging task-specific content as the substance.** Problems and suggestions must be workflow-/process-level (tooling, setup, DevX, process-caused fix cycles), not this ticket's domain logic. A tricky feature or a plain plan deviation is not, by itself, retro material — keep task detail to the 1–2 line context only.
- **Manufacturing a workflow problem on a manual run.** When invoked manually on a session with no workflow-level friction, write the entry but note that honestly — never invent process findings to fill the template.

## Verification checklist

- [ ] Context derived from *this* session (task key and/or short description), ticketless handled with `n/a`.
- [ ] Entry self-analysed (no interview); task detail kept to a 1–2 line context, with problems and improvement suggestions candid, specific, and **workflow-/process-level** (not this ticket's domain logic). A session with no workflow-level problem is noted honestly, not padded.
- [ ] File written under `.aura/optimizations/retros/<YYYY-MM-DD>-<KEY|slug>.md`, English, following the fixed template; collisions suffixed, nothing overwritten.
- [ ] The rendered entry and its path were shown in the chat.
- [ ] **Worklog updated** — the retro recorded in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (distinct from the retro log file itself).
