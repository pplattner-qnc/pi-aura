// clients.ts — build McpClient instances for the servers this script uses.
//
// - Aura (aura-mcp-dev): HTTP + bearer token from ~/.config/mcp/mcp.json.
// - Atlassian (Jira/Teamwork Graph): HTTP + OAuth access token read from the
//   OS keyring, where pi-mcp-adapter persists it (service "pi-mcp-adapter.oauth",
//   account "sha256-<sha256(serverName)>"). Reusing the adapter's stored token
//   avoids a separate OAuth flow — the script rides on the user's existing
//   `pi` MCP authentication. The token may be chunked across multiple keyring
//   entries (the adapter chunks payloads > 1000 chars); we reassemble them.
//
// Bitbucket is NOT an MCP client here: the bitbucket MCP server is stdio (npx),
// which the script can't easily drive, but the same credentials (email + API
// token) work against api.bitbucket.org directly via HTTP basic auth — see
// bitbucket.ts.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { McpClient } from "./mcp-client.js";

const MCP_CONFIG_PATH = join(homedir(), ".config", "mcp", "mcp.json");

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

function loadMcpConfig(path: string = MCP_CONFIG_PATH): McpConfig {
  return JSON.parse(readFileSync(path, "utf8")) as McpConfig;
}

/** Build an McpClient for an HTTP+bearer MCP server configured in mcp.json. */
export function bearerClient(serverName: string, configPath: string = MCP_CONFIG_PATH): McpClient {
  const config = loadMcpConfig(configPath);
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
    throw new Error(`MCP server "${serverName}" has no bearerToken. Cannot authenticate.`);
  }
  return new McpClient({
    serverName,
    url: server.url,
    authHeader: `Bearer ${token}`,
    clientName: "aura-digest-script",
  });
}

/** Read the OAuth access token that pi-mcp-adapter persisted for `serverName`
 * from the OS keyring. Returns null if no token is stored (user hasn't authed
 * that server via pi yet). Handles the adapter's chunked-payload format.
 * Lazy-loads @napi-rs/keyring (a native binding) so a missing/unsupported
 * platform binding degrades to null (skipping the Teamwork Graph layer)
 * rather than crashing the whole script at import time. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let keyringEntryCtor: any = null;
let keyringLoadFailed = false;

export async function readOAuthTokenFromKeyring(serverName: string): Promise<string | null> {
  if (keyringLoadFailed) return null;
  if (!keyringEntryCtor) {
    try {
      // Dynamic import so a missing native binding doesn't abort the script.
      const mod = await import("@napi-rs/keyring");
      keyringEntryCtor = mod.Entry;
    } catch {
      keyringLoadFailed = true;
      return null;
    }
  }
  const service = "pi-mcp-adapter.oauth";
  const account = `sha256-${createHash("sha256").update(serverName, "utf8").digest("hex")}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = new keyringEntryCtor(service, account) as any;
  const pwd: string | null = entry.getPassword();
  if (!pwd) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(pwd) as Record<string, unknown>;
  } catch {
    return null;
  }
  // Chunked manifest -> reassemble.
  if (parsed.__piMcpAdapterOAuthChunked === 1) {
    const chunkCount = parsed.chunkCount as number;
    const chunkDigest = parsed.chunkDigest as string;
    const parts: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunkAccount = `${account}.chunk.${chunkDigest}.${i}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chunk: string | null = new keyringEntryCtor(service, chunkAccount).getPassword();
      if (!chunk) return null;
      parts.push(chunk);
    }
    try {
      const full = JSON.parse(parts.join("")) as { tokens?: { accessToken?: string } };
      return full.tokens?.accessToken ?? null;
    } catch {
      return null;
    }
  }
  const tokens = parsed.tokens as { accessToken?: string } | undefined;
  return tokens?.accessToken ?? null;
}

/** Build an McpClient for the Atlassian MCP server, authenticating with the
 * OAuth access token pi-mcp-adapter stored in the keyring. `serverName` is
 * the Atlassian server name in mcp.json (default "atlassian", configurable
 * via settings.aura.mcpServers.atlassian). Throws if the user hasn't
 * authenticated that server via pi yet, or if the keyring native binding is
 * unavailable on this platform. */
export async function atlassianClient(serverName = "atlassian"): Promise<McpClient> {
  const config = loadMcpConfig();
  const server = config.mcpServers[serverName];
  if (!server || server.type !== "http" || !server.url) {
    throw new Error(
      `Atlassian MCP server "${serverName}" not found or not http in mcp.json. Add it with type=http to use dev-links.`
    );
  }
  const token = await readOAuthTokenFromKeyring(serverName);
  if (!token) {
    throw new Error(
      `No Atlassian OAuth token found in the OS keyring for "${serverName}". Run \`/mcp reconnect ${serverName}\` in pi to authenticate, then retry.`
    );
  }
  return new McpClient({
    serverName,
    url: server.url,
    authHeader: `Bearer ${token}`,
    clientName: "aura-digest-script",
  });
}
