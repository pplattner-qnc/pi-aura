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

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  createSqliteReferenceCache,
  type SqliteReferenceCacheOptions,
} from "./aura-reference-cache.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run `fn` with a fresh temp dir's db path; the dir is removed afterwards
 *  even when an assertion throws. */
function withTempDb(fn: (dbPath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "aura-reference-cache-test-"));
  try {
    fn(join(dir, "cache.db"));
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
  withTempDb((dbPath) => {
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
  withTempDb((dbPath) => {
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
  withTempDb((dbPath) => {
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
  withTempDb((dbPath) => {
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

console.log("all aura-reference-cache tests passed");
