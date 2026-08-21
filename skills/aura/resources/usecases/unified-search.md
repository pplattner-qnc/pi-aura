# Unified Search

Aura provides a single search tool for cross-entity semantic search:

## `unifiedSearch`

Searches across one or more source types in a single request. Per-type
authorization is enforced silently — unauthorized types are excluded from
results without returning 403.

**Parameters:**
- `query` (string, required) — natural language search query
- `source_types` (array, required) — one or more of: `TASK`,
  `UPLOAD_DOCUMENT`, `ARTIFACT`, `GLOSSARY`, `QUESTION`, `JIRA_ISSUE`,
  `KNOWLEDGE_DOCUMENT`, `SKILL`, `TEAMS_THREAD`, `CHAT_ASSERTION`,
  `ASANA_TASK`, `TOOL`
- `limit` (number, optional) — max results

## Common scenarios

| Scenario | Source types |
|---|---|
| Find a task by description | `["TASK"]` |
| Find a document/artifact | `["ARTIFACT", "KNOWLEDGE_DOCUMENT"]` |
| Find anything related to a topic | `["TASK", "ARTIFACT", "KNOWLEDGE_DOCUMENT"]` |
| Find Jira issues | `["JIRA_ISSUE"]` |
| Broad search across everything | All types |

## Best practices

1. **Always search before creating** — check for existing tasks, artifacts, or
   documents on the same topic to avoid duplicates.
2. **Use specific queries** — "authentication token refresh logic" works better
   than "auth".
3. **Narrow source types** — searching fewer types gives more relevant results.
4. **Start broad, then narrow** — if unsure, search across `TASK`, `ARTIFACT`,
   and `KNOWLEDGE_DOCUMENT` first, then drill into specific results.
5. **Follow up with get tools** — after finding an entity, use the corresponding
   get tool (`getTask`, `getArtifact`, `mcpGetKnowledgeDocument`) for full
   details.

## Example workflow

```
1. unifiedSearch({ query: "user onboarding flow", source_types: ["TASK", "ARTIFACT"] })
2. getTask({ uuid: "<uuid-from-search>" })
3. getArtifact({ id: "<uuid-from-search>" })
```
