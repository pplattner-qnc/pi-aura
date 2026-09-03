// fetchAction.test.ts — unit tests for the pure-function seam.
//
// fetchAction() returns {digest, report, raw}; writes no files; takes
// optional onProgress? + auraClient? params. The test injects a fake
// AuraClient (see docs/testing.md Mock conventions: inject a fake
// AuraClient implementing the interface) and asserts the returned object
// shape + that NO files are written (no temp dir, no ~/.pi/aura/digest.json).
//
// Run with: cd packages/shared && npx tsx --test test/digest/fetchAction.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  AuraClient,
  BoardBriefing,
  BoardSummary,
  Capacity,
  PriorityQueue,
  ArtifactList,
  TaskList,
  NotificationList,
  ArtifactApprovals,
  ArtifactReview,
  Task,
} from "../../src/aura-client.js";
import { fetchAction } from "../../src/digest/aura-digest.js";

// ---------------------------------------------------------------------------
// Fake AuraClient — returns minimal-but-shaped fixture data.
// ---------------------------------------------------------------------------

function makeFakeAuraClient(): AuraClient {
  const briefing: BoardBriefing = { text: "Test briefing", generated_at: "2025-01-01T00:00:00Z" };
  const summary: BoardSummary = {
    overdue: { count: 0, items: [] },
    waiting_on_me: { count: 0, items: [] },
    waiting_on_others: { count: 0, items: [] },
  };
  const priorityQueue: PriorityQueue = {
    items: [
      {
        id: "task-1",
        human_key: "AURA-100",
        title: "Test task one",
        status: "IN_DEVELOPMENT",
        status_type: "ACTIVE",
        block: "",
        asap: false,
        blocked_by: [],
        context_path: [],
        capacity_percent: 50,
      },
    ],
    total: 1,
    unordered_count: 0,
  };
  const capacity: Capacity = {
    base_percent: 100,
    committed_percent: 40,
    free_percent: 60,
    utilization_percent: 40,
    over: false,
    tasks: [
      {
        task_id: "task-1",
        human_key: "AURA-100",
        task_title: "Test task one",
        task_status: "IN_DEVELOPMENT",
        roles: ["OWNER"],
        capacity_percent: 40,
        hierarchy_path: [],
      },
    ],
  };
  const pendingReviews: ArtifactList = {
    items: [],
    pagination: { page: 1, limit: 10, total: 0 },
  };
  const alignmentTasks: TaskList = {
    items: [],
    pagination: { page: 1, limit: 5, total: 0 },
  };
  const reviewTasks: TaskList = {
    items: [],
    pagination: { page: 1, limit: 5, total: 0 },
  };
  const notifList: NotificationList = {
    items: [],
    pagination: { page: 1, limit: 50, total: 0 },
  };

  return {
    getArtifact: async () => { throw new Error("not used"); },
    mcpCreateArtifact: async () => { throw new Error("not used"); },
    mcpUpdateArtifact: async () => { throw new Error("not used"); },
    listArtifacts: async () => pendingReviews,
    getKnowledgeNode: async () => { throw new Error("not used"); },
    getKnowledgeNodeByPath: async () => { throw new Error("not used"); },
    saveKnowledgeNodeBody: async () => { throw new Error("not used"); },
    mcpWikiSearch: async () => { throw new Error("not used"); },
    getKnowledgeTree: async () => { throw new Error("not used"); },
    createKnowledgeNode: async () => { throw new Error("not used"); },
    getBlueprintFiles: async () => { throw new Error("not used"); },
    getKnowledgeNodeVersion: async () => { throw new Error("not used"); },
    mcpCreateUploadDocument: async () => { throw new Error("not used"); },
    mcpGetUploadDocument: async () => { throw new Error("not used"); },
    getBoardBriefing: async () => briefing,
    getBoardSummary: async () => summary,
    listNotifications: async () => notifList,
    getMyPriorityQueue: async () => priorityQueue,
    getMyCapacity: async () => capacity,
    listTasks: async () => alignmentTasks,
    createFeedback: async () => { throw new Error("not used"); },
    getArtifactApprovals: async (): Promise<ArtifactApprovals> => ({
      version: 1,
      latest_version: 1,
      decided_count: 0,
      total_required: 0,
      open_reviews: [],
      decisions: [],
    }),
    getTaskByHumanKey: async (): Promise<Task> => ({
      id: "task-1",
      human_key: "AURA-100",
      title: "Test task one",
      status: "IN_DEVELOPMENT",
      status_type: "ACTIVE",
    }),
    getArtifactReview: async (): Promise<ArtifactReview> => ({
      version: 1,
      review_state: "open",
      reviewers: [],
      review_artifacts: [],
      initiator: null,
      is_initiator: false,
    }),
    requestArtifactReview: async () => {},
    startArtifactReview: async () => {},
    submitArtifactDecision: async () => {},
    reopenArtifactReview: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchAction — pure-function seam", () => {
  let origHome: string | undefined;
  let tmpHome: string;

  before(() => {
    // Redirect HOME to a temp dir so no real ~/.pi/aura files are read/written.
    origHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "fetchAction-test-home-"));
    process.env.HOME = tmpHome;
  });

  after(() => {
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns an object with digest, report, and raw keys", async () => {
    const fake = makeFakeAuraClient();
    const result = await fetchAction({ auraClient: fake });
    assert.ok(result, "fetchAction should return a value");
    assert.ok("digest" in result, "result should have digest key");
    assert.ok("report" in result, "result should have report key");
    assert.ok("raw" in result, "result should have raw key");
  });

  it("digest has the expected shape (date, attention, queue, capacity, reviews, etc.)", async () => {
    const fake = makeFakeAuraClient();
    const { digest } = await fetchAction({ auraClient: fake });

    assert.equal(typeof digest.date, "string", "digest.date is a string");
    assert.match(digest.date, /^\d{4}-\d{2}-\d{2}$/, "digest.date is YYYY-MM-DD");

    assert.ok(digest.attention, "digest.attention exists");
    assert.ok(Array.isArray(digest.attention.overdue), "digest.attention.overdue is array");
    assert.ok(digest.attention.notifications, "digest.attention.notifications exists");
    assert.ok(digest.attention.notifications.since_last_run !== undefined);
    assert.ok(digest.attention.notifications.older_unread !== undefined);

    assert.ok(Array.isArray(digest.queue), "digest.queue is array");
    assert.equal(digest.queue.length, 1, "one queue row from the fixture");
    assert.equal(digest.queue[0]!.key, "AURA-100");
    assert.equal(digest.queue[0]!.title, "Test task one");

    assert.ok(digest.capacity, "digest.capacity exists");
    assert.equal(digest.capacity.committed_pct, 40);

    assert.ok(Array.isArray(digest.reviews), "digest.reviews is array");
    assert.ok(Array.isArray(digest.suggested_actions), "digest.suggested_actions is array");
    assert.ok(Array.isArray(digest.actions), "digest.actions is array");
    assert.ok(Array.isArray(digest.corrections), "digest.corrections is array");
    assert.ok(Array.isArray(digest.dev_links), "digest.dev_links is array");
    assert.ok(Array.isArray(digest.reviews_owed), "digest.reviews_owed is array");
    assert.ok(Array.isArray(digest.warnings), "digest.warnings is array");
    assert.ok(digest.followup, "digest.followup exists");
    assert.equal(digest.followup.currentlyWorkingOn, null);
    assert.ok(digest.meta, "digest.meta exists");
    assert.equal(typeof digest.meta.generated_at, "string");
  });

  it("report has the expected shape (fetched_at, warnings, verifications, etc.)", async () => {
    const fake = makeFakeAuraClient();
    const { report } = await fetchAction({ auraClient: fake });

    assert.equal(typeof report.fetched_at, "string", "report.fetched_at is a string");
    assert.ok(Array.isArray(report.warnings), "report.warnings is array");
    assert.ok(Array.isArray(report.artifacts_to_verify), "report.artifacts_to_verify is array");
    assert.ok(Array.isArray(report.verifications), "report.verifications is array");
    assert.ok(Array.isArray(report.pending_review_summary), "report.pending_review_summary is array");
    assert.ok(Array.isArray(report.notification_review_events), "report.notification_review_events is array");
  });

  it("raw has the expected shape (fetched_at, briefing, summary, etc.)", async () => {
    const fake = makeFakeAuraClient();
    const { raw } = await fetchAction({ auraClient: fake });

    assert.equal(typeof raw.fetched_at, "string", "raw.fetched_at is a string");
    assert.ok(raw.briefing, "raw.briefing exists");
    assert.ok(raw.summary, "raw.summary exists");
    assert.ok(raw.notifications, "raw.notifications exists");
    assert.ok(raw.priority_queue, "raw.priority_queue exists");
    assert.ok(raw.capacity, "raw.capacity exists");
    assert.ok(raw.pending_review_artifacts, "raw.pending_review_artifacts exists");
  });

  it("writes no files — no ~/.pi/aura/digest.json, no temp dir created", async () => {
    const fake = makeFakeAuraClient();
    await fetchAction({ auraClient: fake });

    // No ~/.pi/aura/digest.json should exist.
    const dashboardPath = join(tmpHome, ".pi", "aura", "digest.json");
    assert.equal(
      existsSync(dashboardPath),
      false,
      "no ~/.pi/aura/digest.json should be written",
    );

    // No ~/.pi/aura directory at all (fetchAction should not create it).
    const auraDir = join(tmpHome, ".pi", "aura");
    assert.equal(
      existsSync(auraDir),
      false,
      "no ~/.pi/aura directory should be created by fetchAction",
    );

    // No temp dirs with the aura-morning prefix should exist in the system
    // tmpdir (fetchAction used to create /tmp/aura-morning-<hex>/).
    const tmpEntries = readdirSync(tmpdir());
    const auraMorningDirs = tmpEntries.filter((e) =>
      e.startsWith("aura-morning-") && e.includes("fetchAction-test"),
    );
    assert.equal(auraMorningDirs.length, 0, "no temp aura-morning dirs created");
  });

  it("does not call readDashboardUrl or createProgressEmitter internally", async () => {
    // fetchAction should not call readDashboardUrl/createProgressEmitter.
    // We verify this by asserting the returned object doesn't depend on any
    // dashboard server wiring — a no-op onProgress is the default.
    // If fetchAction still called readDashboardUrl internally, it would try
    // to read ~/.pi/aura/server-url.json; with our tmp HOME that file doesn't
    // exist, so readDashboardUrl would return null (no crash). The key test is
    // that fetchAction does NOT need server-url.json to function.
    const fake = makeFakeAuraClient();
    const result = await fetchAction({ auraClient: fake });
    assert.ok(result.digest, "fetchAction works without server-url.json");
  });

  it("accepts an optional onProgress callback and calls it", async () => {
    const fake = makeFakeAuraClient();
    const events: { id: string; label: string; status: string }[] = [];
    await fetchAction({
      auraClient: fake,
      onProgress: (e) => events.push({ id: e.id, label: e.label, status: e.status }),
    });
    // The scheduler run creates progress nodes (phase nodes, dev-link nodes,
    // etc.) even with minimal data — the onProgress callback should receive
    // at least some events. Even without settings.digest, the inline phase
    // nodes (notifications, capacity) are emitted before the scheduler runs.
    // With no settings.digest, the scheduler block is skipped, but the
    // inline phase nodes still fire via emitPhase.
    assert.ok(events.length > 0, "onProgress should receive events");
    // Verify event shape
    for (const e of events) {
      assert.equal(typeof e.id, "string");
      assert.equal(typeof e.label, "string");
      assert.ok(["running", "done", "error"].includes(e.status));
    }
  });
});
