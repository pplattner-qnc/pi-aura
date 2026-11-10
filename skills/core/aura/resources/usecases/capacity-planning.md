# Capacity Planning

How to check and adjust capacity commitments in Aura. The capacity
capabilities are back on MCP: `readCapacity` (your own capacity),
`updateTaskMemberCapacity` (your commitment on a task), and
`updateTaskMemberParticipation` (participation status) are the primary
path. Company capacity settings, the cross-member per-task view, and the
leadership overview are not on MCP — use the Aura UI. For the process
rules (how capacity works, base percentages, commitment etiquette), see
[resources/process/capacity.md](../process/capacity.md).

> **⚠️ Only adjust your own capacity.** Modifying another person's capacity
> commitment requires **explicit consent from the user** and is generally
> discouraged from an agent context — capacity is a personal commitment
> between the contributor and the task owner.

## Checking capacity

### Your own capacity

`readCapacity` returns your base capacity, committed, free, utilization,
and per-task commitments.

### Company base capacity (UI-only)

The company-wide base capacity percentage (e.g. 80%) is not on MCP — use
the Aura UI (capacity settings).

## Adjusting capacity

### Your commitment on a task

`updateTaskMemberCapacity` sets your capacity commitment for a specific
task. Remember: this is a real commitment — see
[resources/process/capacity.md](../process/capacity.md) for the rules on
base capacity, structural reserve, and shifting between tasks.

### Participation status

`updateTaskMemberParticipation` updates your participation status on a
task (`ACTIVE` | `WAITING` | `OBSERVING`).

### Company base capacity (admin only, UI-only)

Changing the company-wide default happens in the Aura UI. **Requires
admin role and explicit user consent.**

### Leadership overview (admin/leadership only, UI-only)

The paginated overview of all team members' capacity is not on MCP — use
the Aura UI.

## Typical workflow

1. Check current state: `readCapacity`
2. Identify what needs to change (over-committed? new task? finishing one?)
3. Adjust: `updateTaskMemberCapacity` (and `updateTaskMemberParticipation`
   if your participation status changed)
4. Verify: `readCapacity` again to confirm

## Key rules (summary)

- Full day (8h) = 80% task capacity, 20% structural reserve
- Commitments are real — "yes, 30%" means something
- Shifting capacity between tasks requires the affected owner's agreement
- Days off = 0%
- See [resources/process/capacity.md](../process/capacity.md) for full details
