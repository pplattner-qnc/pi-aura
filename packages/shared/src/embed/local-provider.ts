// embed/local-provider — the local CPU embedding provider.
//
// LocalEmbedProvider implements EmbedProvider using @huggingface/transformers
// (transformers.js) pipeline("feature-extraction", "Xenova/multilingual-e5-base").
// The model is a 768-dim, multilingual (EN+DE), ~118MB quantized ONNX, CPU-only
// model that auto-downloads to ~/.pi/aura/huggingface on first use.
//
// Key design decisions:
// - LAZY singleton: the pipeline is loaded on the first embed() call, not on
//   construction. This keeps construction cheap and lets the caller degrade
//   gracefully if the model can't be loaded.
// - E5 PREFIX CONVENTION: E5 models require queries prefixed with "query: "
//   and passages prefixed with "passage: " for best retrieval quality. This
//   is baked into the provider: embed() (the EmbedProvider interface method)
//   applies the "query: " prefix; embedPassages() applies "passage: ". The
//   build-time op texts get "passage: " prefix; the runtime query gets
//   "query: " prefix. Callers don't have to remember.
// - Mean-pool + L2-normalize: the feature-extraction pipeline returns
//   last_hidden_state [seq_len, hidden_dim]. We mean-pool over the token
//   dimension, then L2-normalize the result.
// - env.cacheDir: set to ~/.pi/aura/huggingface so the model auto-downloads
//   there (the dir already exists).
// - INJECTABLE pipeline: for testing, the pipeline function and env object
//   can be injected via opts. This avoids downloading a real 118MB model in
//   unit tests. The real pipeline is loaded from @huggingface/transformers
//   only when no injection is provided.

import { homedir } from "node:os";
import { join } from "node:path";
import type { EmbedProvider } from "./provider.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The model id (matches the build-time recorded id so the runtime guard passes). */
export const LOCAL_MODEL_ID = "Xenova/multilingual-e5-base";

/** Default cache dir for the Hugging Face model. */
export const DEFAULT_CACHE_DIR = join(homedir(), ".pi", "aura", "huggingface");

// ---------------------------------------------------------------------------
// Types — the pipeline output shape (simplified from transformers.js)
// ---------------------------------------------------------------------------

/**
 * A single "tensor" from the feature-extraction pipeline.
 * The real transformers.js pipeline with { pooling: 'mean', normalize: true }
 * returns ONE Tensor (not an array) with dims [batch, hiddenDim] and flat data
 * of length batch*hiddenDim, already mean-pooled + L2-normalized.
 */
export interface PipelineTensor {
  /** Flat data (length = product of dims). Already pooled + normalized. */
  data: Float32Array | number[];
  /** Shape: [batch, hiddenDim] (e.g. [273, 384]). */
  dims: number[];
}

/** The pipeline function type (what pipeline("feature-extraction", ...) returns). */
export type LocalPipeline = (texts: string[]) => Promise<PipelineTensor>;

/** Injectable transformers.js env (for cacheDir). */
export interface TransformersEnv {
  cacheDir: string;
}

/** Options for constructing a LocalEmbedProvider (all injectable for testing). */
export interface LocalEmbedProviderOptions {
  /**
   * The pipeline function. In production this is loaded from
   * @huggingface/transformers. In tests, a fake pipeline is injected.
   * If not provided, the real pipeline is loaded lazily on first embed().
   */
  pipeline?: LocalPipeline;
  /** The transformers.js env object (for setting cacheDir). Injectable for testing. */
  env?: TransformersEnv;
  /** Override the cache dir (defaults to ~/.pi/aura/huggingface). */
  cacheDir?: string;
}

// ---------------------------------------------------------------------------
// LocalEmbedProvider — implements EmbedProvider
// ---------------------------------------------------------------------------

/**
 * The local CPU embedding provider backed by transformers.js.
 *
 * Uses a lazy singleton pipeline: the pipeline is loaded on the first embed()
 * call, not on construction. This keeps construction cheap and allows graceful
 * degradation if the model can't be loaded.
 *
 * E5 PREFIX CONVENTION: E5 models require queries prefixed with "query: "
 *   and passages prefixed with "passage: " for best retrieval quality. This
 *   is baked into the CALL SITES (buildSemanticVectors applies "passage: ",
 *   restSearch applies "query: "), NOT the provider itself. The provider's
 *   embed() method embeds texts as-is (same as the cloud provider), so both
 *   local and cloud providers behave consistently. embedPassages() is a
 *   convenience that applies the prefix internally.
 */
export class LocalEmbedProvider implements EmbedProvider {
  readonly modelId = LOCAL_MODEL_ID;

  private readonly _opts: LocalEmbedProviderOptions;
  private _pipeline: LocalPipeline | null = null;
  private _pipelineInitPromise: Promise<LocalPipeline> | null = null;

