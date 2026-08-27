// Unit tests for digest-dashboard server.ts.
// Uses a temp HOME injected as dashboardPath/statePath/serverUrlPath.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import type { Digest } from "../../.pi/extensions/digest-dashboard/digest-types.ts";
import { startServer, type StartServerOptions } from "../../.pi/extensions/digest-dashboard/server.ts";

function createFixtureDigest(): Digest {
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

describe("digest-dashboard server", () => {
  let tmpDir: string;
  let dashboardPath: string;
  let statePath: string;
  let serverUrlPath: string;
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "digest-dashboard-server-"));
    dashboardPath = path.join(tmpDir, "digest.json");
    statePath = path.join(tmpDir, "state.json");
    serverUrlPath = path.join(tmpDir, "server-url.json");
  });

  afterEach(async () => {
    await server?.done();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves the static shell with inlined app.js and app.css", async () => {
    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    const { res, body } = await request(server.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(body).toContain('<div id="app">');
    expect(body).toContain("<script>");
    expect(body).toContain("</script>");
    expect(body).toContain("<style>");
    expect(body).toContain("</style>");
  });

  it("serves /api/digest when digest.json exists", async () => {
    const digest = createFixtureDigest();
    writeFileSync(dashboardPath, JSON.stringify(digest));

    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    const { res, body } = await request(`${server.url}api/digest`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(body).summary).toBe("Test digest");
  });

  it("returns 404 when /api/digest is missing", async () => {
    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    const { res } = await request(`${server.url}api/digest`);
    expect(res.statusCode).toBe(404);
  });

  it("writes server-url.json on listen", async () => {
    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    expect(existsSync(serverUrlPath)).toBe(true);
    const payload = JSON.parse(readFileSync(serverUrlPath, "utf-8"));
    expect(payload.url).toBe(server.url);
    expect(payload.pid).toBe(process.pid);
  });

  it("emits SSE change events when digest.json changes", async () => {
    writeFileSync(dashboardPath, JSON.stringify(createFixtureDigest()));

    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    const events: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = http.request(`${server.url}events`, { method: "GET" }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/event-stream");
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

      // Touch digest.json shortly after subscribing.
      setTimeout(() => {
        appendFileSync(dashboardPath, "\n");
      }, 50);
    });

    expect(events.some((e) => e.includes("event: change"))).toBe(true);
  });

  it("appends an event via POST /api/state", async () => {
    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    const event = {
      id: 1,
      ts: new Date().toISOString(),
      dir: "page→agent" as const,
      type: "action_click" as const,
      payload: {
        section: "overdue",
        key: "AURA-1",
        action: "advance",
        label: "Advance AURA-1",
        instruction: "Handle AURA-1",
        aura_use_case: "task-management",
      },
    };

    const { res, body } = await request(
      `${server.url}api/state`,
      "POST",
      JSON.stringify(event),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(body).ok).toBe(true);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events).toHaveLength(1);
    expect(state.events[0].id).toBe(1);
    expect(state.events[0].type).toBe("action_click");
  });

  it("returns 400 for malformed JSON on POST /api/state", async () => {
    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    const { res } = await request(`${server.url}api/state`, "POST", "not-json");
    expect(res.statusCode).toBe(400);
    expect(!existsSync(statePath) || JSON.parse(readFileSync(statePath, "utf-8")).events.length === 0).toBe(true);
  });

  it("serializes concurrent POST /api/state appends", async () => {
    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    const posts = Array.from({ length: 10 }, (_, i) =>
      request(
        `${server.url}api/state`,
        "POST",
        JSON.stringify({
          id: i + 1,
          ts: new Date().toISOString(),
          dir: "page→agent",
          type: "action_click",
          payload: { key: `AURA-${i}` },
        }),
      ),
    );

    await Promise.all(posts);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events).toHaveLength(10);
    const ids = state.events.map((e: { id: number }) => e.id).sort((a: number, b: number) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("calls the browser opener when openBrowser is true", async () => {
    const opened: string[] = [];
    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: true,
      browserOpener: (url) => opened.push(url),
    };
    server = await startServer(opts);

    expect(opened).toEqual([server.url]);
  });

  it("preserves pid/server_started when appending an event", async () => {
    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    // Seed state.json with pid and server_started.
    const initial = { pid: 12345, server_started: Date.now(), events: [] };
    writeFileSync(statePath, JSON.stringify(initial));

    const event = {
      id: 2,
      ts: new Date().toISOString(),
      dir: "page→agent" as const,
      type: "action_click" as const,
      payload: {
        section: "capacity",
        key: "capacity",
        action: "flag_capacity",
        label: "Flag capacity",
        instruction: "Check capacity",
        aura_use_case: "capacity-planning",
      },
    };

    await request(`${server.url}api/state`, "POST", JSON.stringify(event));

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.pid).toBe(12345);
    expect(state.server_started).toBe(initial.server_started);
    expect(state.events).toHaveLength(1);
  });

  it("emits a state-change SSE event when a progress event is POSTed", async () => {
    // Seed state.json so the /events watcher has a file to watch from the start.
    writeFileSync(statePath, JSON.stringify({ pid: null, server_started: null, events: [] }));
    writeFileSync(dashboardPath, JSON.stringify(createFixtureDigest()));

    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

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

      // Allow the watcher to attach, then POST a progress event.
      setTimeout(async () => {
        await request(
          `${server.url}api/state`,
          "POST",
          JSON.stringify({
            id: 1,
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
          }),
        );
      }, 80);
    });

    expect(receivedEvents.some((e) => e.includes("event: state-change"))).toBe(true);
    // The state-change data should carry the new event's id and type.
    const stateChangeChunk = receivedEvents.find((e) => e.includes("event: state-change"))!;
    expect(stateChangeChunk).toContain('"id":1');
    expect(stateChangeChunk).toContain('"type":"progress"');

    // The event should also land in state.json.
    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events).toHaveLength(1);
    expect(state.events[0].type).toBe("progress");
  });

  it("emits a state-change SSE event when an agent_log event is POSTed", async () => {
    writeFileSync(statePath, JSON.stringify({ pid: null, server_started: null, events: [] }));
    writeFileSync(dashboardPath, JSON.stringify(createFixtureDigest()));

    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

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
          JSON.stringify({
            id: 1,
            ts: new Date().toISOString(),
            dir: "agent→page",
            type: "agent_log",
            payload: { message: "Augmenting AURA-42…" },
          }),
        );
      }, 80);
    });

    expect(receivedEvents.some((e) => e.includes("event: state-change"))).toBe(true);
    const stateChangeChunk = receivedEvents.find((e) => e.includes("event: state-change"))!;
    expect(stateChangeChunk).toContain('"id":1');
    expect(stateChangeChunk).toContain('"type":"agent_log"');

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events[0].type).toBe("agent_log");
  });

  it("still emits digest.json change events alongside state-change (regression)", async () => {
    writeFileSync(statePath, JSON.stringify({ pid: null, server_started: null, events: [] }));
    writeFileSync(dashboardPath, JSON.stringify(createFixtureDigest()));

    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    const receivedEvents: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = http.request(`${server.url}events`, { method: "GET" }, (res) => {
        res.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf-8");
          receivedEvents.push(text);
          if (receivedEvents.some((e) => e.includes("event: change"))) {
            req.destroy();
            resolve();
          }
        });
      });
      req.on("error", reject);
      req.on("close", () => resolve());
      req.end();

      setTimeout(() => {
        appendFileSync(dashboardPath, "\n");
      }, 80);
    });

    expect(receivedEvents.some((e) => e.includes("event: change"))).toBe(true);
  });

  it("serializes concurrent progress POSTs with monotonic ids", async () => {
    writeFileSync(statePath, JSON.stringify({ pid: null, server_started: null, events: [] }));

    const opts: StartServerOptions = {
      dashboardPath,
      statePath,
      serverUrlPath,
      openBrowser: false,
    };
    server = await startServer(opts);

    const posts = Array.from({ length: 5 }, (_, i) =>
      request(
        `${server.url}api/state`,
        "POST",
        JSON.stringify({
          id: i + 1,
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

    await Promise.all(posts);

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(state.events).toHaveLength(5);
    const ids = state.events.map((e: { id: number }) => e.id).sort((a: number, b: number) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });
});
