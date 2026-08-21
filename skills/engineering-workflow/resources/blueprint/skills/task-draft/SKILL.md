---
name: task-draft
description: anwalt.de engineering-workflow skill. Writes the first AI draft for an already-captured idea — the repo task-*.md (mandatory header + content template) plus the mirrored plan artifact in the configured tracker — and walks the item to the draft-stage status. Story points come into existence here. Use when the user invokes /task-draft, wants to elaborate/draft an existing idea that has no repo plan yet, or says "add the repo elaboration for <KEY>". Runs standalone, is chained into by task-create's draft mode, and works with no tracker at all.
---

# Write the first draft for an existing idea (`/task-draft`)

`task-draft` is the **Draft** stage of the lifecycle (`Idea → Draft → Refine → Slice → Implement → Finish`). It turns an already-captured idea into the first usable AI draft: the repo `docs/tasks/active/<KEY>-<slug>/task-<slug>.md` (with the mandatory header + rough content) **and**, where the tracker has such a concept, the mirrored plan artifact — then walks the item to the adapter's draft-stage status. The plan is then sharpened by `/task-refine`.

This skill is the **single canonical owner** of the repo `task-*.md` header/content template. `task-create` no longer writes it; it captures the idea only and — in `draft` mode — chains into this skill.

## When to apply

- The user invokes **`/task-draft`** (standalone) on an existing idea that has no repo plan yet.
- Equivalent phrasings: "elaborate this idea", "write the repo plan for `<KEY>`", "add the repo elaboration for `<KEY>`", "draft this task".
- `task-create`'s **`draft`** mode chains into this skill right after it has captured the idea.

**Do not apply** when there is no idea yet and no tracker item — that is `task-create`'s job. Do not apply to sharpen an already-drafted plan — that is `/task-refine`.

**Progress event (mandatory).** Once the target idea is resolved (Step 1), emit a `task.progress` event (`phase: "draft"`, one short English sentence on what is about to be drafted) per the adapter's "Call contracts". Bookkeeping: a failure is recorded, never a blocker.

## Step 1 — Resolve the target

The draft needs a stable identity — the key goes into the folder name `<KEY>-<slug>/`, the header and the plan link. Everything about how that key is minted belongs to the adapter that `tracker-selection` pulls; this skill never re-implements a create.

1. **Determine the entry point** from the invocation: a key, a deep link / UUID, or the in-memory context handed over by `task-create`'s `draft` mode.
2. **Resolve the item** via the adapter's "Parent resolution" chain. If it does not exist yet, create it per the adapter's call sequence — including its parent resolution and the confirmation that sequence prescribes.
3. **Two trackers configured?** Then the counterpart must exist too, and creating it is the mirror rule's business (`tracker-mirror`), not this skill's. It also owns the extra key-based resolution step and the type mapping between the two.
4. **Result:** a resolved item and its key, for the rest of the skill.

**No tracker (`Tracker: none`)?** There is no key to mint, and the draft still happens — this is the path `task-create` chains into. Two consequences, and nothing else changes: the folder is `docs/tasks/active/<slug>/` without a key prefix, and the header carries no tracker link and no `> **Status:**` line (there is no tracker status to mirror). Phase, story points and the model line stay.

**On failure:** classify per the adapter's error policy. An **identity** failure — the item cannot be resolved or created — stops the run, because the folder name and header need an identity that only the tracker can mint; do not invent a key and do not silently fall back to the trackerless layout. A **bookkeeping** failure continues and leaves a named, reconcilable note in the plan's phase block.

## Step 2 — Idempotency guard (check both sides before writing)

Never overwrite existing work. Before writing anything, check **both** sides for an existing draft:

- **Repo:** does `docs/tasks/active/<KEY>-<slug>/task-<slug>.md` already exist?
- **Tracker:** does the item already carry a plan artifact? (Only where the adapter has an artifact concept — with none, the repo file is the only side and this collapses to the first check.)

Then:

