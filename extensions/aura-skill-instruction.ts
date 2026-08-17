/**
 * Aura Skill Instruction Extension
 *
 * Injects a system-prompt instruction on every turn reminding the agent to use
 * the `aura` skill for any Aura-related work (tasks, artifacts, wiki, knowledge
 * base, project planning, or anything via the aura-mcp-dev MCP server).
 *
 * pi rebuilds the base system prompt each turn, so appending here re-applies
 * cleanly per turn without accumulating across the session.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AURA_INSTRUCTION = `
## Aura

When working with Aura — the AI-native project management and knowledge platform
(tasks, artifacts, wiki, knowledge base, project planning, or anything via the
aura-mcp-dev MCP server) — you MUST use the \`aura\` skill. Load it with the \`read\`
tool from its SKILL.md before performing any Aura-related work, and prefer the
aura-mcp-dev MCP tools for all Aura operations.
`;

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, _ctx) => {
    return {
      systemPrompt: event.systemPrompt + "\n" + AURA_INSTRUCTION,
    };
  });
}
