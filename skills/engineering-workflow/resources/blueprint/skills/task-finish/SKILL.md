---
name: task-finish
description: "anwalt.de engineering-workflow skill. Closes out an implemented task. Reads the target repo's `AGENTS.md` → key `Finish integration`: with `local-merge`, merges the feature branch onto the merge target, walks to ready-for-deployment (or DONE for steering-only paths after confirmation), never offers a PR gate, alarms on open waves, and commits plan-file edits before merge/teardown. When the key is absent, keeps the generic fallback (PR-review offer + outcome/integration-path choice including needs-testing). Also offers a task-retro when a genuine workflow-/process-level problem surfaced; can create a tracker item retroactively. Use when the user invokes /task-finish, wants to mark a task done, finish an implementation, or leave a closing note."
---

# Finish a task (`/task-finish`)

## When to apply

- The user has implemented a task and wants to close it out.
- Slash command **`/task-finish`** or phrasings like "set the task to done", "close the ticket", "leave a closing comment".

## Configuration it reads

the target repo's `AGENTS.md` → key `Finish integration` (owning rule `worktree-dev-workflow`):

| Value | Behaviour |
|---|---|
| `local-merge` | **Configured path** (this repo). One finish way: local merge onto `Merge target branch`, no PR offer, no integration-path question. Outcomes: ready-for-deployment (default), discarded, and DONE only for steering-only path changes after confirmation. |
| **absent** | **Generic fallback.** Keep the multi-path behaviour: offer `/pr-review` at the start, ask outcome (including needs-testing) **and** integration path (PR / local merge / nothing). Do not invent a default. |

Read the value once at the start of the run and keep that mode for the whole run.

## Workflow

### Step 0: mode-dependent offers (every run, no persistent state)

Before anything else — before even determining which task this is:

**0a. Assess retro-worthiness first (self-assessment, no user question yet).**

Recommend a retro **only** when the session surfaced a genuine **workflow-/process-level problem** — something about the *way* the work gets done, not about this one task's content. Apply a **two-part test** and recommend a retro only if **both** parts hold:

1. **Recurrence** — the problem would plausibly recur on *other* tasks, **and**
2. **External fix** — the remedy lives *outside* this task: in a skill, a rule, a script, the Taskfile, tooling/MCP ergonomics, or the environment/setup.

**Explicitly NOT a trigger on its own:** deviating from the plan, post-plan fixes, or merely new/complex/large work.

**0b. Ask via `ask_user_question` — shape depends on the Finish-integration mode.**

**Configured path (`local-merge`):** never ask about PR review. If a retro is recommended, ask only that; otherwise skip Step 0 questions entirely and say once in chat that no workflow-level problem surfaced (user can still invoke `/task-retro`).

**Generic fallback (key absent):**

- If a retro is recommended, bundle PR-review + retro in one `ask_user_question` call.
- If not, ask **only** the PR-review question.

```
Question — PR review (fallback mode only):
Should /pr-review run before finishing this ticket?
- run_now    → "Run PR review now"
- already_done → "Already done → skip"
- skip       → "Skip entirely"

Question — workflow retro (only when recommended):
Should /task-retro capture a workflow retrospective before finishing?
- run_now → "Run task-retro now"
- skip    → "Skip"
```

- **PR review `run_now`** (fallback only): invoke `pr-review`, wait for the user to react, then resume at Step 1.
- **Retro `run_now`**: invoke `task-retro` before continuing to Step 1.
- Never auto-invoke either skill without `run_now`.

### Step 0c: open-waves check (every finish, both modes)

Before merging or walking status, check whether this story still has **open slices / waves**.

1. **Primary source:** children of the item in the tracker (any child not in a terminal done/discarded state counts as open).
2. **Fallback** when the tracker is unreachable: read phase / status lines of files under the plan's `subtasks/` folder. Say in the output that the fallback was used.
3. **No children / not a sliced story:** pass silently.
4. **Open waves found:** **hard stop**. Do **not** merge, do **not** walk status, do **not** tear down. Emit an unmistakable alarm in the chat:

```markdown
# 🚨 ALARM — offene Wellen, Finish gestoppt

Diese Story hat noch offene Slices/Wellen: <keys + short titles>.
Kein Merge, kein Statuswalk, kein Teardown.

Optionen:
- offene Wellen zuerst mit `/task-implement` abschließen
- explizit „trotzdem beenden“ bestätigen (wird im Closing-Kommentar vermerkt)
```

