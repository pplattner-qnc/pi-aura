# Artifact Management

Artifacts are versioned Markdown documents in Aura. They serve as plans,
reviews, specs, and general documentation. They support review workflows with
approval gates and fine-grained access control.

## Finding artifacts

| Goal | Tool |
|---|---|
| Search by content | `mcpUnifiedSearch` with `source_types: ["ARTIFACT"]` |
| Get by ID | `mcpGetArtifact` or `getArtifact` |
| List all | `listArtifacts` (filter by scope, pending_review) |
| Get specific version | `getArtifactVersion` |
| List versions | `listArtifactVersions` |

## Why file-based workflows for large content

When an artifact body passes through the LLM context — as a tool argument or
tool result — three problems occur:

1. **Re-generation waste.** The LLM must generate the entire body as output
   tokens, even if 95% of it is unchanged from what it just read. A simple
   "upload this file" becomes "read the file, then re-generate every line
   as a tool argument."
2. **Context pollution.** A 50KB artifact body occupies a significant share
   of the context window. After the upload, that content stays in context
   for the rest of the session, crowding out useful working memory.
3. **Hallucination risk.** When the LLM re-generates a long document from
   what it read earlier, it can subtly alter, omit, or fabricate content.
   The file on disk is the ground truth — the LLM's re-generation of it is
   an approximation.

The file-based workflow via `mcpx` avoids all three: content travels from
disk to server without entering the LLM context as a tool argument.

**Rule of thumb:** if the body or the edit is more than a short paragraph
(~500 characters), use the file-based workflow. Below that threshold, the
overhead of the file round-trip isn't worth it.

## Creating artifacts

### Small content (≤ ~500 chars) — direct MCP call

```
mcpCreateArtifact({
  title: "Meeting Notes 2026-08-14",
  body: "# Notes\n\n- Discussed deployment timeline\n- Action: update staging by Friday",
  kind: "GENERIC",
  summary: "Brief meeting notes"
})
```

### Large content (> ~500 chars) — file-based via mcpx

**Step 1:** Write the content to a local file using the `write` tool.

```
write({ path: "/tmp/artifact-body.md", content: "# Full document..." })
```

**Step 2:** Create the artifact with a minimal seed body via MCP.

```
mcpCreateArtifact({
  title: "Authentication Redesign Plan",
  body: "# Authentication Redesign Plan",
  kind: "PLAN",
  summary: "Plan for redesigning the auth system"
})
```

Note the returned artifact `id`.

**Step 3:** Upload the full body via mcpx.

```bash
mcpx exec aura-mcp-dev mcpUpdateArtifact -- \
  --id "<artifact-uuid>" \
  --mode whole \
  --body "$(cat /tmp/artifact-body.md)" \
  --summary "Initial full version" \
  --confirm_full_replace true
```

## Updating artifacts

### Small edits (≤ ~500 chars changed) — section mode via MCP

```
mcpUpdateArtifact({
  id: "<artifact-uuid>",
  mode: "section",
  target_heading: "## Timeline",
  body: "Updated timeline content...",
  summary: "Updated timeline section"
})
```

### Large edits (> ~500 chars changed) — file-based via mcpx

**Step 1:** Download the current version.

```bash
mcpx exec aura-mcp-dev getArtifact -- --id "<artifact-uuid>" \
  | jq -r '.content[0].text.body' > /tmp/artifact-current.md
```

**Step 2:** Edit the file locally with `read` and `edit`.

```
read({ path: "/tmp/artifact-current.md" })
edit({ path: "/tmp/artifact-current.md", edits: [...] })
```

**Step 3:** Upload the edited file.

```bash
mcpx exec aura-mcp-dev mcpUpdateArtifact -- \
  --id "<artifact-uuid>" \
  --mode whole \
  --body "$(cat /tmp/artifact-current.md)" \
  --summary "Description of changes" \
  --confirm_full_replace true
```

## Direct MCP tools (compact reference)

These tools are available for quick operations where the content is small
enough to pass through context without issues. **Avoid using them for
bodies or edits larger than a short paragraph** — use the file-based
workflow instead.

| Tool | Use for |
|---|---|
| `mcpCreateArtifact` | Create with small body (≤ ~500 chars) |
| `mcpUpdateArtifact` mode `section` | Small targeted edit to one section |
| `mcpUpdateArtifact` mode `whole` | Small full replacement (≤ ~500 chars) |
| `mcpGetArtifact` | Read artifact detail (body included) |
| `mcpLinkArtifactToTask` | Link artifact to task |

Server limits: body max 200,000 chars (whole), 50,000 (section). The
practical limit is much lower — the agent's output token budget.

## Linking artifacts to tasks

```
mcpLinkArtifactToTask({ id: "<task-uuid>", artifact_id: "<artifact-uuid>" })
```

## Review workflow

1. **Request review**: `requestArtifactReview({ id: "<uuid>" })`
2. **Check review status**: `getArtifactReview({ id: "<uuid>" })`
3. **Submit decision**: `submitArtifactDecision({ id, version, decision })`
   — `APPROVED` or `REJECTED`, version-bound, idempotent
4. **Start formal review**: `startArtifactReview({ id: "<uuid>" })`
5. **Reopen approved review**: `reopenArtifactReview({ id: "<uuid>" })`

## Access control

| Action | Tool |
|---|---|
| Grant/update access | `grantArtifactAccess` |
| View access overview | `getArtifactAccessOverview` |
| Accept into memory | `acceptArtifactMemory` |

## Comments

Use `createComment` with `entity_type: "ARTIFACT"` and `listComments` with
the same entity type.
