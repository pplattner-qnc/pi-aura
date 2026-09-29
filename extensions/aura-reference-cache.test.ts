/**
 * Logic tests for the persistent reference cache (the sqlite backing of the
 * reference engine).
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-reference-cache.test.ts
 *
 * Covers the real `node:sqlite` store against temp-file databases: WAL
 * journal mode, the (base_url, kind, id) schema, write/read roundtrips,
 * reopen persistence across store instances (the two-session model), base
 * URL keying isolation, the silent in-memory fallback for unopenable
 * databases, metadata JSON fidelity for kind-specific extras, the no-stamp
 * semantics of empty writes, and swallowed mid-session write failures. The
 * TTL settings loader, the warmup gate decision, and the cross-session
 * concurrency behavior are covered in their own sections below. The
 * production wiring (dynamic-import seam in `aura-references.ts`) is
 * exercised by the pi runtime once credentials are configured, mirroring
 * the other extension test files.
 */

import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { refreshReferenceKind, type KindAdapter } from "./aura-references.ts";
import {
  createSqliteReferenceCache,
  loadReferenceCacheTtlMs,
  shouldSkipReferenceWarmup,
  DEFAULT_REFERENCE_CACHE_TTL_MS,
  type SqliteReferenceCacheOptions,
} from "./aura-reference-cache.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run `fn` with a fresh temp dir's db path; the dir is removed afterwards
 *  even when an assertion throws. The callback may be async. */
async function withTempDb(fn: (dbPath: string) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "aura-reference-cache-test-"));
  try {
    await fn(join(dir, "cache.db"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A controllable clock: `const [now, tick] = testClock(1000)` starts at
 *  1000 and `tick(500)` advances it by 500. */
function testClock(start: number): [() => number, (delta: number) => void] {
  let t = start;
  return [() => t, (delta: number) => { t += delta; }];
}

/** Store options with an injected clock, so fetchedAt stamps are exact. */
function clockedOptions(
  dbPath: string,
  now: () => number,
  extra: Partial<SqliteReferenceCacheOptions> = {},
): SqliteReferenceCacheOptions {
  return { dbPath, baseUrl: "https://aura.example/api", now, ...extra };
}

// ---------------------------------------------------------------------------
// sqlite store: WAL mode + write/read roundtrip
// ---------------------------------------------------------------------------

{
  await withTempDb((dbPath) => {
    const [now, tick] = testClock(1000);
    const store = createSqliteReferenceCache(clockedOptions(dbPath, now));

    // The shared file is in WAL journal mode (cross-session readers and
    // writers do not block each other).
    const probe = new DatabaseSync(dbPath);
    assert.equal(
      (probe.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode,
      "wal",
    );
    probe.close();

    // An empty database reads as empty, with no stamp.
    assert.deepEqual(store.read("task"), []);
    assert.equal(store.fetchedAt("task"), null);

    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Fix the login bug", status: "OPEN" },
      { kind: "task", id: "t2", key: "AURA-2", title: "Ship the cache", status: "DONE" },
    ]);
    tick(1000);
    store.write("rule", [
      { kind: "rule", id: "r1", key: "no-any", title: "No implicit any" },
    ]);

    // Reads return the entries with fetchedAt stamps, in write order.
    assert.deepEqual(store.read("task"), [
      { kind: "task", id: "t1", key: "AURA-1", title: "Fix the login bug", status: "OPEN", fetchedAt: 1000 },
      { kind: "task", id: "t2", key: "AURA-2", title: "Ship the cache", status: "DONE", fetchedAt: 1000 },
    ]);
    assert.deepEqual(store.read("rule"), [
      { kind: "rule", id: "r1", key: "no-any", title: "No implicit any", fetchedAt: 2000 },
    ]);

    // The kind stamps are per kind, from the write time.
    assert.equal(store.fetchedAt("task"), 1000);
    assert.equal(store.fetchedAt("rule"), 2000);

    console.log("sqlite store: WAL mode + write/read roundtrip: ok");
  });
}

// ---------------------------------------------------------------------------
// sqlite store: reopen persistence (the two-session model)
// ---------------------------------------------------------------------------

{
  await withTempDb((dbPath) => {
    const [now] = testClock(1700);
    const first = createSqliteReferenceCache(clockedOptions(dbPath, now));
    first.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Fix the login bug", status: "OPEN" },
    ]);

    // A fresh store instance on the same file (the next pi session) sees
    // the persisted rows and stamps instantly, before any fetch lands.
    const second = createSqliteReferenceCache(clockedOptions(dbPath, now));
    assert.deepEqual(second.read("task"), [
      { kind: "task", id: "t1", key: "AURA-1", title: "Fix the login bug", status: "OPEN", fetchedAt: 1700 },
    ]);
    assert.equal(second.fetchedAt("task"), 1700);

    // And writes from the second session land for the first (write order
    // by rowid: the upserted row keeps its original position).
    second.write("task", [
      { kind: "task", id: "t9", key: "AURA-9", title: "Added later", status: "OPEN" },
    ]);
    assert.deepEqual(
      first.read("task").map((entry) => entry.key),
      ["AURA-1", "AURA-9"],
    );

    console.log("sqlite store: reopen persistence: ok");
  });
}