Ask via `ask_user_question`: `stop` (recommended) · `override` ("trotzdem beenden"). On `stop`, end the run. On `override`, record the override for the closing comment and continue — the override is the exception, not the normal path.

### Step 1: determine the task

**Progress event (mandatory).** Once the key is resolved below, emit one (one short English sentence on what is about to be finished) per the adapter's "Call contracts". Bookkeeping: recorded on failure, never a blocker.

**The task is the one worked on in *this chat session* — the one whose implementation this conversation actually produced.** Do **not** infer it from whatever file merely happens to be open in the IDE.

Priority order when deriving the key:

1. **The ticket processed in this chat history** — always wins.
2. The last tracker activity in the current session.
3. Only as a weak hint, and only when it agrees with (1): the currently open or recently edited task file.

If a passively open file points to a **different** key than the ticket worked on in the chat, treat the situation as **not unambiguous** and ask — never let an open, unrelated file override the chat's ticket.

If the key **can be derived unambiguously** from the chat history, proceed directly to Step 2.

If the key is **not unambiguous**, ask via `ask_user_question`:

```
Three options:
- enter_key    → "I have a key — let me enter it"
- create_ticket → "There is no ticket yet — please create one"
- abort        → "Abort"
```

- **`enter_key`**: ask for the key, then Step 2.
- **`create_ticket`**: continue with **Step 1b**.
- **`abort`**: stop.

**No tracker configured?** Say so once, skip Steps 1b through 6 entirely, continue at Step 7 (worklog) — the plan file's phase block and the worklog carry the close-out, and the integration in Step 9 still runs.

### Step 1b: retroactive ticket creation (only when "create_ticket" was chosen)

The work is already done; the ticket is created post-hoc. No repo folder is created.

1. **Derive context** from the session into a proposal for title (`[<Area>] <Title>`, English, no size token), item type, and — if the repo estimates — story points with a short justification.
2. **Confirm** in one bundled `ask_user_question`: title, type, estimate. Do not proceed without explicit confirmation.
3. **Create** per the adapter's call sequence, description structure from `task-artifact-conventions` → "Description structure" — **without** the plan section.
4. **Bring it to a real backlog state** per the adapter, exactly as `task-create` does, then continue close-out.

### Step 2: pre-flight validation

Run all checks **before** asking the user anything. Collect every correction applied so it can be reported in step 8. Load the item through the adapter and resolve every field **by name**, never by a hardcoded identifier.

#### 2a — Owner

If the item has no owner, assign it to the current user and record: *owner set to `<name>`*. If it already has one, leave it untouched.

#### 2b — Iteration membership

