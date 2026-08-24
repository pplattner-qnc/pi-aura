---
name: task-untangle
description: >-
  anwalt.de engineering-workflow skill. Untangles an undertaking that carries more coupled open questions than one
  plan document can hold — as a bundle of typed Markdown nodes (question,
  decision, fact, task) with a browsable graph, instead of a plan document.
  The alternative to task-refine at the same point of the lifecycle (draft →
  refined), and it works at either altitude: the goal may still be fuzzy ("I
  want to rework X at some point", "something is off with X", "I don't know
  where to start"), or the goal may already stand while the how is wide open
  (a hundred coupled implementation questions). Use task-refine when the plan
  fits one document and only needs sharpening; go straight to task-create for
  something small and clear.
version: 6.0.0
---

# task-untangle

## Purpose

Most plans fail not on the how, but because the what was never clarified — and some fail because the what stands while the how has more coupled open questions than a document can hold. This skill keeps the conversation on one question at a time until it is solid, and logs every question, every task and every decision as a Markdown bundle, so the path stays traceable and another agent can pick it up at any time.

The result is not an implementation and not a slice plan, but a derived specification, folded back into the task plan itself. From there the normal task lifecycle takes over (see "Handoff").

**The alternative to `task-refine`, not a stage before it.** Both sit at the same point of the lifecycle and both end with a refined plan; they differ in the **shape of the artifact**, not in how clear the goal is. `task-refine` interviews against **one plan document**. This skill produces a **bundle**: one file per question, decision, fact and task, with typed relations and a graph over them. When the questions are few enough to hold in a document, use `task-refine` — a twelve-file bundle for a two-hour feature is harm, not benefit.

## Prerequisite — a task must exist

The bundle **always** lives in its task's directory:

```
docs/tasks/active/AURA-850-action-parity-operation-layer/
  untangle/             ← the bundle
```

**Reading an existing bundle:** accept `untangle/` **and** the older name `idea-refine/`. Bundles written before the rename keep their folder name — nothing looks the name up, so renaming them would only break the links pointing at them.

If no task exists, one is created first — via `task-create`. Only its `draft` mode creates the repo folder (it chains into `task-draft`), so that mode is the entry point here; an idea captured in `idea` mode has no folder yet, and `task-draft` materialises it later. This skill **never** creates a task directory itself — otherwise naming and conventions drift apart.

Three entry paths:

**New idea.** Nothing exists yet. First `task-create` with the raw idea as the title, then this skill in the created directory. The task's story points are necessarily a guess at that point — they are corrected at the close of part 1, once the scope is known.

**Existing task, fuzzy goal.** The plan does not carry, the refinement is going in circles. Then start in the task directory. In this case `idea.md` contains not a shouted-over sentence but the existing task title and goal description verbatim — likewise unsmoothed.

**Existing task, the goal stands.** The what is settled and the how is wide open — a large undertaking measured against an external specification, a rework touching everything at once. The run then starts at part 2, and `idea.md` carries the settled goal verbatim as the specification part 1 would otherwise have derived. Everything else is unchanged, and it all lands in **one** bundle: a non-technical decision spawns a technical question, so why and how belong to the same graph rather than to two procedures.

## Altimeter — first, always

Before anything else, exactly one question:

> How would you know that it is done?

The answer does not decide **whether** this skill runs. It decides **where the first question sits**:

| The answer is | Altitude | The first question is |
|---|---|---|
| hesitant, an enumeration, or describes the how instead of the outcome | the why is unclear | a purpose question, `scope: what` — the run starts at part 1 |
| clear in one sentence, but the undertaking carries more coupled open how-questions than one document holds | the why stands, the how is open | the topmost unresolved how-question, `scope: how` — the run starts at part 2 |
| clear in one sentence **and** the undertaking is small | — | **abort** — say so and point at `task-create`, or at `task-refine` if a plan already exists |

**The abort survives, for the case its reasoning always meant: small *and* clear.** A twelve-file bundle for a two-hour feature is harm, not benefit — and that is a statement about size, not about clarity. Size is therefore the second trigger next to fog: many coupled open questions earn a bundle whether they are many because nobody knows the goal yet, or because the goal is large.

**Where the line runs, in practice:** if the open questions still fit into a plan's open-questions section without that section becoming unreadable, it is `task-refine`'s job. If answering one question visibly spawns the next three, it is this skill's.

The order matters: the altimeter comes **first**, because a run that aborts here must not have paid for a survey nobody needs.

Once the altitude is set, create the bundle, then take the kickoff look at the codebase (see "Looking into the codebase") before asking the first question.

## Bundle

```
<task-directory>/untangle/
  index.md              okf_version: "0.2", types, predicates, current
  log.md                session log, especially what was waved away
  idea.md               exactly one, never rewritten
  questions/q-NNN-*.md
  tasks/t-NNN-*.md
  facts/f-NNN-*.md
  decisions/d-NNN-*.md
  prototypes/q-NNN-<slug>/index.html
```

`index.md` and `log.md` stand **beside** the node set: they carry no `id`, no type and no predicates, and are not held to the node contract. What is read out of `index.md` is the `current` list (see "Where the run stands").

### Types

| `type` | Fields | Meaning |
|---|---|---|
| `idea` | — | starting point, raw, exactly one |
| `question` | `scope: what \| how`, `status: open \| drafted \| answered` | an open point |
| `task` | `status: open \| running \| done \| dropped`, `owner: agent \| human` | work that must be done |
| `fact` | `status: current \| outdated`, `surveyed: <date>` | a given that this undertaking does not decide |
| `decision` | `status: active \| superseded` | a choice that could have turned out differently |

`drafted` means: material exists, the decision is pending.

**Every node carries an `id`**, and it is identical to its filename prefix: `decisions/d-008-uebergabenotiz.md` declares `id: d-008`. The id — not the path — is what every relation points at, and the validator rejects a missing one or a mismatch. Without it the same node has two names, and "does the target exist?" has two answers.

### Predicates

Every relation is a sentence whose subject is the file it stands in. The reverse direction is derived, **never** maintained. Relations point **forward**: from the origin at the thing it produced — idea → questions → tasks → decisions — so a node never names where it came from, only what it spawned.

| Predicate | Lives in | Points at |
|---|---|---|
| `raises` | idea, question, task, fact, decision | question, task, fact, decision |
| `answered_by` | question | decision, fact |
| `blocked_by` | question | question |
| `superseded_by` | decision | decision |
| `conflicts_with` | decision, fact | decision — symmetric between two decisions; a fact records it against the decision it contradicts; never between two facts |
| `constrained_by` | idea, question | decision, fact |

**Targets are bare ids**, never paths: `raises: [q-008]`, not `raises: [questions/q-008-kontext-phasengrenze.md]`. A path repeats the slug, which changes when a question is retitled, and it makes the same target writable two ways. The parser still resolves the old path notation so a half-migrated bundle stays readable, but the validator reports it.

Cardinality: a question may carry several `answered_by` entries over time (a superseded draft answer and its active successor), and an answered question has exactly one valid answer — one active decision or one current fact. The mirror constraints live on the derived side, because a node no longer names the question it answers: a decision answers **at most one** question, a fact likewise at most one. *At most*, because a framing decision answers no question at all — it precedes the questions and the idea points at it with `constrained_by`.

Of these, the validator checks the **decision side** (by counting how often the questions cite the same decision — a decision names no question, so there is nothing else to count). The question side is deliberately left alone: several active answers stay legal for the tool, so the norm above holds by discipline, not by check. The price is named — two contradicting active answers to one question are visible only in the graph, as a question with two green answer edges.

### File bodies

The value of a bundle sits in the bodies, not in the front matter: the front matter says only *that* something was decided. So the mandatory sections are part of the contract too, and they carry a **language-free key** in the heading:

```markdown
## Nicht gewählt [not-chosen]
```

| Node type | Keys, in order |
|---|---|
| `decision` | `[decided]` `[rationale]` `[not-chosen]` `[follows]` `[invalid-if]` |
| `task` | `[brief]` `[result]` `[limits]` |
| `fact` | `[state]` `[reach]` `[outdated-if]` |
| `question`, `idea` | none — no fixed sections are prescribed for them |

The **heading text** follows the repo's `Doc language` (the German rendering is this repo's); the key does not, which is why the check works unchanged in an English repo and does not hinge on hitting `Ungültig, wenn` comma-exactly. `[limits]` covers both names named below for that one task section — one purpose, one key, two permitted headings. The reader never sees the key: the viewer strips it when rendering, while the file keeps it, or the check would have nothing to hold on to.

