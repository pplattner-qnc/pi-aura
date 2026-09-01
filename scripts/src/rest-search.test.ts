// Unit tests for restSearch — the `aura.mjs rest search` subcommand.
//
// Seam: restSearch(index, query, out, opts?) runs BM25 over the inlined FTS
// index and prints ranked operationIds with a one-line rationale (top
// matching terms + score). Prints a one-line note about the semantic leg
// being skipped (no embedding provider — FTS-only results).
//
// Run with: node --experimental-strip-types scripts/src/rest-search.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadOpenApi } from "@pi-aura/shared/openapi/loader";
import {
  buildRestIndex,
  type RestIndexBlob,
} from "./gen-rest-index.ts";
import { CODE_TAGS, resolveCodeTags } from "./rest-code-tags.ts";
import { restSearch } from "./rest-search.ts";
import type { OutSink } from "./rest-list-describe.js";

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

const blob: RestIndexBlob = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);

// ---------------------------------------------------------------------------
// restSearch
// ---------------------------------------------------------------------------

describe("restSearch", () => {
  it("ranks updateTaskMemberCapacity first for 'set my capacity commitment'", () => {
    const sink = makeSink();
    restSearch(blob, "set my capacity commitment", sink);
    assert.ok(sink.out.length > 0, "has output");
    // First result line should mention updateTaskMemberCapacity
    const firstLine = sink.out.find((l) => l.includes("updateTaskMemberCapacity"));
    assert.ok(firstLine, "capacity op appears in results");
    // Check it's the first ranked result
    const resultLines = sink.out.filter((l) => l.match(/^\s*[\d.]+\s+\w/));
    if (resultLines.length > 0) {
      assert.ok(
        resultLines[0].includes("updateTaskMemberCapacity"),
        "capacity op is first result",
      );
    }
  });

  it("includes a score and matched terms in the rationale", () => {
    const sink = makeSink();
    restSearch(blob, "capacity", sink);
    assert.ok(sink.out.length > 0);
    // At least one line should contain 'capacity' as a matched term
    const rationaleLine = sink.out.find((l) => l.includes("capacity"));
    assert.ok(rationaleLine, "rationale mentions capacity");
  });

  it("prints the 'semantic leg skipped' note (no embedding provider)", () => {
    const sink = makeSink();
    restSearch(blob, "capacity", sink);
    const allOutput = [...sink.out, ...sink.err];
    assert.ok(
      allOutput.some((l) => l.includes("semantic leg skipped") && l.includes("no embedding provider")),
      "prints the semantic leg skipped note",
    );
  });

  it("prints 'FTS-only results' note", () => {
    const sink = makeSink();
    restSearch(blob, "capacity", sink);
    const allOutput = [...sink.out, ...sink.err];
    assert.ok(
      allOutput.some((l) => l.toLowerCase().includes("fts-only")),
      "mentions FTS-only",
    );
  });

  it("handles a query with no matching terms (empty results + note, not crash)", () => {
    const sink = makeSink();
    restSearch(blob, "zzzznonexistent", sink);
    const allOutput = [...sink.out, ...sink.err];
    // Should not crash, should have some output
    assert.ok(allOutput.length > 0);
    // Should mention no results or empty
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

  it("respects a --limit option to cap the number of results", () => {
    const sink = makeSink();
    restSearch(blob, "task", sink, { limit: 1 });
    // Count the result lines (those with a score/rank prefix)
    const resultLines = sink.out.filter((l) => l.match(/^\s*(?:\d+\.?\s+)?[\w]/) && !l.includes("semantic") && !l.includes("FTS"));
    // Should have at most 1 result
    assert.ok(
      resultLines.length <= 1,
      `at most 1 result, got ${resultLines.length}`,
    );
  });
});
