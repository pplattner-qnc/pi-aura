# Workflow Phases

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "way-of-working-and-structures/1-2-workflow-phases" })`

## Status series

There is no single status chain. A task's series is resolved from its
hierarchy level and its workflow variant (`STANDARD` or `DISCOVERY`), which
is set at creation and immutable (changing it is a pending task, AURA-2335).

**Standard series (EPIC and STORY, `STANDARD` variant):**

```
OPEN → READY_FOR_REFINEMENT → IN_REFINEMENT →
IN_ALIGNMENT → READY_FOR_DEVELOPMENT → IN_DEVELOPMENT →
IN_REVIEW → READY_FOR_DEPLOYMENT → IN_DEPLOYMENT →
DONE
```

There are no waiting statuses before the gates: the standard series dropped
`READY_FOR_ALIGNMENT` and `READY_FOR_REVIEW` (AURA-2211). A task enters a
gate directly when its previous phase ends.

**Lean series (SAGA and SUBTASK):**

```
OPEN → READY_FOR_DEVELOPMENT → IN_DEVELOPMENT →
READY_FOR_REVIEW → IN_REVIEW → DONE
```

No refinement, alignment, or deployment: sagas and subtasks are sliced and
executed directly.

**Discovery series (EPIC and STORY, `DISCOVERY` variant):**

```
OPEN → READY_FOR_REFINEMENT → IN_REFINEMENT →
READY_FOR_ALIGNMENT → IN_ALIGNMENT → DONE
```

Pure discovery work has no development, review, or deployment: the series
ends after alignment.

**Terminal states:** a task can also be `DISCARDED` (via `discardTask`:
owner-only, from any non-terminal status, with a required reason; it ends
the Crew/Stakeholder memberships but keeps the member rows) and reopened
via `reopenTask` (from `DONE` or `DISCARDED` onto an owner-chosen `ACTIVE`
status of the task's series, reason required).

**Backward rework jumps** are a fixed set: `IN_ALIGNMENT` → `IN_REFINEMENT`,
`IN_DEVELOPMENT` → `IN_REFINEMENT`, `IN_REVIEW` → `IN_DEVELOPMENT`, and
`IN_REVIEW` → `IN_REFINEMENT`. Anything else that moves backward or skips a
phase needs a `status_change_reason`.

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
- **Expect changes**: significant requirements can still come in through
  Alignment.

### Alignment (the Alignment Gate)

- Owner has a solid first version of the plan.
- Plan goes to designated Stakeholders for sign-off.
- Choose the Stakeholder circle deliberately: start narrow, widen gradually.
- Set **concrete deadlines** on review requests.
- The Refinement-Alignment loop is normal: revise, re-submit, repeat.
- The Alignment Gate settles through the formal sign-off (see
  [Quality gates](#quality-gates) below).

### Development

- All Stakeholders approved. Plan is solid.
- **Natural Owner handover point**: concept person may hand off to
  implementer.
- Owner breaks work into Sub-Tasks for Contributors.
- Each Contributor knows their scoped piece.
- Use `recordTaskProgress` to log agent activity for the Timeline.

### Review (the Review Gate)

Three angles checked simultaneously:

1. **Functional**: does the result match the plan?
2. **Technical / Code Review**: consistent with architecture and conventions?
3. **QA**: acceptance criteria met? Tests pass?

**QA should be involved early** (ideally during Alignment) so test cases are
defined upfront.

Review Stakeholders are **Stakeholders, not Contributors**: this matters for
capacity accounting.

### Deployment → Done

- Review gate met → deploy, verify stability → Owner sets status to `DONE`.

## Quality gates

Since v18 the two gates are formal sign-off machinery, not informal
approvals:

- **The Alignment Gate** covers the move from `IN_ALIGNMENT` to
  `READY_FOR_DEVELOPMENT`.
- **The Review Gate** covers the move from `IN_REVIEW` to
  `READY_FOR_DEPLOYMENT`.

Each gate is settled by the disciplines a task needs (legal, security,
design, operations and so on, 37 in total). Every discipline gets a
per-gate check instruction in plain words, so it knows exactly what to
verify. A discipline's verdict is `APPROVED` or `REJECTED`; going on past a
rejection requires a reason (`status_change_reason` on `updateTask`).

Contributors can start the next phase themselves whenever a task is
waiting for it: refinement, development, alignment, and review (v19). The
exception is deployment, which stays a deliberate release decision.

## Changing status via MCP

```
updateTask({
  id: "<task-uuid>",
  status: "IN_DEVELOPMENT"
})
```

`updateTask` technically accepts any forward status of the task's series.
Walk **one status at a time** anyway: that is the calling discipline in
`engineering-foundation/guides/tracker-aura`, because a skipped status is a
one-way door and a gate only settles through its own sign-off.

`status_change_reason` is not needed when moving forward along the intended
path (e.g. `IN_DEVELOPMENT` → `IN_REVIEW`). It is **required to override a
disallowed status jump, or to leave a rejected quality gate**; the reason is
recorded for transparency. A refused status change saves nothing.

Agents never move a task past a gate on their own: present the gate state to
the user and let the sign-off happen (see [escalation.md](escalation.md)).
