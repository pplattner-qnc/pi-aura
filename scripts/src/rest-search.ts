// rest-search — the `aura.mjs rest search` subcommand.
//
// restSearch(index, query, out, opts?) runs BM25 over the inlined FTS index
// and prints ranked operationIds each with a one-line rationale (top matching
// terms + score). When no semantic leg is present (this slice), it prints a
// one-line note: "semantic leg skipped (no embedding provider) — FTS-only
// results".
//
// rrfMerge([ftsRanking]) = FTS ranking here (stub for slice 4's
// [semantic, fts] upgrade).

import { bm25Search, rrfMerge, type FtsHit } from "@pi-aura/shared/rest/fts";
import type { OutSink } from "./rest-list-describe.js";
import type { RestIndexBlob } from "./gen-rest-index.js";

export interface RestSearchOptions {
  /** Max number of results to print (default 10). */
  limit?: number;
}

/**
 * Run a FTS-only search over the inlined REST index and print ranked
 * operationIds with a one-line rationale (top matching terms + score).
 *
 * When no semantic leg is present (this slice), prints a one-line note
 * about the skipped semantic leg. rrfMerge([ftsRanking]) = fts here.
 */
export function restSearch(
  index: RestIndexBlob,
  query: string,
  out: OutSink,
  opts: RestSearchOptions = {},
): void {
  const limit = opts.limit ?? 10;

  // --- FTS leg ---
  const ftsHits: FtsHit[] = bm25Search(index.fts, query, limit);

  // --- RRF merge (single leg = FTS order) ---
  const ftsRanking = ftsHits.map((h) => h.operationId);
  rrfMerge([ftsRanking]); // stub: rrfMerge([fts]) = fts; slice 4 adds [semantic, fts]

  // --- Note: semantic leg skipped ---
  out.error("semantic leg skipped (no embedding provider) — FTS-only results");

  // --- Print results ---
  if (ftsHits.length === 0) {
    out.log("No results found.");
    return;
  }

  for (let i = 0; i < ftsHits.length; i++) {
    const hit = ftsHits[i];
    const termsStr = hit.terms.join(", ");
    out.log(`${i + 1}. ${hit.operationId}  (score: ${hit.score.toFixed(4)}, terms: ${termsStr})`);
  }
}
