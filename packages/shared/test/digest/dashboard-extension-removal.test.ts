// Structural tests for ticket "dashboard-extension-removal": the
// digest-dashboard extension is removed end to end. Absence assertions
// only (fs reads, no imports of the deleted package), following the
// drop-dead-shared-exports pattern in this directory.
//
// Seams (arch spec, remove-digest):
//   1. the package manifest's registered extension list
//   2. the tracked tree shape (no dashboard directory, no suite)
//   (seam 3: root runner green over the remaining trees; seam 4:
//   typecheck and build gates; both are commands, not assertions here)
//
// Run with: cd packages/shared && npx tsx --test test/digest/dashboard-extension-removal.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// packages/shared/test/digest -> packages/shared/test -> packages/shared
const testDir = import.meta.dirname;
const sharedRoot = path.resolve(testDir, "../..");
const repoRoot = path.resolve(sharedRoot, "../..");

interface PiPackageJson {
  pi?: { extensions?: string[] };
}

function readPiExtensions(): string[] {
  const raw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8");
  const pkg = JSON.parse(raw) as PiPackageJson;
  return pkg.pi?.extensions ?? [];
}

describe("ticket: dashboard-extension-removal — package manifest seam", () => {
  it("registers no digest-dashboard extension", () => {
    const extensions = readPiExtensions();
    const dashboardEntry = extensions.find((entry) =>
      entry.includes("digest-dashboard"),
    );
    assert.equal(
      dashboardEntry,
      undefined,
      `package.json should not register the digest-dashboard extension, found: ${dashboardEntry ?? "none"}`,
    );
  });
});
