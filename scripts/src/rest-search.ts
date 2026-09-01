// rest-search — the `aura.mjs rest search` subcommand with the semantic leg.
//
// restSearch(index, query, out, opts?) runs:
//   1. FTS leg: BM25 over the inlined FTS index → ftsRanking
//   2. Semantic leg (optional): embed query (one call) → cosineRank over
//      index.vectors → semanticRanking
//   3. Merge via rrfMerge([semanticRanking, ftsRanking]) → fused Map
//   4. Print ranked operationIds ordered by the fused Map, with a one-line
//      rationale noting which leg matched (semantic / FTS / both) + the
//      fused score.
//
// Graceful fallback:
// - No provider → FTS-only with "semantic leg skipped (no embedding provider)" note.
// - Model mismatch → warning naming both models + FTS-only.
// - Index has no vectors (embedModelId null) → warning + FTS-only.
// - Runtime embed HTTP error → warning + FTS-only (never hard-fail the search).
//
// The restSearch function accepts an injectable embedProvider via opts so it
// stays unit-testable without real network calls.

import { bm25Search, rrfMerge, type FtsHit } from "@pi-aura/shared/rest/fts";
import { cosineRank } from "@pi-aura/shared/embed/cosine";
import type { EmbedProvider } from "@pi-aura/shared/embed/provider";
import type { OutSink } from "./rest-list-describe.js";
import type { RestIndexBlob } from "./gen-rest-index.js";

export interface RestSearchOptions {
  /** Max number of results to print (default 10). */
  limit?: number;
  /** Injected embedding provider for the semantic leg (test seam). */
  embedProvider?: EmbedProvider | null;
}

/**
 * Run a hybrid (semantic + FTS) search over the inlined REST index.
 *
 * When an embedding provider is configured and its modelId matches the
 * index's embedModelId, the semantic leg runs: the query is embedded (one
 * call), cosine-ranked against the inlined op vectors, and merged with the
 * FTS ranking via rrfMerge([semantic, fts]).
 *
 * When no provider, model mismatch, or index has no vectors → FTS-only
 * with an appropriate note/warning.
 */
export async function restSearch(
  index: RestIndexBlob,
  query: string,
  out: OutSink,
  opts: RestSearchOptions = {},
): Promise<void> {
  const limit = opts.limit ?? 10;

  // --- FTS leg ---
  const ftsHits: FtsHit[] = bm25Search(index.fts, query, limit);
  const ftsRanking = ftsHits.map((h) => h.operationId);
  const ftsHitMap = new Map(ftsHits.map((h) => [h.operationId, h]));

  // --- Semantic leg (optional) ---
  let semanticRanking: string[] = [];
  let semanticActive = false;
  const provider = opts.embedProvider ?? null;

  if (!provider) {
    // No provider → FTS-only with note
    out.error("semantic leg skipped (no embedding provider) — FTS-only results");
  } else if (!index.embedModelId || !index.vectors) {
    // Index has no vectors (built without a provider)
    out.error(
      `semantic leg skipped (index has no vectors, embedModelId is null) — FTS-only results`,
    );
  } else if (provider.modelId !== index.embedModelId) {
    // Model mismatch → warning + FTS-only (no silent cross-model cosine)
    out.error(
      `semantic leg skipped: index built with "${index.embedModelId}", ` +
      `runtime provider is "${provider.modelId}" — FTS-only results`,
    );
  } else {
    // Semantic leg active — embed the query (one call)
    // E5 PREFIX CONVENTION: prefix the query with "query: " for best retrieval.
    try {
      const queryVec = await provider.embed([`query: ${query}`]);
      const dtype = index.dtype ?? "f32";
      const opVecs = index.vectors.map((v) => ({
        operationId: v.operationId,
        vec: v.vec,
      }));
      const cosineHits = cosineRank(queryVec[0], opVecs, dtype);
      semanticRanking = cosineHits.slice(0, limit).map((h) => h.operationId);
      semanticActive = true;
    } catch (err) {
      // Runtime embed HTTP error → degrade to FTS-only with a warning
      out.error(
        `semantic leg skipped (embed error: ${err instanceof Error ? err.message : String(err)}) — FTS-only results`,
      );
    }
  }

  // --- RRF merge ---
  const rankings: string[][] = [];
  if (semanticActive && semanticRanking.length > 0) {
    rankings.push(semanticRanking);
  }
  rankings.push(ftsRanking);

  const merged = rrfMerge(rankings);

  // --- Print results ---
  if (merged.size === 0) {
    out.log("No results found.");
    return;
  }

  // Sort the merged Map by descending fused score for display
  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit);

  for (let i = 0; i < top.length; i++) {
    const [opId, fusedScore] = top[i];
    const ftsHit = ftsHitMap.get(opId);
    const inSemantic = semanticActive && semanticRanking.includes(opId);
    const inFts = ftsHit !== undefined;

    let leg: string;
    if (inSemantic && inFts) {
      leg = "both";
    } else if (inSemantic) {
      leg = "semantic";
    } else {
      leg = "FTS";
    }

    const termsStr = ftsHit ? ftsHit.terms.join(", ") : "";
    const termsPart = termsStr ? `, terms: ${termsStr}` : "";
    out.log(
      `${i + 1}. ${opId}  (leg: ${leg}, fused: ${fusedScore.toFixed(6)}${termsPart})`,
    );
  }
}
