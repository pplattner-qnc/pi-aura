---
name: task-refine-review
description: anwalt.de engineering-workflow skill. Runs a refine review — reads a finished plan in several passes, each with its own perspective (design, coherence, lifecycle, abort/concurrency, ergonomics, executability) instead of reading it repeatedly with the same question. Defines the two flows (review run and delta run), the pass order, the scope per Story Points, four finding classes, an objective stop rule, a two-heading plain-language report after every pass and a closing list of open decisions; patches clear fixes straight into the working document and logs every pass. Also knows the delta beat that is due after every wave of changes. Use when the user invokes /task-refine-review, wants a plan checked from several angles, says "review it again", "review it from another side", "one more round", or asks — after deletions or simplifications — what those changes broke.
---

# Refine review: read a plan from several perspectives (`/task-refine-review`)

## Purpose

This skill runs a **refine review**: it reads a **finished** plan in several passes. It does not replace refining, it comes after it — the plan stands, and the job is to find defects before anything gets built.

**Always call it a "refine review", never just a "review".** Wherever the tracker has review rounds on a document — assigned reviewers, approvals, a revise bot — "review" already means that: *people* reviewing a document. This is an agent reading a plan. Both can sit on the same artifact, so the name has to keep them apart.

**Core principle: a second pass with the same question finds nothing.** What makes a review productive is not more diligence but a **different guiding question**. "Read it critically again" yields wording suggestions the second time around. "Read it as someone who has to implement it" yields blockers. The passes differ by **perspective**, not by intensity.

## Where this sits

Standard place in the lifecycle: **between `task-refine` and `task-slice`** — a design flaw should be found before it gets multiplied into five slices. `task-refine` offers this skill in its closing block. After slicing, another refine review is possible and runs on the **parent plan**, not per slice.

## Delineation

| Situation | Owner |
| --- | --- |
| Sharpen a plan, resolve open decisions, interview the user | [`task-refine`](../task-refine/SKILL.md) |
| **Several** passes with a changing perspective over a finished plan | **this skill** |
| Cut a plan into slices | [`task-slice`](../task-slice/SKILL.md) |
| Draw a lesson from a mistake that already happened | [`task-retro`](../task-retro/SKILL.md) |
| Have **people** review an artifact version (reviewers, approvals, a revise bot) | The tracker's own review rounds — a different thing entirely, not this skill |

The skill also runs **outside** the task workflow: any plan, spec, or concept document is a valid working document.

## When to apply

- Slash command **`/task-refine-review`**.
- "Review the plan from another angle." / "Do another round."
- "I deleted the following — what did that break?" (→ delta run)
- Offered by `task-refine` once a plan reaches phase `Refined`.

## The two flows

There are exactly **two** ways this skill runs. Decide which one applies before anything else, and say which one you picked.

### Review run (the normal case)

One or more perspective passes, each followed by the delta beat, until the stop rule ends the run. This is what `/task-refine-review` means without further qualification.

**Step 1 of every review run is the re-entry check** — not a separate flow, because four fifths of a "re-entry mode" would be duplicated text, and duplicated text in a steering document is the most reliable way to make two halves drift apart. The check is short and has two jobs, because that is where both known failures sit:

1. **Find the log before creating one.** Search the working document for the refine review log under all four spellings (see "Logging"). Append to whatever you find; never open a second section.
2. **Subtract the perspectives already run** and check the previous outcome. **If convergence was already reached, do not review — build.** Say so and name the cheapest next slice instead of starting another pass.

**Cadence within a run:** keep going across passes as long as findings are clear fixes you can patch yourself. **Stop and ask** as soon as a blocker appears or a genuine product decision is needed — those are the points where the user's answer changes everything that follows.

### Delta run (standalone)

**No** perspective runs. Only the delta question — *what did precisely this change break?* — over a named set of changes. Ends after one report; there is no session summary, because there is only one report to summarise.

