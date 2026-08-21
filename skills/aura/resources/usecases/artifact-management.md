# Artifact Management

Artifacts are versioned Markdown documents in Aura. They serve as plans,
reviews, specs, and general documentation. They support review workflows with
approval gates and fine-grained access control.

## Finding artifacts

| Goal | Tool |
|---|---|
| Search by content | `unifiedSearch` with `source_types: ["ARTIFACT"]` |
| Get by ID | `getArtifact` |
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

The file-based workflow via the `aura` skill's `aura.mjs` script avoids all
three: content travels from disk to server without entering the LLM context
as a tool argument. The script owns a **workdir** per round-trip (a fresh
`/tmp/aura-artifact-<hex>/` dir pairing the artifact id with its body file), so
id↔body mismatch is impossible and the dir is removed on upload — no stale
files to forget, no manual delete step.

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

### Large content (> ~500 chars) — file-based via `aura.mjs`

**Step 1:** Write the content to a local file using the `write` tool.

```
write({ path: "/tmp/artifact-body.md", content: "# Full document..." })
```

**Step 2:** Create the artifact, uploading the body from the file. The script
removes the body file on success.

```bash
node skills/aura/dist/aura.mjs artifact create \
  --title "Authentication Redesign Plan" \
  --kind PLAN \
  --body-file /tmp/artifact-body.md \
  --summary "Initial full version"
```

Note the returned artifact `id`.

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

### Large edits (> ~500 chars changed) — file-based via `aura.mjs`

**Step 1:** Download the current version into a fresh workdir. The script
prints the workdir path (holding `body.md` + `meta.json` with the id + version).

```bash
WD=$(node skills/aura/dist/aura.mjs artifact get <artifact-uuid> | sed -n 's/^workdir: //p' | sed 's|/$||')
```

**Step 2:** Edit the body file locally with `read` and `edit` (only diffs
flow through context).

```
read({ path: "$WD/body.md" })
edit({ path: "$WD/body.md", edits: [...] })
```

**Step 3:** Upload the edited body from the workdir. The script reads the id
from `meta.json` + the body from `body.md`, uploads, and removes the workdir.

```bash
node skills/aura/dist/aura.mjs artifact update "$WD" --summary "Description of changes"
```

The workdir is gone after upload — no stale local file can linger. To edit
again, re-run Step 1 (a fresh fetch guarantees you start from the server's
current version).

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
| `getArtifact` | Read artifact detail (body included) |
| `linkArtifactToTask` | Link artifact to task |

Server limits: body max 200,000 chars (whole), 50,000 (section). The
practical limit is much lower — the agent's output token budget.

## Linking artifacts to tasks

```
linkArtifactToTask({ id: "<task-uuid>", artifact_id: "<artifact-uuid>" })
```

## Review workflow

The review-flow MCP tools (request, start, submit decision, reopen, read
review state, read approvals) are **no longer available via MCP** — they are
gone from the live `aura-mcp-dev` server. Instead, use the `aura.mjs`
`artifact review-*` subcommands, which call the REST endpoints directly via
the shared `restClient`.

```bash
# 1. Request a review
node skills/aura/dist/aura.mjs artifact review-request <artifact-uuid>

# 2. Check review status (compact: version, per-reviewer status, deadline, initiator)
node skills/aura/dist/aura.mjs artifact review-get <artifact-uuid>

# 3. Submit a decision (APPROVED or REJECTED, version-bound, idempotent)
node skills/aura/dist/aura.mjs artifact review-decide <artifact-uuid> \
  --version <version> --decision APPROVED

# 4. Start a formal review (assign roles + reviewers + optional deadline)
node skills/aura/dist/aura.mjs artifact review-start <artifact-uuid> \
  --version <version> --roles <role1,role2> --user-ids <user1,user2> \
  --deadline <iso-deadline>

# 5. Reopen an approved review
node skills/aura/dist/aura.mjs artifact review-reopen <artifact-uuid>

# 6. Check approval status (decisions + decided/total counts)
node skills/aura/dist/aura.mjs artifact review-approvals <artifact-uuid>
```

## Access control

| Action | Tool |
|---|---|
| Grant/update access | `grantArtifactAccess` — not available via MCP; use Aura UI / REST |
| View access overview | `getArtifactAccessOverview` — not available via MCP; use Aura UI / REST |
| Accept into memory | `acceptArtifactMemory` |

## Comments

Use `createComment` with `entity_type: "ARTIFACT"` and `listComments` with
the same entity type. To @-mention people in a comment, resolve mention
candidates with `listMentionCandidates` (pass `entity_type: "ARTIFACT"` and
the artifact `entity_id`; each candidate carries a `has_access` flag) and
include the handles in the comment body. To edit a comment's body or
mentions, use `updateComment` (author-only; keep `is_ai_generated: true` on
edits — the `mentioned_user_ids` array re-resolves @mentions).
