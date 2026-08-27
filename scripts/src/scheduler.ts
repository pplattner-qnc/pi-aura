// scheduler.ts — a tiny bounded-concurrency task scheduler with a reducer.
//
// Model: one root task spawns more tasks; each task has a `kind` (a constant
// naming the operation) and a hashable `input`. Identity for dedup is the
// pair (kind, input) — so two parents spawning "fetch detail AURA-1670"
// share one run. Each kind owns run + an optional spawn + a `reduce` that
// folds its output into a single shared, mutable global state `S`. The
// scheduler pumps up to `concurrency` tasks at a time; when a task finishes
// its output goes to a serialized completion drain (reduce, then spawn).
// Done when the queue is empty, nothing is in flight, and the drain is idle.
// Returns the final state.
//
// Synchronization guarantees (the point of this revision):
//   - At most ONE reducer runs at a time. Completed tasks hand (kind, output)
//     to a single FIFO; one synchronous drain processes them, so reduces
//     never overlap. This is structural, not a run-to-completion convention.
//   - reduce is REQUIRED to be synchronous (return void, not a Promise). A
//     thenable return rejects the whole run loudly — an async reducer would
//     interleave and tear state, so it is treated as a programming error.
//   - spawn runs AFTER that task's reduce, inside the same drain, so a spawn
//     that reads ctx.state sees the post-fold view.
//
// Failure posture (loud vs degrade):
//   - run() failure is graceful: it is caught, no reduce happens, the task
//     just contributes nothing. Kinds that can fail should catch inside run
//     and return a sentinel (e.g. null) so reduce always sees a real value.
//     External failures (a downed API) degrade this way on purpose.
//   - Everything else is loud: an unknown kind, an unhashable input, a
//     throwing reducer, or a throwing spawn rejects the whole run. These
//     are programming errors; swallowing them would silently lose work.
//
// Determinism: reduce is called in *completion* order, so fold into
// order-independent structures (a Map keyed by input identity) and read
// deterministically (in your own known key order) after runTasks returns.

// --- hashable identity ----------------------------------------------------

/** A value that can be canonical-serialized for dedup. Plain data only —
 *  no functions, symbols, class instances, Dates, or undefined. */
export type Hashable =
  | string
  | number
  | boolean
  | null
  | readonly Hashable[]
  | { readonly [k: string]: Hashable };

/** Canonical, order-independent serialization of a Hashable. Object keys
 *  are sorted, so {a:1,b:2} and {b:2,a:1} produce the same key. Throws on a
 *  non-hashable value (function, symbol, undefined) — that's the contract. */
export function keyOf(input: Hashable): string {
  return canonicalize(input);
}

function canonicalize(v: Hashable): string {
  if (v === null || v === undefined) return "null";
  const t = typeof v;
  if (t === "string") return JSON.stringify(v);
  if (t === "number" || t === "boolean") return String(v);
  if (t === "object") {
    if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
    const obj = v as { [k: string]: Hashable };
    return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
  }
  throw new Error(`keyOf: unhashable value of type ${t}`);
}

// --- task model ------------------------------------------------------------

/** A reference to a task — just a kind + its hashable input. Identity for
 *  dedup is `${kind}\u0000${keyOf(input)}`; first-seen wins, later duplicates
 *  are dropped (not run). Carrying only kind+input (no closure) is what makes
 *  cross-parent dedup sound: two identical refs always mean the same work. */
export interface TaskRef {
  readonly kind: string;
  readonly input: Hashable;
}

/** Per-run context handed to run/spawn. `state` is the live global state —
 *  a read here reflects whatever has been reduced so far, and it can shift
 *  under a long-running task as siblings complete and reduce. It is a LIVE
 *  VIEW, not a snapshot: if a task needs a stable reading, it must copy the
 *  fields it reads. Mutate S only by returning a value your kind's reduce
 *  folds in. */
export interface Ctx<S> {
  readonly state: Readonly<S>;
  /** True once the run hit its task cap and started dropping overflow. A task
   *  can read this to cheaply skip work whose only purpose was to spawn more
   *  (no point producing children that will be dropped). */
  readonly capped: boolean;
}

/** A kind of task: `run` does the work, `spawn` (optional) derives child
 *  refs from the result, `reduce` folds the result into global state.
 *  `reduce` MUST be synchronous (return void, never a Promise); an async
 *  reducer would interleave with others and tear state, so the scheduler
 *  rejects the run if it sees a thenable come back. */
