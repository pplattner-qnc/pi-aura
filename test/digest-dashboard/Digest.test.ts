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
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
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

  static dispatchNamed(type: string, data: unknown) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    for (const es of FakeEventSource.instances) {
      es.listeners.get(type)?.forEach((fn) => fn(new MessageEvent(type, { data: payload })));
      if (type === "message" && es.onmessage) {
        es.onmessage(new MessageEvent("message", { data: payload }));
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

    const buttons = target.querySelectorAll("button[data-action-key]");
    expect(buttons).toHaveLength(3);
    const labels = [...buttons].map((b) => b.querySelector(".label")?.textContent?.trim() ?? "");
    expect(labels).toContain("Advance AURA-1");
    expect(labels).toContain("Review AURA-2");
    expect(labels).toContain("Flag capacity");
  });

  it("renders an empty Actions section and no action buttons when actions is empty", async () => {
    const { target } = await mountWithDigest(baseDigest([]));
    expect(target.textContent).toContain("Suggested actions");
    expect(target.textContent).toContain("No suggestions.");
    expect(target.querySelectorAll("button[data-action-key]")).toHaveLength(0);
  });

  it("renders an error state when /api/digest returns 500", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" });
    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 60));

    expect(target.textContent).toContain("Error");
    expect(target.querySelectorAll("button[data-action-key]")).toHaveLength(0);
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

    const buttons = [...target.querySelectorAll<HTMLButtonElement>("button[data-action-key]")];
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

    const buttons = [...target.querySelectorAll<HTMLButtonElement>("button[data-action-key]")];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[0].querySelector(".spinner")).toBeNull();
  });

  it("skips malformed action entries with a console warning", async () => {
    const digest = baseDigest([{ section: "overdue", key: "bad", action: "advance" } as unknown as DigestAction]);
    const { target } = await mountWithDigest(digest);

    expect(target.querySelectorAll("button[data-action-key]")).toHaveLength(0);
    expect(target.textContent).toContain("Suggested actions");
    expect(target.textContent).toContain("No suggestions.");
    expect(consoleWarnMock).toHaveBeenCalled();
  });

  it("defaults to the Suggested actions tab so buttons render immediately", async () => {
    const digest = baseDigest([action({ key: "AURA-1", label: "Advance AURA-1" })]);
    const { target } = await mountWithDigest(digest);

    const tabs = [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const actionsTab = tabs.find((t) => t.textContent?.trim() === "Suggested actions");
    expect(actionsTab).toBeDefined();
    expect(actionsTab!.classList.contains("tab-active")).toBe(true);
    expect(target.querySelectorAll("button[data-action-key]")).toHaveLength(1);
  });

  it("switches tab panels when tab buttons are clicked", async () => {
    const digest = baseDigest([action({ key: "AURA-1", label: "Advance AURA-1" })]);
    const { target } = await mountWithDigest(digest);

    const tabs = [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const capacityTab = tabs.find((t) => t.textContent?.trim() === "Capacity");
    const actionsTab = tabs.find((t) => t.textContent?.trim() === "Suggested actions");
    expect(capacityTab).toBeDefined();

    capacityTab!.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(capacityTab!.classList.contains("tab-active")).toBe(true);
    expect(actionsTab!.classList.contains("tab-active")).toBe(false);
    expect(target.querySelectorAll("button[data-action-key]")).toHaveLength(0);
    expect(target.textContent).toContain("Base");
    expect(target.textContent).toContain("Committed");
  });

  it("renders notifications shaped as {line,type,url} objects without throwing", async () => {
    const digest = baseDigest([]);
    digest.attention.notifications = {
      since_last_run: [
        { line: "2026-08-24 — task.status_changed by Anne: Thing v1 (APPROVED)", type: "task.status_changed", url: "https://aura/t/1" },
      ],
      older_unread: [
        { line: "2026-08-21 — comment.mention by Marcel", type: "comment.mention", url: null },
      ],
    };
    const { target } = await mountWithDigest(digest);

    // Renders the readable body (after the "— <type> by " prefix), not the date/type.
    expect(target.textContent).toContain("Anne: Thing v1 (APPROVED)");
    expect(target.textContent).toContain("Marcel");
    // The link is rendered for url items, plain span for null-url items.
    expect(target.querySelector('a[href="https://aura/t/1"]')).not.toBeNull();
  });

  // Regression: a stale dist build once wrote notifications as bare summary
  // strings ("YYYY-MM-DD — <type>") instead of {line,type,url} objects. The
  // component read `note.line` → undefined and threw `line.split is not a
  // function`, bricking the whole dashboard on a stuck loading screen.
  it("tolerates legacy string-shaped notifications without throwing", async () => {
    const digest = baseDigest([]);
    digest.attention.notifications = {
      since_last_run: ["2026-08-24 — task.status_changed"],
      older_unread: ["2026-08-21 — comment.mention"],
    } as unknown as DigestType["attention"]["notifications"];
    const { target } = await mountWithDigest(digest);

    // The dashboard must finish loading (not stay on "Loading digest…").
    expect(target.textContent).not.toContain("Loading digest…");
    // The legacy bare-string shape carries no actor/target, so the full line
    // is shown as the body fallback (notifBody returns the original line).
    expect(target.textContent).toContain("task.status_changed");
    expect(target.textContent).toContain("comment.mention");
  });

  it("renders dismissible warning toasts in the bottom-right", async () => {
    const digest = { ...baseDigest([]), warnings: ["First warning", "Second warning"] };
    const { target } = await mountWithDigest(digest);

    const toasts = target.querySelectorAll('.alert-warning');
    expect(toasts).toHaveLength(2);
    expect(target.textContent).toContain("First warning");
    expect(target.textContent).toContain("Second warning");

    const dismissButtons = target.querySelectorAll<HTMLButtonElement>('button[aria-label="Dismiss warning"]');
    expect(dismissButtons).toHaveLength(2);
    dismissButtons[0].click();
    await new Promise((r) => setTimeout(r, 20));

    const remainingToasts = target.querySelectorAll('.alert-warning');
    expect(remainingToasts).toHaveLength(1);
    expect(target.textContent).not.toContain("First warning");
    expect(target.textContent).toContain("Second warning");
  });
});

