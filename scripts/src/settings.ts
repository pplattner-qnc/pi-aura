// settings.ts — read the aura-digest config from ~/.pi/agent/settings.json.
//
// The settings file is sops-nix-managed (read-only symlink into the nix store).
// The user edits ~/nixos/.../settings.nix and runs a nixos switch; this module
// just reads the rendered JSON at runtime. Project settings (.pi/settings.json)
// would override globals, but we only read the global file for auraDigest.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

export interface AuraDigestSettings {
  /** Atlassian cloud UUID (e.g. "0551a77f-..."); passed to Teamwork Graph calls. */
  jiraCloudId: string;
  /** GitHub fallback: `gh search prs "<key>" --owner <org>` is scoped to these owners. */
  github: { owners: string[] };
  /** Bitbucket fallback: workspace + preferredRepos (searched first; the
   * workspace repo list is fetched for the similarity fallback). */
  bitbucket: { workspace: string; preferredRepos: string[] };
}

/** Read the `auraDigest` block from pi's global settings.json. Returns null if
 * the file or key is missing (the dev-links feature degrades to "no config"). */
export function loadSettings(settingsPath: string = SETTINGS_PATH): AuraDigestSettings | null {
  if (!existsSync(settingsPath)) return null;
  try {
    const raw = readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw) as { auraDigest?: AuraDigestSettings };
    return settings.auraDigest ?? null;
  } catch {
    return null;
  }
}
