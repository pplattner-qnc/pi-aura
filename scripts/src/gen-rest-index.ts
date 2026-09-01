// gen-rest-index — build-time index generator that reads openapi.yaml via
// the slice-1 loader, builds per-op searchable text (name + summary +
// description + OpenAPI tags + code-side tags), computes the FTS index,
// and emits a slim metadata blob (only the fields list/describe/call read).
//
// buildRestIndex(openApiPath, codeTags, resolveFn) is a PURE function returning
// a RestIndexBlob. genRestIndex() is the CLI entry that writes a generated .ts
// module. The build asserts the blob fits the size budget.
//
// DETERMINISTIC: operations and tags are sorted so regeneration is
// byte-identical.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadOpenApi } from "@pi-aura/shared/openapi/loader";
import type { OpenApiIndex, OpMeta, Param, BodyShape, ResponseEntry } from "@pi-aura/shared/openapi/loader";
import {
  buildFtsIndex,
  type SearchableOp,
  type FtsIndex,
} from "@pi-aura/shared/rest/fts";
import type { CodeTags } from "./rest-code-tags.js";
import { quantizeToInt8 } from "@pi-aura/shared/embed/cosine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Slim operation metadata — only the fields list/describe/call read. */
export interface SlimOpMeta {
  operationId: string;
  method: string;
  path: string;
  pathParams: Param[];
  queryParams: Param[];
  body?: BodyShape;
  tags: string[];
  summary?: string;
  responses: ResponseEntry[];
  // NOTE: no 'description' field — long descriptions stay in FTS text only,
  // not duplicated in metadata, to fit the size budget.
}

export type VecElementType = "f32" | "i8";

export interface OpVectorEntry {
  operationId: string;
  /** Quantized or float vector (Int8Array for i8, Float32Array for f32).
   * In the serialized JSON form (generated rest-index.ts), this is a
   * number[] (typed arrays don't survive JSON.stringify). */
  vec: Int8Array | Float32Array | number[];
}

export interface SemanticVectors {
  /** Per-operation vectors (same order as metadata). */
  vectors: OpVectorEntry[];
  /** The model id used to produce these vectors. */
  embedModelId: string;
  /** Vector dimensionality. */
  dims: number;
  /** Storage dtype: "f32" (float32) or "i8" (int8-quantized). */
  dtype: VecElementType;
}

export interface RestIndexBlob {
  version: number;
  metadata: SlimOpMeta[];
  fts: FtsIndex;
  embedModelId: string | null;
  vectors: OpVectorEntry[] | null;
  dims?: number;
  dtype?: VecElementType;
}

// Current version of the index blob format. Bump when the shape changes.
const BLOB_VERSION = 1;

// Default dtype for stored vectors: int8-quantized to fit the size budget.
// 273 ops × 1536-dim i8 ≈ 0.42 MB (vs 1.68 MB for f32). The dtype is recorded
// in the blob so the runtime query embedder can quantize the query to match.
const DEFAULT_DTYPE: VecElementType = "i8";

// ---------------------------------------------------------------------------
// buildSearchableText — name + summary + description + tags + code-tags
// ---------------------------------------------------------------------------

/**
 * Build the searchable text for an operation: operationId + summary +
 * description + OpenAPI tags + code-side tags.
 */
