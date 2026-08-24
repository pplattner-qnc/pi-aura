---
name: task-implement
description: anwalt.de engineering-workflow skill. Orchestrates feature-branch implementation for a ticket — both the single (un-sliced) ticket and the sliced/multi-wave case. Use when the user invokes /task-implement, says "implement this ticket", "start working on <KEY>", "build the feature branch", or — for sliced plans — "start/implement the next wave", "do the next batch of subtasks in parallel", "continue the plan wave by wave", or "what can I test now". Reads the ticket plan; if it is un-sliced, brings up the branch's app container via the repo's named `start-app` capability, isolates the database before any schema migration via `fork-db`, implements per scope, and emits a Test-URL + worktree path + what-to-test block. If the plan is sliced (a `## Subtasks` table with a `Wave` column), it announces and immediately runs one execution wave at a time — each slice in its own worktree branched from the parent feature branch, implemented in parallel by subagents, then merged back into the parent sequentially and tested there as an integrated whole, with the wave's slices closed to done while the parent stays open for task-finish.
---

# Implement a task — single ticket or sliced waves (`/task-implement`)

Brings up a per-worktree dev stack for the ticket's feature branch and implements it. If the plan is **un-sliced**, it implements the whole ticket in one pass. If the plan is **sliced** (a `## Subtasks` table with a `Wave` column), it drives the plan **one execution wave at a time** on a two-level worktree model, waiting for the user between waves.

## When to apply

- The user invokes **`/task-implement`** or says "implement this ticket", "start working on ANW-XXXX", "build the feature branch for this ticket".
- For sliced plans, also: "start/implement the next wave", "do the next batch of subtasks in parallel", "continue the plan wave by wave", "what can I test now".
- A task plan exists under `docs/tasks/active/<KEY>-<slug>/task-<slug>.md` with a `## In scope` section (single ticket) or a `## Subtasks` table + execution-waves summary (sliced).

**Do not apply** when no plan exists yet — the plan comes from `/task-create` → `/task-draft` (+ `/task-refine`), and slicing from `/task-slice`.

## Step 1 — Read the plan and choose the mode

1. Find the task file under `docs/tasks/active/` matching the ticket key. Read it fully: `## In scope`, `## Out of scope`, `## Human test`, `## Acceptance criteria`, `## Preconditions`, and — if present — the `## Subtasks` table and the **Ausführungs-Wellen** summary.
2. **Detect slices.** If the file has a `## Subtasks` table with a `Wave` column (and an execution-waves summary), switch to **Sliced mode → wave orchestration** below. Otherwise use **Single-ticket mode**.
3. Note the feature branch name. Convention: `feature/ANW-XXXX-<slug>`, or whatever is already in use for this ticket (check `git branch -a`).
4. **Run the pre-implementation gate** — `task-preflight-checks`, by name, before any code or file edit: the item has an owner, and it is in the in-progress state. Print its report block. For a slice, the parent is checked first. Once per key per session; with `Tracker: none` say so once and continue. Do not reimplement the checks here — the rule owns them.

## Tracker sync

Mirror the implementation status into the tracker per the adapter that `tracker-selection` pulls, which owns the status series and the error policy. Do **not** restate them here. Resolve the item via the adapter's "Parent resolution" chain. With `Tracker: none`, skip this section entirely — the plan file's phase block carries the state.

- **When implementation starts** (single ticket or a slice picked up): walk the item to the in-progress state.
- **Single ticket done** (Step 5): walk it to the review-ready state, one series step at a time. The rest is `/task-finish`'s.
- **Slice done** (Sliced mode, Phase 5): walk that slice all the way to done. The parent stays open for `/task-finish`.
- **On failure:** classify per the adapter's error policy — the code and the plan file are never rolled back for a tracker error, but an identity failure (the item cannot be resolved at all) stops the run instead of implementing against an unidentified task.

**Progress events.** In parallel with the status walk, emit one per the adapter's "Call contracts": at skill start (one sentence on what is about to be implemented), at skill end (single-ticket Step 5, or each wave's Phase 5), and additionally at each wave's start and end in sliced mode. Bookkeeping — independent of the status walk, and never a blocker.

