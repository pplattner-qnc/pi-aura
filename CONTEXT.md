# pi-aura

Aura integration for pi: skills and extensions that let a pi agent
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
agent workflows; the package registers it from the caller's credentials
and a user's own configuration entry wins over that registration.
_Avoid_: the Aura server (that is the Aura instance itself)

**PAT**:
Personal Access Token. The bearer credential an agent uses to talk to an
Aura instance. The package stores it in the OS keyring (service "aura",
name "pat") and reads it from there for every connection; the MCP config
file `~/.config/mcp/mcp.json` is only the import source
(`/aura secrets discover`).
_Avoid_: token, key (too generic)

**mcp\* tools**:
The 10 agent-facing tools on the live Aura server that survive on MCP
(`mcpAnswerQuestion`, `mcpCreateArtifact`, etc.). Use these in preference
to the base tools when one exists.
_Avoid_: MCP tools (ambiguous; the full server has 120)

**Aura MCP interface**:
The package's typed door to the aura-mcp-dev server
(`extensions/aura-mcp-client.ts`, standing on pi's own MCP client
library). `createAuraMcpInterface` returns the ten typed methods the
mention machinery and the feedback tool use; `extensions/aura-mcp-contract.ts`
holds the shipped tool contracts the self-check compares against the live
server. One interface per session in the reference engine, one per
submission in the feedback tool.
_Avoid_: the client (ambiguous), API client

**Keyring**:
The OS credential store interface (`@pi-aura/shared/keyring`) that holds
the Aura PAT, with macOS, Linux D-Bus Secret Service, and file backends.
`FakeKeyring` is the test seam; the automated keyring suite runs
`FileKeyring` against temp paths, no live OS keyring.
_Avoid_: the vault, secrets store

## Relationships

- The **aura** skill teaches the tools; the extensions consume the
  **Aura MCP interface** for their data path.
- **mcp\* tools** are the preferred MCP surface; capabilities with no
  `mcp*` variant use the Aura UI.
- A **PAT** authenticates every **aura-mcp-dev** call. The package reads it
  from the **Keyring**; a user's own `mcp.json` entry carries its own
  credential and wins over the package's server registration.

## Flagged ambiguities

- "Client" (used for both the Aura server and the MCP client objects).
  Resolved: the server connection is the **Aura MCP interface**; the Aura
  server is **Aura** or the Aura instance.