export function buildSearchableText(
  op: OpMeta,
  codeTags: CodeTags,
  resolveFn: (op: OpMeta, tags: CodeTags) => string[],
): string {
  const parts: string[] = [op.operationId];
  if (op.summary) parts.push(op.summary);
  if (op.description) parts.push(op.description);
  parts.push(...op.tags);
  parts.push(...resolveFn(op, codeTags));
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// buildSemanticVectors — embed ops via a provider, return vectors + metadata
// ---------------------------------------------------------------------------

/**
 * Embed every operation's searchable text via the given provider and return
 * the vectors + metadata (embedModelId, dims, dtype).
 *
 * When provider is null → returns null (no vectors; FTS-only is valid).
 * When the provider's embed call fails → throws loudly naming the operation.
 *
 * E5 PREFIX CONVENTION: op texts are prefixed with "passage: " before
 * embedding (E5 models require this for best retrieval quality). The prefix
 * is applied here (build-time) so callers don't have to remember.
 *
 * Vectors are stored as Int8Array (i8 dtype) by default to fit the size
 * budget, or as Float32Array (f32 dtype) when explicitly requested.
 */
export async function buildSemanticVectors(
  ops: readonly SearchableOp[],
  provider: { modelId: string; embed(texts: string[]): Promise<Float32Array[]> } | null,
  dtype: VecElementType = DEFAULT_DTYPE,
): Promise<SemanticVectors | null> {
  if (!provider) return null;

  // E5 PREFIX CONVENTION: prefix op texts with "passage: " for best retrieval.
  const texts = ops.map((op) => `passage: ${op.text}`);
  let rawVectors: Float32Array[];
  try {
    rawVectors = await provider.embed(texts);
  } catch (err) {
    // Name every op so the build error is actionable
    const opIds = ops.map((op) => op.operationId).join(", ");
    throw new Error(
      `buildSemanticVectors: embedding failed for operations [${opIds}]: ` +
      (err instanceof Error ? err.message : String(err)),
    );
  }

  const dims = rawVectors.length > 0 ? rawVectors[0].length : 0;

  const vectors: OpVectorEntry[] = ops.map((op, i) => {
    const raw = rawVectors[i];
    const vec = dtype === "i8" ? quantizeToInt8(raw) : raw;
    return { operationId: op.operationId, vec };
  });

  return {
    vectors,
    embedModelId: provider.modelId,
    dims,
    dtype,
  };
}

// ---------------------------------------------------------------------------
// buildSearchableOps — shared helper (sort + searchable text)
// ---------------------------------------------------------------------------

/**
 * Sort operations by operationId and build SearchableOp[] with searchable text.
 * Shared by buildRestIndex and buildRestIndexAsync to avoid duplicate loads.
 */
function buildSearchableOps(
  index: OpenApiIndex,
  codeTags: CodeTags,
  resolveFn: (op: OpMeta, tags: CodeTags) => string[],
): SearchableOp[] {
  const ops = Object.values(index).sort((a, b) =>
    a.operationId.localeCompare(b.operationId),
  );
  return ops.map((op) => ({
    operationId: op.operationId,
    text: buildSearchableText(op, codeTags, resolveFn),
  }));
}

// ---------------------------------------------------------------------------
// buildRestIndex — the pure builder
// ---------------------------------------------------------------------------

export interface BuildRestIndexOptions {
  /** Optional embed function (injected so buildRestIndex stays testable). */
  embedFn?: (texts: string[]) => Promise<Float32Array[]>;
  /** Model id for the embed provider (recorded in the blob). */
  embedModelId?: string;
  /** Vector dimensionality (recorded in the blob). */
  dims?: number;
  /** Storage dtype for vectors (default: "i8"). */
  dtype?: VecElementType;
}

export function buildRestIndex(
  openApiPath: string,
  codeTags: CodeTags,
  resolveFn: (op: OpMeta, tags: CodeTags) => string[],
): RestIndexBlob {
  const index: OpenApiIndex = loadOpenApi(openApiPath);

  // --- Build searchable text + FTS index ---
  const searchableOps = buildSearchableOps(index, codeTags, resolveFn);
  const fts = buildFtsIndex(searchableOps);

  // --- Build slim metadata ---
  const ops = Object.values(index).sort((a, b) =>
    a.operationId.localeCompare(b.operationId),
  );
  const metadata: SlimOpMeta[] = ops.map((op) => ({
    operationId: op.operationId,
    method: op.method,
    path: op.path,
    pathParams: op.pathParams,
    queryParams: op.queryParams,
    body: op.body,
    tags: op.tags,
    summary: op.summary,
    responses: op.responses,
  }));

  // --- Semantic vectors (optional; injected via embedFn) ---
  // When embedFn is provided, embed all ops and store vectors + metadata.
  // When absent → vectors: null, embedModelId: null (FTS-only is valid).
  // NOTE: This is the one non-pure part of buildRestIndex (it awaits an async
  // embed call). buildRestIndex itself is async when embedOpts is provided.
  // For synchronous use (no embed), it returns a RestIndexBlob directly.
  // The embed step is handled by genRestIndex() at the CLI level, which calls
  // buildSemanticVectors separately and merges the result.
  return {
    version: BLOB_VERSION,
    metadata,
    fts,
    embedModelId: null,
    vectors: null,
  };
}

/**
 * Async version of buildRestIndex that optionally embeds op vectors.
 * When embedOpts.embedFn is provided, embeds all ops and stores vectors.
 * When absent → vectors: null, embedModelId: null.
 */
export async function buildRestIndexAsync(
  openApiPath: string,
  codeTags: CodeTags,
  resolveFn: (op: OpMeta, tags: CodeTags) => string[],
  embedOpts?: BuildRestIndexOptions,
): Promise<RestIndexBlob> {
  const blob = buildRestIndex(openApiPath, codeTags, resolveFn);

  if (embedOpts?.embedFn && embedOpts?.embedModelId) {
    // Reuse the loaded index (loader caches per-process) to build searchableOps
    // without a second load + duplicate sort/map/buildSearchableText.
    const index: OpenApiIndex = loadOpenApi(openApiPath);
    const searchableOps = buildSearchableOps(index, codeTags, resolveFn);

    const provider = {
      modelId: embedOpts.embedModelId,
      embed: embedOpts.embedFn,
    };
    const dtype = embedOpts.dtype ?? DEFAULT_DTYPE;
    const semantic = await buildSemanticVectors(searchableOps, provider, dtype);

    if (semantic) {
      blob.embedModelId = semantic.embedModelId;
      blob.vectors = semantic.vectors;
      blob.dims = semantic.dims;
      blob.dtype = semantic.dtype;
    }
  }

  return blob;
}

// ---------------------------------------------------------------------------
// serializeRestIndexBlob — deterministic JSON serialization
// ---------------------------------------------------------------------------

/**
 * Serialize the blob to a deterministic JSON string.
 * Used for size-budget assertion and for writing the generated .ts module.
 *
 * Typed arrays (Int8Array/Float32Array) are converted to plain number[]
 * before serialization so that JSON.stringify produces `[1,2,3]` (a proper
 * array) instead of `{"0":1,"1":2,"2":3}` (a plain object with numeric
 * keys, which has no `.length` and breaks cosineSim at runtime).
 */
export function serializeRestIndexBlob(blob: RestIndexBlob): string {
  // Deep-convert typed-array vec entries to plain number[] for JSON.
  const serializable: RestIndexBlob = {
    ...blob,
    vectors: blob.vectors
      ? blob.vectors.map((v) => ({
          operationId: v.operationId,
          vec: Array.from(v.vec),
        }))
      : null,
  };
  return JSON.stringify(serializable);
}

// ---------------------------------------------------------------------------
// assertSizeBudget — fail loudly if the blob exceeds the budget
// ---------------------------------------------------------------------------

export const DEFAULT_SIZE_BUDGET = 3 * 1024 * 1024; // 3 MB

/**
 * Assert the inlined index (metadata + FTS) is under the given budget.
 * Throws with the actual size + remediation hints if it exceeds.
 */
export function assertSizeBudget(
  blob: RestIndexBlob,
  budgetBytes: number = DEFAULT_SIZE_BUDGET,
): void {
  const serialized = serializeRestIndexBlob(blob);
  const size = serialized.length;

  if (size > budgetBytes) {
    throw new Error(
      `REST index size budget exceeded: ${size} bytes > ${budgetBytes} bytes budget ` +
      `(${(size / 1024 / 1024).toFixed(2)} MB). ` +
      `Remediation hints: ` +
      `(1) use int8-quantized vectors (i8 dtype) instead of float32, ` +
      `(2) use a lower-dimensional embedding model (e.g. 384-dim), ` +
      `(3) drop long descriptions from FTS text but keep a truncated form in metadata, ` +
      `(4) prune unused fields from the metadata blob.`,
    );
  }
}

// ---------------------------------------------------------------------------
// genRestIndex — CLI entry that writes the generated .ts module
// ---------------------------------------------------------------------------

/**
 * Generate the rest-index.ts module content (a .ts const export).
 */
export function generateRestIndexTs(blob: RestIndexBlob): string {
  const json = serializeRestIndexBlob(blob);
  return `// AUTO-GENERATED by task gen-rest-index — do not edit by hand.\n` +
    `// Regenerate with: task gen-rest-index\n` +
    `import type { RestIndexBlob } from "../gen-rest-index.js";\n\n` +
    `export const REST_INDEX: RestIndexBlob = ${json};\n`;
}

/**
 * CLI entry point: load openapi.yaml, build the index, assert the size
 * budget, and write the generated .ts module.
 *
 * Imports CODE_TAGS/resolveCodeTags lazily so the pure functions above
 * remain testable without the CLI's value import chain.
 */
export async function genRestIndex(): Promise<void> {
  const { CODE_TAGS, resolveCodeTags } = await import("./rest-code-tags.js");

  // Resolve openapi.yaml relative to the repo root (works from repo root or scripts/).
  const repoRoot = resolve(process.cwd(), "packages", "shared", "openapi", "openapi.yaml");
  const scriptsRoot = resolve(import.meta.dirname, "..", "packages", "shared", "openapi", "openapi.yaml");
  const openApiPath = existsSync(repoRoot) ? repoRoot : scriptsRoot;

  // Create an embedding provider. By default (no aura.embed.* settings) →
  // LocalEmbedProvider (always-on local CPU model, Xenova/multilingual-e5-base).
  // When aura.embed.provider is set → cloud provider (optional override).
  // Build-time: if the provider fails to init, the build FAILS LOUDLY (correct —
  // the committed index must have real vectors).
  const { createEmbedProvider, loadEmbedSettings } = await import("@pi-aura/shared/embed/provider");
  const embedSettings = loadEmbedSettings();
  const embedProvider = await createEmbedProvider(embedSettings);

  const blob = await buildRestIndexAsync(openApiPath, CODE_TAGS, resolveCodeTags, {
    embedFn: embedProvider?.embed.bind(embedProvider),
    embedModelId: embedProvider?.modelId,
    dtype: DEFAULT_DTYPE,
  });

  // Assert size budget before writing
  assertSizeBudget(blob);

  // Write the generated .ts module
  const ts = generateRestIndexTs(blob);
  const outDir = resolve(import.meta.dirname, "generated");
  const outPath = resolve(outDir, "rest-index.ts");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, ts, "utf8");

  const size = serializeRestIndexBlob(blob).length;
  console.log(
    `generated ${outPath} (${size} bytes, ${blob.metadata.length} operations, ` +
    `budget: ${(DEFAULT_SIZE_BUDGET / 1024 / 1024).toFixed(0)} MB)`,
  );
}

// Run when invoked directly via `node --experimental-strip-types scripts/src/gen-rest-index.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  genRestIndex();
}
