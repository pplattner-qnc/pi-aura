# Wiki / Knowledge Base

Aura's knowledge base is organized into **spaces** (topics), each containing a
tree of **folders** and **documents**. Documents are versioned Markdown pages
with frontmatter support.

## Reading

### Search the wiki

Via MCP:

```
mcpWikiSearch({ query: "deployment pipeline", limit: 10 })
mcpWikiSearch({ query: "deployment pipeline", space_slug: "engineering", limit: 5 })
```

Via mcpx CLI:

```bash
mcpx exec aura-mcp-dev mcpWikiSearch -- \
  --query "capacity management" --limit 5
```

Hybrid search combining literal (German full-text + trigram fallback) and
semantic search, merged via reciprocal rank fusion. Restricted to the caller's
readable spaces.

### Fetch a document by path

Via mcpx CLI (preferred — keeps the body out of LLM context):

```bash
mcpx exec aura-mcp-dev getKnowledgeNodeByPath -- \
  --slug "knowledge-hub" \
  --path "prozesse/how-we-work-in-aura-a-practical-guide" \
  | jq -r '.content[0].text.body' > /tmp/wiki-doc.md
```

Via MCP (only for short documents where context cost is negligible):

```
getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "prozesse/how-we-work-in-aura-a-practical-guide" })
```

### Browse the tree

| Goal | Tool | Notes |
|---|---|---|
| List all spaces | `listKnowledgeSpaces` | Returns all knowledge spaces |
| Get space by slug | `getKnowledgeSpace` | Space detail |
| Full tree for a space | `getKnowledgeTree` | Folders + documents (no body) |
| Get node by UUID | `getKnowledgeNode` | Full document with body |
| List files in a space | `listKnowledgeFiles` | FILE nodes only |
| Get specific version | `getKnowledgeNodeVersion` | Historical version |
| List versions | `listKnowledgeNodeVersions` | Version history |

Via mcpx CLI:

```bash
mcpx exec aura-mcp-dev getKnowledgeTree -- --slug "knowledge-hub"
```

### Cross-entity search

```
mcpUnifiedSearch({ query: "...", source_types: ["KNOWLEDGE_DOCUMENT"] })
```

Also `searchKnowledge` for hybrid search over wiki, repository, and skill
knowledge spaces.

## Modifying

> **⚠️ Explicit user consent required.** Before creating, editing, moving,
> renaming, or deleting any wiki content, **always confirm with the user
> first**. Wiki documents are shared, versioned, and often referenced by
> others — unapproved changes can break links, confuse readers, or
> overwrite someone else's work.
>
> **Local file hygiene:** a local file is a *temporary transport*, not a cache.
> After every successful upload, delete the local copy. When you need to edit
> again, re-download a fresh copy — never edit a stale local file, because it
> can hide changes that were never uploaded. This keeps `/tmp` clean and
> guarantees you always work from the server's current version.

### Create a document

**Via mcpx CLI (preferred for large bodies):**

```bash
# Step 1: Create the node
mcpx exec aura-mcp-dev createKnowledgeNode -- \
  --space_slug "engineering" \
  --kind "DOCUMENT" \
  --title "Authentication Overview" \
  --slug "auth-overview"

# Step 2: Write the body to a local file, then upload
write({ path: "/tmp/wiki-body.md", content: "# Authentication Overview\n\n..." })

mcpx exec aura-mcp-dev saveKnowledgeNodeBody -- \
  --uuid "<node-uuid>" \
  --body "$(cat /tmp/wiki-body.md)" \
  --summary "Initial version"

# Step 3: Delete the local file after a successful upload
rm /tmp/wiki-body.md
```

**Editing again?** Re-download a fresh copy — never edit a stale local file
left over from a previous session, since it may hide changes that were never
uploaded. Re-fetch, edit, upload, then delete again.

**Via MCP (only for small bodies):**

```
createKnowledgeNode({
  space_slug: "engineering",
  kind: "DOCUMENT",
  title: "Authentication Overview",
  slug: "auth-overview",
  parent_id: "<parent-folder-uuid>",  // optional, omit for root
  order: 1
})

saveKnowledgeNodeBody({
  uuid: "<node-uuid>",
  body: "# Authentication Overview\n\n...",
  summary: "Initial version"
})
```

### Create a folder

```
createKnowledgeNode({
  space_slug: "engineering",
  kind: "FOLDER",
  title: "Backend",
  slug: "backend"
})
```

### Update a document body

**Via mcpx CLI (preferred for large bodies):**

```bash
# Step 1: Download current version to a local file
mcpx exec aura-mcp-dev getKnowledgeNode -- \
  --uuid "<node-uuid>" \
  | jq -r '.content[0].text.body' > /tmp/wiki-current.md

# Step 2: Edit locally
read({ path: "/tmp/wiki-current.md" })
edit({ path: "/tmp/wiki-current.md", edits: [...] })

# Step 3: Upload edited file
mcpx exec aura-mcp-dev saveKnowledgeNodeBody -- \
  --uuid "<node-uuid>" \
  --body "$(cat /tmp/wiki-current.md)" \
  --summary "Description of changes"

# Step 4: Delete the local file after a successful upload
rm /tmp/wiki-current.md
```

**Editing again?** Re-run Step 1 to download a fresh copy — never edit a stale
local file left over from a previous session, since it may hide changes that
were never uploaded. Re-fetch, edit, upload, then delete again.

**Via MCP (only for small edits):**

```
saveKnowledgeNodeBody({
  uuid: "<node-uuid>",
  body: "# Updated content...",
  summary: "Added section on OAuth flows"
})
```

Each save creates a new version.

### Update frontmatter

```
saveKnowledgeNodeFrontmatter({
  uuid: "<node-uuid>",
  frontmatter: { tags: ["auth", "security"], status: "published" }
})
```

### Rename, move, or reorder

```
updateKnowledgeNode({
  uuid: "<node-uuid>",
  title: "New Title",
  parent_id: "<new-parent-uuid>",
  order: 2
})
```

### Restore a previous version

```
restoreKnowledgeNodeVersion({ uuid: "<node-uuid>", version: 2 })
```

### Upload files and images

| Action | Tool |
|---|---|
| Upload file to space | `uploadKnowledgeFile` |
| Upload image for a node | `uploadKnowledgeNodeImage` |

## Best practices

1. **Search before creating** — check if a document on the topic already exists.
2. **Use meaningful slugs** — they form the URL path and are used for navigation.
3. **Organize with folders** — keep the tree shallow (2-3 levels max).
4. **Write summaries** — the `summary` field in `saveKnowledgeNodeBody` helps
   with version history and search relevance.
5. **Use frontmatter** — add tags and metadata for discoverability.
