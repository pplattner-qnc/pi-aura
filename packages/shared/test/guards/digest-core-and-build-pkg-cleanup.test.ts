// Structural tests for ticket "digest-core-and-build-pkg-cleanup": the shared
// digest data core and the scripts-side digest leftovers are removed end to
// end. Absence assertions only (fs reads, no imports of the deleted modules),
// following the dashboard-extension-removal pattern.
//
// Seams (arch spec, remove-digest):
//   1. the shared manifest's exports map
//   3. the scripts manifest shape (name, description, dependency set)
//   4. the tracked tree (no digest source or test modules in the shared
//      package or the scripts workspace, no e2e families, the two earlier
//      per-ticket absence suites relocated to test/guards/)
//   (seams 2 and 5: the shared runner and the typecheck + build gates are
//   commands, not assertions here)
//
// Run with: cd packages/shared && npx tsx --test test/guards/digest-core-and-build-pkg-cleanup.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// packages/shared/test/guards -> packages/shared/test -> packages/shared
const testDir = import.meta.dirname;
const sharedRoot = path.resolve(testDir, "../..");
const repoRoot = path.resolve(sharedRoot, "../..");

interface ScriptsPackageJson {
  name?: string;
  description?: string;
  dependencies?: Record<string, string>;
}

function readScriptsPackageJson(): ScriptsPackageJson {
  const raw = fs.readFileSync(
    path.join(repoRoot, "scripts", "package.json"),
    "utf-8",
  );
  return JSON.parse(raw) as ScriptsPackageJson;
}

interface SharedPackageJson {
  exports?: Record<string, string>;
}

function readSharedExports(): Record<string, string> {
  const raw = fs.readFileSync(
    path.join(sharedRoot, "package.json"),
    "utf-8",
  );
  const pkg = JSON.parse(raw) as SharedPackageJson;
  return pkg.exports ?? {};
}

describe("ticket: digest-core-and-build-pkg-cleanup, scripts manifest seam", () => {
  it("carries no digest-era package name", () => {
    const pkg = readScriptsPackageJson();
    assert.ok(
      pkg.name !== undefined && !pkg.name.includes("digest"),
      `scripts package name should not mention digest, found: ${pkg.name ?? "none"}`,
    );
  });

  it("carries no digest-era description", () => {
    const pkg = readScriptsPackageJson();
    assert.ok(
      pkg.description !== undefined &&
        !pkg.description.toLowerCase().includes("digest"),
      `scripts package description should not mention digest, found: ${pkg.description ?? "none"}`,
    );
  });

  it("carries no MCP SDK dependency", () => {
    const pkg = readScriptsPackageJson();
    const deps = Object.keys(pkg.dependencies ?? {});
    const offenders = deps.filter((dep) => dep.includes("modelcontextprotocol"));
    assert.deepEqual(
      offenders,
      [],
      `scripts dependencies should not include the MCP SDK, found: ${offenders.join(", ")}`,
    );
  });
});

describe("ticket: digest-core-and-build-pkg-cleanup, root e2e seam", () => {
  it("has no atlassian-keyring-auth e2e family", () => {
    const dir = path.join(repoRoot, "test", "atlassian-keyring-auth");
    assert.equal(
      fs.existsSync(dir),
      false,
      "test/atlassian-keyring-auth should be deleted with the digest clients it tests",
    );
  });

  it("has no bitbucket-token-infra e2e family", () => {
    const dir = path.join(repoRoot, "test", "bitbucket-token-infra");
    assert.equal(
      fs.existsSync(dir),
      false,
      "test/bitbucket-token-infra should be deleted with the digest clients it tests",
    );
  });

  it("has no wire-bitbucket-reader e2e family", () => {
    const dir = path.join(repoRoot, "test", "wire-bitbucket-reader");
    assert.equal(
      fs.existsSync(dir),
      false,
      "test/wire-bitbucket-reader should be deleted with the digest clients it tests",
    );
  });
});

describe("ticket: digest-core-and-build-pkg-cleanup, shared exports-map seam", () => {
  it("carries no digest subpath exports", () => {
    const exports = readSharedExports();
    const offenders = Object.keys(exports).filter((key) =>
      key.includes("digest"),
    );
    assert.deepEqual(
      offenders,
      [],
      `package.json should export no digest subpaths, found: ${offenders.join(", ")}`,
    );
  });

  it("keeps the surviving subpath exports", () => {
    const exports = readSharedExports();
    for (const key of [".", "./keyring", "./aura-client", "./*"]) {
      assert.ok(
        key in exports,
        `package.json should keep the ${key} export (guard against over-deletion)`,
      );
    }
  });
});

describe("ticket: digest-core-and-build-pkg-cleanup, shared tree seam", () => {
  it("has no src/digest directory", () => {
    const dir = path.join(sharedRoot, "src", "digest");
    assert.equal(
      fs.existsSync(dir),
      false,
      "packages/shared/src/digest should be deleted (fetch core, action builder, devlinks, clients, bitbucket, mcp-client, scheduler, types, settings loader)",
    );
  });

  it("has no test/digest directory", () => {
    const dir = path.join(sharedRoot, "test", "digest");
    assert.equal(
      fs.existsSync(dir),
      false,
      "packages/shared/test/digest should be emptied: the digest unit tests deleted, the two per-ticket absence suites relocated (never deleted)",
    );
  });
});

describe("ticket: digest-core-and-build-pkg-cleanup, absence-suite relocation seam", () => {
  it("relocates the dashboard-extension-removal absence suite to test/guards", () => {
    const file = path.join(
      sharedRoot,
      "test",
      "guards",
      "dashboard-extension-removal.test.ts",
    );
    assert.equal(
      fs.existsSync(file),
      true,
      "test/guards/dashboard-extension-removal.test.ts must exist (relocated, never deleted)",
    );
  });

  it("relocates the digest-skill-and-agents-removal absence suite to test/guards", () => {
    const file = path.join(
      sharedRoot,
      "test",
      "guards",
      "digest-skill-and-agents-removal.test.ts",
    );
    assert.equal(
      fs.existsSync(file),
      true,
      "test/guards/digest-skill-and-agents-removal.test.ts must exist (relocated, never deleted)",
    );
  });
});

describe("ticket: digest-core-and-build-pkg-cleanup, scripts tree seam", () => {
  it("has no legacy morning-fetch script", () => {
    const file = path.join(repoRoot, "scripts", "morning-fetch.js");
    assert.equal(
      fs.existsSync(file),
      false,
      "scripts/morning-fetch.js should be deleted",
    );
  });

  it("has no followup unit test", () => {
    const file = path.join(
      repoRoot,
      "scripts",
      "src",
      "followup-working-on.test.ts",
    );
    assert.equal(
      fs.existsSync(file),
      false,
      "scripts/src/followup-working-on.test.ts should be deleted",
    );
  });
});