The validator reports a missing key and an empty section. **A node carrying no key at all is not checked** — that is what keeps a finished older run out of the report, where no decision will ever be written again.

The **idea** contains the wording at the start, unsmoothed, and is never rewritten. The sharpening happens in the decisions — otherwise the record of how fuzzy the beginning was would be lost.

**What decisions are judged against needs no new place.** A framing decision the idea points at with `constrained_by` **is** that yardstick — "nothing new in the application, no build step" is one decision, and three later decisions fall against it. Name it as such when it appears, rather than inventing a criteria section: the idea is never rewritten, so a yardstick discovered mid-run could not go there anyway.

A **question** contains why it arose and which tasks are working on it. It contains no research results — those live in the task.

A **task** carries `Auftrag [brief]` (precise enough to delegate), `Ergebnis [result]` (what was gathered — here, not in the question) and `Nicht gemessen [limits]` respectively `Offen geblieben [limits]`. The last section is the most valuable one: it prevents a result from carrying further later than it may.

A **fact** carries `Stand [state]` (what holds, with provenance), `Reichweite [reach]` (what it covers and what it does not) and `Veraltet, wenn [outdated-if]`. It has no rationale and no alternatives — nothing was decided about it.

A **decision** must be readable without its question: `Entschieden [decided]` (one sentence, what holds), `Begründung [rationale]` (why, without referencing the question), `Nicht gewählt [not-chosen]` (only the options that were really in the running, with the reason that actually tipped it), `Folgt daraus [follows]` (question seeds), `Ungültig, wenn [invalid-if]` (revision triggers).

