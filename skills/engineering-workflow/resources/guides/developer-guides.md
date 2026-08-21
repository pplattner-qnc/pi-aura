# Developer Guides — Governance & Conventions

> **Pi-mirror note.** Pi-adapted copy of the `engineering-foundation` wiki page; the wiki is the source of truth, kept fresh by the `engineering-sync` skill. The body is unchanged — this page carries no Cursor-specific tool-call edges, only references to the target repo's own files (AGENTS.md, CLAUDE.md, .cursor/rules, .agents/skills).


> **Status:** Approved & published. · **Audience:** Development team (~38 people). · **Last updated:** July 2026.
>
> **Source of truth:** Aura artifact *"E1.6 Governance & Conventions — Developer Guides"* (v75, approved). Tracking: ANW-6957 (epic) / ANW-7744.

---

## Overview & Navigation

Each guide stands alone but references others where needed. Start with the guide most relevant to your current work:

### Principle: Rules + Skills Go Hand in Hand

Conventions only work if they are anchored in two places:

- **Rules** — ensure that conventions are **automatically enforced** in agent and IDE workflows.
- **Skills** — usable both by the agent and **manually in the IDE** (e.g. AI Readiness Check, PR Review Skill).

A guide principle that is not reflected in at least one of these two forms will not be followed in practice.

## 1. LLM Selection Guidelines

**Last Updated:** July 2026

### Purpose

We use multiple LLMs (Claude, GPT, open-source models). Instead of rigid rules, we deliberately start with **awareness** and will monitor actual practice before committing to concrete prescriptions.

### Core Principle

**Eyes open when choosing a model.** Don't default to the most expensive model for every task — not even for small ones. But don't cut corners where reasoning or safety matter either. Consciously weigh cost against quality — per task.

> Specific model recommendations, price ranges, and task matrices are deliberately **not** part of this artifact. A follow-up artifact to E1.6 will deliver benchmarks and default configs for common use cases, based on our monitoring experience.

**Interim default tiers — a rough steer, not a rule.** Until the benchmark follow-up lands, use these defaults so teams don't reflexively reach for the most expensive model while we gather monitoring data:

- **Simple / high-volume tasks** (docs, content, boilerplate) → small, fast tier (e.g. Haiku-class)
- **Everyday engineering** (PR review, standard feature work) → mid tier (e.g. Sonnet-class)
- **Hard problems** (complex refactors, architecture, tricky debugging) → top tier (e.g. Opus-class)

Adjust per task and revisit once benchmarks and real usage data are in.

### General Rules

#### Rule 1: Repo AI-Readiness Standard

For AI models and agents to work effectively in a repository, the repo must be **AI-ready**. Reference implementation: the **`ai-repo-readiness` Aura Skill** — the skill checks these dimensions deterministically and should be run periodically per repo. Guide and skill are kept in sync (see principle "Rules + Skills Go Hand in Hand").

**1. Agent instruction files**

- **`AGENTS.md`** — how AI/agents should work in this repo (conventions, entry points, gotchas, good/bad examples).
- **`CLAUDE.md`** (or LLM-equivalent) — short pointer to `AGENTS.md`, plus LLM-specific notes if needed.

**2. Access & Connectors**

The agent needs access to the resources it must actually reason about:

- Repo-relevant services (dev DB, caches, queues …), where present
- Issue tracker (Aura task or Jira)
- VCS host (Bitbucket) — for PR handling
- Browser / web fetch
- **Logs & observability** (Docker logs, Grafana etc.) — so the agent can act on real runtime signals instead of guessing
- Live-docs binding (e.g. via MCP) — recommended when fast-moving libraries are in use

**3. Repo-internal reference documentation**

- Preferred: auto-generated **`.aura/docs/`**, wired in as a Rule so the agent picks it up automatically.
- A curated **`.aura/wiki/`** (or equivalent) for "living knowledge" (decision history, rationale) is planned — details in a follow-up artifact.

**4. Setup / Run / Test — single command**