  constructor(opts: LocalEmbedProviderOptions = {}) {
    this._opts = opts;
    // Set cacheDir immediately (so it's set even before first embed)
    const cacheDir = opts.cacheDir ?? DEFAULT_CACHE_DIR;
    if (opts.env) {
      opts.env.cacheDir = cacheDir;
    }
  }

  /**
   * Load the pipeline lazily (singleton). On first call, either uses the
   * injected pipeline or loads the real one from @huggingface/transformers.
   * Subsequent calls reuse the cached instance.
   */
  private async getPipeline(): Promise<LocalPipeline> {
    if (this._pipeline) return this._pipeline;

    if (this._pipelineInitPromise) return this._pipelineInitPromise;

    this._pipelineInitPromise = (async () => {
      if (this._opts.pipeline) {
        this._pipeline = this._opts.pipeline;
      } else {
        // Load the real pipeline from @huggingface/transformers.
        // This is the only place the real library is imported — never in tests.
        const transformers = await import("@huggingface/transformers");
        const { pipeline } = transformers;
        if (this._opts.env) {
          (transformers as any).env.cacheDir = this._opts.cacheDir ?? DEFAULT_CACHE_DIR;
        } else {
          (transformers as any).env.cacheDir = this._opts.cacheDir ?? DEFAULT_CACHE_DIR;
        }
        const pipe = await pipeline("feature-extraction", LOCAL_MODEL_ID);
        // Adapt the real pipeline to our LocalPipeline type.
        // The real pipeline with { pooling: 'mean', normalize: true } returns
        // a SINGLE Tensor with dims [batch, hiddenDim] — already mean-pooled +
        // L2-normalized. We pass it through as-is.
        this._pipeline = (async (texts: string[]) => {
          const output = await pipe(texts, { pooling: "mean", normalize: true });
          return {
            data: new Float32Array(output.data),
            dims: output.dims as number[],
          };
        }) as LocalPipeline;
      }
      return this._pipeline;
    })();

    try {
      await this._pipelineInitPromise;
    } catch (err) {
      this._pipelineInitPromise = null; // allow retry on failure
      throw err;
    }

    return this._pipeline!;
  }

  /**
   * Embed texts as-is (no prefix). This is the EmbedProvider interface
   * method, used by callers that handle E5 prefixing themselves
   * (buildSemanticVectors applies "passage:", restSearch applies "query:").
   * Returns L2-normalized Float32Array[] (one per text).
   */
  async embed(texts: string[]): Promise<Float32Array[]> {
    return this._embedRaw(texts);
  }

  /**
   * Embed passage texts with the "passage: " prefix applied (build-time path).
   * Convenience method — callers can also apply the prefix themselves and
   * call embed().
   * Returns L2-normalized Float32Array[] (one per text).
   */
  async embedPassages(texts: string[]): Promise<Float32Array[]> {
    return this._embedRaw(texts.map((t) => `passage: ${t}`));
  }

  /**
   * Internal: embed raw texts (no prefix).
   *
   * The pipeline is called with { pooling: 'mean', normalize: true }, so it
   * returns a SINGLE Tensor with dims [N, hiddenDim] — already mean-pooled +
   * L2-normalized. We slice this single tensor into N Float32Array vectors
   * (one per input text).
   */
  private async _embedRaw(texts: string[]): Promise<Float32Array[]> {
    const pipeline = await this.getPipeline();
    const out = await pipeline(texts);
    // The pipeline returns a single Tensor with dims [N, hiddenDim].
    // hiddenDim is the last dimension; N (batch) is the first.
    const hiddenDim = out.dims[out.dims.length - 1];
    const n = out.dims[0];
    // Ensure data is a Float32Array (the real pipeline returns one, but
    // number[] is allowed by the type for flexibility).
    const data = out.data instanceof Float32Array
      ? out.data
      : new Float32Array(out.data);
    const result: Float32Array[] = [];
    for (let i = 0; i < n; i++) {
      // Copy the i-th text's vector from the flat data buffer.
      result.push(
        Float32Array.from(data.subarray(i * hiddenDim, (i + 1) * hiddenDim)),
      );
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// createLocalEmbedProvider — factory
// ---------------------------------------------------------------------------

/**
 * Construct a LocalEmbedProvider. The pipeline is loaded lazily on first
 * embed() call (not on construction), so construction is cheap.
 *
 * For testing, pass opts.pipeline (a fake pipeline) and opts.env (a mock env).
 * For production, omit opts — the real pipeline is loaded from
 * @huggingface/transformers on first use.
 *
 * Returns a provider (never null on success). Throws on init failure (the
 * caller should degrade gracefully).
 */
export async function createLocalEmbedProvider(
  opts?: LocalEmbedProviderOptions,
): Promise<EmbedProvider> {
  return new LocalEmbedProvider(opts);
}
