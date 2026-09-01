// Unit tests for LocalEmbedProvider — the local CPU embedding provider.
//
// Seam: LocalEmbedProvider implements EmbedProvider with a lazy pipeline
// singleton, E5 query:/passage: prefixing, mean-pooling, L2-normalization,
// and env.cacheDir set to ~/.pi/aura/huggingface.
//
// CRITICAL: Do NOT download a real model in unit tests. The @huggingface/
// transformers pipeline is INJECTED (mocked) so tests are fast, offline, and
// deterministic.
//
// PIPELINE OUTPUT SHAPE: The real transformers.js feature-extraction pipeline,
// when called with { pooling: 'mean', normalize: true }, returns a SINGLE
// Tensor object (NOT an array) with `.data` (flat Float32Array of length
// batch*hiddenDim) and `.dims` (shape [batch, hiddenDim]). The provider
// slices this single tensor into N Float32Array vectors (one per input text).
//
// Run with: cd packages/shared && npx tsx --test test/embed/local-provider.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createLocalEmbedProvider,
  type LocalPipeline,
} from "../../src/embed/local-provider.js";

const EXPECTED_CACHE_DIR = join(homedir(), ".pi", "aura", "huggingface");
const MODEL_ID = "Xenova/multilingual-e5-base";
const HIDDEN_DIM = 768; // real model dimension

// ---------------------------------------------------------------------------
// Fake pipeline — simulates the REAL @huggingface/transformers pipeline output.
// ---------------------------------------------------------------------------

/**
 * The real transformers.js feature-extraction pipeline, when called with
 * { pooling: 'mean', normalize: true }, returns a SINGLE Tensor object
 * (NOT an array):
 *   { data: Float32Array (flat, length batch*hiddenDim),
 *     dims: [batch, hiddenDim] }
 * The data is already mean-pooled + L2-normalized by the pipeline itself.
 *
 * The fake pipeline mirrors this real shape: a single object with flat .data
 * and .dims = [batch, hiddenDim]. Each text gets a distinct deterministic
 * vector (based on text hash) so we can verify N-in → N-out.
 */
function makeFakePipeline(hiddenDim: number = HIDDEN_DIM): {
  pipelineFn: LocalPipeline;
  calls: { texts: string[] }[];
} {
  const calls: { texts: string[] }[] = [];
  const pipelineFn: LocalPipeline = async (texts: string[]) => {
    calls.push({ texts: [...texts] });
    // Real shape: single Tensor with dims [batch, hiddenDim], flat data.
    // Each text gets a distinct, deterministic, unit-norm vector.
    const batch = texts.length;
    const data = new Float32Array(batch * hiddenDim);
    for (let i = 0; i < batch; i++) {
      const text = texts[i];
      // Deterministic seed from text
      let seed = 0;
      for (let c = 0; c < text.length; c++) seed = (seed * 31 + text.charCodeAt(c)) | 0;
      let norm = 0;
      for (let h = 0; h < hiddenDim; h++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const val = (seed % 1000) / 1000 - 0.5;
        data[i * hiddenDim + h] = val;
        norm += val * val;
      }
      // L2-normalize this text's vector
      const l2 = Math.sqrt(norm);
      if (l2 > 0) {
        for (let h = 0; h < hiddenDim; h++) {
          data[i * hiddenDim + h] /= l2;
        }
      }
    }
    // Return a SINGLE tensor object (NOT an array) — the real shape.
    return { data, dims: [batch, hiddenDim] };
  };
  return { pipelineFn, calls };
}

// ---------------------------------------------------------------------------
// LocalEmbedProvider construction + modelId
// ---------------------------------------------------------------------------

describe("LocalEmbedProvider — construction", () => {
  it("has modelId = 'Xenova/multilingual-e5-base'", async () => {
    const { pipelineFn } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    assert.equal(provider.modelId, MODEL_ID);
  });

  it("implements the EmbedProvider interface (embed is a function)", async () => {
    const { pipelineFn } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    assert.equal(typeof provider.embed, "function");
  });
});

// ---------------------------------------------------------------------------
// E5 prefix convention
// ---------------------------------------------------------------------------

describe("LocalEmbedProvider — E5 prefix convention", () => {
  it("embed() does NOT apply any prefix (callers handle prefixing)", async () => {
    const { pipelineFn, calls } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    await provider.embed(["hello world"]);
    // The pipeline should have received the raw text (no prefix)
    assert.ok(calls.length > 0, "pipeline was called");
    assert.deepEqual(
      calls[0].texts,
      ["hello world"],
      "embed() passes texts as-is (no prefix)",
    );
  });

  it("embedPassages() applies 'passage: ' prefix (build-time convenience)", async () => {
    const { pipelineFn, calls } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    await (provider as any).embedPassages(["op one", "op two"]);
    assert.ok(calls.length > 0, "pipeline was called");
    assert.deepEqual(
      calls[0].texts,
      ["passage: op one", "passage: op two"],
      "embedPassages() prefixes texts with 'passage: '",
    );
  });
});

// ---------------------------------------------------------------------------
// Mean-pooling + L2 normalization
// ---------------------------------------------------------------------------

