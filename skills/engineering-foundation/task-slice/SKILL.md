---
name: task-slice
description: anwalt.de engineering-workflow skill. Breaks an existing large top-level item (≈8–13 SP) or a PRD/master plan into vertical, individually human-testable subtask slices. First decides whether slicing is warranted — for small/clearly scoped tickets (≈≤3 SP, single vertical scope), recommends implementing directly and leaves a brief decision note in the parent task file instead of creating sub-tasks. When slicing, cuts vertically (backend + frontend per slice, not "all migrations" / "all endpoints"), derives the slice dependency graph and groups slices into parallelisable execution waves, creates one child item per slice in the configured tracker plus a repo Markdown file under `subtasks/`, and adds the plan link to the item's description. Use when the user invokes /task-slice, wants to split a large task/PRD/master plan into subtasks, cut vertical slices, group subtasks into parallel waves, break a plan into human-testable increments, or asks whether a ticket needs slicing at all.
---

# Cut an existing story into vertical slices (`/task-slice`)

## When to apply

- The user has an **existing** top-level story (typically with high story points, ≈`8`–`13` SP) or a PRD/master plan and wants to break it into **several small, individually testable increments**.
- Slash command **`/task-slice`** or phrasings like "split into subtasks", "slice vertically", "human-testable increments".

**Do not apply** for **new** top-level tickets — that is the job of [`task-create`](../task-create/SKILL.md). A slice is always a child of its parent item, never a top-level item of its own.

**Precondition — a worked-out plan must exist first.** Slicing presupposes a **refined** plan (the parent task file has been elaborated and grilled via [`task-refine`](../task-refine/SKILL.md), phase `Refined`). Do **not** slice a freshly created `/task-create` ticket that is still in phase `Draft` — refine it first. Slicing an un-refined ticket skips the refinement step and produces slices off a half-baked target picture.

### When NOT to slice

Not every ticket needs sub-tasks. Use the following heuristic to decide before proposing any slices. **The number comes from the parent plan file's header** — this skill runs on a refined plan (see the precondition above), so it always exists; a tracker field is never the source. If the repo does not estimate at all (the target repo's `AGENTS.md` → key `Story Points: whether`), judge the same three axes qualitatively and say which row you are treating the plan as.

| SP | Decision |
|---|---|
| ≈`1`–`3` SP | **No slicing** (recommended). Single clear vertical scope, no cross-layer risk — implement directly. |
| `5` SP | **Judgment call.** Only slice if there are genuinely independent, separately testable increments. When in doubt, go directly to implementation. |
| ≈`8`–`13` SP | **Slice.** Too large or too uncertain to build in one go. |

Tie-breaker at 5 SP: if you cannot name at least two truly independent human-test steps, do not slice.

## Hard core principle

Every slice must satisfy five properties at the same time:

1. **Vertical cut** — backend and frontend together. No slice is "database migration only" or "UI skeleton only". Whoever merges a slice has a result visible in the browser or via a script.
2. **Human-testable** — the repo slice file carries a mandatory `## Human test` block with numbered steps ("open X, click Y, expect Z"). No pure DB spot checks, no "tests are green" as the only test evidence.
3. **Incrementally valuable** — even if only the first two slices are merged, the state is meaningfully presentable. No "only slice 7 shows the final result".
4. **Debug intermediate steps are allowed** — if a slice only becomes testable because a loud indicator/helper endpoint is visible that will be rolled back later, this **must** be marked in the slice file as `## Intermediate steps`, and the follow-up slice carries the `Rollback from <SUB-KEY>` entry.
5. **Executable by a weak model** — every slice is cut and written so the weakest available model can implement it from the slice file alone. There is no tier to calibrate against and no stronger-model fallback: the slice file must carry enough concrete, slice-scoped context (affected files/paths, existing building blocks to reuse with paths, contracts/shapes, characteristic edge cases) that reconstruction of the target picture from the parent is unnecessary. Reference the parent task file for the big picture, but **distil** the slice-relevant parts into the slice itself — a bare pointer to the parent is not enough. This lives in the mandatory `## Context & references` block. If a slice cannot be written this way, it is cut too coarsely — cut further or make the context more explicit. Naming a model or a tier is not an option.

## Clarify the mode (first, always!)