// ---------------------------------------------------------------------------
// sqlite store: base-URL keying (multi-instance isolation)
// ---------------------------------------------------------------------------

{
  await withTempDb((dbPath) => {
    const [now] = testClock(1000);
    const prod = createSqliteReferenceCache({ dbPath, baseUrl: "https://aura.example/api", now });
    const staging = createSqliteReferenceCache({ dbPath, baseUrl: "https://staging.example/api", now });

    prod.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Prod task", status: "OPEN" },
    ]);
    staging.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Staging task", status: "OPEN" },
      { kind: "task", id: "t2", key: "AURA-2", title: "Staging only", status: "OPEN" },
    ]);

    // Each base URL sees only its own items, even for the same ids.
    assert.deepEqual(
      prod.read("task").map((entry) => entry.title),
      ["Prod task"],
    );
    assert.deepEqual(
      staging.read("task").map((entry) => entry.title),
      ["Staging task", "Staging only"],
    );
    assert.equal(prod.fetchedAt("task"), 1000);

    // The table really holds both instances' rows: same (kind, id) key,
    // different base_url, two rows.
    const probe = new DatabaseSync(dbPath);
    assert.equal(
      (probe.prepare("SELECT COUNT(*) AS n FROM reference_items").get() as { n: number }).n,
      3,
    );
    probe.close();

    console.log("sqlite store: base-URL keying: ok");
  });
}

// ---------------------------------------------------------------------------
// sqlite store: upsert semantics (last-writer-wins per key, no duplicates)
// ---------------------------------------------------------------------------

{
  await withTempDb((dbPath) => {
    const [now, tick] = testClock(1000);
    const store = createSqliteReferenceCache(clockedOptions(dbPath, now));

    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "First title", status: "OPEN" },
    ]);
    tick(500);
    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Renamed title", status: "DONE" },
    ]);

    // One row, the newest values, the newest stamp.
    assert.deepEqual(store.read("task"), [
      { kind: "task", id: "t1", key: "AURA-1", title: "Renamed title", status: "DONE", fetchedAt: 1500 },
    ]);
    assert.equal(store.fetchedAt("task"), 1500);

    // The same write upserting the same id twice keeps one row.
    tick(500);
    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "A", status: "OPEN" },
      { kind: "task", id: "t1", key: "AURA-1", title: "B", status: "OPEN" },
    ]);
    const probe = new DatabaseSync(dbPath);
    assert.equal(
      (probe.prepare("SELECT COUNT(*) AS n FROM reference_items").get() as { n: number }).n,
      1,
    );
    probe.close();
    assert.deepEqual(
      store.read("task").map((entry) => entry.title),
      ["B"],
    );

    console.log("sqlite store: upsert semantics: ok");
  });
}

// ---------------------------------------------------------------------------
// sqlite store: silent in-memory fallback (never throw into the session)
// ---------------------------------------------------------------------------