## Visible markers

Question, decision and explanation must not run past the user as one continuous prose stream — nobody can then tell at a glance whether something was just decided or merely explained. Every event of the six kinds below therefore opens with its marker as a chat heading.

**The emoji is the identity, the word next to it is only the label.** The emoji is the same in every language; the label follows the repo's `Doc language` (the German rendering is this repo's). Same principle as `worklog-personal-tracking`.

| Marker | Fires when |
|---|---|
| ❓ Frage | a question is put to the user |
| ✅ Entscheidung | a question is closed with a decision |
| 📌 Fakt | a question is closed with a given |
| 🔧 Task | work is created or finished |
| 🗺️ Graph | the graph is handed over or linked |
| 🖼️ Prototyp | a prototype is offered or ready |

Use one marker per event, never two on one heading. Ordinary conversation — a lead-in, a follow-up, a summary — carries no marker; markers would stop being signals if everything had one.

**The first four double as the node-type symbols in the graph**, joined by 💡 for the idea, which has no event of its own. Same symbol for the same thing in the chat and in the picture — a reader should not have to learn two vocabularies.

## Make every question understandable

A question the user does not fully understand produces a confirmed decision nobody actually made. So the run must *build* the understanding, not assume it. This is not a phase of its own; it is how every single question is posed.

**Before the question**, in flowing prose: what it is about, which part of the picture it touches, why it matters, and what the options mean **in practice**. Then the clean, short question.

**After the close**, two or three sentences in plain language on what was just decided and what follows from it.

- **Scale the depth to the difficulty.** A decision deep in the model gets a full lead-in; an obvious one gets a single sentence. Never pad a trivial question.
- **Talk, do not label.** No "Context:", no "Question 3/7" — a casual, continuous conversation.
- **Make feature questions concrete.** Where possible with a real example ("you open task X, drag it above Y — should Z move along?"). An abstractly posed feature question gets an abstract answer.
- **No jargon coined on the fly.** If a term needs its own explanation, it does not belong in the question. Terms like "sanctioned self-selection" cost a whole round in the AURA-930 run.
- **Explain, do not quiz.** The user should understand by following the lead-in — not be tested afterwards on whether they did.

This is deliberately the same instruction as `task-refine` → "Make every question understandable". The duplication is intentional: a skill has to be readable without another one open next to it.

## Flow

### 1. Open

Capture the idea verbatim, do not smooth it. Create two to four goal-clarification questions as nodes. **Ask only one of them.** Asking several at once leads to answers that cannot be attributed to a single question.

### 2. Create and start tasks

