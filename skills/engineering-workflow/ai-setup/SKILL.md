---
name: ai-setup
description: anwalt.de engineering-workflow skill. Guided onboarding checklist for a repository from this house (anwaltde) — walks the repo-owner through every decision a repository must make to be AI-agent-ready, explains for each checkpoint why it exists and where it is canonically decided, and records every answer so a second run never re-asks it. Use when the user invokes /ai-setup, wants to check or set up a house repo's "AI readiness" / "agent setup", asks what a repo is missing to work well with Cursor or Claude Code, or onboards a new house repo. Reports first, then asks for block-by-block approval before writing anything. Aborts immediately, with no report and no write, if the Aura MCP server is unreachable. Supersedes the previous generic, foreign-repo audit-tool shape of this skill — it no longer evaluates repos outside this house.
---

# AI Setup (`/ai-setup`)

Walks a repository from this house through the decisions it must make to be usable by a coding agent — not by auditing against a generic capability catalog, but against the house standard, the wiki, and this repo's own `AGENTS.md`. Every checkpoint carries a purpose, a canonical owner (a rule, a skill, an `AGENTS.md` key, or a wiki page), and a reason, so the report is itself an onboarding document. Every answer that cannot be re-derived from the filesystem is written to the repo's decision memory, so the second run is cheaper than the first.

This is a renamed, re-scoped successor of this skill's earlier shape (the generic six-layer catalog for foreign repos is gone — see "Scope" below).

## When to apply

- Slash command **`/ai-setup`**, or phrasings like "check this repo's AI setup", "is this repo agent-ready", "onboard this repo for Cursor/Claude Code".
- **This skill is for repositories from this house only.** It assumes Aura as the tracker and this repo's `AGENTS.md`/rule-tree conventions as the target shape. Do not run it against a repository outside this house — there is no generic mode anymore (see "Scope").

## Scope: house repos only

The generic six-layer capability catalog this skill previously ran against *any* repo is gone. With Aura as a mandatory tracker, the Aura MCP server as a precondition, and `.aura/ai-setup/` as the decision memory, a "generic mode" would either be dead weight or a second, contradictory truth in which Aura is optional after all.

**This is not the same as "the rule tree must already exist."** A fresh house repo without `.cursor/rules/anwaltde/` yet is the main case this skill is built for — that is an onboarding target, not an error. What is gone is only the ambition to evaluate a *foreign* repo that never adopted this house's conventions.

## Precondition — Aura must be reachable

Before the first checkpoint runs, check exactly one thing: can the Aura MCP server be reached (e.g. `getHealth`)? This is a **workspace precondition**, not a repo setting — the Aura MCP server is installed globally per developer, and with Aura as the mandatory tracker (checkpoint C1), the skill has nowhere to write a follow-up ticket without it.

Do **not** check whether `aura-mcp` is merely declared in `.mcp.json`. This repo declares it there, but against a *local* instance with a personal token from a gitignored env file — a fresh clone cannot use that declaration for anything. What actually works is the globally installed server; that is what gets probed.

**If unreachable:** abort immediately with a clear instruction (install/start the globally available Aura MCP server, then re-run). No report is produced, no checkpoint runs, and `.aura/ai-setup/` stays untouched — this is a hard stop, not a partial run.

## Workflow

### Phase 1 — Precondition, then detect

1. Run the precondition check above. Abort on failure, per the rule there.
2. Read `.aura/ai-setup/decisions.md` and `.aura/ai-setup/adaptations.md` (create `.aura/ai-setup/` per `general-ai-docs-structure` → "Decision memory" if wholly absent — an absent memory means "never set up", not an error). Anything already decided is reported as decided, not re-derived as if new.
3. Detect stack signals the checkpoints below need: presence of `.cursor/rules/anwaltde/`, `AGENTS.md`, `CLAUDE.md`, the `## Configuration` table, the rule tree under `.cursor/rules/anwaltde/{universal,project}/`.

### Phase 2 — Build the report; ask only where there is something to decide

Walk every checkpoint in the block tables below. Blocks **A, C, D, E, G, H, I** are objective — derivable from the filesystem or from `AGENTS.md`, never asked about. For each, read the evidence and produce one report line in the format defined here:

