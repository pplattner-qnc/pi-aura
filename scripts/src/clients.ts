// clients.ts — build McpClient instances for the servers this script uses.
//
// - Atlassian (Jira/Teamwork Graph): HTTP + Basic auth using the Atlassian
//   email + API token stored in the @pi-aura/shared keyring
//   ({service:"atlassian",name:"email"} + {service:"atlassian",name:"api_token"}).
//   The user provisions these via `/aura secrets edit`. This replaces the
//   old pi-mcp-adapter OAuth token read (readOAuthTokenFromKeyring, kept
//   below for slice 4 to delete after the grep sweep).
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
  // getPassword() can throw on a revoked keyring or D-Bus error; wrap so a
  // runtime keyring failure degrades to null (skipping TWG) rather than
  // propagating. The caller (buildAtlassianClient) turns null into a silent
  // skip, so we log the reason to stderr for diagnosability.
  let pwd: string | null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = new keyringEntryCtor(service, account) as any;
    pwd = entry.getPassword();
  } catch (e) {
    // Re-throw with a clear message; buildAtlassianClient catches and records
    // it as a digest warning so the caller sees the degradation reason.
    throw new Error(`keyring read failed for ${serverName}: ${e instanceof Error ? e.message : String(e)}`);
  }
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
      let chunk: string | null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chunk = new keyringEntryCtor(service, chunkAccount).getPassword();
      } catch {
        return null;
      }
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
      "No Atlassian credential in keyring (run `/aura secrets edit`)",
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