---

# Single-ticket mode

For un-sliced tickets: bring up the environment, implement the whole scope, emit the finish output.

## Step 2 — Decide where to work and bring up the environment

### 2a — Branch choice (ask_user_question — skipped if the worktree already exists)

**First check whether the ticket's worktree is already there** (`git worktree list`, branch per the target repo's `AGENTS.md` → key `Stack-token derivation` / the branch name from Step 1). If it is, the decision was already made in an earlier run: skip the question, name the worktree you are using in one line, and go to 2b.

Only when no worktree exists yet, ask the user via `ask_user_question`:

> **Where should I implement this ticket?**
>
> - **(recommended) Feature-branch worktree** — I'll derive a feature branch for the key, create or reuse a worktree under the repo's worktree root, and work there.
> - **Directly on the base branch** — I'll stay in the current checkout (no feature branch, no worktree).

Fill both options with the concrete branch name and path from the target repo's `AGENTS.md` (keys `Merge target branch`, `Worktree root`, `Stack-token derivation`). Wait for the answer before proceeding. If the user picks the base branch, skip worktree creation and work in the current checkout — the remaining steps still apply (container, DB, implementation), just without a dedicated worktree.

### 2b — Verify the plan is in the worktree

After the worktree exists (or the user chose the base branch and you are staying in the current checkout), confirm that the plan file is present at `docs/tasks/active/<KEY>-<slug>/task-<slug>.md` (it should be, since it was committed to the branch). Emit the plan file's **clickable absolute path** so the user can open it in their editor:

```
Plan: <absolute worktree path>/docs/tasks/active/<KEY>-<slug>/task-<slug>.md
```

Use the real, resolved worktree path — not a placeholder.

### 2c — Opt-in test container (ask_user_question — mandatory, skipped if already running)

**Capabilities, not commands.** This skill names *what* it needs; the concrete command for each is a value in the target repo's `AGENTS.md` → key `Infra capabilities`, and the mechanics behind it belong to the repo's infra rule (here: `worktree-dev-workflow`). Never hardcode a command, a container name or a URL in a run — read the capability, then read the command's own output for the real values.

The capabilities used below are `start-app`, `fork-db` and `migrate`. **A capability the register does not define does not exist**: say so plainly and continue without it, rather than inventing an equivalent command. With no `start-app`, there is no container to offer and this whole step is skipped.

First check whether the branch's stack is already up (container name from the target repo's `AGENTS.md` → key `Container / compose names`, token per the target repo's `AGENTS.md` → key `Stack-token derivation`). If it is, skip the question entirely — state that it is already running, name its URL from the target repo's `AGENTS.md` → key `Test-URL template`, and go straight to Step 3.

Otherwise ask the user via `ask_user_question`:

> **Soll ich einen Test-Container hochfahren?**
>
> - **Ja** — ich fahre den Container für diesen Branch hoch (ohne Rebuild/Recreate, ohne die geteilte Infra anzufassen). Du kannst dann unter der Test-URL testen.
> - **Nein** — ich implementiere ohne Container; du testest später selbst.

Fill the concrete container name and URL into the question from the register values. If the user says yes, proceed with 2d; if no, skip to Step 3.

### 2d — Bring up the environment (if container requested)

Invoke the `start-app` capability from within the worktree, and **read its output** for the real token, URL, container name and database — those are the values that go into the finish block, never a template you filled in yourself.

Two invariants this skill upholds, whatever the mechanics behind the capability are:

- **Only your own stack.** Starting anything shared is approval-gated (`general-shared-state-and-handoff`).
- **Never reimplement the worktree mechanics.** No manual `git worktree add`, no copying env files — the capability owns that, including reusing an existing worktree.

## Step 3 — Database rule (CRITICAL — read `general-db-destructive-ops` before any migration)

**A schema migration never runs against shared data.** That is the whole of this step; everything else is the project's mechanics.

