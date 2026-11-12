# Artifact Management

Artifacts are versioned Markdown documents in Aura. They serve as plans,
opinions, specs, and general documentation. They support access control
and the opinions flow (see
[resources/process/review-modes.md](../process/review-modes.md)).

## Finding artifacts

| Goal | Tool |
|---|---|
| Search by content | `unifiedSearch` with `source_types: ["ARTIFACT"]` |
| Get by ID | `getArtifact` (compact default; `response_format: "detail"` for the working view) |
| List all | `listArtifacts` (filter by `scope`: `default` \| `owned` \| `shared` \| `broad_shared`; `opinion_requested: true` for artifacts where you have an open opinion request; `q` searches titles) |
| Tasks linked to an artifact | `listArtifactTasks` |
| Get specific version | `getArtifactVersion` |
| List versions | `listArtifactVersions` |

## Why file-based workflows for large content

When an artifact body passes through the LLM context (as a tool argument or
tool result), three problems occur:

1. **Re-generation waste.** The LLM must generate the entire body as output
   tokens, even if 95% of it is unchanged from what it just read. A simple
   "upload this file" becomes "read the file, then re-generate every line
   as a tool argument."
2. **Context pollution.** A 50KB artifact body occupies a significant share
   of the context window. After the upload, that content stays in context
   for the rest of the session, crowding out useful working memory.
3. **Hallucination risk.** When the LLM re-generates a long document from
   what it read earlier, it can subtly alter, omit, or fabricate content.
   The file on disk is the ground truth; the LLM's re-generation of it is
   an approximation.

Access is MCP-first: read artifact content through `getArtifact` and write
it to a local file with the `write` tool when you need it on disk; edit the
file locally and send the updated content back with `mcpUpdateArtifact`.
The body still travels through the MCP tool arguments, so keep reads
targeted and prefer section-mode edits over whole-body rewrites.

**Rule of thumb:** if the body or the edit is more than a short paragraph
(~500 characters), work from a local file (download through MCP, edit on
disk) instead of composing in context. Below that threshold, the file
round-trip isn't worth it.

## Creating artifacts

### Small content (≤ ~500 chars): direct MCP call

```
mcpCreateArtifact({
  title: "Meeting Notes 2026-08-14",
  body: "# Notes\n\n- Discussed deployment timeline\n- Action: update staging by Friday",
  kind: "GENERIC",
  summary: "Brief meeting notes"
})
```

### Large content (> ~500 chars): compose locally, create via MCP

**Step 1:** Write the content to a local file using the `write` tool.

```
write({ path: "/tmp/artifact-body.md", content: "# Full document..." })
```

**Step 2:** Create the artifact, passing the body you wrote. Read it back
from the file with `read` rather than recomposing it from memory, so the
file on disk stays the ground truth:

```
mcpCreateArtifact({
  title: "Authentication Redesign Plan",
  kind: "PLAN",
  body: "<the body read from /tmp/artifact-body.md>",
  summary: "Initial full version"
})
```

Note the returned artifact `id`.

## Updating artifacts

### Small edits (≤ ~500 chars changed): section mode via MCP

```
mcpUpdateArtifact({
  id: "<artifact-uuid>",
  mode: "section",
  target_heading: "## Timeline",
  body: "Updated timeline content...",
  summary: "Updated timeline section"
})
```

### Large edits (> ~500 chars changed): download, edit on disk, update via MCP

**Step 1:** Download the current version through MCP and write its body to
a local file (the codemode download pattern, no CLI involved):

```
getArtifact({ id: "<artifact-uuid>" })   // read the body from the result
write({ path: "/tmp/artifact-body.md", content: "<the body you read>" })
```

**Step 2:** Edit the body file locally with `read` and `edit` (only diffs
flow through context).

```
read({ path: "/tmp/artifact-body.md" })
edit({ path: "/tmp/artifact-body.md", edits: [...] })
```

**Step 3:** Send the edited body back with `mcpUpdateArtifact` in `whole`
mode (or a `section` edit when only one heading's content changed):

```
mcpUpdateArtifact({
  id: "<artifact-uuid>",
  mode: "whole",
  body: "<the edited body read from /tmp/artifact-body.md>",
  summary: "Description of changes"
})
```

**The whole-mode version contract.** `expected_version` is the merge base:
the version your file derives from (the version you downloaded in
step 1). On a clean draft the latest saved version is the base, so you can
omit it. When the live draft has unsaved changes, whole mode requires
`expected_version` (the call fails with `BASE_VERSION_REQUIRED`
otherwise). A stale base is merged against the latest version; the merge
markers stay on the draft, they never become a version on their own. If a
whole-body upload would destructively discard draft changes, the call is
rejected with `DESTRUCTIVE_WHOLE_REPLACE`; only then pass
`confirm_full_replace: true` to confirm the destructive replace.

To edit again, re-download first (a fresh fetch guarantees you start from
the server's current version).

## Direct MCP tools (compact reference)

These tools are available for quick operations where the content is small
enough to pass through context without issues. **Prefer section-mode edits
for large documents**: they keep the unchanged body out of the tool call.

| Tool | Use for |
|---|---|
| `mcpCreateArtifact` | Create with small body (≤ ~500 chars) |
| `mcpUpdateArtifact` mode `section` | Small targeted edit to one section |
| `mcpUpdateArtifact` mode `whole` | Full body replacement (read from a local file for large bodies; pass `expected_version` as the merge base; `confirm_full_replace: true` only after a `DESTRUCTIVE_WHOLE_REPLACE` rejection) |
| `getArtifact` | Read artifact detail (body included) |
| `linkArtifactToTask` | Link artifact to task |

Server limits: body max 200,000 chars (whole), 50,000 (section). The
practical limit is much lower: the agent's output token budget.

## Linking artifacts to tasks

```
linkArtifactToTask({ id: "<task-uuid>", artifact_id: "<artifact-uuid>" })
```

To discover the tasks already linked to an artifact, use
`listArtifactTasks({ id: "<artifact-uuid>" })`: the non-paginated list of
linked tasks, sorted by `updated_at` descending. It returns 404 when the
artifact is not found or not owned by the current user.

## Review workflow

The review-flow MCP tools (request, start, submit decision, reopen, read
review state, read approvals) are **no longer available via MCP**: they are
gone from the live `aura-mcp-dev` server. Manage artifact reviews in the
**Aura UI**. The successor opinions flow is described in
[resources/process/review-modes.md](../process/review-modes.md); on MCP the
flow is visible as the `opinion_requested` filter on `listArtifacts`.

## Access control

| Action | Tool |
|---|---|
| Grant/update access | `grantArtifactAccess` (not available via MCP; use the Aura UI) |
| View access overview | `getArtifactAccessOverview` (not available via MCP; use the Aura UI) |
| Accept into memory | `acceptArtifactMemory` |

## Comments

Use `createComment` with `entity_type: "ARTIFACT"` and `listComments` with
the same entity type. To @-mention people in a comment, resolve mention
candidates with `listMentionCandidates` (pass `entity_type: "ARTIFACT"` and
the artifact `entity_id`; each candidate carries a `has_access` flag) and
include the handles in the comment body. To edit a comment's body or
mentions, use `updateComment` (author-only; keep `is_ai_generated: true` on
edits: the `mentioned_user_ids` array re-resolves @mentions).
