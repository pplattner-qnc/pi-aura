# Capacity

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "prozesse/how-we-work-in-aura-a-practical-guide" })`

Capacity in Aura is a **real-time day-level snapshot**, not a rigid weekly plan.

## Base rules

| Hours worked on a given day | Task capacity |
|---|---|
| 8 h (full day) | 80% |
| 6 h | 60% |
| 4 h | 40% |
| Not working | 0% |

The remaining ~20% is structural reserve for reviews, alignment, ad-hoc calls,
and coordination. Roles with more leadership/review responsibility (QA, Dev Lead)
have a higher structural reserve.

## Key rules

1. **Commitments are real.** "Yes, 30%" is a commitment. Update when done.
2. **Shifting capacity between tasks requires Owner agreement.** No silent
   reprioritisation.
3. **Absence = 0%.** Aura accounts for vacation and public holidays automatically.
4. **Disagreements escalate** — direct manager → MAK.

## Relevant MCP tools

> **⚠️ Only adjust your own capacity.** Modifying another person's capacity
> commitment requires **explicit consent from the user** and is generally
> discouraged from an agent context — capacity is a personal commitment
> between the contributor and the task owner.

**Not available via MCP.** After the aura-mcp-dev overhaul (195 → 90 tools),
all capacity tools are gone from the MCP surface. Each of the following is
REST-ONLY — use the REST endpoints in `openapi-new.yaml` or the Aura UI:

| Action (REST-ONLY) | REST endpoint |
|---|---|
| Get my capacity — `getMyCapacity` (REST-ONLY) | `GET /capacity/me` |
| Get company base capacity — `getCapacitySettings` (REST-ONLY) | `GET /capacity/settings` |
| Update company base capacity — `updateCapacitySettings` (REST-ONLY) | `PATCH /capacity/settings` |
| Get member capacity (cross-task) — `getTaskMemberCapacity` (REST-ONLY) | `GET /tasks/{uuid}/members/{userIdOrUuid}/capacity` |
| Set member capacity commitment — `updateTaskMemberCapacity` (REST-ONLY) | `PATCH /tasks/{uuid}/members/{userIdOrUuid}/capacity` |
| Update participation status — `updateTaskMemberParticipation` (REST-ONLY) | `PATCH /tasks/{uuid}/members/{userIdOrUuid}/participation` |
| Leadership overview — `listLeadershipCapacity` (REST-ONLY) | `GET /capacity/leadership` |

For detailed usage examples and workflows, see
[resources/usecases/capacity-planning.md](../usecases/capacity-planning.md).
