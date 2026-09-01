// Unit tests for createEmbedProvider — the embedding provider seam.
//
// Seam: createEmbedProvider(config?) reads aura.embed.* settings/env and
// returns an EmbedProvider or null. The HTTP call (fetch) is mockable.
//
// Run with: cd packages/shared && npx tsx --test test/embed/provider.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createEmbedProvider,
} from "../../src/embed/provider.js";

// ---------------------------------------------------------------------------
// createEmbedProvider
// ---------------------------------------------------------------------------

describe("createEmbedProvider", () => {
  it("returns null when no provider is configured (no config, no env)", async () => {
    const provider = await createEmbedProvider({});
    assert.equal(provider, null, "null when no config");
  });

  it("returns null when config is empty", async () => {
    const provider = await createEmbedProvider({ provider: "", model: "" });
    assert.equal(provider, null);
  });

  it("returns an EmbedProvider when provider + model + apiKey configured", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
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
    assert.ok(provider, "provider returned when configured");
    assert.equal(typeof provider!.embed, "function");
    assert.equal(typeof provider!.modelId, "string");
    assert.equal(provider!.modelId, "text-embedding-3-small");
  });

  it("embed() calls the HTTP endpoint and returns Float32Array[]", async () => {
    const callArgs: { url: string; init: RequestInit }[] = [];
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      callArgs.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          data: [
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.4, 0.5, 0.6] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const provider = await createEmbedProvider(
      {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "test-key",
        baseURL: "https://api.openai.com/v1",
      },
      { fetchImpl: mockFetch },
    );
    assert.ok(provider);

    const vectors = await provider!.embed(["hello", "world"]);
    assert.equal(vectors.length, 2, "one vector per text");
    assert.ok(vectors[0] instanceof Float32Array, "returns Float32Array");
    assert.equal(vectors[0].length, 3, "3-dim vector");
    assert.ok(Math.abs(vectors[0][0] - 0.1) < 1e-5, "first val ~0.1");
    assert.ok(Math.abs(vectors[1][2] - 0.6) < 1e-5, "second vec third val ~0.6");
  });

  it("embed() sends the model id + API key + texts in the request body", async () => {
    let capturedBody: unknown = null;
    let capturedHeaders: Record<string, string> = {};
    let capturedUrl = "";

    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ data: [{ embedding: [1.0] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const provider = await createEmbedProvider(
      {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "sk-test-123",
        baseURL: "https://api.openai.com/v1",
      },
      { fetchImpl: mockFetch },
    );
    assert.ok(provider);
    await provider!.embed(["test text"]);

    assert.ok(capturedUrl.includes("/embeddings"), "hits /embeddings endpoint");
    assert.equal((capturedBody as { model: string }).model, "text-embedding-3-small");
    assert.deepEqual((capturedBody as { input: string[] }).input, ["test text"]);
    assert.ok(
      capturedHeaders["Authorization"]?.includes("sk-test-123") ||
      capturedHeaders["authorization"]?.includes("sk-test-123"),
      "sends API key in Authorization header",
    );
  });

  it("throws on HTTP error from the embedding endpoint", async () => {
    const mockFetch = async () =>
      new Response("Internal Server Error", { status: 500 });

    const provider = await createEmbedProvider(
      {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "test-key",
        baseURL: "https://api.openai.com/v1",
      },
      { fetchImpl: mockFetch },
    );
    assert.ok(provider);
    await assert.rejects(
      () => provider!.embed(["test"]),
      (err: Error) => {
        assert.ok(err.message.includes("embed"), "error mentions embed");
        return true;
      },
    );
  });

  it("uses a custom baseURL when provided", async () => {
    let capturedUrl = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.1] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const provider = await createEmbedProvider(
      {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "test-key",
        baseURL: "https://custom.endpoint.com/api",
      },
      { fetchImpl: mockFetch },
    );
    assert.ok(provider);
    await provider!.embed(["x"]);
    assert.ok(capturedUrl.includes("custom.endpoint.com"), "uses custom baseURL");
    assert.ok(capturedUrl.includes("/embeddings"), "hits /embeddings");
  });
});
