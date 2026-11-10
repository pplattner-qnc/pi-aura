# pi-aura

Aura integration for [pi](https://github.com/badlogic/pi-mono) — skills, agents, and workflows for the Aura project management platform.

## What's included

### Skills

| Skill | Description |
|---|---|
| `aura` | Reference skill for working with Aura — use cases (tasks, artifacts, wiki, code search, capacity, etc.) and process knowledge (workflow phases, roles, escalation, integrations) |
| `engineering-foundation` | Router for the anwalt.de engineering canon in the Aura wiki space: fetches the process pages (workflow phases, roles, PR and review conventions, coding standards, deployment, AI-readiness) live from the wiki; this package bundles none of it |

### Commands

_(No user-facing commands are registered by this package.)_

## Prerequisites

- [pi](https://github.com/badlogic/pi-mono) with [pi-subagents](https://www.npmjs.com/package/pi-subagents) and [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter)
- An Aura instance with a Personal Access Token (PAT)

### MCP configuration

Add to `~/.config/mcp/mcp.json`:

```json
{
  "mcpServers": {
    "aura-mcp-dev": {
      "type": "http",
      "url": "https://<your-aura-instance>/mcp",
      "auth": "bearer",
      "bearerToken": "<your-aura-pat>"
    }
  }
}
```

## Install

```bash
pi install git:github.com/pplattner-qnc/pi-aura@v0.1.0
```

## Usage

### Working with Aura

The `aura` skill is discoverable by the agent whenever you mention Aura, tasks, artifacts, wiki, or project planning. It loads the relevant resource files for the task at hand — no need to invoke it explicitly.

## Design principles

- **Files for large content.** Large artifact and wiki bodies are read through MCP and written to local files with the `write` tool; edits happen on disk, and the updated content travels back through the MCP update tools. This keeps re-generation waste, context pollution, and hallucination risk down — the file on disk is the ground truth while editing.
- **Process-aware.** The skill encodes the Aura development process (workflow phases, roles, capacity rules, escalation paths) so agents follow it correctly.
- **Consent-first for sensitive operations.** Escalations, capacity changes for others, and wiki modifications all require explicit user approval.

## License

MIT