export interface Kind<I extends Hashable, O, S> {
  run(input: I, ctx: Ctx<S>): Promise<O>;
  spawn?(output: O, input: I, ctx: Ctx<S>): readonly TaskRef[];
  /** Reducer: fold this task's output into global state. Called once, in
   *  completion order, after run() succeeds — inside the serialized drain,
   *  so no two reduces overlap. MUST be synchronous (return void or
   *  ReducerResult, never a Promise). For a failed run, reduce is not called
   *  — catch inside run() and return a sentinel instead. May return a
   *  ReducerResult to adjust run-wide limits (see ReducerResult). */
  reduce(state: S, output: O, input: I): ReducerResult | void;
}

/** Registry of kinds. Stored kinds erase I/O to Hashable/unknown; each kind
 *  literal is fully typed at its definition site, which is where it matters. */
export type KindMap<S> = Record<string, Kind<Hashable, unknown, S>>;

/** What a reducer may return (in addition to folding into state). Currently
 *  only the task cap can be set, and only the first reducer to do so wins.
 *  Returning this from a non-base task is a programming error surfaced as a
 *  warning, not a hard failure — the run continues with the already-set cap. */
export interface ReducerResult {
  /** Set the run's task cap. Honored exactly once: the first reducer that
   *  returns a finite setMaxTasks fixes the cap for the rest of the run.
   *  Later attempts are ignored and recorded in runWarnings. */
  setMaxTasks?: number;
}

// --- scheduler -------------------------------------------------------------

export interface SchedulerOptions {
  /** Max concurrently in-flight run() calls across the whole tree. */
  concurrency?: number;
  /** Initial task cap before any base-data reduce sets the real ceiling.
   *  Conservative and unconditional: bounds the run until the first reducer
   *  returns setMaxTasks. Default 30. The first reducer to return a finite
   *  setMaxTasks replaces this for the rest of the run; later attempts are
   *  ignored and recorded in runWarnings. */
  initialMaxTasks?: number;
}

/** Returned run metadata. `capped` is true iff the task cap was hit and
 *  overflow tasks were dropped — surface it as a warning so a runaway run
 *  is visible, not silent. `runWarnings` carries non-fatal run-level notices
 *  (e.g. a reducer tried to set the cap after it was already set). */
export interface RunResult<S> {
  state: S;
  capped: boolean;
  /** The number of distinct tasks enqueued (dedup'd) over the run. */
  taskCount: number;
  /** Non-fatal notices collected during the run (cap already set, etc.).
   *  Surface these alongside the caller's own warnings. */
  runWarnings: string[];
  /** The final task cap in effect when the run ended (initial or set by a
   *  reducer). */
  maxTasks: number;
}

/** Run `root` to completion — draining every task it spawns, recursively —
 *  calling each kind's reduce to fold outputs into a shared `S`. Returns the
 *  final state plus run metadata (whether the task cap was hit). Rejects on
 *  a programming error (unknown kind, unhashable input, async/throwing
 *  reducer, throwing spawn). */
