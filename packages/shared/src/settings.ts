// settings.ts (shared) — minimal reader for the `aura` block from
// ~/.pi/agent/settings.json.
//
// This is a deliberately minimal copy for the aura-client task: it reads only
// the new `aura.baseUrl` field the REST client needs. scripts/src/settings.ts
// keeps its own, richer copy (mcpServers + digest) until the call-site-
// migration task reconciles the two.
//
// Shape (new `baseUrl` field added by Q4):
//   "aura": {
//     "baseUrl": "https://aura.dev-anwalt.de/api",
//     "mcpServers": { ... },
//     "digest": { ... }
//   }

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

export interface AuraClientSettings {
  /** REST API base URL, e.g. "https://aura.dev-anwalt.de/api". */
  baseUrl?: string;
}

/**
 * Read the `aura` block from pi's global settings.json and return the subset
 * the AuraClient factory needs (just `baseUrl` for now). Returns `{}` when
 * the file or the `aura` block is absent so the caller can decide how to
 * handle a missing baseUrl.
 */
export function loadAuraClientSettings(
  settingsPath: string = SETTINGS_PATH,
): AuraClientSettings {
  if (!existsSync(settingsPath)) return {};
  try {
    const raw = readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw) as { aura?: { baseUrl?: string } };
    const aura = settings.aura;
    if (!aura) return {};
    return { baseUrl: aura.baseUrl };
  } catch {
    return {};
  }
}
