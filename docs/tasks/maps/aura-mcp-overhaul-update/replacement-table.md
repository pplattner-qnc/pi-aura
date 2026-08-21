# Replacement table — aura-mcp-dev overhaul (195 → 90 tools)

> Canonical reference for the `aura-mcp-overhaul-update` map. Every tool name
> referenced in the pi-aura `skills/`, `agents/`, `scripts/src/`, and `README.md`
> is mapped to one of four dispositions. Source of truth: the **live**
> `aura-mcp-dev` MCP server (90 tools, build `440a2b2d…, 2026-08-21`, verified via
> `mcp connect aura-mcp-dev`) and `openapi-new.yaml` (provided 2026-08-21, repo
> root) for REST endpoints.

## Dispositions

- **PRESENT** — exact tool name exists on the live 90-tool MCP server. No change.
- **MERGED** — tool is gone from MCP but its capability moved into a surviving
  MCP tool. Use the named replacement.
- **REST-ONLY** — tool is gone from MCP and not absorbed; its REST endpoint
  still exists in `openapi-new.yaml` (path + `operationId` given). Use REST
  (or an `aura.mjs` subcommand wrapping REST).
- **REMOVED** — tool is gone from MCP **and** its REST endpoint is gone/renamed
  in `openapi-new.yaml`. (None found — the overhaul only shrank the MCP
  surface, not the REST API.)

## How to read

The `mcp*` agent-facing family was gutted. **Surviving `mcp*` tools (10):**
`mcpAnswerQuestion`, `mcpCreateArtifact`, `mcpCreateUploadDocument`,
`mcpGetKnowledgeDocument`, `mcpGetQuestion`, `mcpGetRepoDocument`,
`mcpGetUploadDocument`, `mcpLinkUploadToTask`, `mcpListCodeRepositories`,
`mcpUpdateArtifact`. Every other `mcp*` tool referenced in the docs is gone;
most fold into the matching base tool (which survived) or into `unifiedSearch`/
`searchKnowledge`.

---

## A. Referenced tools — PRESENT on live MCP (no change)

```
acceptArtifactMemory          createComment              createKnowledgeNode
createSkill                   createTask                 createTaskFromSignal
createTaskRelation            getArtifact                getArtifactVersion
getKnowledgeNode              getKnowledgeNodeByPath     getKnowledgeNodeVersion
getKnowledgeSpace             getKnowledgeTree           getMemoryEntitySource
getMyPriorityQueue            getSignal                  getSkill
getTaskByHumanKey             getTaskByJiraKey            linkArtifactToTask
listArtifacts                 listArtifactVersions       listComments
listKnowledgeFiles            listKnowledgeNodeVersions  listKnowledgeSpaces
listMemoryEntities            listSignals                listSkills
mcpAnswerQuestion             mcpCreateArtifact          mcpCreateUploadDocument
mcpGetKnowledgeDocument       mcpGetQuestion             mcpGetRepoDocument
mcpGetUploadDocument          mcpLinkUploadToTask        mcpListCodeRepositories
mcpUpdateArtifact             recordTaskProgress         reportMemoryEntityQuestion
restoreKnowledgeNodeVersion   reviewSignal               saveKnowledgeNodeBody
saveKnowledgeNodeFrontmatter  saveSkillBody              searchKnowledge
setSkillVisibility            unifiedSearch              updateKnowledgeNode
updateSkill                   updateTask
```

Notes:
- `getTaskByHumanKey` survives as its own MCP tool (NOT merged away). It is the
  dedicated resolver; `getTask` *also* accepts `human_key` now but `uuid`
  stays required. The fetcher's `callTool("getTaskByHumanKey", { key })` needs
  **no change**.
- `getArtifact` survives (replaces gone `mcpGetArtifact` for the agent).
- `getSkill` survives (replaces gone `mcpGetSkill`); note it takes `uuid` +
  optional `chatbot_code` + `response_format`.
- `unifiedSearch` survived and now supports the **full** source-type set
  (`TASK, UPLOAD_DOCUMENT, ARTIFACT, GLOSSARY, QUESTION, JIRA_ISSUE,
  KNOWLEDGE_DOCUMENT, SKILL, TEAMS_THREAD, CHAT_ASSERTION, ASANA_TASK, TOOL`).
  It absorbed the agent-facing `mcpUnifiedSearch` role entirely — the
  agent/full split in `unified-search.md` no longer exists.
