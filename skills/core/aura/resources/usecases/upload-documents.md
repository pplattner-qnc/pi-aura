# Upload Documents

Aura can ingest files as upload documents, which can then be linked to tasks
and searched via unified search. Uploaded files are **parsed and indexed** —
the stored representation is extracted text organized into pages, not the
original binary.

Uploads run on MCP: `mcpCreateUploadDocument` takes the file content as a
base64 tool argument, and `mcpGetUploadDocument` returns the parsed text as
a tool result. Keep uploads modest — large files put their base64 payload
through the context twice (once on the call, once in results). Read the
file from disk and encode it for the call; for large parsed results, write
the content to a file with the `write` tool instead of keeping it in
context.

## Uploading a file

```
mcpCreateUploadDocument({ ... })   // read the file from disk, pass content base64-encoded
```

- Maximum 10 MB per request
- The server extracts text and generates a summary automatically
- Ingest status transitions to `READY` when processing completes

## Retrieving an upload

```
mcpGetUploadDocument({ ... })   // fetch by upload id
```

Returns the parsed document: filename, mime type, byte size, page count,
extracted text per page, auto-generated summary, and ingest status. For
large parsed text, write it to a file with the `write` tool.

**Note:** this returns the *parsed text*, not the original file. There is
no raw file download via MCP.

## Linking to a task

```
mcpLinkUploadToTask({ id: "<task-uuid>", upload_id: "<upload-uuid>" })
```

## Searching uploads

```
unifiedSearch({ query: "...", source_types: ["UPLOAD_DOCUMENT"] })
```
