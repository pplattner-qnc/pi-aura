# Upload Documents

Aura can ingest files as upload documents, which can then be linked to tasks
and searched via unified search. Uploaded files are **parsed and indexed** —
the stored representation is extracted text organized into pages, not the
original binary.

> **⚠️ Always use the mcpx CLI for uploads and retrievals.** The MCP tools
> (`mcpCreateUploadDocument`, `mcpGetUploadDocument`) require the full file
> content as a base64 tool argument or return it as a tool result — both
> pollute the LLM context window with potentially large binary content.
> The CLI keeps file content on disk and out of the agent's context.

## Uploading a file

```bash
mcpx exec aura-mcp-dev mcpCreateUploadDocument -- \
  --filename "report.txt" \
  --content_base64 "$(base64 -w0 /path/to/file)" \
  --mime_type "text/plain"
```

- Maximum 10 MB per request
- Content must be base64-encoded
- The server extracts text and generates a summary automatically
- Ingest status transitions to `READY` when processing completes

## Retrieving an upload

```bash
mcpx exec aura-mcp-dev mcpGetUploadDocument -- --id "<upload-uuid>"
```

Returns the parsed document: filename, mime type, byte size, page count,
extracted text per page, auto-generated summary, and ingest status.

**Note:** this returns the *parsed text*, not the original file. There is no
raw file download via MCP.

## Linking to a task

```
mcpLinkUploadToTask({ id: "<task-uuid>", upload_id: "<upload-uuid>" })
```

## Searching uploads

```
mcpUnifiedSearch({ query: "...", source_types: ["UPLOAD_DOCUMENT"] })
```

## Forbidden MCP tools

The following MCP tools exist but **must not be called directly** — use the
mcpx CLI equivalents shown above instead:

| Tool | Why forbidden |
|---|---|
| `mcpCreateUploadDocument` | Requires full file content as base64 tool argument — pollutes context |
| `mcpGetUploadDocument` | Returns full parsed content as tool result — pollutes context |