{
  // An unopenable path (a directory): the store still works in-session,
  // backed by the in-memory cache.
  await withTempDb((dbPath) => {
    const dir = dbPath + ".d";
    mkdtempSync(dir); // a directory where the db file should be
    const [now] = testClock(1000);
    const store = createSqliteReferenceCache(clockedOptions(dir, now));
    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Fallback", status: "OPEN" },
    ]);
    assert.deepEqual(store.read("task"), [
      { kind: "task", id: "t1", key: "AURA-1", title: "Fallback", status: "OPEN", fetchedAt: 1000 },
    ]);
    assert.equal(store.fetchedAt("task"), 1000);
    console.log("sqlite store: in-memory fallback (unopenable path): ok");
  });

  // A corrupt file: the store falls back without destroying the file (the
  // user's data on disk is never touched, let alone deleted or re-created).
  await withTempDb((dbPath) => {
    const garbage = "this is not a sqlite database at all, just text";
    writeFileSync(dbPath, garbage, "utf8");
    const [now] = testClock(1000);
    const store = createSqliteReferenceCache(clockedOptions(dbPath, now));
    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Fallback", status: "OPEN" },
    ]);
    assert.equal(store.read("task").length, 1);
    assert.equal(readFileSync(dbPath, "utf8"), garbage);
    console.log("sqlite store: in-memory fallback (corrupt file untouched): ok");
  });
}

// ---------------------------------------------------------------------------
// sqlite store: metadata fidelity + unicode and long values
// ---------------------------------------------------------------------------

{
  await withTempDb((dbPath) => {
    const [now] = testClock(1000);
    const store = createSqliteReferenceCache(clockedOptions(dbPath, now));

    // Kind-specific extras (artifact version, wiki space, arbitrary nested
    // values from later kinds) roundtrip through the metadata JSON column.
    const longTitle = "L".repeat(5000);
    const extraItem = {
      kind: "artifact",
      id: "a1",
      key: "9f2c",
      title: "Ünïcødé 任務 title",
      version: 7,
      space: "eng",
      nested: { list: [1, "x", null, true], deep: { deeper: { value: -0.5 } } },
    };
    store.write("artifact", [extraItem]);
    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: longTitle },
    ]);

    assert.deepEqual(store.read("artifact"), [
      { ...extraItem, fetchedAt: 1000 },
    ]);
    assert.equal(store.read("task")[0]?.title, longTitle);
    assert.equal(store.read("task")[0]?.title.length, 5000);

    // Reopen: the extras survive persistence too.
    const reopened = createSqliteReferenceCache(clockedOptions(dbPath, now));
    assert.deepEqual(reopened.read("artifact"), [
      { ...extraItem, fetchedAt: 1000 },
    ]);

    console.log("sqlite store: metadata fidelity + unicode/long values: ok");
  });
}

// ---------------------------------------------------------------------------
// sqlite store: no-stamp + swallowed mid-session failures
// ---------------------------------------------------------------------------

{
  await withTempDb((dbPath) => {
    const [now] = testClock(1000);
    const store = createSqliteReferenceCache(clockedOptions(dbPath, now));

    // Empty writes write nothing and stamp nothing (the engine's no-stamp
    // semantics: an empty server result never refreshes a kind's stamp).
    store.write("task", []);
    assert.deepEqual(store.read("task"), []);
    assert.equal(store.fetchedAt("task"), null);
    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "First", status: "OPEN" },
    ]);
    store.write("task", []);
    assert.equal(store.fetchedAt("task"), 1000);
    assert.equal(store.read("task").length, 1);

    // A schema lost mid-session (the db damaged or replaced under us): the
    // store's API never throws; reads degrade to empty, stamps to null.
    const adversary = new DatabaseSync(dbPath);
    adversary.exec("DROP TABLE reference_items");
    adversary.close();
    assert.deepEqual(store.read("task"), []);
    assert.equal(store.fetchedAt("task"), null);
    store.write("task", [
      { kind: "task", id: "t2", key: "AURA-2", title: "Dropped", status: "OPEN" },
    ]);
    assert.deepEqual(store.read("task"), []);

    console.log("sqlite store: no-stamp + swallowed failures: ok");
  });
}

// ---------------------------------------------------------------------------
// Engine compatibility: the SWR refresh writes through the sqlite store
// ---------------------------------------------------------------------------