export async function runTasks<S>(
  root: TaskRef,
  kinds: KindMap<S>,
  init: S,
  opts: SchedulerOptions = {},
): Promise<RunResult<S>> {
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  // Start conservative; the first base-data reducer replaces this with the
  // real ceiling once it knows the fan-out shape. This unbounded-by-default
  // value would let a runaway spawn loop forever, so it stays finite.
  let maxTasks = Math.max(1, opts.initialMaxTasks ?? 30);
  const state = init;
  let capped = false;
  let capSetBy: string | null = null; // kind that first set the cap
  const runWarnings: string[] = [];
  // Total distinct tasks ever enqueued (dedup'd). This is the budget counter;
  // once it exceeds maxTasks, overflow is dropped and `capped` flips.
  let taskCount = 0;

  const queue: TaskRef[] = [];
  const seen = new Set<string>();
  const identity = (ref: TaskRef) => `${ref.kind}\u0000${keyOf(ref.input)}`;
  // Enqueue refs with first-seen-wins dedup, bounded by maxTasks. A ref whose
  // input is unhashable (keyOf throws) is a programming error -> reject the
  // run loudly. A ref that arrives after the cap is dropped (never run) and
  // flips `capped` so the caller can surface a warning. The root itself is
  // always enqueued even if maxTasks is 1 — otherwise the run could no-op.
  const enqueue = (refs: readonly TaskRef[], isRoot = false): void => {
    for (const ref of refs) {
      let id: string;
      try {
        id = identity(ref);
      } catch (e) {
        fail(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      if (seen.has(id)) continue;
      if (!isRoot && taskCount >= maxTasks) {
        // Cap hit: drop this and every further overflow task. Flipping once
        // is sticky; the run finishes the already-queued work and stops.
        capped = true;
        return;
      }
      seen.add(id);
      taskCount++;
      queue.push(ref);
    }
  };

  // Serialized completion drain: at most one reduce (and its spawn) runs at
  // a time. Because reduce is synchronous, the drain processes the whole
  // FIFO in one synchronous pass; the `draining` flag guards against the
  // (impossible-but-defensive) re-entrant call.
  interface CompletionJob {
    ref: TaskRef;
    kind: Kind<Hashable, unknown, S>;
    output: unknown;
  }
  const completionQueue: CompletionJob[] = [];
  let draining = false;
  let settled = false;

  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const done = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const fail = (e: unknown): void => {
    if (settled) return;
    settled = true;
    reject(e);
  };
  const finish = (): void => {
    if (settled) return;
    if (queue.length === 0 && inFlight === 0 && completionQueue.length === 0 && !draining) {
      settled = true;
      resolve();
    }
  };

  const ctx: Ctx<S> = { get state() { return state; }, get capped() { return capped; } };
  const drainCompletions = (): void => {
    if (draining) return; // defensive: sync code can't actually re-enter.
    draining = true;
    try {
      while (completionQueue.length > 0) {
        if (settled) return;
        const { ref, kind, output } = completionQueue.shift()!;
        // Reducer + spawn run under a try so a throw fails the run loudly
        // (via fail) instead of escaping as an unhandled rejection out of
        // the .then callback. An async reducer (thenable return) is also a
        // programming error: it would interleave and tear state.
        try {
          const r = kind.reduce(state, output, ref.input);
          if (r !== undefined && r !== null && typeof (r as { then?: unknown }).then === "function") {
            fail(new Error(`kind "${ref.kind}" reduce must be synchronous (returned a thenable)`));
            return;
          }
          // setMaxTasks: honored exactly once. The first reducer to return a
          // finite value fixes the cap for the rest of the run; the base-data
          // task does this once it knows the fan-out shape. Later attempts
          // are ignored and recorded so the caller can surface them.
          if (r && typeof r === "object" && typeof r.setMaxTasks === "number" && Number.isFinite(r.setMaxTasks)) {
            if (capSetBy === null) {
              // Can't shrink below what's already enqueued — those tasks are
              // already in seen/queue. Floor the cap at the current count.
              maxTasks = Math.max(taskCount, Math.max(1, Math.floor(r.setMaxTasks)));
              capSetBy = ref.kind;
            } else if (capSetBy !== ref.kind) {
              runWarnings.push(
                `scheduler: setMaxTasks ignored from kind "${ref.kind}" (cap already set by "${capSetBy}" to ${maxTasks})`
              );
            }
          }
          if (kind.spawn) {
            // spawn runs after this task's reduce, so it sees the post-fold S.
            const children = kind.spawn(output, ref.input, ctx);
            enqueue(children);
          }
        } catch (e) {
          fail(e instanceof Error ? e : new Error(String(e)));
          return;
        }
      }
    } finally {
      draining = false;
    }
  };

  let inFlight = 0;
  const pump = (): void => {
    if (settled) return;
    while (queue.length > 0 && inFlight < concurrency) {
      const ref = queue.shift()!;
      const kind = kinds[ref.kind];
      if (!kind) {
        // Unknown kind is a programming error (typo in a TaskRef.kind). Fail
        // loudly rather than silently dropping the task.
        fail(new Error(`scheduler: unknown kind "${ref.kind}"`));
        return;
      }
      inFlight++;
      Promise.resolve()
        .then(() => kind.run(ref.input, ctx))
        .then(
          (output) => {
            // Hand the result to the serialized drain. reduce + spawn happen
            // there, so at most one reducer runs at a time and spawn sees the
            // post-fold state.
            completionQueue.push({ ref, kind, output });
            drainCompletions();
          },
          () => {
            // run() failed: graceful degradation. No reduce, no spawn. The
            // task just contributes nothing — by design, so an external
            // failure (a downed API) doesn't abort the whole digest.
          },
        )
        .finally(() => {
          inFlight--;
          if (!settled) {
            pump(); // refill the freed slot (may start just-spawned children)
            finish();
          }
        });
    }
    finish();
  };

  enqueue([root], true);
  pump();

  await done;
  return { state, capped, taskCount, runWarnings, maxTasks };
}
