# Roles

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "way-of-working-and-structures/1-1-roles" })`

## Ownership as a principle

Ownership is not a role among others; it applies to **all four roles**
(Owner, Contributor, Stakeholder, Leadership). Everyone owns their part of
the work, including the content they produce, AI-generated output
included.

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
- Implement everything personally: bring in Contributors
- Have all answers: drive toward answers

**Ownership transfers** between phases are normal (e.g. concept person hands
off to implementer at Development). There is always exactly **one active Owner**.
Leadership may **veto an unsuitable Owner pairing**.

## Contributor (Crew)

Supports an Owner on specific, clearly scoped work.

**Key traits:**
- Works on specific Sub-Tasks
- Commits capacity in 10% steps
- Requires **mutual confirmation** with the Owner: never assigned unilaterally
- Can be involved in multiple tasks simultaneously

## Stakeholder

Reviews plans (Alignment) or results (Review). Does not implement.

**Key traits:**
- Prioritises review requests: Owners are often blocked waiting
- If unable to meet a deadline, communicates proactively
- Provides feedback via comments, review chats, or sync sessions

## Leadership

Leadership owns the frame around the work:

- Assigns Owners (via the boards and, if nobody applies, direct assignment)
- May veto an unsuitable Owner pairing
- Routes cross-team feedback: subject-matter feedback goes directly to the
  owning team, formal feedback via the direct manager, unclear priority to
  the Product-Tech Leadership Daily

## How people get assigned

The assignment and board mechanics now live with capacity and resourcing
(wiki page 1.3); the operational rules:

| Path | How |
|---|---|
| **Looking for Owner board** | Leadership posts unassigned tasks; employees apply; Leadership decides |
| **Direct assignment** | If nobody applies, Leadership assigns via direct manager |
| **Looking for Crew board** | Owner posts need; Contributors apply; mutual agreement |

See [capacity.md](capacity.md) for the capacity side of an assignment.

## The handover handshake

When ownership or crew membership changes, **a status field changing who's
assigned is not enough**. The handover is an active handshake: the outgoing
person hands over what the incoming person needs (state, decisions, open
threads), and the incoming person confirms they have it.

## Relevant MCP tools

Task membership is manageable over MCP: `addTaskMember` (add a member),
`setTaskMemberRoles` (set a member's roles),
`updateTaskMemberCapacity` (commitment in 10% steps),
`updateTaskMemberParticipation` (participation note and status). The
owner-search and crew-search matching flows behind the boards are not on
MCP; run them in the **Aura UI**. Assignment still requires **mutual
confirmation**: never assign a Contributor unilaterally.
