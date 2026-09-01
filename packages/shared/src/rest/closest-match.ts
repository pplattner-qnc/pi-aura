// closest-match — shared unknown-operationId suggestion logic.
//
// Used by restDescribe (rest list/describe) and restCall (rest call) to list
// closest matches when an operationId is not found. Prefers the FTS search
// index (honoring the task AC "from the search index") when available, then
// falls back to substring + Levenshtein distance for dev mode (no inlined
// index) or FTS queries with zero hits.

import { bm25Search } from "@pi-aura/shared/rest/fts";
import type { FtsIndex } from "@pi-aura/shared/rest/fts";

/**
 * Return the closest operationIds for a query, preferring FTS when available.
 *
 * @param fts   the inlined FTS index (undefined in dev mode / tests without it)
 * @param ids   all known operationIds (Object.keys of the index)
 * @param query the unknown operationId the user typed
 * @param max   max number of suggestions (default 5)
 */
export function closestMatches(
  fts: FtsIndex | undefined,
  ids: string[],
  query: string,
  max = 5,
): string[] {
  // Prefer FTS when the inlined index is available.
  if (fts) {
    const hits = bm25Search(fts, query, max);
    if (hits.length > 0) {
      return hits.map((h) => h.operationId);
    }
  }

  // Fallback: substring match, then Levenshtein distance.
  const lower = query.toLowerCase();
  const substrMatches = ids.filter((id) => id.toLowerCase().includes(lower));
  if (substrMatches.length > 0) return substrMatches.slice(0, max);

  const scored = ids.map((id) => ({ id, dist: levenshtein(id.toLowerCase(), lower) }));
  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, max).map((s) => s.id);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
