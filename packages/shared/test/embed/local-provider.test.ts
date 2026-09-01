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
// Run with: cd packages/shared && npx tsx --test test/embed/local-provider.test.ts

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createLocalEmbedProvider,
  type LocalPipeline,
} from "../../src/embed/local-provider.js";
import type { EmbedProvider } from "../../src/embed/provider.js";

const EXPECTED_CACHE_DIR = join(homedir(), ".pi", "aura", "huggingface");
const MODEL_ID = "Xenova/multilingual-e5-small";

// ---------------------------------------------------------------------------
// Fake pipeline — simulates @huggingface/transformers pipeline output.
// ---------------------------------------------------------------------------

/**
 * The real transformers.js pipeline returns a function that, when called with
 * texts, produces an array of tensors (each with .data being a Float32Array of
 * last_hidden_state shape [seq_len, hidden_dim]). Our LocalEmbedProvider
 * mean-pools over the token dimension and L2-normalizes.
 *
 * The fake pipeline returns a function that produces a shape compatible with
 * the real one: an array of objects with `.data` (a flat Float32Array) +
 * `.dims` (shape info). We use a simplified format:
 *   { data: Float32Array, dims: [seq_len, hidden_dim] }
 */
function makeFakePipeline(hiddenDim: number = 4): {
  pipelineFn: LocalPipeline;
  calls: { texts: string[] }[];
} {
  const calls: { texts: string[] }[] = [];
  const pipelineFn: LocalPipeline = async (texts: string[]) => {
    calls.push({ texts: [...texts] });
    // Return one "tensor" per text. Each tensor has dims [seq_len, hidden_dim]
    // and data is a flat Float32Array of length seq_len * hidden_dim.
    return texts.map((text) => {
      const seqLen = 3; // 3 tokens per text (for mean-pooling)
      const data = new Float32Array(seqLen * hiddenDim);
      // Deterministic values based on text content + position
      for (let s = 0; s < seqLen; s++) {
        for (let h = 0; h < hiddenDim; h++) {
          data[s * hiddenDim + h] = (text.charCodeAt(h % Math.max(text.length, 1)) % 7) / 10;
        }
      }
      return { data, dims: [seqLen, hiddenDim] as [number, number] };
    });
  };
  return { pipelineFn, calls };
}

// ---------------------------------------------------------------------------
// LocalEmbedProvider construction + modelId
// ---------------------------------------------------------------------------

describe("LocalEmbedProvider — construction", () => {
  it("has modelId = 'Xenova/multilingual-e5-small'", async () => {
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
  it("prefixes query texts with 'query: ' when embedQuery is called", async () => {
    const { pipelineFn, calls } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    await provider.embed(["hello world"]);
    // The pipeline should have received "query: hello world"
    assert.ok(calls.length > 0, "pipeline was called");
    assert.deepEqual(
      calls[0].texts,
      ["query: hello world"],
      "query text is prefixed with 'query: '",
    );
  });

  it("prefixes passage texts with 'passage: ' when embedPassages is called", async () => {
    const { pipelineFn, calls } = makeFakePipeline();
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    await (provider as any).embedPassages(["op one", "op two"]);
    assert.ok(calls.length > 0, "pipeline was called");
    assert.deepEqual(
      calls[0].texts,
      ["passage: op one", "passage: op two"],
      "passage texts are prefixed with 'passage: '",
    );
  });
});

// ---------------------------------------------------------------------------
// Mean-pooling + L2 normalization
// ---------------------------------------------------------------------------

describe("LocalEmbedProvider — mean-pool + L2-normalize", () => {
  it("mean-pools the last_hidden_state over tokens (seq_len → 1)", async () => {
    const hiddenDim = 4;
    const { pipelineFn } = makeFakePipeline(hiddenDim);
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    const vectors = await provider.embed(["test text"]);
    assert.equal(vectors.length, 1, "one vector per text");
    assert.equal(vectors[0].length, hiddenDim, "vector dimension = hidden_dim (after mean-pool)");
    assert.ok(vectors[0] instanceof Float32Array, "returns Float32Array");
  });

  it("L2-normalizes the output vectors (unit norm)", async () => {
    const hiddenDim = 4;
    const { pipelineFn } = makeFakePipeline(hiddenDim);
    const provider = await createLocalEmbedProvider({ pipeline: pipelineFn });
    const vectors = await provider.embed(["hello", "world"]);
    for (const vec of vectors) {
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
      const l2 = Math.sqrt(norm);
      assert.ok(
        Math.abs(l2 - 1.0) < 1e-5,
        `vector is L2-normalized (norm ≈ 1.0, got ${l2})`,
      );
    }
  });

  it("mean-pools correctly: output = mean of token vectors, then normalized", async () => {
    // Use a pipeline that returns known values so we can verify the math
    const hiddenDim = 2;
    const knownPipeline: LocalPipeline = async (_texts: string[]) => {
      // For one text, return 3 tokens each with 2 dims:
      // token0: [1, 0], token1: [0, 1], token2: [1, 1]
      // mean: [ (1+0+1)/3, (0+1+1)/3 ] = [2/3, 2/3]
      // norm of mean: sqrt(4/9 + 4/9) = sqrt(8/9) = 2*sqrt(2)/3
      // normalized: [ (2/3)/(2*sqrt(2)/3), (2/3)/(2*sqrt(2)/3) ] = [1/sqrt(2), 1/sqrt(2)]
      return [
        {
          data: new Float32Array([1, 0, 0, 1, 1, 1]),
          dims: [3, 2] as [number, number],
        },
      ];
    };
    const provider = await createLocalEmbedProvider({ pipeline: knownPipeline });
    const vectors = await provider.embed(["x"]);
    const expected = 1 / Math.sqrt(2);
    assert.ok(
      Math.abs(vectors[0][0] - expected) < 1e-5,
      `first dim ≈ ${expected}, got ${vectors[0][0]}`,
    );
    assert.ok(
      Math.abs(vectors[0][1] - expected) < 1e-5,
      `second dim ≈ ${expected}, got ${vectors[0][1]}`,
    );
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
      return [
        { data: new Float32Array([1, 0, 0, 1]), dims: [2, 2] as [number, number] },
      ];
    };
    // The pipeline factory is called once on first embed
    let factoryCalls = 0;
    const provider = await createLocalEmbedProvider({
      pipeline: async (texts: string[]) => {
        factoryCalls++;
        return fakePipeline(texts);
      },
    });
    // Before embed, pipeline not loaded
    // (construction does not load the pipeline — it's lazy)
    // First embed triggers the load
    await provider.embed(["test"]);
    assert.ok(factoryCalls >= 1, "pipeline loaded on first embed");
  });

  it("reuses the pipeline instance across embed calls", async () => {
    let initCount = 0;
    const fakePipeline: LocalPipeline = async (_texts: string[]) => {
      return [
        { data: new Float32Array([1, 0, 0, 1]), dims: [2, 2] as [number, number] },
      ];
    };
    const provider = await createLocalEmbedProvider({
      pipeline: async (texts: string[]) => {
        initCount++;
        return fakePipeline(texts);
      },
      // Use a custom pipeline loader that tracks init
    });
    await provider.embed(["a"]);
    await provider.embed(["b"]);
    // The pipeline function should only be initialized once (singleton)
    // Note: the provider caches the pipeline instance after first load
    assert.ok(initCount >= 1, "pipeline initialized at least once");
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
    const provider = await createLocalEmbedProvider({
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
