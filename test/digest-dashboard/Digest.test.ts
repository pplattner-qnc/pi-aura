// @vitest-environment happy-dom
//
// Unit tests for the Digest.svelte dashboard component.
// Mocks fetch("/api/digest") and EventSource("/events") so the component can
// render and be exercised without the real server.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount } from "svelte";
import Digest from "../../.pi/extensions/digest-dashboard/Digest.svelte";
import type { Digest as DigestType, DigestAction } from "../../.pi/extensions/digest-dashboard/digest-types.ts";

// Minimal FakeEventSource so the component can subscribe to /events.
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

  static dispatch(message: unknown) {
    const data = typeof message === "string" ? message : JSON.stringify(message);
    for (const es of FakeEventSource.instances) {
      if (es.onmessage) {
        es.onmessage(new MessageEvent("message", { data }));
      }
    }
  }

  static reset() {
    FakeEventSource.instances = [];
  }
}

let fetchMock: ReturnType<typeof vi.fn>;
let consoleWarnMock: ReturnType<typeof vi.fn>;

function baseDigest(actions: DigestAction[], currentlyWorkingOn: string | null = null): DigestType {
  return {
    date: "2024-08-24",
    summary: "Daily digest summary.",
    attention: {
      overdue: [],
      waiting_on_you: [],
      waiting_on_others: [],
      notifications: { since_last_run: [], older_unread: [] },
    },
    queue: [],
    capacity: {
      base_pct: 80,
      committed_pct: 60,
      free_pct: 20,
      utilization_pct: 75,
      over: false,
      total_hours: 6,
    },
    reviews: [],
    reviews_owed: [],
    corrections: [],
    warnings: [],
    actions,
    followup: { currentlyWorkingOn },
    meta: {
      generated_at: "2024-08-24T08:00:00.000Z",
      raw_path: "/tmp/raw.json",
      report_path: "/tmp/report.json",
    },
  };
}

function action(props: Partial<DigestAction> & { label: string; key: string }): DigestAction {
  return {
    section: "overdue",
    action: "advance",
    instruction: `Handle ${props.key}`,
    aura_use_case: "task-management",
    ...props,
  };
}

async function mountWithDigest(digest: DigestType) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => digest });
  const target = document.getElementById("app")!;
  const comp = mount(Digest, { target });
  // Let the async loadDigest() + Svelte render settle.
  await new Promise((r) => setTimeout(r, 60));
  return { target, comp };
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

  consoleWarnMock = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const es of FakeEventSource.instances.slice()) {
    es.close();
  }
  FakeEventSource.reset();
  consoleWarnMock.mockRestore();
});

describe("Digest dashboard rendering", () => {
  it("renders one button per action with the correct labels", async () => {
    const digest = baseDigest([
      action({ key: "AURA-1", label: "Advance AURA-1" }),
      action({ key: "AURA-2", label: "Review AURA-2", section: "reviews_owed", action: "review" }),
      action({ key: "AURA-3", label: "Flag capacity", section: "capacity", action: "flag_capacity" }),
    ]);
    const { target } = await mountWithDigest(digest);

    const buttons = target.querySelectorAll("button.digest-action");
    expect(buttons).toHaveLength(3);
    const labels = [...buttons].map((b) => b.textContent?.trim());
    expect(labels).toContain("Advance AURA-1");
    expect(labels).toContain("Review AURA-2");
    expect(labels).toContain("Flag capacity");
  });

  it("shows a 'No actions' message when actions is empty", async () => {
    const { target } = await mountWithDigest(baseDigest([]));
    expect(target.textContent).toContain("No actions");
    expect(target.querySelectorAll("button.digest-action")).toHaveLength(0);
  });

  it("renders an error state when /api/digest returns 500", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" });
    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 60));

    expect(target.textContent).toContain("Error");
    expect(target.querySelectorAll("button.digest-action")).toHaveLength(0);
  });

  it("renders an error state when /api/digest returns 404", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" });
    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 60));

    expect(target.textContent).toContain("Error");
  });

  it("highlights the currently-working-on action and disables the others", async () => {
    const digest = baseDigest(
      [
        action({ key: "AURA-42", label: "Advance AURA-42" }),
        action({ key: "AURA-7", label: "Unblock AURA-7", section: "waiting_on_you", action: "unblock" }),
      ],
      "overdue/AURA-42",
    );
    const { target } = await mountWithDigest(digest);

    const buttons = [...target.querySelectorAll<HTMLButtonElement>("button.digest-action")];
    const active = buttons.find((b) => b.dataset.actionKey === "overdue/AURA-42");
    const other = buttons.find((b) => b.dataset.actionKey === "waiting_on_you/AURA-7");

    expect(active).toBeDefined();
    expect(active!.title).toBe("continue in pi");
    expect(active!.querySelector(".spinner")).not.toBeNull();
    expect(active!.disabled).toBe(false);

    expect(other).toBeDefined();
    expect(other!.disabled).toBe(true);
  });

  it("gracefully handles a stale currentlyWorkingOn key with no match", async () => {
    const digest = baseDigest(
      [action({ key: "AURA-42", label: "Advance AURA-42" })],
      "overdue/STALE-1",
    );
    const { target } = await mountWithDigest(digest);

    const buttons = [...target.querySelectorAll<HTMLButtonElement>("button.digest-action")];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[0].querySelector(".spinner")).toBeNull();
  });

  it("skips malformed action entries with a console warning", async () => {
    const digest = baseDigest([{ section: "overdue", key: "bad", action: "advance" } as unknown as DigestAction]);
    const { target } = await mountWithDigest(digest);

    expect(target.querySelectorAll("button.digest-action")).toHaveLength(0);
    expect(target.textContent).toContain("No actions");
    expect(consoleWarnMock).toHaveBeenCalled();
  });
});

describe("Digest dashboard interactions", () => {
  it("POSTs an action_click event with the full action payload on click", async () => {
    const theAction = action({ key: "AURA-99", label: "Advance AURA-99" });
    const digest = baseDigest([theAction]);
    const { target } = await mountWithDigest(digest);

    const btn = target.querySelector<HTMLButtonElement>("button.digest-action")!;
    btn.click();
    await new Promise((r) => setTimeout(r, 20));

    const postCalls = fetchMock.mock.calls.filter((call: [string, RequestInit?]) => call[0] === "/api/state");
    expect(postCalls).toHaveLength(1);
    const [, options] = postCalls[0];
    expect(options?.method).toBe("POST");
    const body = JSON.parse(options?.body as string);
    expect(body.dir).toBe("page→agent");
    expect(body.type).toBe("action_click");
    expect(body.payload).toEqual(theAction);
    expect(typeof body.id).toBe("number");
    expect(typeof body.ts).toBe("string");
  });

  it("re-fetches /api/digest when the SSE source sends a change notification", async () => {
    const firstDigest = baseDigest([action({ key: "AURA-1", label: "First" })]);
    const secondDigest = baseDigest([action({ key: "AURA-2", label: "Second" })]);

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => firstDigest })
      .mockResolvedValueOnce({ ok: true, json: async () => secondDigest });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 60));

    // Initial fetch + render.
    expect(target.textContent).toContain("First");

    // Simulate a server-sent change notification.
    FakeEventSource.dispatch({ changed: true });
    await new Promise((r) => setTimeout(r, 60));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(target.textContent).toContain("Second");
  });
});
