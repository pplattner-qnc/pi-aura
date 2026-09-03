// Structural tests for slice "drop-dead-shared-exports" — verifies the
// shared-core exports that existed only for the deleted CLI shim are gone.
//
// Seams tested:
//   1. No-dead-modules: progress-emitter.ts + write-dashboard-digest.ts + their
//      tests are deleted.
//   2. No-dead-exports: aura-digest.ts no longer exports renderAction,
//      saveAction, diffAction, cleanupAction, lastAction, USAGE, FailError,
//      DASHBOARD_DIGEST_PATH, or the fail() helper. fetchAction +
//      saveLastDigest REMAIN.
//   3. No-dead-subpaths: package.json exports no longer lists the removed
//      module subpaths.
//
// Run with: cd packages/shared && npx tsx --test test/digest/drop-dead-shared-exports.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const sharedRoot = path.resolve(import.meta.dirname, "../..");
const srcDigestDir = path.join(sharedRoot, "src", "digest");
const testDigestDir = path.join(sharedRoot, "test", "digest");
const pkgJson = JSON.parse(
  fs.readFileSync(path.join(sharedRoot, "package.json"), "utf-8"),
) as { exports: Record<string, string> };

function readSource(filename: string): string {
  return fs.readFileSync(path.join(srcDigestDir, filename), "utf-8");
}

describe("slice: drop-dead-shared-exports — no-dead-modules seam", () => {
  it("does not have progress-emitter.ts", () => {
    assert.equal(
      fs.existsSync(path.join(srcDigestDir, "progress-emitter.ts")),
      false,
      "progress-emitter.ts should be deleted",
    );
  });

  it("does not have write-dashboard-digest.ts", () => {
    assert.equal(
      fs.existsSync(path.join(srcDigestDir, "write-dashboard-digest.ts")),
      false,
      "write-dashboard-digest.ts should be deleted",
    );
  });

  it("does not have aura-digest-progress.test.ts", () => {
    assert.equal(
      fs.existsSync(path.join(testDigestDir, "aura-digest-progress.test.ts")),
      false,
      "aura-digest-progress.test.ts should be deleted",
    );
  });

  it("does not have write-dashboard-digest.test.ts", () => {
    assert.equal(
      fs.existsSync(path.join(testDigestDir, "write-dashboard-digest.test.ts")),
      false,
      "write-dashboard-digest.test.ts should be deleted",
    );
  });

  it("does not have joinUrl-export.test.ts", () => {
    assert.equal(
      fs.existsSync(path.join(testDigestDir, "joinUrl-export.test.ts")),
      false,
      "joinUrl-export.test.ts should be deleted (joinUrl went with progress-emitter)",
    );
  });
});

describe("slice: drop-dead-shared-exports — no-dead-exports seam", () => {
  // We check the source text for export declarations of the dead symbols.
  // This avoids importing the module (which would fail if we removed exports
  // the module no longer has — the import itself is the test).
  const source = readSource("aura-digest.ts");

  const deadSymbols = [
    "renderAction",
    "saveAction",
    "diffAction",
    "cleanupAction",
    "lastAction",
    "USAGE",
    "FailError",
    "DASHBOARD_DIGEST_PATH",
    "fail",
  ];

  for (const sym of deadSymbols) {
    it(`aura-digest.ts does not export ${sym}`, () => {
      // Match `export ... <sym>` — function, const, class, etc.
      const exportPattern = new RegExp(`\\bexport\\b[^;]*\\b${sym}\\b`);
      assert.equal(
        exportPattern.test(source),
        false,
        `${sym} should not be exported from aura-digest.ts`,
      );
    });
  }

  it("aura-digest.ts does not define a fail() helper", () => {
    // The fail() function is a non-exported helper that threw FailError.
    // With FailError gone, it should be removed too.
    const failPattern = /\bfunction\s+fail\s*\(/;
    assert.equal(
      failPattern.test(source),
      false,
      "fail() helper should be removed (it threw FailError, which is now gone)",
    );
  });

  it("aura-digest.ts still exports fetchAction", () => {
    assert.ok(
      /\bexport\s+(async\s+)?function\s+fetchAction\b/.test(source),
      "fetchAction must remain (in-process digest-fetch uses it)",
    );
  });

  it("aura-digest.ts still exports saveLastDigest", () => {
    assert.ok(
      /\bexport\s+function\s+saveLastDigest\b/.test(source),
      "saveLastDigest must remain (in-process digest-save uses it)",
    );
  });

  it("does not reference createProgressEmitter or readDashboardUrl", () => {
    assert.equal(
      /\bcreateProgressEmitter\b/.test(source),
      false,
      "createProgressEmitter should not be referenced (progress-emitter.ts deleted)",
    );
    assert.equal(
      /\breadDashboardUrl\b/.test(source),
      false,
      "readDashboardUrl should not be referenced (progress-emitter.ts deleted)",
    );
  });

  it("does not reference writeDashboardDigest", () => {
    assert.equal(
      /\bwriteDashboardDigest\b/.test(source),
      false,
      "writeDashboardDigest should not be referenced (write-dashboard-digest.ts deleted)",
    );
  });
});

describe("slice: drop-dead-shared-exports — no-dead-subpaths seam", () => {
  it("package.json does not export ./digest/progress-emitter", () => {
    assert.equal(
      "./digest/progress-emitter" in pkgJson.exports,
      false,
      "package.json should not export ./digest/progress-emitter",
    );
  });

  it("package.json does not export ./digest/write-dashboard-digest", () => {
    assert.equal(
      "./digest/write-dashboard-digest" in pkgJson.exports,
      false,
      "package.json should not export ./digest/write-dashboard-digest",
    );
  });

  it("package.json still exports ./digest/aura-digest", () => {
    assert.equal(
      "./digest/aura-digest" in pkgJson.exports,
      true,
      "package.json should still export ./digest/aura-digest (fetchAction + saveLastDigest)",
    );
  });
});
