# Integrations — Aura, JIRA, Asana

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "prozesse/how-we-work-in-aura-a-practical-guide" })`

## Hierarchy

```
Aura (source of truth)
 ├── JIRA (mirrors engineering level)
 └── Asana (mirrors portfolio level)
```

## Rules

1. **Aura first.** All tasks land in Aura for prioritisation, staffing, and
   tracking — regardless of origin (customer feedback, IT support, company goals).
2. **Aura is the source of truth.** Full task hierarchy, workflow status,
   roles, plans, and decisions live in Aura.
3. **JIRA mirrors engineering.** Aura has a converter to bring JIRA tasks in
   and push updates back. Development happens in JIRA; status syncs to Aura.
   **Aura wins on conflict.**
4. **Asana mirrors portfolio** for Leadership and Stakeholders not yet fully
   in Aura. Sync is in progress.

## Agent guidance

- **Always work in Aura.** Use Aura MCP tools for task management, comments,
  and status updates.
- **Reference JIRA issues** when they exist — use `getTaskByJiraKey` to look
  up an Aura task by its Jira key.
- **Do not create tasks in JIRA or Asana directly** — create them in Aura
  and let the sync handle propagation.
- **When a task comes from JIRA**, bring it into Aura via the REST endpoint
  `/tasks/{uuid}/jira-issues` (see `openapi-new.yaml`), then manage it in Aura
  going forward.

## Relevant MCP tools

`getTaskByJiraKey` survives for Jira key lookup. Jira/Asana **linking** is
not available via MCP after the overhaul — the linking tools
(`getAsanaStatus`/`confirmAsanaLink`) are gone (REST-ONLY); use the REST
endpoints in `openapi-new.yaml` (`/tasks/{uuid}/jira-issues*`, `/jira-issues`,
`/integrations/asana/*`) or the Aura UI. Asana task **read**, however, is now
exposed via two MCP tools that read the locally-mirrored Asana task rows (no
Asana account required):

| Action | Tool | Notes |
|---|---|---|
| Get task by Jira key | `getTaskByJiraKey` | Surviving PRESENT tool |
| List mirrored Asana tasks | `listAsanaTasks` | Paginated list of locally mirrored Asana task rows (resourceKind TASK; project/Saga rows excluded). Params: `page`, `limit`, `q` (contains search across name+gid), `sort_by` (`AsanaTaskSortField`), `sort_dir`, `project_gid` filter, `completed` (default false — pass true to include completed), `gid` (exact gid match for deep-link resolution), `level` (repeatable `AsanaTaskLevel`: EPIC/STORY/SUBTASK) |
| Get a mirrored Asana task | `getAsanaTask` | Full detail of a single locally mirrored Asana task, addressed by `gid` (path param). Project rows (Sagas) are not exposed (404). No Asana account required |
