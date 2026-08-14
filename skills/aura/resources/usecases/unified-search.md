# Unified Search

Aura provides two search tools for cross-entity semantic search:

## `mcpUnifiedSearch` (agent-facing)

Searches across one or more source types in a single request. Per-type
authorization is enforced silently — unauthorized types are excluded from
results without returning 403.

**Parameters:**
- `query` (string, required) — natural language search query
- `source_types` (array, required) — one or more of: `TASK`, `UPLOAD_DOCUMENT`,
  `ARTIFACT`, `GLOSSARY`, `SKILL`, `KNOWLEDGE_DOCUMENT`
- `limit` (number, optional) — max results

## `unifiedSearch` (full API)

Same as above but supports additional source types: `QUESTION`, `JIRA_ISSUE`,
`TEAMS_THREAD`, `CHAT_ASSERTION`, `ASANA_TASK`, `TOOL`.

## When to use which

| Scenario | Tool | Source types |
|---|---|---|
| Find a task by description | `mcpUnifiedSearch` | `["TASK"]` |
| Find a document/artifact | `mcpUnifiedSearch` | `["ARTIFACT", "KNOWLEDGE_DOCUMENT"]` |
| Find anything related to a topic | `mcpUnifiedSearch` | `["TASK", "ARTIFACT", "KNOWLEDGE_DOCUMENT"]` |
| Find Jira issues | `unifiedSearch` | `["JIRA_ISSUE"]` |
| Broad search across everything | `unifiedSearch` | All types |

## Best practices

1. **Always search before creating** — check for existing tasks, artifacts, or
   documents on the same topic to avoid duplicates.
2. **Use specific queries** — "authentication token refresh logic" works better
   than "auth".
3. **Narrow source types** — searching fewer types gives more relevant results.
4. **Start broad, then narrow** — if unsure, search across `TASK`, `ARTIFACT`,
   and `KNOWLEDGE_DOCUMENT` first, then drill into specific results.
5. **Follow up with get tools** — after finding an entity, use the corresponding
   get tool (`mcpGetTask`, `mcpGetArtifact`, `mcpGetKnowledgeDocument`) for full
   details.

## Example workflow

```
1. mcpUnifiedSearch({ query: "user onboarding flow", source_types: ["TASK", "ARTIFACT"] })
2. mcpGetTask({ id: "<uuid-from-search>" })
3. mcpGetArtifact({ id: "<uuid-from-search>" })
```
