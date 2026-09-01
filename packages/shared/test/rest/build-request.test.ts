// Unit tests for buildRequest — the pure request builder for the REST invoker.
//
// Seam: buildRequest(op, params, body) → { method, urlPath, query, headers,
// body? } is a PURE function: no network, no auth. It fills path params,
// serializes query params, and attaches a JSON body.
//
// Run with: npx tsx --test test/rest/build-request.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRequest } from "../../src/rest/build-request.js";
import type { OpMeta, Param } from "../../src/openapi/loader.js";

// --- Fixture helpers ---

function param(
  name: string,
  opts: { required?: boolean; type?: string; format?: string; style?: string; explode?: boolean; items?: { type?: string } } = {},
): Param {
  return {
    name,
    required: opts.required ?? false,
    schema: {
      type: opts.type ?? "string",
      format: opts.format,
      items: opts.items ? { type: opts.items.type } : undefined,
    },
    style: opts.style,
    explode: opts.explode,
  };
}

function op(
  overrides: Partial<OpMeta> & { operationId: string },
): OpMeta {
  return {
    operationId: overrides.operationId,
    method: overrides.method ?? "get",
    path: overrides.path ?? "/test",
    pathParams: overrides.pathParams ?? [],
    queryParams: overrides.queryParams ?? [],
    body: overrides.body,
    tags: overrides.tags ?? [],
    summary: overrides.summary,
    description: overrides.description,
    responses: overrides.responses ?? [],
  };
}

// --- Tests ---

describe("buildRequest — path filling", () => {
  it("fills {name} placeholders from params", () => {
    const testOp = op({
      operationId: "updateCapacity",
      method: "patch",
      path: "/tasks/{uuid}/members/{userIdOrUuid}/capacity",
      pathParams: [
        param("uuid", { required: true, format: "uuid" }),
        param("userIdOrUuid", { required: true }),
      ],
    });
    const result = buildRequest(testOp, { uuid: "abc-123", userIdOrUuid: "me" });
    assert.equal(result.method, "PATCH");
    assert.equal(result.urlPath, "/tasks/abc-123/members/me/capacity");
  });

  it("errors on missing required path param, naming the param and the operation", () => {
    const testOp = op({
      operationId: "updateCapacity",
      method: "patch",
      path: "/tasks/{uuid}/members/{userIdOrUuid}/capacity",
      pathParams: [
        param("uuid", { required: true, format: "uuid" }),
        param("userIdOrUuid", { required: true }),
      ],
    });
    assert.throws(
      () => buildRequest(testOp, { uuid: "abc-123" }),
      /userIdOrUuid.*updateCapacity|updateCapacity.*userIdOrUuid/,
      "error should name both the param and the operation",
    );
  });

  it("errors on extra path param not in the template", () => {
    const testOp = op({
      operationId: "getTask",
      method: "get",
      path: "/tasks/{uuid}",
      pathParams: [param("uuid", { required: true })],
    });
    assert.throws(
      () => buildRequest(testOp, { uuid: "abc-123", bogus: "nope" }),
      /bogus/,
      "error should name the extra param",
    );
  });
});

