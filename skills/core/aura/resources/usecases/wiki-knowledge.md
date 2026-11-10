# Wiki / Knowledge Base

Aura's knowledge base is organized into **spaces** (topics), each containing a
tree of **folders** and **documents**. Documents are versioned Markdown pages
with frontmatter support.

## Reading

### Search the wiki

Via MCP:

```
searchKnowledge({ query: "deployment pipeline", limit: 10 })
searchKnowledge({ query: "deployment pipeline", space_slug: "engineering", limit: 5 })
```

Hybrid search combining literal (German full-text + trigram fallback) and
semantic search, merged via reciprocal rank fusion. Restricted to the caller's
readable spaces.

### Fetch a document by path

Via MCP:

```
getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "prozesse/how-we-work-in-aura-a-practical-guide" })
```

For long documents, write the returned body to a local file with the
`write` tool so follow-up work reads from disk instead of the context.

### Browse the tree

| Goal | Tool | Notes |
|---|---|---|
| List all spaces | `listKnowledgeSpaces` | Returns all knowledge spaces |
| Get space by slug | `getKnowledgeSpace` | Space detail |
| Full tree for a space | `getKnowledgeTree` | Folders + documents (no body); the answer is bounded, depth max 2 and 200 nodes by default, pass `depth`/`max_nodes` to widen (max 2/200) |
| Get node by UUID | `getKnowledgeNode` | Full document with body |
| List files in a space | `listKnowledgeFiles` | FILE nodes only |
| List file versions | `listKnowledgeFileVersions` | A FILE node's asset history, newest first; each entry carries its own checksum and provenance; download a specific version in the Aura UI |
| Get specific version | `getKnowledgeNodeVersion` | Historical version |
| List versions | `listKnowledgeNodeVersions` | Version history |

### Cross-entity search

```
unifiedSearch({ query: "...", source_types: ["KNOWLEDGE_DOCUMENT"] })
```

Also `searchKnowledge` for hybrid search over wiki, repository, and skill
knowledge spaces.

## Modifying

> **⚠️ Explicit user consent required.** Before creating, editing, moving,
> renaming, or deleting any wiki content, **always confirm with the user
> first**. Wiki documents are shared, versioned, and often referenced by
> others: unapproved changes can break links, confuse readers, or
> overwrite someone else's work.
>
> **Fresh-copy hygiene:** always re-fetch a node before editing it, so you
> start from the server's current version and never overwrite a newer save
> with a stale copy.

### Create a document

Create the node, then save its body:

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
  id: "<node-uuid>",
  body: "# Authentication Overview\n\n...",
  summary: "Initial version"
})
```

For a large body, compose it in a local file with the `write` tool first,
then read it back with `read` for the `saveKnowledgeNodeBody` call, so the
file on disk stays the ground truth.

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

For large edits, download first, edit on disk, then send the edited body
back:

```
getKnowledgeNode({ id: "<node-uuid>" })   // read the body from the result
write({ path: "/tmp/wiki-body.md", content: "<the body you read>" })
// edit the file locally with `read` and `edit` (only diffs flow through context)
saveKnowledgeNodeBody({
  id: "<node-uuid>",
  body: "<the edited body read from /tmp/wiki-body.md>",
  summary: "Description of changes"
})
```

For small edits, call `saveKnowledgeNodeBody` directly:

```
saveKnowledgeNodeBody({
  id: "<node-uuid>",
  body: "# Updated content...",
  summary: "Added section on OAuth flows"
})
```

Each save creates a new version.

### Update frontmatter

The front matter is saved as one raw YAML string keyed by the node `id`,
not as a structured object; pass `null` to clear the front matter. Every
save creates a new version:

```
saveKnowledgeNodeFrontmatter({
  id: "<node-uuid>",
  raw: "tags:\n  - auth\n  - security\nstatus: published"
})

saveKnowledgeNodeFrontmatter({ id: "<node-uuid>", raw: null })   // clear
```

### Rename, move, or reorder

```
updateKnowledgeNode({
  id: "<node-uuid>",
  title: "New Title",
  parent_id: "<new-parent-uuid>",
  order: 2
})
```

The same tool also takes `slug` (lowercase alphanumeric with hyphens,
rejected for FILE nodes whose slug derives from the filename), `summary`,
and `tags` (a replacement list of tag strings; `[]` clears them).

### Restore a previous version

```
restoreKnowledgeNodeVersion({ id: "<node-uuid>", version: "2" })
```

The version is a decimal string (e.g. `"2"`), not a number. The restore
creates a new version with that content.

### Space administration

```
createKnowledgeSpace({
  slug: "engineering",
  title: "Engineering",
  description: "Engineering knowledge base",
  visibility: "PRIVATE",         // PRIVATE | PUBLIC_READ | PUBLIC_WRITE
  embedding_enabled: true,       // enable semantic search indexing
  editor_user_ids: ["<uuid>"]    // grant read+write editors on creation
})

updateKnowledgeSpace({
  slug: "engineering",
  title: "Engineering Wiki",
  description: "Updated description",
  visibility: "PUBLIC_READ",
  embedding_enabled: false,
  editor_user_ids: ["<uuid>"]    // full replacement list (owner-only)
})
```

`listKnowledgeSpaces` and `getKnowledgeSpace` (listed in the browse table
above) cover read access; `createKnowledgeSpace`/`updateKnowledgeSpace`
are for creating and modifying spaces. `createKnowledgeSpace` requires
`slug` + `title`; `description`, `visibility`, `embedding_enabled`, and
`editor_user_ids` are optional. `updateKnowledgeSpace` accepts the same
fields (all optional); `editor_user_ids` is a full replacement list
(owner-only).

### Upload files and images

> **Not available via MCP.** File and image uploads are REST-only; use
> the Aura UI. The MCP surface covers reading and editing document
> bodies/frontmatter via `saveKnowledgeNodeBody`/`saveKnowledgeNodeFrontmatter`.

## Best practices

1. **Search before creating**: check if a document on the topic already exists.
2. **Use meaningful slugs**: they form the URL path and are used for navigation.
3. **Organize with folders**: keep the tree shallow (2-3 levels max).
4. **Write summaries**: the `summary` field in `saveKnowledgeNodeBody` helps
   with version history and search relevance.
5. **Use frontmatter**: add tags and metadata for discoverability.