- **The branch already carried a migration when the stack started** — `start-app` is expected to have isolated the database itself (this repo's does; check its output). Nothing to do.
- **You introduce a migration during implementation** — invoke `fork-db` **before** `migrate`, in that order. If the repo defines no `fork-db` capability, stop and ask rather than migrating against shared data.

Reconciling an isolated database back into the shared one after the merge is **`task-finish`'s** job — do not attempt it here.

## Step 4 — Implementation

**Worklog first (mandatory).** Before writing any code, record that implementation of `<KEY>` has started: add (or update) an entry in the active section in today's worklog file, per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (the rule owns the format, day-rollover, and gitignore mechanics — do not restate them). Keep its status text current as the work progresses. The entry stays in the active section until `/task-finish` moves it to the done section.

**Progress event (mandatory).** Emit one with a short English sentence on what is about to be implemented, per the adapter's "Call contracts". Bookkeeping: recorded on failure, never a blocker.

Implement exactly what the plan's `## In scope` specifies. Apply all relevant area rules (see the rule-map in the target repo's `AGENTS.md`). Stay within scope:

- `## Out of scope` items are off-limits.
- `## Preconditions` must be satisfied before starting (check them; if not met, report and stop).
- Run the tests **scoped** to the files and areas you changed and fix failures before finishing. Then, once the ticket is fully implemented, run the repo's **per-task lane** once at the very end, before the finish output. Do **not** run the full **release gate** here — that runs once at `/task-finish`, before the merge or PR. The per-task lane's blind spot (a regression in an area the diff does not touch) is deliberately caught by that later gate. All three levels — scoped, per-task lane, release gate — are values in the target repo's `AGENTS.md` → key `Test commands`.

**Your verification is the automated test suite, not a browser.** Running (and reporting) the relevant tests plus reading the code is your completeness bar. The in-browser manual test belongs to the **human** and is delegated via the finish output (Step 5) — do **not** open a browser, launch a browser sub-agent, or drive the UI yourself to "confirm it works", and never report the handed-over manual test as a blocked task of yours (e.g. *"a manual browser check wasn't possible because no browser MCP was available"* is wrong — no browser tooling is expected of you). A browser is only in scope if the user **explicitly** asks you to verify something in one.

## Step 5 — Finish output (MANDATORY)

**Worklog update (mandatory).** Before emitting the finish output, update the ticket's active entry in today's worklog file to reflect the new status (e.g. `🧪 implementiert → wartet auf manuellen Test`), per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (one fixed-vocabulary status word + a `→` next-action). Leave it in the active section — it moves to the done section only at `/task-finish`.

**Progress event (mandatory).** Emit one summarizing what was delivered, per the adapter's "Call contracts".

End your turn with the following block. This satisfies `general-shared-state-and-handoff` → "End the turn with where and what to test"; the concrete schemas come from the target repo's `AGENTS.md`.

The `## Wie kannst du es testen?` section and the `Testen:` checklist are instructions **for the human** to run the manual, in-browser check — they are a handoff, not evidence of something you left undone. Your own sign-off is the automated test result (state it, e.g. "alle X Tests grün"). Do not claim, apologise for, or footnote a missing self-run browser check.

