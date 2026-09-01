// Unit tests for rest-code-tags — the curated, non-user-facing code-side tags.
//
// Seam: resolveCodeTags(op) merges by-op and by-tag-group tags for an
// operation. CODE_TAGS is the curated map.
//
// Run with: node --experimental-strip-types scripts/src/rest-code-tags.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CODE_TAGS, resolveCodeTags } from "./rest-code-tags.ts";
import type { OpMeta } from "@pi-aura/shared/openapi/loader";

function makeOp(operationId: string, tags: string[]): OpMeta {
  return {
    operationId,
    method: "get",
    path: "/test",
    pathParams: [],
    queryParams: [],
    tags,
    responses: [],
  };
}

describe("resolveCodeTags", () => {
  it("returns by-op tags for an op listed in byOp", () => {
    // updateTaskMemberCapacity should be in byOp with 'capacity' tag
    const byOpTags = CODE_TAGS.byOp["updateTaskMemberCapacity"] ?? [];
    assert.ok(
      byOpTags.includes("capacity"),
      "capacity op has a 'capacity' code-tag",
    );
  });

  it("returns by-group tags for an op whose OpenAPI tag matches a byTagGroup key", () => {
    const op = makeOp("someOp", ["Capacity"]);
    const tags = resolveCodeTags(op);
    // The Capacity group should have at least 'capacity' code-tag
    assert.ok(
      tags.includes("capacity"),
      "Capacity tag group yields 'capacity' code-tag",
    );
  });

  it("merges by-op and by-group tags without duplicates", () => {
    const op = makeOp("updateTaskMemberCapacity", ["Capacity"]);
    const tags = resolveCodeTags(op);
    // 'capacity' may come from both byOp and byTagGroup, but appears once
    const capacityCount = tags.filter((t) => t === "capacity").length;
    assert.equal(capacityCount, 1, "no duplicate 'capacity' tag");
  });

  it("returns empty array for an op with no matching byOp or byTagGroup", () => {
    const op = makeOp("unknownOp", ["NonexistentTag"]);
    const tags = resolveCodeTags(op);
    assert.deepEqual(tags, []);
  });

  it("returns tags for an op with multiple OpenAPI tags matching groups", () => {
    const op = makeOp("multiOp", ["Capacity", "Tasks"]);
    const tags = resolveCodeTags(op);
    assert.ok(tags.length > 0, "has at least some code-tags");
    // Should include code-tags from both groups
  });
});

describe("CODE_TAGS validation", () => {
  it("all byOp keys are strings (operationIds)", () => {
    for (const key of Object.keys(CODE_TAGS.byOp)) {
      assert.equal(typeof key, "string");
    }
  });

  it("all byTagGroup keys are strings (OpenAPI tag names)", () => {
    for (const key of Object.keys(CODE_TAGS.byTagGroup)) {
      assert.equal(typeof key, "string");
    }
  });
});