{
  await withTempDb(async (dbPath) => {
    const [now, tick] = testClock(1000);
    const store = createSqliteReferenceCache(clockedOptions(dbPath, now));

    // A minimal kind adapter whose server search returns fresh items (the
    // engine's searchServer seam; the real adapters live in the engine).
    const adapter: KindAdapter = {
      kind: "task",
      parsePartial: (partial) => partial,
      searchLocal: () => [],
      searchServer: async () => [
        { kind: "task", id: "t1", key: "AURA-1", title: "Renamed by the refresh", status: "OPEN" },
        { kind: "task", id: "t2", key: "AURA-2", title: "Fresh from the server", status: "OPEN" },
      ],
      formatRow: (item) => ({ value: `#task:${item.key}`, label: `#task:${item.key}`, description: item.title }),
      formatExpansion: (item) => `<task-ref key="${item.key}">${item.title}</task-ref>`,
      resolveFullToken: async () => null,
    };

    // The store sits behind the engine unchanged: the refresh writes its
    // results through, upserting over the cached row and adding the new one.
    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Old title", status: "OPEN" },
    ]);
    tick(500);
    await refreshReferenceKind(store, adapter, "aur");

    assert.deepEqual(store.read("task"), [
      { kind: "task", id: "t1", key: "AURA-1", title: "Renamed by the refresh", status: "OPEN", fetchedAt: 1500 },
      { kind: "task", id: "t2", key: "AURA-2", title: "Fresh from the server", status: "OPEN", fetchedAt: 1500 },
    ]);
    assert.equal(store.fetchedAt("task"), 1500);

    // The persisted rows survive into the next session (the demo: warm one
    // session, open a fresh one, suggestions are instant on the first
    // keystroke, before any fetch lands).
    const next = createSqliteReferenceCache(clockedOptions(dbPath, now));
    assert.equal(next.read("task").length, 2);

    console.log("engine compatibility: SWR write-through + cross-session instant reads: ok");
  });
}