```
<checkpoint> · <status> · <purpose> · <canonical owner> · <reason> · <recommendation>
```

What [W2 — AI-Readiness Rollout](https://aura.dev-anwalt.de/knowledge/engineering-foundation/workflow/ai-readiness-rollout) (`workflow/ai-readiness-rollout`) carries is the **four buckets, the six invariants and the run shape** — read those there and do not restate them here. It does not carry a line format, and this line is not shared with `ai-sync`: that skill reports on building blocks rather than checkpoints and defines its own, deliberately parallel line. Same length, same reading rhythm, different fields — do not treat one as a substitution of the other.

**W2's bucket actions describe the reconciliation model, not this skill's reach.** Two of the four buckets prescribe "Remove it" and "Add it"; this skill does neither (see "Deliberately out of scope"). It classifies into the buckets and reports — the acting on them is `ai-sync`'s Y8 for the version axis, and a human's for everything else.

**H3 is checked independently, never trusted from the doc run's own report.** A doc run can report `SUCCEEDED` while emitting far less than a real pass — read what was actually written under `.aura/docs/` (architecture, module, data-model coverage) and judge from that, not from the run's own success signal.

Blocks **B** (working mode) and **F** (parallel work) are real questions, not filesystem lookups — see "Blocks B and F: real questions" below.

### Blocks B and F: real questions

Every checkpoint elsewhere is filesystem or `AGENTS.md` evidence turned into a report line. B and F cannot be answered that way — nobody's filesystem says how a team collaborates, or whether parallel work is worth its machinery here. For these two blocks:

1. **Check `decisions.md` first.** Any checkpoint already answered in a prior run is reported as **decided**, with its recorded answer — never re-asked.
2. **Ask the remaining checkpoints as one grouped `ask_user_question` call per block**, with clear options, not a prose list in the chat — one call for B, one for F, not one call per checkpoint.
3. **A solo repo is a valid answer, not a gap.** B1's answer decides whether B2–B6 are even obligations; "no human review" for a one-person repo is reported as this repo's mode, never as a finding to fix.
4. **F is gated by E1, then by F1/F2.** F cannot be asked before a start command (E1) exists — asking whether something can run twice side by side presupposes it can run once. F1/F2 have exactly three valid answers, each with a different consequence:
   - **present** → F3–F10 are checked as objective, filesystem-derivable checkpoints. This repo's own `worktree-dev-workflow` and the `AGENTS.md` keys `Worktree root`, `Stack-token derivation`, `Container / compose names`, `Test-URL template`, `Infra capabilities`, `Shared services` are *one* solved variant, shown for orientation — never rolled out elsewhere as the norm.
   - **planned or sensible, but not built** → offer the third exit (a follow-up ticket, see below), never scaffold it inline.
   - **not sensible here** → record the reason in `decisions.md` and close the block permanently; the next run does not ask again. This is a result, not an open item.

### The third exit: a follow-up ticket instead of a scaffold

Some gaps are too large to close within a run. Next to "set it up now" and "record as not applicable", this skill has a third exit: after approval, it opens a follow-up ticket describing the gap via the pattern in `.agents/skills/anwaltde/universal/task/task-create/SKILL.md`, and links it in the report **and** in `decisions.md`.

**The criterion is the kind of gap, not its size.** What `ai-setup` itself can do is **write documents** — rules, skills, `AGENTS.md`, `CLAUDE.md`, this decision memory. What it cannot do is **build infrastructure** — per-branch containers, database forks, worktree scripts, CI wiring, log access. Block F falls entirely on the ticket side by this criterion, as does a missing CI pipeline or a non-existent test suite. An effort estimate would not stay stable between two runs; this line does.

**Flow, once a checkpoint's gap is document-vs-infrastructure-shaped:**

1. Draft a short description of the gap that names the checkpoint it came from (e.g. "F6 — no per-branch database fork exists").
2. Present it via `ask_user_question` with a preview and an explicit accept/reject choice — never create the ticket without this step.
3. **On accept:** capture it through `task-create`'s own pattern, in **idea mode** — a checkpoint gap is a description to triage, not a scoped plan; the owner can run `/task-draft` on it later if it is picked up. Record the resulting key as the `Follow-up ticket` value on that checkpoint's row in `decisions.md`, and cite it in the report line's Recommendation column.
4. **On reject:** no ticket is created. Record the rejection itself in `decisions.md` (`Decision`: "Follow-up ticket declined", with the owner's reason if given) so the next run does not propose the same ticket again.

**No ticket without approval, and never a second ticket for the same gap.** The ticket key in `decisions.md` is what the next run checks before proposing anything — it finds the existing key and reports the gap as already ticketed, not open.

### Phase 3 — Approve and write, block by block

- Present each block as a separate approval unit — the owner approves one block at a time, never a single end-of-run button, per W2's run shape. For blocks A, C, D, E, G, H, I this means approving the reported gaps; for B and F it means approving the answers just given (including any "not applicable" call or third-exit ticket).
- **On approval of an objective block (A, C, D, E, G, H, I):** for every checkpoint whose status is not "present" (i.e. a gap, a partial match, or something to report as conflicting), append or update one row in `.aura/ai-setup/decisions.md` → "Structured decisions": `Checkpoint / case` (this skill's rows carry the checkpoint code alone, e.g. `D7`) · `Decision` (the finding, e.g. "Gap — `@import` missing for `general-code-quality`") · `Reason` (the checkpoint's "why", from the tables below) · `Follow-up ticket` (empty unless the third exit applied) · `Date`. A checkpoint already fully present needs no entry: it is cheaply re-derived from the filesystem every run, and recording it would only be an audit-trail line, not a decision.
- **On approval of B or F:** for every checkpoint just answered, write one row per checkpoint — `Decision` carries the actual answer (e.g. "Solo repo, no human review"), not a gap description. `Follow-up ticket` stays empty unless that checkpoint's answer was "planned but not built" and the owner accepted the offered ticket (see "The third exit" above).
- **A second run with nothing changed** re-derives the same statuses, sees the matching rows already in `decisions.md`, and reports them as "already known, still open" or "already decided" instead of writing a duplicate row or asking again (update the `Date`, not the row count).
- **An aborted run** (mid-way through the blocks) leaves only what was actually approved — a block never approved has no row in `decisions.md`, per W2 invariant 6.
- Reporting is never writing: nothing in `.aura/ai-setup/` changes until a block is explicitly approved.

## The blocks

Taken verbatim from the parent plan's checkpoint tables (`task-ai-readiness-tooling.md` → "Ablauf", Blocks A–I) — not reinvented here. Where a row cites **W1**, it means the AI-Readiness Standard at `guides/ai-readiness-standard` in the `engineering-foundation` wiki space. The page exists, and every section cited below resolves on it.

One caveat carries over from how W1 was published: it was transferred from artifact v15 **before** that version's review closed (three of five approvals, no rejection), and the page says so at the top. While that note stands, W1 is the address to cite and to read, but it is not yet a settled authority — if a checkpoint's verdict would hinge on a W1 passage, report the W1 passage *and* the value found in the repo, and let the owner decide rather than declaring a violation. Once the two outstanding approvals land, that caveat and this paragraph go away.

### Block A — what kind of repo is this

| # | Checkpoint | Canonical owner | Reason |
|---|---|---|---|
| A1 | Stack, purpose, owning team | Repo layer of the standard (§1) | Decides which checkpoints are even relevant |
| A2 | Target tools: Cursor, Claude Code, or both | W1 §"What each tool actually reads" | Determines which entry files are required |
| A3 | Reach of the foundation set: which `universal/` building blocks apply | `general-ai-docs-structure` | Without this boundary, adoption becomes copying instead of adapting |
| A4 | `Doc language` of planning documents | the target repo's `AGENTS.md` → `Doc language`, owner `general-language-policy` | Control artifacts stay English; plans follow the team |

### Block B — working mode & collaboration

A real question, not a checkpoint report — see "Blocks B and F: real questions" above. A solo repo and a twelve-developer repo have **different correct answers**, not the same target state at different completion levels. All answers go to `decisions.md`.

| # | Checkpoint | Canonical owner | Reason |
|---|---|---|---|
| B1 | **Operating size: solo, few, large team** | Repo-owner explains | The root of this block — decides whether B2–B6 are obligations at all |
| B2 | Is there human code review, and is it mandatory? | W1 §PR & review; repo-owner explains | Solo has nobody to approve. The rule must be allowed to say so, not be worked around |
| B3 | Integration via pull requests at the host, or purely local onto the target branch? | the target repo's `AGENTS.md` → `PR host` / `Merge target branch`, read by `task-finish` | Otherwise `task-finish` offers a PR this repo does not even have |
| B4 | Is the PR-review agent mandatory, and does it run before or after the push? | W1 §"PR & review"; skill `pr-review` | Where human review is absent, it is not an addition but the only gate |
| B5 | Multi-repo project? Which repos belong together, and how are cross-repo changes linked? | Repo-owner explains | A ticket touching three repos falls apart into three unconnected changes without a linking rule |
| B6 | Branch conventions, and who may merge directly onto the target branch | W1 §"Allowed / forbidden actions"; the target repo's `AGENTS.md` → `Merge target branch` | Direct-merge is legitimate at solo scale and a violation at team scale — same action, opposite verdict |
| B7 | Free text: how does the owner prefer to work? | Repo-owner explains, recorded in `decisions.md` | Not everything is a toggle. What lands here saves the agent a re-ask and the owner a repeat |

### Block C — tracker & task lifecycle

Aura is **mandatory**, not a choice; Jira may additionally be present, but `none` is not a valid answer here. This mandate lives in W1 §"House addition — Aura is the mandatory tracker", not in `tracker-selection` — the rule stays `universal` and still treats `none` as a valid, non-blocking case; the mandate is house policy, not a property of the mechanism. W1 keeps it visibly separate from the transferred standard for exactly that reason, and notes that the standard's doc owner has not yet countersigned it.

| # | Checkpoint | Canonical owner | Reason |
|---|---|---|---|
| C1 | Aura set as tracker; Jira optionally additional, with primacy stated | W1 §"House addition" (mandate) · the target repo's `AGENTS.md` → `Tracker` (value) · `tracker-selection` (mechanics) | Without a shared tracker there is no place where cross-repo work becomes visible |
| C2 | The adapter `tracker-selection` names for the active tracker(s) is installed in this repo's own rule tree with a real attach mode, not left inert (`alwaysApply: false`, no `globs`) | `tracker-selection`, central blueprint `blueprint/rules/**` | An adapter that stays in the central blueprint (or sits here only as an inert template) and was never installed with a real attach mode is a silent failure: the rule never attaches |
| C3 | With two trackers: primacy and mirror direction | `tracker-mirror` (template) | Order carries the truth; without it, duplicates appear |
| C4 | ~~MCP server declared in `.mcp.json`~~ → **precondition, not a checkpoint** | see "Precondition" above | The Aura MCP server is installed globally; a repo declaration is not what makes it reachable |
| C5 | Default parent Epic, project tag, release-tag policy | the target repo's `AGENTS.md` → `Default parent Epic` / `Project name` / `Release tag: *`, owner `tracker-aura` | Otherwise new tasks hang unparented and releases cannot be collected |
| C6 | Story points yes/no and scale | the target repo's `AGENTS.md` → `Story Points: whether`, owner `task-artifact-conventions` | Model recommendation and slicing depend on it |
| C7 | Task-folder root and plan-link schema | the target repo's `AGENTS.md` → `Task folder root` / `Plan-link schema` | Without them no plan can be linked out of the tracker |
| C8 | Which lifecycle skills apply | the target repo's `AGENTS.md` → `## Skills` | The idea → draft → refine → slice → implement → finish chain is the process, not decoration |
| C9 | Iteration/sprint concept present? | the target repo's `AGENTS.md` → `Iteration concept`, owner `task-preflight-checks` | Preflight asks about it; absence must be defined |

### Block D — control layer: entry files, rules, skills

| # | Checkpoint | Canonical owner | Reason |
|---|---|---|---|
| D1 | `AGENTS.md` present, fixed slot order, nothing repo-specific above `## Project specifics` | `general-ai-docs-structure` | Without the free closing section the template frays on the next transfer |
| D2 | `## Configuration` as value tables (Key · Value · Question · Owning rule) — **every** row filled | `general-ai-docs-structure` | Files present, register empty is the worst state: it looks finished |
| D3 | Every owning rule genuinely exists, and a value's absence is defined and non-blocking | `general-ai-docs-structure` | A dead reference is worse than a missing one |
| D4 | **`CLAUDE.md` as a shim:** no content of its own, one `@import` per always-on rule, every path exists | `general-ai-docs-structure`; W1 §"`AGENTS.md` ↔ `CLAUDE.md` — single source of truth" | Claude Code does not read `AGENTS.md` on its own and evaluates no `globs`. A bare pointer produces an agent that runs without guardrails while looking set up |
| D5 | Provenance layout: `anwaltde/{universal,project}`, vendor outside `anwaltde/`, any template/conditional rule marked inert (`alwaysApply: false`, no `globs`, header names its condition) rather than silently indistinguishable from an active rule | `general-ai-docs-structure` | Visible at a glance what is ours, what is liftable, and what only activates conditionally |
| D6 | **Every `project/` version with a central origin is in `adaptations.md`** | `general-ai-docs-structure` → "Adaptation convention" | Without the log, "deliberately adapted" and "stale copy" are not distinguishable |
| D7 | Always-on rules complete and imported in `CLAUDE.md` | the target repo's `AGENTS.md` → `## Always-on rules` | An `alwaysApply` rule without an import does not apply for Claude Code |
| D8 | Rule map complete; paths match the `globs` exactly; origin column correct | `general-ai-docs-structure` | Claude Code reads no globs — the map is the only mapping it has |
| D9 | Rule quality: `description` present, exactly **one** attach mode | `general-ai-docs-structure` | `globs` **and** `alwaysApply` together is always a bug |
| D10 | Skill inventory complete; every skill has `name` + `description`; every path exists | the target repo's `AGENTS.md` → `## Skills` | The slash command comes from the frontmatter, not the folder |
| D11 | No skill and no rule hardcodes tracker mechanics, host, branch, or command | `general-ai-docs-structure` | This is the line between adapting and copying |
| D12 | A named place for decision history **and** for the setup memory | the target repo's `AGENTS.md` → `Decision-log location`; the target repo's `AGENTS.md` → `Decision-memory path` | Rules carry guidance, not archaeology |

**D4/D7 check form, not function.** Whether the `CLAUDE.md` import actually makes Claude Code enforce a rule end-to-end is Human Test 22 of the parent plan, not a checkpoint here — these two rows only check that every `alwaysApply` rule has a syntactically valid, existing-path `@import` line.

**D6 is the sole owner of the unrecorded-adaptation finding.** `ai-sync` sees the same condition while inventorying — a `project/` file with a central counterpart and no `adaptations.md` row — but that is a completeness statement about the control layer, i.e. this skill's structure axis. `ai-sync` therefore reports only what it means for its own comparison ("not comparable, provenance unrecorded") and points back here; the finding itself, the question to the owner, and the `decisions.md` row all belong to D6. One condition, one owner — do not mirror the reverse direction by having D6 defer to `/ai-sync`.

### Block E — dev environment & operations

| # | Checkpoint | Canonical owner | Reason |
|---|---|---|---|
| E1 | **One start command** brings the repo up from a fresh clone | W1 §Command principles; the target repo's `AGENTS.md` → `Infra capabilities` | Without it, every session burns time on setup |
| E2 | **One done signal** (lint + types + tests) plus a scoped test command | W1 §Command principles; the target repo's `AGENTS.md` → `Test commands` | Without a deterministic "done", correctness stays opinion |
| E3 | **Access to runtime logs** | the target repo's `AGENTS.md` → `## Skills` (`app-logs`) or a generic observability checkpoint | Without real signals an agent debugs by guessing |
| E4 | DB access plus the non-negotiables for destructive operations | `general-db-destructive-ops` | A single reset costs irreplaceable data |
| E5 | **Shared services nobody may restart** | the target repo's `AGENTS.md` → `Shared services`, owner `general-shared-state-and-handoff` | Availability damage, not data damage — its own hazard class |
| E6 | Worklog path, section headings, status labels, gitignored | the target repo's `AGENTS.md` → `Worklog path` and related keys | Running status must not hang in the chat history |

### Block F — parallel work

A real question, not a checkpoint report — see "Blocks B and F: real questions" above. Presupposes E1: only once there is *one* start command can it be asked whether it may run more than once side by side. All answers go to `decisions.md`.

**This repo is the reference implementation — shown, not rolled out.** Aura runs one worktree per ticket, derives a stack token from the branch that drives the container name and test URL, shares **one** Postgres instance across every stack but automatically forks a per-branch database `app_<token>` the moment a branch carries a migration, and gives every worktree its own test DB besides — because a single shared test DB would collide across concurrent integration runs on migrations and `truncateAll`. `worktree-dev-workflow` and the `AGENTS.md` keys `Worktree root`, `Stack-token derivation`, `Container / compose names`, `Test-URL template`, `Infra capabilities`, `Shared services` are *one* solved variant, not the norm this skill enforces elsewhere. The decision stays with the repo.

| # | Checkpoint | Canonical owner | Reason |
|---|---|---|---|
| F1 | **Is parallel work even worth it here?** How many tickets run at once, what does a branch switch cost, how long is a cold start? | Repo-owner explains | For a repo working one ticket at a time, the whole machinery is dead weight. The question comes before the solution |
| F2 | **Present, planned, or discarded?** | Repo-owner explains | Three answers, three consequences (see "Blocks B and F: real questions"). "Discarded" is a result, not an open item |
| F3 | Multiple checkouts at once: worktrees, or branch switches in the same directory | `worktree-dev-workflow` §One worktree per ticket; the target repo's `AGENTS.md` → `Worktree root` | A branch switch in the same directory tears down every running stack with it |
| F4 | Collision-free namespace per stack: what derives the token, and what hangs off it (container, URL, compose override) | the target repo's `AGENTS.md` → `Stack-token derivation`, `Container / compose names`, `Test-URL template` | Without it, two branches claim the same container name and address |
| F5 | The everyday command brings up **only** the own stack and never touches shared infrastructure | `worktree-dev-workflow` §Stack token; the target repo's `AGENTS.md` → `Infra capabilities` | This is exactly the difference between `upd:app` and `upd` — without it every start takes the neighbour down too |
| F6 | **Database: one shared instance, but a dedicated DB per migrating branch** | `worktree-dev-workflow` §Shared database & migrations | The core of the whole block. Two branches with different migrations on one DB damage each other, and the damage surfaces on the third victim |
| F7 | The fork happens **automatically** on detecting a migration, not on request | ibid. | A safeguard someone has to remember to use fails reliably exactly when it matters |
| F8 | A dedicated test DB per stack, plus a disposable shadow for migration diffs | ibid. §Per-worktree test DB; `general-db-destructive-ops` | Otherwise parallel integration runs collide on migrations and truncation; a shadow pointed at a real DB empties it |
| F9 | Teardown removes exactly what a stack created — and nothing beyond | ibid. §Teardown | Without teardown, containers, databases and package stores grow unbounded; with too broad a teardown, the neighbour dies |
| F10 | Who may start and stop what, once several stacks run | `general-shared-state-and-handoff`; the target repo's `AGENTS.md` → `Shared services` | Parallelism is what turns a foreign stack into shared state — before it, there was none |

### Block G — quality & determinism

| # | Checkpoint | Canonical owner | Reason |
|---|---|---|---|
| G1 | Linter/formatter configuration with a runnable command | W1 §"Naming, structure, errors, types"; repo layer | Machine-checkable feedback an agent can self-correct against |
| G2 | Type checking, wherever the language supports it | W1 §"Naming, structure, errors, types" | Catches a whole error class before runtime |
| G3 | Tests run from a fresh clone and are green; unit/integration/e2e layers named | W1 §Testing principles | The factual basis for "this change is correct" |
| G4 | CI runs what applies locally | W1 §Dependencies; repo CI | A rule that executes nothing is a request |
| G5 | Commit convention documented | W1 §Commits | Machine-readable history |
| G6 | Toolchain pinned, lockfile committed | W1 §Dependencies | The agent's results match CI and the team |

### Block H — meta files & generated documentation

**H3 is verified independently — see Phase 2.** H4 and H5 are checked, never generated: their content comes from AURA-771 and AURA-773; a gap there is a finding for those tickets, not a task for this skill.

| # | Checkpoint | Canonical owner | Reason |
|---|---|---|---|
| H1 | `README.md` with a doc owner and a last-reviewed date | W1 §Readiness criteria | The human counterpart to the agent-run docs |
| H2 | `.editorconfig`, linter config, `CODEOWNERS`, `.env.example`, `CHANGELOG.md` | W1 §Meta files | The cheapest items on the list, and therefore the most often missing |
| H3 | A doc run has happened: `coverage_complete`, **no** iteration cap, minimum emission (architecture, modules, data model) — verified independently, not from the run's own report | W1 §Generated (v15: coverage-based) | Success is not the signal, coverage is: a measured run reported `SUCCEEDED` with only two documents |
| H4 | Architecture overview with valid C4 Mermaid | W1 §Generated; blocked on AURA-771 | Checked here, generated there |
| H5 | Module documents carry a public-entry-point table | W1 §Generated; blocked on AURA-773 | Checked here, generated there |
| H6 | The `aura/docs` → `main` PR is merged, not open | W1 §"Requirements on generated documentation" (item 3, the correctness gate) | Measured: docs do not currently land |
| H7 | Model catalogue filled per tier | the target repo's `AGENTS.md` → a model-catalogue key, where the repo defines one — **no owning rule exists in this house yet**, see below | Without the catalogue there is only a tier, no model |
| H8 | **The decision memory exists and is maintained** | Foundation 1.1 (`.aura/ai-setup/`) | A directory the first run creates and the second ignores is worse than none |

**H7 has no canonical owner yet — report it as such, do not invent one.** Every other row here points at a rule, an `AGENTS.md` key or a wiki section that genuinely exists. H7 does not: no house rule owns model-tier recommendation, and no repo currently carries a model-catalogue key. Report H7 as "no canonical owner in this house" and recommend that the owner be established, rather than citing a rule that a reader would then go looking for in vain — a dead reference is worse than a missing one (D3), and that applies to this skill's own citations first of all.

### Block I — compliance & security

| # | Checkpoint | Canonical owner | Reason |
|---|---|---|---|
| I1 | Data classes and, per class, which models are allowed | W1 §Model usage by data class (E1.6 Guide 1 Rule 2 / POL-04) | We process client data; this is not a style question |
| I2 | No real client/case data in prompts, tests, logs, fixtures | W1 §Data handling | Client confidentiality |
| I3 | Secrets via env/secrets manager, never hardcoded; secret scanning | W1 §Security baseline | Leaked credentials are not a style question either |
| I4 | Forbidden actions named: migrations against staging/prod, force-push on shared branches, committing without explicit instruction | W1 §"Allowed / forbidden actions" | The agent prepares, the human decides when to commit |
| I5 | Repo-specific architecture boundaries named | Repo layer §5 | Exactly the rules an agent cannot derive from the code |

## Deliberately out of scope

This skill's checklist now covers all nine blocks (A–I) and the third exit. What stays out, on purpose:

- **A deterministic check script.** Idempotence is demonstrated by hand — running the skill a second time and comparing — not by a script.
- **The content behind H4 and H5.** Those checkpoints check for the architecture overview and the module public-entry-point tables; the content itself comes from AURA-771 and AURA-773.
- **Scaffolding fixes.** This skill reports gaps, records B/F answers, and opens follow-up tickets for infrastructure-shaped gaps — it does not yet write fixes into `AGENTS.md`, `CLAUDE.md`, or the rule tree itself. A reported document-shaped gap stays a gap in the filesystem until a human or a later capability closes it.
- **The retrofit workflow** (moving a good local adaptation back to the central standard) — a separate ticket (AURA-931), out of reach of both `ai-setup` and `ai-sync`.

## Decision memory

Reads and writes `.aura/ai-setup/` (`general-ai-docs-structure` → "Decision memory"; the target repo's `AGENTS.md` → `Decision-memory path`). This skill only ever **adds or updates rows** in `decisions.md`'s structured table (see Phase 3) — for objective blocks that means gap findings, for B and F it means the actual answers given, and for the third exit it means the resulting ticket key or the recorded rejection. It never touches `adaptations.md` (that log is written when a `universal/` → `project/` move happens, which this skill's checkpoints do not perform) and never removes a row a human placed there by hand.

**This skill is not the only writer.** `ai-sync` writes `decisions.md` too, for its Y6 case alone, under a row identity of its own (`Y6 · <building block>`) — the file documents the split. Read every row, whoever wrote it, so an answer already recorded by the other skill is reported as settled rather than asked again; but only ever add or update rows in this skill's own identity space, and never rewrite one of `ai-sync`'s.

## Anti-patterns

- **Asking about an objective checkpoint.** Every row in Blocks A, C, D, E, G, H, I is filesystem- or `AGENTS.md`-derivable. If a checkpoint genuinely cannot be answered without asking the owner, it belongs in Block B or F, not here.
- **Treating a solo repo's B answers as gaps.** "No human review", "no PR host", "direct merge allowed" are this repo's mode when B1 says solo — never a finding to remediate.
- **Asking F3–F10 before F1/F2 settle whether parallel work applies here.** F presupposes E1 and is itself gated by its own first two checkpoints.
- **Scaffolding Block F's infrastructure inline** instead of offering the third exit when the owner says "planned, not built".
- **Creating a follow-up ticket without the accept/reject preview**, or a second ticket for a gap that already has a key recorded in `decisions.md`.
- **Trusting H3's doc-run success signal.** `SUCCEEDED` is not coverage; read what was actually emitted under `.aura/docs/`.
- **Treating an unreached rule tree as a failure.** A fresh house repo without `.cursor/rules/anwaltde/` is the onboarding case this skill exists for, not an error state.
- **Writing before approval.** No row in `decisions.md` changes until its block is explicitly approved — reporting is not writing.
- **Silently skipping the precondition.** Running any checkpoint while the Aura MCP server is unreachable, instead of aborting immediately with an unwritten `.aura/ai-setup/`.
- **Declaring a violation on W1's authority alone.** While W1 still carries its "transferred ahead of full approval" note, a passage there is the reference to read and quote, not a settled verdict — report the passage next to the value found and leave the call to the owner.
- **Recording a fully-present checkpoint in `decisions.md`.** It is cheaply re-derived every run; recording it would only add audit noise, not save a re-ask.
- **Re-running the generic six-layer catalog.** That catalog belonged to this skill's earlier shape and is gone — do not resurrect it for a foreign or non-house repo.

## Verification checklist

- [ ] Precondition checked first; on failure, a clear abort message, zero checkpoints run, `.aura/ai-setup/` untouched.
- [ ] Every objective checkpoint (Blocks A, C, D, E, G, H, I) reported with all six fields of the line defined in Phase 2: checkpoint, status, purpose, canonical owner, reason, recommendation. None of them asked as a question.
- [ ] Blocks B and F are asked as grouped `ask_user_question` calls, gated by `decisions.md` — an already-decided checkpoint is reported as decided, never re-asked.
- [ ] A solo-repo answer to B1–B7 is reported as this repo's mode, not as a gap.
- [ ] F3–F10 are only checked once F1/F2 answer "present"; "planned, not built" offers the third exit; "not sensible here" is recorded and closes the block permanently.
- [ ] H3 is checked against the actual `.aura/docs/` emission, not the doc run's own success report.
- [ ] Approval requested block by block, not once at the end.
- [ ] Writes to `decisions.md` happen only for an approved block: gap findings for the objective blocks, the actual answer for B/F checkpoints, and are deduplicated by checkpoint code across runs.
- [ ] The third exit never creates a ticket without an explicit accept via `ask_user_question`, records a reject the same way, and never opens a second ticket for a checkpoint that already has a key in `decisions.md`.
- [ ] Every created follow-up ticket names the checkpoint it came from, and its key appears in both the report and `decisions.md`.
- [ ] Every wiki citation names a section that actually resolves on the page it names — W1 on `guides/ai-readiness-standard`, W2 on `workflow/ai-readiness-rollout`, which carries only the buckets, the invariants and the run shape. Citing W1 content as W2 (or the reverse) is the failure D3 calls out, and it applies to this skill's own citations first.
- [ ] No checkpoint's verdict rests on W1 alone while its pre-approval note stands.
- [ ] A second run with nothing changed reproduces an identical report and does not duplicate a `decisions.md` row or a follow-up ticket.
