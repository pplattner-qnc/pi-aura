// Unit tests for restSearch — the `aura.mjs rest search` subcommand with
// the semantic leg wired in.
//
// Seam: restSearch(index, query, out, opts?) runs BM25 + optional semantic
// cosine, merges via RRF, prints ranked operationIds with a one-line rationale.
//
// Scenarios tested:
// - Semantic leg active (provider present, model matches index) → semantic
//   rationale + fused scores via rrfMerge([semantic, fts]).
// - No provider → FTS-only with "semantic leg skipped (no embedding provider)" note.
// - Model mismatch → warning + FTS-only (no silent cross-model cosine).
// - Provider HTTP error at runtime → degrade to FTS-only with a warning.
// - Index built without vectors (embedModelId null) + provider configured →
//   skip semantic with warning, FTS-only.
//
// Run with: node --experimental-strip-types scripts/src/rest-search-semantic.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  buildRestIndex,
  buildRestIndexAsync,
  type RestIndexBlob,
} from "./gen-rest-index.ts";
import { CODE_TAGS, resolveCodeTags } from "./rest-code-tags.ts";
import { restSearch, type RestSearchOptions } from "./rest-search.ts";
import type { OutSink } from "./rest-list-describe.js";
import type { EmbedProvider } from "@pi-aura/shared/embed/provider";

const FIXTURE = join(
  import.meta.dirname,
  "..",
  "..",
  "packages",
  "shared",
  "test",
  "openapi-fixtures",
  "basic.yaml",
);

function makeSink(): OutSink & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    log: (...args: unknown[]) => out.push(args.join(" ")),
    error: (...args: unknown[]) => err.push(args.join(" ")),
  };
}

// Mock embedding provider that returns deterministic vectors.
// For "set my capacity commitment" → vector close to capacity op's vector.
function makeMockProvider(modelId: string, dims: number): EmbedProvider {
  return {
    modelId,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((text) => {
        const vec = new Float32Array(dims);
        // Deterministic: each text gets a vector based on its content
        for (let i = 0; i < dims; i++) {
          vec[i] = (text.charCodeAt(i % Math.max(text.length, 1)) % 10) / 10;
        }
        return vec;
      });
    },
  };
}

// Build a blob with vectors (so semantic leg can run)
async function makeBlobWithVectors(modelId: string, dims: number): Promise<RestIndexBlob> {
  const provider = makeMockProvider(modelId, dims);
  const embedFn = async (texts: string[]) => provider.embed(texts);
  return buildRestIndexAsync(FIXTURE, CODE_TAGS, resolveCodeTags, {
    embedFn,
    embedModelId: modelId,
    dims,
    dtype: "f32" as const,
  });
}

// ---------------------------------------------------------------------------
// restSearch — semantic leg active
// ---------------------------------------------------------------------------

describe("restSearch — semantic leg active", () => {
  it("ranks results using rrfMerge([semantic, fts]) when provider matches index model", async () => {
    const blob = await makeBlobWithVectors("test-model", 4);
    const sink = makeSink();
    const provider = makeMockProvider("test-model", 4);

    await restSearch(blob, "set my capacity commitment", sink, {
      embedProvider: provider,
    });

    const allOutput = [...sink.out, ...sink.err];
    // Should have results
    assert.ok(sink.out.length > 0, "has output");
    // Should mention the semantic leg
    assert.ok(
      allOutput.some((l) => l.includes("semantic") || l.includes("both")),
      "mentions semantic leg in rationale",
    );
  });

  it("notes which leg matched (semantic/FTS/both) + fused score", async () => {
    const blob = await makeBlobWithVectors("test-model", 4);
    const sink = makeSink();
    const provider = makeMockProvider("test-model", 4);

    await restSearch(blob, "capacity", sink, { embedProvider: provider });

    // At least one result line should mention a leg (semantic/FTS/both)
    const resultLines = sink.out.filter((l) => l.match(/^\s*\d+\./));
    assert.ok(resultLines.length > 0, "has numbered result lines");
    assert.ok(
      resultLines.some((l) =>
        l.includes("semantic") || l.includes("FTS") || l.includes("both")
      ),
      "result lines note which leg matched",
    );
  });
});

// ---------------------------------------------------------------------------
// restSearch — no provider (FTS-only fallback)
// ---------------------------------------------------------------------------