Every repo must be locally runnable from a fresh clone with a **single command**. Where this is not possible, a very clearly documented setup is required. This information belongs in a maintained **`README.md`** that `AGENTS.md` links to — **not** in the auto-generated `.aura/docs/` (the agent can't reliably infer it during exploration).

**5. Framework skills & shared conventions — central, curated**

Framework skills (Nuxt-UI, Impeccable, Vitest …) and shared conventions / Rules that go beyond a single repo are provided and maintained **centrally through Aura** as a single source of truth. Repos pull in what they need; the selection is up to the **repo owner**. Not every repo needs everything. Goal: reuse instead of duplication.

**6. Rules-Wiring as a principle**

Rules and Skills should be aligned. If a skill checks something (code quality, PR review), a Rule should already push development in a direction where the later skill run will pass. Rules have a single source of truth; tool-specific files are thin shims. This is a principle, not a hard CI gate.

**Benefit:** When these six dimensions are in place, both agents and humans understand the repo's conventions and can work effectively without repo-specific hand-holding.

#### Rule 2: Data Classes & Model Usage

Not every data class may be passed to every model. As guidance (in line with [**ISO/IEC 42001**](/knowledge/iso-27001-dokumente/e30194ba-6e9c-4583-aca0-d2b7137b5dae) and the data classification / acceptable-use rules in [**POL-04 Information Security & Acceptable Use**](/knowledge/iso-27001-dokumente/c74794a2-62eb-496e-bdec-6e2405dc5b61)):

- **Public / internal, non-sensitive data:** all approved models may be used.
- **Confidential / personal data:** only models with a verified data processing agreement; no open, contractually unsecured endpoints.
- **Strictly confidential data (secrets, raw customer data, IP-critical):** do not send to external models as a general rule. If unavoidable, only via explicitly approved, isolated channels.

The authoritative definition of each data class (and who owns classification decisions) lives in [POL-04](/knowledge/iso-27001-dokumente/c74794a2-62eb-496e-bdec-6e2405dc5b61) — this rule applies those classes to model usage, it does not redefine them.

When in doubt: ask the guide owner, don't guess.

## 2. Coding Conventions

**Last Updated:** July 2026

### Purpose

Consistent coding style makes codebases readable, maintainable, and collaborative. This guide sets language-agnostic principles, project structure standards, and modularity expectations.

> These conventions operationalise the secure-development requirements of [**POL-18 Secure Development**](/knowledge/iso-27001-dokumente/883d9518-ad7b-42d3-9a04-6480d1ea7c72) at the day-to-day code level (secure development environment, technical review of applications, version control).

### Core Principles

1. **Readability > cleverness** — Code is read 10x more than it's written
2. **Consistency > personal preference** — Team standards override individual style
3. **Automation > manual** — Use linters, formatters, type checkers (not code review for style)
4. **Explicit > implicit** — Names, types, and intent should be clear
5. **Testability > purity** — Code should be easy to test; dogmatic FP isn't worth it
6. **Modularity > coupling** — Abstract over providers; reuse before reinvent

### General Rules

#### Rule 1: File Organization

Every project should follow this standard structure:

```
/docker        — Docker configuration and containerization files
/aws           — AWS service definitions (CloudFormation templates)
/app (or /src) — Application source code
```

**Why:** Clear mental model; easy to find things; scales to many modules; standard across all projects.

#### Rule 2: Testing Requirements

- **Unit tests:** Every new function should have tests. Aim for meaningful coverage of new code — enough that the important paths and edge cases are exercised, not a number ticked for its own sake.
- **Integration tests:** Critical workflows (auth, payment, data pipelines). Environment should be **as close to production as possible** — local test database, real or equivalent stub services instead of pure mocks, wherever feasible.
- **E2E tests:** For critical user journeys, end-to-end across all system layers. Goal: catch integration point drift early.
- **Error cases:** Always test error paths, not just happy path.
- **Naming:** Test names describe the scenario (`testShouldReturnNullWhenUserNotFound`).

> **Hinweis — Testzuständigkeit (AURA-285)**
> Entwickler sind **selbst verantwortlich** für Unit- und Integration-Tests. E2E-Tests sind keine exklusive QA-Domäne: Entwickler **dürfen und sollen** E2E-Tests für kritische User Journeys schreiben. QA ist eine zusätzliche Qualitätsschicht — nicht der einzige Ort, an dem E2E-Tests entstehen.

#### Rule 3: Linter & Code Quality Tooling

Every project must have:

- **Linter configured** (e.g., ESLint, Pylint, golangci-lint)
- **Auto-formatter** (e.g., Prettier, Black, gofmt)
- **Type checker** (TypeScript, mypy, etc. — language-appropriate)
- **CI integration:** Linter must pass before merge (non-negotiable)

**Why:** Automation catches style issues before code review, freeing reviewers to focus on logic and architecture.

#### Rule 4: Modularity & Abstraction

Software is maintained for years — tight coupling to concrete providers makes switching costly and tests brittle.

- **Interfaces over direct binding** to concrete implementations. Examples:
  - LLM providers (Claude, GPT, …) hidden behind a shared interface, not called directly from business code.
  - Mail sending via an abstraction (e.g. AWS SQS + worker), not a direct SMTP call from domain code.
  - Storage, Auth, Payment: same principle.
- **Reuse before reinvent:** Before introducing a new concept, check whether it already exists in the codebase (or in an Aura Skill / shared package).
- The Aura PR Review Skill already checks for these points — use it as a sanity check.

#### Rule 5: Single Done-Signal

Every repo provides **`task verify`** as the single command that runs all quality checks (lint + types + tests) together — analogous to `task upd` as the single start command. Repo-wide uniform, deterministic, same "definition of done" for both agent and human.

- **Mandatory:** `task verify` runs all checks, exit-code driven.
- **Recommended:** scoped variants (per-file / per-package) for faster feedback while iterating.

**Why:** Without a single done-signal, "is it green?" becomes a matter of memory and habit. With `task verify`, both humans and agents have an unambiguous end state.

## 3. PR & Review Rules

**Last Updated:** July 2026

### Purpose

Code reviews catch bugs, share knowledge, and maintain standards. This guide defines how we review consistently, ensuring code quality while preventing blind spots in AI-assisted code.

### Core Principles

1. **Quality is non-negotiable** — We enforce quality standards consistently
2. **Assume good intent** — Reviews should be constructive and kind
3. **Diversity in review** — Different reviewers (or fresh context) catch different issues
4. **Aim for speed** — Review promptly; don't let PRs sit. Use automation for style so human review stays fast
5. **Escalate to sync** — Long comment threads should move to calls or chat
6. **Ship > perfect** — If it meets policy, approve; don't block on nitpicks

### General Rules

#### Rule 1: PR Requirements

Every PR must have:

- **Title:** Clear and descriptive. Start with the ticket ID when a related ticket exists (e.g., `ANW-1234: Add user authentication module`). No character limit.
- **Description:** TL;DR format — short and crisp. Only elaborate if the PR needs additional context beyond what is already described in the linked Jira issue. No rigid template required; keep it lean.
- **Tests:** New and modified code carries adequate test coverage — the important paths and edge cases are exercised, not left to chance.
- **Linked Jira / Aura task — where possible:** If a ticket sensibly exists or could exist, link the PR to it. Explicit exceptions where a ticket would be overkill:
  - Maintenance commits such as `bump version`
  - Pipeline / CI configuration changes
  - Trivial cleanups (formatting, comments, renames without behaviour change)

**Rationale:** Jira/Aura is the source of truth for change type, scope, acceptance criteria, and context. The PR description complements this information; it does not duplicate it. For maintenance changes with no functional impact, requiring a ticket is pure overhead.

#### Rule 2: Aura PR Review Skill — Optional

**Primary approach:** The **Aura PR Review Skill** is recommended for every PR. The skill provides structured coverage of correctness, security, performance, and best practices.

**Optional use:** Running the skill is not required — it is a recommended tool, not a gate. If the skill is used, its suggestions are either:

- **incorporated**, or
- **documented as a reasoned rejection in the PR** (a brief comment explaining why a suggestion was not adopted).

**Why document rejections when the skill is used:** Documented rejections are traceable later and serve as a signal for where the skill needs refinement.

**Manual review still matters:** The skill supports but does not replace human judgment. Human review focus:

- Logic correctness and edge cases
- Architecture and design decisions
- Security implications
- Performance trade-offs

#### Rule 3: Assume Good Intent & Diversity in Review

**Review with kindness:**

- ✅ "This function does N+1 queries. Could batch them? See line 45."
- ❌ "Why didn't you batch the queries? This is inefficient."

**Diversity matters:**

- Different reviewers catch different issues (juniors spot edge cases; seniors see architecture)
- Rotating reviewers prevents knowledge silos and builds team strength
- For LLM-assisted code, see Rule 5.

#### Rule 4: Escalate to Sync Communication

**If > 2 rounds of back-and-forth comments → Stop. Start a call or chat.**

- **Why:** PR comments are slow; misunderstandings compound; a quick call beats a drawn-out comment thread
- **How:** Either reviewer or author can say: "Let's chat about this — too complex for comments. Hopping on a call?"
- **Then:** Sync, resolve, and update PR with outcome
- **No comment wars:** They waste time and create friction. Sync communication is faster and friendlier

#### Rule 5: Review of LLM-Assisted Code — Different Model or Fresh Context

**Principle:** Code written by an LLM should be reviewed by **a different model** **or** by the **same model with a fresh context** (or by a human).

**Why:** A model that has already reasoned within the same context tends to confirm its own logic and miss flaws. A different model **or** a fresh context reset removes this bias — both yield comparably reliable results in practice. Our Aura PR Reviews currently run on Sonnet and work well this way.

#### Rule 6: Merge Approval

Every PR needs **one human approval** before merge.

- **One human approval (minimum):** At least one team member other than the author must approve. The approver should be someone who can actually assess the code at that point — no formal seniority requirement and no fixed reviewer list, but not a rubber stamp either.
- **Aura PR Review Skill run:** Optional (see Rule 2). If used, its suggestions are either incorporated or rejected with a documented reason. The skill run complements the human approval; it does not replace it.
- **Who merges:** After a valid approval, the **author may merge their own PR**. There is no need to hand the merge button to the reviewer.
- **Higher bar where it matters:** For sensitive areas (auth, payment, infrastructure), teams may require a second approval at their discretion. This is an upward option, not the default. For these areas a documented four-eyes review is also an ISO expectation — see [POL-18 Secure Development](/knowledge/iso-27001-dokumente/883d9518-ad7b-42d3-9a04-6480d1ea7c72) (System Change Control) and [Baseline-Prüfraster §6 SD-01](/knowledge/iso-27001-dokumente/f9277042-18cd-40d4-be1e-590de9d5061c).

**Why:** One human approval is the non-negotiable quality gate. The PR Review Skill adds value when used, but its use is left to the team's discretion — a deliberate balance for a ~38-person team.

## 4. Deployment Standards

**Last Updated:** July 2026

### Purpose

Deployments are high-risk. Inconsistent, manual deployments lead to outages. This guide defines safe, auditable deployment practices.

> Deployment and change-control practices here implement the operational-security requirements of [**POL-19 Operations Security**](/knowledge/iso-27001-dokumente/fc609ed0-931d-4a34-be03-53b3290dab58) (Change Management, Control of Operational Software).

### Core Principles

1. **Automation first** — All deployments automated via CI/CD; no manual scripts in production
2. **Audit trail** — Every deployment logged, traceable, and reversible
3. **Gradual rollout** — Observe before full deployment
4. **Rollback ready** — Always have a plan to revert
5. **Communicate** — Notify stakeholders before and after

### General Rules

#### Rule 1: Deployment Schedule

We deliberately set **no rigid time windows** for standard deploys. The deciding factor is whether **downtime** is expected:

- **Standard deploys without expected downtime:** allowed at any time.
- **Deploys with expected / planned downtime:** only **outside normal business hours**. Announce at least 48 hours in advance to all affected stakeholders.
- **Hotfixes:** allowed at any time (24/7), regardless of downtime.
- **Recommendation — Friday evenings / before public holidays:** avoid deploying unless necessary. No hard block; responsibility lies with the deployer.

**Why:** Customers must not be disrupted by planned maintenance during core usage hours. Everything else should go live as quickly as possible.

#### Rule 2: Post-Deployment Monitoring & Audit Trail

After deployment, the deployer should:

- **Monitor logs** — Watch for errors, warnings, or unexpected behavior related to the deployment
- **Manual testing** — Verify key workflows work as expected
- **Timeline:** Stay attentive right after full deployment — watch actively while the change beds in, not just a quick glance and away.

**Audit trail ([ISO/IEC 42001](/knowledge/iso-27001-dokumente/e30194ba-6e9c-4583-aca0-d2b7137b5dae) guidance; operational controls per [POL-19 Operations Security](/knowledge/iso-27001-dokumente/fc609ed0-931d-4a34-be03-53b3290dab58)):** Every deployment must be traceable — who, what, when, which version, which pipeline run. This is not extra manual work; it falls out of the CI/CD pipeline naturally. What matters is that these artefacts are retained and remain findable.

**If issues detected:** Be prepared to rollback immediately (see Rule 3).

#### Rule 3: Rollback via Pipeline Re-trigger

**Rollback process:**

1. **Alert triggered** — Issue detected in logs or metrics
2. **Assess** — Is it related to the deployment?
3. **Decide** — Rollback vs. fix forward (usually rollback for prod stability)
4. **Execute** — Re-trigger an earlier successful pipeline run to revert to previous version
5. **Verify** — Confirm metrics return to normal
6. **Post-mortem** — Why did it break? Document findings for future prevention

**Goal:** Rollback should be fast and low-friction — a re-triggered pipeline run, not a manual scramble. Keep the path rehearsed so reverting is a routine, quick operation rather than an improvisation under pressure.

## Cross-Guide Reference

These guides work together:

- **LLM Selection (1)** → **Coding Conventions (2)** — Choose your model deliberately, then implement cleanly.
- **Coding Conventions (2)** → **PR Review (3)** — Code review checks conventions.
- **PR Review (3)** → **Deployment (4)** — Approved PR gets deployed.
- **Deployment (4)** — Audit trail closes the loop back to traceability across all stages.

## ISO/IEC 27001 & 42001 Alignment

These guides are not a standalone invention — they operationalise the company's ISMS policies at the developer level. Authoritative sources in the [ISO-27001 wiki space](/knowledge/iso-27001-dokumente/005437b3-14d8-4df9-8c6e-dc4f26bc5536):

> These references are the source of truth for the underlying security requirements. Where a guide and a policy appear to diverge, the policy wins and the guide is corrected.
