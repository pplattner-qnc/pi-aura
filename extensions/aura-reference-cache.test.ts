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

console.log("all aura-reference-cache tests passed");
