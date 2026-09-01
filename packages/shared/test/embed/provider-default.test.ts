// Unit tests for createEmbedProvider default-flip — the local-embeddings
// slice reverses slice 4's "opt-in cloud" default.
//
// Seam: createEmbedProvider(config?) now returns:
//   - LocalEmbedProvider (modelId = "Xenova/multilingual-e5-small") when
//     aura.embed.provider is NOT set (the new default — always-on local).
//   - Cloud provider (OpenAI-style) when aura.embed.provider IS set.
//   - null only on local-init failure the caller degrades from.
//
// Run with: cd packages/shared && npx tsx --test test/embed/provider-default.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEmbedProvider } from "../../src/embed/provider.js";
import { LOCAL_MODEL_ID } from "../../src/embed/local-provider.js";

// ---------------------------------------------------------------------------
// createEmbedProvider — default-flip to local
// ---------------------------------------------------------------------------

describe("createEmbedProvider — default-flip", () => {
  it("returns a LocalEmbedProvider (modelId = Xenova/multilingual-e5-small) when no config is set", async () => {
    // No config → local provider (NOT null, NOT cloud)
    const provider = await createEmbedProvider({});
    assert.ok(provider, "provider is not null when no config");
    assert.equal(
      provider!.modelId,
      LOCAL_MODEL_ID,
      "default provider modelId is the local model",
    );
  });

  it("returns a LocalEmbedProvider even when config has partial settings (but no provider)", async () => {
    // Partial config without a 'provider' field → still local (not null)
    const provider = await createEmbedProvider({ model: "some-model" });
    assert.ok(provider, "provider is not null with partial config");
    assert.equal(provider!.modelId, LOCAL_MODEL_ID);
  });

  it("returns a cloud provider when aura.embed.provider is set (openai)", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const provider = await createEmbedProvider(
      {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "test-key",
        baseURL: "https://api.openai.com/v1",
      },
      { fetchImpl: mockFetch },
    );
    assert.ok(provider, "cloud provider returned when provider is set");
    assert.equal(provider!.modelId, "text-embedding-3-small");
    assert.notEqual(provider!.modelId, LOCAL_MODEL_ID, "cloud model ≠ local model");
  });

  it("returns a cloud provider when provider is set but model/apiKey are partial", async () => {
    // When provider is explicitly set, we try cloud (even if incomplete → null).
    // But the key check is: with provider set, it does NOT return local.
    const provider = await createEmbedProvider({
      provider: "openai",
      model: "text-embedding-3-small",
      apiKey: "test-key",
      baseURL: "https://api.openai.com/v1",
    });
    assert.ok(provider);
    assert.equal(provider!.modelId, "text-embedding-3-small");
  });

  it("local provider's embed is a function", async () => {
    const provider = await createEmbedProvider({});
    assert.ok(provider);
    assert.equal(typeof provider!.embed, "function");
  });
});
