/**
 * Logic tests for the engineering-sync utility's pure helpers.
 *
 * Run with:
 *   node --experimental-strip-types scripts/src/engineering-sync.test.ts
 *
 * Covers the suffix-naming fix (extension preserved for .mdc), the
 * `.IGNORE` tombstone consumption (manifest-driven ignore flow), and the
 * gate classification (hasSuffix). The network-dependent fetch/finish
 * shells are exercised by the seeding run.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suffixed, consumeIgnoreTombstones, hasSuffix } from "./engineering-sync.ts";
import type { MirroredItem } from "./engineering-sync.ts";

// ---------------------------------------------------------------------------
// suffixed: extension preserved
// ---------------------------------------------------------------------------

{
  // .md file: c.md -> c.OLD_REMOTE.md (suffix marker + original ext)
  assert.equal(
    suffixed("/x/a/b/c.md", ".OLD_REMOTE"),
    join("/x/a/b/c.OLD_REMOTE.md"),
    "c.md -> c.OLD_REMOTE.md",
  );
  assert.equal(
    suffixed("/x/a/b/c.md", ".NEW_REMOTE"),
    join("/x/a/b/c.NEW_REMOTE.md"),
  );
  assert.equal(
    suffixed("/x/a/b/c.md", ".CURRENT"),
    join("/x/a/b/c.CURRENT.md"),
  );

  // .mdc file: tracker-aura.mdc -> tracker-aura.NEW_REMOTE.mdc (.mdc preserved)
  assert.equal(
    suffixed("/x/rules/tracker-aura.mdc", ".NEW_REMOTE"),
    join("/x/rules/tracker-aura.NEW_REMOTE.mdc"),
    ".mdc extension is preserved (suffix inserted before the extension)",
  );
  assert.equal(
    suffixed("/x/rules/tracker-aura.mdc", ".OLD_REMOTE"),
    join("/x/rules/tracker-aura.OLD_REMOTE.mdc"),
  );
  assert.equal(
    suffixed("/x/rules/tracker-aura.mdc", ".CURRENT"),
    join("/x/rules/tracker-aura.CURRENT.mdc"),
  );

  // SKILL.md (multi-segment but single .md ext)
  assert.equal(
    suffixed("/x/skills/ai-setup/SKILL.md", ".NEW_REMOTE"),
    join("/x/skills/ai-setup/SKILL.NEW_REMOTE.md"),
  );
}

console.log("suffixed (extension preserved): ok");

// ---------------------------------------------------------------------------
// hasSuffix: classifies three-way + ignore tombstones
// ---------------------------------------------------------------------------

{
  assert.equal(hasSuffix("/x/c.OLD_REMOTE.md"), "OLD_REMOTE");
  assert.equal(hasSuffix("/x/c.NEW_REMOTE.md"), "NEW_REMOTE");
  assert.equal(hasSuffix("/x/c.CURRENT.md"), "CURRENT");
  assert.equal(hasSuffix("/x/rules/tracker-aura.NEW_REMOTE.mdc"), "NEW_REMOTE");
  assert.equal(hasSuffix("/x/rules/tracker-aura.OLD_REMOTE.mdc"), "OLD_REMOTE");
  assert.equal(hasSuffix("/x/rules/tracker-aura.IGNORE"), "IGNORE");
  // A plain file is not a three-way/ignore file.
  assert.equal(hasSuffix("/x/c.md"), null);
  assert.equal(hasSuffix("/x/rules/general-code-quality.mdc"), null);
}

console.log("hasSuffix: ok");

// ---------------------------------------------------------------------------
// consumeIgnoreTombstones: manifest-driven ignore flow
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "eng-sync-test-"));
  try {
    // Stage a NEW_REMOTE for tracker-aura + an .IGNORE tombstone next to it,
    // plus a NEW_REMOTE for a normal rule (general-code-quality) with NO tombstone.
    const rulesDir = join(dir, "rules");
    mkdirSync(rulesDir, { recursive: true });

    // tracker-aura: staged + tombstoned (the agent chose to ignore it)
    const newRemoteAura = suffixed(join(rulesDir, "tracker-aura.mdc"), ".NEW_REMOTE");
    writeFileSync(newRemoteAura, "# tracker-aura (would-be content)\n", "utf8");
    const tombstoneAura = join(rulesDir, "tracker-aura.IGNORE");
    writeFileSync(tombstoneAura, "this repo talks to Aura via the aura skill / REST client", "utf8");

    // general-code-quality: staged, no tombstone (will be reconciled normally)
    const newRemoteQuality = suffixed(join(rulesDir, "general-code-quality.mdc"), ".NEW_REMOTE");
    writeFileSync(newRemoteQuality, "# code quality\n", "utf8");

    // Report items the fetch would have produced (localPath repo-relative).
    const items: Array<MirroredItem & { remoteSha256?: string; auraChecksumOrVersion?: string; auraUpdatedAt?: string }> = [
      {
        key: "<tracker-aura-uuid>",
        source: "wiki-doc",
        localPath: "skills/engineering-workflow/resources/rules/tracker-aura.mdc",
        remoteSha256: "sha256:aura",
        auraChecksumOrVersion: "1",
        auraUpdatedAt: "2026-01-01T00:00:00.000Z",
        kind: "DOCUMENT",
        slug: "tracker-aura",
      },
      {
        key: "<general-code-quality-uuid>",
        source: "wiki-doc",
        localPath: "skills/engineering-workflow/resources/rules/general-code-quality.mdc",
        remoteSha256: "sha256:quality",
        auraChecksumOrVersion: "1",
        auraUpdatedAt: "2026-01-01T00:00:00.000Z",
        kind: "DOCUMENT",
        slug: "general-code-quality",
      },
    ];

    const consumed = consumeIgnoreTombstones([tombstoneAura], items, dir);
    assert.equal(consumed.length, 1, "only the tombstoned item is consumed");
    assert.equal(consumed[0].item.key, "<tracker-aura-uuid>", "matched by stem");
    assert.equal(
      consumed[0].reason,
      "this repo talks to Aura via the aura skill / REST client",
      "tombstone content is the ignore reason",
    );

    // No tombstone for general-code-quality -> not consumed.
    const consumedEmpty = consumeIgnoreTombstones([], items, dir);
    assert.equal(consumedEmpty.length, 0);

    // Tombstone with no matching staged item -> skipped (caller warns).
    const orphanTombstone = join(rulesDir, "orphan-rule.IGNORE");
    writeFileSync(orphanTombstone, "no matching item", "utf8");
    const consumedOrphan = consumeIgnoreTombstones([orphanTombstone], items, dir);
    assert.equal(consumedOrphan.length, 0, "orphan tombstone is skipped");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("consumeIgnoreTombstones (manifest-driven ignore): ok");

// ---------------------------------------------------------------------------
// Edge: tombstone reason defaults when empty
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "eng-sync-test-empty-"));
  try {
    const rulesDir = join(dir, "rules");
    mkdirSync(rulesDir, { recursive: true });
    const tombstone = join(rulesDir, "some-rule.IGNORE");
    writeFileSync(tombstone, "   \n  \n", "utf8"); // whitespace-only
    const items: Array<MirroredItem & { remoteSha256?: string }> = [
      {
        key: "some-rule-uuid",
        source: "wiki-doc",
        localPath: "skills/engineering-workflow/resources/rules/some-rule.mdc",
      },
    ];
    const consumed = consumeIgnoreTombstones([tombstone], items, dir);
    assert.equal(consumed.length, 1);
    assert.equal(consumed[0].reason, "ignored during reconciliation", "empty reason falls back to default");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("tombstone empty-reason default: ok");

// ---------------------------------------------------------------------------
// Edge: .mdc stem matching doesn't collide with .md
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "eng-sync-test-collision-"));
  try {
    const rulesDir = join(dir, "rules");
    mkdirSync(rulesDir, { recursive: true });
    // A tombstone for "tracker" must NOT match an item named "tracker.md"
    // when the item is "tracker.mdc" — stems are exact (filename minus ext).
    const tombstone = join(rulesDir, "tracker.IGNORE");
    writeFileSync(tombstone, "reason", "utf8");
    const items: Array<MirroredItem & { remoteSha256?: string }> = [
      {
        key: "tracker-md-uuid",
        source: "wiki-doc",
        localPath: "skills/engineering-workflow/resources/rules/tracker.md", // .md, not .mdc
      },
      {
        key: "tracker-aura-uuid",
        source: "wiki-doc",
        localPath: "skills/engineering-workflow/resources/rules/tracker-aura.mdc", // different stem
      },
    ];
    const consumed = consumeIgnoreTombstones([tombstone], items, dir);
    // "tracker" stem matches "tracker.md" (stem "tracker"), NOT "tracker-aura.mdc".
    assert.equal(consumed.length, 1);
    assert.equal(consumed[0].item.key, "tracker-md-uuid");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("stem matching (no .mdc/.md collision): ok");

console.log("\nall engineering-sync tests passed");
