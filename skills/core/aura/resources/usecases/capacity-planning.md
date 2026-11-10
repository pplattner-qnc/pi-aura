# Capacity Planning

How to check and adjust capacity commitments in Aura. The capacity
capabilities are back on MCP: `readCapacity` (capacity reads in four
scopes), `updateTaskMemberCapacity` (capacity commitments), and
`updateTaskMemberParticipation` (participation status) are the documented
primary path. Only the company capacity settings and the per-task
cross-member capacity view are not on MCP; use the Aura UI for those. For
the process rules (how capacity works, commitment etiquette), see
[resources/process/capacity.md](../process/capacity.md).

> **⚠️ Only adjust your own capacity.** Modifying another person's capacity
> commitment requires **explicit consent from the user** and is generally
> discouraged from an agent context: capacity is a personal commitment
> between the contributor and the task owner.

## Checking capacity

### Your own capacity

`readCapacity({ scope: "me" })` returns your base capacity, committed,
free, utilization, and the per-task commitments behind them. Works for
everyone.

### One person's capacity

`readCapacity({ scope: "person", person_id: "<uuid>" })` returns one
person's row, including the list of tasks that count toward today's
capacity. You can always read your own row; a foreign person requires
being LEAD of a common group or the VIEW_CAPACITY_OVERVIEW capability. To
see which tasks bind one member of a group, call again with scope
"person" for that member.

### Your team's capacity

`readCapacity({ scope: "group" })` returns the members of every group
where you are LEAD (the "my team" read); pass `group_id` for one specific
group. A member with no task that counts toward today's capacity appears
at 0% with an empty task list. A refusal ("no lead role") is a structured
error, never an empty list.

### Leadership overview (Leadership/Admin)

`readCapacity({ scope: "company" })` returns the firm-wide, person-centric
overview. It is paginated (`limit` per page, default 20, max 100; `page`
1-based). The group and company scopes carry aggregates only, so drill
into one person with scope "person" for their task list.

### Company base capacity (UI-only)

The company-wide base capacity percentage (e.g. 80%) is not on MCP; use
the Aura UI (capacity settings).

## Adjusting capacity

### Your commitment on a task

`updateTaskMemberCapacity({ id, user_id, capacity_percent })` sets,
changes, or removes a core-team member's capacity commitment on a task.
The commitment moves in 10% steps (0 to 100); `capacity_percent: null`
clears it. A member may set their own commitment; owners and
Leadership/Admin may set any core-team member's. Remember: a commitment is
real; see [resources/process/capacity.md](../process/capacity.md) for the
rules on base capacity and shifting between tasks.

### Participation status

`updateTaskMemberParticipation({ id, user_id, note?, status? })` sets a
task member's participation note and/or status (`ACTIVE` | `WAITING` |
`OBSERVING`); at least one of note or status is required. Call it only
when a human explicitly asks you to set that person's participation on
this task, never on your own initiative. Do not set `ACTIVE` together
with a non-empty note unless the human asked for that combination: it
creates a "Waiting on me" board directive from the note text.

### Company base capacity (admin only, UI-only)

Changing the company-wide default happens in the Aura UI (capacity
settings). **Requires admin role and explicit user consent.**

## Typical workflow

1. Check current state: `readCapacity({ scope: "me" })`
2. Identify what needs to change (over-committed? new task? finishing one?)
3. Adjust: `updateTaskMemberCapacity` (and `updateTaskMemberParticipation`
   if your participation status changed)
4. Verify: `readCapacity({ scope: "me" })` again to confirm

## Key rules (summary)

- Commitments are real: "yes, 30%" means something
- Shifting capacity between tasks requires the affected owner's agreement
- Days off = 0%
- See [resources/process/capacity.md](../process/capacity.md) for the
  full capacity model