The `ask_user_question` call that aligns with the user always starts with **question 0 — slice at all?** This question is mandatory regardless of how obvious slicing seems. (pi's `ask_user_question` takes 2–4 options per question; the question-0 decision below is one question with its options, and questions 1–2 are bundled into a second call.)

0. **Slice or implement directly?**
   - **`no-slice — implement directly`** ← recommended when ≈≤3 SP and a single clear vertical scope with no cross-layer risk (see "When NOT to slice" above).
   - **`slice it`** ← required when ≥8 SP or when there are multiple genuinely independent, testable increments.
   - At 5 SP: present both options without a pre-selected default; let the user decide.

**If the user chooses `no-slice`:** skip questions 1 and 2 entirely and go straight to the **"No-slice off-ramp"** section.

**If the user chooses `slice it`:** add these two questions in the **same** `ask_user_question` call:

1. **Granularity**: My proposal is N slices (see workflow step 3). Does that fit? Options: "fits", "fewer / coarser", "more / finer".
2. **Scope**: What to create?
   - **`both`** — repo Markdown under `subtasks/` **and** tracker sub-items. Canonical flow.
   - **`repo_only`** — repo Markdown only, with a placeholder key in the file name. The user creates the sub-items manually later.
   - **`tracker_only`** — sub-items only, repo files follow later.

   With no tracker configured this question collapses to `repo_only` — do not offer a choice between three options when two of them require a tracker.

Without explicit confirmation of **all applicable questions**, **do not** proceed.

## No-slice off-ramp

When the user confirms `no-slice`, take these three steps and then stop. **No sub-items in the tracker, no `subtasks/` directory, no slice files.**

1. **Write a decision note** in the parent task file `docs/tasks/active/<PARENT-FOLDER>/task-<slug>.md`. Insert a `## Slicing-Entscheidung` section (repo language, default German) directly before any existing "Open points" section, or at the end of the file:

   > **## Slicing-Entscheidung**
   > Bewusst **nicht** geslict — direkt umgesetzt. Grund: `<1 sentence, e.g. "≈3 SP, einzelner klarer vertikaler Scope, kein Cross-Layer-Risiko">`.

2. **Update the worklog, then report back in the chat.** Record the no-slice decision in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` — log it in the done section as `Slicing-Entscheidung: <title> — ✅ · <PARENT-KEY> · bewusst nicht geslict` (or update the parent's existing entry). Then confirm the no-slice decision, name the parent file path, and close the turn with the mandatory block, heading per the repo's `Doc language` (`task-phase-tracking` → "Reading"; German here):

   ```markdown
   ## Stand & nächste Schritte

   **Stand:** Bewusst nicht geslict — Ticket bleibt ein Stück.

   **Nächste Schritte:**
   - Direkt umsetzen mit `/task-implement`.
   ```

## Workflow

### Phase 1: Understand and cut (read-only)

**Progress event (mandatory).** Once the parent item is identified, emit one (`phase: "slice"`, one short English sentence on what is about to be sliced) per the adapter's "Call contracts". Bookkeeping: a failure is visible and recorded, never a blocker.

1. **Read the parent task.** The canonical source is `docs/tasks/active/<PARENT-FOLDER>/task-<slug>.md` (new folders are named `<PARENT-KEY>-<slug>`; legacy folders may still carry a `[<size>]` token in the name — use the **actual** name). Do not start without this file — otherwise the target picture is missing.
2. **Check the slice directory.** Does `subtasks/` already exist with other slice files? If so: new slices line up, old ones are not overwritten.
3. **Propose slices.** Derive from the target picture:
   - Which human-test steps are the smallest sensible increment unit?
   - Which layer combo (DB + backend + UI) must mandatorily go together for **this** test step?
   - Which slices depend on each other (preconditions)?
   - Where is a debug intermediate step unavoidable?

   Rule of thumb for very large parents (≈`13` SP): 5–8 slices, mostly `2`–`3` SP per slice. For large parents (≈`8` SP): 3–5 slices, mostly `2`–`3` SP. At most `5` SP per slice — anyone reaching `8` must cut further.

3b. **Group the slices into execution waves.** From the per-slice preconditions, build the dependency graph and assign each slice to a wave (a topological level):
   - **Wave 1** = all slices with **no** precondition.
   - **Wave N** = all slices whose preconditions are **all** satisfied by slices in waves `< N`.
   - Slices within the **same wave** have no dependency on each other and can therefore be implemented **in parallel** (e.g. handed to several agents at once).

   Rules:
   - Use only **hard** preconditions (a slice that genuinely cannot be built or tested without a predecessor) to place waves. A soft "profits from" relationship does **not** push a slice into a later wave — note it as a hint instead.
   - If almost every slice depends on the previous one (a single long chain → one slice per wave), say so explicitly: there is no parallelism to exploit. Do not invent fake parallelism.
   - The waves are an **ordering/parallelisation aid**, not a new artifact type: every slice is still a normal child item. Waves are recorded in the parent `## Subtasks` table (see Phase 3), not in the tracker.

4. **Align the cut with the user.** Together with the `ask_user_question` call from "Clarify the mode" — same tool call — show the concrete slice list as short keywords **and the proposed waves** (e.g. "Wave 1: S1 · Wave 2: S2, S5 (parallel) · Wave 3: S3 · Wave 4: S4"), so the user can answer "fits" / "please consolidate" / "please split up".

5. **Propose the plan.** Present the slice plan as a chat block (the agent works in normal mode; there is no plan-creation tool to call).

### Phase 2: Create per slice (for each slice individually)

Order: **the tracker sub-item first**, then the repo file, then the plan link. Reason: the file name contains the key, which only exists after the item is created. In `repo_only` mode, steps 1 and 3 are skipped and the file name carries a placeholder key.

#### Step 1: Create the sub-item

Create it per the adapter's call sequence, as a child of the parent item — a slice is never a second top-level item (`task-artifact-conventions` → "Four principles"). Whatever a tracker requires that differs between top-level items and children — different fields, a different transition, a different way of naming the parent — is the adapter's business and is deliberately **not** described here. `tracker-jira`, for instance, carries a whole set of sub-task traps that would be actively wrong for any other tracker.

Two things this skill does own:

**Title format:** `[S<n>] <Title>` — the square-bracket token is the **slice name** (`[S1]`, `[S2]`, … matching `S<n> of <total>`), **not** the parent's area token and **not** a size token. Example: `[S1] Repo CRUD skeleton with ADMIN-only mutations`. The number must match the `## Slice: S<n> of <total>` entry in the repo file.

**Story points per slice:** the number from the sizing below. Whether a tracker field additionally carries it — and which one, since children often behave differently from top-level items — is the adapter's business.

#### Step 2: Write the repo Markdown file

Path schema:

```text
docs/tasks/active/<PARENT-FOLDER>/subtasks/S<n>-<SUB-KEY>-<slug>.md
```

Example: `docs/tasks/active/ANW-6318-repo-docs-embeddings-and-portal/subtasks/S1-ANW-6344-repo-crud-skeleton.md`. `<PARENT-FOLDER>` is the **actual** name of the parent folder — new ones without, legacy folders possibly still with a `[<size>]` token.

**Slice prefix:** the file name **starts** with the slice token `S<n>-` (matching the `S<n>` in the summary and the `## Slice: S<n> of <total>` header), so the files sort in slice order inside `subtasks/`. Use the same number, no zero-padding (`S1-`, …, `S10-`). Legacy files without the prefix are left untouched.

**Slug convention:** English, lowercase, hyphens, 3–6 words. **No** size token in the file name.

**Mandatory header (always in this order, in the repo's `Doc language`).** As in `task-draft`, the tracker reference line(s) and their link format come from the adapter; the block below is this repo's rendering:

```markdown
# <SUB-KEY> — <short title in repo language>

> **Issue Type:** <the adapter's child type>
> **Parent:** [<PARENT-KEY>](<parent deep link>) — `<Parent title>`
> **Status:** <current tracker status>.
> **Phase:** Refined (Slice definiert, bereit zur Umsetzung).
> **Story Points:** <1|2|3|5>.
> **Slice:** S<n> of <total>.
> <tracker reference line(s)>   ← per the adapter's "Repo-header reference format"

## TL;DR (ELI5)

Two to three simple sentences. Enough for a non-technical person.

## Stand & nächste Schritte

**Stand:** Slice via /task-slice definiert.
**Nächste Schritte:** Umsetzung gemäß `## In scope`.

(Living block — wird laut `task-phase-tracking` aktualisiert, sobald jemand an der Slice arbeitet.)

## Story Points & rationale

**Story Points:** <1|2|3|5> — short rationale (1–3 sentences) on which axis (volume / complexity / uncertainty) drives the value.

## Context & references

Slice-scoped context so the weakest available model can implement without rebuilding the target picture from the parent. Be maximally concrete and explicit — there is no stronger-model fallback.

- **Parent task:** link to `docs/tasks/active/<PARENT-FOLDER>/task-<slug>.md` for the overall goal — but distil the slice-relevant parts here, do not just point at it.
- **Affected files / paths:** the concrete files to create or change (e.g. `src/server/…`, `src/app/…`).
- **Existing building blocks to reuse:** relevant helpers, types, components, endpoints already in the codebase (with paths), so nothing is reinvented.
- **Contracts / shapes:** the relevant request/response shape, DB fields, or types this slice touches.
- **Edge cases & gotchas:** known pitfalls characteristic of this slice.

## In scope

### Backend
- …

### Frontend
- …

### Tests
- …

## Out of scope

- What is deliberately pushed to a later slice (with a reference to the slice).

## Preconditions

- Which predecessor slices must be finished, including their keys.

## Intermediate steps (debug helper)

- If present: what is rolled back again in which follow-up slice (`<NEXT-SUB-KEY>`).
- If nothing: `None.`

## Human test

1. <concrete step with the expected visible result>
2. …

## Acceptance criteria

- Technically verifiable signals (tests green, migration ran through, coverage reached, …).
```

**Human-test writing rules** (this is the core of this skill):

- Numbered steps, never bullet points with `-`.
- Every step names **what the tester does** (click, type, run a script) **and what they see** (UI element, response field, DB value).
- At least one step is visible in the browser or in the CLI output — not just "field X is set in the DB". Pure DB spot checks may be included additionally, but do not replace the browser/CLI check.
- Negative cases (error states, 403, 404, missing file) belong in the human test if they are characteristic of the slice.
- For mutating actions: verify idempotency or rollback in the test as well ("run twice → unchanged").

#### Step 3: Add the plan link to the sub-item

A `## Plan (canonical, in repo)` section with the slice file as a **clickable Markdown link** — schema from the target repo's `AGENTS.md` → key `Plan-link schema`, form per `task-artifact-conventions` → "Where the files live". `<branch>` is the current feature branch while the parent task is in progress, the default branch after the merge. If the **parent folder** carries a legacy `[<size>]` token, URL-encode its square brackets (`[` → `%5B`, `]` → `%5D`); new slice file names contain none.

#### Step 4: Maintain cross-references

If this slice has an `Intermediate steps` block that is rolled back in a **not-yet-created** follow-up slice, add the `<NEXT-SUB-KEY>` reference in **this** file after that slice is created — trackers assign keys in creation order, not in slice order, so the key cannot be predicted. Concretely: after all sub-items exist, search the already-written Markdown files once via `Grep` for placeholder keys and correct them with `StrReplace`.

### Phase 3: Update the parent task

After all slices, extend the parent file `task-<parent-slug>.md`:

1. Insert a new `## Subtasks` section before the existing "Open points" section — a table with `#`, `Wave`, `Slice`, `Key`, `Story Points`, `Repo file` (relative Markdown link). The `Wave` column carries the wave number from Phase 1 step 3b.
2. Directly below the table, add an **execution-waves summary** — one line per wave listing the slices it contains and marking which run in parallel, e.g.:

   > **Ausführungs-Wellen (Parallelisierung):**
   > - Welle 1: S1
   > - Welle 2: S2, S5 *(parallel)*
   > - Welle 3: S3
   > - Welle 4: S4

   If there is no parallelism (one long chain), state it explicitly: "Keine Parallelisierung — strikte Kette S1 → S2 → … (jede Welle = ein Slice)."
3. Remove the sentence about the subtask split from "Open points" or replace it with a reference to the new table.
4. Set the parent's **`> **Phase:**`** header line to `Sliced` and update its `## Stand & nächste Schritte` block (next step: implement the first wave). See `task-phase-tracking`.
5. Optional: a short cut-principle statement directly below the waves summary, so readers without skill knowledge understand why the cut is where it is.
6. **Update the worklog (mandatory).** Record the slicing in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (the rule owns the format, day-rollover, and gitignore mechanics — do not restate them). Slicing is a self-contained planning step, so log it in the done section as `Task geschnitten: <title> — ✅ · <PARENT-KEY> · <n> Slices / <m> Wellen` (or update the parent's existing entry if present).
7. **Close the turn with the mandatory chat block** (in addition to, and separate from, the doc-file block updated in step 4 above), heading per the repo's `Doc language` (`task-phase-tracking` → "Reading"; German here):

   ```markdown
   ## Stand & nächste Schritte

   **Stand:** Ticket in <n> Slices über <m> Wellen geschnitten (<Slice-Keys>).

   **Nächste Schritte:**
   - Erste Welle umsetzen mit `/task-implement`.
   ```

## Tracker sync

Slicing is the alignment phase of the lifecycle. Each slice is mirrored into the tracker following its adapter — which owns the levels and types, the call sequence and its ordering constraints, the status series, the parent resolution and the error policy. Do **not** restate any of that here; only apply it. With two trackers, `tracker-mirror` owns which side is created first.

**Per slice:**

1. **Resolve the parent item** via the adapter's "Parent resolution" chain, creating it if it does not exist.
2. **Create the slice as a child** of that parent, with the child level and type the adapter defines. A slice is never created as a second top-level item.
3. **Attach the slice plan as an artifact** from the slice file and link it. Record the item and its artifact in the slice header as **clickable deep links**, in the adapter's "Repo-header reference format".
4. **Map hard preconditions to blocking relations** — one per precondition, predecessor blocks this slice, mirroring the wave dependency graph. Where a tracker has no relation concept, the waves table in the parent file is the only record; say so rather than dropping the information silently.
5. **Walk each slice** to the adapter's ready-for-development target.

**Parent** (after all slices exist): walk it to the same ready state, one series step at a time, and emit a progress event summarizing the resulting slices and waves per the adapter's "Call contracts".

**On failure:** classify per the adapter's error policy — a failure to create a slice or resolve its parent stops the run, because the slice file name needs an identity that only the tracker can mint. Artifact, relation, tag and status calls are bookkeeping: continue and leave a named, reconcilable note in the plan's phase block.

## Story points per slice

The scale itself is defined in `task-artifact-conventions` → "Story points". What is specific to slices is the **reading and the ceiling** below — same numbers, tighter meaning:

| SP | Meaning for a slice |
|---|---|
| `1` | one file, one clear touchpoint |
| `2` | small, unambiguous, maybe one test |
| `3` | several touchpoints, backend + frontend together |
| `5` | cross-section through several layers, some uncertainty — **upper limit** for a slice |
| `8` | **not permitted** for slices — anyone reaching `8` must cut further |
| `13` | **not permitted** for slices — anyone reaching `13` must cut further |

The slice Markdown must contain a short rationale (1–3 sentences) on why exactly this value — not just the number. Whether a tracker field additionally carries it is the adapter's business.

## Language

Owned by `general-language-policy`: tracker content is English, repo Markdown under `subtasks/` follows the parent task's language (the target repo's `AGENTS.md` → key `Doc language`).

One consequence specific to slices: the human test therefore exists twice — the numbered steps in the repo file in the doc language, and a short, more compact English `## Human test` block in the item's description.

## Anti-patterns

- **Horizontal slices.** "Slice 1: all migrations, slice 2: all endpoints, slice 3: all UI components." No slice is testable on its own; forbidden.
- **Missing human test.** Slice file without a `## Human test` block, or the human test as a bullet list instead of a numbered step instruction.
- **DB-only tests.** The human test consists only of "SELECT … checks Y in the DB". At least one UI or CLI-output step is mandatory.
- **Re-implementing the tracker's child mechanics here** instead of following the adapter. Children frequently behave differently from top-level items — different fields, different transitions — and a copy in this skill is wrong for every tracker but one.
- **Context-starved slice.** The slice file carries only terse `In scope` bullets and points at the parent for everything else, forcing the executing model to reconstruct the target picture. A slice must distil the slice-relevant context (files, reusable building blocks, contracts, edge cases) into the `## Context & references` block — maximally concrete, because there is no stronger-model fallback.
- **Intermediate step without a rollback reference.** If a slice introduces a debug helper, the follow-up slice must explicitly roll it back. Otherwise debug code stays permanently in the code.
- **Slices without a preconditions block.** If S5 depends on S4, this must be stated in the slice file — otherwise someone picks up S5 first.
- **Hidden waves.** Slices are produced but never grouped into execution waves, so the reader cannot tell which of them may run in parallel. Always derive the waves from the preconditions and record them in the parent `## Subtasks` section.
- **Fake parallelism.** Declaring slices as parallel (same wave) although one hard-depends on another. Waves must follow the real precondition graph; a soft "profits from" is a hint, not a parallel grouping.
- **Slice file without the `S<n>-` prefix.** The repo file must start with the slice token (`S1-…`) so the files sort in slice order and match the summary/header. A file named `<SUB-KEY>-<slug>.md` without the prefix is the old schema.
- **Slice with `8` or `13` story points.** Always means: cut further. The slice ceiling is `5`.
- **Slice only a strong model could implement.** If the slice needs architectural judgment across many files, shared auth/schema/core abstractions, or high uncertainty that cannot be spelled out in `## Context & references`, it is cut too coarsely — cut further or make the context more explicit. Naming a stronger model is not an option.
- **Model or tier named on a slice.** No `> **Model:**` header line, no `## Model recommendation` section, no `**Model:**` line in the tracker description. Slices are model-agnostic by design.
- **Slicing a trivially small ticket.** A ≈≤3-SP ticket with a single clear vertical scope artificially split into sub-items instead of implemented directly. Creates overhead with no benefit — the "When NOT to slice" heuristic and question 0 should have caught this.

## Quality check before completion

### If no-slice was chosen

- [ ] No sub-items created in the tracker, no `subtasks/` directory or files created.
- [ ] `## Slicing-Entscheidung` section added to the parent task file with a one-sentence rationale.
- [ ] The no-slice plan was presented as a chat block (no plan-mode tool exists in pi; the decision note + worklog + stand block are the output).
- [ ] Reported back in the chat: decision confirmed, parent file path named, turn closed with the mandatory `## Stand & nächste Schritte` block pointing at `/task-implement`.
- [ ] **Worklog updated** — the no-slice decision recorded in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc`.

### Per slice

- [ ] The sub-item exists as a child of the parent, in the adapter's ready state, created via the adapter's call sequence.
- [ ] Title in English, schema `[S<n>] <Title>` — slice name in the square brackets (matching `S<n> of <total>`), **no** area or size token, no historical project prefix.
- [ ] Story points set in the slice file header — value `1`–`5`, never `8` or `13`; a tracker field only if the adapter defines one.
- [ ] Repo Markdown under `subtasks/S<n>-<SUB-KEY>-<slug>.md` (slice prefix first, no size token) with the mandatory header.
- [ ] **`> **Phase:**` line present** in the header (initial value `Refined`) and a `## Stand & nächste Schritte` block is present. See `task-phase-tracking`.
- [ ] Mandatory sections present: TL;DR, **Stand & nächste Schritte**, Story Points, **Context & references**, In scope, Out of scope, Preconditions, Intermediate steps (or "None."), Human test, Acceptance criteria.
- [ ] **Executable by a weak model:** the `## Context & references` section names the slice-relevant files/paths, reusable existing building blocks (with paths), contracts/shapes, and edge cases — concrete enough that the weakest available model can implement without reconstructing the parent. A bare pointer to the parent is not enough. Self-test: could the weakest model implement this slice from this file alone, without opening the parent?
- [ ] **No model or tier named** anywhere on the slice — not in the header, not as a `## Model recommendation` section, not in the tracker description.
- [ ] **Tracker sync:** the slice was created as a child of the resolved parent with the adapter's child level and type, its plan attached as an artifact, hard preconditions mapped to blocking relations, and the slice walked to the ready state. The header's tracker line carries clickable deep links, never a raw identifier.
- [ ] Human test is numbered and names the visible result for each step.
- [ ] Backend **and** frontend are in the "In scope" block (not a pure layer slice).
- [ ] Plan link added to the item's description as a clickable Markdown link, legacy square brackets URL-encoded.

### After all slices

- [ ] The parent task file has a new `## Subtasks` section with a table of all slices (incl. a `Wave` column) and their keys.
- [ ] The parent's `> **Phase:**` line is set to `Sliced` and its `## Stand & nächste Schritte` block is updated (next step: first wave).
- [ ] **Tracker sync:** the parent item was walked to the ready state, and every slice hangs under it with blocking relations reflecting the wave graph — or, with no relation concept, that was stated explicitly.
- [ ] An execution-waves summary is present below the table (or an explicit "no parallelism" note), and the waves are consistent with the per-slice `Preconditions`.
- [ ] Cross-references between slices are correct (`Rolled back in <SUB-KEY>`).
- [ ] Reported back in the chat: list of the created slice keys, short slice descriptions, the proposed waves (what can run in parallel), and a pointer to the path of the parent file.
- [ ] Turn closed with the mandatory `## Stand & nächste Schritte` chat block pointing at `/task-implement` for the first wave.
- [ ] **Worklog updated** — the slicing recorded in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc`.
