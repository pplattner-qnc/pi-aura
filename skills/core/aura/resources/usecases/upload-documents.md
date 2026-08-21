# Upload Documents

Aura can ingest files as upload documents, which can then be linked to tasks
and searched via unified search. Uploaded files are **parsed and indexed** —
the stored representation is extracted text organized into pages, not the
original binary.

> **⚠️ Always use the `aura` skill's `aura.mjs upload` subcommands for uploads
> and retrievals.** The MCP tools (`mcpCreateUploadDocument`,
> `mcpGetUploadDocument`) require the full file content as a base64 tool
> argument or return it as a tool result — both pollute the LLM context window
> with potentially large binary content. The script keeps file content on disk
> and out of the agent's context.

## Uploading a file

```bash
node skills/core/aura/dist/aura.mjs upload create --file /path/to/report.txt --mime text/plain
```

The script base64-encodes the file on disk and uploads it; the binary never
enters the LLM context. Prints the new upload `id`.

- Maximum 10 MB per request
- The server extracts text and generates a summary automatically
- Ingest status transitions to `READY` when processing completes

## Retrieving an upload

```bash
# Small parsed text -> printed to stdout
node skills/core/aura/dist/aura.mjs upload get <upload-uuid>

# Large parsed text -> written to a file (or a workdir if --out omitted and large)
node skills/core/aura/dist/aura.mjs upload get <upload-uuid> --out /tmp/upload-parsed.md
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
unifiedSearch({ query: "...", source_types: ["UPLOAD_DOCUMENT"] })
```

## Forbidden MCP tools

The following MCP tools exist but **must not be called directly** — use the
`aura.mjs upload` subcommands shown above instead:

| Tool | Why forbidden |
|---|---|
| `mcpCreateUploadDocument` | Requires full file content as base64 tool argument — pollutes context |
| `mcpGetUploadDocument` | Returns full parsed content as tool result — pollutes context |
