# AI-Readiness Standard for Repositories

> **Pi-mirror note.** Pi-adapted copy of the `engineering-foundation` wiki page; the wiki is the source of truth, kept fresh by the `engineering-sync` skill. The body is unchanged — this page carries no Cursor-specific tool-call edges, only references to the target repo's own files (AGENTS.md, CLAUDE.md, .cursor/rules, .agents/skills).


> **Provenance — where this page comes from.** The normative content below is transferred verbatim
> from the Aura artifact
> [AI-Readiness Standard for Repositories](https://aura.dev-anwalt.de/artifacts?artifact=40aa0075-eb96-43fc-8717-8a36123395f6),
> **version 15** (created 2026-08-04, doc owner Anne Iheanacho). An artifact is where a decision is
> *made and approved*; this page is where it *lives*. Every checkpoint of the `ai-setup` skill points
> here, not at the artifact.
>
> **Transferred:** 2026-08-12, by AURA-1338 (slice S3 of [AURA-914](https://aura.dev-anwalt.de/tasks?task=b791c540-2f53-4799-9973-e2ff7436d259)).
>
> ⚠️ **Transferred ahead of full approval — re-check before relying on it.** At the time of transfer
> v15 carried **three of five approvals and no rejection** (approved: Yoshiya Markus Maki, Daniel
> Friedmann, Simon Sattes; outstanding: Björn Falszewski, Marcel Oleart Boada). The transfer was made
> early and deliberately, so that the pages already referencing this one stop pointing at nothing.
> **Until the two outstanding approvals land, the artifact remains the source of truth**, and this
> page is to be re-read against it and corrected if the review changes anything.

---

## House addition — Aura is the mandatory tracker

**This section is not part of the transferred standard.** It is the one addition this house makes on
top of it, kept visibly separate so that a later re-transfer of the standard can neither absorb it
nor overwrite it.

In this house, **Aura is the tracker** — not one option among several. A repository that is otherwise
AI-ready but wires its task lifecycle to a different tracker does not meet this house's readiness
bar. Concretely:

- Which tracker a repository uses is **configuration, not an assumption**: it is declared in
  `AGENTS.md` and read from there rather than inferred.
- For house repositories that value is **`aura`**. Jira may stay configured for *read* access to
  legacy tickets and to work owned by other teams, but the task lifecycle writes to Aura.
- A repository whose lifecycle writes to a different tracker is a non-conformance to be surfaced and
  agreed, in the same way the standard handles `plai-api`'s inverted entry files — not an edit to be
  applied silently.

> **Pending countersignature.** The doc owner of the standard (Anne Iheanacho) has not yet
> countersigned this addition. Until then, read it as this house's stated intent rather than an
> approved part of the standard.

---

# Transferred content — Standard v15, verbatim

> **v15.** Supersedes v14. Five corrections, all of them defects found by applying the standard to a
> repository other than `aura` — see "What changed from v14" at the end. No new requirements are
> introduced; two are reworded to be satisfiable, one is reassigned to its owner, and two factual
> errors are fixed.

> **Doc owner:** Anne Iheanacho · **Last reviewed:** 2026-08-04

---

## Purpose

Make every production repository navigable and safe for AI agents (Claude Code, Cursor, Copilot)
without manual hand-holding — and keep that property true over time without maintaining the same
rule in *n* places.

## How this document is used

It is **not** copy-pasted into repositories. It has two consumers:

1. **The readiness skill** reads the *central layer* below and reconciles a repository's existing
   skills and rules against it — improving what is there rather than overwriting it.
2. **Repository owners** fill in the *repo layer* — the small, genuinely repo-specific set that
   cannot be centralised.

Everything in the central layer is maintained **once**. If a general rule changes, no repository
needs to be chased.

### Relationship to E1.6 Governance & Conventions

E1.6 defines the *principles* (what is required and why); this document defines the *content* of
AI-readiness. Where the two appear to diverge, **E1.6 wins** and this document is corrected.

See the Developer Guides in the **Engineering Foundation** space: `guides/developer-guides`.

> **Addressing convention.** Pages in that space are addressed by node UUID or by slug path within
> the space (`guides/developer-guides`) — never by `source_path` and never by `resource`. This is the
> space's own stated rule; v14 linked `knowledge/governance-conventions/developer-guides.md`, a path
> that no longer resolves because the `governance-conventions` space no longer exists.

### Relationship to the rollout mechanism

This document deliberately contains **no distribution mechanism**. The mechanism — how central
content reaches an agent working in a repository — is specified in the companion artifact
*AI-Readiness Rollout Mechanism* (v2).

Known adjacent work, referenced rather than duplicated here. **These tickets are the authoritative
source for their own facts; where this document summarises them, the ticket wins.**

| Ticket | Owns |
|---|---|
| **AURA-770** | Publishing the existing rules/skills into the OKF `engineering-foundation` space (the store the mechanism reads from) |
| **AURA-1062** | Whether the building blocks live as wiki pages or as real file **assets**, and the repeatable repo→wiki transfer |
| **AURA-755 / ANW-7787** | MCP-side **transport** into target projects (download, install, update history). Lives in Ops1.E12, outside this epic |
| **AURA-800** | Knowledge-space read ergonomics for agents. Lives in S1.E4, outside this epic |
| **AURA-801** | Making the rules and skills tracker-agnostic so a repo configures rather than edits them |
| **AURA-914** | `ai-setup` / `ai-sync` — the runnable form of this standard, and the rename of `ai-repo-readiness` |
| **AURA-931** | Upstream flow: feeding a good local adaptation back into the central set |
| **AURA-1060** | Validating the toolchain before Phase 1 — the gate this standard's criteria depend on |
| **AURA-771** | Fixing the Doc-Run agent to emit C4/Mermaid diagrams |
| **AURA-773** | Closing the module public-interface gap (see "Generated documentation") |
| **AURA-670 / 671 / 672** | Phase 1–3 rollout per repository |

The one place this document and AURA-770 touch is the central store: AURA-770 decides what the store
looks like and what goes into it, the mechanism artifact decides how a repository is brought into
line with it.

### Polyglot note — the intent is language-agnostic

Our repositories are not single-stack. The rules and structure below are language-agnostic; only
syntax changes. Translate idioms rather than transcribing them.

| Repo | Primary stack |
|------|---------------|
| anwalt.de Platform | PHP 8.3 / Laminas |
| **plai-api** | **Go — Echo v4, GORM, OpenAPI-first via oapi-codegen** |
| plai-llm-validator | Python |
| frontend-plai, frontend-profile | TypeScript / Vue / React |
| everfind-search, everfind-indexer | *(confirm per repo)* |
| deploy-to-aws | YAML / shell (infra) |
| aura | TypeScript |

> v14 listed `plai-api` as Python. It is Go. The error mattered: this table is what an agent uses to
> decide which idiom to translate a central rule into.

---

## The two layers

This split is the load-bearing structure of the standard. It is a **content** distinction, so it
holds regardless of which carrier delivers it.

| | Central layer | Repo layer |
|---|---|---|
| **Maintained** | Once, centrally | Per repository |
| **Contains** | Non-negotiables, data handling, command & testing principles, language, review rules, conventions | Stack, layout, forbidden architecture boundaries, rule-map, tooling index, concrete command bindings |
| **Changes when** | A company-wide rule changes | A repository changes |
| **Agent reads it** | Via the mechanism (see companion artifact) | Directly from the repo's own `AGENTS.md` |

A repository's own agent file therefore carries **only** the repo layer plus exactly one pointer to
the central layer. It does not restate general rules.

### `AGENTS.md` ↔ `CLAUDE.md` — single source of truth

**Rewritten in v15.** v14 required `CLAUDE.md` to be a prose pointer. That is wrong for the same
reason this standard already gives for central wiki links: **a pointer is not a load.** An agent that
reads `CLAUDE.md` and finds "see AGENTS.md" may or may not follow it — and if it does not, every
always-on guardrail silently stops applying. AURA-914's refinement reached the same conclusion
independently while working on `aura`.

The rule is therefore:

- **`AGENTS.md` is the single source of truth** for a repository's agent guidance.
- **`CLAUDE.md` is a shim that actually loads it** — an `@import` of `AGENTS.md`, not a sentence
  telling the reader to go there. It may carry nothing of its own beyond the import and, optionally,
  a short list of critical reminders.
- **`CLAUDE.md` must not duplicate guidance.** A reminder is a reminder; a second copy of a rule is
  drift.
- **No symlinks.** `ln -s AGENTS.md CLAUDE.md` breaks on the mixed operating systems the team runs.

```markdown
# CLAUDE.md
@AGENTS.md
```

> **Known non-conformance, deliberately named.** `plai-api` currently runs this arrangement
> **inverted** — `CLAUDE.md` holds the full content and `AGENTS.md` is the prose pointer. It
> therefore fails this criterion today and must flip during Phase 1. This is recorded rather than
> quietly excused, because the same v14 text simultaneously cited `plai-api`'s `CLAUDE.md` as the
> reference shape for the "Where to look" table (below) — praising a layout the same document
> forbade. The rule-map *content* remains the reference shape; the *file it lives in* changes.
>
> Note also that `plai-api` carries an always-on rule requiring **team alignment** before its entry
> files or rule files are changed. Adopting this criterion there is therefore a conflict to be
> surfaced and agreed, not an edit to be applied — recorded on AURA-1060 as the first measured
> central-vs-repo conflict.

#### What each tool actually reads

`AGENTS.md` is the only file more than one tool reads. Keep guidance there and add thin per-tool
shims rather than forking content.

| Tool | Reads `AGENTS.md` | Reads `CLAUDE.md` | Native config | Notes |
|------|---|---|---|---|
| Claude Code | no | **yes** | `CLAUDE.md` (root + nested) | `CLAUDE.md` `@import`s `AGENTS.md` |
| Cursor | **yes** (root **and** nested; nearest wins) | no | `.cursor/rules/*.mdc` | Plain `AGENTS.md` suffices for most repos. Use `.mdc` only for activation control (`alwaysApply`, `globs`, description-based, `@`-mention-only). ⚠️ A plain `.md` in `.cursor/rules` is **ignored without frontmatter**. |
| Codex and other agents.md-aware tools | **yes** | no | `AGENTS.md` only | No `@`-imports, no path scoping, ~32 KiB combined limit |

> **Claude Code support is not yet proven.** Aura is currently optimised for Cursor. Claude-Code
> capability has been started but not tested end-to-end. Treat the `CLAUDE.md` wiring as provisional
> until validated — see the companion mechanism artifact, validation subtask (e), now carried by
> AURA-914.

---

# Central layer

Maintained once. Every repository inherits all of it.

## Data handling & compliance — legal domain, critical

We handle **PII and privileged legal case data**; GDPR applies and lawyers using our products carry
a Mandantengeheimnis duty.

- **Never** paste real client, case, or user data into prompts, tests, logs, or fixtures — use
  synthetic data.
- **Never** log PII, passwords, tokens, or case content.
- Treat all `customer_*`, `case_*`, `client_*` data as confidential; follow the data-classification
  policy.
- If unsure whether data is sensitive, **assume it is and ask**.

### Model usage by data class (E1.6 Guide 1 Rule 2 / POL-04)

| Data class | Permitted models |
|---|---|
| Public / internal non-sensitive | Any approved model |
| Confidential / personal | Only models with a verified data-processing agreement |
| Strictly confidential (secrets, raw customer data, IP-critical) | **Do not send to external models** |

### Model selection

Choose deliberately; don't default to the most expensive tier. Interim steer: simple/high-volume →
small/fast tier; everyday engineering → mid tier; hard problems → top tier. Revisit when benchmarks
land.

## Allowed / forbidden actions

**Allowed**
- Read code, run tests, run lint/format, edit source and tests
- Run the local dev server and local/dev database migrations

**Forbidden**
- Running migrations or scripts against **staging or production**
- `git push --force` to shared branches; committing directly to `main` or `release/*`
- Committing secrets, `.env`, credentials, or real client/case data
- Adding dependencies without noting them in the PR description
- **Committing at all without an explicit request from the developer.** The agent prepares changes;
  the developer decides when they are committed.
- Editing generated code (anything carrying a `DO NOT EDIT` header)

## Language & communication

- **Chat language mirrors the developer's input.** Developer writes English → answer English;
  writes German → answer German.
- **Code, commits, comments and PR descriptions are always English.**
- Answer concisely. **Ask instead of guessing.**
- No AI attribution in commits or PR descriptions.

## Alignment before implementation

For any non-trivial plan, hold a short **alignment interview** before writing code: restate the
goal, surface assumptions, and name the branches in the decision. Actively challenge assumptions
rather than implementing the first reading.

## Command principles

Every repository exposes the same three affordances, whatever the stack underneath:

| Affordance | Contract |
|---|---|
| **Single start command** | From a fresh clone, one command brings the repo up (install + run dev). E1.6 Guide 1 Rule 1, single-command-setup dimension. |
| **Single done-signal** | One command runs *all* quality checks — lint + types + tests. E1.6 Guide 2 Rule 5. |
| **Scoped test command** | A filtered form of the done-signal for fast feedback while iterating. |

The repo layer binds these to concrete commands (see below).

## Testing principles

- **Layers:** unit (isolated, mocked) · integration (domain + infra, real DB) · E2E (full API).
- **Meaningful coverage** of domain logic — the important paths and edge cases are exercised, not a
  number ticked for its own sake.
- **Atomic tests after every change.** Immediately after changing a file, run the scoped test
  command for that file. Do not batch verification to the end of a task.
- **Think about coverage actively.** If it is unclear where tests should be extended, ask — do not
  silently skip it.
- If you change logic, add or adjust a test.

## Naming, structure, errors, types

- Folders lowercase-hyphenated; classes/types PascalCase; functions and variables follow the
  language idiom (camelCase TS, snake_case Python, camelCase PHP methods, MixedCaps Go).
- Named exports over default exports where the language supports it.
- Small, single-responsibility functions (~<20 lines).
- Comments explain **why**, not what.
- Typed / domain-specific errors, handled at the boundary. Never swallow exceptions in an empty
  catch.
- Always type inputs and outputs. Avoid `any` / untyped dicts / `mixed` / bare `interface{}` where a
  concrete type fits.
- Validate input at boundaries (Zod / Pydantic / Form Requests / generated request types).
- Dependency injection via constructor, not global singletons.

## Security baseline

- Never hardcode secrets — env vars or secrets manager.
- Parameterised queries only; never string-concatenate SQL.
- Hash passwords (bcrypt/argon2); never store plaintext.
- Validate all inputs at boundaries.
- Never log secrets or PII.

## Observability

- Emit telemetry via **OpenTelemetry**, using the official OTEL library for the stack and following
  OTEL Semantic Conventions for Resource Attributes.
- Structured logs only. Never log PII or secrets.
- Full standard: Observability Standard (AURA-691) once published.

## Dependencies & vulnerabilities

- Add dependencies deliberately and note them in the PR.
- Keep a lockfile committed.
- Run the stack's audit tool in CI; patch high/critical promptly.
- Version per SemVer; keep a CHANGELOG.

## PR & review (E1.6 Guide 3)

- The **Aura PR-Review skill is mandatory** on every PR, and should be run **before** the push —
  the agent starts on every pull request anyway, so running it up front prevents wasted work.
- **Merge approval:** one human approval from a reviewer who can actually assess the code, **plus**
  a completed skill run. The author may self-merge afterwards. Sensitive areas (auth, payment,
  infra) may require a second approval.
- **AI-assisted code is reviewed by a different model, or the same model in a fresh context** —
  never the same model in the same context (E1.6 Guide 3 Rule 5).
- Keep reviews prompt and kind; escalate threads past two rounds to a call.

## Commits

Conventional Commits: `type[optional scope]: subject`, types
`feat|fix|docs|style|refactor|perf|test|chore|ci|build`. Single-line, imperative, English.

## Deployment scheduling (E1.6 Guide 4 Rule 1)

Deploys **without** expected downtime are allowed anytime. Deploys **with** planned downtime only
outside business hours with ≥48h notice. Hotfixes anytime. Avoid Friday-evening and pre-holiday
deploys unless necessary.

The concrete release flow is **not restated here or in any repository** — it lives once in
`deploy-to-aws`. Repositories reference it.

---

# Repo layer

The only content a repository maintains itself. Everything else is inherited.

## 1. Purpose & stack

One or two sentences on what the repo does, plus language, framework, datastore, CI/CD, deploy
target, owning team.

## 2. Layout

An annotated tree of the actual structure, with the architectural intent made explicit — e.g.
"keep `domain/` free of framework code; HTTP concerns live in the API layer".

## 3. Command bindings

What the three central affordances actually run here:

| Affordance | This repo |
|---|---|
| Single start | *(e.g. `task upd`)* |
| Single done-signal | *(e.g. `task test`)* |
| Scoped test | *(e.g. `task test -- [path/filter]`)* |

Plus the underlying commands, for when the wrapper is unavailable: install, run dev, lint, format,
test.

## 4. Where to look — rule-map & tooling index

A pointer table so an agent can find the right guidance without reading everything:

- Pointers to the repo's own docs and deep-dive guides
- **Rule-map:** which rule file applies when, and to which paths
- **Skills inventory:** what skills exist for this repo
- **Pinned MCP servers** relevant to this repo
- **Taskfile cheat-sheet**

> **Worked example.** `plai-api` implements exactly this shape — a "Where to look" table mapping
> topics to `.claude/rules/*.md` files, with path-scoped rules and a matching `.cursor/rules/*.mdc`
> wrapper per rule. Use that **table** as the reference. Note that it currently lives in
> `CLAUDE.md`; per the entry-file rule above it belongs in `AGENTS.md`, and moving it is part of
> Phase 1 for that repo.

## 5. Forbidden architecture boundaries

Beyond the central forbidden list, each repo names its own hard boundaries. These are the rules an
agent cannot infer from the code. Placeholders to replace:

- *"Never provision EC2 from the UI layer."*
- *"Never edit `src/api/generated/` — regenerate via `task codegen`."*
- *"Never bypass `AccessService` for a permission check."*
- *"Never return raw ORM errors across the store boundary."*

## 6. API contract

Where the OpenAPI/GraphQL contract lives, and the rule: **read the contract before changing
endpoints — do not reverse-engineer it.** For contract-first repos, state the codegen workflow.

## 7. Environment & setup specifics

Prerequisites with versions, `.env.example` handling, local URLs, ports.

## 8. Domain glossary

Short. Only terms an outsider would misread.

| Term | Meaning |
|---|---|
| PLAI | The LLM-powered legal AI advisor product |
| Everfind | Internal search platform (search + indexer) |
| Aura | Internal project-management / AI-productivity system |
| *(repo-specific term)* | *(definition)* |

## 9. Accessibility — frontend repos only

Semantic HTML; labelled interactive elements; WCAG 2.1 AA (contrast, focus states, keyboard nav);
alt text; respect reduced-motion; axe/Lighthouse in CI.

## 10. Token efficiency & repo selection — only if applicable

For multi-repo workspaces: which repo to work in for a given task, and how to avoid loading
irrelevant context.

---

# Generated documentation

Documentation that can be derived from the code is **generated, not hand-written**.

| Document | Owner | Status |
|---|---|---|
| Module documentation | **Doc-Run agent** → `.aura/docs/modules/*.md` | ✅ Supersedes the former hand-written `MODULES.md`. Measured output carries purpose, locations, libraries, responsibilities and typed OKF relations. **`MODULES.md` is retired.** |
| Architecture & data model | **Doc-Run agent** → `.aura/docs/architecture/`, `.aura/docs/data/` | ⚠️ Emitted, but currently as ASCII box art. **C4 Mermaid is still required** — see AURA-771. |
| Data-flow diagrams | **Doc-Run agent** | ⚠️ Not yet emitted; listed as missing in Doc-Run's own coverage notes. AURA-771. |
| `README.md` | **Human-maintained, repo root** | ✅ Retained. Doc-Run writes agent-facing OKF into `.aura/docs/`; it never writes a human-facing repo-root README. Different audience, different location. Its content may be *drafted* from `.aura/docs`. |
| **Module public interface** | **AURA-773** | 🔄 **Assigned in v15** — no longer an unowned gap. Decision recorded there: module docs carry a table of **public entry points** (class or service, one-line purpose, source path), deliberately **without** parameter or return signatures, which drift fastest and are readable from the code. The scope wording changes accordingly: "API-Contract" is to be read as **public module interface (entry points)**. |

## Requirements on generated documentation

1. **C4 required.** The architecture overview must contain a valid `C4Context` and `C4Container`
   Mermaid block. This is AURA-287's Definition of Done — the standard does not relax to match
   current tool output; the tool is fixed (AURA-771).
2. **Agent-managed docs live in `.aura/docs/`**, in OKF, flagged `isAgentManaged`, refreshed on
   merge into a defined branch, and are not hand-edited. Hand-written repo knowledge lives in
   sibling directories (e.g. `.aura/ai-setup/`), never inside the bundle — the bundle is rewritten
   clean-slate on every run.
3. **Generated docs require a correctness gate.** A wrong generated architecture description does
   not merely sit there being wrong — it steers every agent that subsequently reads it. Silent
   drift into confidently-wrong repo docs is a worse failure than the copy-paste drift this
   standard replaces, because copy-paste drift is at least visible in a diff.

   Therefore:
   - The `aura/docs` → `main` pull request **must be reviewed and merged**, not left open.
   - Anything describing a **trust-critical surface** — anonymisation, file handling, billing, auth,
     sharing, user-lifecycle purge — requires human verification before merge.
   - **Coverage must be independently verified.** Doc-Run's `coverage_complete` flag is
     self-assessed by the agent.
4. **Unresolved-knowledge markers are expected.** Doc-Run emits `::question{}` blocks where it could
   not determine an answer. These are a work queue, not a defect — but they must not leak into
   human-facing documents.

---

# Readiness criteria

A repository is **AI-ready ✅** when all of the following hold. This is the objective gate for the
phase stories.

## Repo-authored

- [ ] `AGENTS.md` present, carrying **only** the repo layer plus one pointer to the central layer
- [ ] `CLAUDE.md` present as an `@import` shim of `AGENTS.md` — not a prose pointer, not a duplicate,
      not a symlink
- [ ] Cursor works from `AGENTS.md` (root + nested); `.cursor/rules/*.mdc` added only where glob or
      manual activation is needed, and referencing rather than duplicating
- [ ] `README.md` present with doc owner + last-reviewed date
- [ ] Command bindings declared, and the single start command verified from a fresh clone
- [ ] "Where to look" rule-map and tooling index present
- [ ] Forbidden architecture boundaries declared
- [ ] API contract linked (contract-bearing repos)
- [ ] Accessibility section (frontend repos)

## Meta files

- [ ] `.editorconfig`
- [ ] Linter/formatter config for the stack
- [ ] `CODEOWNERS`
- [ ] `.env.example` — documented, no real secrets
- [ ] `CHANGELOG.md`

## Generated

**Reworded in v15.** The previous criterion read "a Doc-Run has succeeded on this repository". A run
on `plai-api` on 2026-07-30 reported `SUCCEEDED` having emitted two documents — `index.md` and
`log.md` — with its own coverage note stating that "all planned architecture, data model, API
endpoint group, module, and development documents were never emitted". Under the old wording that
repository passed this criterion while holding no documentation at all. Success is not the signal;
coverage is.

- [ ] A Doc-Run has completed on this repository **with `coverage_complete` true and no
      `reached_iteration_limit`**
- [ ] The run's emitted set includes, at minimum, an architecture document, the module documents,
      and a data-model document — not only `index.md` and `log.md`
- [ ] Coverage is **independently** assessed as complete, not self-reported
- [ ] Architecture overview contains valid C4 Mermaid (blocked on AURA-771)
- [ ] Module documents carry a public entry-point table (blocked on AURA-773)
- [ ] The `aura/docs` → `main` PR is **merged**, not left open

## End-to-end validation

- [ ] A fresh AI agent can set up, run, test, and make a small change **without asking a human**

> The generated-documentation criteria are why AURA-771 and AURA-773 block Phase 1, and why an
> iteration budget that is derived rather than hand-set (AURA-773) is a readiness dependency and not
> a tooling nicety: on the measured `plai-api` run the budget was 10 while the engine's own pre-run
> estimate was 9, and the run still terminated at the limit having emitted nothing.

---

## Rollout

Phased rollout is tracked in the task hierarchy, not here — AURA-670 (Phase 1: anwalt.de Platform,
plai-api, frontend-plai), AURA-671 (Phase 2: everfind-search, everfind-indexer, aura), AURA-672
(Phase 3: deploy-to-aws, AI KB, frontend-profile, tailwind-design-system, plai-llm-validator).

Validation of the toolchain itself is **AURA-1060**, which blocks Phase 1.

---

## What changed from v14, and why

Every item below was found by applying v14 to `plai-api` — a repository that is not `aura`. That is
the point worth recording: v14 was written and reviewed against one repository, and five defects
surfaced on first contact with a second one.

| Change | Driven by |
|---|---|
| **Governance link fixed** to `engineering-foundation` → `guides/developer-guides`, with the space's addressing convention stated | The `governance-conventions` space no longer exists, so v14 shipped with a dead link — the exact defect v12 was rejected for. The guides moved during AURA-770. |
| **`plai-api` corrected from Python to Go** in the polyglot table | Factual error. The table is what an agent uses to choose which idiom to translate a central rule into. |
| **`CLAUDE.md` rule changed from prose pointer to `@import` shim**, and the `plai-api` inversion named as a known non-conformance | A pointer is not a load — the same argument this standard already makes about central wiki links applies inside the repo. AURA-914 reached the same conclusion independently. v14 also praised `plai-api`'s `CLAUDE.md` as a reference shape while forbidding its layout. |
| **Module public interface reassigned from "Unassigned / gap" to AURA-773**, with the entry-points decision recorded and the "API-Contract" wording clarified | AURA-773 decided it: entry points, not signatures. A standard should not carry an unowned gap row once the gap has an owner. |
| **Generated criteria reworded from "a Doc-Run has succeeded" to coverage-based** | The measured `plai-api` run (2026-07-30) passed the old wording while emitting only `index.md` and `log.md`. A criterion a repository can satisfy with zero documentation is not a criterion. |
| Adjacent-work table extended with AURA-800, AURA-801, AURA-914, AURA-931, AURA-773, AURA-1060, AURA-1062, and marked as **authoritative at the ticket, summarised here** | v14 and the mechanism artifact both embedded measurements and tool names in body text and went stale within a week of approval. Facts now live at the ticket; this document points at them. |
| Note added that hand-written repo knowledge lives beside `.aura/docs/`, not inside it | AURA-914: the bundle is rewritten clean-slate on every run, so anything hand-written inside it is destroyed. |

### Carried forward unchanged from v14

The two-layer split, the E1.6 cross-link and "E1.6 wins" rule, the polyglot stance, the
`AGENTS.md`-as-single-source-of-truth decision, the retirement of `MODULES.md`, keeping `README.md`,
keeping the C4 requirement and fixing the tool instead, the correctness gate, and the argued override
on AI attribution in commits — all reviewed and approved in v14, none reopened here.
