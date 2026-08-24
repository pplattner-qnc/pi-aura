// @vitest-environment happy-dom
//
// Regression test for the real-data stuck-loading bug.
// Mounts Digest.svelte with a realistic large digest fixture and a delayed
// fetch to simulate the slower real-data read that triggers the race.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "svelte";
import Digest from "../../.pi/extensions/digest-dashboard/Digest.svelte";
import type { Digest as DigestType } from "../../.pi/extensions/digest-dashboard/digest-types.ts";

// Minimal fake EventSource so the component can subscribe to /events without
// making a real connection. We deliberately do not dispatch any messages here
// so the test isolates the initial-load race (the SSE effect may set up a
// listener, but it must not itself keep loading stuck).
class FakeEventSource {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  static instances: FakeEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    FakeEventSource.instances = FakeEventSource.instances.filter((i) => i !== this);
  }

  static reset() {
    FakeEventSource.instances = [];
  }
}

let fetchMock: ReturnType<typeof vi.fn>;

function action(index: number): DigestType["actions"][number] {
  return {
    section: index === 0 ? "warnings" : "queue",
    key: index === 0 ? "warnings" : `AURA-${1000 + index}`,
    action: index === 0 ? "run_setup" : "advance",
    label: `Advance AURA-${1000 + index}`,
    instruction: `Advance AURA-${1000 + index} — ${index === 0 ? "Run setup" : "Keep moving"}.`,
    aura_use_case: "task-management",
  };
}

function queueRow(index: number): DigestType["queue"][number] {
  return {
    rank: index + 1,
    key: `AURA-${1000 + index}`,
    title: `Realistic queue item ${index + 1}`,
    status: ["In Progress", "In Review", "Waiting", "In Development", "In Refinement"][index % 5],
    role: index % 2 === 0 ? "OWNER" : "CONTRIBUTOR",
    capacity_pct: index % 3 === 0 ? (index + 1) * 10 : null,
    hours: index % 3 === 0 ? (index + 1) * 0.8 : null,
  };
}

function review(index: number): DigestType["reviews"][number] {
  return {
    artifact_id: `${"abcdef12-3456-7890-abcd-ef1234567890".slice(0, 36 - String(index).length)}${index}`,
    title: `Open review ${index + 1}`,
    version: index,
    decisions: [],
    decided_count: 0,
    total_required: 2,
  };
}

function realisticDigest(): DigestType {
  const digest: DigestType = {
    date: "2026-08-24",
    summary: null,
    attention: {
      overdue: [],
      waiting_on_you: [],
      waiting_on_others: [
        { key: "AURA-742", title: "Log & Trace Volume reductions", days: 6 },
        { key: "AURA-1670", title: "EnvCtl Tool - Align secrets handling for all repositories", days: 4 },
        { key: "AURA-742", title: "Log & Trace Volume reductions", days: 3 },
        { key: "AURA-756", title: "Create a Logging Standards Document", days: 3 },
        { key: "AURA-1068", title: "Phase 1: Test infrastructure", days: 0 },
      ],
      notifications: {
        since_last_run: [],
        older_unread: [
          "2026-08-24 — task.status_changed",
          "2026-08-24 — task.member_added",
          "2026-08-24 — task.status_changed",
          "2026-08-24 — task.status_changed",
          "2026-08-21 — artifact.review_decided",
          "2026-08-21 — comment.mention",
        ],
      },
    },
    queue: Array.from({ length: 9 }, (_, i) => queueRow(i)),
    capacity: {
      base_pct: 100,
      committed_pct: 100,
      free_pct: 0,
      utilization_pct: 100,
      over: false,
      total_hours: 8,
    },
    reviews: [review(0), review(1)],
    reviews_owed: [],
    corrections: [],
    warnings: [
      "Teamwork Graph dev-links layer skipped: Streamable HTTP error: Error POSTing to endpoint: {\"error\":\"invalid_token\"}",
    ],
    actions: [action(0), action(1), action(2)],
    followup: { currentlyWorkingOn: null },
    meta: {
      generated_at: "2026-08-24T16:02:59.200Z",
      raw_path: "/tmp/aura-morning/raw.json",
      report_path: "/tmp/aura-morning/report.json",
    },
  };
  // Extra fields present in the real ~/.pi/aura/digest.json but outside the
  // browser-facing Digest type. They are ignored by the component but included
  // here to mirror payload size/shape.
  return Object.assign(digest, {
    suggested_actions: digest.actions.map((a) => a.label),
    dev_links: Array.from({ length: 9 }, (_, i) => ({
      task_key: `AURA-${1000 + i}`,
      jira_keys: i % 2 === 0 ? ["ANW-0001"] : [],
      pull_requests: [],
      branches: [],
      errors: [],
    })),
  }) as DigestType;
}

async function waitFor(
  assertion: () => void,
  { timeout = 1000, interval = 10 }: { timeout?: number; interval?: number } = {},
) {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeout) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
  throw lastError ?? new Error("waitFor timed out");
}

beforeEach(() => {
  document.body.innerHTML = "";
  const app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);

  fetchMock = vi.fn();
  (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
  FakeEventSource.reset();
});

afterEach(() => {
  for (const es of FakeEventSource.instances.slice()) {
    es.close();
  }
  FakeEventSource.reset();
});

describe("Digest real-data load regression", () => {
  it("flips loading to false for a realistic large digest with a delayed fetch", async () => {
    const digest = realisticDigest();

    // Simulate the slower real-data read (≈7KB JSON) with a small delay.
    // Instant-resolve mocks do not trigger the race.
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => digest,
              }),
            50,
          ),
        ),
    );

    const target = document.getElementById("app")!;
    mount(Digest, { target });

    await waitFor(
      () => {
        expect(document.querySelector(".digest")).toBeTruthy();
        expect(document.querySelector(".max-w-5xl")).toBeTruthy();
        expect(document.body.textContent).not.toContain("Loading digest…");
      },
      { timeout: 2000 },
    );
  });
});
