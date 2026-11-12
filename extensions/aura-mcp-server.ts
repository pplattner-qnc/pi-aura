/**
 * Aura MCP server registration extension.
 *
 * One concern: registering the model-facing `aura-mcp-dev` MCP server with
 * pi when the package loads, so a session that never configured any MCP
 * server still gets the Aura tools. The endpoint derives from the shared
 * settings (`aura.baseUrl`, the REST base, at `/mcp` on the same instance)
 * and the PAT comes from the OS keyring (service "aura", name "pat"), the
 * same credential path every other Aura call in the package uses. With no
 * PAT stored the extension registers nothing and stays silent: the package
 * loads cleanly, exactly as before this extension existed.
 *
 * Precedence is pi's, not ours: a server entry the user configured
 * themselves (in the agent or project `mcp.json`) overrides the package's
 * registration inside pi's MCP extension, which skips extension
 * registrations whose namespace a configured entry already defines. The
 * extension therefore registers unconditionally when credentials exist and
 * deliberately does not reimplement the rule; the dependency-contract guard
 * in aura-mcp-server.test.ts pins the pi-level behavior this relies on.
 * (The `RegisteredMcpServer` note "A server of the same name in mcp.json
 * takes precedence" is the API contract of `pi.registerMcpServer` itself.)
 *
 * Timing: the factory is async on purpose. pi awaits extension factories
 * during extension load and reads extension-registered servers on
 * `session_start`, so registering after the awaited keyring read still
 * lands inside the load window and the server connects at startup. Every
 * credential failure (missing settings, missing PAT, broken keyring) is a
 * silent skip, never a load error. An error thrown by
 * `pi.registerMcpServer` itself (invalid config, or the name already
 * registered by another extension) propagates: that is a genuine conflict
 * pi reports as an extension load error, not a credentials absence.
 *
 * This extension owns only the model-facing registration. The package's
 * own data path (mention machinery, feedback tool) talks to the same
 * server through the typed wrapper (aura-mcp-client.ts) over its own
 * client instance; the two connections share the endpoint and the PAT but
 * are separate connections by design (pi does not expose its live tool
 * connection to extension code).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AURA_MCP_SERVER_NAME, auraMcpEndpointFromBaseUrl } from "./aura-mcp-contract.ts";
import { loadAuraMcpCredentials, type AuraMcpCredentials } from "./aura-mcp-client.ts";

/** The MCP server config the package registers (the `mcpServers` entry
 *  shape pi accepts, HTTP transport, PAT as bearer header). Exposure stays
 *  at pi's default (`codemode`), matching how the `aura` skill teaches the
 *  tools and how a hand-written user entry behaves. */
export interface AuraMcpServerConfig {
  type: "http";
  url: string;
  headers: Record<string, string>;
  description: string;
}

/**
 * The registration decision: register (with the concrete server config)
 * when both credentials exist, otherwise skip, silently naming the
 * missing piece for tests and debugging.
 */
export function decideAuraMcpRegistration(credentials: {
  baseUrl?: string;
  pat: string | null;
}): { action: "register"; config: AuraMcpServerConfig } | { action: "skip"; reason: "no-pat" | "no-base-url" } {
  if (credentials.pat === null || credentials.pat === "") {
    return { action: "skip", reason: "no-pat" };
  }
  if (!credentials.baseUrl) {
    return { action: "skip", reason: "no-base-url" };
  }
  return {
    action: "register",
    config: {
      type: "http",
      url: auraMcpEndpointFromBaseUrl(credentials.baseUrl),
      headers: { Authorization: `Bearer ${credentials.pat}` },
      description:
        "Aura project management platform: tasks, artifacts, wiki, feedback (registered by the pi-aura package)",
    },
  };
}

export interface RegisterAuraMcpExtensionOptions {
  /** Inject the credential read (test hook; defaults to
   *  {@link loadAuraMcpCredentials} over the package's dynamic-import
   *  seams). */
  loadCredentials?: () => Promise<AuraMcpCredentials>;
}

/**
 * The extension factory body. Awaited by pi during extension load, so the
 * registration below lands before `session_start` reads it.
 */
export default async function registerAuraMcpExtension(
  pi: ExtensionAPI,
  options: RegisterAuraMcpExtensionOptions = {},
): Promise<void> {
  let credentials: AuraMcpCredentials;
  try {
    credentials = options.loadCredentials ? await options.loadCredentials() : await loadAuraMcpCredentials();
  } catch {
    // A broken credential seam must not break the package load.
    return;
  }
  const decision = decideAuraMcpRegistration(credentials);
  if (decision.action === "skip") {
    // No PAT, or no base URL: the package loads cleanly and stays silent.
    return;
  }
  // Let genuine registration errors (invalid config, another extension
  // already registered the name) propagate as extension load errors.
  pi.registerMcpServer(AURA_MCP_SERVER_NAME, decision.config);
}
