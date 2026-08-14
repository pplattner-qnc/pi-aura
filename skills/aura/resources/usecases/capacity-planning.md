# Capacity Planning

How to check and adjust capacity commitments in Aura via MCP tools. For the
process rules (how capacity works, base percentages, commitment etiquette),
see [resources/process/capacity.md](../process/capacity.md).

> **⚠️ Only adjust your own capacity.** Modifying another person's capacity
> commitment requires **explicit consent from the user** and is generally
> discouraged from an agent context — capacity is a personal commitment
> between the contributor and the task owner.

## Checking capacity

### Your own capacity

```
getMyCapacity()
```

Returns base capacity, committed, free, utilization, and per-task commitments.

### A specific task's member capacity

```
getTaskMemberCapacity({ uuid: "<task-uuid>" })
```

Cross-task view of all members' capacity on a given task.

### Leadership overview (admin/leadership only)

```
listLeadershipCapacity({ limit: 20, page: 1 })
```

Paginated overview of all team members' capacity.

### Company base capacity

```
getCapacitySettings()
```

Returns the company-wide base capacity percentage (e.g. 80%).

## Adjusting capacity

### Your commitment on a task

```
updateTaskMemberCapacity({
  uuid: "<task-uuid>",
  capacity_percent: 30
})
```

Sets your capacity commitment for a specific task. Remember: this is a real
commitment — see [resources/process/capacity.md](../process/capacity.md) for
the rules on base capacity, structural reserve, and shifting between tasks.

### Participation status

```
updateTaskMemberParticipation({
  uuid: "<task-uuid>",
  status: "ACTIVE"     // ACTIVE | WAITING | OBSERVING
})
```

Updates your participation status on a task.

### Company base capacity (admin only)

```
updateCapacitySettings({ base_percent: 80 })
```

Changes the company-wide default. **Requires admin role and explicit user
consent.**

## Typical workflow

1. Check current state: `getMyCapacity()`
2. Identify what needs to change (over-committed? new task? finishing one?)
3. Adjust: `updateTaskMemberCapacity({ uuid, capacity_percent })`
4. Verify: `getMyCapacity()` again to confirm

## Key rules (summary)

- Full day (8h) = 80% task capacity, 20% structural reserve
- Commitments are real — "yes, 30%" means something
- Shifting capacity between tasks requires the affected owner's agreement
- Days off = 0%
- See [resources/process/capacity.md](../process/capacity.md) for full details
