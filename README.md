# pi-aura

Aura integration for [pi](https://github.com/badlogic/pi-mono): skills and extensions for the Aura project management and knowledge platform.

## What's included

### Skills

| Skill | Description |
|---|---|
| `aura` | Reference skill for working with Aura: use cases (tasks, artifacts, wiki, code search, capacity, etc.) and process knowledge (workflow phases, roles, escalation, integrations) |

## Prerequisites

- [pi](https://github.com/badlogic/pi-mono) (MCP support is built in)
- An Aura instance with a Personal Access Token (PAT)

### MCP configuration (optional override)

The package registers the `aura-mcp-dev` MCP server with pi itself: at extension load it derives the server URL from `aura.baseUrl` in `~/.pi/agent/settings.json` (`/mcp` on the same instance) and reads the PAT from the OS keyring (service `aura`, name `pat`). With no PAT stored nothing is registered and the package loads silently. No manual MCP setup is required.

You only need your own entry to override the registration (a different URL or credential). Your own `aura-mcp-dev` entry in `~/.pi/agent/mcp.json` (project-level: `.pi/mcp.json`) wins over the package's registration:

```json
{
  "mcpServers": {
    "aura-mcp-dev": {
      "url": "https://<your-aura-instance>/mcp",
      "headers": { "Authorization": "Bearer <your-aura-pat>" }
    }
  }
}
```

## Install

```bash
pi install git:github.com/pplattner-qnc/pi-aura@v0.9.0
```

## Usage

### Working with Aura

The `aura` skill is discoverable by the agent whenever you mention Aura, tasks, artifacts, wiki, or project planning. It loads the relevant resource files for the task at hand; no need to invoke it explicitly.

## Extensions

The manifest registers six extensions:

| Extension | Description |
|---|---|
| `aura-skill-instruction` | Per-turn system-prompt instruction to use the `aura` skill for Aura work |
| `aura-secrets` | The `/aura` command: stores the PAT in the OS keyring (`/aura secrets discover` imports one from an existing `~/.config/mcp/mcp.json` entry, `/aura secrets edit` prompts for the token) |
| `aura-tasks` | Session-start probe that warns when the configured Aura instance is unreachable |
| `aura-feedback` | The sign-off-gated `aura_feedback` tool for proposing feedback to the Aura maintainers |
| `aura-references` | The `#task:`, `#artifact:`, `#wiki:`, and `#rule:` reference engine with its sqlite mention cache |
| `aura-mcp-server` | Registers the `aura-mcp-dev` MCP server from your settings and keyring (see MCP configuration above) |

Two library modules ride along without manifest entries. `extensions/aura-mcp-client.ts` (with its contract data in `aura-mcp-contract.ts`) is the typed MCP interface the mention machinery and the feedback tool run on. `extensions/cursor-rules.ts` is the rules loader backing the local `#rule:` mention kind. Rule mentions are a companion-plugin concern: the plugin repo owns rules dispatch and mentioned-rule body injection, consuming the same `.cursor/rules` directory, so with pi-aura alone `#rule:` and `@rule:` mentions still autocomplete and expand to `<rule-ref>` elements, but nothing injects the rule body.

## Design principles

- **Files for large content.** Large artifact and wiki bodies are read through MCP and written to local files with the `write` tool; edits happen on disk, and the updated content travels back through the MCP update tools. This keeps re-generation waste, context pollution, and hallucination risk down: the file on disk is the ground truth while editing.
- **Process-aware.** The skill encodes the Aura development process (workflow phases, roles, capacity rules, escalation paths) so agents follow it correctly.
- **Consent-first for sensitive operations.** Escalations, capacity changes for others, and wiki modifications all require explicit user approval.

## License

MIT
