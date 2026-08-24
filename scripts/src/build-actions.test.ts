/**
 * Unit tests for buildActions() — the digest action routing table.
 *
 * Run with:
 *   node --experimental-strip-types scripts/src/build-actions.test.ts
 */

import assert from "node:assert/strict";
import { buildActions } from "./build-actions.ts";
import type { Digest } from "./types.ts";

function minimalDigest(overrides: Partial<Digest> = {}): Digest {
  const base: Digest = {
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
    meta: {
      generated_at: "2026-01-01T00:00:00.000Z",
      raw_path: "/tmp/raw.json",
      report_path: "/tmp/report.json",
    },
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Scenario (a): overdue + waiting + reviews → ranking order
// ---------------------------------------------------------------------------
{
  const digest = minimalDigest({
    attention: {
      overdue: [{ key: "AURA-1", title: "First overdue", days: 3 }],
      waiting_on_you: [{ key: "AURA-2", title: "Waiting task" }],
      waiting_on_others: [],
      notifications: { since_last_run: [], older_unread: [] },
    },
    reviews_owed: [
      {
        artifact_id: "art-1",
        title: "Review me",
        version: 2,
        deadline: null,
        initiator: null,
        review_started_at: null,
      },
    ],
  });

  const actions = buildActions(digest);
  assert.equal(actions.length, 3, "one action per source item");
  assert.equal(actions[0].section, "overdue");
  assert.equal(actions[0].action, "advance");
  assert.equal(actions[0].key, "AURA-1");
  assert.equal(actions[0].label, "Advance AURA-1 — First overdue (3d)");
  assert.equal(actions[0].instruction, "Advance AURA-1 — First overdue (it's 3 days overdue)");
  assert.equal(actions[0].aura_use_case, "task-management");

  assert.equal(actions[1].section, "waiting_on_you");
  assert.equal(actions[1].action, "unblock");
  assert.equal(actions[1].key, "AURA-2");
  assert.equal(actions[1].label, "Unblock AURA-2 — Waiting task");

  assert.equal(actions[2].section, "reviews_owed");
  assert.equal(actions[2].action, "review");
  assert.equal(actions[2].key, "art-1");
  assert.equal(actions[2].label, "Review Review me v2");
  assert.equal(actions[2].instruction, "Review artifact Review me (v2) — you owe it");
  assert.equal(actions[2].aura_use_case, "artifact-management");
}

console.log("ranking order (overdue → waiting → reviews): ok");

// ---------------------------------------------------------------------------
// Scenario (b): stale correction drops its reviews_owed action
// ---------------------------------------------------------------------------
{
  const digest = minimalDigest({
    reviews_owed: [
      {
        artifact_id: "stale-art",
        title: "Stale review",
        version: 3,
        deadline: null,
        initiator: null,
        review_started_at: null,
      },
      {
        artifact_id: "current-art",
        title: "Current review",
        version: 1,
        deadline: null,
        initiator: null,
        review_started_at: null,
      },
    ],
    corrections: [
      {
        artifact_id: "stale-art",
        title: "Stale review",
        reported_version: 1,
        reported_decision: "REJECTED",
        current_version: 3,
        current_decisions: [],
        stale: true,
        note: "already addressed",
      },
    ],
  });

  const actions = buildActions(digest);
  assert.equal(actions.length, 1, "stale review owed is dropped");
  assert.equal(actions[0].key, "current-art");
}

console.log("stale correction drops reviews_owed action: ok");

// ---------------------------------------------------------------------------
// Scenario (c): over-commitment → flag_capacity action
// ---------------------------------------------------------------------------
{
  const digest = minimalDigest({
    capacity: {
      base_pct: 100,
      committed_pct: 110,
      free_pct: -10,
      utilization_pct: 110,
      over: true,
      total_hours: 8.8,
    },
  });

  const actions = buildActions(digest);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].section, "capacity");
  assert.equal(actions[0].key, "capacity");
  assert.equal(actions[0].action, "flag_capacity");
  assert.equal(actions[0].label, "Flag over-commitment (110%)");
  assert.equal(actions[0].instruction, "Capacity is at 110% committed — adjust or flag to manager");
  assert.equal(actions[0].aura_use_case, "capacity-planning");
}

console.log("over-commitment flag_capacity: ok");

