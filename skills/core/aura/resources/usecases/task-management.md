# Task Management

> **⚠️ Process compliance required.** When working with tasks (creating,
> updating, changing status, assigning roles, or managing capacity) you
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
| By UUID | `getTask` | Full detail including the member list; `response_format: "full"` returns the planning hub (linked artifacts, uploads, questions, relations, phase goals) |
| By Jira key | `getTaskByJiraKey` | For Jira-linked tasks |
| Search by description | `unifiedSearch` | `source_types: ["TASK"]` |
| List my tasks | `listTasks` | Filter by status, level, role, tags |
| My priority order | `getMyPriorityQueue` | The caller's derived work order over active core-role memberships (ASAP first, then the depth-first walk of the ranked tree); optional `limit` bounds the items |
| Task neighborhood | `getTaskNeighborhood` | Local hierarchy view (ancestors to root, siblings, direct children); optional `depth` bounds the ancestor chain |

> **Note:** The project task tree is not available via MCP after
> the overhaul. Use `listProjects` (paginated; `archived` filter) to find a
> project and `getProject` (UUID) for its detail, or browse the tree in
> the Aura UI.

## Creating tasks

Use `createTask` (full param set available via MCP).

**Key fields:**
- `title` (required): concise task title
- `description`: detailed description
- `type`: `FEATURE`, `BUG`, `IDEA`, `CHORE`, `DISCOVERY`
- `level`: `SAGA`, `EPIC`, `STORY`, `SUBTASK` (derived from the parent when `parent_task_id` is set; SUBTASK always needs a parent)
- `parent_task_id`: parent UUID for hierarchy placement
- `scope`: scope statement
- `tags`: up to three; array of `{ name, kind }` where kind is `AREA`, `PRODUCT`, `CONTEXT`, `TOPIC` (defaults to TOPIC)
- `repository_ids`: linked repos (unknown UUIDs are skipped)
- `workflow_variant`: `STANDARD` | `DISCOVERY`; DISCOVERY switches the task onto the exploratory status series (only valid for EPIC and STORY)

**Best practices:**
1. **Search first**: `unifiedSearch({ query: "...", source_types: ["TASK"] })`
   to avoid duplicates.
2. **Set the right level**: SUBTASK for small units, STORY for user-facing
   features, EPIC for multi-story efforts, SAGA for cross-epic initiatives.
3. **Link repositories** when the task involves code changes (`repository_ids`
   at create time, or `linkRepositoryToTask` later).
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

**Blocked flag:** `updateTaskBlocked({ id, blocked })` sets or clears the
orthogonal blocked flag without changing the workflow status. Call it only
when a human explicitly asks you to mark the task blocked or unblocked,
never because you yourself cannot continue. A `reason` (max 2000 chars) is
required when setting `blocked: true` unless the task is already blocked;
clearing needs no reason.

**Phase goals / deadlines:** Use `batchUpsertTaskPhaseGoals` to
atomically upsert (or clear) phase-goal rows for a task; each row gives a
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

Duplicate `(from, to, type)` relations are rejected with 409; pass
`on_duplicate: "noop"` to return the existing relation instead.

## Tags

Tags help discoverability and grouping. Use `attachTagToTask` to attach a
tag by name (upsert-by-slug, idempotent) after creation, and `listTags` to
browse existing tags (paginated, with usage counts; `q` for prefix search).

## Owner and crew management

Member and role assignment is on MCP. Roles are `OWNER` | `CONTRIBUTOR` |
`STAKEHOLDER`:

```
addTaskMember({ id: "<task-uuid>", user_id: "<user-uuid>", roles: ["CONTRIBUTOR"] })
setTaskMemberRoles({ id: "<task-uuid>", user_id: "<user-uuid>", roles: ["OWNER", "CONTRIBUTOR"] })
```

- `addTaskMember` adds a member; the optional `roles` are the initial role
  set (replace semantics). Leave it unset to add the member roleless.
