// Unit tests for genRestIndex local-embeddings build path.
//
// Seam: genRestIndex() / buildRestIndexAsync() must use the local provider
// by default (no settings needed) and embed all ops with "passage:" prefixing.
// The committed REST_INDEX ships real vectors + embedModelId.
//
// The local provider is MOCKED in tests (no real model download).
//
// Run with: node --experimental-strip-types scripts/src/gen-rest-index-local.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  buildRestIndexAsync,
  buildSemanticVectors,
  type RestIndexBlob,
} from "./gen-rest-index.ts";
import { CODE_TAGS, resolveCodeTags } from "./rest-code-tags.ts";
import type { EmbedProvider } from "@pi-aura/shared/embed/provider.js";

// LOCAL_MODEL_ID must match packages/shared/src/embed/local-provider.ts.
// Hardcoded here (not imported) to avoid --experimental-strip-types resolution
// issues with value imports from @pi-aura/shared subpaths.
const LOCAL_MODEL_ID = "Xenova/multilingual-e5-base";

const FIXTURE = join(
  import.meta.dirname,
  "..",
  "..",
  "packages",
  "shared",
  "test",
  "openapi-fixtures",
  "basic.yaml",
);

// ---------------------------------------------------------------------------
// Mock local provider — tracks prefixing and returns deterministic vectors
// ---------------------------------------------------------------------------

function makeMockLocalProvider(dims: number): EmbedProvider & {
  calls: { texts: string[] }[];
} {
  const calls: { texts: string[] }[] = [];
  const provider: EmbedProvider & { calls: typeof calls } = {
    modelId: LOCAL_MODEL_ID,
    calls,
    async embed(texts: string[]): Promise<Float32Array[]> {
      calls.push({ texts: [...texts] });
      return texts.map((text) => {
        const vec = new Float32Array(dims);
        for (let i = 0; i < dims; i++) {
          vec[i] = (text.charCodeAt(i % Math.max(text.length, 1)) % 10) / 10;
        }
        return vec;
      });
    },
  };
  return provider;
}

// ---------------------------------------------------------------------------
// buildRestIndexAsync with local provider — passage: prefixing
// ---------------------------------------------------------------------------

describe("buildRestIndexAsync — local provider passage: prefixing", () => {
  it("embeds op texts with 'passage: ' prefix when using the local provider", async () => {
    const mockProvider = makeMockLocalProvider(4);
    const blob = await buildRestIndexAsync(
      FIXTURE,
      CODE_TAGS,
      resolveCodeTags,
      {
        embedFn: async (texts) => mockProvider.embed(texts),
        embedModelId: mockProvider.modelId,
        dtype: "f32" as const,
      },
    );

    // The mock provider should have been called with "passage: "-prefixed texts
    assert.ok(mockProvider.calls.length > 0, "provider was called");
    const firstCallTexts = mockProvider.calls[0].texts;
    assert.ok(
      firstCallTexts.every((t) => t.startsWith("passage: ")),
      "all op texts prefixed with 'passage: '",
    );
  });

  it("records embedModelId = 'Xenova/multilingual-e5-base' in the blob", async () => {
    const mockProvider = makeMockLocalProvider(4);
    const blob = await buildRestIndexAsync(
      FIXTURE,
      CODE_TAGS,
      resolveCodeTags,
      {
        embedFn: async (texts) => mockProvider.embed(texts),
        embedModelId: LOCAL_MODEL_ID,
        dtype: "f32" as const,
      },
    );
    assert.equal(blob.embedModelId, LOCAL_MODEL_ID);
  });

  it("ships non-null vectors array with one entry per operation", async () => {
    const mockProvider = makeMockLocalProvider(4);
    const blob = await buildRestIndexAsync(
      FIXTURE,
      CODE_TAGS,
      resolveCodeTags,
      {
        embedFn: async (texts) => mockProvider.embed(texts),
        embedModelId: LOCAL_MODEL_ID,
        dtype: "f32" as const,
      },
    );
    assert.ok(blob.vectors, "vectors is not null");
    assert.ok(Array.isArray(blob.vectors));
    assert.equal(
      blob.vectors!.length,
      blob.metadata.length,
      "one vector per operation",
    );
  });

  it("records dims and dtype in the blob", async () => {
    const mockProvider = makeMockLocalProvider(6);
    const blob = await buildRestIndexAsync(
      FIXTURE,
      CODE_TAGS,
      resolveCodeTags,
      {
        embedFn: async (texts) => mockProvider.embed(texts),
        embedModelId: LOCAL_MODEL_ID,
        dtype: "i8" as const,
      },
    );
    assert.equal(blob.dims, 6, "dims recorded");
    assert.equal(blob.dtype, "i8", "dtype recorded");
  });
});

// ---------------------------------------------------------------------------
// buildSemanticVectors — passage: prefixing at the vector level
// ---------------------------------------------------------------------------

describe("buildSemanticVectors — passage: prefixing", () => {
  it("applies 'passage: ' prefix to op texts before embedding", async () => {
    const calls: { texts: string[] }[] = [];
    const provider: EmbedProvider = {
      modelId: LOCAL_MODEL_ID,
      async embed(texts: string[]): Promise<Float32Array[]> {
        calls.push({ texts: [...texts] });
        return texts.map(() => new Float32Array(3));
      },
    };
    const ops = [
      { operationId: "opA", text: "create task" },
      { operationId: "opB", text: "update capacity" },
    ];
    await buildSemanticVectors(ops, provider, "f32");
    assert.ok(calls.length > 0, "provider was called");
    assert.ok(
      calls[0].texts.every((t) => t.startsWith("passage: ")),
      "all op texts have 'passage: ' prefix",
    );
  });
});
