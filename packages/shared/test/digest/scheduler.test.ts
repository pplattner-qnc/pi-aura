// scheduler.test.ts — timing/safety guarantees of runTasks.
//
// These tests pin the synchronization invariants: the reducer never overlaps
// with itself, an async reducer is rejected (it would interleave and tear
// state), and a programming error (unknown kind, throwing reducer) fails the
// run loudly instead of silently dropping work.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTasks, type Kind, type KindMap, type TaskRef, type ProgressEvent, type NodeHandle, type Hashable, type Ctx } from "../../src/digest/scheduler.js";

interface CountState {
  // bumped inside a reducer; the test checks it never exceeds 1.
  inReducer: number;
  maxInReducer: number;
  // bumped by a deliberately async reducer (rejected path).
  touched: number;
}

const makeKinds = (extra?: Record<string, Kind<Hashable, unknown, CountState>>): KindMap<CountState> => ({
  // A no-op root that spawns the test's actual tasks.
  start: {
    run: async () => null,
    spawn: () => extra?.["start"]?.spawn ? extra["start"].spawn(null as never, null as never, { state: { inReducer: 0, maxInReducer: 0, touched: 0 } } as never) : [],
    reduce: () => {},
  } as unknown as Kind<Hashable, unknown, CountState>,
  ...extra,
} as KindMap<CountState>);

