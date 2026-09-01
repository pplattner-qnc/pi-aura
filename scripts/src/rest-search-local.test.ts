// Unit tests for restSearch always-on semantic leg — the local-embeddings
// slice makes the semantic leg run by default (no configuration needed).
//
// Seam: restSearch(index, query, out, opts?) — when the index has vectors
// (built with the local model) and the runtime provider matches, the
// semantic leg runs by default. The "no embedding provider" note should
// only fire on genuine local-init failure, not on a normal install.
//
// The provider is MOCKED in tests (no real model download).
//
// Run with: node --experimental-strip-types scripts/src/rest-search-local.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  buildRestIndexAsync,
  type RestIndexBlob,
} from "./gen-rest-index.ts";
import { CODE_TAGS, resolveCodeTags } from "./rest-code-tags.ts";
import { restSearch } from "./rest-search.ts";
import type { OutSink } from "./rest-list-describe.js";
import type { EmbedProvider } from "@pi-aura/shared/embed/provider.js";

// LOCAL_MODEL_ID must match packages/shared/src/embed/local-provider.ts.
const LOCAL_MODEL_ID = "Xenova/multilingual-e5-base";

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

// Mock local provider that returns deterministic vectors.
// "commit allocation" → vector close to capacity op's vector.
function makeMockLocalProvider(dims: number): EmbedProvider {
  return {
    modelId: LOCAL_MODEL_ID,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((text) => {
        const vec = new Float32Array(dims);
        for (let i = 0; i < dims; i++) {
          vec[i] = (text.charCodeAt(i % Math.max(text.length, 1)) % 10) / 10;
        }
        return vec;
      });
    },
  };
}

// Build a blob with vectors using the local model (passage: prefixing applied)
async function makeBlobWithLocalVectors(dims: number): Promise<RestIndexBlob> {
  const provider = makeMockLocalProvider(dims);
  const embedFn = async (texts: string[]) => provider.embed(texts);
  return buildRestIndexAsync(FIXTURE, CODE_TAGS, resolveCodeTags, {
    embedFn,
    embedModelId: LOCAL_MODEL_ID,
    dims,
    dtype: "f32" as const,
  });
}

// ---------------------------------------------------------------------------
// restSearch — always-on semantic leg (local model)
// ---------------------------------------------------------------------------

describe("restSearch — always-on semantic leg (local model)", () => {
  it("runs the semantic leg by default when index has local-model vectors and provider matches", async () => {
    const blob = await makeBlobWithLocalVectors(4);
    const sink = makeSink();
    const provider = makeMockLocalProvider(4);

    await restSearch(blob, "commit allocation", sink, {
      embedProvider: provider,
    });

    const allOutput = [...sink.out, ...sink.err];
    // Should NOT print the "no embedding provider" note (provider is present)
    assert.ok(
      !allOutput.some((l) => l.includes("no embedding provider")),
      "should NOT print 'no embedding provider' note when provider is present",
    );
    // Should have results
    assert.ok(sink.out.length > 0, "has results");
    // Should mention semantic leg in rationale
    assert.ok(
      allOutput.some((l) => l.includes("semantic") || l.includes("both")),
      "mentions semantic leg in rationale",
    );
  });

  it("ranks updateTaskMemberCapacity in results for 'commit allocation' (vocabulary mismatch)", async () => {
    const blob = await makeBlobWithLocalVectors(4);
    const sink = makeSink();
    const provider = makeMockLocalProvider(4);

    await restSearch(blob, "commit allocation", sink, {
      embedProvider: provider,
    });

    // The capacity op should appear in results (semantic + FTS combined)
    const capLine = sink.out.find((l) => l.includes("updateTaskMemberCapacity"));
    assert.ok(capLine, "updateTaskMemberCapacity in results");
  });

  it("applies 'query: ' prefix to the runtime query (E5 convention)", async () => {
    const blob = await makeBlobWithLocalVectors(4);
    const sink = makeSink();
    let capturedTexts: string[] | null = null;
    const trackingProvider: EmbedProvider = {
      modelId: LOCAL_MODEL_ID,
      async embed(texts: string[]): Promise<Float32Array[]> {
        capturedTexts = [...texts];
        return texts.map(() => new Float32Array(4));
      },
    };

    await restSearch(blob, "commit allocation", sink, {
      embedProvider: trackingProvider,
    });

    assert.ok(capturedTexts, "provider was called");
    assert.equal(capturedTexts!.length, 1, "one text (the query)");
    assert.ok(
      capturedTexts![0].startsWith("query: "),
      "query is prefixed with 'query: '",
    );
  });

  it("does NOT print 'semantic leg skipped (no embedding provider)' on a normal run with local provider", async () => {
    const blob = await makeBlobWithLocalVectors(4);
    const sink = makeSink();
    const provider = makeMockLocalProvider(4);

    await restSearch(blob, "capacity", sink, { embedProvider: provider });

    const allOutput = [...sink.out, ...sink.err];
    assert.ok(
      !allOutput.some((l) =>
        l.includes("semantic leg skipped") && l.includes("no embedding provider")
      ),
      "no 'no embedding provider' note when local provider is active",
    );
  });
});

// ---------------------------------------------------------------------------
// restSearch — graceful fallback on local provider failure
// ---------------------------------------------------------------------------

describe("restSearch — graceful fallback on local provider failure", () => {
  it("degrades to FTS-only with actionable note when local provider embed fails", async () => {
    const blob = await makeBlobWithLocalVectors(4);
    const sink = makeSink();
    const failingProvider: EmbedProvider = {
      modelId: LOCAL_MODEL_ID,
      async embed(): Promise<Float32Array[]> {
        throw new Error("model download failed: check network or ~/.pi/aura/huggingface");
      },
    };

    await restSearch(blob, "capacity", sink, { embedProvider: failingProvider });

    const allOutput = [...sink.out, ...sink.err];
    // Should print a warning about the embed failure
    assert.ok(
      allOutput.some((l) =>
        l.includes("embed") && (l.includes("fail") || l.includes("error"))
      ),
      "warns about embed failure",
    );
    // Should still return FTS-only results (not crash)
    assert.ok(
      sink.out.some((l) => l.includes("updateTaskMemberCapacity")),
      "FTS-only results returned after embed failure",
    );
    // Should NOT crash / hard-fail
    assert.ok(sink.out.length > 0, "search still returns results");
  });
});
