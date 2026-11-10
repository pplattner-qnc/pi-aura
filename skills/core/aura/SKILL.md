---
name: aura
description: Work with Aura, the AI-native project management and knowledge platform. Use when the user mentions Aura, tasks, artifacts, wiki, knowledge base, or project planning in the context of the aura-mcp-dev MCP server.
---

# Aura MCP

Aura is an AI-native project management and knowledge platform. It combines task
management, documentation (artifacts), a wiki/knowledge base, code search, and
organizational memory into a single system. The `aura-mcp-dev` MCP server exposes
120 tools for interacting with all of these capabilities (live build 2026-10-12,
commit 4aa37833; every claim below is checked against that build).

## What Aura can do

- **Task management**: hierarchical tasks (SAGA → EPIC → STORY → SUBTASK) with
  status workflows, owner/crew assignment, priority ordering, capacity tracking,
  and relations between tasks (blocks, relates-to, part-of, duplicates)
- **Artifacts**: versioned Markdown documents (plans, opinions, generic docs)
  with versioning, the opinion flow, and access control
- **Knowledge base / Wiki**: hierarchical knowledge spaces with folders, files,
  and documents, supporting full-text + semantic search, versioning, restore,
  and images
- **Code search**: semantic and BM25 search across allowlisted Bitbucket
  repositories, with file reading and related-chunk discovery
- **Unified search**: cross-entity semantic search across tasks, artifacts,
  knowledge documents, skills, glossary entries, Jira issues, and more
- **Memory / Knowledge graph**: entity-relationship graph connecting products,
  services, people, tasks, and concepts with confidence-scored edges, plus
  aura-native memory ingest from artifacts
- **Signals**: inbound planning signals that can be triaged into tasks
- **Skills**: reusable skill documents organized in plugins
- **Glossary**: shared vocabulary with proposal/approval workflow:
  - `createGlossaryEntry`: create an entry with `term`, `definition`, `category` (`ACRONYM`/`DOMAIN_CONCEPT`/`PRODUCT`/`PROCESS`), optional `language` (`DE`/`EN`), `aliases`, `source`; triggers embedding on create.
  - `getGlossaryEntry`: fetch a single entry by `uuid`.
  - `listGlossaryEntries`: paginated list (all authenticated users); `q` search, `category` filter, `sort_by` (`term`/`category`/`created_at`/`updated_at`).
  - `updateGlossaryEntry`: update `term`/`definition`/`category`/`language`/`aliases`/`source` by `uuid`; re-embeds the entry.
  - `listPendingGlossaryEntries`: list entries awaiting review (admin-only, `MANAGE_GLOSSARY` capability; `PENDING` entries are never embedded/searchable until approved).
- **Roadmap goals**: dated goals with owners and manual progress, time-window
  queries, closure verdicts, and a drafted-then-confirmed update flow
  (Leadership/Admin create)
- **Story points**: AI-assisted estimates for Stories and Sub-Tasks; a human
  correction always outranks the AI estimate (see the task-management use case)
- **User groups**: Leadership/Admin-managed groups with LEAD/MEMBER roles (the
  groups `readCapacity` scope=group reads)
- **Projects and tags**: project detail with linked repositories; tags with
  usage counts that attach to tasks by slug
- **Notifications**: per-user preference matrix and notification inbox (no MCP
  tool; see the scorecard below)
- **Capacity**: team capacity tracking and leadership overview (live on MCP
  again; see the scorecard below)
- **Comments**: flat comments on tasks and artifacts with mentions
- **System**: `systemHealth` reports process uptime and the build identity

## Common use cases

Detailed instructions for each use case are in the referenced resource files.

