// Structural tests for ticket "manifest-and-infra-cleanup": the package
// manifest and infra catch up to the post-removal shape. Absence assertions
// only (fs reads, no imports of the touched modules), following the
// digest-core-and-build-pkg-cleanup pattern. The no-remnants guard
// consolidates these assertions.
//
// Seams (arch spec, remove-digest):
//   1. the settings type's shape and the keyring secret-key union's shape
//   2. the root manifest's devDependency set
//   3. the root vitest absence and empty root test tree
//   4. the build manifest without its digest-era comment
//   (seam 5, a fresh install plus typecheck, build, and the remaining
//   suites, is a command gate, not an assertion here)
//
// Run with: cd packages/shared && npx tsx --test test/guards/manifest-and-infra-cleanup.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// packages/shared/test/guards -> packages/shared/test -> packages/shared
const testDir = import.meta.dirname;
const sharedRoot = path.resolve(testDir, "../..");
const repoRoot = path.resolve(sharedRoot, "../..");

describe("ticket: manifest-and-infra-cleanup, settings and keyring shape seam", () => {
  it("carries no digest namespace in the shared settings type", () => {
    const source = fs.readFileSync(
      path.join(sharedRoot, "src", "settings.ts"),
      "utf-8",
    );
    const offending = source
      .split("\n")
      .filter((line) => line.toLowerCase().includes("digest"));
    assert.deepEqual(
      offending,
      [],
      "the shared settings type should not mention the digest namespace (its consumers are gone)",
    );
  });

  it("carries no Atlassian members in the keyring secret-key union", () => {
    const source = fs.readFileSync(
      path.join(sharedRoot, "src", "keyring", "keyring.ts"),
      "utf-8",
    );
    const offending = source
      .split("\n")
      .filter((line) => line.toLowerCase().includes("atlassian"));
    assert.deepEqual(
      offending,
      [],
      "the keyring secret-key union should not carry Atlassian members (dead surface after the provisioning removal)",
    );
  });

  it("keeps the Aura PAT member in the keyring secret-key union", () => {
    const source = fs.readFileSync(
      path.join(sharedRoot, "src", "keyring", "keyring.ts"),
      "utf-8",
    );
    assert.ok(
      source.includes('{ service: "aura"; name: "pat" }'),
      "the secret-key union should keep the aura/pat member (guard against over-deletion)",
    );
  });

  it("carries no Atlassian entries in the keyring backends' known-key lists", () => {
    const backends = [
      "file-keyring.ts",
      "macos-keyring.ts",
      "secret-service-keyring.ts",
    ];
    for (const backend of backends) {
      const source = fs.readFileSync(
        path.join(sharedRoot, "src", "keyring", backend),
        "utf-8",
      );
      const offending = source
        .split("\n")
        .filter((line) => line.toLowerCase().includes("atlassian"));
      assert.deepEqual(
        offending,
        [],
        `${backend}'s known-key list should not carry Atlassian entries`,
      );
    }
  });
});

describe("ticket: manifest-and-infra-cleanup, root vitest and test-tree seam", () => {
  it("has no root vitest configuration", () => {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "vitest.config.ts")),
      false,
      "the root vitest config should be deleted with the last root test tree (the interim passWithNoTests flag goes with it)",
    );
  });

  it("has no root test tree", () => {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "test")),
      false,
      "the root test tree should be deleted (the per-package runner convention stands)",
    );
  });
});
