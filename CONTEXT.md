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
that the `aura` skill consumes. `HeyApiAuraClient` is
the generated-SDK-backed implementation; tests inject a fake `AuraClient`.
_Avoid_: the client (ambiguous), API client

**HeyApiAuraClient**:
The `AuraClient` implementation that maps the generated `@hey-api/openapi-ts`
SDK onto the `AuraClient` interface. Lives in `packages/shared`.
_Avoid_: the generated client

**Keyring**:
The OS credential store interface (`@napi-rs/keyring`) that holds the
Aura PAT. `FakeKeyring` is the test seam; the real keyring is not available
in automated runs.
_Avoid_: the vault, secrets store

## Relationships

- An **AuraClient** is consumed by the `aura` skill.
  `HeyApiAuraClient` is the production implementation; a fake is the test
  seam.
- **mcp\* tools** are the preferred MCP surface; capabilities with no
  `mcp*` variant use the REST API or Aura UI.
- A **PAT** authenticates every **aura-mcp-dev** call and is stored in the
  **Keyring**.

## Flagged ambiguities

- "Client" (used for both the Aura server and the `AuraClient` interface).
  Resolved: **AuraClient** is the interface; the Aura server is **Aura** or
  the Aura instance.
