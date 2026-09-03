// Unit tests for the digest-update + digest-ack tools (coherence fix for
// in-process-fetch: the orchestrator needs a way to write corrections back to
// the in-memory store, and to ack a click + clear the in-flight lock — the
// old `node -e` one-liners edited ~/.pi/aura/digest.json + state.json, which
// the in-process dashboard no longer reads/watches).
//
// digest-update: replaces the in-memory current digest (corrections, or the
//   followup.currentlyWorkingOn lock).
// digest-ack: pushes an agent→page 'ack' event + clears the working-on lock.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  teardownDashboard,
  default as installExtension,
} from "../../.pi/extensions/digest-dashboard/index.ts";
import {
  resetStore,
  getEvents,
  getCurrentDigest,
  setCurrentDigest,
  subscribe,
} from "../../.pi/extensions/digest-dashboard/store.ts";

interface RegisterToolCall {
  name: string;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ) => Promise<unknown>;
}

function createFakePi(): {
  pi: ExtensionAPI;
  registerToolCalls: RegisterToolCall[];
} {
  const registerToolCalls: RegisterToolCall[] = [];
  const pi = {
    getActiveTools: () => [] as string[],
    setActiveTools: () => {},
    sendMessage: () => {},
    registerTool: (def: RegisterToolCall) => {
      registerToolCalls.push(def);
    },
    registerCommand: () => {},
    on: () => {},
  } as unknown as ExtensionAPI;
  return { pi, registerToolCalls };
}

function createCtx(): ExtensionContext {
  return {} as ExtensionContext;
}

function findTool(calls: RegisterToolCall[], name: string): RegisterToolCall {
  const def = calls.find((c) => c.name === name);
  if (!def) throw new Error(`tool ${name} not registered`);
  return def;
}

describe("digest-update tool", () => {
  let tmpHome: string;
  let origHome: string | undefined;

  beforeEach(() => {
    origHome = process.env.HOME;
    tmpHome = mkdtempSync(path.join(os.tmpdir(), "digest-update-"));
    process.env.HOME = tmpHome;
    resetStore();
  });

  afterEach(async () => {
    await teardownDashboard(`${tmpHome}/.pi/aura/state.json`);
    resetStore();
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("replaces the in-memory current digest", async () => {
    const { pi, registerToolCalls } = createFakePi();
    installExtension(pi);
    const tool = findTool(registerToolCalls, "digest-update");

    const digestFixture = {
      date: "2026-09-03",
      summary: "corrected summary",
      followup: { currentlyWorkingOn: null },
      actions: [],
    };
    const result = (await tool.execute("t", { digest: digestFixture }, undefined, undefined, createCtx())) as {
      content: { text: string }[];
    };

    expect(result.content[0]!.text).toBe("digest-update: in-memory digest updated");
    expect(getCurrentDigest()).toEqual(digestFixture);
  });

  it("sets the in-flight working-on lock", async () => {
    const { pi, registerToolCalls } = createFakePi();
    installExtension(pi);
    const tool = findTool(registerToolCalls, "digest-update");

    const base = { date: "2026-09-03", followup: { currentlyWorkingOn: null }, actions: [] };
    setCurrentDigest(base);
    const withLock = { ...base, followup: { currentlyWorkingOn: "overdue/AURA-42" } };
    await tool.execute("t", { digest: withLock }, undefined, undefined, createCtx());

    expect((getCurrentDigest() as { followup: { currentlyWorkingOn: string } }).followup.currentlyWorkingOn).toBe(
      "overdue/AURA-42",
    );
  });
});

describe("digest-ack tool", () => {
  let tmpHome: string;
  let origHome: string | undefined;

  beforeEach(() => {
    origHome = process.env.HOME;
    tmpHome = mkdtempSync(path.join(os.tmpdir(), "digest-ack-"));
    process.env.HOME = tmpHome;
    resetStore();
  });

  afterEach(async () => {
    await teardownDashboard(`${tmpHome}/.pi/aura/state.json`);
    resetStore();
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("pushes an ack event with the event_id + clears the working-on lock", async () => {
    const { pi, registerToolCalls } = createFakePi();
    installExtension(pi);
    const tool = findTool(registerToolCalls, "digest-ack");

    // A current digest with an active lock (as if the orchestrator set it before acting).
    setCurrentDigest({
      date: "2026-09-03",
      followup: { currentlyWorkingOn: "overdue/AURA-42" },
      actions: [],
    });

    // Subscribe to observe the pushed event.
    const seen: { type: string; payload: unknown }[] = [];
    const unsub = subscribe((e) => seen.push({ type: e.type, payload: e.payload }));

    const result = (await tool.execute("t", { event_id: 7 }, undefined, undefined, createCtx())) as {
      content: { text: string }[];
    };

    expect(result.content[0]!.text).toContain("acknowledged event 7");
    // The ack event was pushed.
    const ack = seen.find((e) => e.type === "ack");
    expect(ack).toBeTruthy();
    expect(ack!.payload).toEqual({ event_id: 7, status: "done" });
    // The lock was cleared.
    expect(
      (getCurrentDigest() as { followup: { currentlyWorkingOn: string | null } }).followup.currentlyWorkingOn,
    ).toBeNull();
    unsub();
  });

  it("is a no-op for the lock when there is no current digest (but still pushes the ack)", async () => {
    const { pi, registerToolCalls } = createFakePi();
    installExtension(pi);
    const tool = findTool(registerToolCalls, "digest-ack");

    // No setCurrentDigest — no current digest.
    const seen: { type: string }[] = [];
    const unsub = subscribe((e) => seen.push({ type: e.type }));

    const result = (await tool.execute("t", { event_id: 3 }, undefined, undefined, createCtx())) as {
      content: { text: string }[];
    };

    expect(result.content[0]!.text).toContain("acknowledged event 3");
    expect(seen.some((e) => e.type === "ack")).toBe(true);
    expect(getCurrentDigest()).toBeNull();
    unsub();
  });

  it("the pushed ack event is also in getEvents()", async () => {
    const { pi, registerToolCalls } = createFakePi();
    installExtension(pi);
    const tool = findTool(registerToolCalls, "digest-ack");

    await tool.execute("t", { event_id: 11 }, undefined, undefined, createCtx());

    const events = getEvents();
    expect(events.some((e) => e.type === "ack")).toBe(true);
    const ack = events.find((e) => e.type === "ack")!;
    expect((ack.payload as { event_id: number }).event_id).toBe(11);
    expect(ack.dir).toBe("agent→page");
  });
});