- `searchKnowledge` survived and covers `mcpWikiSearch` (hybrid literal +
  semantic, `space_slug` filter).

## B. Referenced tools — MERGED into a surviving MCP tool

| Old name (gone) | Use instead | Notes |
|---|---|---|
| `mcpUnifiedSearch` | `unifiedSearch` | Now has the full source-type set (QUESTION, JIRA_ISSUE, etc. added). The `/mcp/search` REST route still exists but is **not** exposed as an MCP tool. |
| `mcpWikiSearch` | `searchKnowledge` | Same hybrid search; `space_slug` filter. `/mcp/wiki-search` REST route still exists, not as an MCP tool. |
| `mcpGetArtifact` | `getArtifact` | Base tool survived; `id` + optional `response_format`. |
| `mcpGetTask` | `getTask` | Base tool survived; `uuid` required, optional `human_key` + `response_format`. For key-based lookup prefer `getTaskByHumanKey`. |
| `mcpGetSkill` | `getSkill` | Base tool survived; `uuid` + optional `chatbot_code` + `response_format`. |
| `mcpCreateTask` | `createTask` | Base tool survived (full param set). |
| `mcpLinkArtifactToTask` | `linkArtifactToTask` | Base tool survived. |
| `mcpExpandGraph` | `listMemoryEntities` (partial) | Graph *expansion* (`getMemoryGraph`/`mcpExpandGraph`) has no MCP tool. `listMemoryEntities` gives the faceted entity list but not the anchor→depth expansion. See REST-ONLY. |

## C. Referenced tools — REST-ONLY (gone from MCP; REST endpoint in openapi-new.yaml)