- `setTaskMemberRoles` replaces all of a member's roles (idempotent
  set-replace). It returns 409 if the replacement would remove the last
  owner; assign another owner first or start an owner search.
- A core-team member's capacity commitment and participation are set with
  `updateTaskMemberCapacity` and `updateTaskMemberParticipation` (see the
  [capacity planning](capacity-planning.md) use case).

## Story points

Story points are AI-assisted estimates for Stories and Sub-Tasks; a human
correction always outranks the AI estimate.

- `estimateTaskStoryPoints({ id })` runs the STORY_POINT_ESTIMATE agent once
  and appends an AI history row (including a reasoned refusal).
- `listTaskStoryPointEstimates({ id })` reads the append-only estimate
  history, newest first (read access is enough).
- `acceptTaskStoryPointEstimate({ id, tool_call_id })` writes the estimate a
  chat proposal created; it answers 409 `HUMAN_OVERRIDE` when a human
  correction is in effect.
- `setTaskStoryPoints({ id, key, origin, rationale })` is the human
  correction: `key` null withdraws it so the latest AI estimate with a
  value becomes effective again, and `origin: "AI"` records a proposal
  accepted unchanged (it keeps the human-first precedence). The rationale
  is mandatory for an AI-origin write.

## Tracking progress

Use `recordTaskProgress` to log agent activity:

```
recordTaskProgress({
  id: "<task-uuid>",
  note: "Implemented authentication middleware",
  phase: "implement",
  step: "wave 2/3"
})
```

This appears in the Aura Timeline and never triggers notifications. Your
own progress notes across tasks are readable with `listMyProgress` (latest
note per task by default, `latest_per_task: false` for every note;
`since` and `limit`, max 100, bound the window).

## Activity

`listTaskActivity({ id })` returns a task's activity events, paginated and
newest first (task membership required). `include_automatic: false` omits
automatic events, `type` restricts to one activity code (e.g.
`"task.status_changed"`), and `actor_id` to one actor.

## Comments

Use `createComment` with `entity_type: "TASK"` to add comments. Set
`is_ai_generated: true` when posting as an agent. Use `listComments` to read
existing discussion (flat, no threading). To @-mention people in a comment,
first resolve mention candidates with `listMentionCandidates` (pass
`entity_type: "TASK"` and the task `entity_id`; each candidate carries a
`has_access` flag) and include the handles in the comment body. To edit a
comment's body or mentions, use `updateComment` (author-only; keep
`is_ai_generated: true` on edits: the `mentioned_user_ids` array
re-resolves @mentions). For broader people-finding use `searchUsers` (min 2
chars, all authenticated users) or `listUsers` (admin only, paginated).

## User groups

User groups are Leadership/Admin-managed (MANAGE_USER_GROUPS) groups with
`LEAD` | `MEMBER` roles. A group grants no permissions itself; it is the
unit `readCapacity` scope "group" reads (see the
[capacity planning](capacity-planning.md) use case).

```
createUserGroup({ name: "Platform", description: "..." })
listUserGroups({ q: "platform" })          // paginated; sort_by name | member_count | created_at
getUserGroup({ id: "<group-uuid>" })       // detail including members
addUserGroupMember({ id: "<group-uuid>", user_id: "<user-uuid>", role: "MEMBER" })
updateUserGroupMemberRole({ id: "<group-uuid>", user_id: "<user-uuid>", role: "LEAD" })
updateUserGroup({ id: "<group-uuid>", name: "Platform Team" })
```

`addUserGroupMember` rejects duplicates with 409;
`updateUserGroupMemberRole` allows multiple leads.

## Repository linking

```
linkRepositoryToTask({ id: "<task-uuid>", repository_id: "<repo-uuid>" })
```

Links a repository to a task after creation (idempotent; a repeat call
returns 200). The optional `branch` is stored on the link, updated on a
later call, and cleared with `branch: null`.