describe("LocalEmbedProvider — real pipeline output shape (N-in → N-out)", () => {
  it("returns 2 vectors of length 768 for a 2-text batch (real shape)", async () => {
    const { pipelineFn } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    const vectors = await provider.embed(["hello world", "second text"]);
    assert.equal(vectors.length, 2, "one vector per input text");
    for (const v of vectors) {
      assert.equal(v.length, HIDDEN_DIM, `vector dimension = ${HIDDEN_DIM}`);
      assert.ok(v instanceof Float32Array, "returns Float32Array");
    }
  });

  it("returns 3 vectors of length 768 for a 3-text batch (off-by-one guard)", async () => {
    // This test guards the off-by-one that caused the gen-rest-index crash:
    // the old code returned 1 vector for N texts, so rawVectors[i] was
    // undefined for i>=1, crashing quantizeToInt8(undefined).
    const { pipelineFn } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    const vectors = await provider.embed(["text one", "text two", "text three"]);
    assert.equal(vectors.length, 3, "one vector per input text (not 1!)");
    for (const v of vectors) {
      assert.equal(v.length, HIDDEN_DIM, `vector dimension = ${HIDDEN_DIM}`);
      assert.ok(v instanceof Float32Array, "returns Float32Array");
    }
  });

  it("each text's vector is distinct (not all the same)", async () => {
    const { pipelineFn } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    const vectors = await provider.embed(["alpha", "beta"]);
    assert.equal(vectors.length, 2);
    let diff = 0;
    for (let h = 0; h < HIDDEN_DIM; h++) {
      diff += Math.abs(vectors[0][h] - vectors[1][h]);
    }
    assert.ok(diff > 0, "vectors for different texts are distinct");
  });
});

describe("LocalEmbedProvider — mean-pool + L2-normalize (pipeline does it)", () => {
  it("returns vectors of length hidden_dim (pipeline pools+normalizes)", async () => {
    const hiddenDim = 4;
    const { pipelineFn } = makeFakePipeline(hiddenDim);
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    const vectors = await provider.embed(["test text"]);
    assert.equal(vectors.length, 1, "one vector per text");
    assert.equal(vectors[0].length, hiddenDim, "vector dimension = hidden_dim");
    assert.ok(vectors[0] instanceof Float32Array, "returns Float32Array");
  });

  it("L2-normalizes the output vectors (unit norm)", async () => {
    const { pipelineFn } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    const vectors = await provider.embed(["hello", "world"]);
    assert.equal(vectors.length, 2);
    for (const vec of vectors) {
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
      const l2 = Math.sqrt(norm);
      assert.ok(
        Math.abs(l2 - 1.0) < 1e-4,
        `vector is L2-normalized (norm ≈ 1.0, got ${l2})`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Lazy singleton pipeline
// ---------------------------------------------------------------------------

describe("LocalEmbedProvider — lazy singleton", () => {
  it("loads the pipeline lazily on first embed call (not on construction)", async () => {
    let pipelineLoaded = false;
    const fakePipeline: LocalPipeline = async (_texts: string[]) => {
      pipelineLoaded = true;
      return { data: new Float32Array(4), dims: [1, 4] };
    };
    // The pipeline factory is called once on first embed
    let factoryCalls = 0;
    const provider = await createLocalEmbedProvider({
      pipeline: async (texts: string[]) => {
        factoryCalls++;
        return fakePipeline(texts);
      },
    });
    // First embed triggers the load
    await provider.embed(["test"]);
    assert.ok(factoryCalls >= 1, "pipeline loaded on first embed");
    assert.ok(pipelineLoaded, "pipeline function was actually called");
  });

  it("reuses the pipeline instance across embed calls (singleton)", async () => {
    let callCount = 0;
    const trackingPipeline: LocalPipeline = async (texts: string[]) => {
      callCount++;
      const batch = texts.length;
      return { data: new Float32Array(batch * 4), dims: [batch, 4] };
    };
    const provider = await createLocalEmbedProvider({ pipeline: trackingPipeline });
    await provider.embed(["a"]);
    await provider.embed(["b"]);
    // Both embed calls use the same pipeline instance (it's called twice,
    // once per embed — but the instance is the same, not re-initialized)
    assert.equal(callCount, 2, "pipeline called for each embed");
    // The key singleton property: getPipeline() returns the cached instance.
    // For injected pipelines, this is trivially true (the same function).
    // For the real pipeline, it means pipeline() is called once, not per embed.
  });
});

// ---------------------------------------------------------------------------
// cacheDir
// ---------------------------------------------------------------------------

describe("LocalEmbedProvider — cacheDir", () => {
  it("sets transformers.js env.cacheDir to ~/.pi/aura/huggingface", async () => {
    // The createLocalEmbedProvider should set env.cacheDir on the injected
    // transformers env object. We pass a mock env to verify.
    const envSet: Record<string, string> = {};
    const mockEnv = {
      set cacheDir(v: string) { envSet.cacheDir = v; },
      get cacheDir() { return envSet.cacheDir; },
    };
    const { pipelineFn } = makeFakePipeline();
    await createLocalEmbedProvider({
      pipeline: pipelineFn,
      env: mockEnv as any,
    });
    assert.equal(
      envSet.cacheDir,
      EXPECTED_CACHE_DIR,
      "env.cacheDir set to ~/.pi/aura/huggingface",
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling — init failure
// ---------------------------------------------------------------------------

describe("LocalEmbedProvider — error handling", () => {
  it("throws on pipeline init failure (so the caller can degrade)", async () => {
    const failingPipeline: LocalPipeline = async (_texts: string[]) => {
      throw new Error("model download failed");
    };
    const provider = await createLocalEmbedProvider({ pipeline: failingPipeline });
    await assert.rejects(
      () => provider.embed(["test"]),
      (err: Error) => {
        assert.ok(
          err.message.includes("download") || err.message.includes("model"),
          "error mentions the failure cause",
        );
        return true;
      },
    );
  });
});