| Old MCP tool (gone) | REST operationId | REST path | Method |
|---|---|---|---|
| **Capacity** ||||
| `getMyCapacity` | `getMyCapacity` | `/capacity/me` | GET |
| `getCapacitySettings` | `getCapacitySettings` | `/capacity/settings` | GET |
| `updateCapacitySettings` | `updateCapacitySettings` | `/capacity/settings` | (verify method) |
| `listLeadershipCapacity` | `listLeadershipCapacity` | `/capacity/leadership` | GET |
| `getTaskMemberCapacity` | `getTaskMemberCapacity` | `/tasks/{uuid}/members/{userIdOrUuid}/capacity` | GET |
| `updateTaskMemberCapacity` | `updateTaskMemberCapacity` | `/tasks/{uuid}/members/{userIdOrUuid}/capacity` | PATCH |
| `updateTaskMemberParticipation` | `updateTaskMemberParticipation` | `/tasks/{uuid}/members/{userIdOrUuid}/participation` | (verify) |
| **Board** ||||
| `getBoardBriefing` | `getBoardBriefing` | `/boards/briefing` | GET |
| `getBoardSummary` | `getBoardSummary` | `/boards` | GET |
| **Notifications** ||||
| `listNotifications` | `listNotifications` | `/notifications` | GET |
| `markAllNotificationsRead` | `markAllNotificationsRead` | `/notifications/read-all` | POST |
| (new) `markNotificationRead` | `markNotificationRead` | `/notifications/{id}/read` | POST |
| **Artifact review** ||||
| `getArtifactReview` | `getArtifactReview` | `/artifacts/{id}/review` | GET |
| `getArtifactApprovals` | `getArtifactApprovals` | `/artifacts/{id}/approvals` | GET |
| `requestArtifactReview` | `requestArtifactReview` | `/artifacts/{id}/review-request` | POST |
| `startArtifactReview` | `startArtifactReview` | `/artifacts/{id}/review-start` | POST |
| `submitArtifactDecision` | `submitArtifactDecision` | `/artifacts/{id}/decisions` | POST |
| `reopenArtifactReview` | `reopenArtifactReview` | `/artifacts/{id}/review-reopen` | POST |
| `cancelArtifactReview` | `cancelArtifactReview` | `/artifacts/{id}/review-cancel` | POST |
| `overrideArtifactReview` | `overrideArtifactReview` | `/artifacts/{id}/review-override` | POST |
| `getArtifactReviewPreview` | `getArtifactReviewPreview` | `/artifacts/{id}/review-preview` | GET |
| `addArtifactReviewer` | `addArtifactReviewer` | `/artifacts/{id}/review-reviewers` | POST |
| (new) remove reviewer | `removeArtifactReviewer` | `/artifacts/{id}/review-reviewers/{userId}` | (verify) |
| `getArtifactAccessOverview` | `getArtifactAccessOverview` | `/artifacts/{id}/access-overview` | GET |
| `grantArtifactAccess` | `grantArtifactAccess` | `/artifacts/{id}/grants` | (verify) |
| **Projects** ||||
| `getProjectTaskTree` | `getProjectTaskTree` | `/projects/{uuid}/tasks` | GET |
| **Owner / crew** ||||
| `applyForOwner` | `applyForOwner` | `/tasks/{uuid}/owner-search/applications` | POST |
| `applyAsCrew` | `applyAsCrew` | `/tasks/{uuid}/crew-search/apply` | POST |
| `inviteCrew` | `inviteCrew` | `/tasks/{uuid}/crew-search/invite` | POST |
| `startOwnerSearch` | `startOwnerSearch` | `/tasks/{uuid}/owner-search` | POST |
| `startCrewSearch` | `startCrewSearch` | `/tasks/{uuid}/crew-search` | POST |
| `endCrewSearch` | `endCrewSearch` | `/tasks/{uuid}/crew-search/end` | POST |
| `abortOwnerSearch` | `abortOwnerSearch` | `/tasks/{uuid}/owner-search/abort` | POST |
| `assignOwnerFromSearch` | `assignOwnerFromSearch` | `/tasks/{uuid}/owner-search/owner` | POST |
| `setTaskMemberRoles` | `setTaskMemberRoles` | `/tasks/{uuid}/members/{userIdOrUuid}/roles` | (verify) |
| `addTaskMember` | `addTaskMember` | `/tasks/{uuid}/members` | POST |
| `listLookingForOwnerTasks` | `listLookingForOwnerTasks` | `/tasks/looking-for-owner` | GET |
| `listLookingForCrewTasks` | `listLookingForCrewTasks` | `/tasks/looking-for-crew` | GET |
| (crew removal: propose/confirm/decline/override, respond, withdraw) | same-named operationIds | `/tasks/{uuid}/crew-search/removal/*`, `/respond`, `/withdraw` | various |
| **Jira / Asana linking** ||||
| `linkJiraIssueToTask` | `linkJiraIssueToTask` | `/tasks/{uuid}/jira-issues` | POST |
| `getTaskJiraIssueDraft` | `getTaskJiraIssueDraft` | `/tasks/{uuid}/jira-issues/draft` | GET |
| `getJiraIssue` | `getJiraIssue` | `/jira-issues/{cloudId}/{issueKey}` | GET |
| `listJiraIssues` | `listJiraIssues` | `/jira-issues` | GET |
| `triggerJiraSync` | `triggerJiraSync` | `/jira-issues/sync` | POST |
| `getAsanaStatus` | `getAsanaStatus` | `/integrations/asana/status` | GET |
| `confirmAsanaLink` | `confirmAsanaLink` | `/integrations/asana/link` | POST |
| **Memory graph** ||||
| `getMemoryGraph` | `getMemoryGraph` | `/memory/graph` | GET |
| `getMemoryMap` | `getMemoryMap` | `/memory/map` | GET |
| **Skills admin (import pipeline)** ||||
| `listSkillAssets` | (REST) | `/skills/{uuid}/assets` | GET |
| `listSkillPlugins` | (REST) | `/skills/plugins` | GET |
| `uploadSkillAsset` | (REST) | `/skills/{uuid}/assets` | POST |
| `validateSkillImport` | `validateSkillImport` | `/skills/import/validate` | POST |
| `confirmSkillImport` | `confirmSkillImport` | `/skills/import/confirm` | POST |
| `getSkillImportRun` | `getSkillImportRun` | `/skills/import/runs/{uuid}` | GET |
| `getActiveSkillImportRun` | `getActiveSkillImportRun` | `/skills/import/runs/active` | GET |
| **Wiki upload (file/image)** ||||
| `uploadKnowledgeFile` | (REST) | `/knowledge/nodes/{uuid}/file` | POST |
| `uploadKnowledgeNodeImage` | (REST) | `/knowledge/nodes/{uuid}/images` | POST |

