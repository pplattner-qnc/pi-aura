# pi-aura

Aura integration for [pi](https://github.com/badlogic/pi-mono) — skills, agents, and workflows for the Aura project management platform.

## What's included

### Skills

| Skill | Description |
|---|---|
| `aura` | Reference skill for working with Aura — use cases (tasks, artifacts, wiki, code search, capacity, etc.) and process knowledge (workflow phases, roles, escalation, integrations) |
| `aura-digest` | Morning routine — fetches your briefing, attention items, priority queue, capacity, and reviews via a deterministic script pipeline, then presents a concise digest |

### Agents

| Agent | Purpose |
|---|---|
| `aura-morning-fetcher` | Fetches all morning-routine data from Aura via `mcpScript` (8 parallel API calls), augments with additional context where needed, writes structured markdown to disk |
| `aura-morning-digest` | Reads the fetcher's output and produces a concise, actionable morning digest |

### Commands

| Command | Description |
|---|---|
| `/aura-skills-health` | Health check — verifies MCP adapter config and Aura connectivity |

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

### Morning routine

```
/skill:aura-digest
```

Fetches your briefing, attention items, priority queue, capacity, and pending reviews via a deterministic Node script, verifies review states, then presents a consolidated digest with a diff against the last run.

### Working with Aura

The `aura` skill is discoverable by the agent whenever you mention Aura, tasks, artifacts, wiki, or project planning. It loads the relevant resource files for the task at hand — no need to invoke it explicitly.

### Health check

```
/aura-skills-health
```

Runs diagnostic checks and reports what's working and what's not, with fix instructions for any failures.

## Design principles

- **File-based for large content.** Artifact bodies and wiki documents travel via the `aura` skill's `aura.mjs` script and local files — never through the LLM context as tool arguments. The script owns a workdir per round-trip (pairs the entity id with the body file, auto-cleans on upload), so id↔body mismatch and stale files are impossible. This avoids re-generation waste, context pollution, and hallucination risk.
- **Process-aware.** The skill encodes the Aura development process (workflow phases, roles, capacity rules, escalation paths) so agents follow it correctly.
- **Consent-first for sensitive operations.** Escalations, capacity changes for others, and wiki modifications all require explicit user approval.
- **Cheap models for routine work.** The morning pipeline runs on `deepseek-v4-flash` — fast and inexpensive for data fetching and summarization.

## License

MIT