This is the flow behind "I deleted the following — what did that break?".

### Two switches (they cut across both flows)

- **"Run everything"** — the user asks for the whole pass set in one go. No intermediate stops; the reports are still written per pass, and the decisions that would otherwise have halted the run are collected and presented at the end. In this switch the closing output is the **only** place the decisions appear, so it is never optional.
- **"No document"** — the plan exists only in the chat. Nothing is patched and nothing is logged; the findings are delivered in the chat and that is the whole output. Never invent a document just to have a file to write to.

## Working document

- The working document is a **repo Markdown file** (task, subtask, spec, concept) **or** a **tracker-side plan artifact**, where the tracker has such a concept at all (the adapter says). Name it once, up front.
- If the user gives the path, references it with `@`, or it is unambiguous from context, that is **permission** to edit exactly that document — do not ask again.
- **Repo file and artifact both exist?** The repo file is the source and gets patched per pass; the artifact is brought in line **once at the end of the session**. Never once per fix — that floods the version history with intermediate states.
- **An artifact under review is not yours to overwrite.** Where artifact versions carry their own review state, writing a new version while a review round is running pulls the ground out from under the reviewers: they approve a text that no longer exists. Before the end-of-session update, check that state via the adapter — if the version is in review or already approved, report the findings and let the user decide whether to write now or after the round.
- If there is no document, the "no document" switch applies (see above).
- This skill creates **no** ticket and **no** task file of its own — it runs inside a piece of work that already has one.

**Progress event (mandatory when the document is task-bound).** When the working document resolves to a tracker item, emit a `task.progress` event per the adapter's "Call contracts" (`phase: "refine-review"`, one short English sentence each): one at the **start** of the session, once the working document is resolved (what is about to be reviewed), and one at the **end** (the review's outcome). One pair per **session**, never per pass — the pass reports and the refine review log already carry the per-pass detail. A working document with no tracker item (a plain spec, a concept, or `Tracker: none`) skips both events; say so once. Bookkeeping: a failure is visible and recorded, never a blocker.

## The six perspectives

| # | Perspective | Guiding question | Typically finds |
| --- | --- | --- | --- |
| L1 | **Design** | Is this even the right approach — and does the reasoning hold? | Holes in mechanisms; slices that deliver something other than what their heading claims; load-bearing assumptions that were never stated or checked |
| L2 | **Coherence** | Does the document contradict itself or reality? | Statements that cancel each other out; checks that rely on data declared unreliable elsewhere; stale cross-references; plan versus actual code |
| L3 | **Lifecycle** | What happens the first time, the second time, and with pre-existing data? | First run impossible; existing data never migrated; state that gets created twice; half-migrated intermediate states |
| L4 | **Abort & concurrency** | What if it fails midway, or two actors do it at once? | Half-written target states; missing idempotency on the second attempt; lost work with parallel actors |
| L5 | **Ergonomics** | Will the procedure be worked around in practice? | Ceremony that is too expensive; checks that fire so often they get ignored |
| L6 | **Executability** | Could a simple model implement this without guessing? | Under-specified steps; implicit ordering; missing paths, target values, and verification commands |

### Delta — not a perspective, a trigger

After **every** wave of changes to the plan, ask exactly one thing: *What did precisely these changes break? Where does something still point at a thing that no longer exists? Which job did the removed element quietly do that nobody does now?*

Sharpest **after deletions**. Deleting feels safe and is not: removed things leave behind references that still point at them, and jobs they silently took care of.

## Order

A review run goes in **two-beat measures**: a perspective pass, then a delta beat over whatever that pass changed. Only then does the next perspective start.

```text
L1 Design → Δ  →  L2 Coherence → Δ  →  L3 Lifecycle → Δ  →  L4 Abort → Δ  →  L5/L6 as needed
   \______________/
    one measure: pass, report, fixes, then delta over exactly those fixes
```