> "(verify)" method = path confirmed + operationId present in `openapi-new.yaml`;
> the exact HTTP method wasn't printed in the batch check. The implementer
> should confirm the method from the spec before coding the REST call. All
> paths + operationIds above were confirmed present in `openapi-new.yaml`.

## D. Referenced tools — REMOVED (gone from MCP and REST)

None. The overhaul shrank the MCP tool surface only; every referenced
capability still has a REST endpoint in `openapi-new.yaml`.

---

## E. Live MCP tools NEVER referenced in the docs (coverage task input)

```
aiSetup                  attachTagToTask          batchUpsertTaskPhaseGoals
code_find_related        code_list_repositories  code_list_tree
code_read_file           code_search             createGlossaryEntry
createKnowledgeSpace     discardTask             getAsanaTask
getBlueprintFiles        getGlossaryEntry        getProject
getRepository            getTask                 getTaskNeighborhood
linkRepositoryToTask     listArtifactTasks       listAsanaTasks
listGlossaryEntries      listKnowledgeFileVersions listMentionCandidates
listPendingGlossaryEntries listProjects          listRepositories
listTags                 listTaskActivity         listTasks
listUsers                reopenTask              searchUsers
systemHealth             updateComment           updateGlossaryEntry
updateKnowledgeSpace
```

Per the map: document those that fit existing resource workflows
(tags, phase goals, neighborhood, discard/reopen, projects, people-finding,
comment-update, knowledge-space admin, Asana read, glossary).
`aiSetup`/`getBlueprintFiles`/`systemHealth` are **out of scope**
(one-time admin/bootstrap).

Note: `getTask` is in this list because the docs only ever referenced
`getTaskByHumanKey`/`mcpGetTask`; `getTask` itself was never named — the
coverage task should cross-reference it where `getTaskByHumanKey` appears.
`code_*` tools are in this list because `code-search.md` references them, but
the grep pattern matched `code_list_repositories` etc. — they ARE documented;
treat as already-covered (verify during coverage task).

---

## Impact on dependents

- **skill-doc-mcp-cleanup** — uses sections A/B/C. Replace every old name in B
  with its surviving tool; replace every name in C with the agreed replacement
  (`aura.mjs` subcommand for review-flow + capacity reads; REST/UI note for
  owner/crew, Jira/Asana, notifications-write, memory-graph, skills-admin,
  wiki-upload). Section A names stay.
- **review-flow-mcp-gap** — section C (artifact review + capacity rows) is the
  workload. All REST endpoints confirmed.
- **fetcher-rest-fallout** — section C (board, notifications, capacity,
  `getArtifactReview`, `getArtifactApprovals`, `markAllNotificationsRead`) is
  the workload. All REST endpoints confirmed; `getTaskByHumanKey`,
  `getMyPriorityQueue`, `listTasks`, `listArtifacts` stay on MCP (section A).
- **new-tool-coverage** — section E is the workload.

## Confidence

High. Live tool list verified twice (two `mcp` server listings, both 90 tools,
identical names). Every REST-ONLY row's path + operationId confirmed present
in `openapi-new.yaml`. MERGED rows confirmed via `mcp describe` (surviving
tool's parameters cover the old call). Open questions: exact HTTP methods for
a handful of REST-ONLY rows marked "(verify)" — non-blocking for docs, resolve
when coding the REST calls.

## Unresolved questions

- Exact HTTP methods for `updateCapacitySettings`,
  `updateTaskMemberParticipation`, `setTaskMemberRoles`, `grantArtifactAccess`,
  `removeArtifactReviewer` (paths + operationIds confirmed; methods not
  printed in the batch check). Verify in `openapi-new.yaml` during the
  review-flow/fetcher implementation.
- Whether the fetcher should call `/mcp/search` + `/mcp/wiki-search` REST
  routes (which exist) or use the `unifiedSearch`/`searchKnowledge` MCP tools.
  Recommendation: use the MCP tools (cleaner, already typed) — the fetcher
  already uses `bearerClient` for MCP.
