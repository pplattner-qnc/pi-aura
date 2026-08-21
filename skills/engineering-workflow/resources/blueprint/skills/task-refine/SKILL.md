---
name: task-refine
description: anwalt.de engineering-workflow skill. Refine a task plan or design by interviewing the user relentlessly until reaching shared understanding, resolving each branch of the decision tree. This is the refinement stage between task-draft (Draft) and task-slice/task-implement (Refined). Use when the user invokes /task-refine, wants to refine or stress-test a plan, sharpen a task draft, get grilled on their design, or mentions "grill me" — that is, when the plan fits into one document and only needs sharpening. Do not use when the undertaking carries more coupled open questions than one document can hold, whether because the goal is still fuzzy or because the goal stands while the how is wide open (that is task-untangle), nor directly after a complete task-untangle run (go to /task-refine-review instead).
---

## When to apply

This skill sharpens **one plan document** by interviewing against it. What it does not do is untangle an undertaking that has outgrown a document — whether because its goal is still fuzzy (every question then presupposes an answer to "what is this for?" and the interview goes in circles) or because the goal stands while answering one how-question visibly spawns the next three.

| Situation | Skill |
|---|---|
| The plan fits one document and needs sharpening | **`/task-refine`** — this skill |
| More coupled open questions than one document holds — the goal is still fuzzy ("something is off with X", "I don't know where to start"), or it stands while the how is wide open | `/task-untangle` — it works them out as a bundle of typed nodes and writes the result back into the plan |
| A complete `task-untangle` run just finished | `/task-refine-review` — **skip this skill** |

**The boundary is the shape of the artifact, not the clarity of the goal.** A clear goal does not make it this skill's job, and a fuzzy one is only one of the two reasons the questions can be too many.

The last row is the one that matters in practice: after a full `task-untangle` run every question has already been asked, decided and recorded as a node, and the plan has been through a coherence pass. A second interview would ask what already stands in the bundle as a decision. A run **broken off after part 1** is the exception — the how was never interviewed, so this skill applies normally.

## Resolve the refinement target first

Before anything else, determine **which task** is being refined. Resolve it in this order:

1. **Explicit reference in the current message** — the user typed a ticket key or task name, actively attached a file via `@`, or described the target in prose. This wins over everything else.
2. **The task established in the current chat conversation** — typically the task just created via `/task-create`/`/task-draft` earlier in this same conversation. This is the normal case right after drafting.
3. **Otherwise, ask** — if neither (1) nor (2) unambiguously identifies a task, ask the user via the Q&A module which task to refine. Never guess.