The delta beat is **skipped only** when the pass changed nothing in the document — there is then nothing that could have broken. Every other case gets it, and it is short: one question, one report, no full re-read.

**Design first, not coherence** — even though coherence is cheaper. If the design still changes, the coherence fixes were wasted; the reverse never happens. The mistake is common because the cheap pass feels like the natural entry point.

## Scope per effort

| Story Points | Passes |
| --- | --- |
| `1`–`3` | L2 alone, time-boxed |
| `5` | L1 → L2, then delta after changes |
| `8`–`13` | L1 → L2 → L3, at least one of L4/L5/L6, delta after every wave |

**The number comes from the plan file's header**, on the scale in `task-artifact-conventions` → "Story points". This skill runs on a finished plan, so the header always exists — a tracker field is never the source, and no tracker needs to be configured for the table to work.

**This table proposes the order and the upper bound — it never ends the run.** Ending is the stop rule's job alone (see "Stop rule"). A pass set that is "still owed" according to the table is not a reason to keep reading once the findings have converged.

**Regardless of size:** a plan that **removes** existing artifacts or **replaces** a running procedure gets L3 — that is where the pre-existing state lives.

**No estimate in the header?** A spec or concept document has none, and a repo may not estimate at all (the target repo's `AGENTS.md` → key `Story Points: whether`). Estimate the effort of building what the document describes on the same scale and use the table unchanged — do not skip the sizing step, or the pass set becomes arbitrary.

## Finding classes

Without classification the stop rule is a matter of feeling.

| Class | Meaning | Typical example |
| --- | --- | --- |
| **Blocker** | The procedure cannot run as written | The normal case falls into an error branch |
| **Silent gap** | A case is uncovered and the damage is **silent** | A stale version overwrites someone else's work without anyone noticing |
| **Contradiction** | Two statements in the document do not go together | A field is declared unreliable and still used as the basis for a decision |
| **Vagueness** | Executable, but a simple model would have to guess | "Highest version wins" without saying which version number counts |

## Stop rule

- **Keep going** as long as a pass produces at least one finding of class **blocker**, **silent gap**, or **contradiction**.
- **Stop** when a complete pass produces only **vagueness**. That is the convergence signal — the findings are getting more specific and less structural.
- **This rule, and only this rule, ends a review run.** It overrides the scope table: if convergence arrives before the table's pass set is exhausted, the run is over. The table judges from an up-front estimate, the stop rule from what the document actually yields — and the evidence wins. The accepted cost is that a superficial first pass can end a run early; the remedy for that is perspective discipline, not a pass quota.
- **Then build instead of reviewing further.** What is still hidden after convergence is execution detail, and that is found more reliably by executing than by reading. The recommendation at that point: build the cheapest slice (often a purely documentary one) and run the next refine review against the result instead of against the plan.

If the user asks for another pass after convergence, run it — but with a perspective **not used yet**, and with a note about the diminishing return. Never repeat the same perspective.

## Pass report (mandatory chat output)

A refine review is only worth as much as what reaches the user. So **every** pass — including every delta beat — ends with a report in the chat.

**Sort by what the reader has to do, not by finding class.** That is the whole point of the two headings: a finding is either dealt with or it is not, and it therefore appears **exactly once**.

```markdown
## Pass <n> — <perspective>

Checked: <the guiding question, one sentence in plain words>

### Changed in the plan
- **Contradiction** `L2-1` — <one sentence: what was wrong, and that it is now fixed>

### Your call
- **Blocker** `L2-3` — <the problem>. Recommendation: <…>; the alternative would be <…>.

Next: <delta beat over these changes | pass <n+1> — <perspective> | run over: `/task-quiz` on this plan, then build: <the concrete next slice>>
```

Rules for the report:

- **The two headings are rendered in the user's language**, like the rest of the report — the English wording above is the skill's, not the output's.
- **An empty section is dropped entirely**, never filled with "none".
- **Length is staggered, and the numbers are hard:**
  - *Changed in the plan* — exactly **one** sentence per item. The matter is settled; the reader needs no more.
  - *Your call* — at most **three** sentences per item: problem, recommendation, alternative. Without a recommendation and an alternative a decision cannot be made.
  - No sub-bullets, no nesting.
  - The staggering is deliberate. A single uniform "one line per finding" is the current rule and it gets broken in every real run, because it is objectively too tight for decision items — and a rule that does not fit half its cases gets ignored for all of them.
- **A deliberately carried finding goes under *Your call*** too, and its third sentence names the condition under which it does bite ("stays harmless as long as …"). It gets no third heading: without that home it would fall out of the report altogether — nothing changed, nothing apparently to decide — and that is exactly the kind of finding nobody ever finds again. The **deadline class** is assigned later, by the closing output; the pass report carries only the condition, which is known without the overall picture.
- **Keep the class word** (`Blocker`, `silent gap`, `contradiction`, `vagueness`) — the stop rule hangs on it. It costs one word.
- **Always carry the ID** (`L1-1`) so report and document can be matched up later.
- **Order by severity** inside a section: blocker → silent gap → contradiction → vagueness.
- **`Checked:` and `Next:` are one line each** and always present. `Next:` names the concrete next step, never "let me know how you want to proceed"; the judgement "does the plan still hold?" belongs in that line. There is **no** separate summarising block — when every item is explained individually, a paragraph on top is precisely the padding this format exists to remove.
- **The `Next:` line of the *last* pass report offers [`/task-quiz`](../task-quiz/SKILL.md)** — the plan has now been read mechanically, but nobody has checked it against the picture in its author's head. Offer it **once, where the run ends**: the stop rule bites, or the user stops it. Never after an intermediate pass, where it would compete with the next perspective while the plan the quiz is meant to check does not stand yet. This line is also the only place a small plan ever sees the offer, since at `1`–`3` SP the scope table schedules a single pass and there is no closing output at all.
- **Delta reports use the same format**, only the heading differs: `## Δ after pass <n>` for the delta beat inside a review run, `## Δ — <what changed>` for a standalone delta run, which has no pass behind it. The `Checked:` line is the delta question in both cases.

## Closing output (only when more than one pass ran)

After a single pass there is **no** closing output — the pass report is the end. After several passes, four reports have scrolled away and the open items are spread across all of them, so the last thing the user reads must answer the one question they still have: *is anything still on my plate?*

It contains **two things only**: the open decisions collected across all passes, each with a **deadline class**, and one line naming the next step. **Nothing that is done is repeated here** — that is what the pass reports were for.

```markdown
## Refine review done — <document>

**Your decisions:**

| Item | What it is about | Deadline |
| --- | --- | --- |
| `L3-2` | <one sentence, plain language> | before implementation |

**Next step:** <the one concrete action>
```

Rules for the closing output:

- Rendered in the user's language, like the pass reports.
- Every open item carries a **deadline class**, not a priority adjective: `before implementation` (blocks building), `before the merge` (can be built around but must not ship), `can wait` (only becomes relevant under a condition — name that condition). "Important/unimportant" is the user's judgement to make; your job is to say when it bites. The deadline class is the one part a single pass report cannot produce, because it only emerges from the overall picture.
- **Nothing open? Say that in one sentence** ("No open decision — the plan is buildable.") rather than dropping the section. The user must never have to infer from silence that they are done.
- Name **your own** open follow-ups too, not just the user's decisions — an artifact still to be synced, a sibling ticket to be told. Otherwise they quietly become nobody's.
- No finding text is repeated. Name the item and what leaving it open costs.
- **The next step names `/task-quiz` too**, alongside building — the same single offer the last pass report already carries, restated where the reader ends up, not a second and different one.
- Comes **after** the last pass report, **once** per session.

## Procedure (tick the boxes)

```text
- [ ] 1. Pick the flow (review run / delta run) and note any switch ("run everything",
        "no document"); name the working document once; emit the start progress event
        (see "Working document")
- [ ] 2. Re-entry check (review run): find the refine review log under all four spellings,
        subtract the perspectives already run — if convergence was reached, build instead
- [ ] 3. Determine the effort (Story Points, or an equivalent estimate when the document
        has no ticket); pick the pass set from the scope table
- [ ] 4. Per pass: announce the perspective, go through the whole document, collect
        findings, classify them, assign IDs
- [ ] 5. Patch clear fixes directly; put genuine product decisions to the user one at a time
- [ ] 6. Post the pass report in the chat (two headings, plain language)
- [ ] 7. Write the log entry into the refine review log
- [ ] 8. Run the delta beat over exactly the fixes from step 5 — unless nothing changed —
        and report it the same way
- [ ] 9. Continue to the next perspective, or stop at a blocker / a needed decision (cadence)
- [ ] 10. End of session: bring the tracker artifact in line, emit the end progress event,
         write the worklog line, apply the stop rule and name the outcome
- [ ] 11. More than one pass? Close with the closing output: the open decisions with their
         deadline classes, and the one next step
```

### On step 4 — what a pass actually does

1. **Announce the perspective** in one line: which question is being asked now. Chat heading `## Pass <n> — <perspective>`.
2. Go through the document **completely**, with **only** that question. Do not improve anything else "while you are in there".
3. Where possible, **check the code** instead of assuming — especially for L2. Whatever could not be verified is named, not guessed.
4. Give findings IDs: pass prefix plus number (`L1-1`, `L3-2`, …).

### On step 5 — handling findings

- **Clear fixes with no user decision needed:** patch them straight into the working document.
- **Genuine product decisions:** put them to the user one at a time, each with a recommendation **and** the trade-off. Use `ask_user_question`, recommended option first, labelled "(Recommended)".
- **No re-opening** of already-settled decisions without concrete evidence of a defect — otherwise the review turns into a second interview.
- **Scope guard:** if a finding exposes a self-contained problem the plan does not need, propose it as a follow-up task (`task-create`) and note it under "Non-goals" — do not pull it into the plan.

## Logging

So that passes are not repeated and constructions do not look arbitrary later:

- **Finding IDs stay in the document**, even after the fix. They are the rationale for everything that would otherwise look like a quirk.
- **Mark superseded findings, do not delete them:** "`L2-1` — moot after the later decision `R13`." Otherwise someone goes looking for the fix to a problem that no longer exists.
- **One entry per pass, in a fixed order of information:** perspective · findings by class · what was patched · what stays open · what was verified against the real code and what was not. **Length is not prescribed** — whether it is a table row or a paragraph is the document's choice; only the order of the items is binding. The log has a different reader (the next agent, who needs to know what was actually checked against the code) than the chat report, which is why the report's brevity rules do not apply to it.
- **Only new entries follow this order.** Existing logs written in an older, freer form are **not** rewritten: a log is a record of what happened, and migrating it would falsify history to satisfy a formatting rule.
- **Name what could not be verified.** A refine review without access to the real code is a review of documentation — that belongs in the log so it gets caught up on.
- **Create the section on the first pass**, named in the **document's own language** — `## Refine-Review-Protokoll` in German documents, `## Refine review log` in English ones. Where the document has a living `## Stand & nächste Schritte` block, update it too (`task-phase-tracking`).
- **On re-entry, search before you create.** Look for the log under all four spellings — `## Refine-Review-Protokoll`, `## Refine review log`, and the older `## Review-Protokoll` / `## Review log` — and **append to whatever you find**, renaming that heading to the current form. Creating a second section instead splits the history in two, and the next run then repeats passes that are already logged. Renaming the heading is not a contradiction of "do not rewrite old entries": it touches the heading so the next run finds the section, not the entries beneath it. In practice only the two German spellings occur; the English ones are provision for an English working document, not legacy.
- **Worklog:** one line per refine review **session** (not per pass) in today's worklog file, per `worklog-personal-tracking`.

## Anti-patterns

- **"Read it critically again"** without a new perspective → produces cosmetics.
- **A five-point checklist in one pass** → you find the first point and skim the rest.
- **Coherence before design** → work that a later design change throws away.
- **Deletions without a delta beat** → removed things leave behind references that still point at them.
- **Improving things on the side** during a pass → the perspective gets diluted and the diff becomes unreadable.
- **Reviewing on because the scope table still "owes" a pass** → the stop rule ends the run, not the table; after convergence the return drops fast while the document keeps growing.
- **Skipping the re-entry check** → a second log section gets created and a perspective runs twice.
- **Calling it just a "review"** → collides with the tracker's review rounds on artifacts; the user cannot tell which of the two you mean.
- **Dumping raw findings** instead of the report → the user has to work out for themselves what is serious and what was already fixed.
- **Listing a finding twice** — once as a problem, once as its fix → the two headings exist precisely so every finding appears once.
- **A summarising paragraph on top of individually explained items** → that is the padding the two-heading format removes; the judgement belongs in the `Next:` line.
- **Running past a blocker or an open decision** → everything after it is built on an assumption the user never confirmed.
- **Updating the tracker artifact after every fix** → the version history fills up with intermediate states.
- **A progress event per pass** → the heartbeat is one pair per session; per-pass events flood the timeline with what the pass reports and the log already record.
- **A closing output after a single pass** → there is nothing to collect; the pass report is the end.
- **Ending a multi-pass session without the closing output** → the user is left to reconstruct from a wall of text what is still on their plate.
- **Sorting open items by "important / less important"** → the user cannot act on an adjective. Say when it bites instead.

## Quality check before finishing

- [ ] Flow named (review run / delta run) and any switch applied; working document named once, clearly.
- [ ] **Re-entry check ran** — the log was searched under all four spellings and appended to, not duplicated; perspectives already run were not repeated; a document that had already converged was sent to build instead of reviewed again.
- [ ] Pass set derived from the Story Points; for removing/replacing plans, L3 is part of it.
- [ ] Every pass ran with **one** announced perspective and **one** guiding question; no perspective used twice.
- [ ] All findings classified (blocker / silent gap / contradiction / vagueness) and given IDs.
- [ ] Clear fixes patched; product decisions put to the user instead of decided silently.
- [ ] Superseded findings marked, not deleted.
- [ ] **Every pass ended with the report**: `Checked:` line, the two headings (changed / your call) with each finding appearing exactly once, `Next:` line — one sentence per changed item, at most three per decision, in the user's language.
- [ ] **Delta beat ran** after every pass that changed something, reported in the same format under its own heading; skipped only where nothing changed.
- [ ] The refine review log has one entry per pass in the fixed order of information, in **one** section — an existing log was appended to and renamed, not duplicated, and older entries were left in their original form; whatever could not be verified is named.
- [ ] Called a **"refine review"** throughout, never just a "review".
- [ ] The run stopped where the cadence says it must (blocker / needed decision), unless the user asked for a full run.
- [ ] Tracker artifact brought in line **once** at the end of the session — and only after checking that no review round is running on that version; worklog carries **one** line for the session; progress events emitted at session start and end (skipped — with a note — when the document has no tracker item).
- [ ] Stop rule applied and the outcome stated: next perspective (by name), or build (with the concrete next slice). The scope table was not used to justify continuing past convergence.
- [ ] Where the run ended, the last pass report's `Next:` line offered `/task-quiz` — once, never after an intermediate pass.
- [ ] **More than one pass → closing output present**: open decisions with a deadline class each, your own open follow-ups, the one next step — and an explicit sentence when nothing is open. Exactly one pass → no closing output.
- [ ] Scope did not grow silently; follow-up tasks proposed instead of absorbed.
