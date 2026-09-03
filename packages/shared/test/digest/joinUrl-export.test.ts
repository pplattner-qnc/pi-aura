// Unit test for the joinUrl export — verifies that joinUrl is exported from
// the shared progress-emitter module so the extension can import it as a
// single source of truth (slice 3 of core-move: remove the local duplicate).
//
// Run with: npx tsx --test test/digest/joinUrl-export.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { joinUrl } from "../../src/digest/progress-emitter.js";

describe("joinUrl (shared export)", () => {
  it("is exported from progress-emitter", () => {
    assert.equal(typeof joinUrl, "function");
  });

  it("joins a base URL without trailing slash and a path with leading slash", () => {
    assert.equal(joinUrl("http://127.0.0.1:9999", "/api/state"), "http://127.0.0.1:9999/api/state");
  });

  it("strips the trailing slash from the base", () => {
    assert.equal(joinUrl("http://127.0.0.1:9999/", "/api/state"), "http://127.0.0.1:9999/api/state");
  });

  it("adds a leading slash to the path if missing", () => {
    assert.equal(joinUrl("http://127.0.0.1:9999", "api/state"), "http://127.0.0.1:9999/api/state");
  });
});
