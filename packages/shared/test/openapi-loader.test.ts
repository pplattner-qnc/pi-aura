// Unit tests for loadOpenApi — the OpenAPI loader in @pi-aura/shared.
//
// Seam: loadOpenApi(path) reads a YAML file and returns an OpenApiIndex
// (Record<operationId, OpMeta>). Pure, file-based, no network.
//
// Run with: npx tsx --test test/openapi-loader.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadOpenApi } from "../src/openapi/loader.js";

const FIXTURE_DIR = join(import.meta.dirname, "openapi-fixtures");
const basicFixture = join(FIXTURE_DIR, "basic.yaml");
const edgeFixture = join(FIXTURE_DIR, "edge-cases.yaml");

describe("loadOpenApi — basic fixture", () => {
  it("returns an index keyed by operationId", () => {
    const index = loadOpenApi(basicFixture);
    assert.ok(index.updateTaskMemberCapacity, "updateTaskMemberCapacity present");
    assert.ok(index.getTask, "getTask present");
    assert.ok(index.unifiedSearch, "unifiedSearch present");
    assert.equal(Object.keys(index).length, 3);
  });

  it("parses method, path, tags, summary, description", () => {
    const index = loadOpenApi(basicFixture);
    const op = index.updateTaskMemberCapacity;
    assert.equal(op.operationId, "updateTaskMemberCapacity");
    assert.equal(op.method, "patch");
    assert.equal(op.path, "/tasks/{uuid}/members/{userIdOrUuid}/capacity");
    assert.deepEqual(op.tags, ["Capacity"]);
    assert.equal(op.summary, "Tasks: Set member capacity commitment");
    assert.ok(op.description?.includes("capacity commitment"));
  });

  it("extracts path params from the path template and parameters", () => {
    const index = loadOpenApi(basicFixture);
    const op = index.updateTaskMemberCapacity;
    assert.equal(op.pathParams.length, 2);
    assert.equal(op.pathParams[0].name, "uuid");
    assert.equal(op.pathParams[0].required, true);
    assert.equal(op.pathParams[0].schema.type, "string");
    assert.equal(op.pathParams[0].schema.format, "uuid");
    assert.equal(op.pathParams[1].name, "userIdOrUuid");
    assert.equal(op.pathParams[1].schema.type, "string");
  });

  it("extracts query params including $ref-resolved ones", () => {
    const index = loadOpenApi(basicFixture);
    const op = index.unifiedSearch;
    assert.equal(op.queryParams.length, 2);
    const limitParam = op.queryParams.find((p) => p.name === "limit");
    assert.ok(limitParam);
    assert.equal(limitParam.required, false);
    assert.equal(limitParam.schema.type, "integer");
    const qParam = op.queryParams.find((p) => p.name === "q");
    assert.ok(qParam, "resolved $ref SearchParam found");
    assert.equal(qParam.required, false);
    assert.equal(qParam.schema.type, "string");
  });

  it("parses request body with schemaRef", () => {
    const index = loadOpenApi(basicFixture);
    const op = index.updateTaskMemberCapacity;
    assert.ok(op.body, "body present");
    assert.equal(op.body!.contentType, "application/json");
    assert.equal(op.body!.schemaRef, "TaskMemberCapacityUpdate");
    assert.equal(op.body!.required, true);
  });

  it("parses request body with inline schema (schemaInline)", () => {
    const index = loadOpenApi(basicFixture);
    const op = index.unifiedSearch;
    assert.ok(op.body, "body present");
    assert.equal(op.body!.contentType, "application/json");
    assert.ok(op.body!.schemaInline, "inline schema present");
    assert.equal(op.body!.required, true);
  });

  it("parses responses with codes and descriptions, resolving $ref responses", () => {
    const index = loadOpenApi(basicFixture);
    const op = index.updateTaskMemberCapacity;
    const codes = op.responses.map((r) => r.code).sort();
    assert.deepEqual(codes, ["200", "400", "401", "500"]);
    const r200 = op.responses.find((r) => r.code === "200");
    assert.equal(r200!.description, "Capacity updated; returns updated task detail");
    assert.equal(r200!.schemaRef, "TaskDetail");
    const r401 = op.responses.find((r) => r.code === "401");
    assert.equal(r401!.description, "Unauthorized");
  });

  it("handles operations with no body", () => {
    const index = loadOpenApi(basicFixture);
    const op = index.getTask;
    assert.equal(op.body, undefined);
  });

  it("caches per-process (same object returned for same path)", () => {
    const a = loadOpenApi(basicFixture);
    const b = loadOpenApi(basicFixture);
    assert.equal(a, b, "cached object returned");
  });
});

describe("loadOpenApi — edge cases", () => {
  it("parses multiple path params from /a/{x}/b/{y}", () => {
    const index = loadOpenApi(edgeFixture);
    const op = index.multiParamOp;
    assert.equal(op.pathParams.length, 2);
    assert.equal(op.pathParams[0].name, "x");
    assert.equal(op.pathParams[1].name, "y");
  });

  it("groups no-tag operations under Other (empty tags array)", () => {
    const index = loadOpenApi(edgeFixture);
    const op = index.noTagOp;
    assert.deepEqual(op.tags, []);
  });

  it("skips operations with no operationId with a loud warning", () => {
    const index = loadOpenApi(edgeFixture);
    assert.equal(index.no_opid ?? index["no-opid"], undefined, "op without id not in index");
    // Should have 5 ops (all except the no-opid one)
    const ids = Object.keys(index);
    assert.ok(!ids.some((id) => id === "no-opid" || id === "no_opid"));
  });

  it("throws on duplicate operationId naming both method+path", () => {
    const dupFixture = join(FIXTURE_DIR, "duplicate-opid.yaml");
    assert.throws(
      () => loadOpenApi(dupFixture),
      (err: Error) => {
        assert.ok(err.message.includes("dupId"), "names the duplicate id");
        assert.ok(err.message.includes("/dup") && err.message.includes("/dup2"), "names both paths");
        return true;
      },
    );
  });
});

describe("loadOpenApi — unsupported $ref", () => {
  const unsupportedFixture = join(FIXTURE_DIR, "unsupported-ref.yaml");

  it("throws loudly naming the ref path on an external/remote $ref", () => {
    assert.throws(
      () => loadOpenApi(unsupportedFixture),
      (err: Error) => {
        assert.ok(err.message.includes("https://example.com/other.yaml"), "names the ref path");
        return true;
      },
    );
  });
});
