---
kind: slice
slug: 1-sqlite-store-wiring
title: "sqlite store behind the cache interface, wired into production"
task: ../task.md
mode: afk
status: todo
size: l
blocked_by: []
---

## End-to-end behavior

The engine's production cache becomes a persistent sqlite store:
`node:sqlite` (`DatabaseSync`) at `~/.pi/agent/aura-reference-cache.db`
with WAL journal mode, shared by all pi sessions as a plain file, one
table of referenceable items keyed by `(base_url, kind, id)` with
`title`, a metadata JSON column, and `fetched_at`. The store implements
the as-built cache interface (`read(kind)` / `write` / `fetchedAt`
stamping). A db that cannot be opened silently falls back to the
in-memory cache for that session (never throw into the session). Demo:
warm one pi session (suggestions appear), close it, open a fresh one,
and the suggestions are instant on the first keystroke, before any
fetch lands.

## Acceptance criteria

- [ ] The store uses `node:sqlite` `DatabaseSync` with WAL journal mode; the db path is injectable (default `~/.pi/agent/aura-reference-cache.db`).
- [ ] One table keyed `(base_url, kind, id)` with `title`, metadata JSON, and `fetched_at`; the base URL comes from the Aura settings so multi-instance setups never cross-contaminate.
- [ ] The store implements the as-built cache interface; the in-memory implementation remains the unit-test fake.
- [ ] Production wiring swaps to the sqlite store; autocomplete behavior is unchanged except that it now persists across sessions.
- [ ] An unopenable db (bad path, corrupt file) falls back to the in-memory cache silently; nothing throws into the session.
- [ ] Focused tests against a temp-file db: write/read roundtrip, reopen persistence, WAL mode verified, base-URL keying isolation.
- [ ] No runtime dependency added: `node:sqlite` only.

## Test plan

Seams: the real store against a temp-file db (repo test style: pure
exported functions, `node --experimental-strip-types` + `node:assert`).

Failure modes: unopenable db path (silent in-memory fallback); write to
a closed/removed db file (swallowed); read from an empty db (empty, no
throw).

Scenarios: write items for two kinds, read each kind back; close and
reopen the store (persistence); two stores with different base URLs on
the same file (no cross-contamination); `journal_mode` pragma returns
`wal`.

Edge cases: item with unicode title; very long title; duplicate write of
the same key (upsert, no duplicate rows); metadata JSON roundtrip
 fidelity for nested values.

## Constraints

- The dynamic-import seam convention: the store module must stay
  unit-testable under `node --experimental-strip-types`.
- No em-dashes in prose.
