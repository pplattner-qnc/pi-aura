---
name: task-create
description: anwalt.de engineering-workflow skill. Captures a new idea as an item in the configured tracker and first asks whether to capture the idea only (`idea`) or additionally write the first AI draft (`draft`, recommended). It sets no story points and never writes the repo plan itself — the `draft` mode chains into the `task-draft` skill, and with no tracker configured it chains there directly. Use when the user invokes /task-create, wants to create a planned task, document a task in the backlog, capture an idea, or do task pre-planning without immediate implementation.
---

# Create a new task under `docs/tasks/active/` (`/task-create`)

## When to apply

- The user names a **new** task and wants to **only prepare** it (backlog), not implement it immediately.
- Explicit slash command **`/task-create`** or an equivalent phrasing (new task, save in backlog, rough elaboration, capture an idea).

Do not apply when the requirement is **only** a code change without a new task file, or when the user wants to edit an **existing** task file.

## Clarify the mode (first, always!)

**Before anything is created, the mode must be actively requested** — even if the user clearly triggered "/task-create". `task-create` itself only ever captures the **idea** in the tracker; it never writes the repo plan. The difference between the two modes is solely whether the first draft is written right away by chaining into `task-draft`.

**Exception:** with no tracker configured the question has only one real answer and is skipped — see "No tracker configured" below.

First action in this skill: an `ask_user_question` call with exactly this question. **`draft` is the recommended default** (list it first, mark it "(empfohlen)"):

- **`draft`** *(recommended)* — capture the idea **and immediately write the first AI draft**. Once the idea is captured, `task-create` **chains into the `task-draft` skill**, which writes the repo `task-<slug>.md`, sets the story points, mirrors the plan as an artifact, adds the plan link, and walks the status onward. One command, same end result as the historical `full` mode — but the draft logic lives solely in `task-draft`.
- **`idea`** — **capture the idea only.** The tracker item and nothing else: **no** repo folder, **no** `task-*.md`, **no** plan link, **no** artifact, **no** story points. **The item still leaves the tracker's triage state** — see `task-artifact-conventions` → "Four principles". The difference from `draft` lies solely in whether the first draft is written, not in the status.

Rule of thumb:

- Concrete requirement with scope, target picture, affected areas, or the user wants it worked out now → **`draft`** (the default).
- Just a bare one-sentence thought to park in the backlog, no shape yet → **`idea`**.

For `idea`: the draft can be written later by invoking **`/task-draft`** on the existing item (standalone entry point). The status usually stays in the backlog state until then.

## Lifecycle (brief)

The folder layout under the task root (`active/` and `archive/`, and nothing else) is owned by `task-artifact-conventions` → "Where the files live". The source of truth for the lifecycle is the **tracker**; the repo folder only mirrors "still alive" vs. "done", and the move to `archive/` is done by hand at completion.

## The tracker item first

The item is created before anything else, because the repo folder carries its key in the name. **How** it is created — the call sequence, the parent resolution, the confirmations, the status series — belongs entirely to the adapter that `tracker-selection` pulls for this repo. This skill never re-implements those calls and never hardcodes a field, a transition or an instance value.

**Conventions:** `.cursor/rules/anwaltde/universal/task-artifact-conventions.mdc` owns the title format, the description structure, the plan link and the story-point scale.

### Steps

0. **Ask for the mode** (`idea` vs. `draft`, `draft` recommended — see section "Clarify the mode"). Without an explicit answer from the user, do **not** proceed.
1. **Understand the task — rough clarifying questions first.** Before the ticket is created: if something **fundamental** is unclear that would change the ticket's scope, **ask first** — bundled in **one** `ask_user_question` call (not sequentially in a dialog). The goal is solely to set the **roughest** course, not to force a complete specification.

   Only ask if the answer would actually change the ticket's scope. Typical rough decisions:

   - **Goal/outcome:** What should be visibly different in the end? (When the input does not make clear *what* should be achieved.)
   - **Area/scope:** Which functional area is affected (→ also relevant for the area token in the summary) and what is deliberately **not** part of it?
   - **Bug vs. feature:** Is this a defect in existing behavior or new functionality? (Drives the issue type.)
   - **Magnitude:** A one-off small change or a cross-cut across multiple layers? (Drives the Story Points.)

   Do **not** ask about: detail decisions that are clarified later in the plan (field names, concrete endpoints, UI subtleties), or when the input is already unambiguous. If nothing rough is open, do **not** ask a clarifying question and proceed directly.

   Mode-dependent:
   - **`idea`:** very sparingly — at most **one** question, and only if without it the core of the ticket would remain unclear. Usually a single sentence suffices; do not over-clarify, otherwise the purpose of the mode is undermined.
   - **`draft`:** up to **2–3** rough questions allowed if the scope would otherwise be guessed. Still no depth of detail — details land in the repo plan (written by `task-draft`), not in this preliminary clarification.
