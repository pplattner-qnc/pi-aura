# Workflow Phases

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "prozesse/how-we-work-in-aura-a-practical-guide" })`

## Status values

```
OPEN → READY_FOR_REFINEMENT → IN_REFINEMENT →
READY_FOR_ALIGNMENT → IN_ALIGNMENT →
READY_FOR_DEVELOPMENT → IN_DEVELOPMENT →
READY_FOR_REVIEW → IN_REVIEW →
READY_FOR_DEPLOYMENT → IN_DEPLOYMENT →
DONE
```

A task can also be `DISCARDED` (via `discardTask`) and reopened (via `reopenTask`).

## Phase details

### Open

- Task exists with a rough description and expected scope
- Leadership may have set a phase goal (e.g. "First version by [date]")
- No Owner assigned yet
- Task may appear on the **Looking for Owner** board

### Refinement

- **Owner enters here.** They understand what is expected and agree with the timeline.
- Work: clarify open questions, sharpen scope, develop implementation plan.
- Can be solo or team work.
- Stakeholders can be involved informally for early input.
- **Expect changes** — significant requirements can still come in through Alignment.

### Alignment

- Owner has a solid first version of the plan.
- Plan goes to designated Stakeholders for sign-off.
- **Gate:** All Alignment Stakeholders must approve before development starts.
- The Refinement–Alignment loop is normal — revise, re-submit, repeat.

**How to run Alignment well (as agent supporting an Owner):**
- Choose Stakeholder circle deliberately — start narrow, widen gradually.
- Set **concrete deadlines** on review requests.
- Typical stakeholder mapping: data privacy → Christian; SEO → Markus Abraham;
  tech architecture → Simon, Daniel, Marcel; functional → MAK, Arne, Nicole.

### Development

- All Stakeholders approved. Plan is solid.
- **Natural Owner handover point** — concept person may hand off to implementer.
- Owner breaks work into Sub-Tasks for Contributors.
- Each Contributor knows their scoped piece.
- Use `recordTaskProgress` to log agent activity for the Timeline.

### Review

Three angles checked simultaneously:

1. **Functional** — does the result match the plan?
2. **Technical / Code Review** — consistent with architecture and conventions?
3. **QA** — acceptance criteria met? Tests pass?

**QA should be involved early** (ideally during Alignment) so test cases are
defined upfront.

Review Stakeholders are **Stakeholders, not Contributors** — this matters for
capacity accounting.

### Deployment → Done

- Review gate met → deploy, verify stability → Owner sets status to `DONE`.

## Short variants

| Variant | Difference |
|---|---|
| **Discovery Stories** | No implementation. After Alignment → jump to Done. |
| **Sub-Tasks** | No Refinement or Alignment. Sliced and executed directly. |
| **Saga / Epic** | Simplified — not every phase applies at every level. |

## Changing status via MCP

```
updateTask({
  uuid: "<task-uuid>",
  status: "IN_DEVELOPMENT"
})
```

`status_change_reason` is **optional** when moving forward along the intended
workflow path (e.g. `IN_DEVELOPMENT` → `READY_FOR_REVIEW`). It is **required**
when skipping phases or moving backward (e.g. `IN_DEVELOPMENT` → `IN_REFINEMENT`)
— the reason is recorded in the activity log for transparency.