- **Both exist →** stop. Report that a draft already exists and point the user at `/task-refine`. Do not overwrite.
- **Exactly one exists (partial / interrupted earlier run) →** **reconcile**, do not re-draft: create the missing side **1:1 from the existing one** so both exist with identical content — repo file present but no artifact → create the artifact from the repo file; artifact present but no repo file → materialise the repo file from the artifact body. Then hand off to `/task-refine`.
- **Neither exists →** proceed to Step 3 (normal draft path).

## Step 3 — Write the repo draft

1. Create the folder `docs/tasks/active/<KEY>-<slug>/` (`<slug>`: English, lowercase, hyphens, 3–7 words — same convention as the folder key).
2. Write `task-<slug>.md` with the **mandatory header** (below) and the **rough content blocks** (below). Set the `> **Status:**` line to the item's current tracker status and the `> **Phase:**` line to `Draft`.
3. **Story points** — this is where they come into existence. The scale and the obligation to name the driving axis live in `task-artifact-conventions` → "Story points"; whether the repo estimates at all is the target repo's `AGENTS.md` → key `Story Points: whether`. With estimation off, omit both the header line and the justification section, and note in the plan that the repo does not estimate. Whether a tracker field additionally carries the number is the adapter's business.
4. **Add the plan link to the tracker item** — mandatory **clickable Markdown link syntax `[Text](URL)`**, never a bare URL (schema from the target repo's `AGENTS.md` → key `Plan-link schema`, form and section heading per `task-artifact-conventions` → "Where the files live"). `<branch>` in that schema is the current feature branch, or the repo's default branch if none yet; update it on the first commit. With `Tracker: none` there is nothing to link into — skip.

## Step 4 — Tracker sync: plan artifact + status walk

Mirror the draft into the tracker following its adapter — do **not** restate the mapping or the call sequence here; only apply it. With `Tracker: none`, skip this step entirely: the repo draft is the outcome.

1. **Attach the plan as an artifact**, created **from** the repo `task-<slug>.md` so both are identical by construction, and link it to the item. Record the item and its artifact in the repo header as **clickable deep links**, in the adapter's "Repo-header reference format" — including the ancestor chain where the adapter defines one.
2. **Walk the status** to the adapter's target for the draft stage, one series step at a time.
3. **Progress event (mandatory)** — emit one summarizing the drafted idea, per the adapter's "Call contracts".

**On failure:** classify per the adapter's error policy — the identity already exists at this point, so everything in this step is bookkeeping: record it as a reconcilable note and continue. The repo draft is never rolled back for a tracker error.

## Step 5 — Worklog + handoff (mandatory)

**Worklog (mandatory).** Record the draft in today's worklog file per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (the rule owns format, day-rollover, gitignore). Drafting is a self-contained planning step, so log it in the done section as `Draft erstellt: <title> — ✅ · <KEY> · Phase Draft` (or update an existing entry for the ticket).

**Closing chat block (mandatory).** End the turn with this block, in the user's language, heading per the repo's `Doc language` (`task-phase-tracking` → "Reading"; German here):

```markdown
## Stand & nächste Schritte

**Stand:** AI-Draft via /task-draft erstellt (Repo-Plan + Plan-Artefakt im Tracker), Phase `Draft`.

**Nächste Schritte:**
- Plan schärfen mit `/task-refine`.
```

Name **`/task-untangle`** in place of `/task-refine` when the draft carries more coupled open questions than one document can hold — either because the goal is still fuzzy or because it stands while the how is wide open. Same lifecycle stage and same target phase; the difference is the artifact, a bundle of typed nodes instead of an interview against one document.

## Mandatory Markdown header

Five of the lines are universal; the **tracker reference line(s)** are not — their names, count and link format come from the adapter's "Repo-header reference format", and with `Tracker: none` there are none (and no `> **Status:**` line either, since there is no status to mirror). The block below is this repo's rendering, with `Tracker: aura`:

```markdown
# <KEY> — <short title in the repo language>

> **Issue Type:** <one of the adapter's types>
> **Status:** <current tracker status>
> **Phase:** Draft (AI-Draft erstellt, noch nicht gegrillt).
> **Story Points:** <1|2|3|5|8|13>
> <tracker reference line(s)>   ← label, link shape and how many lines: the adapter's "Repo-header reference format". Omitted entirely with no tracker.

## TL;DR (ELI5)

Two to three simple sentences. Enough for a non-technical person to grasp the core.

## Stand & nächste Schritte

**Stand:** AI-Draft via /task-draft erstellt.
**Nächste Schritte:** Plan via /task-refine schärfen.

(Living block — wird laut `task-phase-tracking` aktualisiert, sobald jemand an der Task arbeitet.)

## Story Points & justification

**Story Points:** <1|2|3|5|8|13> — short justification (1–3 sentences), including which axis (volume / complexity / uncertainty) drives the value.

…
```

The `> **Phase:**` line and the stand block are mandatory (see `task-phase-tracking` for the phase vocabulary, the update obligation and the heading spellings per `Doc language`). They are finer-grained than the tracker-mirroring `> **Status:**` line and live purely in the repo file.

## Content of the first elaboration ("rough", but usable)

After the mandatory header, at least these blocks:

1. **Starting situation / problem:** what is wrong or missing today.
2. **What — product picture:** what should hold true after completion (measurable or checklist-like).
3. **Scope:** what belongs to it.
4. **Non-goals:** what is deliberately not part of it.
5. **Assumptions & open questions:** what still needs to be clarified (for later refinement).
6. **How — implementation:** the technical route and the affected areas, e.g. `src/api/`, `src/app/`, infra — only as far as derivable from the context; no invented details.

Length: **short to medium** (typically one to a few screen pages), no novel — it is an **entry-level draft**, not a final specification.

Blocks 2 and 6 are the **what** and the **how** of the same task: the plan is the product requirements document, and the how hangs below the what. They are the two sections `task-untangle` replaces wholesale when it closes a part, which is why this skill owns their names. Like every heading in the plan they follow the repo's `Doc language` — in this repo `## Was — Produktbild` and `## Wie — Umsetzung`. Existing plans still carry the older spellings ("Zielbild", "Technische Hinweise / betroffene Bereiche"); they are **not** migrated, and `task-untangle` recognises both.

## Language

Owned by `general-language-policy`: tracker content is English, repo Markdown under the task folder follows the target repo's `AGENTS.md` → key `Doc language` (German here), and translation goes **repo → tracker** only, never back.

## Quality checklist

- [ ] Target resolved — or created via the adapter's call sequence (including its parent resolution and confirmation), never a re-implemented create. With two trackers, the counterpart was handled by `tracker-mirror`, not here. With `Tracker: none`, the keyless layout was used deliberately.
- [ ] **Idempotency guard ran on both sides:** both present → aborted with a pointer to `/task-refine`; exactly one present → reconciled 1:1 (content-identical); neither → drafted.
- [ ] Folder and `task-<slug>.md` created with the mandatory header (issue type, status, `Phase: Draft`, story points, the adapter's tracker reference line(s)) and the rough content blocks.
- [ ] Plan link added to the tracker item as **clickable Markdown link syntax `[Text](URL)`** (or deliberately skipped with no tracker).
- [ ] **Story points** set on the scale in `task-artifact-conventions`, with the driving axis named — or deliberately absent because the repo does not estimate.
- [ ] **Tracker sync:** artifact created from the repo file and linked, repo header carries the adapter's clickable references, status walked to the draft-stage target. A bookkeeping failure left a reconcilable note, never a blocked draft.
- [ ] **Worklog updated** (done section, `Draft erstellt: … — ✅ · <KEY> · Phase Draft`).
- [ ] Turn ended with the mandatory `## Stand & nächste Schritte` chat block pointing at `/task-refine` — or at `/task-untangle`, where the draft carries more coupled open questions than one document holds.
