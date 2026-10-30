// Structural tests for ticket "digest-skill-and-agents-removal": the
// aura-digest skill (doc + committed CLI bundle leftover) and the two
// morning agents are removed end to end. Absence assertions only (fs
// reads, no imports of deleted content), following the
// dashboard-extension-removal pattern in this directory.
//
// Seams (arch spec, remove-digest):
//   1. the manifest's registration shape (skills scan unchanged, no
//      subagents block)
//   2. the tracked tree (no digest skill directory, no agents directory)
//   (seam 3: typecheck, build, and a clean session load; these are
//   commands and a verify smoke, not assertions here)
//
// Run with: cd packages/shared && npx tsx --test test/digest/digest-skill-and-agents-removal.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// packages/shared/test/digest -> packages/shared/test -> packages/shared
const testDir = import.meta.dirname;
const sharedRoot = path.resolve(testDir, "../..");
const repoRoot = path.resolve(sharedRoot, "../..");

interface PiPackageJson {
  pi?: { skills?: string[]; subagents?: { agents?: string[] } };
}

function readPiBlock(): { skills?: string[]; subagents?: { agents?: string[] } } {
  const raw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8");
  const pkg = JSON.parse(raw) as PiPackageJson;
  return pkg.pi ?? {};
}

describe("ticket: digest-skill-and-agents-removal, skill-list seam", () => {
  it("leaves only the aura and engineering-foundation skills in the scan", () => {
    const skillsDir = path.join(repoRoot, "skills", "core");
    const entries = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(
      entries,
      ["aura", "engineering-foundation"],
      `skills/core should contain only the two surviving core skills, found: ${entries.join(", ")}`,
    );
  });

  it("keeps the package manifest's skills scan unchanged", () => {
    const pi = readPiBlock();
    assert.deepEqual(
      pi.skills,
      ["./skills"],
      "package.json should keep scanning ./skills for skills",
    );
  });
});

describe("ticket: digest-skill-and-agents-removal, agents seam", () => {
  it("has no agents directory in the tracked tree", () => {
    const agentsDir = path.join(repoRoot, "agents");
    assert.equal(
      fs.existsSync(agentsDir),
      false,
      "agents/ should be deleted with both morning agents",
    );
  });

  it("registers no subagents in the package manifest", () => {
    const pi = readPiBlock();
    assert.equal(
      pi.subagents,
      undefined,
      "package.json should carry no subagents block",
    );
  });
});