| Use case | Resource file |
|---|---|
| Search across Aura (unified search) | [resources/usecases/unified-search.md](resources/usecases/unified-search.md) |
| Manage tasks (create, update, track, organize) | [resources/usecases/task-management.md](resources/usecases/task-management.md) |
| Manage artifacts (create, update, review) | [resources/usecases/artifact-management.md](resources/usecases/artifact-management.md) |
| Search and browse the wiki / knowledge base | [resources/usecases/wiki-knowledge.md](resources/usecases/wiki-knowledge.md) |
| Search and read code in Bitbucket repos | [resources/usecases/code-search.md](resources/usecases/code-search.md) |
| Upload documents and link them to tasks | [resources/usecases/upload-documents.md](resources/usecases/upload-documents.md) |
| Check and adjust capacity commitments | [resources/usecases/capacity-planning.md](resources/usecases/capacity-planning.md) |
| Answer questions directed at you | [resources/usecases/questions-workflow.md](resources/usecases/questions-workflow.md) |
| Explore the memory / knowledge graph | [resources/usecases/memory-graph.md](resources/usecases/memory-graph.md) |
| Triage signals into tasks | [resources/usecases/signals.md](resources/usecases/signals.md) |
| Manage skills in Aura | [resources/usecases/skills-management.md](resources/usecases/skills-management.md) |
| Submit feedback about Aura itself | [resources/usecases/feedback-submission.md](resources/usecases/feedback-submission.md) |

## Development process

Aura's workflow runs on a level- and variant-resolved status series with
defined roles, capacity rules, and quality gates. The process resources encode
this knowledge for agents:

| Topic | Resource file |
|---|---|
| Process overview and key principles | [resources/process/INDEX.md](resources/process/INDEX.md) |
| Workflow phases in detail | [resources/process/workflow-phases.md](resources/process/workflow-phases.md) |
| Roles (Owner, Contributor, Stakeholder) | [resources/process/roles.md](resources/process/roles.md) |
| Capacity tracking | [resources/process/capacity.md](resources/process/capacity.md) |
| Review modes | [resources/process/review-modes.md](resources/process/review-modes.md) |
| Escalation paths | [resources/process/escalation.md](resources/process/escalation.md) |
| Aura/JIRA/Asana integration | [resources/process/integrations.md](resources/process/integrations.md) |

## How to interact with the Aura MCP

In pi's tool list every tool carries the `mcp__aura_mcp_dev__` prefix; this
page lists the short names. There are two families:

1. **`mcp*` tools**: agent-facing tools designed for MCP clients. These use
   the caller's PAT for authentication and are the primary interface for
   agent workflows. All **10 `mcp*` tools** on the live 120-tool server:
   - `mcpAnswerQuestion`: answer a question directed at you.
   - `mcpCreateArtifact`: create a new artifact (PLAN, OPINION, or GENERIC;
     chat-only TEMPORARY is created by the chat, not by tools).
   - `mcpCreateUploadDocument`: ingest a file from base64 content (maximum
     10 MB per request).
   - `mcpGetKnowledgeDocument`: fetch a knowledge-base document.
   - `mcpGetQuestion`: fetch a question directed at you.
   - `mcpGetRepoDocument`: fetch a repository document.
   - `mcpGetUploadDocument`: fetch an uploaded document.
   - `mcpLinkUploadToTask`: link an uploaded document to a task.
   - `mcpListCodeRepositories`: list the repositories with code search enabled.
   - `mcpUpdateArtifact`: update an artifact body in `section` or `whole` mode
     (limits: 50,000 characters section, 200,000 whole; `expected_version` is
     the merge base your content derives from, and a destructive whole-body
     replace needs `confirm_full_replace`).

2. **All other tools**: the full Aura surface beyond the `mcp*` entry points,
   including admin operations, board views, capacity, and user management.
   These are equally available and useful for broader workflows.

### Response format

Read tools default to a **compact** payload (identity and status). Pass
`response_format: "detail"` for the working view on the tools that declare it
(description, members, ancestors, allowed next statuses). Pass
`response_format: "full"` on `getTask` and `getTaskByHumanKey` for every field
except the classified exclusions.

The tiering is MCP-only; it is not part of the HTTP API. The permission
apparatus (`access_overview`, `inherited_members`, `broad_access`,
`access_grants`, `viewer_access`, `viewer_can_*`, `viewer_has_*`, and kin) is
excluded from every tier; the same PAT reaches those fields through REST.

### Capability scorecard

MCP is the primary access path, and the capabilities the docs once called lost
are back on it, fully or partly. Where something is not on MCP, use the Aura
UI; do not fall back to hand-crafted API calls.

**Back on MCP:**

- **Capacity**: `readCapacity` (scopes me, person, group, company),
  `updateTaskMemberCapacity` (set, change, or remove a core-team member's
  commitment), `updateTaskMemberParticipation` (participation note and status)
- **Board**: `getBoardSummary` (personal attention projections: waiting on me,
  waiting on others, overdue)
