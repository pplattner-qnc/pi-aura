// clients.ts — build McpClient instances for the servers this script uses.
//
// - Atlassian (Jira/Teamwork Graph): HTTP + Basic auth using the Atlassian
//   email + API token stored in the @pi-aura/shared keyring
//   ({service:"atlassian",name:"email"} + {service:"atlassian",name:"api_token"}).
//   The user provisions these via `/aura secrets edit`.
//
// Bitbucket is NOT an MCP client here: the bitbucket MCP server is stdio (npx),
// which the script can't easily drive, but the same credentials (email + API
// token) work against api.bitbucket.org directly via HTTP basic auth — see
// bitbucket.ts.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpClient } from "./mcp-client.js";
import type { Keyring } from "@pi-aura/shared/keyring";
import { createKeyring } from "@pi-aura/shared/keyring";

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

/** Read and parse ~/.config/mcp/mcp.json. Exported for tests that need to
 *  inject a temp config file. */
export function loadMcpConfig(path: string = MCP_CONFIG_PATH): McpConfig {
  return JSON.parse(readFileSync(path, "utf8")) as McpConfig;
}

/** Read the Atlassian email + API token from the @pi-aura/shared keyring.
 *  Trims whitespace on read so a trailing editor newline doesn't break auth.
 *  Throws an Error whose message names `/aura secrets edit` when either value
 *  is missing or empty. Shared by atlassianClient and bitbucket.ts (slice 5). */
export async function readAtlassianCredentials(
  keyring: Keyring,
): Promise<{ email: string; token: string }> {
  const rawEmail = await keyring.getSecret({ service: "atlassian", name: "email" });
  const rawToken = await keyring.getSecret({ service: "atlassian", name: "api_token" });
  const email = rawEmail?.trim() ?? "";
  const token = rawToken?.trim() ?? "";
  if (!email || !token) {
    throw new Error(
      "no Atlassian credential in keyring (run `/aura secrets edit`)",
    );
  }
  return { email, token };
}

/** Options for atlassianClient — primarily a test seam for injecting a fake
 *  Keyring and a temp mcp.json path. Production callers omit these. */
export interface AtlassianClientOptions {
  /** Inject a fake Keyring (defaults to createKeyring() at runtime). */
  keyring?: Keyring;
  /** Inject a temp mcp.json path (defaults to ~/.config/mcp/mcp.json). */
  configPath?: string;
}

/** Build an McpClient for the Atlassian MCP server, authenticating with HTTP
 *  Basic auth using the email + API token stored in the @pi-aura/shared
 *  keyring. `serverName` is the Atlassian server name in mcp.json (default
 *  "atlassian", configurable via settings.aura.mcpServers.atlassian). Throws
 *  if the server is not found / not http, or if the Atlassian credential is
 *  missing/empty (message names `/aura secrets edit`). */
export async function atlassianClient(
  serverName = "atlassian",
  opts?: AtlassianClientOptions,
): Promise<McpClient> {
  const config = loadMcpConfig(opts?.configPath);
  const server = config.mcpServers[serverName];
  if (!server || server.type !== "http" || !server.url) {
    throw new Error(
      `Atlassian MCP server "${serverName}" not found or not http in mcp.json. Add it with type=http to use dev-links.`,
    );
  }
  const keyring = opts?.keyring ?? (await createKeyring());
  const { email, token } = await readAtlassianCredentials(keyring);
  const credential = Buffer.from(`${email}:${token}`).toString("base64");
  return new McpClient({
    serverName,
    url: server.url,
    authHeader: `Basic ${credential}`,
    clientName: "aura-digest-script",
  });
}
