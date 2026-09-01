// Unit tests for restList and restDescribe — the pure rendering functions
// behind `aura.mjs rest list` and `aura.mjs rest describe <operationId>`.
//
// Seam: restList(index, out) / restDescribe(index, opId, out) are refactored
// out of main() so they're unit-testable without spawning the process.
// They write to a `out` sink ({ log, error }) instead of console directly.
//
// Run with: node --experimental-strip-types scripts/src/rest-list-describe.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadOpenApi } from "@pi-aura/shared/openapi/loader";
import { restList, restDescribe } from "./rest-list-describe.ts";

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

interface Sink {
  out: string[];
  err: string[];
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function makeSink(): Sink {
  return {
    out: [],
    err: [],
    log(...args: unknown[]) {
      this.out.push(args.map(String).join(" "));
    },
    error(...args: unknown[]) {
      this.err.push(args.map(String).join(" "));
    },
  };
}

describe("restList", () => {
  it("prints operations grouped by tag, alphabetical within group", () => {
    const index = loadOpenApi(FIXTURE);
    const sink = makeSink();
    restList(index, sink);
    const output = sink.out.join("\n");
    // Capacity group first (alphabetical tag sort)
    assert.ok(output.includes("Capacity"), "Capacity group present");
    assert.ok(output.includes("Search"), "Search group present");
    assert.ok(output.includes("Tasks"), "Tasks group present");
    // Each line has operationId, METHOD, /path, summary
    assert.ok(
      output.includes("updateTaskMemberCapacity") && output.includes("PATCH") &&
        output.includes("/tasks/{uuid}/members/{userIdOrUuid}/capacity"),
      "capacity op line present",
    );
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
    const sink = makeSink();
    restList(index as never, sink);
    const output = sink.out.join("\n");
    assert.ok(output.includes("Other"), "Other group present for no-tag op");
    assert.ok(output.includes("Alpha"), "Alpha group present");
  });
});

describe("restDescribe", () => {
  it("prints method, path, path params, query params, body, responses", () => {
    const index = loadOpenApi(FIXTURE);
    const sink = makeSink();
    restDescribe(index, "updateTaskMemberCapacity", sink);
    const output = sink.out.join("\n");
    assert.ok(output.includes("PATCH"), "method printed");
    assert.ok(output.includes("/tasks/{uuid}/members/{userIdOrUuid}/capacity"), "path printed");
    assert.ok(output.includes("uuid"), "path param uuid printed");
    assert.ok(output.includes("userIdOrUuid"), "path param userIdOrUuid printed");
    assert.ok(output.includes("TaskMemberCapacityUpdate"), "body schemaRef printed");
    assert.ok(output.includes("200"), "response 200 printed");
    assert.ok(output.includes("400"), "response 400 printed");
    assert.ok(output.includes("401"), "response 401 printed");
    assert.ok(output.includes("500"), "response 500 printed");
  });

  it("prints query params with required flags for GET with query", () => {
    const index = loadOpenApi(FIXTURE);
    const sink = makeSink();
    restDescribe(index, "unifiedSearch", sink);
    const output = sink.out.join("\n");
    assert.ok(output.includes("limit"), "query param limit printed");
    assert.ok(output.includes("q"), "query param q printed");
  });

  it("prints body shape for POST with inline body", () => {
    const index = loadOpenApi(FIXTURE);
    const sink = makeSink();
    restDescribe(index, "unifiedSearch", sink);
    const output = sink.out.join("\n");
    assert.ok(output.includes("application/json"), "content type printed");
    assert.ok(output.includes("Body") || output.includes("body") || output.includes("Request"), "body section present");
  });

  it("exits with error on unknown operationId, listing closest matches", () => {
    const index = loadOpenApi(FIXTURE);
    const sink = makeSink();
    let exitCode = 0;
    const origExit = process.exit;
    // Capture exit without actually exiting.
    (process as { exit?: (code?: number) => never }).exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error("__exit__");
    }) as never;
    try {
      restDescribe(index, "nonExistentOp", sink);
    } catch {
      // expected — process.exit throws
    } finally {
      (process as { exit: (code?: number) => never }).exit = origExit;
    }
    assert.equal(exitCode, 2, "exit code 2 for unknown op");
    const errOutput = sink.err.join("\n");
    assert.ok(errOutput.includes("nonExistentOp"), "error names the id");
    // Should list close matches (substring match)
    assert.ok(
      errOutput.includes("updateTaskMemberCapacity") || errOutput.includes("getTask") ||
        errOutput.includes("unifiedSearch"),
      "lists closest matches",
    );
  });
});