Every piece of work is a `task` node — including the agent's own research. For open, unblocked questions create tasks and hand those with `owner: agent` to subagents immediately, at most three at a time.

The subagent writes its result **into the task file**. That keeps the question clean, and a second research is a second task instead of an overwrite of the first. It may report back that there is nothing to research; pure preference questions are the norm in part 1. Then `status: dropped` with a reason.

Tasks with `owner: human` get a name and a date. If a task waits on a third party, that belongs in it too — otherwise the graph shows a standstill nobody can explain.

**Do not show results before the user has answered.** The uninfluenced answer is the only thing only they can contribute.

### 3. Collect the answer

Ask the question. If the user answers with several goals at once, the question is not answered — then first separate purpose from means and have the sorting confirmed. A sorting made by the agent is a claim and needs consent.

### 4. Cross-check

Once material exists, lay it next to the answer. If they match, close. If they diverge, name the contradiction and let the user choose — they may decide against the research; its objection then goes under `Nicht gewählt`.

If material arrives only when the decision already stands: **do not touch the decision.** Instead create a new question and record it in that decision's `raises` list — that is bookkeeping, not revision. If the user revises, the old decision gets `superseded_by` pointing at the successor; the old one stays.

### 5. Close — fact or decision

When closing a question, check which of the two arises:

> Could I decide in this undertaking that it is otherwise?

No → `fact`. Yes → `decision`.

The boundary is the project frame, not metaphysics. "I have a Linux server available" is a fact, even if someone procured it at some point — it is not decided here. "We are setting up a Linux server" is a decision. The same statement can be the one or the other sort in a different bundle.

A frame condition is not a type but a role: it arises through `constrained_by` and can be taken by either sort.

**Then run the validator over your own bundle** (see "The contract is checked") and require it green, before the closing summary. Closing a question is where nodes change — a new file, a new `answered_by` entry, an updated `current` list — so it is the cheapest place to catch a broken one.

### 6. Carry on

Every decision spawns new questions — that is the engine. Turn `Folgt daraus` into nodes. Back to step 2.

## The graph

The bundle's view is not a file but a route. `task plans:serve` starts one server for the whole task folder, and `/graph/<bundle-path>` draws the bundle **fresh from the files on every request** — nothing is stored, so nothing can go stale. Its landing page at `/` lists every bundle with its graph, its plan and its prototypes. Hand the user the URL the server **printed on startup**, never an assumed one.

There is **no hand-drawn map any more**. In the AURA-930 run a Mermaid `map.md` was the single thing that kept the user oriented, and it had to be invented mid-run — but it drifted from the nodes whenever it was not redrawn, and it broke on its own cross-edges. Bundles that still contain a `map.md` keep it as a record of their run; it is read, not maintained, and no new bundle gets one.

**Only the main flow is drawn.** `raises` and `answered_by` form a DAG that produces clean layers on its own, top-down, with the idea at the top. `constrained_by`, `blocked_by` and `superseded_by` stay in the front matter and out of the picture. `conflicts_with` is the one exception: a switchable overlay, red, **off by default** — because a conflict is the only predicate that points at a real problem in the bundle, and because cross-edges destroy exactly the layering the readability hangs on. In the AURA-930 bundle its 36 `constrained_by` cross-edges were the single thing that destroyed the hierarchy.

A node with no incoming edge — a framing decision that preceded the questions, a fact raised by the kickoff look — is simply a root beside the idea. The invisible layout anchor the Mermaid map needed for those is gone with it.

**One colour per role.** A settled state alone is not enough — the reader must tell an answered question from a decision at a glance:

| Colour | Role |
|---|---|
| 🟠 orange | **idea** — the single starting point, at the top |
| 🔴 red | **question open** |
| 🟡 amber | **question drafted** |
| 🟢 green | **question answered** |
| 🟣 purple | **decision active** |
| 🟣 pale purple, dashed | **decision superseded** |
| 🔵 blue | **fact current** |
| ⚪ grey | **task** — a work package, whatever its state |

**The colour carries the role, the symbol carries the type** — two systems for two facts, never both for the same one. The node label is `<symbol> <ID>` and the title below it, ids in upper case (`D-001`) as a display convention only; front matter and filenames stay lower case, so the contract does not hang on cosmetics. The idea carries no number and shows only its symbol and title. The symbols are the chat markers from "Visible markers"; the type symbol is needed *because* the colour moves with the status — an open and an answered question are red and green and would otherwise no longer read as the same sort of node.

