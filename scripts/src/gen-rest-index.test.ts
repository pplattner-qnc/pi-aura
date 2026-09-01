// Unit tests for gen-rest-index — the build-time index generator.
//
// Seam: buildRestIndex(openApiPath, codeTags) reads openapi.yaml via
// loadOpenApi, builds searchable text + FTS index + slim metadata blob,
// returns a RestIndexBlob. assertSizeBudget(blob, budgetBytes) asserts the
// blob fits the budget.
//
// Run with: node --experimental-strip-types scripts/src/gen-rest-index.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  buildRestIndex,
  assertSizeBudget,
  serializeRestIndexBlob,
  type RestIndexBlob,
  type SlimOpMeta,
} from "./gen-rest-index.ts";
import { CODE_TAGS, resolveCodeTags } from "./rest-code-tags.ts";

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

// ---------------------------------------------------------------------------
// buildRestIndex
// ---------------------------------------------------------------------------

describe("buildRestIndex", () => {
  const blob = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);

  it("returns a blob with version, metadata, fts, embedModelId, vectors", () => {
    assert.ok(blob.version, "has version");
    assert.ok(Array.isArray(blob.metadata), "metadata is an array");
    assert.ok(blob.fts, "has fts index");
    assert.equal(blob.embedModelId, null, "embedModelId null in this slice");
    assert.equal(blob.vectors, null, "vectors null in this slice");
  });

  it("metadata has one entry per operation (sorted by operationId)", () => {
    const ids = blob.metadata.map((m) => m.operationId);
    assert.ok(ids.includes("updateTaskMemberCapacity"));
    assert.ok(ids.includes("getTask"));
    assert.ok(ids.includes("unifiedSearch"));
    // Sorted
    const sorted = [...ids].sort();
    assert.deepEqual(ids, sorted);
  });

  it("metadata entries are slim (only fields list/describe/call need)", () => {
    const cap = blob.metadata.find((m) => m.operationId === "updateTaskMemberCapacity");
    assert.ok(cap, "capacity op in metadata");
    assert.equal(cap.method, "patch");
    assert.equal(cap.path, "/tasks/{uuid}/members/{userIdOrUuid}/capacity");
    assert.ok(cap.pathParams.length === 2, "has path params");
    assert.ok(cap.body, "has body");
    assert.equal(cap.body!.schemaRef, "TaskMemberCapacityUpdate");
    assert.ok(cap.tags.includes("Capacity"), "has spec tags");
    assert.equal(cap.summary, "Tasks: Set member capacity commitment");
    // Slim: should NOT have a 'description' field (long descriptions stay in FTS text only)
    assert.equal((cap as Record<string, unknown>).description, undefined, "no description in slim metadata");
  });

  it("metadata entries include response codes", () => {
    const cap = blob.metadata.find((m) => m.operationId === "updateTaskMemberCapacity");
    assert.ok(cap.responses.length > 0);
    const codes = cap.responses.map((r) => r.code).sort();
    assert.deepEqual(codes, ["200", "400", "401", "500"]);
  });

  it("FTS index contains searchable text including code-tags", () => {
    // The capacity op should have 'capacity' as a token from the code-tag
    const capDoc = blob.fts.docs.find((d) => d.operationId === "updateTaskMemberCapacity");
    assert.ok(capDoc, "capacity doc in FTS index");
    assert.ok(
      capDoc.terms.has("capacity"),
      "code-tag 'capacity' is in the FTS index text",
    );
  });

  it("is deterministic — same input produces same output", () => {
    const blob2 = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);
    const s1 = serializeRestIndexBlob(blob);
    const s2 = serializeRestIndexBlob(blob2);
    assert.equal(s1, s2, "byte-identical output");
  });
});

// ---------------------------------------------------------------------------
// assertSizeBudget
// ---------------------------------------------------------------------------

describe("assertSizeBudget", () => {
  it("passes when the blob is under the budget", () => {
    const blob = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);
    const size = serializeRestIndexBlob(blob).length;
    // Should easily pass under a generous budget
    assert.doesNotThrow(() => assertSizeBudget(blob, size * 2));
  });

  it("throws when the blob exceeds the budget, with actual size + remediation hints", () => {
    const blob = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);
    const size = serializeRestIndexBlob(blob).length;
    // Set a tiny budget (1 byte) to force failure
    assert.throws(
      () => assertSizeBudget(blob, 1),
      (err: Error) => {
        assert.ok(err.message.includes("size budget"), "mentions size budget");
        assert.ok(err.message.includes(String(size)), "includes actual size");
        assert.ok(
          err.message.includes("remediation") || err.message.includes("hint") || err.message.includes("drop"),
          "includes remediation hints",
        );
        return true;
      },
    );
  });

  it("passes at exactly the budget boundary", () => {
    const blob = buildRestIndex(FIXTURE, CODE_TAGS, resolveCodeTags);
    const size = serializeRestIndexBlob(blob).length;
    // At exactly the size it should pass (≤ budget)
    assert.doesNotThrow(() => assertSizeBudget(blob, size));
  });
});
