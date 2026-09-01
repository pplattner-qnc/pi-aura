// Unit tests for buildFtsIndex / bm25Search — the BM25 full-text search
// module behind `rest search`.
//
// Seam: buildFtsIndex(ops) / bm25Search(index, query, k?) are pure functions.
//
// Run with: cd packages/shared && npx tsx --test test/rest/fts.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFtsIndex,
  bm25Search,
  rrfMerge,
  type SearchableOp,
  type FtsIndex,
} from "../../src/rest/fts.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OPS: SearchableOp[] = [
  {
    operationId: "updateTaskMemberCapacity",
    text: "updateTaskMemberCapacity Tasks Set member capacity commitment set change remove capacity tag",
  },
  {
    operationId: "getTask",
    text: "getTask Get a task by uuid task",
  },
  {
    operationId: "unifiedSearch",
    text: "unifiedSearch Unified semantic search search across resource types semantic",
  },
];

// ---------------------------------------------------------------------------
// buildFtsIndex
// ---------------------------------------------------------------------------

describe("buildFtsIndex", () => {
  it("computes term frequencies per document", () => {
    const index = buildFtsIndex(OPS);
    const doc = index.docs[0]; // updateTaskMemberCapacity
    assert.equal(doc.operationId, "updateTaskMemberCapacity");
    assert.equal(doc.terms.get("capacity"), 2, "'capacity' appears twice");
    assert.equal(doc.terms.get("set"), 2, "'set' appears twice");
    assert.equal(doc.terms.get("task"), undefined, "'task' not in doc 0 (no 'task' token in capacity text)");
    assert.equal(doc.length, 11, "doc length = total token count");
  });

  it("computes document frequencies", () => {
    const index = buildFtsIndex(OPS);
    assert.equal(index.docFreq.get("capacity"), 1, "'capacity' in 1 doc");
    assert.equal(index.docFreq.get("search"), 1, "'search' in 1 doc (unifiedSearch)");
    assert.equal(index.docFreq.get("task"), 1, "'task' in 1 doc (getTask only — camelCase opId doesn't split)");
  });

  it("computes average document length", () => {
    const index = buildFtsIndex(OPS);
    const total = OPS.reduce((sum, op) => sum + op.text.split(/\W+/).filter(Boolean).length, 0);
    assert.equal(index.avgDocLength, total / OPS.length);
  });

  it("tokenizes by splitting on non-alphanumerics and lowercasing", () => {
    const ops: SearchableOp[] = [
      { operationId: "op1", text: "Hello-World_Foo Bar.Baz" },
    ];
    const index = buildFtsIndex(ops);
    const doc = index.docs[0];
    assert.equal(doc.terms.get("hello"), 1);
    assert.equal(doc.terms.get("world"), 1);
    assert.equal(doc.terms.get("foo"), 1);
    assert.equal(doc.terms.get("bar"), 1);
    assert.equal(doc.terms.get("baz"), 1);
    assert.equal(doc.length, 5);
  });

  it("handles a doc with empty text (name only via operationId — but here empty)", () => {
    const ops: SearchableOp[] = [
      { operationId: "emptyOp", text: "" },
      { operationId: "realOp", text: "something here" },
    ];
    const index = buildFtsIndex(ops);
    assert.equal(index.docs[0].length, 0, "empty doc has length 0");
    assert.equal(index.docs[0].terms.size, 0, "no terms");
    assert.equal(index.avgDocLength, 1, "(0 + 2) / 2 = 1");
  });
});

// ---------------------------------------------------------------------------
// bm25Search
// ---------------------------------------------------------------------------

describe("bm25Search", () => {
  const index = buildFtsIndex(OPS);

  it("ranks the capacity op first for 'set my capacity commitment'", () => {
    const hits = bm25Search(index, "set my capacity commitment");
    assert.ok(hits.length > 0, "has results");
    assert.equal(hits[0].operationId, "updateTaskMemberCapacity");
  });

  it("returns hits with operationId, score, and matched terms", () => {
    const hits = bm25Search(index, "capacity");
    assert.ok(hits.length > 0);
    const hit = hits[0];
    assert.equal(typeof hit.score, "number");
    assert.ok(hit.terms.includes("capacity"), "matched term 'capacity' in rationale");
  });

  it("ranks by relevance: 'semantic search' → unifiedSearch first", () => {
    const hits = bm25Search(index, "semantic search");
    assert.ok(hits.length > 0);
    assert.equal(hits[0].operationId, "unifiedSearch");
  });

  it("returns empty array for query with no matching terms", () => {
    const hits = bm25Search(index, "zzzznonexistent");
    assert.deepEqual(hits, []);
  });

  it("respects the k limit (top-k results)", () => {
    const hits = bm25Search(index, "task", 1);
    assert.ok(hits.length <= 1);
    // 'task' appears in both getTask and updateTaskMemberCapacity
    const hits2 = bm25Search(index, "task", 1);
    assert.equal(hits2.length, 1);
  });

  it("sorts results by descending score", () => {
    const hits = bm25Search(index, "capacity task");
    assert.ok(hits.length >= 2);
    for (let i = 1; i < hits.length; i++) {
      assert.ok(hits[i - 1].score >= hits[i].score, "descending by score");
    }
  });
});

// ---------------------------------------------------------------------------
// rrfMerge
// ---------------------------------------------------------------------------

describe("rrfMerge", () => {
  it("returns the same order as the single input when only one ranking", () => {
    const ftsRanking = ["updateTaskMemberCapacity", "getTask", "unifiedSearch"];
    const merged = rrfMerge([ftsRanking]);
    const mergedIds = [...merged.keys()];
    assert.deepEqual(mergedIds, ftsRanking);
  });

  it("assigns higher RRF score to higher-ranked items in single-leg mode", () => {
    const ftsRanking = ["a", "b", "c"];
    const merged = rrfMerge([ftsRanking]);
    assert.ok(merged.get("a")! > merged.get("b")!);
    assert.ok(merged.get("b")! > merged.get("c")!);
  });

  it("merges two rankings (RRF with k=60 default)", () => {
    const ftsRanking = ["a", "b", "c"];
    const semanticRanking = ["b", "c", "a"];
    const merged = rrfMerge([ftsRanking, semanticRanking]);
    // 'b' is rank 2 in fts and rank 1 in semantic → highest combined RRF score
    const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]);
    assert.equal(sorted[0][0], "b", "'b' top after RRF (high rank in both legs)");
  });

  it("accepts variable arity (3 rankings)", () => {
    const merged = rrfMerge([["a"], ["a"], ["a"]]);
    assert.ok(merged.has("a"));
    // 'a' gets 3 × 1/(60+1) ≈ 0.0492
    assert.ok(merged.get("a")! > 0);
  });

  it("preserves items only in one ranking", () => {
    const merged = rrfMerge([["a", "b"], ["c"]]);
    assert.ok(merged.has("a"));
    assert.ok(merged.has("b"));
    assert.ok(merged.has("c"));
  });

  it("respects custom k parameter", () => {
    const k = 10;
    const merged = rrfMerge([["a", "b"]], k);
    // score for rank 1: 1/(k+1), rank 2: 1/(k+1+1) = 1/12
    assert.equal(merged.get("a"), 1 / (k + 1));
    assert.equal(merged.get("b"), 1 / (k + 1 + 1));
  });
});