**Large bundles stay readable** by subtraction, not by folding: clicking a node fades everything unconnected to it, and filters by type and status leave only the live front standing. Folding subtrees is not offered — the drawn graph is not a tree (a question can be raised by two decisions), and "collapse subtree" has no defined meaning with several parents.

**Where the run stands** is a list in `index.md`, not a marker somebody drags along:

```yaml
current: [q-042, t-011]
```

A list, because research tasks run in parallel and several questions can be drafted at once. Those nodes get a thick dark outline, leaving the role colour readable underneath. An absent or empty list is valid — a finished run stands on no node. The validator checks that every entry exists and is still unclosed, which is what keeps the list from quietly rotting.

## The contract is checked

Types, predicate vocabulary, target notation, cardinality, the `current` list and the mandatory body sections are checked by a validator, not merely described here:

```bash
task plans:check -- docs/tasks/active/<KEY>-<slug>/untangle
```

**Run it every time a question closes, and require a green run.** That is stricter than closing a part, on purpose: it is the point where nodes change, and the check is silent when it passes, so it costs a second and no attention. Always name **your own** bundle as the argument — the argument-less form sweeps every bundle in the repo and is maintenance. A gate that can turn red on a foreign, long-archived bundle gets ignored after the second time, and then nothing is checked at all.

The graph route runs the same parse and the same checks and shows the count in its footer, so a breach is visible even if nobody runs the CLI — a node edited by hand would otherwise break the contract silently.

With `--digest` it prints the bundle as text instead of checking it — nodes by type, id, status and title, unclosed first. That is the overview for whoever has no browser: another agent, a pull-request reader. It writes nothing, so there is nothing that could drift.

## Prototypes

How a frontend looks often decides directly what the user actually wants. In the AURA-930 run the decision on the primary view fell only once there was something visible — and the prototype was improvised: an ad-hoc directory with no recognisable link to its question, and a web server started and killed by hand.

**The threshold, recognisable from the inside:** when the answer depends on how something is arranged or presented — noticeable by the fact that the options can only be *described in prose* any more — offer a prototype. Additional forced trigger: the user hesitates on the same question, or asks back.

A prototype is usually plain HTML and lives at:

```
untangle/prototypes/q-NNN-<slug>/index.html
```

One folder per question, with the question number in the name, so it stays recognisable later what it was built for. It stays a `task` node with `owner: agent` — the prototype is the task's result, and `prototypes/` is a directory, not a new node type.

**Serving it.** One static server covers the whole task folder, so every prototype in every bundle is reachable by its path and nothing has to be started per question:

```bash
task plans:serve
```

Behind it sits `serve-plans.ts` in this skill's folder, run by Deno. It derives its port from the worktree's stack token and prints the URL on startup — read the URL from that output rather than assuming one, and hand the user the deep link to the concrete `index.html`. **Deno is required for this** and is the only piece of this skill that is: everything else in this repo runs on Docker, yarn and Node. If Deno is missing, say so plainly and offer the prototype as a file to open instead of guessing at a substitute.

## Looking into the codebase

Questions were asked in the AURA-930 run that a look at the existing code would have made unnecessary — "tasks have no priority field today" was surveyed only once somebody thought to ask.

Two triggers:

- **The kickoff look**, after the altimeter and before the first question: what exists today in the area the idea touches? Placed after the altimeter on purpose — a run that aborts there must not pay for it.
- **Point lookups**, as soon as a question depends on what is already there.

Both use the **existing task mechanism**: a `task` node with `owner: agent`, delegated to a subagent, result in the task file. No new term, no second track.

**The guard against sliding into the technical lies in the shape of the result.** It has to fit in one sentence a non-technical person understands:

> Tasks have no field for importance today.

File paths, field names and model names may stand next to that as provenance — never as the answer. Technical depth belongs to part 2, unless the user explicitly wants it earlier.

## Rules

**What before how.** If the user veers into the how, exactly one follow-up question:

> Does that constrain what you want — or is it an idea for the implementation?

If it constrains, it immediately becomes a `decision`, and the idea gets `constrained_by` pointing at it. "It has to run on my server" is not an implementation idea but a requirement in a costume.

