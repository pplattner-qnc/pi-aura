// scheduler.test.ts — timing/safety guarantees of runTasks.
//
// These tests pin the synchronization invariants: the reducer never overlaps
// with itself, an async reducer is rejected (it would interleave and tear
// state), and a programming error (unknown kind, throwing reducer) fails the
// run loudly instead of silently dropping work.

import { describe, it, expect } from "vitest";
import { runTasks, type Kind, type KindMap, type TaskRef } from "./scheduler.js";

interface CountState {
  // bumped inside a reducer; the test checks it never exceeds 1.
  inReducer: number;
  maxInReducer: number;
  // bumped by a deliberately async reducer (rejected path).
  touched: number;
}

const makeKinds = (extra?: Record<string, Kind<unknown, unknown, CountState>>): KindMap<CountState> => ({
  // A no-op root that spawns the test's actual tasks.
  start: {
    run: async () => null,
    spawn: () => extra?.["start"]?.spawn ? extra["start"].spawn(null, null as never, { state: { inReducer: 0, maxInReducer: 0, touched: 0 } }) : [],
    reduce: () => {},
  } as unknown as Kind<Hashable, unknown, CountState>,
  ...extra,
} as KindMap<CountState>);

// Minimal helper to avoid repeating the import-less type.
type Hashable = import("./scheduler.js").Hashable;

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
        run: async (_i: number, _ctx) => "done",
        // A reducer that yields. Pre-mutex it would interleave; now the
        // drain serializes it and the scheduler rejects the async return.
        reduce: async (s) => {
          s.inReducer++;
          s.maxInReducer = Math.max(s.maxInReducer, s.inReducer);
          await Promise.resolve();
          s.inReducer--;
        },
      } as unknown as Kind<Hashable, unknown, CountState>,
    };

    const init: CountState = { inReducer: 0, maxInReducer: 0, touched: 0 };
    const result = await expect(
      runTasks<CountState>({ kind: "start", input: null }, kinds, init, { concurrency: 8 }),
    ).rejects.toThrow(/reduce must be synchronous/);
    void result;
    // Before it was rejected, no overlap was observed: the drain is serial.
    expect(init.maxInReducer).toBeLessThanOrEqual(1);
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
        reduce: (s) => {
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
    expect(result.state.count).toBe(100);
    expect(result.capped).toBe(false);
    expect(result.taskCount).toBe(101); // 1 start + 100 inc
  });

  it("rejects on an unknown kind (loud failure, not silent drop)", async () => {
    const kinds: KindMap<{ count: number }> = {
      start: {
        run: async () => null,
        spawn: () => [{ kind: "no-such-kind", input: 1 }],
        reduce: () => {},
      } as unknown as Kind<Hashable, unknown, { count: number }>,
    };
    await expect(
      runTasks<{ count: number }>({ kind: "start", input: null }, kinds, { count: 0 }),
    ).rejects.toThrow(/unknown kind "no-such-kind"/);
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
    await expect(
      runTasks<{ count: number }>({ kind: "start", input: null }, kinds, { count: 0 }),
    ).rejects.toThrow(/reducer exploded/);
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
        reduce: (s, out) => {
          if (out === "win") s.ok++;
        },
      } as unknown as Kind<Hashable, unknown, { ok: number }>,
    };
    const result = await runTasks<{ ok: number }>(
      { kind: "start", input: null },
      kinds,
      { ok: 0 },
    );
    expect(result.state.ok).toBe(1);
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
        spawn: (i) => [{ kind: "chain", input: i + 1 }], // always one more -> unbounded
        reduce: (s) => { s.ran++; },
      } as unknown as Kind<Hashable, unknown, { ran: number }>,
    };
    const result = await runTasks<{ ran: number }>(
      { kind: "start", input: null },
      kinds,
      { ran: 0 },
      { initialMaxTasks: 5 },
    );
    expect(result.capped).toBe(true);
    // start + 4 chain tasks (0..3) = 5 enqueued; chain-4 is the 6th -> dropped.
    expect(result.taskCount).toBe(5);
    // start.reduce is a no-op; the 4 chain tasks each bumped `ran`.
    expect(result.state.ran).toBe(4);
    expect(result.state.ran).toBeLessThan(result.taskCount);
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
        reduce: (s) => { s.ran++; },
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
    expect(result.capped).toBe(false);
    expect(result.maxTasks).toBe(40); // set by start, not the default 30
    // 3 row tasks bump `ran`; late-setter's reduce only tries to set the cap
    // (ignored) and does not bump `ran`.
    expect(result.state.ran).toBe(3);
    // late-setter's setMaxTasks was ignored and recorded.
    expect(result.runWarnings.some((w) => /ignored from kind "late-setter"/.test(w))).toBe(true);
  });
});

// keep the unused helper from tripng noUnusedLocals in some configs
void makeKinds;
