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

Via `aura.mjs` (inline results — search returns small summaries, safe on stdout):

```bash
node skills/aura/dist/aura.mjs wiki search "capacity management" --limit 5
node skills/aura/dist/aura.mjs wiki search "deployment pipeline" --space engineering --limit 5
```

Hybrid search combining literal (German full-text + trigram fallback) and
semantic search, merged via reciprocal rank fusion. Restricted to the caller's
readable spaces.

### Fetch a document by path

Via `aura.mjs` (workdir model — keeps the body out of LLM context):

```bash
WD=$(node skills/aura/dist/aura.mjs wiki get --slug "knowledge-hub/prozesse/how-we-work-in-aura-a-practical-guide" | sed -n 's/^workdir: //p' | sed 's|/$||')
# body is at $WD/body.md; id/version at $WD/meta.json
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

Via `aura.mjs`:

```bash
node skills/aura/dist/aura.mjs wiki tree --slug "knowledge-hub"
```

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
> others — unapproved changes can break links, confuse readers, or
> overwrite someone else's work.
>
> **Local file hygiene:** the `aura.mjs` workdir model enforces this for you —
> each `wiki get` creates a fresh `/tmp/aura-wiki-<hex>/` dir pairing the node
> id with the body file, and `wiki save` removes it on upload. No stale files
> can linger; to edit again, re-fetch (a fresh workdir guarantees you start
> from the server's current version).

### Create a document

**Via `aura.mjs` (workdir model for large bodies):**

```bash
# Step 1: Create the node (prints the new node uuid)
node skills/aura/dist/aura.mjs wiki create \
  --space engineering --title "Authentication Overview" --slug auth-overview

# Step 2: Write the body to a local file, then fetch-into-workdir + edit + save
# (use the returned uuid to fetch a workdir, write body.md, then save)
WD=$(node skills/aura/dist/aura.mjs wiki get --uuid "<node-uuid>" | sed -n 's/^workdir: //p' | sed 's|/$||')
write({ path: "$WD/body.md", content: "# Authentication Overview\n\n..." })
node skills/aura/dist/aura.mjs wiki save "$WD" --summary "Initial version"
```

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

**Via `aura.mjs` (workdir model for large bodies):**

```bash
# Step 1: Download current version into a fresh workdir
WD=$(node skills/aura/dist/aura.mjs wiki get --uuid "<node-uuid>" | sed -n 's/^workdir: //p' | sed 's|/$||')

# Step 2: Edit the body locally (only diffs flow through context)
read({ path: "$WD/body.md" })
edit({ path: "$WD/body.md", edits: [...] })

# Step 3: Upload; the script reads id+body from the workdir and removes it
node skills/aura/dist/aura.mjs wiki save "$WD" --summary "Description of changes"
```

The workdir is gone after upload — no stale local file can linger. To edit
again, re-fetch (Step 1) for a fresh copy.

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
fields (all optional) — `editor_user_ids` is a full replacement list
(owner-only).

### Upload files and images

> **Not available via MCP.** File and image uploads are REST-only — use
> REST (`POST /knowledge/nodes/{uuid}/file` for files,
> `POST /knowledge/nodes/{uuid}/images` for node images) or the Aura UI.
> The MCP surface covers reading and editing document bodies/frontmatter
> via `saveKnowledgeNodeBody`/`saveKnowledgeNodeFrontmatter`, but binary
> uploads require the REST endpoints above.

## Best practices

1. **Search before creating** — check if a document on the topic already exists.
2. **Use meaningful slugs** — they form the URL path and are used for navigation.
3. **Organize with folders** — keep the tree shallow (2-3 levels max).
4. **Write summaries** — the `summary` field in `saveKnowledgeNodeBody` helps
   with version history and search relevance.
5. **Use frontmatter** — add tags and metadata for discoverability.
