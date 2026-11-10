# Aura Development Process — Overview

This directory describes how work flows through Aura from a developer
perspective. Each file covers one aspect of the process in enough detail for
an agent to act correctly within it.

## Source of truth

The canonical process description lives in the Aura wiki, in the
way-of-working section that replaced the archived single article:

> **`getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "way-of-working-and-structures/1-how-we-work-together-purpose-principles" })`**

The section covers one page per topic here:

| Wiki page | Local file |
|---|---|
| `1-how-we-work-together-purpose-principles` | this overview |
| `1-1-roles` | [roles.md](roles.md) |
| `1-2-workflow-phases` | [workflow-phases.md](workflow-phases.md) |
| `1-3-capacity-resourcing` | [capacity.md](capacity.md) |
| `1-4-alignment-review-escalation` | [review-modes.md](review-modes.md), [escalation.md](escalation.md) |
| `1-5-tooling-aura-jira-asana` | [integrations.md](integrations.md) |

When in doubt about process rules, fetch the matching wiki page. The files
here encode the operational knowledge an agent needs; the wiki pages are
the human-readable reference.

## The workflow at a glance

```
Open → Refinement → Alignment → Development → Review → Deployment → Done
```

| Phase | What happens | Who drives it |
|---|---|---|
| **Open** | Task exists with rough scope. No owner yet. | Leadership |
| **Refinement** | Owner sharpens scope, develops plan, clarifies questions. | Owner |
| **Alignment** | Stakeholders review and approve the plan. Gate before dev. | Owner + Stakeholders |
| **Development** | Work is broken into sub-tasks and implemented. | Owner + Contributors |
| **Review** | Functional check, code review, QA. Gate before deploy. | Review Stakeholders |
| **Deployment** | Ship to production, verify stability. | Owner |
| **Done** | Task complete. | Owner |

## Process files

| File | What it covers |
|---|---|
| [workflow-phases.md](workflow-phases.md) | Detailed phase descriptions, gates, and transitions |
| [roles.md](roles.md) | Owner, Contributor, Stakeholder — responsibilities and how to get assigned |
| [capacity.md](capacity.md) | How capacity tracking works, rules for commitments |
| [review-modes.md](review-modes.md) | Three review modes (async solo, sync multi-perspective, sync 1:1) |
| [escalation.md](escalation.md) | When and how to escalate, escalation paths |
| [integrations.md](integrations.md) | How Aura, JIRA, and Asana fit together |

## Key principles for agents

1. **Aura is the source of truth.** Task status, plans, decisions, and
   documentation live in Aura. JIRA and Asana are mirrors.
2. **Always update task status** when you complete work on a task. Use
   `updateTask` with the appropriate status and `status_change_reason`.
3. **Record progress** with `recordTaskProgress` so the Aura Timeline
   reflects agent activity.
4. **Async-first.** Decisions and feedback happen in Aura comments and
   artifacts, not in meetings. Document outcomes in Aura.
5. **Search before creating.** Check for existing tasks, artifacts, and
   documents before creating new ones.
6. **Respect gates.** The Alignment and Review gates are formal sign-offs:
   disciplines give `APPROVED` or `REJECTED` verdicts, and moving on past a
   rejected gate requires a reason (`status_change_reason`).
7. **Set `is_ai_generated: true`** on all comments posted by an agent.
