/**
 * Unit tests for Digest.followup.currentlyWorkingOn default.
 *
 * Run with:
 *   node --experimental-strip-types scripts/src/followup-working-on.test.ts
 */

import assert from "node:assert/strict";
import type { Digest } from "@pi-aura/shared/digest/types";

const minimalDigest: Digest = {
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
  suggested_actions: [],
  corrections: [],
  dev_links: [],
  reviews_owed: [],
  warnings: [],
  actions: [],
  followup: { currentlyWorkingOn: null },
  meta: {
    generated_at: "2026-01-01T00:00:00.000Z",
    raw_path: "/tmp/raw.json",
    report_path: "/tmp/report.json",
  },
};

// ---------------------------------------------------------------------------
// Default: a freshly-built digest carries followup.currentlyWorkingOn = null
// ---------------------------------------------------------------------------
{
  assert.ok(minimalDigest.followup, "digest.followup is present");
  assert.equal(
    minimalDigest.followup.currentlyWorkingOn,
    null,
    "followup.currentlyWorkingOn defaults to null"
  );
}

console.log("followup default (currentlyWorkingOn: null): ok");
console.log("\nall followup tests passed");
