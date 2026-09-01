// embed/provider — the embedding provider seam.
//
// EmbedProvider is a small interface: modelId + embed(texts).
// createEmbedProvider(config?) reads aura.embed.* settings (or accepts
// injected config) and returns a provider or null. When no provider is
// configured → null (graceful: the caller falls back to FTS-only).
//
// The provider uses its OWN apiKey (NOT the Aura PAT). The Aura PAT is for
// REST API auth; embeddings are a separate service with separate credentials.
//
// Supports at least one HTTP provider: OpenAI-style /v1/embeddings via fetch.
// Configurable via baseURL, not hardcoded.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface EmbedProvider {
  /** The model id this provider uses (for the model-id guard). */
  modelId: string;
  /** Embed a batch of texts → one Float32Array per text (all same length). */
  embed(texts: string[]): Promise<Float32Array[]>;
}

export interface EmbedProviderConfig {
  /** Provider type, e.g. "openai" (OpenAI-style /v1/embeddings). */
  provider?: string;
  /** Model id, e.g. "text-embedding-3-small". */
  model?: string;
  /** API key for the embedding service (NOT the Aura PAT). */
  apiKey?: string;
  /** Base URL for the embedding service (e.g. "https://api.openai.com/v1"). */
  baseURL?: string;
}

export interface CreateEmbedProviderOptions {
  /** Injectable fetch implementation for testing. */
  fetchImpl?: typeof fetch;
}

export interface EmbedSettings {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

/**
 * Read the `aura.embed` block from pi's global settings.json and return the
 * embed config. Also checks env vars (AURA_EMBED_PROVIDER, AURA_EMBED_MODEL,
 * AURA_EMBED_API_KEY, AURA_EMBED_BASE_URL) as overrides. Returns `{}` when
 * absent so createEmbedProvider returns null (graceful FTS-only fallback).
 */
export function loadEmbedSettings(
  settingsPath: string = SETTINGS_PATH,
): EmbedSettings {
  let settings: { aura?: { embed?: EmbedSettings } } = {};
  try {
    if (existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, "utf8");
      settings = JSON.parse(raw);
    }
  } catch {
    // ignore — fall back to env
  }

  const embed = settings.aura?.embed ?? {};
  return {
    provider: process.env.AURA_EMBED_PROVIDER || embed.provider || undefined,
    model: process.env.AURA_EMBED_MODEL || embed.model || undefined,
    apiKey: process.env.AURA_EMBED_API_KEY || embed.apiKey || undefined,
    baseURL: process.env.AURA_EMBED_BASE_URL || embed.baseURL || undefined,
  };
}

/**
 * Create an embedding provider from the given config.
 *
 * Returns null when the config is absent or incomplete (no provider / model /
 * apiKey), so callers can gracefully fall back to FTS-only search.
 *
 * The returned provider's embed() calls the OpenAI-style /v1/embeddings
 * endpoint via fetch, sending the model id + API key + texts.
 */
export async function createEmbedProvider(
  config: EmbedProviderConfig,
  opts: CreateEmbedProviderOptions = {},
): Promise<EmbedProvider | null> {
  const { provider, model, apiKey, baseURL } = config;

  // No provider configured → null (graceful fallback)
  if (!provider || !model || !apiKey) {
    return null;
  }

  // We support "openai" (OpenAI-style /v1/embeddings). Unknown providers → null.
  if (provider !== "openai") {
    return null;
  }

  if (!baseURL) {
    return null;
  }

  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    modelId: model,
    async embed(texts: string[]): Promise<Float32Array[]> {
      const url = `${baseURL}/embeddings`;
      const resp = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(
          `embed: HTTP ${resp.status} from ${url}` +
          (body ? ` — ${body.slice(0, 200)}` : ""),
        );
      }

      const json = (await resp.json()) as { data: { embedding: number[] }[] };

      return json.data.map((d) => new Float32Array(d.embedding));
    },
  };
}
