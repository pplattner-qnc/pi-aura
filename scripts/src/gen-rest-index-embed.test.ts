// Unit tests for buildSemanticVectors — the build-time op vector embedding step.
//
// Seam: buildSemanticVectors(ops, provider) → { vectors, embedModelId, dims, dtype }
// or null when no provider. The provider is MOCKED to deterministic vectors
// in tests. buildRestIndex is extended to accept an optional embedFn.
//
// Run with: node --experimental-strip-types scripts/src/gen-rest-index-embed.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  buildRestIndex,
  buildRestIndexAsync,
  buildSemanticVectors,
  assertSizeBudget,
  serializeRestIndexBlob,
  type RestIndexBlob,
  type SemanticVectors,
} from "./gen-rest-index.ts";
import { CODE_TAGS, resolveCodeTags } from "./rest-code-tags.ts";
import type { EmbedProvider } from "@pi-aura/shared/embed/provider";

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
// Mock embedding provider — deterministic vectors for testing
// ---------------------------------------------------------------------------

function makeMockProvider(modelId: string, dims: number): EmbedProvider {
  return {
    modelId,
    async embed(texts: string[]): Promise<Float32Array[]> {
      // Deterministic: hash each text to a reproducible vector
      return texts.map((text) => {
        const vec = new Float32Array(dims);
        for (let i = 0; i < dims; i++) {
          // Simple deterministic function of text + index
          vec[i] = (text.charCodeAt(i % text.length) % 10) / 10;
        }
        return vec;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// buildSemanticVectors
// ---------------------------------------------------------------------------

describe("buildSemanticVectors", () => {
  it("returns null when provider is null", async () => {
    const result = await buildSemanticVectors([], null);
    assert.equal(result, null);
  });

  it("returns vectors + embedModelId + dims + dtype when provider is given", async () => {
    const ops = [
      { operationId: "opA", text: "some text here" },
      { operationId: "opB", text: "other text" },
    ];
    const provider = makeMockProvider("test-model-384", 4);
    const result = await buildSemanticVectors(ops, provider, "f32");
    assert.ok(result, "result is not null");
    assert.equal(result!.embedModelId, "test-model-384");
    assert.equal(result!.dims, 4);
    assert.equal(result!.dtype, "f32");
    assert.ok(Array.isArray(result!.vectors));
    assert.equal(result!.vectors.length, 2, "one vector per op");
    assert.equal(result!.vectors[0].operationId, "opA");
    assert.equal(result!.vectors[1].operationId, "opB");
  });

  it("stores vectors as Float32Array for f32 dtype", async () => {
    const ops = [{ operationId: "op", text: "text" }];
    const provider = makeMockProvider("model", 3);
    const result = await buildSemanticVectors(ops, provider, "f32");
    assert.ok(result);
    assert.ok(result!.vectors[0].vec instanceof Float32Array, "f32 dtype → Float32Array");
  });

  it("stores vectors as Int8Array for i8 dtype", async () => {
    const ops = [{ operationId: "op", text: "text" }];
    const provider = makeMockProvider("model", 3);
    const result = await buildSemanticVectors(ops, provider, "i8");
    assert.ok(result);
    assert.equal(result!.dtype, "i8");
    assert.ok(result!.vectors[0].vec instanceof Int8Array, "i8 dtype → Int8Array");
  });

  it("throws loudly naming the operation when embed fails", async () => {
    const failingProvider: EmbedProvider = {
      modelId: "failing-model",
      async embed(): Promise<Float32Array[]> {
        throw new Error("connection refused");
      },
    };
    const ops = [{ operationId: "brokenOp", text: "text" }];
    await assert.rejects(
      () => buildSemanticVectors(ops, failingProvider),
      (err: Error) => {
        assert.ok(err.message.includes("brokenOp"), "names the operation");
        assert.ok(err.message.includes("connection refused"), "includes the underlying error");
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// buildRestIndex with embedding
// ---------------------------------------------------------------------------

describe("buildRestIndex with embedding", () => {
  it("returns blob with null vectors when no embedFn provided", () => {
    const blob = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);
    assert.equal(blob.embedModelId, null);
    assert.equal(blob.vectors, null);
  });

  it("returns blob with vectors + embedModelId when embedFn is provided", async () => {
    const mockProvider = makeMockProvider("test-model", 4);
    const embedFn = async (texts: string[]) => mockProvider.embed(texts);

    const blob = await buildRestIndexAsync(
      FIXTURE,
      CODE_TAGS,
      resolveCodeTags,
      { embedFn, embedModelId: "test-model", dims: 4, dtype: "f32" as const },
    );
    assert.ok(blob.embedModelId, "embedModelId is set");
    assert.equal(blob.embedModelId, "test-model");
    assert.ok(blob.vectors, "vectors are set");
    assert.ok(Array.isArray(blob.vectors));
    assert.ok(blob.vectors!.length > 0, "has op vectors");
    // Each vector entry has operationId + vec
    assert.ok(blob.vectors![0].operationId, "first vector has operationId");
    assert.ok(blob.vectors![0].vec, "first vector has vec");
  });

  it("serializes and deserializes the blob with vectors (deterministic JSON)", async () => {
    const mockProvider = makeMockProvider("test-model", 3);
    const embedFn = async (texts: string[]) => mockProvider.embed(texts);
    const blob1 = await buildRestIndexAsync(
      FIXTURE,
      CODE_TAGS,
      resolveCodeTags,
      { embedFn, embedModelId: "test-model", dims: 3, dtype: "f32" as const },
    );
    const blob2 = await buildRestIndexAsync(
      FIXTURE,
      CODE_TAGS,
      resolveCodeTags,
      { embedFn, embedModelId: "test-model", dims: 3, dtype: "f32" as const },
    );
    const s1 = serializeRestIndexBlob(blob1);
    const s2 = serializeRestIndexBlob(blob2);
    assert.equal(s1, s2, "byte-identical with vectors");
  });

  it("size budget assertion works with vectors", async () => {
    const mockProvider = makeMockProvider("test-model", 3);
    const embedFn = async (texts: string[]) => mockProvider.embed(texts);
    const blob = await buildRestIndexAsync(
      FIXTURE,
      CODE_TAGS,
      resolveCodeTags,
      { embedFn, embedModelId: "test-model", dims: 3, dtype: "f32" as const },
    );
    const size = serializeRestIndexBlob(blob).length;
    // Should be under a generous budget
    assert.doesNotThrow(() => assertSizeBudget(blob, size * 2));
    // And should fail under a tiny budget
    assert.throws(() => assertSizeBudget(blob, 1));
  });
});