// ---------------------------------------------------------------------------
// TTL settings loader (aura.references.cacheTtlMs, project override)
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "aura-reference-cache-test-"));
  const settingsAt = (name: string, content: string): string => {
    const p = join(dir, name);
    writeFileSync(p, content, "utf8");
    return p;
  };
  try {
    const nowhere = join(dir, "does-not-exist.json");

    // Missing files (both levels): the default TTL, on the order of hours.
    assert.equal(loadReferenceCacheTtlMs({ globalSettingsPath: nowhere, projectSettingsPath: nowhere }), DEFAULT_REFERENCE_CACHE_TTL_MS);
    assert.ok(DEFAULT_REFERENCE_CACHE_TTL_MS >= 60 * 60 * 1000, "default is at least an hour");
    assert.ok(DEFAULT_REFERENCE_CACHE_TTL_MS <= 24 * 60 * 60 * 1000, "default is at most a day");

    // Global settings provide the value.
    const global = settingsAt("global.json", JSON.stringify({
      aura: { references: { cacheTtlMs: 12_345 } },
    }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: global, projectSettingsPath: nowhere }),
      12_345,
    );

    // The project value wins when present (override, not a union).
    const project = settingsAt("project.json", JSON.stringify({
      aura: { references: { cacheTtlMs: 999 } },
    }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: global, projectSettingsPath: project }),
      999,
    );

    // A malformed project file contributes nothing: the global wins.
    const badProject = settingsAt("bad-project.json", "{ not json !!");
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: global, projectSettingsPath: badProject }),
      12_345,
    );

    // Missing blocks or non-number values at either level contribute
    // nothing: no aura block, no references block, a string, null, NaN,
    // and Infinity all fall through to the default.
    const noAura = settingsAt("no-aura.json", JSON.stringify({ other: 1 }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: noAura, projectSettingsPath: nowhere }),
      DEFAULT_REFERENCE_CACHE_TTL_MS,
    );
    const noReferences = settingsAt("no-refs.json", JSON.stringify({ aura: { baseUrl: "https://x" } }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: noReferences, projectSettingsPath: nowhere }),
      DEFAULT_REFERENCE_CACHE_TTL_MS,
    );
    const nonNumber = settingsAt("non-number.json", JSON.stringify({ aura: { references: { cacheTtlMs: "3600" } } }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: nonNumber, projectSettingsPath: nowhere }),
      DEFAULT_REFERENCE_CACHE_TTL_MS,
    );
    const nullValue = settingsAt("null.json", JSON.stringify({ aura: { references: { cacheTtlMs: null } } }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: nullValue, projectSettingsPath: nowhere }),
      DEFAULT_REFERENCE_CACHE_TTL_MS,
    );
    const nanValue = settingsAt("nan.json", JSON.stringify({ aura: { references: { cacheTtlMs: Number.NaN } } }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: nanValue, projectSettingsPath: nowhere }),
      DEFAULT_REFERENCE_CACHE_TTL_MS,
    );
    const infValue = settingsAt("inf.json", JSON.stringify({ aura: { references: { cacheTtlMs: Number.POSITIVE_INFINITY } } }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: infValue, projectSettingsPath: nowhere }),
      DEFAULT_REFERENCE_CACHE_TTL_MS,
    );
    const malformed = settingsAt("malformed.json", "]]] not json at all");
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: malformed, projectSettingsPath: nowhere }),
      DEFAULT_REFERENCE_CACHE_TTL_MS,
    );

    // Zero and negative values pass through as-is: the gate treats them as
    // always-expired (a fetch every session), never as skip-everything.
    const zero = settingsAt("zero.json", JSON.stringify({ aura: { references: { cacheTtlMs: 0 } } }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: zero, projectSettingsPath: nowhere }),
      0,
    );
    const negative = settingsAt("negative.json", JSON.stringify({ aura: { references: { cacheTtlMs: -5_000 } } }));
    assert.equal(
      loadReferenceCacheTtlMs({ globalSettingsPath: negative, projectSettingsPath: nowhere }),
      -5_000,
    );

    console.log("TTL settings loader: default, override precedence, malformed fallback: ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Warmup gate (pure decision: TTL gates the session-start warmup only)
// ---------------------------------------------------------------------------

{
  const items = [
    { kind: "task", id: "t1", key: "AURA-1", title: "Cached task", status: "OPEN" },
  ];
  const fetchedAt = 1_000_000;
  const ttlMs = 60_000;

  // Fresh and non-empty: skip the warmup fetch entirely.
  assert.equal(shouldSkipReferenceWarmup({ items, fetchedAt, ttlMs, now: fetchedAt + 1 }), true);
  assert.equal(shouldSkipReferenceWarmup({ items, fetchedAt, ttlMs, now: fetchedAt + ttlMs - 1 }), true);

  // Expired by one millisecond: fetch. The boundary is expired (fresh
  // means strictly before fetchedAt + ttl).
  assert.equal(shouldSkipReferenceWarmup({ items, fetchedAt, ttlMs, now: fetchedAt + ttlMs }), false);
  assert.equal(shouldSkipReferenceWarmup({ items, fetchedAt, ttlMs, now: fetchedAt + ttlMs + 1 }), false);

  // Empty caches always fetch, however fresh the stamp.
  assert.equal(shouldSkipReferenceWarmup({ items: [], fetchedAt, ttlMs, now: fetchedAt + 1 }), false);
  assert.equal(shouldSkipReferenceWarmup({ items: [], fetchedAt: null, ttlMs, now: fetchedAt + 1 }), false);

  // An unstamped cache is never fresh-by-omission, even with items.
  assert.equal(shouldSkipReferenceWarmup({ items, fetchedAt: null, ttlMs, now: fetchedAt + 1 }), false);

  // Zero and negative TTLs are always-expired, never skip-everything.
  assert.equal(shouldSkipReferenceWarmup({ items, fetchedAt, ttlMs: 0, now: fetchedAt }), false);
  assert.equal(shouldSkipReferenceWarmup({ items, fetchedAt, ttlMs: -60_000, now: fetchedAt - 1 }), false);

  // The clock is the injected `now`: the same inputs decide differently
  // per session start time.
  assert.equal(shouldSkipReferenceWarmup({ items, fetchedAt: 0, ttlMs: 10_000, now: 9_999 }), true);
  assert.equal(shouldSkipReferenceWarmup({ items, fetchedAt: 0, ttlMs: 10_000, now: 10_001 }), false);

  console.log("warmup gate: TTL, empty, unstamped, non-positive TTL decisions: ok");
}

// ---------------------------------------------------------------------------
// Warmup gate + store integration (the session-start decision shape)
// ---------------------------------------------------------------------------

{
  await withTempDb(async (dbPath) => {
    let clock = 1_000_000;
    const warm = createSqliteReferenceCache(clockedOptions(dbPath, () => clock));
    warm.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Warm from session one", status: "OPEN" },
    ]);

    // The next session consults the persisted cache through the cache
    // interface, exactly as the wiring does, with its own clock.
    const next = createSqliteReferenceCache(clockedOptions(dbPath, () => clock));
    const gate = (ttlMs: number, now: number): boolean =>
      shouldSkipReferenceWarmup({
        items: next.read("task"),
        fetchedAt: next.fetchedAt("task"),
        ttlMs,
        now,
      });

    // Within TTL: skip the warmup (instant session start, no fetch).
    assert.equal(gate(60_000, clock + 59_999), true);
    // Expired: fetch.
    assert.equal(gate(60_000, clock + 60_000), false);
    // A longer configured TTL keeps the same cache fresh (TTL changing
    // between sessions re-decides with the new value).
    assert.equal(gate(600_000, clock + 500_000), true);

    // Expired entries are still served instantly by reads: the TTL never
    // filters the served view (stale-while-revalidate).
    clock += 24 * 60 * 60 * 1000; // a day later
    assert.equal(gate(60_000, clock), false);
    assert.equal(next.read("task").length, 1);
    assert.deepEqual(next.read("task").map((entry) => entry.title), ["Warm from session one"]);

    console.log("warmup gate + store integration: skip/fetch + stale reads served: ok");
  });
}

