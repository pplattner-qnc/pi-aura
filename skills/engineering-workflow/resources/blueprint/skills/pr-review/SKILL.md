---
name: pr-review
description: anwalt.de engineering-workflow skill. Review a pull request branch, in one of two operating modes — locally on a developer's machine (with a git commit gate before reading) or headless on a pull request at the repo's PR host. Use when the user invokes /pr-review or asks to review a PR, a branch, or someone's changes. The review is far-reaching, not cosmetic — it judges scope fidelity against the ticket's intent (including a scope-gate that blocks large, unplanned new concepts), runs a strict self-contained maintainability audit, scrutinises newly introduced concepts for abstraction, modularity and reusability, and hunts for loose ends. Output is a Markdown report with per-finding comments and a clear overall verdict.
---

# Pull Request Review (`/pr-review`)

A far-reaching, opinionated review of a branch — **not** a naming/formatting pass. It answers four questions: did this PR do what it was meant to do (and only that), is it built well, are its new concepts thought through / modular / reusable, and was it finished or left with loose ends.

**This skill runs in two operating modes** (see Step 0). Locally it has a shell and git, may commit the branch's open changes before reading, and answers to a human. Headless on a hosted pull request it has neither shell nor git, cannot commit anything, and has nobody to ask. Half the workflow below is mode-dependent — the quality bar is not.

**This skill is self-contained.** It carries both the *workflow* and the *quality bar* (see "The quality bar" below). Do not assume any external rule (e.g. a `general-code-quality` IDE rule) is in context — a headless agent runs this skill with the skill text as its only guidance. The IDE-time `general-code-quality` rule is a development aid only; when it and this skill both change, keep them aligned by hand.

## Posture (read this first)

- **Abstraction & modularity are the foreground.** The single most consequential thing a PR can do is introduce a new concept. Judge every new concept hard: is it abstracted at the right boundary, modular, and reusable — or a one-off that the next task will have to rework? This lens runs through both the Quality and the Concepts dimension.
- **Far-reaching, not cosmetic.** Naming, formatting, and style are **ignored** — unless a nit is the symptom of a deeper problem (e.g. a variable name reveals a wrong mental model), in which case mention it only as evidence for the larger issue. Leave pure style to linters.
- **Ambitious in thinking, read-only in action.** Actively look for "code-judo" moves: restructurings that preserve behaviour while deleting whole branches/layers/concepts. Propose them with a short sketch — but do **not** edit or patch source code. **The review itself is read-only**; the single write in the whole skill is the commit gate (Step 1a), which runs *before* the review, only locally, and only when the dirty branch is the branch being reviewed.
- **Respect the approach, but escalate when warranted.** By default, accept the author's chosen solution path and judge whether it is executed soundly and completely. **Escalate to questioning the whole approach** only when the path looks fundamentally wrong — and then say so explicitly, with a reasoned justification.

## Workflow

Every step below states what applies in which mode. Where a step says nothing about modes, it is identical in both.

### 0. Determine the operating mode — and say which one it is

**Do this first, before anything else, and name the mode out loud.** Almost every following step differs between the two, and a wrong guess here makes the rest of the run nonsense.

**The signal is a tool, not an environment variable: is `emit_review` available?**

> **Pi-mirror note:** `emit_review` is the Cline headless PR-review output tool, not a pi tool — pi has no `emit_review`, so this detection resolves to **local mode** in a pi agent today. The pull-request (headless) path below is a **deferred adaptation**: until a pi-side headless PR-review runner provides an equivalent output channel, run in local mode and report in the chat. If such a runner is later wired up, re-introduce the mode detection against that runner's signal and restore the headless rows.

- **`emit_review` available → Pull-request mode (headless).** *(Not reachable from pi today — see the note above.)*
- **`emit_review` not available → Local mode.**

A tool is either there or it is not; that is the only binary signal. The diff already sitting in the system prompt is a corroborating hint, never a second criterion — two conditions joined by "and" would have no answer for the case where only one of them holds.

| | Local | Pull request (headless) |
|---|---|---|
| Trigger | `/pr-review`, invoked by a human | `pr-review-run.ts` on a pull request at the repo's `PR host` (read the target repo's `AGENTS.md`); this repo's runner targets Bitbucket |
| Shell and git | yes | **no** — file and per-file-diff tools only |
| Diff | you determine it yourself (Steps 1, 3, 4) | already in the system prompt; Steps 1, 3 and 4 are done for you |
| Commit gate (Step 1a) | yes | **never** — technically impossible |
| Verification (Step 6) | may run commands (typecheck, lint, a test) | reading files only |
| Questions (`ask_user_question`) | yes | **no** — there is nobody to ask; decide and state the assumption in the report |
| Output | report in the chat | `emit_review(verdict, reportMarkdown)` *(deferred — see the pi-mirror note above; report in the chat until a pi headless runner exists)* |