2. **Choose the item type** via `ask_user_question` if it is not unambiguous. The available types are the adapter's table — do not carry a copy of it here. Picking deliberately rather than defaulting into a type is the universal part (`task-artifact-conventions` → "Four principles").
3. **Create the item** per the adapter's call sequence — including its parent resolution and whatever confirmation that sequence requires.

   **Title:** schema `[<Area>] <Title>`, English, no size token. The rules for the optional area token are in `task-artifact-conventions` → "Summary / title format"; a few examples of the shape:

   - `[Repositories] Add full-text search across repo docs`
   - `[Auth] Reject expired sessions on the API gateway`
   - `Treat long markdown / code pastes as a separate input block` (no clear area → no token)

   **Description:** the mandatory section order and which sections are optional are in `task-artifact-conventions` → "Description structure". In `idea` mode the plan section is omitted entirely, because no plan file exists yet. Whether the sections need a particular content format to render as headings is the adapter's concern.

4. **Reach a real backlog state.** A freshly created item never stays in the tracker's triage intermediate — the principle is in `task-artifact-conventions` → "Four principles", the concrete target state and how to get there is the adapter's. **This applies in both modes**; the difference between `idea` and `draft` is whether a draft is written, never the status. If the transition fails, report it rather than leaving the item behind.
5. **Update the worklog (mandatory), then report back in the chat.** Record the created task in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (the rule owns the format, day-rollover and gitignore mechanics — do not restate them). Creating a task is a self-contained piece of work that finishes within this run, so log it in the done section as `Task angelegt: <title> — ✅ · <KEY>` (the later *implementation* is tracked separately when `/task-implement` starts). Then report: the key, the status, a brief content reference, and close the turn with the mandatory stand block — see "Next step (handoff)" for its exact content per mode. Do **not** point the user at `/task-slice` here.

> The idea is now captured in both modes. In **`idea`** mode the skill stops here — **no** plan link, **no** repo folder, **no** artifact, and no status walk beyond the backlog state. Tell the user the draft can be written later via **`/task-draft`**.

6. **(only `draft`)** **Chain into the `task-draft` skill** — hand it the key and the resolved item. `task-draft` owns everything after this point: the repo `task-<slug>.md` with its header and content template, the story points, the plan link, the plan artifact, and the walk to the draft-stage status. `task-create` writes no repo file, no template and no artifact. See `.agents/skills/anwaltde/universal/task/task-draft/SKILL.md`.

Moving the item further along — into development or review — is the developer's or a later skill's job. `/task-create` never goes beyond the backlog state.

## What the adapter owns, and what this skill owns

The adapter owns the levels and types, the exact call sequence and its ordering constraints, the status series, the parent resolution including its mandatory confirmation, the tagging, and the error policy. Do **not** restate any of it here; apply it. With two trackers configured, `tracker-mirror` additionally owns which side is created first and the ordering that prevents a duplicate — this skill does not know about that ordering.

What **this** skill owns is narrow and worth stating plainly: the mode question, the rough clarifying questions, the decision *what* is being captured, and the handoff. Everything else is somebody else's.

**On failure:** classify per the adapter's error policy. Creating the item is an **identity** call — if it fails, stop and report; never invent a placeholder key to carry on with. Tag, artifact and relation calls are bookkeeping: continue and record the debt.

## No tracker configured

With the target repo's `AGENTS.md` → key `Tracker` set to `none` or absent, there is nothing to capture into — and a skill that then does nothing would leave a `/task-create` run with no result at all. So:

- **The mode question collapses.** `idea` mode exists only to capture an idea *somewhere*; with no tracker there is no somewhere, and offering a choice between "capture nothing" and "write a draft" is a question with one real answer. Do not ask it.
- **Chain straight into `task-draft`.** Say in one sentence that the repo has no tracker, so the plan file is the only artifact, then hand over. `task-draft` knows the keyless layout (`docs/tasks/active/<slug>/`, no tracker line in the header).

The result of a trackerless `/task-create` is therefore always a plan file — never an empty run.

## Next step (handoff)