If it is an implementation idea, file it as a question with `scope: how` and leave it. Park visibly, do not stifle.

Exception: a `how` question that blocks a `what` question is worked on immediately. The blocked question then carries `blocked_by` pointing at the blocker.

**The gate applies to questions, not to tasks.** A task inherits its `scope` from its question. A prototype that answers a `what` question is not veering into the how but the fastest way to the what. Building is allowed when it clarifies.

**Exploration.** A task may be raised directly by the `idea`, with no question in between. That is the excursion without answer duty: it answers nothing, blocks nothing, closes nothing — it may only spawn nodes. Without this permission, exactly those explorations would be excluded whose value lies in not knowing beforehand what to look for.

**Done is not answered.** A finished task delivers material, not an answer. A question may only become `answered` when none of its tasks is `open` or `running` anymore — whoever wants to decide anyway consciously sets them to `dropped` first.

**Tasks may raise questions.** A prototype shows something nobody expected; a measurement hits a limit. Such questions are recorded in the task's `raises` list. That is the main reason tasks are nodes and not bullet points.

**The agent never decides.** Material is a suggestion. Every decision needs consent, even the seemingly obvious one.

**What is waved away gets logged.** What the user brushes off becomes a decision or a `log.md` entry. Never nothing — otherwise the next agent asks again.

**Conflicts are not talked away.** Two active nodes that contradict each other get `conflicts_with` and spawn a question. A goal conflict resolves through renunciation, not through thinking. Two facts cannot collide — then one is wrong.

## Re-entry

Read `index.md` and `log.md`, then present the open questions sorted by `scope` and propose **one**. Name open tasks with `owner: human` first — they block the longest.

Never ask "what do we want to do today?". The state is on disk.

## Closing a part — writeback and coherence pass

**A part ends the same way in both cases.** Part 1 is done when no open `what` question exists and no open question blocks a `what` question. Part 2 is done when no open question exists at all. The asymmetry that used to sit here — a whole section for part 1, half a sentence for part 2 — is exactly why the AURA-930 plan ended up appended instead of consolidated.

**A run that entered at part 2 has no part 1 to close.** Its condition is met from the start — there never was an open `what` question — so nothing is owed there, and the close-out below applies to part 2 only. Do not manufacture what-questions to have something to close.

First derive the specification: all active decisions and current facts answering that part's questions, plus everything the idea lists under `constrained_by`. It is **derived, not written** — reproducible at any time, so it never drifts.

Then three steps, in this order:

### Step 1 — Replace the part's own section

The result goes into the task plan `task-<slug>.md`, into **one** section — the run produces no second document. Section per part, headings following the repo's `Doc language` (the German rendering is this repo's):

| Part | Section |
|---|---|
| 1 (what) | `## Was — Produktbild` |
| 2 (how) | `## Wie — Umsetzung` |

The task **is** thereby the product requirements document, and the how hangs below the what. Whoever only wants to sign off on the what — a stakeholder — reads the upper part and ignores the lower one; that needs no second file.

- **Replace the section completely**, as continuous prose derived from the nodes. Never append a list to what is already there.
- `task-draft` created these sections; **recognise the older spellings too** ("Zielbild", "Technische Hinweise / betroffene Bereiche", and their English template equivalents) and replace the section that is there, instead of putting a second one beside it. Same procedure `task-phase-tracking` prescribes for the stand block. That way the existing plans need no migration.
- **Every statement carries its source, inline and clickable** — the node id as a Markdown link to its file in the bundle:

  ```markdown
  Die abgeleitete Reihenfolge ist die Primärsicht ([d-008](untangle/decisions/d-008-abgeleitete-reihenfolge-ist-primaersicht.md)).
  ```

  Whoever finds a mistake corrects the decision, not the prose.

### Step 2 — Coherence pass over the whole document

Then read the **entire** plan and check whether it still contradicts itself. This step exists because the run changes sections nobody owns — and so nobody touched them:

- [ ] **TL;DR** — still describes what the plan now says?
- [ ] **Stand & nächste Schritte** — reflects this part's close, and names the next step?
- [ ] **Starting situation / problem** — still the problem the specification now solves?
- [ ] **Scope / Non-goals** — everything split off during the run (a decision that became its own ticket) moved out of scope?
- [ ] **Assumptions & open questions** — points answered by this part removed, and the remaining ones still genuinely open?
- [ ] **Story points** (part 1 only) — re-estimated? They were assigned before the goal was clear and are almost always wrong. Name which axis drives the new value. A run that entered at part 2 skips this, and rightly so: there the estimate was never a shot in the dark, because the goal already stood when it was made.
- [ ] **What the bundle cannot answer** — a question that hangs on the code rather than on the product picture (a schema detail, an existing event type) does not belong in a decision. It stays in the open-questions section as an explicitly named next step, so it is not mistaken for something the run settled.

**Preserved verbatim:** the header block (`> **…:**` lines), the story-point justification and the model recommendation. Rewriting those is not this skill's business — with one exception: the `> **Phase:**` line, which `task-phase-tracking` owns and requires to be current. Update it, and nothing else in the header.

If the user says on reading "that is not what I wanted", that is not a failure of the method but a new question.

### Step 3 — Commit the bundle

A bundle is almost entirely untracked files until someone commits it — and untracked files are defenceless against another session's `git stash -u` or `git clean`. The AURA-930 bundle was wiped exactly this way mid-run and only survived because the stash was never dropped. So when a part closes, commit the bundle together with the plan file. The commit is part of the close, not an optional extra.

## Part 2 — How

The same mechanics with `scope: how`. The starting point is a specification instead of the idea — either the one part 1 derived, or one **brought in from outside** when the altimeter put the run in at part 2: a settled task description, a signed-off product picture, an external requirements document. Both are the same input, and neither is smoothed: it goes into `idea.md` verbatim.

Between the parts the run stops: after part 1, part 2 starts when the user wants it, not automatically.

## Handoff

After a **complete** run — both parts closed — `/task-refine` is **skipped**. The plan was grilled question by question and checked for coherence; a second interview would ask what already stands in the bundle as a decision.

| Next step | When |
|---|---|
| `/task-refine-review` | always, right after a complete run — reads the finished plan from several perspectives without interviewing |
| `/task-slice` | afterwards, if the cut is large or unclear (≈8–13 SP, several independent parts) |
| `/task-implement` | afterwards, if the scope is small and clearly outlined |

`/task-refine` stays the path for plans that never went through this skill, and for a run that was broken off after part 1.

## Open points

Deliberately not normative yet, so they do not slip into the method unchecked:

- **Every decision pointing at its yardstick.** Today only the idea points at its framing decisions with `constrained_by`, so "which decisions hang on this yardstick?" cannot be answered from the graph. It would take a new predicate; worth deciding after a run large enough to feel the lack, not before.
- **Harvest step.** What was chosen incidentally while building a prototype easily wanders into the bundle as a supposed observation. Candidate: three mandatory sections at the end of a task — `Gemessen`, `Dabei gewählt`, `Aufgefallen`.
- **Slicing.** Cutting work packages out of the specification. Probably does not belong here but into `task-slice`, with better input.
- **Subagent limit.** Three is a guess, not measured.

## Change log

> On every content change, bump `version` in the frontmatter (SemVer) and add an entry here.

SemVer: **MAJOR** = incompatible restructuring; **MINOR** = new rule/capability; **PATCH** = clarification/fix.

