/**
 * Unit tests for writeDashboardDigest() — the ~/.pi/aura/digest.json writer.
 *
 * Run with:
 *   cd packages/shared && npx tsx --test test/digest/write-dashboard-digest.test.ts
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDashboardDigest } from "../../src/digest/write-dashboard-digest.js";
import type { Digest } from "../../src/digest/types.js";

function makeDigest(actionsLength = 2): Digest {
  return {
    date: "2026-01-01",
    summary: null,
    attention: {
      overdue: [],
      waiting_on_you: [],
      waiting_on_others: [],
      notifications: { since_last_run: [], older_unread: [] },
    },
    queue: [],
    capacity: {
      base_pct: 100,
      committed_pct: 80,
      free_pct: 20,
      utilization_pct: 80,
      over: false,
      total_hours: 6.4,
    },
    reviews: [],
    suggested_actions: ["Advance AURA-1", "Unblock AURA-2"],
    corrections: [],
    dev_links: [],
    reviews_owed: [],
    warnings: [],
    actions: [
      {
        section: "overdue",
        key: "AURA-1",
        action: "advance",
        label: "Advance AURA-1",
        instruction: "Advance AURA-1",
        aura_use_case: "task-management",
      },
      {
        section: "waiting_on_you",
        key: "AURA-2",
        action: "unblock",
        label: "Unblock AURA-2",
        instruction: "Unblock AURA-2",
        aura_use_case: "task-management",
      },
    ].slice(0, actionsLength),
    followup: { currentlyWorkingOn: null },
    meta: {
      generated_at: "2026-01-01T00:00:00.000Z",
      raw_path: "/tmp/raw.json",
      report_path: "/tmp/report.json",
    },
  };
}

let baseDir: string | undefined;

try {
  baseDir = mkdtempSync(join(tmpdir(), "dashboard-digest-test-"));

  // ---------------------------------------------------------------------------
  // Scenario (a): writes digest to a nested temp path, creating dirs
  // ---------------------------------------------------------------------------
  {
    const dashboardPath = join(baseDir, "nested", "dashboard", "digest.json");
    const digest = makeDigest();
    writeDashboardDigest(digest, dashboardPath);

    const parsed = JSON.parse(readFileSync(dashboardPath, "utf8")) as Digest;
    assert.equal(parsed.date, digest.date);
    assert.deepEqual(parsed.actions, digest.actions);
    assert.deepEqual(parsed.followup, digest.followup);
    assert.equal(parsed.suggested_actions.length, 2);
  }

  console.log("writes digest to nested path, creating dirs: ok");

  // ---------------------------------------------------------------------------
  // Scenario (b): re-running overwrites (does not append)
  // ---------------------------------------------------------------------------
  {
    const dashboardPath = join(baseDir, "overwrite", "digest.json");
    const first = makeDigest(1);
    const second = makeDigest(2);
    writeDashboardDigest(first, dashboardPath);
    writeDashboardDigest(second, dashboardPath);

    const parsed = JSON.parse(readFileSync(dashboardPath, "utf8")) as Digest;
    assert.equal(parsed.actions.length, 2, "second write overwrites first");
    assert.equal(parsed.actions[1]!.key, "AURA-2");
  }

  console.log("re-running overwrites (no append): ok");

  // ---------------------------------------------------------------------------
  // Failure mode: write permission error surfaces as a thrown error
  // ---------------------------------------------------------------------------
  {
    const roDir = join(baseDir, "readonly");
    mkdirSync(roDir, { recursive: true });
    chmodSync(roDir, 0o555);
    const blockedPath = join(roDir, "digest.json");

    let threw = false;
    try {
      writeDashboardDigest(makeDigest(), blockedPath);
    } catch {
      threw = true;
    } finally {
      chmodSync(roDir, 0o755);
    }
    assert.ok(threw, "expected write to throw on permission error");
  }

  console.log("write permission error throws: ok");

  console.log("\nall writeDashboardDigest tests passed");
} finally {
  if (baseDir) rmSync(baseDir, { recursive: true, force: true });
}