In pull-request mode the runner has already cloned the repo, resolved base, head and merge-base, and placed the diff in the system prompt. **Skip Steps 1, 1a, 3 and 4 entirely** and go straight to Step 2 (intent) and Step 5 (the four dimensions).

### 1. Determine the branch

*(Local mode only — in pull-request mode the branch is fixed by the runner.)*

If the user named a branch, use it. Otherwise ask via `ask_user_question`, offering concrete candidates: list local and remote branches (`git branch --all --sort=-committerdate`) and propose the most recently touched ones. Never guess silently.

### 1a. Commit gate — a worktree only shows committed state

*(Local mode only. In pull-request mode this step does not exist: the agent has no git and nothing to commit.)*

A review reads committed state. Anyone who calls `/pr-review` without committing first gets a review of a state they did not mean — and today, without warning. So before reading anything, check `git status`.

**Definition:** "the branch being reviewed" is the branch from Step 1. **Branch match** means `git rev-parse --abbrev-ref HEAD` is exactly that name. A detached HEAD has no name and therefore never matches — case 2 applies.

**Worktree detection:** compare `git rev-parse --git-dir` with `git rev-parse --git-common-dir`. In the base checkout both return `.git`; in a linked worktree `--git-dir` points at `.git/worktrees/<name>` while `--git-common-dir` still points at the main `.git`. Not equal means: linked worktree.

The four cases are checked **in this order — the first matching rule wins**. They are not mutually exclusive (a dirty tree can be both "another branch" and "no worktree"), so the order is what makes the gate decidable:

1. **Clean** → carry on normally.
2. **Dirty, but the dirty branch is not the branch being reviewed** → do **not** commit. Print one line ("open changes on branch X, unrelated to this review") and carry on. This holds whether or not you are in a worktree: a commit would land on the wrong branch, the review still would not see those changes, and an unwanted commit would exist.
3. **Dirty, branch matches, linked worktree** → commit it yourself and carry on.
4. **Dirty, branch matches, base checkout** → stop and ask via `ask_user_question`.

**What gets committed:** everything, including newly created files (`git add -A`; `.gitignore` still applies). Committing only tracked files would withhold exactly the new files from the review — the very failure this gate exists to prevent.

**Commit message:** derived from the diff, following the repo rule (max 50 characters, imperative, specific). This is not a throwaway state — it is the real commit for that work and it stays in the history.

**Always report the commit**, with hash and message, plus the undo in the same line (`git reset --soft HEAD~1`). Nothing happens invisibly, and the message is yours, not the user's — they should not have to look up how to get rid of it.

### 2. Determine the intent (the "should")

*(Both modes.)*

The review needs a reference for "what this PR was supposed to do". Derive it automatically, in this order:

1. Extract an `ANW-\d+` key from the branch name (or from the latest commit messages on the branch).
2. If a key is found, read the canonical plan in the repo: `docs/tasks/active/<KEY>-*/task-*.md` (and the linked subtask file if the branch maps to a slice). That plan — its Scope, Non-Goals, and acceptance — is the source of truth for the Scope dimension and the loose-ends hunt.
3. Only if no ticket/plan can be found, ask the user what the goal and scope of the PR were.

Capture the intent in one or two sentences before reviewing — every scope judgement is measured against it.

### 3. Get to the code to be read

*(Local mode only — in pull-request mode the runner has already prepared the checkout.)*

Which path applies depends on whether the branch under review is the one you are standing on.

**Own branch** (the branch being reviewed is the currently checked-out one) → **read it in place**. After the commit gate the tree is clean, which removes the whole reason for isolation ("the live working state must stay untouched") — and with it the worktree creation, the conflict case, and the cleanup.

**Any other branch** → create a worktree with **`--detach`**, and remove it afterwards:

```bash
git fetch --all --prune
# <worktree-root> is the target repo's `AGENTS.md` → key `Worktree root`; in this repo ../aura-worktrees/
REVIEW_DIR="<worktree-root>/_pr-review/${BRANCH//\//-}"
git worktree remove "$REVIEW_DIR" --force 2>/dev/null; git worktree prune   # clear a leftover from an aborted run
git worktree add --detach "$REVIEW_DIR" "origin/$BRANCH"
```

Three things about this that are easy to get wrong:

- **`--detach`, not a branch checkout.** `git worktree add <path> <branch>` refuses a branch that is already checked out in another worktree, and in this repo every ticket branch has its own worktree by convention — so the everyday case would simply fail. `--detach` checks out the *commit* instead; the "already checked out" lock only applies to branches. Reading the neighbouring worktree directly would be wrong instead: it may be dirty, and the commit gate does not apply there (case 2 above). `--force` is the worse alternative, because the same branch would then be checked out twice and the two can drift apart.
- **A namespace of its own, `_pr-review/`.** The worktree root is where the *real* ticket worktrees live. Combining that directory with `git worktree remove --force` means a mis-derived path is a destructive command against work in progress. **`--force` is permitted only below the `_pr-review/` prefix.**
- **Clear a leftover before creating.** Cleanup is mandatory and unconditional, but a hard abort still leaves the directory behind and the next run then fails with "already exists". Remove and prune first, then create.

Cleanup at the end is **mandatory and unconditional** — on success **and** on failure (wrap the review so the removal always runs):

```bash
git worktree remove "$REVIEW_DIR" --force
```

### 4. Establish the unit of review

*(Local mode only — in pull-request mode the diff is already in the system prompt, computed against the merge-base.)*

Focus on the **diff against the merge-base**, not the whole repo (`-C "$REVIEW_DIR"` when reading a foreign branch, omitted when reading in place):

```bash
git merge-base HEAD origin/<base>   # <base> = the target repo's `AGENTS.md` → key `Merge target branch`
git diff <merge-base>...HEAD
```

But read in **context**: open the whole affected files and their callers / usage sites, so reusability and loose ends are actually judgeable — a diff hunk alone hides both.

### 5. Review along the four dimensions

*(Identical in both modes — this and the quality bar are why there is one skill and not two.)*

For every meaningful change, work through all four. The dimensions are **Scope · Quality · Concepts · Completeness**. Apply "The quality bar" (below) throughout the Quality dimension.

#### Scope — "the right thing, and only that?"

- Did the PR fulfil the intent from step 2? Did fragments from *other* features leak in that do not belong here? Mixing unrelated changes is not forbidden, but it makes review hard — name every out-of-scope fragment explicitly and say whether it should be split out.
- **Scope-gate for large, unplanned new concepts.** This is the most important scope check. Apply the heuristic: **"Would this new concept plausibly warrant its own ticket / its own planning?"** (e.g. introducing e2e testing, a new persistence layer, a new cross-cutting framework). If yes, it does **not** belong "on the side" in an unrelated PR — report it **here, under Scope, as a scope violation**, even if it technically works and is cleanly written. Severity is **always Blocker**; the verdict is **at least "changes needed"**, with an explicit recommendation to **split it into its own planned ticket**. (The Concepts dimension only judges the quality of right-sized, allowed concepts — the size check itself lives here.)

#### Quality — "built well?"

- Apply the full self-contained quality bar in "The quality bar" below. This is a strict, thermo-nuclear maintainability audit, not a style pass.

#### Concepts — "thought through, modular, reusable?"

When the PR introduces a new concept, module, or abstraction, work the **mandatory per-concept checklist**:

1. **Abstraction at the right boundary?** A **boundary abstraction** (an interface in front of a volatile/external dependency or a swappable strategy) is justified even with a single caller. **Internal indirection** (a helper/wrapper/pass-through inside a module) is justified only at **≥2 real call sites** or when it makes an invariant type-safe — otherwise it should be inlined. Judge which kind this is and whether the bar is met.
2. **Modular and in the canonical layer?** One focused responsibility; feature logic out of shared paths; implementation details behind the interface.
3. **Reusable or a one-off?** Is it built so it could be reused, or is it purpose-built for this one task and will need rework next time? **Name purpose-built one-offs explicitly.**
4. **Right-sized?** If the concept is large enough to warrant its own ticket, that is a **Scope violation** (see Scope) — flag it there, don't normalise it here.

#### Completeness — "finished, or left with loose ends?"

Was the implementation thought through to the end? Hunt for: unhandled edge cases, half-wired or dead paths, `TODO`/`FIXME` remnants, dead code, missing error handling, states the code does not cover, and assumptions left unguarded. List the loose ends explicitly.

### 6. Verify findings when needed (read-only)

Read statically first. Run a check **only to confirm or refute a specific finding** — e.g. run the typecheck, lint, or the relevant test when you suspect a missing error path or a broken contract. Running checks does not modify source, so read-only is preserved. Do not run a blanket suite "just because".

**Mode difference:** this is a local-mode capability. In pull-request mode there is no shell — verification means reading more files and per-file diffs. A finding that could not be verified is named as unverified rather than asserted.

### 7. Produce the report

**Mode difference:** in local mode the report goes into the chat. In pull-request mode it is passed to `emit_review(verdict, reportMarkdown)` — that call **is** the output; nothing else reaches the reviewer. *(Pi: only local mode is reachable today — see the pi-mirror note in Step 0. The `emit_review` headless path is deferred until a pi-side runner provides an equivalent output channel.)*

Output a structured Markdown report. Shape:

1. **Verdict (first).** A clear recommendation — `Mergebar`, `Änderungen nötig`, or `Konzept überdenken` — followed by the few decisive blockers, named up front. In pull-request mode, pass the matching `mergeable` / `changes needed` / `rethink approach` as `emit_review`'s verdict. *(Pi: report the verdict in the chat in local mode — `emit_review` is not a pi tool; see the Step 0 pi-mirror note.)*
2. **Findings by dimension.** Group findings under the four dimensions, using the conversation's language for the headings (German default: **Scope · Qualität · Konzepte · Vollständigkeit**). Each finding: a `file:line` reference, a severity, and a concrete, actionable note (and a restructuring sketch where you propose one).
3. **Loose ends.** An explicit list from the Completeness dimension.

Match the report language to the conversation (German for this project by default); keep `file:line` references and code identifiers verbatim.

## The quality bar (self-contained)

A strict maintainability audit. Be **demanding**: do not approve merely because behaviour seems correct. Prefer a small number of high-conviction findings over a long list of nits. Apply this as a checklist in the Quality dimension.

### Be ambitious about structural simplification (code-judo)

- Don't stop at "this could be a bit cleaner." Look for reframings where whole branches, helpers, modes, conditionals, or layers **disappear entirely**.
- Prefer **deleting** complexity over rearranging it. Assume a "code-judo" move is often available that uses the existing architecture more effectively and makes the change dramatically simpler.
- A refactor that moves complexity around without reducing the number of concepts a reader must hold in their head is **not** an improvement — say so.

### Presumptive blockers (justify or fix)

Treat these as blockers unless the author justifies them clearly:

- A file pushed from **under 1000 lines to over 1000 lines** without a compelling structural reason. Prefer extracting helpers/subcomponents/modules first.
- **Ad-hoc branching** bolted onto an unrelated flow (a repeated conditional on the same discriminator signals a missing model/helper/dispatcher).
- A local problem solved by **scattering feature checks across shared code**.
- An **unnecessary abstraction, thin/identity wrapper, or cast-heavy contract** that makes the design more indirect without buying clarity.
- A **duplicated** existing helper, or logic placed in the **wrong layer** when there is a clear canonical home.

### Standing checks

- **Direct, boring, maintainable beats clever/magical.** Be skeptical of generic mechanisms that hide simple data-shape assumptions.
- **Types & boundaries:** question needless optionality, `any`, `unknown`, and cast-heavy code; prefer explicit typed models / shared contracts over loosely-shaped ad-hoc objects; don't let a silent fallback paper over an unclear invariant.
- **Canonical layer & reuse:** keep feature logic out of shared paths and implementation details behind the interface; reuse existing canonical utilities instead of bespoke near-duplicates.
- **Orchestration & atomicity:** flag needlessly sequential work where independent steps could be simpler in parallel, and related updates that can leave state half-applied — but don't over-index on micro-optimisations.

### Approval bar

Do not approve if there is: a clear structural regression, an obvious missed simplification when a code-judo path is visible, an unjustified file-size explosion, obvious spaghetti-growth from special-case branching, a hacky/magical abstraction that makes the code harder to reason about, unnecessary wrapper/cast/optionality churn, or a clear architecture-boundary leak / avoidable canonical-helper duplication.

## Severity scale

- **Blocker** — must be fixed before merge (breaks intent, wrong approach, a large unplanned new concept smuggled in, data/correctness risk, major structural regression).
- **Major** — should be fixed (real maintainability or design problem, but not merge-blocking on its own).
- **Minor** — worth addressing; never cosmetic-for-its-own-sake (those are out of scope, see Posture).

## Anti-patterns

- **Starting without naming the operating mode**, or following the local steps headlessly — an agent with no git that tries to create a worktree burns the run on an impossible instruction.
- **Reviewing a dirty working directory.** It is clean either by itself or through the commit gate (Step 1a). Reading in place is fine once it is; what is forbidden is reading a tree with uncommitted changes, because the review then describes a state nobody meant.
- **Editing or patching source code** — the review itself is read-only. The one permitted write is the commit gate: before the review, local mode only, only on branch match.
- **Using `--force` on a worktree path outside `_pr-review/`**, or leaving the review worktree behind (cleanup must always run).
- Producing a list of naming/formatting nits — cosmetic findings are ignored unless they evidence a deeper problem.
- Reviewing the bare diff hunks without reading the surrounding files and callers, so reusability and loose ends go unchecked.
- Skipping the intent step and judging only code aesthetics — without the "should", scope fidelity cannot be assessed.
- **Counting a large, unplanned new concept (e.g. e2e testing) as "scope fulfilled" instead of flagging it as a scope-gate Blocker.**
- Rubber-stamping "it works" without checking whether the approach itself is sound, or whether new concepts are abstracted, modular, and reusable.