// ---------------------------------------------------------------------------
// Concurrency: busy timeout + swallowed blocked writes
// ---------------------------------------------------------------------------

{
  await withTempDb(async (dbPath) => {
    const [now, tick] = testClock(1000);
    const store = createSqliteReferenceCache(clockedOptions(dbPath, now, { busyTimeoutMs: 50 }));
    store.write("task", [
      { kind: "task", id: "t1", key: "AURA-1", title: "Before the lock", status: "OPEN" },
    ]);

    // Another connection (another session) holds the write lock.
    const adversary = new DatabaseSync(dbPath);
    adversary.exec("BEGIN IMMEDIATE");

    // Reads under WAL never wait for the writer: the pre-lock view returns
    // immediately (the query path is never blocked by a write in flight).
    const started = performance.now();
    assert.deepEqual(
      store.read("task").map((entry) => entry.title),
      ["Before the lock"],
    );
    assert.ok(performance.now() - started < 100, "read does not wait for the writer");

    // A write while the lock is held waits out its busy timeout, then the
    // write is dropped: swallowed, no exception escapes the store's API.
    const writeStarted = performance.now();
    store.write("task", [
      { kind: "task", id: "t2", key: "AURA-2", title: "Blocked out", status: "OPEN" },
    ]);
    const waited = performance.now() - writeStarted;
    assert.ok(waited >= 40, `the write waited out its busy timeout (waited ${waited.toFixed(0)}ms)`);
    assert.ok(waited < 5_000, `the write is bounded, never a hang (waited ${waited.toFixed(0)}ms)`);
    assert.deepEqual(
      store.read("task").map((entry) => entry.key),
      ["AURA-1"],
      "the dropped write landed nothing",
    );

    // Once the lock is released, writes land again (last-writer-wins per
    // key, no duplicate rows).
    adversary.exec("ROLLBACK");
    adversary.close();
    tick(1);
    store.write("task", [
      { kind: "task", id: "t2", key: "AURA-2", title: "Lands now", status: "OPEN" },
    ]);
    assert.deepEqual(
      store.read("task").map((entry) => entry.title),
      ["Before the lock", "Lands now"],
    );

    // The default busy timeout is configured and bounded too: a blocked
    // default write waits on the order of the default (500 ms), then drops.
    const adversary2 = new DatabaseSync(dbPath);
    adversary2.exec("BEGIN IMMEDIATE");
    const defaultStore = createSqliteReferenceCache(clockedOptions(dbPath, now));
    const defaultStarted = performance.now();
    defaultStore.write("task", [
      { kind: "task", id: "t3", key: "AURA-3", title: "Default timeout", status: "OPEN" },
    ]);
    const defaultWaited = performance.now() - defaultStarted;
    adversary2.exec("ROLLBACK");
    adversary2.close();
    assert.ok(
      defaultWaited >= 400 && defaultWaited < 5_000,
      `the default busy timeout bounds the wait (waited ${defaultWaited.toFixed(0)}ms)`,
    );

    console.log("concurrency: busy timeout, swallowed blocked write, unblocked reads: ok");
  });
}

console.log("all aura-reference-cache tests passed");
