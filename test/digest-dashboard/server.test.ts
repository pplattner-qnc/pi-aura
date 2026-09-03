// Unit tests for digest-dashboard server.ts (in-memory backing store).
// The server no longer reads digest.json or state.json from disk.
// /api/digest serves the in-memory currentDigest (404 when null).
// /events SSE fans out pushEvent + setCurrentDigest.
// /api/state POST appends in-memory via pushEvent.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { startServer } from "../../.pi/extensions/digest-dashboard/server.ts";
import {
  resetStore,
  setCurrentDigest,
  pushEvent,
  registerSseClient,
} from "../../.pi/extensions/digest-dashboard/store.ts";
import type { StateEvent } from "../../.pi/extensions/digest-dashboard/state.ts";

function createFixtureDigest(): unknown {
  return {
    date: "2024-08-24",
    summary: "Test digest",
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
    warnings: ["test warning"],
    actions: [],
    followup: { currentlyWorkingOn: null },
    meta: {
      generated_at: "2024-08-24T08:00:00.000Z",
      raw_path: "/tmp/raw.json",
      report_path: "/tmp/report.json",
    },
  };
}

async function getBody(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

async function request(url: string, method = "GET", body?: string): Promise<{ res: http.IncomingMessage; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, async (res) => {
      const text = await getBody(res);
      resolve({ res, body: text });
    });
    req.on("error", reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

function createActionEvent(): StateEvent {
  return {
    id: 0,
    ts: new Date().toISOString(),
    dir: "page→agent",
    type: "action_click",
    payload: {
      section: "overdue",
      key: "AURA-1",
      action: "advance",
      label: "Advance AURA-1",
      instruction: "Handle AURA-1",
      aura_use_case: "task-management",
    },
  };
}

function createProgressEvent(): StateEvent {
  return {
    id: 0,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: "progress",
    payload: {
      id: "node-1",
      label: "Fetching tasks",
      status: "running",
      startedAt: Date.now(),
      kind: "start",
    },
  };
}

function createAgentLogEvent(message: string): StateEvent {
  return {
    id: 0,
    ts: new Date().toISOString(),
    dir: "agent→page",
    type: "agent_log",
    payload: { message },
  };
}

describe("digest-dashboard server (in-memory backing)", () => {
  let tmpDir: string;
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-server-"));
    resetStore();
  });

  afterEach(async () => {
    await server?.done();
    resetStore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves the static shell with inlined app.js and app.css", async () => {
    server = await startServer({ openBrowser: false });

    const { res, body } = await request(server.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(body).toContain('<div id="app">');
    expect(body).toContain("<script>");
    expect(body).toContain("</script>");
    expect(body).toContain("<style>");
    expect(body).toContain("</style>");
  });

  it("returns 404 for /api/digest when no digest is set (accepted regression)", async () => {
    server = await startServer({ openBrowser: false });

    const { res, body } = await request(`${server.url}api/digest`);
    expect(res.statusCode).toBe(404);
    expect(body).toBe("Not found");
  });

  it("serves /api/digest from the in-memory store after setCurrentDigest", async () => {
    server = await startServer({ openBrowser: false });

    const digest = createFixtureDigest();
    setCurrentDigest(digest);

    const { res, body } = await request(`${server.url}api/digest`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(body).summary).toBe("Test digest");
  });

  it("does not read digest.json from disk for /api/digest", async () => {
    // Even if a digest.json exists on disk, /api/digest serves the in-memory
    // store (which is empty → 404).
    server = await startServer({ openBrowser: false });

    const { res } = await request(`${server.url}api/digest`);
    expect(res.statusCode).toBe(404);
  });

  it("emits SSE state-change events when pushEvent fires", async () => {
    server = await startServer({ openBrowser: false });

    const events: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = http.request(`${server.url}events`, { method: "GET" }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/event-stream");
        res.on("data", (chunk: Buffer) => {
          events.push(chunk.toString("utf-8"));
          if (events.some((e) => e.includes("event: state-change"))) {
            req.destroy();
            resolve();
          }
        });
      });
      req.on("error", reject);
      req.on("close", () => resolve());
      req.end();

      // Allow the SSE connection to establish, then push an event.
      setTimeout(() => {
        pushEvent(createProgressEvent());
      }, 50);
    });

    expect(events.some((e) => e.includes("event: state-change"))).toBe(true);
    const stateChangeChunk = events.find((e) => e.includes("event: state-change"))!;
    expect(stateChangeChunk).toContain('"id":1');
    expect(stateChangeChunk).toContain('"type":"progress"');
  });

  it("emits a change SSE event when setCurrentDigest is called", async () => {
    server = await startServer({ openBrowser: false });

    const events: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = http.request(`${server.url}events`, { method: "GET" }, (res) => {
        res.on("data", (chunk: Buffer) => {
          events.push(chunk.toString("utf-8"));
          if (events.some((e) => e.includes("event: change"))) {
            req.destroy();
            resolve();
          }
        });
      });
      req.on("error", reject);
      req.on("close", () => resolve());
      req.end();

      setTimeout(() => {
        setCurrentDigest(createFixtureDigest());
      }, 50);
    });

    expect(events.some((e) => e.includes("event: change"))).toBe(true);
  });

  it("POST /api/state appends an event in-memory (no state.json written)", async () => {
    server = await startServer({ openBrowser: false });

    const event = createActionEvent();
    const { res, body } = await request(
      `${server.url}api/state`,
      "POST",
      JSON.stringify(event),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(body).ok).toBe(true);

    // No state.json should be written to disk (in-memory backing).
    const statePath = path.join(tmpDir, "state.json");
    expect(existsSync(statePath)).toBe(false);
  });

  it("returns 400 for malformed JSON on POST /api/state", async () => {
    server = await startServer({ openBrowser: false });

    const { res } = await request(`${server.url}api/state`, "POST", "not-json");
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/state returns the in-memory events the browser's loadStateEvents loads (closes the live-tree + log-list loop)", async () => {
    server = await startServer({ openBrowser: false });

    // No events yet — empty array (the view's `data?.events ?? []`).
    const empty = await request(`${server.url}api/state`, "GET");
    expect(empty.res.statusCode).toBe(200);
    expect(JSON.parse(empty.body)).toEqual({ events: [] });

    // Push a progress event + an agent_log event (what digest-fetch + digest-log produce).
    pushEvent(createProgressEvent());
    pushEvent(createAgentLogEvent("Verifying review states…"));

    // GET /api/state returns them in order — this is the shape loadStateEvents
    // parses: extractProgressEvents + extractAgentLogEvents read data.events.
    const res = await request(`${server.url}api/state`, "GET");
    expect(res.res.statusCode).toBe(200);
    const data = JSON.parse(res.body) as { events: StateEvent[] };
    expect(data.events).toHaveLength(2);
    expect(data.events[0]).toMatchObject({
      dir: "agent→page",
      type: "progress",
      payload: { id: "node-1", label: "Fetching tasks", status: "running", kind: "start" },
    });
    expect(data.events[1]).toMatchObject({
      dir: "agent→page",
      type: "agent_log",
      payload: { message: "Verifying review states…" },
    });
    // The store assigned monotonic ids (overwrote the client id:0).
    expect(data.events[0].id).toBe(1);
    expect(data.events[1].id).toBe(2);
  });

  it("POST /api/state fans out to SSE clients as state-change", async () => {
    server = await startServer({ openBrowser: false });

    const receivedEvents: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = http.request(`${server.url}events`, { method: "GET" }, (res) => {
        expect(res.statusCode).toBe(200);
        res.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf-8");
          receivedEvents.push(text);
          if (text.includes("event: state-change")) {
            req.destroy();
            resolve();
          }
        });
      });
      req.on("error", reject);
      req.on("close", () => resolve());
      req.end();

      // Allow the SSE connection to establish, then POST a progress event.
      setTimeout(async () => {
        await request(
          `${server.url}api/state`,
          "POST",
          JSON.stringify(createProgressEvent()),
        );
      }, 80);
    });

    expect(receivedEvents.some((e) => e.includes("event: state-change"))).toBe(true);
    const stateChangeChunk = receivedEvents.find((e) => e.includes("event: state-change"))!;
    expect(stateChangeChunk).toContain('"id":1');
    expect(stateChangeChunk).toContain('"type":"progress"');
  });

  it("POST /api/state assigns server-side monotonic ids (overwriting client id)", async () => {
    server = await startServer({ openBrowser: false });

    const posts = Array.from({ length: 5 }, (_, i) =>
      request(
        `${server.url}api/state`,
        "POST",
        JSON.stringify({
          id: 0,
          ts: new Date().toISOString(),
          dir: "agent→page",
          type: "progress",
          payload: {
            id: `node-${i}`,
            label: `node ${i}`,
            status: "running",
            startedAt: i,
            kind: "start",
          },
        }),
      ),
    );

    const results = await Promise.all(posts);
    for (const { res } of results) {
      expect(res.statusCode).toBe(200);
    }

    // No state.json on disk.
    expect(existsSync(path.join(tmpDir, "state.json"))).toBe(false);
  });

  it("POST /api/state with agent_log type fans out as state-change", async () => {
    server = await startServer({ openBrowser: false });

    const receivedEvents: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = http.request(`${server.url}events`, { method: "GET" }, (res) => {
        res.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf-8");
          receivedEvents.push(text);
          if (text.includes("event: state-change")) {
            req.destroy();
            resolve();
          }
        });
      });
      req.on("error", reject);
      req.on("close", () => resolve());
      req.end();

      setTimeout(async () => {
        await request(
          `${server.url}api/state`,
          "POST",
          JSON.stringify(createAgentLogEvent("Augmenting AURA-42…")),
        );
      }, 80);
    });

    expect(receivedEvents.some((e) => e.includes("event: state-change"))).toBe(true);
    const stateChangeChunk = receivedEvents.find((e) => e.includes("event: state-change"))!;
    expect(stateChangeChunk).toContain('"id":1');
    expect(stateChangeChunk).toContain('"type":"agent_log"');
  });

  it("calls the browser opener when openBrowser is true", async () => {
    const opened: string[] = [];
    server = await startServer({
      openBrowser: true,
      browserOpener: (url) => opened.push(url),
    });

    expect(opened).toEqual([server.url]);
  });

  it("does not write server-url.json on listen", async () => {
    server = await startServer({ openBrowser: false });

    expect(existsSync(path.join(tmpDir, "server-url.json"))).toBe(false);
  });
});
