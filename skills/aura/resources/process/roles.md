# Roles

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "prozesse/how-we-work-in-aura-a-practical-guide" })`

## Owner

The **central point of contact** for a task. Takes responsibility for getting
it from A to B within the deadline and constraints.

**Responsibilities:**
- Understand the task and expected outcome
- Develop (or coordinate) the plan
- Keep task status up to date in Aura
- Choose the right Stakeholders and bring them in at the right time
- Request reviews with clear deadlines
- Monitor progress, flag problems early
- Escalate when blocked
- Ensure the outcome reaches all relevant parties

**Not required:**
- Implement everything personally — bring in Contributors
- Have all answers — drive toward answers

**Ownership transfers** between phases are normal (e.g. concept person hands
off to implementer at Development). There is always exactly **one active Owner**.

## Contributor (Crew)

Supports an Owner on specific, clearly scoped work.

**Key traits:**
- Works on specific Sub-Tasks
- Commits capacity in 10% steps
- Requires **mutual confirmation** with the Owner — never assigned unilaterally
- Can be involved in multiple tasks simultaneously

## Stakeholder

Reviews plans (Alignment) or results (Review). Does not implement.

**Key traits:**
- Prioritises review requests — Owners are often blocked waiting
- If unable to meet a deadline, communicates proactively
- Provides feedback via comments, review chats, or sync sessions

## How people get assigned

| Path | How |
|---|---|
| **Looking for Owner board** | Leadership posts unassigned tasks; employees apply; Leadership decides |
| **Direct assignment** | If nobody applies, Leadership assigns via direct manager |
| **Looking for Crew board** | Owner posts need; Contributors apply; mutual agreement |

## Relevant MCP tools

Owner/crew assignment is not available via MCP after the overhaul. Use the
Aura UI, or the REST endpoints in `openapi-new.yaml` (`/tasks/{uuid}/owner-search*`,
`/tasks/{uuid}/crew-search*`).
