// Unit tests for cosineRank — cosine similarity ranking over op vectors.
//
// Seam: cosineRank(queryVec, opVecs, dtype) → ranked { operationId, score }[]
// is a PURE function. It quantizes the query to the index dtype if needed
// (i8 index + f32 query → quantize the query to i8).
//
// Run with: cd packages/shared && npx tsx --test test/embed/cosine.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cosineRank } from "../../src/embed/cosine.js";

// ---------------------------------------------------------------------------
// cosineRank
// ---------------------------------------------------------------------------

describe("cosineRank", () => {
  it("ranks by cosine similarity (descending)", () => {
    const queryVec = new Float32Array([1, 0, 0]);
    const opVecs = [
      { operationId: "opA", vec: new Float32Array([1, 0, 0]) },     // cos = 1.0
      { operationId: "opB", vec: new Float32Array([0, 1, 0]) },     // cos = 0.0
      { operationId: "opC", vec: new Float32Array([0.9, 0.1, 0]) }, // cos ≈ 0.994
    ];
    const results = cosineRank(queryVec, opVecs, "f32");
    assert.equal(results.length, 3);
    assert.equal(results[0].operationId, "opA", "highest similarity first");
    assert.equal(results[2].operationId, "opB", "lowest similarity last");
    assert.ok(results[0].score > results[2].score, "scores descending");
  });

  it("returns cosine score in [-1, 1]", () => {
    const queryVec = new Float32Array([1, 0]);
    const opVecs = [
      { operationId: "op", vec: new Float32Array([1, 0]) },
    ];
    const results = cosineRank(queryVec, opVecs, "f32");
    assert.equal(results.length, 1);
    assert.ok(results[0].score <= 1.0 + 1e-6, "score <= 1");
    assert.ok(results[0].score >= -1.0 - 1e-6, "score >= -1");
  });

  it("handles identical vectors (cosine = 1.0)", () => {
    const queryVec = new Float32Array([1, 0, 0]);
    const opVecs = [
      { operationId: "same", vec: new Float32Array([1, 0, 0]) },
    ];
    const results = cosineRank(queryVec, opVecs, "f32");
    assert.ok(Math.abs(results[0].score - 1.0) < 1e-6, "cosine ~1.0 for identical");
  });

  it("handles orthogonal vectors (cosine = 0.0)", () => {
    const queryVec = new Float32Array([1, 0]);
    const opVecs = [
      { operationId: "orth", vec: new Float32Array([0, 1]) },
    ];
    const results = cosineRank(queryVec, opVecs, "f32");
    assert.ok(Math.abs(results[0].score) < 1e-6, "cosine ~0.0 for orthogonal");
  });

  it("handles zero vector (cosine = 0.0, no NaN)", () => {
    const queryVec = new Float32Array([1, 0]);
    const opVecs = [
      { operationId: "zero", vec: new Float32Array([0, 0]) },
    ];
    const results = cosineRank(queryVec, opVecs, "f32");
    assert.ok(!Number.isNaN(results[0].score), "no NaN for zero vector");
    assert.ok(Math.abs(results[0].score) < 1e-6, "cosine ~0.0 for zero vector");
  });

  it("sorts ties by operationId for determinism", () => {
    const queryVec = new Float32Array([1, 0]);
    const opVecs = [
      { operationId: "zzz", vec: new Float32Array([1, 0]) },
      { operationId: "aaa", vec: new Float32Array([1, 0]) },
    ];
    const results = cosineRank(queryVec, opVecs, "f32");
    assert.equal(results[0].operationId, "aaa", "tie broken by operationId");
    assert.equal(results[1].operationId, "zzz");
  });

  it("returns empty array for no op vectors", () => {
    const queryVec = new Float32Array([1, 0]);
    const results = cosineRank(queryVec, [], "f32");
    assert.deepEqual(results, []);
  });

  // --- i8 quantized dtype ---

  it("quantizes a Float32Array query to i8 when dtype is i8", () => {
    // query is f32; op vecs are i8 (Int8Array)
    const queryVec = new Float32Array([0.5, -0.5, 0.0]);
    const opVecs = [
      { operationId: "opA", vec: new Int8Array([64, -64, 0]) },  // ~0.5, -0.5, 0
    ];
    const results = cosineRank(queryVec, opVecs, "i8");
    assert.equal(results.length, 1);
    // The score should be high since the vectors are similar after quantization
    assert.ok(results[0].score > 0.9, "high similarity after quantization");
  });

  it("works with Int8Array query + Int8Array op vectors (both i8)", () => {
    const queryVec = new Int8Array([100, 0, 0]);
    const opVecs = [
      { operationId: "opA", vec: new Int8Array([100, 0, 0]) },
      { operationId: "opB", vec: new Int8Array([0, 100, 0]) },
    ];
    const results = cosineRank(queryVec, opVecs, "i8");
    assert.equal(results[0].operationId, "opA");
    assert.ok(Math.abs(results[0].score - 1.0) < 1e-6, "identical i8 vecs → cos=1");
  });

  it("ranks i8 vectors correctly by similarity", () => {
    const queryVec = new Int8Array([127, 0]);
    const opVecs = [
      { operationId: "similar", vec: new Int8Array([120, 10]) },
      { operationId: "different", vec: new Int8Array([0, 127]) },
    ];
    const results = cosineRank(queryVec, opVecs, "i8");
    assert.equal(results[0].operationId, "similar", "more similar first");
  });
});
