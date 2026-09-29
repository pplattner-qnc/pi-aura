/**
 * Persistent reference cache (the sqlite backing of the reference engine).
 *
 * The production cache behind `aura-references.ts`: one sqlite database at
 * `~/.pi/agent/aura-reference-cache.db`, opened with `node:sqlite`
 * (`DatabaseSync`) in WAL journal mode, shared by all pi sessions as a
 * plain file (no extra process). One table of cached referenceable items is
 * keyed by `(base_url, kind, id)` and carries `item_key`, `title`, `status`,
 * a metadata JSON column, and the `fetched_at` stamp. The base URL (the same
 * `aura.baseUrl` the AuraClient reads) is part of the key so multi-instance
 * setups never cross-contaminate, and the metadata JSON column keeps the
 * schema kind-agnostic: later kinds (artifacts, wiki) add metadata without a
 * migration.
 *
 * The store implements the engine's `ReferenceCache` interface exactly
 * (`read(kind)` / `write(kind, items)` / `fetchedAt(kind)`); the in-memory
 * implementation in `aura-references.ts` remains the unit-test fake.
 *
 * Failure policy (the live-package rule): nothing here ever throws into the
 * session. A database that cannot be opened (unreadable path, corrupt file,
 * locked) silently falls back to the session-scoped in-memory cache; cache
 * writes are fire-and-forget side effects whose failures are swallowed, so
 * `getSuggestions` is never blocked or disturbed by the store.
 *
 * This module also owns the cache TTL settings loader
 * (`aura.references.cacheTtlMs`, global with a project override) and the pure
 * warmup-gate decision the session-start wiring consults; see their
 * sections below.
 *
 * Tests: `extensions/aura-reference-cache.test.ts`, run with
 *
 *   node --experimental-strip-types extensions/aura-reference-cache.test.ts
 *
 * The module imports only node builtins plus `./aura-references.ts` (types
 * and the in-memory fake), so the unit-test entry point stays runnable under
 * `node --experimental-strip-types`; the production wiring in
 * `aura-references.ts` dynamic-imports this module to keep that seam.
 */

import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  createInMemoryReferenceCache,
  type CacheEntry,
  type ReferenceCache,
  type ReferenceItem,
} from "./aura-references.ts";

// ---------------------------------------------------------------------------
// Store options and the default database path
// ---------------------------------------------------------------------------

/** Options for the sqlite reference cache factory. */
export interface SqliteReferenceCacheOptions {
  /** Database file path (tests pass a temp-file path). */
  dbPath: string;
  /** The Aura base URL the cached items belong to (multi-instance keying).
   *  The same `aura.baseUrl` the AuraClient reads; the empty string when no
   *  base URL is configured (single-instance default). */
  baseUrl: string;
  /** Clock for `fetched_at` stamps (tests inject fixed times). */
  now?: () => number;
  /** SQLite busy timeout in milliseconds (default 500). Bounds how long a
   *  blocked write waits before it is dropped; see the concurrency notes. */
  busyTimeoutMs?: number;
}

/** The persistent cache's default location: `~/.pi/agent/aura-reference-cache.db`. */
export function defaultReferenceCacheDbPath(): string {
  return join(homedir(), ".pi", "agent", "aura-reference-cache.db");
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** One row per cached referenceable item, keyed by (base_url, kind, id).
 *  `item_key` is the engine's token key (a task's human key); `metadata`
 *  holds the kind-specific extras as JSON so artifact and wiki kinds (later
 *  tickets) add fields without a migration; `fetched_at` is the epoch-ms
 *  stamp of the last write that upserted the row. */
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS reference_items (
    base_url TEXT NOT NULL,
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    item_key TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT,
    metadata TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (base_url, kind, id)
  )
