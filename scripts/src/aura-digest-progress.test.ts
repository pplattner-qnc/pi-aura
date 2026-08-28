// Unit tests for the progress emitter — the onProgress hook passed to
// runTasks that POSTs batched progress events to the dashboard's /api/state.
//
// Tests mirror the scheduler.test.ts vitest style (import from .js with
// vitest). The seams tested here are:
//   1. readDashboardUrl() reads ~/.pi/aura/server-url.json once (no-op if absent).
//   2. createProgressEmitter batches on a ~50ms timer + flushes at run end;
//      near-instant open→done pairs coalesce to a single "done" event.
//   3. Events are POSTed in batches to /api/state.
//
// Run with: npx vitest run --config vitest.config.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
import {
  readDashboardUrl,
  createProgressEmitter,
  type ProgressEventLike,
  type ProgressStateEvent,
} from "./progress-emitter.js";

/** A minimal ProgressEvent shape compatible with the scheduler's ProgressEvent. */
function makeEvent(overrides: Partial<ProgressEventLike> = {}): ProgressEventLike {
  return {
    id: "1",
    label: "test node",
    status: "running",
    startedAt: Date.now(),
    kind: "start",
    ...overrides,
  };
}

/** Extract all progress payloads from the received POST bodies. */
function extractPayloads(posts: { body: string }[]): ProgressEventLike[] {
  return posts.map((p) => (JSON.parse(p.body) as ProgressStateEvent).payload);
}

describe("readDashboardUrl", () => {
  let tmpDir: string;
  let serverUrlPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "progress-emitter-test-"));
    serverUrlPath = join(tmpDir, "server-url.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when server-url.json is absent", () => {
    expect(readDashboardUrl(serverUrlPath)).toBeNull();
  });

  it("returns the url when server-url.json exists", () => {
    writeFileSync(serverUrlPath, JSON.stringify({ url: "http://127.0.0.1:9876/", pid: 12345 }));
    expect(readDashboardUrl(serverUrlPath)).toBe("http://127.0.0.1:9876/");
  });

  it("returns null for malformed JSON (does not throw)", () => {
    writeFileSync(serverUrlPath, "not-json{");
    expect(readDashboardUrl(serverUrlPath)).toBeNull();
  });
});

describe("createProgressEmitter — no-op path", () => {
  it("returns a no-op hook when dashboardUrl is null (no POSTs attempted)", async () => {
    const posts: unknown[] = [];
    const fetchMock = vi.fn(async () => {
      posts.push("called");
      return new Response("ok", { status: 200 });
    });
    const hook = createProgressEmitter(null, { fetchImpl: fetchMock });
    hook(makeEvent());
    hook(makeEvent({ id: "2" }));
    await hook.flush();
    expect(posts).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createProgressEmitter — batching", () => {
  let tmpDir: string;
  let server: http.Server;
  let serverUrl: string;
  let statePath: string;
  let receivedPosts: { body: string; path: string }[];

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "progress-emitter-server-"));
    statePath = join(tmpDir, "state.json");
    receivedPosts = [];

    server = http.createServer(async (req, res) => {
      if (req.url === "/api/state" && req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = Buffer.concat(chunks).toString("utf-8");
        receivedPosts.push({ body, path: req.url });
        // Append to state.json to simulate the real server.
        const parsed = JSON.parse(body) as ProgressStateEvent;
        if (existsSync(statePath)) {
          const state = JSON.parse(readFileSync(statePath, "utf-8"));
          state.events.push(parsed);
          writeFileSync(statePath, JSON.stringify(state));
        } else {
          writeFileSync(statePath, JSON.stringify({ pid: null, server_started: null, events: [parsed] }));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    if (!addr || typeof addr !== "object") throw new Error("server failed to bind");
    serverUrl = `http://127.0.0.1:${addr.port}/`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("POSTs events in a single batch within ~50ms when 10 rapid events are pushed", async () => {
    // Deterministic: use fake timers + mock fetch (no real HTTP, no real
    // setTimeout wait) so the test does not flake under load (FIX 6).
    vi.useFakeTimers();
    const mockPosts: { body: string }[] = [];
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => {
      mockPosts.push({ body: init?.body as string });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const hook = createProgressEmitter(serverUrl, { fetchImpl: mockFetch as unknown as typeof fetch });

    // Push 10 rapid events (all different ids — no coalescing).
    for (let i = 0; i < 10; i++) {
      hook(makeEvent({ id: String(i), label: `node ${i}`, startedAt: i }));
    }

    // Advance past the ~50ms batch timer so the drain fires.
    await vi.advanceTimersByTimeAsync(60);

    // Should have POSTed 10 events in one batch (all from the same ~50ms window).
    // They are individual POSTs but all arrive within the same ~50ms batch.
    expect(mockPosts.length).toBe(10);

    // All 10 payloads should be present.
    const payloads = extractPayloads(mockPosts);
    const ids = payloads.map((p) => p.id).sort();
    expect(ids).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

    vi.useRealTimers();
  });

  it("flushes remaining events at run end (final flush)", async () => {
    const hook = createProgressEmitter(serverUrl, { batchMs: 5000 }); // long timer so only flush fires

    hook(makeEvent({ id: "1", label: "final flush test" }));
    await hook.flush();

    expect(receivedPosts.length).toBe(1);
    const payload = (JSON.parse(receivedPosts[0].body) as ProgressStateEvent).payload;
    expect(payload.id).toBe("1");
  });

  it("coalesces near-instant open→done pairs to a single done event", async () => {
    const hook = createProgressEmitter(serverUrl, { batchMs: 5000 });

    // Open→done on the same node id, back-to-back.
    hook(makeEvent({ id: "1", label: "fast pair", status: "running" }));
    hook(makeEvent({ id: "1", label: "fast pair", status: "done", endedAt: Date.now() }));

    await hook.flush();

    expect(receivedPosts.length).toBe(1);
    const payload = (JSON.parse(receivedPosts[0].body) as ProgressStateEvent).payload;
    expect(payload.status).toBe("done");
    expect(payload.id).toBe("1");
  });

  it("does not coalesce events with different ids", async () => {
    const hook = createProgressEmitter(serverUrl, { batchMs: 5000 });

    hook(makeEvent({ id: "1", label: "node 1", status: "running" }));
    hook(makeEvent({ id: "2", label: "node 2", status: "running" }));

    await hook.flush();

    expect(receivedPosts.length).toBe(2);
    const payloads = extractPayloads(receivedPosts);
    expect(payloads).toHaveLength(2);
    expect(payloads.map((p) => p.id).sort()).toEqual(["1", "2"]);
  });

  it("coalesces a running→error pair to a single error event", async () => {
    const hook = createProgressEmitter(serverUrl, { batchMs: 5000 });

    hook(makeEvent({ id: "1", label: "err pair", status: "running" }));
    hook(makeEvent({ id: "1", label: "err pair", status: "error", endedAt: Date.now() }));

    await hook.flush();

    expect(receivedPosts.length).toBe(1);
    const payload = (JSON.parse(receivedPosts[0].body) as ProgressStateEvent).payload;
    expect(payload.status).toBe("error");
  });

  it("keeps a running event when no done/error follows for that id", async () => {
    const hook = createProgressEmitter(serverUrl, { batchMs: 5000 });

    hook(makeEvent({ id: "1", label: "stays running", status: "running" }));

    await hook.flush();

    expect(receivedPosts.length).toBe(1);
    const payload = (JSON.parse(receivedPosts[0].body) as ProgressStateEvent).payload;
    expect(payload.status).toBe("running");
  });
});