describe("restSearch — no provider (FTS-only)", () => {
  it("prints 'semantic leg skipped (no embedding provider)' note", async () => {
    const blob = await makeBlobWithVectors("test-model", 4);
    const sink = makeSink();

    await restSearch(blob, "capacity", sink);

    const allOutput = [...sink.out, ...sink.err];
    assert.ok(
      allOutput.some((l) =>
        l.includes("semantic leg skipped") && l.includes("no embedding provider")
      ),
      "prints the semantic leg skipped note",
    );
  });

  it("returns FTS-only results when no provider", async () => {
    const blob = await makeBlobWithVectors("test-model", 4);
    const sink = makeSink();

    await restSearch(blob, "set my capacity commitment", sink);

    assert.ok(sink.out.length > 0, "has results");
    const capLine = sink.out.find((l) => l.includes("updateTaskMemberCapacity"));
    assert.ok(capLine, "capacity op in results");
  });
});

// ---------------------------------------------------------------------------
// restSearch — model-id guard
// ---------------------------------------------------------------------------

describe("restSearch — model-id guard", () => {
  it("skips semantic leg with warning when runtime model differs from index model", async () => {
    const blob = await makeBlobWithVectors("index-model", 4);
    const sink = makeSink();
    const provider = makeMockProvider("runtime-model", 4);

    await restSearch(blob, "capacity", sink, { embedProvider: provider });

    const allOutput = [...sink.out, ...sink.err];
    // Should print a warning naming both models
    assert.ok(
      allOutput.some((l) =>
        l.includes("index-model") && l.includes("runtime-model")
      ),
      "warning names both models",
    );
    // Should still return FTS-only results
    assert.ok(
      sink.out.some((l) => l.includes("updateTaskMemberCapacity")),
      "FTS-only results returned despite model mismatch",
    );
    // Should mention FTS-only or semantic skipped
    assert.ok(
      allOutput.some((l) =>
        l.toLowerCase().includes("fts-only") ||
        l.toLowerCase().includes("semantic leg skipped")
      ),
      "indicates FTS-only fallback",
    );
  });

  it("skips semantic leg with warning when index has no vectors (embedModelId null) but provider is configured", async () => {
    // Build blob without vectors
    const blob = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);
    assert.equal(blob.embedModelId, null, "blob has no vectors");
    const sink = makeSink();
    const provider = makeMockProvider("runtime-model", 4);

    await restSearch(blob, "capacity", sink, { embedProvider: provider });

    const allOutput = [...sink.out, ...sink.err];
    // Should warn that index has no vectors
    assert.ok(
      allOutput.some((l) =>
        l.includes("no vectors") || l.includes("embedModelId") ||
        l.includes("semantic leg skipped")
      ),
      "warns that index has no vectors / semantic skipped",
    );
    // Should return FTS-only results
    assert.ok(
      sink.out.some((l) => l.includes("updateTaskMemberCapacity")),
      "FTS-only results returned",
    );
  });
});

// ---------------------------------------------------------------------------
// restSearch — runtime embed HTTP error
// ---------------------------------------------------------------------------

describe("restSearch — runtime embed error", () => {
  it("degrades to FTS-only with a warning when query embed fails", async () => {
    const blob = await makeBlobWithVectors("test-model", 4);
    const sink = makeSink();
    const failingProvider: EmbedProvider = {
      modelId: "test-model",
      async embed(): Promise<Float32Array[]> {
        throw new Error("connection refused");
      },
    };

    await restSearch(blob, "capacity", sink, { embedProvider: failingProvider });

    const allOutput = [...sink.out, ...sink.err];
    // Should print a warning about the embed failure
    assert.ok(
      allOutput.some((l) =>
        l.includes("embed") && (l.includes("fail") || l.includes("error") || l.includes("warning"))
      ),
      "warns about embed failure",
    );
    // Should still return FTS-only results (not crash)
    assert.ok(
      sink.out.some((l) => l.includes("updateTaskMemberCapacity")),
      "FTS-only results returned after embed failure",
    );
  });
});

// ---------------------------------------------------------------------------
// restSearch — existing FTS behavior preserved
// ---------------------------------------------------------------------------

describe("restSearch — FTS behavior preserved", () => {
  it("handles a query with no matching terms (empty results)", async () => {
    const blob = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);
    const sink = makeSink();

    await restSearch(blob, "zzzznonexistent", sink);

    const allOutput = [...sink.out, ...sink.err];
    assert.ok(allOutput.length > 0);
    assert.ok(
      allOutput.some((l) =>
        l.toLowerCase().includes("no result") ||
        l.toLowerCase().includes("no match") ||
        l.toLowerCase().includes("empty") ||
        l.includes("0 result")
      ),
      "indicates no results found",
    );
  });

  it("respects a --limit option", async () => {
    const blob = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);
    const sink = makeSink();

    await restSearch(blob, "task", sink, { limit: 1 });

    const resultLines = sink.out.filter((l) => l.match(/^\s*\d+\./));
    assert.ok(resultLines.length <= 1, `at most 1 result, got ${resultLines.length}`);
  });
});