describe("buildRequest — query serialization", () => {
  it("serializes scalar query params as-is", () => {
    const testOp = op({
      operationId: "listTasks",
      method: "get",
      path: "/tasks",
      queryParams: [
        param("page", { type: "integer" }),
        param("limit", { type: "integer" }),
      ],
    });
    const result = buildRequest(testOp, { page: "1", limit: "20" });
    assert.equal(result.query, "?page=1&limit=20");
  });

  it("serializes array query param comma-separated (form style default)", () => {
    const testOp = op({
      operationId: "listAsana",
      method: "get",
      path: "/asana-tasks",
      queryParams: [
        param("level", { type: "array", items: { type: "string" } }),
      ],
    });
    const result = buildRequest(testOp, { level: ["A", "B", "C"] });
    assert.equal(result.query, "?level=A,B,C");
  });

  it("serializes array query param with explode=true using repeated keys", () => {
    const testOp = op({
      operationId: "listAsana",
      method: "get",
      path: "/asana-tasks",
      queryParams: [
        param("level", { type: "array", items: { type: "string" }, style: "form", explode: true }),
      ],
    });
    const result = buildRequest(testOp, { level: ["A", "B"] });
    assert.equal(result.query, "?level=A&level=B");
  });

  it("fails loudly on unsupported query style (spaceDelimited)", () => {
    const testOp = op({
      operationId: "listThings",
      method: "get",
      path: "/things",
      queryParams: [
        param("tags", { type: "array", items: { type: "string" }, style: "spaceDelimited" }),
      ],
    });
    assert.throws(
      () => buildRequest(testOp, { tags: ["a", "b"] }),
      /spaceDelimited/,
      "error should name the unsupported style",
    );
  });

  it("fails loudly on unsupported query style (pipeDelimited)", () => {
    const testOp = op({
      operationId: "listThings",
      method: "get",
      path: "/things",
      queryParams: [
        param("tags", { type: "array", items: { type: "string" }, style: "pipeDelimited" }),
      ],
    });
    assert.throws(
      () => buildRequest(testOp, { tags: ["a", "b"] }),
      /pipeDelimited/,
      "error should name the unsupported style",
    );
  });

  it("omits query string when there are no query params provided", () => {
    const testOp = op({
      operationId: "getTask",
      method: "get",
      path: "/tasks/{uuid}",
      pathParams: [param("uuid", { required: true })],
    });
    const result = buildRequest(testOp, { uuid: "abc" });
    assert.equal(result.query, "");
  });

  it("URL-encodes query param values", () => {
    const testOp = op({
      operationId: "search",
      method: "get",
      path: "/search",
      queryParams: [param("q", { type: "string" })],
    });
    const result = buildRequest(testOp, { q: "hello world & more" });
    assert.ok(result.query.includes("hello%20world"));
    assert.ok(result.query.includes("%26"));
  });
});

describe("buildRequest — body", () => {
  it("attaches JSON body and sets Content-Type: application/json", () => {
    const testOp = op({
      operationId: "createThing",
      method: "post",
      path: "/things",
      body: { contentType: "application/json", required: true },
    });
    const result = buildRequest(testOp, {}, { name: "test" });
    assert.equal(result.headers["Content-Type"], "application/json");
    assert.equal(result.body, JSON.stringify({ name: "test" }));
  });

  it("errors when body is required but none given", () => {
    const testOp = op({
      operationId: "createThing",
      method: "post",
      path: "/things",
      body: { contentType: "application/json", required: true },
    });
    assert.throws(
      () => buildRequest(testOp, {}),
      /body.*required|required.*body|createThing/i,
      "error should mention body is required",
    );
  });

  it("errors when op has no body but body is given", () => {
    const testOp = op({
      operationId: "getThing",
      method: "get",
      path: "/things/{uuid}",
      pathParams: [param("uuid", { required: true })],
      body: undefined,
    });
    assert.throws(
      () => buildRequest(testOp, { uuid: "abc" }, { unexpected: "body" }),
      /body/i,
      "error should mention body not expected",
    );
  });

  it("does not set Content-Type when there is no body (GET)", () => {
    const testOp = op({
      operationId: "getTask",
      method: "get",
      path: "/tasks/{uuid}",
      pathParams: [param("uuid", { required: true })],
    });
    const result = buildRequest(testOp, { uuid: "abc" });
    assert.ok(!("Content-Type" in result.headers), "no Content-Type for bodyless request");
  });

  it("accepts optional body (not required) when given", () => {
    const testOp = op({
      operationId: "optionalBody",
      method: "post",
      path: "/opt",
      body: { contentType: "application/json", required: false },
    });
    const result = buildRequest(testOp, {}, { data: 42 });
    assert.equal(result.headers["Content-Type"], "application/json");
    assert.equal(result.body, JSON.stringify({ data: 42 }));
  });

  it("accepts optional body (not required) when omitted", () => {
    const testOp = op({
      operationId: "optionalBody",
      method: "post",
      path: "/opt",
      body: { contentType: "application/json", required: false },
    });
    const result = buildRequest(testOp, {});
    assert.ok(!("Content-Type" in result.headers), "no Content-Type when optional body omitted");
  });
});

describe("buildRequest — method", () => {
  it("uppercases the HTTP method", () => {
    const testOp = op({
      operationId: "getThing",
      method: "get",
      path: "/things",
    });
    const result = buildRequest(testOp, {});
    assert.equal(result.method, "GET");
  });

  it("handles PATCH method", () => {
    const testOp = op({
      operationId: "patchThing",
      method: "patch",
      path: "/things",
      body: { contentType: "application/json", required: true },
    });
    const result = buildRequest(testOp, {}, { x: 1 });
    assert.equal(result.method, "PATCH");
  });
});