After `/task-create`, the canonical next stage is **not** slicing. In `draft` mode the chained `task-draft` skill has written the **AI Draft** (phase `Draft`); the next step is to **refine that draft via `/task-refine`** until the plan is worked out (phase `Refined`). This matches the Draft → Refine stages of the workflow documentation (the target repo's `AGENTS.md` → key `Workflow doc URL`).

If the draft carries **more coupled open questions than one document can hold** — the goal is still fuzzy, or it stands while the how is wide open — name `/task-untangle` instead: same lifecycle stage, same target phase, a bundle of typed nodes instead of an interview against one document.

- **Hard rule: do not propose `/task-slice` immediately after `/task-create`.** `/task-slice` is a later stage that **presupposes a worked-out, grilled plan**. Slicing a fresh, un-refined ticket skips the refinement step.
- **SP `13` does not change this.** A `13` flags that slicing is *likely later*, once the plan is refined — it is not a trigger to slice right now. The immediate next step is still draft -> refine.
- In `idea` mode there is no repo draft yet; the handoff is to write it later via **`/task-draft`**, then refine.

**Mandatory closing output (both modes).** End the turn with this block, in simple language, heading per the repo's `Doc language` (`task-phase-tracking` → "Reading"; German here):

```markdown
## Stand & nächste Schritte

**Stand:** <one short sentence — what was just created, incl. the key>

**Nächste Schritte:**
- <concrete next step in simple language>, mit `/task-refine` bzw. `/task-draft`.
```

- `draft` mode: **Stand** names the key and that the repo draft exists (phase `Draft`, written by `task-draft`); **Nächste Schritte** points solely at `/task-refine` — never at `/task-slice`.
- `idea` mode: **Stand** names the key as an idea (backlog state, no repo draft); **Nächste Schritte** points at **`/task-draft`** to write the draft (then refine via `/task-refine`).
- no tracker: **Stand** names the plan file path; **Nächste Schritte** points at `/task-refine`.
- Wherever `/task-refine` is named, `/task-untangle` takes its place for a draft with more coupled open questions than one document holds (see "Next step (handoff)").

## Story points

`task-create` **does not estimate**. Story points come into existence in `task-draft`, together with the plan file that carries them — the scale is in `task-artifact-conventions` → "Story points".

This is a deliberate consequence, not an omission: an estimate belongs to a described piece of work, and in `idea` mode nothing has been described yet. The "magnitude" clarifying question in step 1 stays — it shapes the ticket and gives `task-draft` a starting point — but it produces a sentence, not a number.

**Consciously accepted:** a captured, not-yet-drafted idea therefore carries no size anywhere. Everything that branches on the estimate (`task-slice`, `task-refine-review`) runs after the draft, where the plan header always exists.

## Repo folder, file names & content

`task-create` does **not** write any repo files. The folder layout, the mandatory `task-<slug>.md` header and the rough content blocks are owned by the **`task-draft`** skill (`.agents/skills/anwaltde/universal/task/task-draft/SKILL.md`), which `draft` mode chains into. See that skill for the canonical template — it is intentionally not duplicated here.

## Language

Owned by `general-language-policy`: tracker content is English, repo Markdown under the task folder follows the target repo's `AGENTS.md` → key `Doc language`, and translation goes **repo → tracker** only, never back.

## Quality check before completion

### Always (both modes)

- [ ] The mode was explicitly requested via `ask_user_question` **before** creation and confirmed by the user (`idea` or `draft`, with `draft` offered as the recommended default) — **unless** no tracker is configured, in which case the question was deliberately **not** asked and the run chained straight into `task-draft`.
- [ ] **Rough ambiguities** (goal, scope, bug vs. feature, magnitude) were clarified before creation — either none were open, or they were asked in **one** bundled `ask_user_question` call. No detail questions forced.
- [ ] The item exists with a deliberately chosen type from the adapter's table.
- [ ] **The title follows the schema `[<Area>] <Title>`**: no size token; optional area token only with an unambiguous assignment and then at the very beginning; English title.
- [ ] **No story points were set here** — the estimate is `task-draft`'s, together with the plan file.
- [ ] Title and description are **English** and follow the structure in `task-artifact-conventions`.
- [ ] **The item reached a real backlog state**, in both modes — the target state and the way there per the adapter, never left in a triage intermediate.
- [ ] **The turn ends with the mandatory stand block** (see "Next step (handoff)"), mode-appropriate, never pointing at `/task-slice`.
- [ ] **Worklog updated** — the created task is recorded in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (creation logged as a finished planning step in the done section with the key).
- [ ] **Parent resolved and confirmed** per the adapter's parent resolution, including its `ask_user_question` confirmation and its parent-less fallback. No parent identifier hardcoded in this skill.
- [ ] **Adapter honoured:** the call sequence, its ordering constraints and the status handling came from the adapter (and, with two trackers, from `tracker-mirror`) — not from a copy in this skill. A failure was classified per the adapter's error policy: identity failures stopped the run, bookkeeping failures left a recorded debt.

### Only `draft` mode

- [ ] After capturing the idea, `task-create` **chained into `task-draft`**, handing over the key and the resolved item. `task-draft` — not `task-create` — wrote the repo `task-<slug>.md`, set the story points, added the plan link, created the plan artifact and walked the status. `task-create` wrote no repo file, template or artifact itself.

### Only `idea` mode

- [ ] **No** repo folder, **no** `task-*.md`, **no** plan artifact, **no** story points; no status walk beyond the backlog state.
- [ ] **No** plan section in the item's description.
- [ ] Clearly reported in the chat that this is a pure idea (the draft is intentionally missing) and can be written later via **`/task-draft`**. The item is still in the backlog state, because that is mandatory in both modes — the semantic difference lies in the missing draft.
