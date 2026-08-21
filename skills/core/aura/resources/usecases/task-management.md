# Task Management

> **⚠️ Process compliance required.** When working with tasks — creating,
> updating, changing status, assigning roles, or managing capacity — you
> **must** follow the Aura development process. Read
> [resources/process/INDEX.md](../process/INDEX.md) before making any task
> changes. The process defines workflow gates, role responsibilities, and
> escalation paths that are not optional.

Aura tasks are hierarchical: SAGA → EPIC → STORY → SUBTASK. Each task has a
status workflow, owner/crew, tags, and can be linked to artifacts, repositories,
and other tasks.

## Task types

| Type | Purpose |
|---|---|
| `FEATURE` | New user-facing functionality |
| `BUG` | Something is broken and needs fixing |
| `IDEA` | A proposal or suggestion, not yet committed |
| `CHORE` | Maintenance, housekeeping, tooling, docs |
| `DISCOVERY` | Pure research/concept work, no implementation |

## Hierarchy levels

| Level | Purpose |
|---|---|
| `SAGA` | Cross-epic initiative, the biggest unit of work |
| `EPIC` | Multi-story effort within a saga |
| `STORY` | A single deliverable, typically user-facing |
| `SUBTASK` | Small scoped piece of a story, assigned to a contributor |

## Finding tasks

| Goal | Tool | Notes |
|---|---|---|
| By human key (e.g. AURA-42) | `getTaskByHumanKey` | Single call, preferred |
| By UUID | `getTask` | Returns planning hub with linked artifacts/uploads/questions |
| By Jira key | `getTaskByJiraKey` | For Jira-linked tasks |
| Search by description | `unifiedSearch` | `source_types: ["TASK"]` |
| List my tasks | `listTasks` | Filter by status, level, role, tags |
| Task neighborhood | `getTaskNeighborhood` | Local hierarchy view (ancestors to root, siblings, direct children); optional `depth` bounds the ancestor chain |

> **Note:** The project task tree is not available via MCP after
> the overhaul. Use `listProjects` (paginated; `archived` filter) to find a
> project and `getProject` (UUID) for its detail, then the REST endpoint
> `/projects/{uuid}/tasks` (GET) for the tree, or the Aura UI.

## Creating tasks

Use `createTask` (full param set available via MCP).

**Key fields:**
- `title` (required) — concise task title
- `description` — detailed description
- `type` — `FEATURE`, `BUG`, `IDEA`, `CHORE`, `DISCOVERY`
- `level` — `SAGA`, `EPIC`, `STORY`, `SUBTASK`
- `parent_task_id` — parent UUID for hierarchy placement
- `scope` — scope statement
- `tags` — array of `{ name, kind }` where kind is `AREA`, `PRODUCT`, `CONTEXT`, `TOPIC`
- `repository_ids` / `repository_uuids` — linked repos

**Best practices:**
1. **Search first** — `unifiedSearch({ query: "...", source_types: ["TASK"] })`
   to avoid duplicates.
2. **Set the right level** — SUBTASK for small units, STORY for user-facing
   features, EPIC for multi-story efforts, SAGA for cross-epic initiatives.
3. **Link repositories** when the task involves code changes.
4. **Add tags** for discoverability (`tags` field at create time or `attachTagToTask` later).

## Updating tasks

Use `updateTask` for status changes, level changes, reparenting, and field updates.

**Status flow:**
```
OPEN → READY_FOR_REFINEMENT → IN_REFINEMENT → READY_FOR_ALIGNMENT →
IN_ALIGNMENT → READY_FOR_DEVELOPMENT → IN_DEVELOPMENT →
READY_FOR_REVIEW → IN_REVIEW → READY_FOR_DEPLOYMENT →
IN_DEPLOYMENT → DONE
```

Tasks can also be `DISCARDED` (via `discardTask`, `reason` required) and
reopened (via `reopenTask`, `to_status` + `reason` required).

**Phase goals / deadlines:** Use `batchUpsertTaskPhaseGoals` to
atomically upsert (or clear) phase-goal rows for a task — each row gives a
work `phase`, a day-only `deadline`, and a free-text `goal_description`. A
row with `deadline: null` and an empty `goal_description` deletes that
phase goal. The target status must be part of the task's status series and
not already reached.

**Important notes:**
- Changing `level` (e.g. SUBTASK → STORY) usually requires setting
  `parent_task_id` in the same call to maintain valid hierarchy.
- Raising to SAGA or EPIC requires special capabilities.
- Always provide `status_change_reason` when changing status.

## Task relations

Use `createTaskRelation` to link tasks:

| Type | Meaning |
|---|---|
| `RELATES_TO` | General association |
| `PART_OF` | Composition (child → parent) |
| `BLOCKS` | This task blocks another |
| `DUPLICATES` | This task duplicates another |

## Tags

Tags help discoverability and grouping. Use `attachTagToTask` to attach a
tag by name (upsert-by-slug, idempotent) after creation, and `listTags` to
browse existing tags (paginated, with usage counts; `q` for prefix search).

## Phase goals / deadlines

See `batchUpsertTaskPhaseGoals` in the [Updating tasks](#updating-tasks)
section.

## Tracking progress

Use `recordTaskProgress` to log agent activity:

```
recordTaskProgress({
  uuid: "<task-uuid>",
  note: "Implemented authentication middleware",
  phase: "implement",
  step: "wave 2/3"
})
```

This appears in the Aura Timeline and never triggers notifications.

## Comments

Use `createComment` with `entity_type: "TASK"` to add comments. Set
`is_ai_generated: true` when posting as an agent. Use `listComments` to read
existing discussion. To @-mention people in a comment, first resolve
mention candidates with `listMentionCandidates` (pass `entity_type: "TASK"`
and the task `entity_id`; each candidate carries a `has_access` flag) and
include the handles in the comment body. To edit a comment's body or
mentions, use `updateComment` (author-only; keep `is_ai_generated: true` on
edits — the `mentioned_user_ids` array re-resolves @mentions). For broader
people-finding use `searchUsers` (min 2 chars, all authenticated users) or
`listUsers` (admin only, paginated).

## Owner and crew management

Owner/crew assignment is not available via MCP after the overhaul. Use the
Aura UI, or the REST endpoints in `openapi-new.yaml` (`/tasks/{uuid}/owner-search*`,
`/tasks/{uuid}/crew-search*`).