Only where the tracker has an iteration concept (the target repo's `AGENTS.md` → key `Iteration concept`). With `none`, skip silently. Otherwise find the active iteration and add the item if missing; no active iteration → note and continue; several candidates → ask.

#### 2c — Release tag

Whether a finished task carries the target release is the target repo's `AGENTS.md` → key `Release tag: whether`. If no / absent, skip and say so once.

Where it applies: derive via the target repo's `AGENTS.md` → key `Release tag: how`, attach via the adapter. Set it for **every** finish outcome that closes the item (ready-for-deployment, done, and the steering-only DONE exception) — steering changes appear in release notes on purpose. Never set at creation; never destroy neighbouring set-like values (read, then write the union); if a *different* release value is already there, ask before replacing.

### Step 3: ask for the outcome (and integration path only in fallback)

**Configured path (`local-merge`):** ask **only** for the outcome — no integration-path question. The path is always local merge onto `Merge target branch`.

```
How does <KEY> end?
- ready_for_deployment  → Recommended — implemented & integrated, waiting only for deployment
- done                  → only offered when the steering-only heuristic matches (see below); otherwise omit
- discarded             → abandon the work
```

**DONE exception (steering-only).** Inspect the feature branch's changed paths (diff against the merge target). If **every** changed path is under the short steering list — `.agents/`, `.cursor/rules/`, `AGENTS.md`, `docs/` — propose `done` as an additional option and require an explicit confirmation before using it. Mixed changes (any path outside that list) → do **not** offer `done`; the normal ready-for-deployment path applies. The list lives in this skill and stays deliberately short.

**Generic fallback (key absent):** ask **both** outcome and integration path in one `ask_user_question` call, as before:

```
Question 1 — outcome:
- needs_testing         → hands the work over to the team for testing
- ready_for_deployment  → Recommended
- done                  → accepted including deployment

Question 2 — integration path:
- pr          → open a pull request (Recommended in fallback)
- local_merge → merge locally (no push)
- nothing     → user handles it
```

Name the resulting status (from the adapter's table) when asking. Do not proceed without an explicit answer. Both answers (when asked) are fixed for the rest of the run.

### Step 4: build the closing comment (English)

```markdown
## Implementation summary & deviations from plan

### Delivered as planned

- <what was implemented per the plan>
- …

### Deviations / fixes applied post-plan

1. **<title>** — <one or two sentences>.
2. …

<If no deviations: omit this section.>

### Open-waves override

<Only when Step 0c override was confirmed: name the open slices that were overridden and that the user explicitly chose to finish anyway.>

Tests green: <only name results actually executed>
```

**Rules:** Language **English** (`general-language-policy`). "Delivered as planned" from the plan's in-scope block. Deviations numbered with short bold titles. Override section only when it applies.

### Step 5: post the comment and set the status

Comment first, then status — both through the adapter. Target status from the adapter's "Target status per skill" table for the chosen outcome and this item's level. Walk step by step when the adapter requires it; never hardcode transition identifiers. Resolve what is actually offered and match by name.

With **two trackers**, run on both in the mirror-template order. Secondary failure = bookkeeping (warn, record debt in the plan's phase block, continue). Primary failure stops the run.

`discarded` uses the adapter's direct discard call (`discardTask`), not a forward walk.

### Step 6: sync the plan file

1. Locate via `Glob` over `docs/tasks/**` (both `active/` and `archive/`): sub-item = `<KEY>-*.md` inside a parent's `subtasks/`; top-level = `<KEY>-*/task-*.md`.
2. Rewrite the `> **Status:**` line to the new status; touch only that line. Drop stale parenthetical annotations.
3. No file or no status line → skip and say so.

**Archiving.** On **"ready for deployment"** and **"done"**, move `docs/tasks/active/<KEY>-<slug>` → `docs/tasks/archive/<KEY>-<slug>` (top-level) or the sub-item file into the parent's archived `subtasks/` (only if that target exists). On **"needs testing"** (fallback only) nothing moves.

### Step 6b: commit plan-file edits (before merge/teardown)

The finish itself edits the working tree (status line, archive move). Those edits must land on the feature branch **before** merge and teardown — otherwise `git worktree remove` refuses on modified files.

1. In the checkout that holds the feature branch (worktree or base), stage the plan-file changes from Step 6.
2. Commit them with a short English message naming the key and the outcome (e.g. `Close out AURA-1088 — ready for deployment`). Follow the repo's commit conventions; do not push.
3. If there is nothing to commit, say so and continue.
4. Never use `--force` or amend a pushed commit.

### Step 7: worklog (mandatory)

Close the item out in the personal worklog per `worklog-personal-tracking`. Move its entry from active to done (or add it straight to done if no active entry). Trim to the done form — close-out detail belongs in the item's closing comment, not here.

### Step 8: report back in chat

Everything that was done, each line only if it applies — and for every skipped step, **why**:

- Outcome and where the item landed.
- Closing comment posted.
- Plan file synced / archived.
- Plan-edit commit created (or skipped).
- Worklog moved to done.
- Release tag set (or skipped, and why).
- Pre-flight corrections applied.
- Open-waves override, if any.

### Step 9: execute the integration path

**Configured path:** always execute the local-merge path below — do **not** ask. Target = the target repo's `AGENTS.md` → key `Merge target branch`.

**Fallback:** execute the path chosen in Step 3 — do **not** ask again.

#### 9-pre — Release gate (before any merge/PR)

The **one** point in the lifecycle where the full suite runs (the target repo's `AGENTS.md` → key `Test commands`, release-gate entry).

- On **`local_merge`** and **`pr`**: run the release gate on the feature branch **before** merging or pushing. Failure → **stop**; no merge, no PR, no teardown.
- On **`nothing`** (fallback only): skip and note that the full suite was not run.
- Steering-only DONE on the configured path still runs the gate when a merge happens; if there is no branch to merge (already on the merge target), say so and skip the gate.

#### 9a — Detect the branch's isolated database

Derive the branch token per the target repo's `AGENTS.md` → key `Stack-token derivation`. If this worktree points at an isolated database, reconciliation in 9c applies; otherwise skip it.

#### 9b — PR path (`pr`, fallback only)

1. Confirm the destination branch (default: merge target).
2. Push the feature branch if needed.
3. Open the PR on the repo's `PR host`, titled `<KEY>: <title>`.
4. Report the PR URL.
5. Drop the isolated database if one exists (`unfork-db`).
6. Drop the branch's test-database resources — only if the target repo's `AGENTS.md` → key `Infra capabilities` defines a `teardown-test-db` capability. Invoke it for the branch token. If the repo's register does not define it, skip this step and say so explicitly (not every repo has test-database resources to drop).
7. **Worktree and container stay up.** Unlike 9c, this path does **not** invoke `teardown-branch`: the PR is still open, and a reviewer comment may need the running worktree/container again.

#### 9c — Local merge path (`local_merge`)

1. Target branch = the target repo's `AGENTS.md` → key `Merge target branch` (confirm only in fallback mode; configured mode proceeds without asking).
2. Integrate the feature branch, **staying local — no push**: check out the target, pull it, merge the feature branch with a normal `git merge`. Never `--force`, never auto-resolve, no re-run of tests after the merge (the release gate already ran in 9-pre).
3. **If the merge fails** (conflict or otherwise): **stop immediately.** Leave databases untouched, report the exact state (current branch, conflicted files if any), leave branch and worktree intact. Do not retry with `--force` or a "theirs" strategy.
4. **Database reconciliation** — only after a **successful** merge, and only if 9a found an isolated database:

   a. Apply the branch's new migrations to the **shared** database via the `migrate` capability against the **base checkout's** container — forward-only. Failure → stop; never reset (`general-db-destructive-ops`).

   b. Drop the isolated database (`unfork-db`).

5. Report: target branch, merge result (local, unpushed), reconciliation outcome.
6. **Teardown — only after steps 2–4 have *all* succeeded.** Mechanics: the target repo's `AGENTS.md` → key `Infra capabilities` → `teardown-branch` / `worktree-dev-workflow` → "Teardown of a finished branch".

   a. If no per-branch worktree/container exists, skip to (c) and say so.
   b. Invoke `teardown-branch` for the token — **only this branch's own resources** (`general-shared-state-and-handoff`). Never force-remove a worktree with uncommitted changes; if refused, report and let the user decide.
   c. Delete the merged feature branch with a fast-forward-safe delete; if git refuses (e.g. squash), report and ask before forcing.

#### 9d — Nothing path (`nothing`, fallback only)

Do nothing. Report that no merge or PR action was taken.

### Step 10: closing chat output (mandatory)

Once Step 9 completed successfully, end with this block (heading per `Doc language`):

```markdown
# ✅ Fertig — Ticket <KEY> abgeschlossen

## Stand & nächste Schritte

**Stand:** Ticket <KEY> abgeschlossen (<outcome>); Integration: <lokal gemerged|PR erstellt|nichts unternommen>.

**Nächste Schritte:**
- <concrete next step>
```

Only emit the green heading when Step 9 actually succeeded. Next step follows the outcome:

- **ready for deployment** → wait for the `release` skill / deployment.
- **done** → start the next task with `/task-create`.
- **needs testing** (fallback) → wait for team testing, then `/task-finish` again.
- **discarded** → nothing further on this item.
- **open waves were overridden** → name the remaining slices that still need `/task-implement`.

## Out of scope

- No code changes beyond the integration gate (Step 9).
- On the configured path: no outcomes other than ready-for-deployment, discarded, and the steering-only DONE exception.
- `/pr-review` as a skill stays unchanged; the configured path simply does not offer it here (it remains an optional handoff from `task-implement`).
- No review or merge on the PR host's side: the fallback PR path only **opens** the PR.

## Anti-patterns

- **Taking the key from a passively open file instead of the chat.**
- **Hardcoding a transition, field or status identifier.**
- **Closing comment in the conversation's language.** Item content is English.
- **Offering a PR review or an integration-path choice on the configured `local-merge` path.** Those exist only in the generic fallback.
- **Skipping the open-waves check, or finishing past open waves without an explicit override.**
- **Merging or tearing down after a conflict / failed reconciliation.** Stop; leave the worktree intact.
- **Pushing on the local-merge path.** Local by design.
- **Skipping the plan-edit commit (Step 6b) before merge/teardown.** That is the AURA-638 failure mode.
- **Skipping the release gate on a merge/PR path.**
- **Migrating the shared database with anything but a forward deploy, or before the merge succeeded.**
- **Tearing down anything but this branch's own resources.**
- **Inventing a Finish-integration default when the key is absent.** Fall back to the generic multi-path behaviour.
- **Skipping the worklog move (Step 7).**
- **Running `pr-review` or `task-retro` automatically.**
- **Always asking the retro question.** Only when the two-part test passes.
- **Skipping the closing chat output, or emitting the completion marker after a failed/aborted run.**
