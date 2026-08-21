# Capacity Planning

How to check and adjust capacity commitments in Aura. **All capacity
capabilities are REST-ONLY after the MCP overhaul** — none of the capacity
MCP tools are available via the live aura-mcp-dev server. Use the REST
endpoints in `openapi-new.yaml` or the Aura UI. For the process rules (how
capacity works, base percentages, commitment etiquette), see
[resources/process/capacity.md](../process/capacity.md).

> **⚠️ Only adjust your own capacity.** Modifying another person's capacity
> commitment requires **explicit consent from the user** and is generally
> discouraged from an agent context — capacity is a personal commitment
> between the contributor and the task owner.

> **Not available via MCP.** After the aura-mcp-dev overhaul (195 → 90
> tools), every capacity tool is gone from the MCP surface. The REST
> endpoints still exist in `openapi-new.yaml`. Use `REST /…` (via a REST
> client or `aura.mjs`) or the Aura UI instead.

## Checking capacity

### Your own capacity

`getMyCapacity` is not available via MCP — use REST:

```
GET /capacity/me
```

Returns base capacity, committed, free, utilization, and per-task commitments.

### A specific task's member capacity

`getTaskMemberCapacity` is not available via MCP — use REST:

```
GET /tasks/{uuid}/members/{userIdOrUuid}/capacity
```

Cross-task view of all members' capacity on a given task.

### Leadership overview (admin/leadership only)

`listLeadershipCapacity` is not available via MCP — use REST:

```
GET /capacity/leadership
```

Paginated overview of all team members' capacity.

### Company base capacity

`getCapacitySettings` is not available via MCP — use REST:

```
GET /capacity/settings
```

Returns the company-wide base capacity percentage (e.g. 80%).

## Adjusting capacity

### Your commitment on a task

`updateTaskMemberCapacity` is not available via MCP — use REST:

```
PATCH /tasks/{uuid}/members/{userIdOrUuid}/capacity
  { "capacity_percent": 30 }
```

Sets your capacity commitment for a specific task. Remember: this is a real
commitment — see [resources/process/capacity.md](../process/capacity.md) for
the rules on base capacity, structural reserve, and shifting between tasks.

### Participation status

`updateTaskMemberParticipation` is not available via MCP — use REST:

```
PATCH /tasks/{uuid}/members/{userIdOrUuid}/participation
  { "status": "ACTIVE" }   // ACTIVE | WAITING | OBSERVING
```

Updates your participation status on a task.

### Company base capacity (admin only)

`updateCapacitySettings` is not available via MCP — use REST:

```
PATCH /capacity/settings
  { "base_percent": 80 }
```

Changes the company-wide default. **Requires admin role and explicit user
consent.**

## Typical workflow

> The steps below previously called `getMyCapacity` (not available via MCP)
> and `updateTaskMemberCapacity` (not available via MCP) as MCP tools.
> These are now REST/UI, not MCP — use the REST endpoints above or the
> Aura UI.

1. Check current state: `GET /capacity/me` (REST) — not available via MCP
2. Identify what needs to change (over-committed? new task? finishing one?)
3. Adjust: `PATCH /tasks/{uuid}/members/{userIdOrUuid}/capacity` (REST) — not available via MCP
4. Verify: `GET /capacity/me` again to confirm

## Key rules (summary)

- Full day (8h) = 80% task capacity, 20% structural reserve
- Commitments are real — "yes, 30%" means something
- Shifting capacity between tasks requires the affected owner's agreement
- Days off = 0%
- See [resources/process/capacity.md](../process/capacity.md) for full details
