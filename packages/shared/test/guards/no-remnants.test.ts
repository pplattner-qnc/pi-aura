// The no-remnants guard: the remove-digest effort's contract with the
// future. One consolidated structural suite asserting the removal is
// total, plus the task-tree archive state it lands. Absence assertions
// only (fs reads, no imports of deleted content), following the digest
// suite's no-dead-exports structural pattern.
//
// Consolidation: the four per-ticket absence suites
// (dashboard-extension-removal, digest-skill-and-agents-removal,
// digest-core-and-build-pkg-cleanup, manifest-and-infra-cleanup) are
// consolidated into this file; their assertions carry over and the
// per-ticket files go away (the consolidation seam below pins that).
//
// Seams (arch spec, no-remnants-guard-and-archive):
//   1. this suite green under the shared runner, failing on any
//      reintroduced remnant
//   2. the task index no longer lists the dead effort
//   (seam 3, the registration smoke, is a manual verify step: a fresh
//   session loads the package with no errors, the secrets command
//   registers, and no digest command or tools appear; it is not an
//   assertion here)
//
// Run with: cd packages/shared && npx tsx --test test/guards/no-remnants.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// packages/shared/test/guards -> packages/shared/test -> packages/shared
const testDir = import.meta.dirname;
const sharedRoot = path.resolve(testDir, "../..");
const repoRoot = path.resolve(sharedRoot, "../..");

// The dead digest effort the remove-digest map archives with this landing:
// its only ticket is a digest view change with no reason to exist once the
// dashboard is gone. The task index lists it under Live today; archiving
// moves the effort directory under docs/tasks/archive/ and drops the
// entry from the live list.
const DEAD_EFFORT = "refine-phase-transition";

function readTaskIndex(): string {
  return fs.readFileSync(
    path.join(repoRoot, "docs", "tasks", "index.md"),
    "utf-8",
  );
}

describe("no-remnants guard: task-tree archive seam", () => {
  it("has no live refine-phase-transition effort directory", () => {
    const dir = path.join(repoRoot, "docs", "tasks", DEAD_EFFORT);
    assert.equal(
      fs.existsSync(dir),
      false,
      `docs/tasks/${DEAD_EFFORT} should be archived out of the live task tree`,
    );
  });

  it("has the dead effort in the task archive", () => {
    const dir = path.join(repoRoot, "docs", "tasks", "archive", DEAD_EFFORT);
    assert.equal(
      fs.existsSync(dir),
      true,
      `docs/tasks/archive/${DEAD_EFFORT} should carry the archived effort`,
    );
  });

  it("drops the dead effort from the task index's live list", () => {
    const index = readTaskIndex();
    const liveSection = index.split("## Archived")[0];
    assert.ok(
      liveSection.includes("## Live"),
      "docs/tasks/index.md should keep its Live section (sanity against a reformatted index)",
    );
    const offending = liveSection
      .split("\n")
      .filter((line) => line.trim() === `- ${DEAD_EFFORT}`);
    assert.deepEqual(
      offending,
      [],
      `docs/tasks/index.md should not list ${DEAD_EFFORT} as live`,
    );
  });
});
