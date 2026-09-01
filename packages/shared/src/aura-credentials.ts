// aura-credentials — the single credential resolution path for the aura CLI.
//
// resolveAuraCredentials() returns { baseUrl, pat } by reusing the same
// primitives createDefaultAuraClient() uses:
//   1. loadAuraClientSettings() → reads aura.baseUrl from settings.json
//   2. createKeyring().getSecret({service:"aura",name:"pat"}) → the PAT
//
// createDefaultAuraClient() is refactored to call resolveAuraCredentials()
// so there is exactly one credential resolution path in the codebase.
//
// Throws the same actionable errors as createDefaultAuraClient() for
// missing baseUrl / missing PAT.

import { loadAuraClientSettings } from "./settings.js";
import { createKeyring } from "./keyring/index.js";
import type { Keyring } from "./keyring/index.js";

export interface AuraCredentials {
  baseUrl: string;
  pat: string;
}

export interface ResolveAuraCredentialsOptions {
  /** Override the settings.json path (test hook; defaults to the real path). */
  settingsPath?: string;
  /** Inject a keyring (test hook; defaults to createKeyring()). */
  keyring?: Keyring;
}

/**
 * Resolve the Aura REST API credentials: baseUrl from settings + PAT from the
 * OS keyring. The single credential resolution path — createDefaultAuraClient()
 * delegates here so both the typed client and the generic REST invoker share
 * one auth story.
 *
 * Throws actionable errors for missing baseUrl / missing PAT.
 */
export async function resolveAuraCredentials(
  opts: ResolveAuraCredentialsOptions = {},
): Promise<AuraCredentials> {
  const settings = loadAuraClientSettings(opts.settingsPath);
  if (!settings.baseUrl) {
    throw new Error(
      "Missing `aura.baseUrl` in ~/.pi/agent/settings.json. Add the Aura REST API base URL (e.g. \"https://aura.dev-anwalt.de/api\") to the `aura` block.",
    );
  }

  const keyring = opts.keyring ?? (await createKeyring());
  const pat = await keyring.getSecret({ service: "aura", name: "pat" });
  if (pat === null) {
    throw new Error(
      "No Aura PAT found in the OS keyring. Run `/aura secrets discover` to store one (service: \"aura\", name: \"pat\").",
    );
  }

  return { baseUrl: settings.baseUrl, pat };
}
