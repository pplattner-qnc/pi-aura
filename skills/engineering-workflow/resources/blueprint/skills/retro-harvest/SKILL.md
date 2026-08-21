---
name: retro-harvest
description: anwalt.de engineering-workflow skill. Harvest the accumulated implementation retrospectives under `.aura/optimizations/retros/` into actionable, refinable tasks. Use when the user invokes /retro-harvest, wants to "process the retro logs", "go through the retro backlog", "turn retro suggestions into tickets", or "clean up the optimizations log". Reads every open retro log, splits their `Improvement suggestions` into atomic items, proposes one consolidated triage (open / done / wontfix, plus merge proposals for suggestions that recur across logs), and — on the user's confirmation — creates real tasks for the actionable ones via the /task-create convention, writes the resulting task key back into each source log's in-file status table, and archives fully resolved logs. Closes the loop that /task-retro deliberately leaves open (it only records; it never reviews or acts).
---

# Harvest retro suggestions into tasks (`/retro-harvest`)

`/task-retro` writes one retrospective file per implementation into `.aura/optimizations/retros/` and, by design, stops there — reviewing and acting on the suggestions is out of scope for it. `/retro-harvest` is the missing final step: it goes through those logs, decides per suggestion what happens (implement it, it's already done, or won't do it), consolidates suggestions that recur across several retros, turns the actionable ones into real tasks via `/task-create`, records the outcome back in each log, and archives the logs that are fully resolved.

The skill **produces tasks**, it does not implement the suggestions — the created tasks are ordinary backlog entries that can be refined later with `/task-refine`.

## When to apply

