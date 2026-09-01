// embed/cosine — cosine similarity ranking over operation vectors.
//
// cosineRank(queryVec, opVecs, dtype) → ranked { operationId, score }[].
// PURE: fixture vectors, no network, no side effects.
//
// dtype handling: if the index dtype is "i8" and the query is a Float32Array,
// the query is quantized to Int8Array before computing cosine. This ensures
// the runtime query vector is compatible with the build-time op vectors.
//
// Cosine similarity = dot(a,b) / (|a| * |b|). Zero vectors → 0 (not NaN).

type Vec = Float32Array | Int8Array | number[];

export interface OpVector {
  operationId: string;
  vec: Vec;
}

export interface CosineHit {
  operationId: string;
  score: number;
}

/**
 * Quantize a Float32Array or number[] to Int8Array using symmetric quantization:
 * scale to [-127, 127] range, round, clamp.
 */
export function quantizeToInt8(vec: Float32Array | number[]): Int8Array {
  let maxAbs = 0;
  for (let i = 0; i < vec.length; i++) {
    const a = Math.abs(vec[i]);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs === 0) return new Int8Array(vec.length);
  const scale = 127 / maxAbs;
  const result = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    result[i] = Math.max(-128, Math.min(127, Math.round(vec[i] * scale)));
  }
  return result;
}

/**
 * Compute cosine similarity between two vectors (Float32Array or Int8Array).
 * Returns a number in [-1, 1]. Zero vector → 0 (not NaN).
 */
function cosineSim(a: Vec, b: Vec): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Rank operations by cosine similarity to the query vector.
 *
 * @param queryVec - The query embedding (Float32Array or Int8Array).
 * @param opVecs - The precomputed op vectors with their operationIds.
 * @param dtype - The index dtype ("f32" or "i8"). If "i8" and query is f32,
 *   the query is quantized to i8 before comparison.
 * @returns Ranked hits sorted by descending score, ties broken by operationId.
 */
export function cosineRank(
  queryVec: Vec,
  opVecs: readonly OpVector[],
  dtype: "f32" | "i8",
): CosineHit[] {
  // Quantize the query if needed
  let q: Vec = queryVec;
  if (dtype === "i8" && queryVec instanceof Float32Array) {
    q = quantizeToInt8(queryVec);
  } else if (dtype === "i8" && Array.isArray(queryVec)) {
    // number[] query → quantize to i8 to match the index dtype
    q = quantizeToInt8(queryVec);
  }

  const hits: CosineHit[] = [];
  for (const op of opVecs) {
    const score = cosineSim(q, op.vec);
    hits.push({ operationId: op.operationId, score });
  }

  // Sort by descending score, then by operationId for determinism
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.operationId.localeCompare(b.operationId);
  });

  return hits;
}
