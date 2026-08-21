# Aura Development Process — Overview

This directory describes how work flows through Aura from a developer
perspective. Each file covers one aspect of the process in enough detail for
an agent to act correctly within it.

## Source of truth

The canonical process description lives in the Aura wiki:

> **`getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "prozesse/how-we-work-in-aura-a-practical-guide" })`**
>
> Node ID: `2a6d4f32-5d33-47fb-b073-4ec6b04db637`
> Space: `knowledge-hub` | Path: `prozesse/how-we-work-in-aura-a-practical-guide`

When in doubt about process rules, fetch the wiki article. The files here
encode the operational knowledge an agent needs — the wiki article is the
human-readable reference.

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
6. **Respect gates.** Do not move a task past Alignment without stakeholder
   approval. Do not move past Review without passing review.
7. **Set `is_ai_generated: true`** on all comments posted by an agent.
