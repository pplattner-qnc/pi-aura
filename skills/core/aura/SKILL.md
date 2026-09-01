---
name: aura
description: Work with Aura — the AI-native project management and knowledge platform. Use when the user mentions Aura, tasks, artifacts, wiki, knowledge base, or project planning in the context of the aura-mcp-dev MCP server.
---

# Aura MCP

Aura is an AI-native project management and knowledge platform. It combines task
management, documentation (artifacts), a wiki/knowledge base, code search, and
organizational memory into a single system. The `aura-mcp-dev` MCP server exposes
90 tools for interacting with all of these capabilities.

## What Aura can do

- **Task management** — hierarchical tasks (SAGA → EPIC → STORY → SUBTASK) with
  status workflows, owner/crew assignment, priority ordering, capacity tracking,
  and relations between tasks (blocks, relates-to, part-of, duplicates)
- **Artifacts** — versioned Markdown documents (plans, reviews, generic docs)
  with review workflows, approval gates, and access control
- **Knowledge base / Wiki** — hierarchical knowledge spaces with folders and
  documents, supporting full-text + semantic search, versioning, and images
- **Code search** — semantic and BM25 search across allowlisted Bitbucket
  repositories, with file reading and related-chunk discovery
- **Unified search** — cross-entity semantic search across tasks, artifacts,
  knowledge documents, skills, glossary entries, Jira issues, and more
- **Memory / Knowledge graph** — entity-relationship graph connecting products,
  services, people, tasks, and concepts with confidence-scored edges
- **Signals** — inbound planning signals that can be triaged into tasks
- **Skills** — reusable skill documents with assets, plugins, and import/export
- **Glossary** — shared vocabulary with proposal/approval workflow:
  - `createGlossaryEntry` — create an entry with `term`, `definition`, `category` (`ACRONYM`/`DOMAIN_CONCEPT`/`PRODUCT`/`PROCESS`), optional `language` (`DE`/`EN`), `aliases`, `source`; triggers embedding on create.
  - `getGlossaryEntry` — fetch a single entry by `uuid`.
  - `listGlossaryEntries` — paginated list (all authenticated users); `q` search, `category` filter, `sort_by` (`term`/`category`/`created_at`/`updated_at`).
  - `updateGlossaryEntry` — update `term`/`definition`/`category`/`language`/`aliases`/`source` by `uuid`; re-embeds the entry.
  - `listPendingGlossaryEntries` — list entries awaiting review (admin-only, `MANAGE_GLOSSARY` capability; `PENDING` entries are never embedded/searchable until approved).
- **Notifications** — per-user preference matrix and notification inbox
- **Capacity** — team capacity tracking and leadership overview
- **Comments** — threaded comments on tasks and artifacts with mentions

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

Aura has a structured workflow (Open → Refinement → Alignment → Development →
Review → Deployment → Done) with defined roles, capacity rules, and review
gates. The process resources encode this knowledge for agents:

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

All tools are prefixed with `aura_2d_mcp_2d_dev_`. There are two families:

1. **`mcp*` tools** — agent-facing tools designed for MCP clients. These use
   the caller's PAT for authentication and are the primary interface for
   agent workflows. Only **10 `mcp*` tools** survive on the live 90-tool
   server:
   - `mcpAnswerQuestion` — answer a question directed at you.
   - `mcpCreateArtifact` — create a new artifact (plan, review, generic doc).
   - `mcpCreateUploadDocument` — upload a document and create an artifact for it.
   - `mcpGetKnowledgeDocument` — fetch a knowledge-base document.
   - `mcpGetQuestion` — fetch a question directed at you.
   - `mcpGetRepoDocument` — fetch a repository document.
   - `mcpGetUploadDocument` — fetch an uploaded document.
   - `mcpLinkUploadToTask` — link an uploaded document to a task.
   - `mcpListCodeRepositories` — list the allowlisted Bitbucket repositories.
   - `mcpUpdateArtifact` — update an artifact (full or section mode).

2. **All other tools** — the full Aura API surface, including admin operations,
   board views, notifications, capacity, and user management. These are equally
   available and useful for broader workflows.

   Capabilities that left MCP entirely (capacity, board, notifications write,
   artifact review flow, owner/crew search, Jira/Asana linking, memory-graph
   expansion, skills admin import pipeline, wiki file/image upload) are **not
   available via MCP** — use the REST API (see `openapi-new.yaml` for paths and
   operationIds) or the Aura UI.

### Key patterns

- **Always search first** before creating tasks or artifacts to avoid duplicates.
  Use `unifiedSearch` (cross-entity) or `searchKnowledge` (wiki/knowledge base)
  with relevant source types.
- **Use human keys** (e.g. `AURA-42`) to reference tasks when possible;
  `getTaskByHumanKey` resolves them in a single call.
- **Prefer the surviving `mcp*` variants** when one exists (the 10 listed
  above). For capabilities with no `mcp*` variant, use the matching base tool:
  `getTask`, `getArtifact`, `getSkill`, `unifiedSearch`, `searchKnowledge`.
- **Section-mode updates** for artifacts: use `mcpUpdateArtifact` with
  `mode: "section"` and `target_heading` for large documents to avoid
  output budget issues.
- **Comments** support `is_ai_generated: true` — always set this flag when
  posting as an AI agent.
- **Progress tracking**: use `recordTaskProgress` to log agent activity on
  tasks for visibility in the Aura Timeline.
- **REST CLI** (`node aura.mjs rest`): the `aura` skill bundles a generic
  OpenAPI-driven REST CLI for the ~273 operations not covered by typed MCP
  tools (capacity, notifications-write, owner/crew search, etc.). Use `rest
  list` to browse, `rest describe <opId>` for a single operation's shape,
  `rest call <opId> [--param ...] [--body-file F]` to invoke, and `rest
  search "<intent>"` to find an operation by meaning. The semantic search leg
  is **on by default** via a local, CPU-only embedding model
  (`Xenova/multilingual-e5-base`) that auto-caches to
  `~/.pi/aura/huggingface` on first use — no API key, no cloud, no GPU needed.
  `aura.embed.*` settings can override this with a cloud provider if desired.
  See [resources/rest-api.md](resources/rest-api.md) for the full operation
  reference.

## Submitting feedback about Aura

If you encounter issues with AURA — whether they be bugs, missing features, or workflow friction that is caused by **Aura itself** (not by the way we use Aura) — use the **`aura_feedback`** tool to propose a feedback submission to the Aura maintainers that the user has to sign off on.

`aura_feedback` is an **undocumented tool**: it is available at all times but is not advertised in the system prompt, so you will not see it listed under "Available tools". It exists specifically for this sign-off-gated feedback path. It takes the same parameters as the feedback creation API call (`title`, `body`, `is_anonymous`, `notify_author`) — except for `source`, which it always sends as `MCP` internally. When you call it, an interactive prompt is shown to the user with the proposed title and body and the two checkboxes; the user can answer **Yes** (send as-is), **No** (reject, optional comment), **Refine** (reject with a required comment so you can re-propose), or **Edit** (open all four fields for manual editing, then Submit or Cancel). On a successful submit the row is created in Aura and appended to `~/.pi/aura/feedback.jsonl`.

**Do not use the `aura-mcp-dev_createFeedback` MCP tool** for this. It submits directly to Aura with no interactive sign-off with the user — which is exactly why the `aura_feedback` tool exists as the sanctioned path. See [resources/usecases/feedback-submission.md](resources/usecases/feedback-submission.md) for the full pipeline and how to read the local log.