First, state in plain, non-technical language (in the user's language) what was implemented and how the user can test it:

```markdown
## Was wurde umgesetzt?
<2–3 einfache Sätze: was das Ticket bewirkt und was sich geändert hat, für einen Nicht-Techniker verständlich.>

## Wie kannst du es testen?
<2–3 Schritte in Alltagssprache: was öffnen, was klicken, was erwarten.>
```

Then emit the technical details block:

```
Test-URL:   <from the target repo's `AGENTS.md` → key `Test-URL template`>
Container:  <from the target repo's `AGENTS.md` → key `Container / compose names`>
Worktree:   <resolved worktree path>
Database:   <the isolated DB, or "shared" if no migration>
Testen:
- <concrete step derived from the plan's Human test / acceptance criteria>
- <concrete step 2>
- <concrete step 3 — specific to THIS change, not generic "open the app">
```

- **Every value comes from the `start-app` output**, not from filling in a template yourself. In the base checkout the worktree path is the repo root.
- **Testen checklist**: 2–4 bullets derived from `## Human test` and `## Acceptance criteria`. Specific and actionable.
- If no test container was started (user opted out in Step 2c), omit the Test-URL and Container lines and note that the user chose to test without a container.

Directly below that block, close the turn with the mandatory chat block, heading per the repo's `Doc language` (`task-phase-tracking` → "Reading"; German here):

```markdown
## Stand & nächste Schritte

**Stand:** Ticket <KEY> implementiert und getestet auf <Test-URL>.

**Nächste Schritte:**
- Testergebnis bestätigen.
- Optional: `/pr-review` vor dem Finish (freiwillig, kein Gate).
- Ticket abschließen mit `/task-finish`.
```

After the user confirms they are satisfied with testing, offer to run the `pr-review` skill (`the target repo's .agents/skills/anwaltde/universal/pr-review/SKILL.md`) as an optional handoff — never a gate before `/task-finish`.

---

# Sliced mode — wave orchestration (two-level worktrees)

For a plan the `/task-slice` skill cut into slices + waves. The model is **two-level**:

- The **parent** ticket has its own feature branch + worktree — the one the user will test at the parent's test URL.
- Each **slice** of a wave gets **its own worktree**, branched from the **current parent-branch state**, and is implemented by a **parallel subagent**.
- After the wave, the slice branches are **merged back into the parent branch sequentially** (conflicts resolved on the parent), the slice items are closed to done, and the slice worktrees are cleaned up. The **parent stays open** for `task-finish`.
- Waves run **one at a time**: announce the next wave and implement it straight away, then **wait for the user** to say "next wave".

## Phase 1 — Locate the parent plan and the next wave (read-only)

1. **Confirm the parent task file.** If several active plans exist or it is ambiguous, ask via `ask_user_question`. Read the `## Subtasks` table and the **Ausführungs-Wellen** summary.
2. **Read every slice file** under `subtasks/` for real scope, `Preconditions`, `Human test`, and `## Context & references`.
3. **Determine which slices are already done.** Source of truth = the slices' tracker status, read via the adapter. If the tracker is unavailable — or there is none — ask the user which waves are finished; never guess from the plan file alone, since it may be stale.
4. **Reconcile interrupted sessions:** if a slice was already merged into the parent in a previous run but its item is still open, close it now (Phase 5 step) before proceeding — do not re-implement it.
5. **Pick the next wave** = the **lowest wave number** with at least one not-done slice. Verify its slices' `Preconditions` are satisfied by already-done slices; if not, the waves are inconsistent — stop and report.
6. **Fallback (no `Wave` column / legacy plan):** derive the runnable set from per-slice `Preconditions` — every not-done slice whose preconditions are all done.

## Phase 2 — Decide where to work and ensure the parent environment is up

### 2a — Branch choice (ask_user_question — skipped if the parent worktree already exists)

**First check whether the parent's worktree is already there** (`git worktree list`, parent feature branch per Phase 1). From wave 2 onwards this is the normal case: skip the question, name the worktree you are using in one line, and go to 2b.

Only when no parent worktree exists yet, ask the user via `ask_user_question`:

> **Where should the parent feature branch run?**
>
> - **(recommended) Feature-branch worktree** — I'll use the parent's feature branch in its own worktree under the repo's worktree root.
> - **Directly on the base branch** — I'll use the current checkout (no dedicated parent worktree).

Wait for the answer before proceeding.

### 2b — Verify the plan is in the worktree

After the parent worktree exists (or the user chose the base branch), confirm that the parent plan file (`docs/tasks/active/<KEY>-<slug>/task-<slug>.md`) and the relevant slice files (`subtasks/*.md`) are present. Emit the plan file's **clickable absolute path** so the user can open it in their editor:

```
Plan:   <absolute-path>/docs/tasks/active/<KEY>-<slug>/task-<slug>.md
Slices: <absolute-path>/docs/tasks/active/<KEY>-<slug>/subtasks/
```

Use the real, resolved worktree path — not a placeholder.

### 2c — Opt-in test container (ask_user_question — mandatory, skipped if already running)

Before asking, check whether the parent's container is already running. If so, skip the question, state it is already up and name its URL, and proceed straight to Phase 3.

Otherwise ask the user via `ask_user_question`:

> **Soll ich einen Test-Container für den Parent-Branch hochfahren?**
>
> - **Ja** — ich fahre den Container für den Parent-Branch hoch (ohne Rebuild/Recreate, ohne die geteilte Infra anzufassen).
> - **Nein** — ich implementiere die Wellen ohne Container; du testest später selbst.

If yes, bring up the parent stack (2d). If no, skip container startup — the wave orchestration still proceeds (slice worktrees and merges work independently of whether a container is running).

### 2d — Bring up the parent stack (if container requested)

Invoke `start-app` for the **parent** feature branch, because slice branches are cut from the parent's current state and merged back into it. As in Single-ticket mode 2d, the command behind the capability is a value and its mechanics belong to the repo's infra rule.

Read the capability's output for the real URL, container, worktree path and database. That parent URL is where the integrated wave result is tested.

## Phase 3 — Announce and implement the wave in parallel

**Worklog first (mandatory).** Before launching the wave's subagents, record that this wave is being implemented: add (or update) the parent ticket's active entry in today's worklog file with the fixed-vocabulary status and the wave in the `→` next-action (e.g. `🔄 in-arbeit → Welle <n> (<Slice-Keys>) umsetzen`), per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc`. It stays in the active section until the parent is closed via `/task-finish`.

**Progress event (mandatory).** Emit one on the parent noting which slices this wave starts, tagged with the wave number, per the adapter's "Call contracts".

1. **Announce the wave, then launch it immediately** — no confirmation question. Invoking the skill (or saying "next wave") *is* the go-ahead; asking again for it is pure friction. Print one short block naming the wave number, its slices (keys + one-line scope each), and that they run in parallel, each in its own worktree branched from the parent — then proceed straight to step 2. If the user wanted a different wave, they say so in the chat.

   > **Wave \<n\>: \<slice keys + one-line scope each\>**
   > Running in parallel, each in its own worktree branched from the parent. Merged into the parent afterwards; you test the integrated result on the parent's test URL.

   **The test strategy is fixed, not a question.** A wave's slices are **always** merged into the parent feature branch (Phase 4) and tested there as one integrated whole, at the parent's test URL. There is no per-slice test path: no slice container, no slice test URL, no waiting for a per-slice manual test before the merge-back. A slice is an internal unit of work; the parent is the only thing a human ever tests.
2. **One subagent per slice, launched concurrently** — use pi's `subagent` tool with one top-level call using `workflowScript` + `async:true`, launching one child per slice via `runs.run` (or `runs.all([...])` for the parallel set) inside the script.
   - **Isolation via worktrees off the parent.** For a wave with **>1 slice**, each slice runs in its own git worktree on a branch cut from the **parent feature branch** (e.g. `feature/ANW-<slice>-<slug>` created with `git worktree add -b <slice-branch> <dir> feature/ANW-<parent>-<slug>`), so parallel edits cannot collide. Set `worktree: true` on the `runs.run` launches for managed per-child worktree isolation, or create the worktree explicitly and pass its path to the child's `task`. For a **single-slice** wave, implement it directly in the parent worktree.
   - **Per-slice subagent prompt** must include: the absolute path to the slice file (`subtasks/S<n>-<SUB-KEY>-<slug>.md`) and the parent file, the order to implement exactly that slice's `## In scope` and satisfy its `## Acceptance criteria`, to follow the repo's auto-attached area rules, to run **only the tests scoped to that slice's changed files/areas** (the narrowest of the repo's `Test commands` — never the release gate, which runs once at `/task-finish`, and not the per-task lane either, which runs once after the last wave, per Phase 5, step 0), and to **commit on its own slice branch but not merge into the parent and not push**. Ask it to return: branch/worktree path, files changed, test status (scoped tests only), blockers.
   - **DB per slice:** if a slice introduces a migration, its worktree isolates the database exactly as in Single-ticket mode Step 3 (`fork-db` before `migrate`) and migrates only there. The migration **files** travel with the slice branch and land on the parent at merge-back; applying them to the shared database is `task-finish`'s job.