- **Owner and crew search**: `searchUsers` (picker search by display name or
  email), `listUsers` (admin-only full listing)

**Half back (the read side lives, the write side does not):**

- **Jira and Asana reads**: `getTaskByJiraKey` resolves a task by its linked
  Jira issue key; `getAsanaTask` and `listAsanaTasks` read the locally
  mirrored Asana rows (no Asana account required). No MCP tool creates or
  updates a link; manage links in the Aura UI.
- **Wiki file reads**: `listKnowledgeFiles` and `listKnowledgeFileVersions`
  (asset metadata and per-version history). Uploading files into a knowledge
  space stays out of MCP (see below).
- **Memory browse plus ingest**: `listMemoryEntities` (faceted, paginated
  browsing), `getMemoryEntitySource` (a navigable source route), and
  `acceptArtifactMemory` (aura-native ingest from an artifact). No MCP tool
  writes entities or edges directly.

**Still absent (use the Aura UI):**

- **Notification writes**: no notification tool exists on MCP at all;
  `getBoardSummary` explicitly excludes notifications.
- **The opinion flow beyond its listing filter**: reviews became opinions; on
  MCP the flow is visible only as the `opinion_requested` filter on
  `listArtifacts`. Manage opinions in the Aura UI.
- **Skills import**: the skills tools cover create, read, update, body saves,
  and visibility, with no import or export pipeline.
- **Wiki upload**: knowledge-space files cannot be created via MCP; upload
  them in the Aura UI.

### Key patterns

- **Always search first** before creating tasks or artifacts to avoid duplicates.
  Use `unifiedSearch` (cross-entity) or `searchKnowledge` (wiki/knowledge base)
  with relevant source types.
- **Use human keys** (e.g. `AURA-42`) to reference tasks when possible;
  `getTaskByHumanKey` resolves them in a single call.
- **Mind the response tiers**: a default read returns the compact payload; when
  a result feels too thin, pass `response_format: "detail"` (on the tools that
  declare it) or `"full"` on `getTask` / `getTaskByHumanKey` before concluding
  data is missing.
- **Prefer the `mcp*` variants** when one exists (the 10 listed above). For
  capabilities with no `mcp*` variant, use the matching base tool: `getTask`,
  `getArtifact`, `getSkill`, `unifiedSearch`, `searchKnowledge`.
- **Section-mode updates** for artifacts: use `mcpUpdateArtifact` with
  `mode: "section"` and `target_heading` for large documents to avoid
  output budget issues.
- **File workflow for large content** (the codemode pattern): download an
  artifact by reading it through MCP (`getArtifact`) and writing the body to
  disk with the `write` tool, edit the file locally, then send it back with
  `mcpUpdateArtifact`. No CLI involved; the full walkthrough lives in
  [resources/usecases/artifact-management.md](resources/usecases/artifact-management.md).
- **Comments** support `is_ai_generated: true`: always set this flag when
  posting as an AI agent.
- **Progress tracking**: use `recordTaskProgress` to log agent activity on
  tasks for visibility in the Aura Timeline.

## Submitting feedback about Aura

If you encounter issues with Aura, whether they be bugs, missing features, or workflow friction that is caused by **Aura itself** (not by the way we use Aura), use the **`aura_feedback`** tool to propose a feedback submission to the Aura maintainers that the user has to sign off on.

`aura_feedback` is an **undocumented tool**: it is available at all times but is not advertised in the system prompt, so you will not see it listed under "Available tools". It exists specifically for this sign-off-gated feedback path. It takes the same parameters as the server's `createFeedback` tool (`title`, `body`, `is_anonymous`, `notify_author`), minus `source`, which it always sends as `MCP` internally. When you call it, an interactive prompt is shown to the user with the proposed title and body and the two checkboxes; the user can answer **Yes** (send as-is), **No** (reject, optional comment), **Refine** (reject with a required comment so you can re-propose), or **Edit** (open all four fields for manual editing, then Submit or Cancel). On a successful submit the row is created in Aura and appended to `~/.pi/aura/feedback.jsonl`.

**Do not use the `mcp__aura_mcp_dev__createFeedback` MCP tool** for this. It submits directly to Aura with no interactive sign-off with the user, which is exactly why the `aura_feedback` tool exists as the sanctioned path. See [resources/usecases/feedback-submission.md](resources/usecases/feedback-submission.md) for the full pipeline and how to read the local log.
