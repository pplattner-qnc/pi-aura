// aura-client.ts — re-exports the generic client + Aura factory.
//
// The generic MCP client lives in mcp-client.ts; server-specific factories
// (bearerClient for Aura, atlassianClient for Jira) live in clients.ts.

export { bearerClient } from "./clients.js";
export { McpClient } from "./mcp-client.js";
