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
- **Reference JIRA issues** when they exist — use `getJiraIssue`,
  `getTaskByJiraKey`, or `linkJiraIssueToTask` to work with Jira-linked tasks.
- **Do not create tasks in JIRA or Asana directly** — create them in Aura
  and let the sync handle propagation.
- **When a task comes from JIRA**, use the converter (`linkJiraIssueToTask`)
  to bring it into Aura, then manage it in Aura going forward.

## Relevant MCP tools

| Action | Tool |
|---|---|
| Get Jira issue detail | `getJiraIssue` |
| List Jira issues | `listJiraIssues` |
| Get task by Jira key | `getTaskByJiraKey` |
| Link Jira issue to task | `linkJiraIssueToTask` |
| Preview Jira issue draft | `getTaskJiraIssueDraft` |
| Trigger Jira sync | `triggerJiraSync` (admin) |
| Check Asana connection | `getAsanaStatus` |
| Confirm Asana link | `confirmAsanaLink` |