`;

const UPSERT_SQL = `
  INSERT INTO reference_items (base_url, kind, id, item_key, title, status, metadata, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (base_url, kind, id) DO UPDATE SET
    item_key = excluded.item_key,
    title = excluded.title,
    status = excluded.status,
    metadata = excluded.metadata,
    fetched_at = excluded.fetched_at
`;

const READ_SQL = `
  SELECT id, item_key, title, status, metadata, fetched_at
  FROM reference_items
  WHERE base_url = ? AND kind = ?
  ORDER BY rowid
`;

const FETCHED_AT_SQL = `
  SELECT MAX(fetched_at) AS max_fetched_at
  FROM reference_items
  WHERE base_url = ? AND kind = ?
`;

/** One row of the read query as it comes back from `node:sqlite`. */
interface ReferenceItemRow {
  id: string;
  item_key: string;
  title: string;
  status: string | null;
  metadata: string;
  fetched_at: number;
}

// ---------------------------------------------------------------------------
// The sqlite store
// ---------------------------------------------------------------------------

/**
 * Build the persistent reference cache: a `node:sqlite` (`DatabaseSync`)
 * store in WAL journal mode with a busy timeout, implementing the engine's
 * `ReferenceCache` interface. `write` upserts per item in one transaction
 * (last-writer-wins per key, no duplicate rows, no torn batches) and stamps
 * `fetched_at`; `fetchedAt(kind)` is the newest stamp among the kind's rows
 * (null when the kind has no rows, so an unstamped kind is never treated as
 * fresh). An empty `write` writes nothing and stamps nothing (the engine's
 * no-stamp semantics).
 *
 * A database that cannot be opened (or configured: WAL, busy timeout,
 * schema) silently falls back to the session-scoped in-memory cache; the
 * factory never throws.
 */
export function createSqliteReferenceCache(options: SqliteReferenceCacheOptions): ReferenceCache {
  const { dbPath, baseUrl } = options;
  const now = options.now ?? Date.now;
  const busyTimeoutMs = Math.max(0, Math.floor(options.busyTimeoutMs ?? 500));

  let db: DatabaseSync;
  let upsert: ReturnType<DatabaseSync["prepare"]>;
  let readStmt: ReturnType<DatabaseSync["prepare"]>;
  let fetchedAtStmt: ReturnType<DatabaseSync["prepare"]>;
  try {
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
    db.exec(CREATE_TABLE_SQL);
    upsert = db.prepare(UPSERT_SQL);
    readStmt = db.prepare(READ_SQL);
    fetchedAtStmt = db.prepare(FETCHED_AT_SQL);
  } catch {
    // Unreadable path, corrupt file, locked database, or a Node build
    // without sqlite support: fall back to the session-scoped in-memory
    // cache. Never throw into the session.
    return createInMemoryReferenceCache(now);
  }

/** The engine-known fields stored as real columns; every other item field
 *  (the kind-specific extras: artifact kind and version, wiki space, path,
 *  and version, arbitrary future metadata) is serialized into the metadata
 *  JSON column, so the schema stays kind-agnostic without migrations. */
const METADATA_KEYS = ["kind", "id", "key", "title", "status"] as const;

/** Serialize an item's extras to the metadata JSON column. */
function itemMetadataJson(item: ReferenceItem): string {
  const extra: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(item)) {
    if (!METADATA_KEYS.includes(field as (typeof METADATA_KEYS)[number])) {
      extra[field] = value;
    }
  }
  return JSON.stringify(extra);
}

/** Parse a metadata JSON column back to the item's extras. A corrupt or
 *  non-object payload degrades to no extras (the row still loads). */
function parseItemMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

  const rowToEntry = (kind: string, row: ReferenceItemRow): CacheEntry => ({
    kind,
    id: row.id,
    key: row.item_key,
    title: row.title,
    ...(row.status !== null ? { status: row.status } : {}),
    ...parseItemMetadata(row.metadata),
    fetchedAt: row.fetched_at,
  });

  return {
    read(kind: string): CacheEntry[] {
      try {
        const rows = readStmt.all(baseUrl, kind) as ReferenceItemRow[];
        return rows.map((row) => rowToEntry(kind, row));
      } catch {
        // A read that cannot run (schema lost, db damaged) degrades to the
        // empty view; the provider defers exactly as on a cold cache.
        return [];
      }
    },
    write(kind: string, items: ReferenceItem[]): void {
      // Fire-and-forget side effect: empty writes write nothing and stamp
      // nothing, and any failure (lock held past the busy timeout, schema
      // lost, disk gone) is swallowed so nothing ever throws into the
      // session and getSuggestions is never blocked.
      if (items.length === 0) return;
      const ts = now();
      try {
        // IMMEDIATE takes the write lock up front (the busy timeout applies
        // here, not mid-batch), so a batch lands atomically: all rows or no
        // rows, never a torn half of a keystroke refresh.
        db.exec("BEGIN IMMEDIATE");
        for (const item of items) {
          upsert.run(baseUrl, kind, item.id, item.key, item.title, item.status ?? null, itemMetadataJson(item), ts);
        }
        db.exec("COMMIT");
      } catch {
        try {
          db.exec("ROLLBACK");
        } catch {
          // The transaction was never open (BEGIN itself failed); nothing
          // to roll back.
        }
      }
    },
    fetchedAt(kind: string): number | null {
      try {
        const row = fetchedAtStmt.get(baseUrl, kind) as { max_fetched_at: number | null } | undefined;
        return row?.max_fetched_at ?? null;
      } catch {
        return null;
      }
    },
  };
}