describe("runTasks synchronization", () => {
  it("never runs two reducers at the same time (mutex)", async () => {
    // Each task's reducer awaits a microtask before clearing inReducer; if
    // two reducers ever overlapped, maxInReducer would exceed 1.
    const slowTasks: TaskRef[] = Array.from({ length: 20 }, (_, i) => ({
      kind: "slow",
      input: i,
    }));

    const kinds: KindMap<CountState> = {
      start: {
        run: async () => null,
        spawn: () => slowTasks,
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, CountState>,
      slow: {
        run: async (_i: number, _ctx: Ctx<CountState>) => "done",
        // A reducer that yields. Pre-mutex it would interleave; now the
        // drain serializes it and the scheduler rejects the async return.
        reduce: async (s: CountState) => {
          s.inReducer++;
          s.maxInReducer = Math.max(s.maxInReducer, s.inReducer);
          await Promise.resolve();
          s.inReducer--;
        },
      } as unknown as Kind<Hashable, unknown, CountState>,
    };

    const init: CountState = { inReducer: 0, maxInReducer: 0, touched: 0 };
    await assert.rejects(
      runTasks<CountState>({ kind: "start", input: null }, kinds, init, { concurrency: 8 }),
      /reduce must be synchronous/,
    );
    // Before it was rejected, no overlap was observed: the drain is serial.
    assert.ok(init.maxInReducer <= 1);
  });

  it("folds synchronously and serially into shared state (correctness)", async () => {
    // 100 tasks each increment a counter in their reducer. A serial drain
    // means the final count is exactly 100; an interleaving async reducer
    // would lose updates.
    const tasks: TaskRef[] = Array.from({ length: 100 }, (_, i) => ({
      kind: "inc",
      input: i,
    }));
    const kinds: KindMap<{ count: number }> = {
      start: {
        run: async () => null,
        spawn: () => tasks,
        // Set the cap from the known fan-out (101 tasks) so the conservative
        // initialMaxTasks default doesn't drop them.
        reduce: () => ({ setMaxTasks: 200 }),
      } as unknown as Kind<Hashable, unknown, { count: number }>,
      inc: {
        run: async () => 1,
        reduce: (s: { count: number }) => {
          s.count++;
        },
      } as unknown as Kind<Hashable, unknown, { count: number }>,
    };
    const result = await runTasks<{ count: number }>(
      { kind: "start", input: null },
      kinds,
      { count: 0 },
      { concurrency: 16 },
    );
    assert.equal(result.state.count, 100);
    assert.equal(result.capped, false);
    assert.equal(result.taskCount, 101); // 1 start + 100 inc
  });

  it("rejects on an unknown kind (loud failure, not silent drop)", async () => {
    const kinds: KindMap<{ count: number }> = {
      start: {
        run: async () => null,
        spawn: () => [{ kind: "no-such-kind", input: 1 }],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { count: number }>,
    };
    await assert.rejects(
      runTasks<{ count: number }>({ kind: "start", input: null }, kinds, { count: 0 }),
      /unknown kind "no-such-kind"/,
    );
  });

  it("rejects on a throwing reducer (not swallowed)", async () => {
    const kinds: KindMap<{ count: number }> = {
      start: {
        run: async () => null,
        spawn: () => [{ kind: "boom", input: 1 }],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { count: number }>,
      boom: {
        run: async () => 1,
        reduce: () => {
          throw new Error("reducer exploded");
        },
      } as unknown as Kind<Hashable, unknown, { count: number }>,
    };
    await assert.rejects(
      runTasks<{ count: number }>({ kind: "start", input: null }, kinds, { count: 0 }),
      /reducer exploded/,
    );
  });

  it("degrades gracefully when run() fails (no fold, run continues)", async () => {
    // Two tasks: one throws, one succeeds. The thrown one contributes nothing;
    // the successful one still folds. The run resolves (not rejects).
    const kinds: KindMap<{ ok: number }> = {
      start: {
        run: async () => null,
        spawn: () => [{ kind: "maybe", input: "fail" }, { kind: "maybe", input: "win" }],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { ok: number }>,
      maybe: {
        run: async (i: string) => {
          if (i === "fail") throw new Error("down");
          return i;
        },
        reduce: (s: { ok: number }, out: string) => {
          if (out === "win") s.ok++;
        },
      } as unknown as Kind<Hashable, unknown, { ok: number }>,
    };
    const result = await runTasks<{ ok: number }>(
      { kind: "start", input: null },
      kinds,
      { ok: 0 },
    );
    assert.equal(result.state.ok, 1);
  });

  it("stops runaway queue expansion: caps total tasks, flips `capped`, drops overflow", async () => {
    // A pathological kind that always spawns one more child (i -> i+1).
    // Without a cap this is an infinite loop. With a tight initialMaxTasks,
    // the run halts at the cap: `capped` is true and taskCount never exceeds it.
    const kinds: KindMap<{ ran: number }> = {
      start: {
        run: async () => null,
        spawn: () => [{ kind: "chain", input: 0 }],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { ran: number }>,
      chain: {
        run: async (i: number) => i,
        spawn: (i: number) => [{ kind: "chain", input: i + 1 }], // always one more -> unbounded
        reduce: (s: { ran: number }) => { s.ran++; },
      } as unknown as Kind<Hashable, unknown, { ran: number }>,
    };
    const result = await runTasks<{ ran: number }>(
      { kind: "start", input: null },
      kinds,
      { ran: 0 },
      { initialMaxTasks: 5 },
    );
    assert.equal(result.capped, true);
    // start + 4 chain tasks (0..3) = 5 enqueued; chain-4 is the 6th -> dropped.
    assert.equal(result.taskCount, 5);
    // start.reduce is a no-op; the 4 chain tasks each bumped `ran`.
    assert.equal(result.state.ran, 4);
    assert.ok(result.state.ran < result.taskCount);
  });

  it("lets the first reducer set the task cap (setMaxTasks), before its spawn", async () => {
    // start knows the real fan-out shape and sets the cap from it; its spawn
    // then enqueues under that cap. A child that tries to set it again is
    // ignored and recorded in runWarnings.
    const kinds: KindMap<{ ran: number }> = {
      start: {
        run: async () => ({ rows: 3 }),
        // cap = (1 + 3) * 10 = 40 — generous, so nothing trips here.
        reduce: () => ({ setMaxTasks: 40 }),
        spawn: () => [
          { kind: "row", input: 0 },
          { kind: "row", input: 1 },
          { kind: "row", input: 2 },
          // a child that ALSO tries to set the cap -> ignored + warned
          { kind: "late-setter", input: 0 },
        ],
      } as unknown as Kind<Hashable, unknown, { ran: number }>,
      row: {
        run: async () => null,
        reduce: (s: { ran: number }) => { s.ran++; },
      } as unknown as Kind<Hashable, unknown, { ran: number }>,
      "late-setter": {
        run: async () => null,
        reduce: () => ({ setMaxTasks: 999 }), // too late -> ignored
      } as unknown as Kind<Hashable, unknown, { ran: number }>,
    };
    const result = await runTasks<{ ran: number }>(
      { kind: "start", input: null },
      kinds,
      { ran: 0 },
      { initialMaxTasks: 30 },
    );
    assert.equal(result.capped, false);
    assert.equal(result.maxTasks, 40); // set by start, not the default 30
    // 3 row tasks bump `ran`; late-setter's reduce only tries to set the cap
    // (ignored) and does not bump `ran`.
    assert.equal(result.state.ran, 3);
    // late-setter's setMaxTasks was ignored and recorded.
    assert.ok(result.runWarnings.some((w) => /ignored from kind "late-setter"/.test(w)));
  });
});

// keep the unused helper from tripping noUnusedLocals in some configs
void makeKinds;

describe("runTasks progress nodes", () => {
  // Helper: collect all ProgressEvents into an array for assertion.
  const recorder = (): { events: ProgressEvent[]; hook: (e: ProgressEvent) => void } => {
    const events: ProgressEvent[] = [];
    return { events, hook: (e) => events.push(e) };
  };
  // Find the last event for a given node label.
  const lastStatus = (events: ProgressEvent[], label: string): ProgressEvent | undefined =>
    [...events].reverse().find((e) => e.label === label);

  it("ctx.progress.create fires a running event; ctx.node is undefined for root", async () => {
    let createdNode: NodeHandle | undefined;
    let rootNode: NodeHandle | undefined;
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          rootNode = ctx.node; // root has no parent-created attachment
          createdNode = ctx.progress.create(undefined, "root task");
          ctx.progress.finish(createdNode);
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    assert.equal(rootNode, undefined);
    assert.ok(createdNode !== undefined);
    assert.ok(events.some((e) => e.label === "root task" && e.status === "running"));
    assert.ok(events.some((e) => e.label === "root task" && e.status === "done"));
  });

  it("finish(node) marks node done right now; node stays (not removed)", async () => {
    let createdNode: NodeHandle | undefined;
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          createdNode = ctx.progress.create(undefined, "my task");
          ctx.progress.finish(createdNode);
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    const nodeEvents = events.filter((e) => e.label === "my task");
    assert.equal(nodeEvents.length, 2);
    assert.equal(nodeEvents[0].status, "running");
    assert.equal(nodeEvents[1].status, "done");
  });

  it("finish(node, { deferCloseForChildren: true }) with no children becomes done immediately", async () => {
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          const node = ctx.progress.create(undefined, "deferred-empty");
          ctx.progress.finish(node, { deferCloseForChildren: true });
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    assert.equal(lastStatus(events, "deferred-empty")?.status, "done");
  });

  it("deferred parent stays running until all child-nodes close, then resolves to done", async () => {
    // Pattern from arch spec: parent creates child NODES first, finishes
    // parent with deferCloseForChildren, then spawns child TASKS that thread
    // those nodes via TaskRef.node. The parent stays running until all
    // child-nodes are terminal.
    let parentNode: NodeHandle | undefined;
    let child0Node: NodeHandle | undefined;
    let child1Node: NodeHandle | undefined;
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          parentNode = ctx.progress.create(undefined, "parent");
          child0Node = ctx.progress.create(parentNode, "child 0");
          child1Node = ctx.progress.create(parentNode, "child 1");
          ctx.progress.finish(parentNode, { deferCloseForChildren: true });
          return null;
        },
        spawn: () => [
          { kind: "child", input: 0, node: child0Node! },
          { kind: "child", input: 1, node: child1Node! },
        ],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
      child: {
        run: async (_input: number, ctx: Ctx<{ dummy: number }>) => {
          ctx.progress.finish(ctx.node!);
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    // Parent stays running until both children finish, then resolves to done.
    assert.equal(lastStatus(events, "parent")?.status, "done");
    assert.equal(lastStatus(events, "child 0")?.status, "done");
    assert.equal(lastStatus(events, "child 1")?.status, "done");
  });

  it("deferred parent becomes error when any child-node errors", async () => {
    let parentNode: NodeHandle | undefined;
    let child0Node: NodeHandle | undefined;
    let child1Node: NodeHandle | undefined;
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          parentNode = ctx.progress.create(undefined, "parent");
          child0Node = ctx.progress.create(parentNode, "child 0");
          child1Node = ctx.progress.create(parentNode, "child 1");
          ctx.progress.finish(parentNode, { deferCloseForChildren: true });
          return null;
        },
        spawn: () => [
          { kind: "child", input: 0, node: child0Node! },
          { kind: "child", input: 1, node: child1Node! },
        ],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
      child: {
        run: async (i: number, ctx: Ctx<{ dummy: number }>) => {
          if (i === 0) ctx.progress.setStatus(ctx.node!, "error");
          else ctx.progress.finish(ctx.node!);
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    assert.equal(lastStatus(events, "parent")?.status, "error");
    assert.equal(lastStatus(events, "child 0")?.status, "error");
    assert.equal(lastStatus(events, "child 1")?.status, "done");
  });

  it("deferred parent: child-node attached AFTER the finish still counts (dynamic)", async () => {
    // Parent finishes with defer (has 1 child), then creates a 2nd child
    // node AFTER the finish. Both must close for the parent to resolve.
    let parentNode: NodeHandle | undefined;
    let earlyChild: NodeHandle | undefined;
    let lateChild: NodeHandle | undefined;
    let lateChildFinished = false;
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          parentNode = ctx.progress.create(undefined, "parent");
          earlyChild = ctx.progress.create(parentNode, "early child");
          ctx.progress.finish(parentNode, { deferCloseForChildren: true });
          // Dynamic: create a child AFTER the defer finish.
          lateChild = ctx.progress.create(parentNode, "late child");
          // Finish the early child first — parent should stay running
          // because the late child is still open.
          ctx.progress.finish(earlyChild);
          // Now finish the late child — parent should resolve.
          ctx.progress.finish(lateChild);
          lateChildFinished = true;
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    assert.equal(lateChildFinished, true);
    assert.equal(lastStatus(events, "parent")?.status, "done");
  });

  it("deferred parent with unfinished child-nodes: sweep closes children as error, parent resolves to error", async () => {
    // Parent creates child nodes, finishes with defer, spawns child tasks
    // that DON'T finish their nodes. End-of-run sweep closes them as error,
    // and the parent (deferred) resolves to error.
    let parentNode: NodeHandle | undefined;
    let child0Node: NodeHandle | undefined;
    let child1Node: NodeHandle | undefined;
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          parentNode = ctx.progress.create(undefined, "parent");
          child0Node = ctx.progress.create(parentNode, "child 0");
          child1Node = ctx.progress.create(parentNode, "child 1");
          ctx.progress.finish(parentNode, { deferCloseForChildren: true });
          return null;
        },
        spawn: () => [
          { kind: "child", input: 0, node: child0Node! },
          { kind: "child", input: 1, node: child1Node! },
        ],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
      child: {
        run: async () => null, // don't finish the node
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    // Children swept to error → parent resolves to error.
    assert.equal(lastStatus(events, "parent")?.status, "error");
    assert.equal(lastStatus(events, "child 0")?.status, "error");
    assert.equal(lastStatus(events, "child 1")?.status, "error");
  });

  it("setStatus mutates a node's status directly", async () => {
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          const node = ctx.progress.create(undefined, "my task");
          ctx.progress.setStatus(node, "error");
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    const nodeEvents = events.filter((e) => e.label === "my task");
    assert.equal(nodeEvents[0].status, "running");
    assert.equal(nodeEvents[1].status, "error");
    assert.equal(nodeEvents.length, 2);
  });

  it("a node never finished → end-of-run sweep marks it error", async () => {
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          ctx.progress.create(undefined, "orphan");
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    const nodeEvents = events.filter((e) => e.label === "orphan");
    assert.equal(nodeEvents[0].status, "running");
    assert.equal(nodeEvents[nodeEvents.length - 1].status, "error");
  });

  it("a task that throws does NOT trigger per-task node auto-close (only end-of-run sweep)", async () => {
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          ctx.progress.create(undefined, "will-throw");
          throw new Error("task exploded");
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    const nodeEvents = events.filter((e) => e.label === "will-throw");
    // running (from create), then error (from end-of-run sweep only).
    assert.equal(nodeEvents[0].status, "running");
    assert.equal(nodeEvents[1].status, "error");
    assert.equal(nodeEvents.length, 2);
  });

  it("TaskRef.node threads to the child as ctx.node", async () => {
    let parentNode: NodeHandle | undefined;
    let childCtxNode: NodeHandle | undefined;
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          parentNode = ctx.progress.create(undefined, "parent");
          return null;
        },
        spawn: () => [{ kind: "child", input: 0, node: parentNode! }],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
      child: {
        run: async (_input: number, ctx: Ctx<{ dummy: number }>) => {
          childCtxNode = ctx.node;
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    assert.ok(childCtxNode !== undefined);
    assert.equal(childCtxNode, parentNode);
  });

  it("nodes are append-only: never removed mid-run", async () => {
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          const node = ctx.progress.create(undefined, "persistent");
          ctx.progress.finish(node);
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    const nodeEvents = events.filter((e) => e.label === "persistent");
    assert.equal(nodeEvents.length, 2);
    assert.ok(nodeEvents.every((e) => e.id === nodeEvents[0].id));
  });

  it("onProgress fires for every status transition", async () => {
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          const node = ctx.progress.create(undefined, "all transitions");
          ctx.progress.setStatus(node, "error");
          ctx.progress.setStatus(node, "done");
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    const nodeEvents = events.filter((e) => e.label === "all transitions");
    assert.deepEqual(nodeEvents.map((e) => e.status), ["running", "error", "done"]);
  });

  it("parent-child relationship in ProgressEvent via parentId", async () => {
    let parentNode: NodeHandle | undefined;
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          parentNode = ctx.progress.create(undefined, "root parent");
          const child = ctx.progress.create(parentNode, "child node");
          ctx.progress.finish(child);
          ctx.progress.finish(parentNode);
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    const childRunning = events.find((e) => e.label === "child node" && e.status === "running");
    assert.ok(childRunning !== undefined);
    assert.equal(childRunning?.parentId, parentNode!.id.toString());
  });

  // --- FIX 1: leaf node with deferCloseForChildren is a no-op; plain finish keeps it running ---
  // These two tests document the production pattern used by aura-digest.ts:
  // the row/candidate leaf nodes must NOT use deferCloseForChildren (which
  // resolves to "done" immediately since they have no children), and must
  // instead be left "running" and finished plainly in the task's finally
  // block so they stay spinning until the task completes.

  it("leaf node finished with deferCloseForChildren: true resolves to done immediately (no children)", async () => {
    // Documents the current scheduler behavior: a deferred leaf (no children)
    // becomes done at the moment finish is called. This is WHY the production
    // code must NOT use deferCloseForChildren on leaf row/candidate nodes —
    // they would flip to "done" before the child task runs.
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          const leaf = ctx.progress.create(undefined, "leaf-defer");
          ctx.progress.finish(leaf, { deferCloseForChildren: true });
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    // The leaf resolves to "done" immediately — there are no children to wait for.
    const leafEvents = events.filter((e) => e.label === "leaf-defer");
    assert.equal(leafEvents[0].status, "running");
    assert.equal(leafEvents[leafEvents.length - 1].status, "done");
  });

  it("leaf node left running and finished later via finish(node) stays running until the finish call", async () => {
    // The production pattern: create a leaf node (no defer), spawn a child
    // task that threads it via TaskRef.node, and the child task finishes
    // the node in its finally block. The node stays "running" until the
    // child task's finish call — the desired UX.
    let leafNode: NodeHandle | undefined;
    const kinds: KindMap<{ dummy: number }> = {
      start: {
        run: async (_input: Hashable, ctx: Ctx<{ dummy: number }>) => {
          leafNode = ctx.progress.create(undefined, "leaf-task");
          // Do NOT finish with deferCloseForChildren — leave it running.
          return null;
        },
        spawn: () => [{ kind: "child", input: 0, node: leafNode! }],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
      child: {
        run: async (_input: number, ctx: Ctx<{ dummy: number }>) => {
          // Simulate work — the node is still "running" at this point.
          await Promise.resolve();
          // The finally block finishes the node plainly (no defer).
          ctx.progress.finish(ctx.node!);
          return null;
        },
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { dummy: number }>,
    };
    const { events, hook } = recorder();
    await runTasks(
      { kind: "start", input: null }, kinds, { dummy: 0 },
      { onProgress: hook },
    );
    // The leaf stays "running" until the child task finishes it.
    const leafEvents = events.filter((e) => e.label === "leaf-task");
    assert.equal(leafEvents[0].status, "running");
    assert.equal(leafEvents[leafEvents.length - 1].status, "done");
    // Exactly 2 events: running (from create) + done (from child's finish).
    assert.equal(leafEvents.length, 2);
  });
});