describe("Digest dashboard interactions", () => {
  it("POSTs an action_click event with the full action payload on click", async () => {
    const theAction = action({ key: "AURA-99", label: "Advance AURA-99" });
    const digest = baseDigest([theAction]);
    const { target } = await mountWithDigest(digest);

    const btn = target.querySelector<HTMLButtonElement>("button[data-action-key]")!;
    btn.click();
    await new Promise((r) => setTimeout(r, 20));

    const postCalls = fetchMock.mock.calls.filter((call: [string, RequestInit?]) => call[0] === "/api/state" && call[1]?.method === "POST");
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

    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/digest") {
        // First call returns firstDigest; subsequent calls return secondDigest.
        const digestCallCount = fetchMock.mock.calls.filter((c: [string, RequestInit?]) => c[0] === "/api/digest").length;
        return { ok: true, json: async () => digestCallCount <= 1 ? firstDigest : secondDigest };
      }
      if (url === "/api/state") return { ok: true, json: async () => ({ pid: null, server_started: null, events: [] }) };
      return { ok: true, json: async () => ({}) };
    });

    const target = document.getElementById("app")!;
    mount(Digest, { target });
    await new Promise((r) => setTimeout(r, 60));

    // Initial fetch + render.
    expect(target.textContent).toContain("First");

    // Simulate a server-sent change notification.
    FakeEventSource.dispatch({ changed: true });
    await new Promise((r) => setTimeout(r, 60));

    // /api/digest fetched twice (initial load + SSE change).
    const digestFetchCount = fetchMock.mock.calls.filter((c: [string, RequestInit?]) => c[0] === "/api/digest").length;
    expect(digestFetchCount).toBe(2);
    expect(target.textContent).toContain("Second");
  });
});