- The user invokes **`/retro-harvest`** or asks to process / go through / triage / clean up the retro logs (the "optimizations log", the "retro backlog").
- Typically run occasionally against the accumulated backlog — not after every single ticket (that is `/task-retro`'s job).

**Do not apply** to write a new retrospective (that is `/task-retro`), and do not use it to implement the harvested suggestions (that happens later in the created tasks).

## Workflow (propose-then-confirm)

The skill drives a single, consolidated round: it does the reading and analysis up front, presents **one** proposal, and only mutates anything (creates tasks, edits/moves files) **after** the user confirms.

### Step 1 — Read every open log and split into atomic suggestions

1. List the non-archived files in `.aura/optimizations/retros/` (ignore anything already under `.aura/optimizations/retros/archive/`).
2. For each file, read the `- **Improvement suggestions:**` content and split it into **atomic** suggestions — one discrete, separately-decidable improvement per item. A single bullet often bundles several; separate them.
3. Keep, per atomic suggestion, which log file(s) it came from — this is the input for consolidation (Step 2) and for writing the status back (Step 4).

### Step 2 — Build one consolidated triage proposal

Evaluate each atomic suggestion and assign a **recommended** status:

- **`open`** — clearly valuable **and** still relevant → should become a task. Bar: a genuine value/effort case, and not already obsolete or superseded.
- **`done`** — already covered by an existing (possibly already-shipped) ticket. Do **not** create a new task; link the existing ticket instead.
- **`wontfix`** — rejected. Everything that is not clearly worth doing, or is obsolete/out of scope. Always with a one-sentence reason.

**Detect recurring suggestions.** When the same suggestion appears in several logs (e.g. "safe fork-DB migration on drift" across four retros), propose consolidating them into **one** task. Present the merge explicitly so the user can confirm or split it.

Present the whole thing as **one** review list the user can scan and correct — per suggestion: the source log(s), the recommended status, and (for recurring ones) the proposed merge. Ask the user to confirm or adjust. Do not create anything before this confirmation.

### Step 3 — Create tasks for the confirmed `open` suggestions

For each confirmed `open` item (one per consolidated suggestion, not one per occurrence), create a task using the **`/task-create` convention** — follow `.agents/skills/anwaltde/universal/task/task-create/SKILL.md` (it owns the tracker calls and the mode question; `idea` or `draft` mode as appropriate for the suggestion's size). The created task is a normal backlog entry that can be sharpened later with `/task-refine`.

- The new task's description **names its source log file(s)** (e.g. "Harvested from `2026-07-14-ANW-7572.md`, `2026-07-14-ANW-7582.md`"), so the origin stays traceable from the ticket side.
- For a recurring/merged suggestion, create the task **once** and reuse its key for every affected log in Step 4.

### Step 4 — Write the outcome back into each source log

Append (or update) a status table at the end of **each** processed retro file, one row per atomic suggestion originating in that file:

```markdown
## Harvest status

| Suggestion | Status | Handled by / reason |
|---|---|---|
| <atomic suggestion> | `open` | <new task key, e.g. ANW-7620> |
| <atomic suggestion> | `done` | <existing ticket key it is covered by> |
| <atomic suggestion> | `wontfix` | <one-sentence reason> |
```

- `open` → the created task key (the shared key for a merged/recurring suggestion goes into **all** affected logs).
- `done` → the existing ticket it is covered by.
- `wontfix` → the one-sentence reason.

### Step 5 — Archive fully resolved logs

Move a retro file to `.aura/optimizations/retros/archive/` **only** when **every** suggestion in it is resolved — i.e. each row in its `Harvest status` table carries a task key (`open`/`done`) or a `wontfix` reason. A log whose suggestions are all `wontfix` is also fully resolved and is archived.

- Create the `archive/` directory if it does not exist.
- A log with any still-undecided suggestion stays in place (it is not fully resolved).

### Step 6 — Report

Summarise: how many logs were read, how many suggestions were `open` / `done` / `wontfix`, which tasks were created (keys), which recurring suggestions were merged, and which logs were archived. Point the user at `/task-refine` to sharpen the freshly created tasks.

**Worklog update (mandatory).** Record the harvest in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (the rule owns the format, day-rollover, and gitignore mechanics — do not restate them). Log the harvest run itself in the done section as `Retro-Harvest: <n> Logs · <k> Tasks erstellt (<keys>) — ✅`. (The individual tasks created in Step 3 are logged by `/task-create`'s own worklog step — do not duplicate them here.)

## Out of scope

- **Implementing the suggestions.** The skill creates tasks; the actual work happens later in those tasks. It never writes production code, rules, or Taskfile/script changes itself.
- **Writing retrospectives.** Recording a retro is `/task-retro`; this skill only consumes the existing logs.
- **Auto-triage without confirmation.** Statuses and merges are always confirmed by the user before anything is created, written, or archived.
- **Editing an already-archived log.** Files under `archive/` are done; never re-open them.

## Anti-patterns

- **Creating tasks before the user confirms the triage.** The propose-then-confirm order is mandatory — read and propose first, mutate only after confirmation.
- **One task per occurrence of a recurring suggestion.** A suggestion that recurs across logs becomes **one** task; its key is written into every affected log.
- **Archiving a log with an undecided suggestion.** Archive only when every row is resolved (task key or `wontfix` reason); a single open row keeps the log active.
- **Overwriting the retro body.** Only append/update the `## Harvest status` table; never rewrite the original retrospective content.
- **Implementing a suggestion inside this skill.** Hand the work to the created task — do not fix it here.
- **Bypassing `/task-create`.** Tasks are created through that skill, not hand-rolled, so a harvested task reaches the same backlog state as every other one and carries the same conventions.

## Verification checklist

- [ ] All non-archived logs read; `Improvement suggestions` split into atomic items with their source log(s) tracked.
- [ ] One consolidated triage proposal presented (per suggestion: source, recommended `open`/`done`/`wontfix`, merge proposals for recurring ones); nothing created before the user confirmed.
- [ ] Confirmed `open` suggestions turned into tasks via the `/task-create` convention (one per consolidated suggestion); each task names its source log(s).
- [ ] Each processed log carries a `## Harvest status` table with one row per atomic suggestion (task key / existing ticket / `wontfix` reason); a merged suggestion's key written into all affected logs.
- [ ] Fully resolved logs moved to `.aura/optimizations/retros/archive/`; partially resolved logs left in place.
- [ ] Final report lists counts, created task keys, merges, and archived logs, and points at `/task-refine`.
- [ ] **Worklog updated** — the harvest run recorded in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (the harvest itself; the created tasks are logged by `/task-create`).
