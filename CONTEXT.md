# pi-aura

Aura integration for pi: skills, agents, and workflows that let a pi agent
work with the Aura project management and knowledge platform via the
`aura-mcp-dev` MCP server. This glossary holds the project's domain terms
only; for the task-workflow's ubiquitous language (map, task, slice,
frontier, etc.), see the workflow package's own CONTEXT.md.

## Language

**Aura**:
The AI-native project management and knowledge platform this package
integrates with. Combines tasks, artifacts, wiki, code search, and memory.
_Avoid_: the app, the platform (too generic)

**aura-mcp-dev**:
The MCP server that exposes Aura's tools to pi. The primary interface for
agent workflows; authenticated with the caller's PAT.
_Avoid_: the Aura server (that is the Aura instance itself)

**PAT**:
Personal Access Token. The bearer credential an agent uses to talk to an
Aura instance; read from `~/.config/mcp/mcp.json` (`mcpServers.aura-mcp-dev`).
_Avoid_: token, key (too generic)

**mcp\* tools**:
The 10 agent-facing tools on the live Aura server that survive on MCP
(`mcpAnswerQuestion`, `mcpCreateArtifact`, etc.). Use these in preference
to the base tools when one exists.
_Avoid_: MCP tools (ambiguous; the full server has 90)

**AuraClient**:
The implementation-agnostic interface (in `@pi-aura/shared/aura-client`)
that the `aura` and `aura-digest` skills consume. `HeyApiAuraClient` is
the generated-SDK-backed implementation; tests inject a fake `AuraClient`.
_Avoid_: the client (ambiguous), API client

**HeyApiAuraClient**:
The `AuraClient` implementation that maps the generated `@hey-api/openapi-ts`
SDK onto the `AuraClient` interface. Lives in `packages/shared`.
_Avoid_: the generated client

**Digest**:
The morning routine's consolidated output: briefing, attention items,
priority queue, capacity, and pending reviews, fetched via in-process
tools and presented as a concise summary with a diff against the last run.
_Avoid_: summary, report

**digest-dashboard**:
The interactive Svelte SPA plus in-process HTTP server (a pi extension
under `.pi/extensions/digest-dashboard/`) that renders the digest live
with an in-memory event stream. Built vite-only; ships committed `dist/`.
_Avoid_: the dashboard extension

**in-process**:
A tool or path that runs in the pi process directly (no spawned child, no
CLI bundle). `digest-fetch` calls `fetchAction` in-process; the dashboard
server runs in-process via a module-scope `serverHandle`.
_Avoid_: inline (ambiguous), embedded

**Keyring**:
The OS credential store interface (`@napi-rs/keyring`) that holds the
Aura PAT. `FakeKeyring` is the test seam; the real keyring is not available
in automated runs.
_Avoid_: the vault, secrets store

**/digest**:
The pi extension command that activates the digest tools
(`digest-dashboard-start/stop`, `digest-fetch`, `digest-finalize`)
additively (they are registered but inactive by default) and launches the
dashboard.
_Avoid_: the digest command (ambiguous with the digest itself)

## Relationships

- An **AuraClient** is consumed by the `aura` and `aura-digest` skills.
  `HeyApiAuraClient` is the production implementation; a fake is the test
  seam.
- A **Digest** is produced by in-process tools and rendered by
  **digest-dashboard**; `/digest` is how the human starts it.
- **mcp\* tools** are the preferred MCP surface; capabilities with no
  `mcp*` variant use the REST API or Aura UI.
- A **PAT** authenticates every **aura-mcp-dev** call and is stored in the
  **Keyring**.

## Flagged ambiguities

- "Client" (used for both the Aura server and the `AuraClient` interface).
  Resolved: **AuraClient** is the interface; the Aura server is **Aura** or
  the Aura instance.
- "Dashboard" (the digest-dashboard extension vs a generic Aura board
  view). Resolved: **digest-dashboard** is the extension; an Aura board
  view is a board, unqualified.