3. While agents run, do not poll reflexively; act on the completion notifications.

## Phase 4 — Merge the wave back into the parent (sequential)

1. **Collect results** from all slice subagents (branch names, changed files, test status, blockers).
2. **Merge each slice branch into the parent branch, one at a time**, in the parent worktree. Resolve conflicts **on the parent**. The usual suspects are generated or append-only artifacts two slices both touched — database migrations, an API spec, a lock file; regenerate rather than hand-merge where the repo has a generator for it. If a conflict needs a product decision, stop and ask.
3. **Run only the tests scoped to this wave's changed files/areas** on the integrated parent state (the union of the slices' scoped tests); fix or report failures. Do **not** run the per-task lane here (it runs once, after the **last** wave, Phase 5, step 0) and never the release gate (run once at `/task-finish`).
4. **Clean up the slice worktrees and branches** once merged: `git worktree remove <dir>` and delete the merged slice branch. No orphaned slice worktrees may remain (`git worktree list` is clean afterwards).
5. **Do not merge the parent** into the merge target and **do not open a PR** — that is `task-finish`'s job.

## Phase 5 — Close the wave's slices + wave finish output

0. **If this was the last open wave** (no not-done slice remains across the whole plan after this wave's merge), run the repo's **per-task lane** once on the integrated parent state before anything else in this phase, and fix or report failures. The expensive **release gate** is **not** run here — it runs once at `/task-finish`, before the merge or PR. Every earlier wave only ran its own scoped tests (Phase 4, step 3). If further waves remain open, skip this and proceed directly to step 1.
1. **Close the wave's slices to done**, batched: for each slice, leave a short closing comment (delivered scope + deviations) and walk it to the done state per the adapter (see "Tracker sync"). Resolve how the status changes through the adapter, never by hardcoding an identifier here — children frequently differ from top-level items. Also sync each slice file's local `> **Status:**` line and, if applicable, move it to `archive/` (the same sync `task-finish` does). The **parent stays open**.
2. **Worklog update (mandatory).** Update the parent ticket's active entry in today's worklog file to reflect the completed wave (e.g. `🧪 implementiert → Welle <n> testen, dann Welle <n+1> starten`), per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc` (one fixed-vocabulary status word + a `→` next-action). The parent stays in the active section across all waves — it moves to the done section only at `/task-finish`.

2b. **Progress event (mandatory).** Emit one on the parent item (`phase: "implement"`, `step: "wave <n>/<total>"`) summarizing what this wave delivered, per the adapter's "Call contracts".

3. **Emit the wave finish output** (mandatory), in the user's language (default German), simple language:

```markdown
## Worum ging es?
<2–3 einfache Sätze: Thema des Plans + Beitrag dieser Welle.>

## Was kannst du jetzt testen? (auf dem Parent-Branch)
- <pro Slice eine Zeile in Alltagssprache.>

## So testest du es
Test-URL:   <the parent's, from the target repo's `AGENTS.md` → key `Test-URL template`>
Container:  <the parent's, from the target repo's `AGENTS.md` → key `Container / compose names`>
Worktree:   <the parent's resolved worktree path>
1. <konkreter Schritt — zusammengeführt aus den `## Human test`-Blöcken der Slices, vereinfacht.>
2. <…>

## Stand & nächste Schritte

**Stand:** Welle <n> (<Slice-Keys>) erledigt — in den Parent gemerged, Slice-Items abgeschlossen.

**Nächste Schritte:**
- Testergebnis bestätigen.
- Optional: `/pr-review` vor dem Finish (freiwillig, kein Gate).
- Nächste Welle <n+1> (<Slice-Keys>) starten: sag „nächste Welle" oder rufe erneut `/task-implement` auf.
- Keine weitere Welle offen? Dann den Parent abschließen mit `/task-finish`.
```

   - If no test container was started (user opted out in Phase 2c), omit the Test-URL and Container lines and note that the user chose to test without a container.
   - The "Was kannst du jetzt testen?" and "So testest du es" sections must be in plain, non-technical language — describe what changed and how to verify it as you would for a non-developer.

4. **Wait for the user.** Do not auto-start the next wave. After the user confirms they are satisfied with testing, offer to run the `pr-review` skill (`the target repo's .agents/skills/anwaltde/universal/pr-review/SKILL.md`) as an optional handoff — never a gate. Present it as an available next step alongside "next wave" and `/task-finish` in the `## Stand & nächste Schritte` block. When the user says "next wave", return to Phase 1 and run it — that request is the go-ahead, so Phase 3 announces the wave and starts without asking again.

## Out of scope

- **Parent merge-back / PR / closing the parent** — merging the parent feature branch into the merge target, opening a PR, moving the *parent* item to done → all `task-finish`'s.
- **Applying fork migrations to the shared `app` DB** — that happens on merge in `task-finish`, never here.
- **Standing up a second Postgres** — one shared Postgres; a fork is a logical DB, not a new server.

## Anti-patterns

- **Silently implementing on the base branch.** When no worktree exists yet, the branch-choice `ask_user_question` is mandatory — quietly defaulting to the current checkout violates the worktree-first model. Reusing a worktree that already exists, without asking, is the *correct* path, not a violation of this.
- **Asking how to test a wave.** The test strategy is fixed: slices are always merged into the parent and tested there as an integrated whole. Offering a per-slice test path — own container, own URL, a manual test before the merge-back — is not a choice this skill has.
- **Re-asking a question the situation already answers.** A branch choice when the worktree is standing, a container question when the container is up, or a "shall I start wave n?" confirmation after the user asked for that wave: each one costs a round trip and buys nothing.
- **Migrating the shared database directly.** Always `fork-db` first when a migration is introduced. The shared database stays untouched.
- **Bouncing shared services.** Never start, stop or restart shared infrastructure or another worktree's container. `start-app` brings up only your own stack by design; anything broader needs explicit, per-incident user approval. The rule is `general-shared-state-and-handoff` → "Never bounce shared state you do not own"; which services are shared is a value (the target repo's `AGENTS.md` → key `Shared services`).
- **Rebuilding worktree mechanics.** Never call `git worktree add` or copy env files for the *parent* stack — `start-app` owns that. (Slice worktrees off the parent in Phase 3 are the one explicit exception, and are cleaned up in Phase 4.)
- **Creating a worktree when one already exists.** `start-app` reuses existing worktrees; a duplicate causes "branch already checked out". Run `git worktree list` if unsure.
- **Forgetting the finish output.** The Test-URL + Worktree + what-to-test block, followed by the mandatory `## Stand & nächste Schritte` block, is required after a single-ticket implementation and after every wave. A generic "it should work now" is not acceptable.
- **Skipping the worklog.** Implementation is real work — it must appear in the active section in today's worklog file from the moment it starts (single ticket) or each wave starts (sliced), with its status kept current, per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc`. This always-on rule is routinely dropped; do not let a dense implementation flow crowd it out.
- **Doing the human's manual test yourself (or apologising for not doing it).** The in-browser click-through is the human reviewer's job; the Test-URL block hands it over. Never open a browser, launch a browser sub-agent, or drive the UI to "confirm it works" — and never frame the handoff as a shortcoming (e.g. *"a manual browser check wasn't possible because no browser MCP was available"*). Your verification is the automated suite; a browser is only in scope if the user explicitly asks for it.
- **Skipping a wave.** Never implement wave N+1 while wave N still has open slices — later waves depend on earlier ones.
- **Running the per-task lane (or the release gate) per slice or per wave.** Slices and waves run only their own scoped tests. The per-task lane runs exactly once, after the last wave (Phase 5, step 0); the release gate belongs to `/task-finish` — running either earlier wastes time without adding signal until the plan is actually complete.
- **Fake parallelism in one tree.** Running >1 slice in the same working directory and corrupting shared files. Use one worktree per slice, branched from the parent.
- **Branching slices off the base branch instead of the parent.** Slice branches must be cut from the current parent feature branch, and merged back into it.
- **Not merging slice branches back into the parent / leaving orphaned slice worktrees.** After the wave, every slice branch is merged into the parent and its worktree removed.
- **Silent merge guesses.** Resolving a migration/OpenAPI conflict that needs a product decision without asking.
- **Closing the parent ticket, or closing the current wave's slices before the merge-back + green tests.** Slices go to Done only after they are merged into the parent and the integrated suite is green; the parent stays open for `task-finish`.
- **Auto-advancing to the next wave.** Stop after each wave and wait for the user. Once the user does ask for the next wave, it starts immediately — no second confirmation.
- **Skipping the progress event.** One is emitted at skill start and end (and at each wave's start and end in sliced mode) per the adapter's "Call contracts" — a routinely-dropped bookkeeping step; a failure is visible and recorded, never a blocker, but do not skip attempting it.

## Quality checklist

- [ ] Task file read; mode chosen correctly (Subtasks + Wave column → sliced).
- [ ] **Branch choice asked only when open** — with no existing worktree, the user was asked via `ask_user_question` (feature-branch worktree by default vs. base branch) before any implementation; with a worktree already present, the question was skipped and the reused worktree named.
- [ ] **Plan path emitted** — plan file verified present in the worktree; clickable absolute path emitted to the user.
- [ ] **Opt-in container asked** — user was asked via `ask_user_question` whether to spin up a test container before invoking `start-app` (skipped entirely if the container was already found running).
- [ ] **Single-ticket:** `start-app` brought up only this branch's stack; a migration (if any) was preceded by `fork-db`; the simple-language "what was implemented / how to test" block plus the technical finish output were emitted with the **real** values read from the capability's output and a specific Testen checklist, followed by the mandatory stand block offering `/pr-review` and pointing at `/task-finish`.
- [ ] **Sliced:** parent stack up; next wave = lowest with open slices, preconditions satisfied; the wave was **announced and started immediately** — no confirmation question, no test-strategy question (slices always merge into the parent and are tested there).
- [ ] **Sliced:** one subagent per slice in its own worktree branched from the parent; slice branches merged back into the parent sequentially; conflicts (migrations, generated API specs) reconciled; only slice-scoped tests run per wave; the per-task lane run exactly once, after the last wave (release gate deferred to `/task-finish`); slice worktrees cleaned up.
- [ ] **Sliced:** wave's slice items closed to done via the adapter + local status synced; parent left open; wave finish output emitted with the `## Stand & nächste Schritte` heading (offering `/pr-review`, next wave or `/task-finish`); waited for the user before the next wave.
- [ ] **Worklog maintained** — per `the target repo's .cursor/rules/anwaltde/universal/worklog-personal-tracking.mdc`: an active entry was added when implementation started (single ticket) / when each wave started (sliced), and its status was updated in the finish output. The entry stays in the active section (moved to the done section only by `/task-finish`).
- [ ] **PR-review offered** — after the user confirms satisfaction with testing, `/pr-review` is offered as an available next step (not forced).
- [ ] **Verification via automated tests, not a browser** — the relevant suite was run and its result reported; the in-browser manual test was handed to the human via the finish output, not attempted by you nor reported as a blocked/missing step.
- [ ] **Tracker sync** — the status was walked per the adapter: to in-progress when work started, a single ticket to review-ready, each done slice all the way to done. A bookkeeping failure was recorded and did not block the code outcome; an identity failure stopped the run.
- [ ] **Progress event emitted** at skill start and end (single ticket), and at each wave's start and end (sliced mode), per the adapter's "Call contracts"; a failure was visible and recorded, never a blocker.
