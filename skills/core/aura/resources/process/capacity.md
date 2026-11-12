# Capacity

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "way-of-working-and-structures/1-3-capacity-resourcing" })`

Capacity in Aura is a **day-level commitment picture**, re-set every
morning. There is no weekly plan: you commit for today, and tomorrow starts
empty.

## The model

1. **Log real task work in rough 10% steps** (10, 20, 30, not 17%). The
   step is a commitment, not a measurement.
2. **Everything that is not focused task work goes to the shared
   placeholder epic AURA-1686 ("Non Core-Team activities")**: meetings,
   reviews, absence, vacation, education, async communication, and small
   fixes under 10%.
3. **Treat 5% as a soft floor.** Below that, round up to a logged category
   on the placeholder epic.
4. **Everyone lands honestly at 100%.** Your base capacity for a day is
   what you can honestly commit to focused task work; a shorter day shows
   up as smaller task commitments.

## The daily rhythm

- **Set your capacity by 09:00**; the picture is clean by **09:30**. Team
  leads act on their group's board every morning; the Product-Tech
  Leadership daily at 14:00 covers overdue tasks, deadlines, and capacity.
- **Commitments reset to 0% every morning at 04:00** (v17). Re-commit for
  the new day; the percentage is editable from the "My utilization" card.
- **Finished work still counts** (v19): finishing a task with planned
  capacity no longer lowers the day's utilization, so morning commitments
  survive completion.

## Key rules

1. **Commitments are real.** "Yes, 30%" is a commitment. Keep it current
   through the day.
2. **Shifting capacity between tasks requires Owner agreement.** No silent
   reprioritisation.
3. **Absence is logged against AURA-1686**, same as any other non-task
   category.
4. **Cross-team support deals are made at Owner level.** Capacity conflicts
   go to Leadership prioritisation.
5. **Disagreements escalate**: direct manager → MAK (see
   [escalation.md](escalation.md)).

## Relevant MCP tools

> **⚠️ Only adjust your own capacity.** Modifying another person's capacity
> commitment requires **explicit consent from the user** and is generally
> discouraged from an agent context: capacity is a personal commitment
> between the contributor and the task owner.

The capacity capabilities are on the aura-mcp-dev MCP server and are the
documented access path: `readCapacity` (reads in four scopes, including
`scope: "company"` for the Leadership/Admin firm-wide overview),
`updateTaskMemberCapacity`, and `updateTaskMemberParticipation`. The company
capacity settings and the cross-member per-task capacity view are not on
MCP; use the Aura UI for those.

For detailed usage examples and workflows, see
[resources/usecases/capacity-planning.md](../usecases/capacity-planning.md).
