# Escalation

> **🚨 NEVER escalate autonomously.** Every single escalation, whether it's
> flagging a blocker, contacting a manager, or escalating to MAK, requires
> **explicit consent from the user for that specific instance**. Do not
> escalate on your own initiative, even if the situation clearly calls for
> it. Present the situation to the user, recommend escalation, and wait for
> their explicit approval before taking any escalation action.

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "way-of-working-and-structures/1-4-alignment-review-escalation" })`

**Escalation is not failure.** The process is designed so that escalations
surface quickly. Escalate early, not late.

**The starting point is always the state of the task, not a judgment of a person.**
When work stalls, work the state: talk first, then coaching and
support, then reassign the owner if needed. Each step is a
transparent transition, visible in Aura.

## Escalation path

```
Direct manager → MAK
```

## When to escalate

| Situation | Action |
|---|---|
| Owner is blocked | Escalate to direct manager |
| Stakeholder not responding | Escalate to direct manager |
| Owner/Contributor can't agree on capacity | Escalate → direct manager → MAK |
| Task overdue or stuck | Leadership reviews it with the Owner (with deliberate lead time) |
| Handover needed | An active handshake, not just a status-field change (see [roles.md](roles.md)) |
| Priority conflict between tasks | Escalate to Leadership: do not absorb silently |
| Systematically not getting reviews done | Escalate to your manager; if unresolved → MAK |
| Conflict you cannot resolve | Escalate → direct manager → MAK |

## Agent guidance

When an agent detects a blocker or conflict during task work:

1. **Record the blocker** via `recordTaskProgress` with a note describing
   the blocker.
2. **Present the situation to the user.** Explain what's blocked, why, and
   what the escalation options are. **Do not take any escalation action
   without explicit user consent.**
3. **Only after explicit approval**, flag it in a comment on the task with
   `createComment`, `is_ai_generated: true`, mentioning the relevant people.
4. **Do not silently work around** process gates or ignore conflicts, but
   also do not escalate without being told to.
