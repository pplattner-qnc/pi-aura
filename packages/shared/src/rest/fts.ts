// FTS / BM25 module for the REST search leg.
//
// buildFtsIndex(ops)   → pure BM25 stats (term frequencies, doc frequencies,
//   avg doc length). k1≈1.5, b≈0.75. Tokenization: lowercase + split on
//   non-alphanumerics; no stopwords dependency.
// bm25Search(index, query, k?) → ranked FtsHit[] with matched terms.
// rrfMerge(rankings, k?) → Map<id, rrfScore> over N legs.
//
// rrfMerge([ftsRanking]) ≡ the FTS ranking order (stub for slice 4's
// [semantic, fts] upgrade). MUST accept variable arity so slice 4 passes
// [semantic, fts] without a signature change.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchableOp {
  operationId: string;
  text: string;
}

export interface FtsDoc {
  operationId: string;
  /** term → frequency in this doc */
  terms: Map<string, number>;
  /** total token count (document length) */
  length: number;
}

export interface FtsIndex {
  docs: FtsDoc[];
  /** term → number of docs containing it (document frequency) */
  docFreq: Map<string, number>;
  /** average document length across the corpus */
  avgDocLength: number;
  /** total number of documents */
  docCount: number;
}

export interface FtsHit {
  operationId: string;
  score: number;
  /** query terms that matched in this doc */
  terms: string[];
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize text: lowercase, split on non-alphanumeric characters, drop empties.
 * No stopwords — keeps the module dependency-free.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// buildFtsIndex — pure BM25 stats
// ---------------------------------------------------------------------------

const K1 = 1.5;
const B = 0.75;

export function buildFtsIndex(ops: SearchableOp[]): FtsIndex {
  const docs: FtsDoc[] = [];
  const docFreq = new Map<string, number>();
  let totalLength = 0;

  for (const op of ops) {
    const tokens = tokenize(op.text);
    const terms = new Map<string, number>();
    for (const tok of tokens) {
      terms.set(tok, (terms.get(tok) ?? 0) + 1);
    }
    docs.push({
      operationId: op.operationId,
      terms,
      length: tokens.length,
    });
    totalLength += tokens.length;

    // Update doc frequency (unique terms per doc)
    for (const term of terms.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const avgDocLength = ops.length > 0 ? totalLength / ops.length : 0;

  return {
    docs,
    docFreq,
    avgDocLength,
    docCount: ops.length,
  };
}

// ---------------------------------------------------------------------------
// bm25Search — BM25 ranking over the FTS index
// ---------------------------------------------------------------------------

export function bm25Search(index: FtsIndex, query: string, k?: number): FtsHit[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || index.docCount === 0) return [];

  const hits: FtsHit[] = [];

  for (const doc of index.docs) {
    let score = 0;
    const matched: string[] = [];

    for (const term of queryTerms) {
      const tf = doc.terms.get(term) ?? 0;
      if (tf === 0) continue; // term not in this doc

      const df = index.docFreq.get(term) ?? 0;
      // IDF using BM25's formula: ln((N - df + 0.5) / (df + 0.5) + 1)
      const idf = Math.log(
        (index.docCount - df + 0.5) / (df + 0.5) + 1,
      );

      // BM25 TF component
      const tfNorm =
        (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (doc.length / index.avgDocLength)));

      score += idf * tfNorm;
      matched.push(term);
    }

    if (matched.length > 0) {
      hits.push({ operationId: doc.operationId, score, terms: matched });
    }
  }

  // Sort by descending score, then by operationId for determinism
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.operationId.localeCompare(b.operationId);
  });

  if (k !== undefined) return hits.slice(0, k);
  return hits;
}

// ---------------------------------------------------------------------------
// rrfMerge — Reciprocal Rank Fusion
// ---------------------------------------------------------------------------

/**
 * Reciprocal Rank Fusion over N rankings.
 *
 * rrfMerge([ftsRanking]) ≡ the FTS ranking order (single leg).
 * rrfMerge([semantic, fts]) fuses both (slice 4's contract).
 *
 * Each ranking is a list of operationIds (best → worst). The RRF score for
 * an item is Σ 1/(k + rank) across all rankings where it appears (rank is
 * 1-based). The result Map is ordered by insertion: when only one leg is
 * provided, insertion order = the ranking order.
 */
export function rrfMerge(
  rankings: (readonly string[])[],
  k: number = 60,
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    for (let i = 0; i < ranking.length; i++) {
      const id = ranking[i];
      const rank = i + 1;
      const rrfScore = 1 / (k + rank);
      scores.set(id, (scores.get(id) ?? 0) + rrfScore);
    }
  }

  return scores;
}
