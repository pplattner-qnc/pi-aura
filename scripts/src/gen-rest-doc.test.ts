// Unit tests for generateRestDocMd — the build-time generator that produces
// skills/core/aura/resources/rest-api.md from the OpenAPI loader index.
//
// Seam: generateRestDocMd(index) is a pure function that returns a markdown
// string (deterministic, sorted by tag then operationId).
//
// Run with: node --experimental-strip-types scripts/src/gen-rest-doc.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadOpenApi } from "@pi-aura/shared/openapi/loader";
import { generateRestDocMd } from "./gen-rest-doc.ts";

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

describe("generateRestDocMd", () => {
  it("produces markdown with all operations grouped by tag", () => {
    const index = loadOpenApi(FIXTURE);
    const md = generateRestDocMd(index);
    assert.ok(md.includes("# Aura REST API Reference"), "has title");
    assert.ok(md.includes("## Capacity"), "has Capacity group");
    assert.ok(md.includes("## Search"), "has Search group");
    assert.ok(md.includes("## Tasks"), "has Tasks group");
  });

  it("includes operationId, method, path, summary for each op", () => {
    const index = loadOpenApi(FIXTURE);
    const md = generateRestDocMd(index);
    assert.ok(md.includes("updateTaskMemberCapacity"), "has capacity op");
    assert.ok(md.includes("PATCH"), "has method");
    assert.ok(md.includes("/tasks/{uuid}/members/{userIdOrUuid}/capacity"), "has path");
  });

  it("includes path params, query params, body, and responses in the detail", () => {
    const index = loadOpenApi(FIXTURE);
    const md = generateRestDocMd(index);
    // Path params
    assert.ok(md.includes("uuid"), "has path param uuid");
    assert.ok(md.includes("userIdOrUuid"), "has path param userIdOrUuid");
    // Body
    assert.ok(md.includes("TaskMemberCapacityUpdate"), "has body schema ref");
    // Responses
    assert.ok(md.includes("200"), "has response 200");
    assert.ok(md.includes("400"), "has response 400");
  });

  it("groups no-tag operations under Other", () => {
    const index: Record<string, unknown> = {
      noTagOp: {
        operationId: "noTagOp",
        method: "get",
        path: "/no-tag",
        pathParams: [],
        queryParams: [],
        tags: [],
        summary: "no tags",
        responses: [],
      },
      taggedOp: {
        operationId: "taggedOp",
        method: "get",
        path: "/tagged",
        pathParams: [],
        queryParams: [],
        tags: ["Alpha"],
        summary: "has tags",
        responses: [],
      },
    };
    const md = generateRestDocMd(index as never);
    assert.ok(md.includes("## Other"), "has Other group for no-tag op");
    assert.ok(md.includes("## Alpha"), "has Alpha group");
  });

  it("is deterministic — same index produces byte-identical output", () => {
    const index = loadOpenApi(FIXTURE);
    const md1 = generateRestDocMd(index);
    const md2 = generateRestDocMd(index);
    assert.equal(md1, md2, "byte-identical on regenerate");
  });

  it("contains updateTaskMemberCapacity under the Capacity group in the real spec", () => {
    const realPath = join(
      import.meta.dirname,
      "..",
      "..",
      "packages",
      "shared",
      "openapi",
      "openapi.yaml",
    );
    const index = loadOpenApi(realPath);
    const md = generateRestDocMd(index);
    // The capacity op should appear under the Capacity group heading
    const capacitySection = md.indexOf("## Capacity");
    assert.ok(capacitySection > -1, "Capacity group exists");
    const capacityOpPos = md.indexOf("updateTaskMemberCapacity", capacitySection);
    assert.ok(capacityOpPos > -1, "capacity op under Capacity group");
    // Should contain the path params
    const paramPos = md.indexOf("uuid", capacityOpPos);
    assert.ok(paramPos > -1, "path param uuid present");
  });
});
