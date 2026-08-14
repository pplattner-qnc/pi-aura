# Code Search

> **⚠️ Prefer local repos.** Always use local copies of repositories over
> Aura's code search. Local repos give you full access — codegraph, grep,
> read, LSP, git history — with no network round-trips and no risk of stale
> indexes.
>
> If the repo you need is not available locally, **ask the user** before
> falling back to Aura code search:
>
> 1. Is it already cloned somewhere? Ask for the path.
> 2. Do they want to clone it? Ask where to.
> 3. Only if neither is possible: ask whether to use Aura code search for
>    this session.

Aura provides semantic and keyword search across allowlisted Bitbucket
repositories. Use these tools **only when a local copy of the repository is
not available**.

## Available repositories

```
code_list_repositories()   // List all allowlisted repos
mcpListCodeRepositories()  // List repos with code search enabled
```

## Searching code

### `code_search`

Search a repository with natural language:

```
code_search({
  repo: "aura",
  query: "authentication token refresh logic",
  top_k: 10,
  mode: "hybrid"           // hybrid | semantic | bm25
})
```

**Parameters:**
- `repo` (required) — Bitbucket repo slug (e.g. "aura", "anwalt-de-frontend")
- `query` (required) — natural language description
- `top_k` — number of results
- `ref` — git ref (branch, tag, commit)
- `mode` — search mode (default: hybrid)
- `filter_languages` — filter by programming language
- `filter_paths` — filter by file path pattern

**Results** include file path and line range. Always cite as
`<file>:<start_line>-<end_line>`.

### Search modes

| Mode | Best for |
|---|---|
| `hybrid` | General use — combines semantic + keyword |
| `semantic` | Conceptual queries ("how does X work") |
| `bm25` | Exact terms, identifiers, error messages |

## Reading files

### `code_read_file`

```
// Read entire file
code_read_file({ repo: "aura", file_path: "src/server/auth/handler.ts" })

// Read specific lines
code_read_file({
  repo: "aura",
  file_path: "src/server/auth/handler.ts",
  start_line: 42,
  end_line: 67
})
```

### `code_list_tree`

```
// List root
code_list_tree({ repo: "aura" })

// List subdirectory
code_list_tree({ repo: "aura", path: "src/server", max_entries: 50 })
```

## Finding related code

### `code_find_related`

After a `code_search` returns a relevant chunk, find semantically related code:

```
code_find_related({
  repo: "aura",
  file_path: "src/server/auth/handler.ts",
  line: 42,
  top_k: 5
})
```

Use this to discover callers, implementations, or related logic.

## Typical workflow

```
1. code_list_repositories()                          // What repos are available?
2. code_search({ repo, query: "..." })               // Find relevant code
3. code_read_file({ repo, file_path, start_line, end_line })  // Read context
4. code_find_related({ repo, file_path, line })      // Discover related code
```

## Repository documentation

Aura also indexes repository documentation:

```
mcpGetRepoDocument({ repo_slug: "aura", path: "docs/architecture.md" })
```

## Tips

1. **Ask the user which repo** if it's not clear from context.
2. **Start with `code_search`**, then drill into files with `code_read_file`.
3. **Use `filter_paths`** to narrow results (e.g. `filter_paths: ["src/server"]`).
4. **Use `ref`** to search a specific branch or tag.
5. **Cite results** as `file:start-end` for traceability.