**A file open or focused in the editor is never evidence of the target, on its own.** In particular, an automatically injected editor-context block (e.g. Cursor's "open and recently viewed files") does **not** count as an explicit reference under (1) — only a deliberate user action does (typing the key/name, attaching via `@`, or describing it in prose). Silently picking up an unrelated open file as the refinement target is the single most common source of confusion in this skill; treat it as a hard rule, not a heuristic.

**Always state the resolved target in one sentence before starting the interview** — even when it is unambiguous from the conversation. This surfaces a wrong resolution immediately instead of after a round of questions.

**Progress event (mandatory).** Once the target is resolved, emit a `task.progress` event (`phase: "refine"`, one short English sentence on what is about to be refined) per the tracker adapter's "Call contracts". This is a bookkeeping call: a failure is visible and recorded, never a blocker.

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

Ask the questions one at a time using Cursor's Question & Answer (Q&A) module — the structured multiple-choice question tool — rather than plain prose. For each question:

- Offer concrete answer options, not an open-ended prompt.
- Put your recommended answer first and mark it with "(Recommended)" in the label.
- Let the user pick from the options (they can always choose "Other" to type their own).

If a question can be answered by exploring the codebase, explore the codebase instead.

## Make every question understandable (didactic lead-in)

A fresh AI draft is usually skimmed, not truly read. So a bare multiple-choice question feels ripped out of context: the user cannot tell what it refers to in the plan, why it matters, or what the options practically mean — and ends up "confirming" decisions they never actually understood. Refinement must therefore *actively build* the user's understanding, not assume it. This is not a separate phase; it is how every question in the interview is posed.

Before each question, explain — as a natural, flowing conversation in the chat — what the question is about: which part of the plan it touches, why it matters, and what the options mean in practice. Then ask the clean, short question via the Q&A module.

- **Context goes in the chat prose right before the Q&A call**, never stuffed into the question prompt or the answer labels — those stay short and clean.
- **Keep it a casual, continuous conversation.** Do not label the context ("Kontext:") and do not number the questions ("Frage 1/5"); just talk to the user.
- **Scale the depth to the question's difficulty:** a tricky, deep-in-the-plan decision gets a fuller lead-in; an obvious one gets a single sentence. Never pad a trivial question.
- **Comprehension-by-reading, not a quiz:** the aim is that the user understands by following your explanation (explain → ask). Do not interrogate the user to "check" that they understood. Checking is a separate step at a later point in the lifecycle, and it has its own skill — [`/task-quiz`](../task-quiz/SKILL.md) puts the *finished* plan up against the picture in its author's head. Here the plan is still being decided, and a comprehension check would interrupt the very decision it is testing.
- **Actively surface details that still need clarifying**, including gaps the draft never marked as open questions — don't assume the user already spotted them while reading.

This complements the relentless-interview loop above and the `Refined` completeness bar below; it does not replace them.

## Clean rewrite (optional, recommended)

A grilling round accretes decisions incrementally — Grimmy answers, refinement answers, and leftover fragments of the original draft end up side by side in the plan file. The result can end up fragmented, keyword-like, or inconsistent even though it is content-complete.

Once the interview reaches the same completeness bar as the Closing step below (shared understanding, no open questions, phase `Refined`) — and only then — judge whether the plan actually reads as fragmented, keyword-like, or redundant. If it already reads as one coherent, well-structured document, skip this step entirely; do not offer it reflexively on every run.

If the plan does look stitched together, offer the rewrite via the Q&A tool, e.g. "The plan looks a bit fragmented from the grilling round — should I rewrite it now as one clean, coherent document?". On agreement, rewrite the plan **in the same turn**:

- **Losslessly.** No information gathered during refinement may be lost. Resolved open questions are folded in as the decisions actually made — they no longer appear as "open" — while genuine remaining uncertainties stay explicit.
- **Following the plan's existing structure.** Smooth and consolidate the sections already present; do not force a different template onto the content.
- **Preserving the mandatory header verbatim.** The whole `> **…:**` header block — tracker link(s), issue type, status, phase, story points, model — is copied through unchanged.

This step runs **before** the tracker sync and the Closing step below: the rewrite overwrites the repo `task-*.md` file first, so the sync step that follows already pushes the cleaned-up version as the new `PLAN` artifact version — no separate artifact-update step is needed here.

## Tracker sync

When a refine pass reaches phase `Refined`, mirror the outcome into the tracker, following the adapter that `tracker-selection` pulls: it owns the call sequence, the status walk and the error policy. Do **not** restate them here. With `Tracker: none` this whole section is skipped — the refined plan file is the outcome, and that is sufficient.

1. **Resolve the task** — follow the adapter's "Parent resolution" chain: deep link in the header, else its `human_key`, else a title match **the user confirms**, else create it per the call sequence.
2. **Update the `PLAN` artifact** — push the refined plan as a new version (whole-body update) so the artifact tracks the sharpened plan.
3. **Walk the status** to the adapter's target for this skill — one series step at a time, never a direct jump.
4. **Progress event** — emit one per the adapter's "Call contracts", summarizing what was resolved.
5. **On failure:** classify per the adapter's error policy. An **identity** failure — the task cannot be resolved or created — stops the run and is reported; a **bookkeeping** failure (status walk, artifact, progress event) continues and leaves a named, reconcilable note in the plan's phase block. The refined plan itself is never rolled back for a tracker error.

## Closing step (mandatory)

**Worklog update (mandatory).** Once the plan is refined (phase `Refined`), record the refinement in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (the rule owns the path, format, day-rollover and gitignore mechanics — do not restate them). Refining is a self-contained planning step, so it goes into the **done** section as `Task geschärft: <title> — ✅ · <KEY> · Phase Refined` (or updates the task's existing entry if one is already there). Then emit the chat block below.

Once the interview reaches a shared understanding and the plan is refined (phase `Refined`), end the turn with this block, in simple language. The heading and its two field names follow the repo's `Doc language` — see `task-phase-tracking` → "Reading: find the block before you write one"; the German rendering below is this repo's:

```markdown
## Stand & nächste Schritte

**Stand:** Plan via /task-refine geschärft; offene Fragen geklärt.

**Nächste Schritte:**
- Den fertigen Plan aus mehreren Blickwinkeln gegenlesen lassen mit `/task-refine-review` (Entwurf, Kohärenz, Lebenszyklus …) — findet Entwurfsfehler, bevor sie sich in Slices vervielfältigen.
- Bei großem oder unklarem Zuschnitt (≈8–13 SP, mehrere unabhängige Teile) in Teilaufgaben schneiden mit `/task-slice`.
- Bei kleinem, klar umrissenem Scope direkt umsetzen mit `/task-implement`.
```

Adjust the two bullets to the actual situation (e.g. drop the one that clearly does not apply), but always name at least one concrete next step with its slash command.
