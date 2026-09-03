// mcp-client.ts — generic MCP-over-HTTP client.
//
// Wraps the @modelcontextprotocol/sdk StreamableHTTPClientTransport + Client
// to provide typed tool discovery + invocation. Auth is supplied via a header
// provider so different auth sources (bearer token from mcp.json, OAuth access
// token from the OS keyring) share one implementation.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface McpClientOptions {
  serverName: string;
  url: string;
  /** Returns the Authorization header value (e.g. "Bearer <token>"). */
  authHeader: string;
  /** Optional client name/version for the initialize handshake. */
  clientName?: string;
  /** Per-callTool timeout in ms. Bounds long-lived waits so a hung MCP
   *  server can't stall the digest fetch indefinitely. Defaults to 30s
   *  (tighter than the SDK's 60s default) since the dev-links layer fans
   *  out across many calls. */
  callTimeoutMs?: number;
}

export class McpClient {
  private readonly client: Client;
  private readonly opts: McpClientOptions;
  private connected = false;
  private availableTools: Set<string> = new Set();

  constructor(opts: McpClientOptions) {
    this.opts = opts;
    this.client = new Client({
      name: opts.clientName ?? "aura-digest-script",
      version: "1.0.0",
    });
  }

  /** Connect + initialize, then cache the server's tool list. */
  async connect(): Promise<void> {
    if (this.connected) return;
    const transport = new StreamableHTTPClientTransport(new URL(this.opts.url), {
      requestInit: {
        headers: {
          Authorization: this.opts.authHeader,
        },
      },
    });
    await this.client.connect(transport);
    this.connected = true;
    const result = await this.client.listTools();
    for (const tool of result.tools) {
      this.availableTools.add(tool.name);
    }
  }

  /** The configured Authorization header value (e.g. "Bearer <tok>" or
   *  "Basic <b64>"). Exposed for unit tests that assert the auth header
   *  without making a network call. */
  get authHeader(): string {
    return this.opts.authHeader;
  }

  /** Throw if any of `required` tools are not offered by the server. */
  assertToolsAvailable(required: string[]): void {
    const missing = required.filter((name) => !this.availableTools.has(name));
    if (missing.length > 0) {
      throw new Error(
        `MCP server "${this.opts.serverName}" is missing required tools: ${missing.join(", ")}. ` +
          `Available: ${[...this.availableTools].sort().join(", ")}`
      );
    }
  }

  /** List all tool names the server offers. */
  getToolNames(): string[] {
    return [...this.availableTools].sort();
  }

  /**
   * Call a tool and return its parsed JSON result. These MCP servers return a
   * single text content block whose text is a JSON string; we unwrap + parse
   * it. Throws if the tool reports an error or the content shape is unexpected.
   * The call is bounded by callTimeoutMs (default 30s) so a hung server can't
   * stall the digest fetch.
   */
  async callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.availableTools.has(name)) {
      throw new Error(
        `Tool "${name}" is not available on "${this.opts.serverName}". Available: ${[...this.availableTools].sort().join(", ")}`
      );
    }
    const result = await this.client.callTool({ name, arguments: args }, undefined, {
      timeout: this.opts.callTimeoutMs ?? 30_000,
    });
    const content = (result.content ?? []) as Array<{
      type: string;
      text?: string;
      [k: string]: unknown;
    }>;
    if (result.isError) {
      const text = content
        .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
        .join("\n");
      throw new Error(`MCP tool "${this.opts.serverName}.${name}" returned an error: ${text}`);
    }
    const textBlock = content.find((c) => c.type === "text");
    if (!textBlock || !textBlock.text) {
      throw new Error(
        `MCP tool "${this.opts.serverName}.${name}" returned no text content (got ${content.length} blocks)`
      );
    }
    try {
      return JSON.parse(textBlock.text) as T;
    } catch {
      throw new Error(
        `MCP tool "${this.opts.serverName}.${name}" returned non-JSON text: ${textBlock.text.slice(0, 200)}`
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