- **6.0.0** (2026-08-12): Renamed from `idea-refine` to `task-untangle` and moved to `.agents/skills/anwaltde/universal/task/task-untangle/` (AURA-1296) — the old name pinned an altitude the method never required, and the `task-` prefix puts it where it belongs: **the alternative to `task-refine`** at the same point of the lifecycle, distinguished by the shape of the artifact (bundle vs. plan document), not by how clear the goal is. New bundle folder name `untangle/`; the older `idea-refine/` is accepted on read. **The entry rule became an altimeter:** the fog test stays as the first question but no longer gates admission — it sets the altitude, and a third entry path was added for "the goal stands, the how is wide open"; the abort survives for the case its reasoning always meant, small *and* clear. Part 2 may therefore start with a specification brought in from outside, and a run entering there owes neither a part-1 close nor a story-point re-estimate. **The front matter became a checked contract:** `id` is mandatory and equals the filename prefix, relation targets are bare ids instead of paths, and `task plans:check` validates types, predicates, targets, cardinality and the `current` list — required green every time a question closes, for one's own bundle. The cardinality rule is corrected on the decision side ("at most one question", so framing decisions are legal); the question side keeps its norm but is deliberately unchecked. **The contract now covers the bodies too**, via language-free section keys in the headings (`## Nicht gewählt [not-chosen]`), so a missing rationale section cannot disappear unnoticed. `--digest` prints the bundle as text for whoever has no browser. **`map.md` is gone as an obligation:** the graph is a live route (`/graph/<bundle-path>`) served by `task plans:serve`, drawn fresh on every request, with a landing page over all bundles, rendered Markdown, type symbols on the nodes, filters, a switchable red conflict overlay, and `current` in `index.md` as the "where the run stands" list; existing map files stay as records of their run. Amber added to the role palette for `drafted`. The *Criteria* open point is resolved: a framing decision under `constrained_by` **is** the yardstick, so no new place is invented.
- **5.2.0** (2026-08-05): Map reworked from the AURA-930 redesign: colours now encode the node **role** (idea orange; question open red, answered green; decision active purple, superseded pale and dashed; fact blue; task grey) instead of one shared "settled" green; only main-flow edges (`raises`, `answered_by`) are drawn — `constrained_by`, `blocked_by`, `superseded_by` and `conflicts_with` stay in frontmatter, with an opt-in red edge for an active conflict; invisible `~~~` anchors place nodes that have no incoming edge; the idea sits at the top.
- **5.1.0** (2026-08-05): Closing a part gains step 3 — commit the bundle and the plan file together. A bundle is mostly untracked files and defenceless against another session's `git stash -u`/`git clean`; the AURA-930 bundle was wiped that way mid-run, and the lesson recorded in its log is now part of the method.
- **5.0.0** (2026-08-05): Reworked from the AURA-930 run (AURA-1031). The map (`map.md`) becomes a mandatory bundle member with a three-colour scheme and a separate "you are here" marker, drawn on request plus automatically at each part's end; older bundles' `graph.md` is recognised on read. New sections: visible chat markers, "Make every question understandable" (mirroring `task-refine`), prototypes with a recognisable threshold, a fixed location `prototypes/q-NNN-<slug>/index.html` and a static server (`serve-plans.ts` via `task plans:serve`, port derived from the worktree's stack token), and the look into the codebase as a kickoff survey plus point lookups whose result must fit in one non-technical sentence. Closing a part is now **symmetric** for both parts: full replacement of the part's own section with inline provenance links, followed by a coherence pass over the whole document — the sections nobody owns (TL;DR, stand, starting situation, scope, non-goals, open questions) are named explicitly. The two plan sections are `## Was — Produktbild` and `## Wie — Umsetzung` (renamed in `task-draft` too; the old spellings stay recognised). Handoff changed: after a complete run `/task-refine` is skipped in favour of `/task-refine-review`.
- **4.0.0** (2026-08-04): New node types from the upstream template, mapped onto the forward predicates: `task` (work delegated to subagents or humans; research results now live in the task file, no longer in the question) and `fact` (a given with survey date and reach, distinguished from a decision at close-out). New rules: the what-gate applies to questions, not tasks; exploration tasks raised directly by the idea; done is not answered; tasks may raise questions. The template's check-script references dropped (no such script in this repo).
- **3.0.0** (2026-08-03): Predicate direction flipped — relations now live in the source node and point forward: `raises` (replaces `raised_by`), `answered_by` (replaces `answers`), `blocked_by` (replaces `blocks`), `superseded_by` (replaces `supersedes`), `constrained_by` (replaces `constrains`); `conflicts_with` unchanged (symmetric). Reading direction is now idea → questions → decisions. Existing bundles must migrate their frontmatter; the AURA-798 bundle was migrated in the same change.
- **2.0.0** (2026-08-03): Adapted to the Aura repo — skill translated to English per `general-language-policy`; task-folder convention `docs/tasks/active/<KEY>-<slug>/` with `task-<slug>.md`; story points in the plan header instead of directory size tokens; handoff via the `task-*` lifecycle; the `references/check.py` script and all check references removed.
- **1.0.0** (2026-08-01): Initial version — bundle format (OKF 0.2), fog test, what-before-how flow, check script `references/check.py`.
