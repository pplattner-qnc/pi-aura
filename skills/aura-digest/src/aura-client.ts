// Aura MCP client.
//
// Reads ~/.config/mcp/mcp.json, finds the `aura-mcp-dev` server, and wraps the
// @modelcontextprotocol/sdk StreamableHTTPClientTransport + Client to provide
// typed tool discovery + invocation. The bearer token is passed via
// requestInit.headers — no OAuth provider dance, and the token is never baked
// into the bundle (read at runtime from the config file).

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".config", "mcp", "mcp.json");

interface McpServerConfig {
  type?: string;
  url?: string;
  bearerToken?: string;
  auth?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export class AuraClient {
  private readonly client: Client;
  private readonly url: string;
  private readonly token: string;
  private connected = false;
  private availableTools: Set<string> = new Set();

  constructor(serverName = "aura-mcp-dev", configPath: string = CONFIG_PATH) {
    const config = this.loadConfig(configPath);
    const server = config.mcpServers[serverName];
    if (!server) {
      throw new Error(
        `MCP server "${serverName}" not found in ${configPath}. Available: ${Object.keys(config.mcpServers).join(", ")}`
      );
    }
    if (server.type !== "http" || !server.url) {
      throw new Error(
        `MCP server "${serverName}" is not an http server (type=${server.type}). Only http servers are supported.`
      );
    }
    const token = server.bearerToken;
    if (!token) {
      throw new Error(
        `MCP server "${serverName}" has no bearerToken. Cannot authenticate.`
      );
    }
    this.url = server.url;
    this.token = token;
    this.client = new Client({ name: "aura-morning-script", version: "1.0.0" });
  }

  private loadConfig(path: string): McpConfig {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as McpConfig;
  }

  /** Connect + initialize, then cache the server's tool list. */
  async connect(): Promise<void> {
    if (this.connected) return;
    const transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    });
    await this.client.connect(transport);
    this.connected = true;
    // Cache the tool list for assertToolsAvailable().
    const result = await this.client.listTools();
    for (const tool of result.tools) {
      this.availableTools.add(tool.name);
    }
  }

  /** Throw if any of `required` tools are not offered by the server. */
  assertToolsAvailable(required: string[]): void {
    const missing = required.filter((name) => !this.availableTools.has(name));
    if (missing.length > 0) {
      throw new Error(
        `Aura MCP server is missing required tools: ${missing.join(", ")}. ` +
          `Available: ${[...this.availableTools].sort().join(", ")}`
      );
    }
  }

  /** List all tool names the server offers. */
  getToolNames(): string[] {
    return [...this.availableTools].sort();
  }

  /**
   * Call a tool and return its parsed JSON result. Aura tools return a single
   * text content block whose text is a JSON string; we unwrap + parse it.
   * Throws if the tool reports an error or the content shape is unexpected.
   */
  async callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.availableTools.has(name)) {
      throw new Error(
        `Tool "${name}" is not available. Available: ${[...this.availableTools].sort().join(", ")}`
      );
    }
    const result = await this.client.callTool({ name, arguments: args });
    const content = (result.content ?? []) as Array<{
      type: string;
      text?: string;
      [k: string]: unknown;
    }>;
    if (result.isError) {
      const text = content
        .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
        .join("\n");
      throw new Error(`Aura tool "${name}" returned an error: ${text}`);
    }
    // Aura returns a single text block with JSON.
    const textBlock = content.find((c) => c.type === "text");
    if (!textBlock || !textBlock.text) {
      throw new Error(
        `Aura tool "${name}" returned no text content (got ${content.length} blocks)`
      );
    }
    try {
      return JSON.parse(textBlock.text) as T;
    } catch {
      throw new Error(
        `Aura tool "${name}" returned non-JSON text: ${textBlock.text.slice(0, 200)}`
      );
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
