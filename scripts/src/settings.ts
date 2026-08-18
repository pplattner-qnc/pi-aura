// settings.ts — read the `aura` config block from ~/.pi/agent/settings.json.
//
// The settings file is sops-nix-managed (read-only symlink into the nix store).
// The user edits ~/nixos/.../settings.nix and runs a nixos switch; this module
// just reads the rendered JSON at runtime.
//
// Shape (with defaults shown):
//   "aura": {
//     "mcpServers": {
//       "aura": "aura-mcp-dev",
//       "atlassian": "atlassian",
//       "atlassianBitbucket": "atlassian-bitbucket"
//     },
//     "digest": { jiraCloudId, github, bitbucket }
//   }
// `mcpServers` maps logical names to the actual MCP server names in
// ~/.config/mcp/mcp.json. Defaults match the standard install, so the block is
// only needed if a server was renamed. Both the digest script and the aura
// (artifact/wiki) script read these.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

export interface McpServerNames {
  /** Aura server name in mcp.json (HTTP + bearer). */
  aura: string;
  /** Atlassian (Jira) server name in mcp.json (HTTP + OAuth). */
  atlassian: string;
  /** Atlassian Bitbucket server name in mcp.json (stdio; we read its env). */
  atlassianBitbucket: string;
}

export interface AuraDigestSettings {
  /** Atlassian cloud UUID (e.g. "0551a77f-..."); passed to Teamwork Graph calls. */
  jiraCloudId: string;
  /** GitHub fallback: `gh search prs "<key>" --owner <org>` is scoped to these owners. */
  github: { owners: string[] };
  /** Bitbucket fallback: workspace + preferredRepos (searched first; the
   * workspace repo list is fetched for the similarity fallback). */
  bitbucket: { workspace: string; preferredRepos: string[] };
}

export interface AuraSettings {
  mcpServers: McpServerNames;
  digest: AuraDigestSettings | null;
}

const DEFAULT_MCP_SERVERS: McpServerNames = {
  aura: "aura-mcp-dev",
  atlassian: "atlassian",
  atlassianBitbucket: "atlassian-bitbucket",
};

interface RawAuraSettings {
  mcpServers?: Partial<McpServerNames>;
  digest?: AuraDigestSettings;
}

/** Read the `aura` block from pi's global settings.json. Returns defaults for
 * any missing fields, so the feature works out-of-the-box without settings. */
export function loadSettings(settingsPath: string = SETTINGS_PATH): AuraSettings {
  const defaults: AuraSettings = { mcpServers: { ...DEFAULT_MCP_SERVERS }, digest: null };
  if (!existsSync(settingsPath)) return defaults;
  try {
    const raw = readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw) as { aura?: RawAuraSettings };
    const aura = settings.aura;
    if (!aura) return defaults;
    return {
      mcpServers: { ...DEFAULT_MCP_SERVERS, ...(aura.mcpServers ?? {}) },
      digest: aura.digest ?? null,
    };
  } catch {
    return defaults;
  }
}