// ---------------------------------------------------------------------------
// Scenario (d): warnings → run_setup action
// ---------------------------------------------------------------------------
{
  const digest = minimalDigest({ warnings: ["keyring unavailable"] });
  const actions = buildActions(digest);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].section, "warnings");
  assert.equal(actions[0].key, "warnings");
  assert.equal(actions[0].action, "run_setup");
  assert.equal(actions[0].label, "Run setup / auth");
  assert.equal(actions[0].instruction, "Run the digest setup — keyring unavailable");
  assert.equal(actions[0].aura_use_case, "aura-digest");
}

console.log("warnings run_setup: ok");

// ---------------------------------------------------------------------------
// Scenario (e): empty digest → no actions
// ---------------------------------------------------------------------------
{
  const actions = buildActions(minimalDigest());
  assert.equal(actions.length, 0);
}

console.log("empty digest: ok");

// ---------------------------------------------------------------------------
// Scenario (f): >6 candidates truncated in rank order
// ---------------------------------------------------------------------------
{
  const digest = minimalDigest({
    attention: {
      overdue: [
        { key: "O-1", title: "Overdue 1" },
        { key: "O-2", title: "Overdue 2" },
        { key: "O-3", title: "Overdue 3" },
      ],
      waiting_on_you: [
        { key: "W-1", title: "Waiting 1" },
        { key: "W-2", title: "Waiting 2" },
        { key: "W-3", title: "Waiting 3" },
      ],
      waiting_on_others: [],
      notifications: { since_last_run: [], older_unread: [] },
    },
    reviews_owed: [
      { artifact_id: "R-1", title: "Review 1", version: 1, deadline: null, initiator: null, review_started_at: null },
      { artifact_id: "R-2", title: "Review 2", version: 1, deadline: null, initiator: null, review_started_at: null },
    ],
    capacity: {
      base_pct: 100,
      committed_pct: 110,
      free_pct: -10,
      utilization_pct: 110,
      over: true,
      total_hours: 8.8,
    },
    warnings: ["boom"],
    queue: [
      { rank: 1, key: "Q-1", title: "Queue 1", status: "In Review", role: "OWNER", capacity_pct: 50, hours: 4 },
    ],
  });

  const actions = buildActions(digest);
  assert.equal(actions.length, 6, "capped at 6 actions");
  assert.deepEqual(
    actions.map((a) => a.section),
    ["overdue", "overdue", "overdue", "waiting_on_you", "waiting_on_you", "waiting_on_you"],
    "keeps highest-priority items in rank order"
  );
}

console.log(">6 candidates truncated: ok");

// ---------------------------------------------------------------------------
// Scenario (g): queue fills remaining slots after higher-priority sections
// ---------------------------------------------------------------------------
{
  const digest = minimalDigest({
    attention: {
      overdue: [{ key: "O-1", title: "Overdue 1" }],
      waiting_on_you: [],
      waiting_on_others: [],
      notifications: { since_last_run: [], older_unread: [] },
    },
    capacity: {
      base_pct: 100,
      committed_pct: 110,
      free_pct: -10,
      utilization_pct: 110,
      over: true,
      total_hours: 8.8,
    },
    warnings: ["auth"],
    queue: [
      { rank: 1, key: "Q-1", title: "Queue 1", status: "In Review", role: "OWNER", capacity_pct: 50, hours: 4 },
      { rank: 2, key: "Q-2", title: "Queue 2", status: "Open", role: "OWNER", capacity_pct: 30, hours: 2.4 },
      { rank: 3, key: "Q-3", title: "Queue 3", status: "In Alignment", role: "OWNER", capacity_pct: 20, hours: 1.6 },
      { rank: 4, key: "Q-4", title: "Queue 4", status: "In Review", role: "OWNER", capacity_pct: 10, hours: 0.8 },
    ],
  });

  const actions = buildActions(digest);
  assert.equal(actions.length, 6, "overdue + capacity + warning + 3 queue rows = 6");
  assert.deepEqual(
    actions.map((a) => a.section),
    ["overdue", "capacity", "warnings", "queue", "queue", "queue"]
  );
  assert.equal(actions[5].key, "Q-3");
}

console.log("queue fills remaining slots: ok");

// ---------------------------------------------------------------------------
// Failure mode: missing optional fields must not throw
// ---------------------------------------------------------------------------
{
  const digest = minimalDigest({
    attention: {
      overdue: [],
      waiting_on_you: [],
      waiting_on_others: [],
      notifications: { since_last_run: [], older_unread: [] },
    },
    reviews_owed: [],
    queue: [],
    warnings: [],
    // capacity intentionally missing optional fields not used here.
  });

  const actions = buildActions(digest);
  assert.equal(actions.length, 0);
}

console.log("missing optional fields handled: ok");

console.log("\nall buildActions tests passed");
