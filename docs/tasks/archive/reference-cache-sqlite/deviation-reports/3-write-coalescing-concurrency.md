## Deviation report: 3-write-coalescing-concurrency

Scope reviewed: `git diff c4a2b4d9..HEAD` (3 commits, 2 files:
`extensions/aura-reference-cache.ts`,
`extensions/aura-reference-cache.test.ts`; no other file touched). Tests
run: `node --experimental-strip-types
extensions/aura-reference-cache.test.ts` passes (14 sections, run
repeatedly for stability: 8 consecutive full runs plus a dedicated
10-round 4-writer stress loop, all clean), `node --experimental-strip-types
extensions/aura-references.test.ts` passes (35 sections, unchanged), root
vitest 236 green, source typecheck clean. The pre-existing red
(`atlassian-provision.test.ts`) is unchanged and out of scope.

### API surface changes

- **Planned (arch spec, Exports + per-slice notes):** busy timeout
  configuration, coalescing semantics (last-writer-wins per key, no
  duplicate rows, no torn writes), swallowed timed-out writes, and the
  coalescing semantics documented in the task doc's implementation notes.
- **Actual:** no new exports. The busy timeout was already an option
  (`busyTimeoutMs`, default 500) from slice 1; this slice exercised,
  hardened, and documented it. One structural addition:

  1. **A bounded retry of the open sequence (`OPEN_ATTEMPTS` 5 with a
     linear 25 ms backoff, ~250 ms worst case).** The cross-process test
     exposed a real bug: SQLite does not invoke the busy handler for a
     `journal_mode` switch, so pi sessions racing the very FIRST creation
     of the shared file (no db, no WAL, no schema yet) saw `database is
     locked` from the WAL pragma and silently fell back to the in-memory
     cache, dropping every one of that session's writes. Without the
     retry, 4 simultaneously started sessions lost 2 to 3 writers' writes
     entirely (reproduced deterministically in a 5-round probe: only 50
     to 150 of 200 items landed). With the retry, 10 consecutive
     4-writer rounds land all 200 items every time. The open sequence
     also now sets `busy_timeout` BEFORE the WAL pragma, so the busy
     handler governs the schema creation that follows. The fallback
     after the retries remain exhausted is unchanged (in-memory for the
     session, never a throw).

### Abstraction usage

- Used/was specified: **yes.** `node:sqlite` only (no new dependency;
  `package.json` untouched: verified by `git diff c4a2b4d9..HEAD --stat`),
  the same store factory and options from slice 1, no engine changes at
  all (`aura-references.ts` is untouched by this slice's diff).

### Out-of-scope changes

- None. The retry lives entirely inside the store's construction path.

### Divergence from the slice doc's acceptance criteria

None, with one test-plan adaptation. The criteria are met: a busy timeout
is configured and concurrent writers land without `SQLITE_BUSY` errors
escaping the store's API (the cross-process section spawns four real
Node children, each opening the actual store module on the shared file;
all exit 0 and all 200 items land); parallel writes of overlapping keys
are last-writer-wins per key with no torn or duplicate rows (the
same-process interleaved section: 100 rounds over one shared key from two
stores end with exactly one row holding the last writer's value, plus the
cross-process same-key race: two children x 100 writes of one key end
with one row whose value is one of the written ones); after concurrent
writes, reopening shows an intact, queryable state (a fresh store open
after the children exit, plus `PRAGMA integrity_check` = ok and
`journal_mode` = wal on a raw connection); a write that times out is
swallowed (the busy-timeout section holds `BEGIN IMMEDIATE` on an
adversary connection: the blocked write waits out its busy timeout,
lands nothing, and throws nothing; once the lock is released the next
write lands; the default 500 ms timeout is pinned by elapsed-time bounds,
not exact values); `getSuggestions` is never blocked by a cache write
(reads under WAL never wait for a writer, pinned with a sub-100 ms bound,
and writes ride the fire-and-forget refresh path, unchanged since slice
2 of reference-engine-core). The coalescing semantics are documented in
the task doc's implementation notes (below). Test-plan adaptation:
"write to a db removed mid-session (swallowed)" is covered by slice 1's
dropped-schema test (the same failure class: the write cannot run); an
actually unlinked file keeps accepting writes through the surviving
descriptor on Linux and so cannot deterministically produce a write
failure. "A long transaction held open" maps to the adversary's
`BEGIN IMMEDIATE` hold. "WAL checkpointing under load" is covered by the
post-race reopen plus the integrity check rather than an explicit
checkpoint invocation: the children's process exit is the natural
checkpoint-under-load moment. Constraints hold: the query path is never
blocked by design (sync writes live on the background refresh path, and
the only sync waits are the bounded busy timeout and the rare bounded
open retry), no runtime dependency beyond `node:sqlite`, no em-dashes,
repo test style.

### Task doc update needed?

Yes. Append to `## Implementation notes` under a slice 3 heading: the
coalescing semantics (what a per-keystroke refresh actually writes), the
busy timeout default and its meaning, the concurrent-first-open retry,
and the read isolation under WAL.

### User attention needed?

No. The open-retry hardening is squarely within the slice's goal
("multiple pi sessions race per-keystroke refresh writes into the same
WAL database file without corruption, hangs, or errors escaping into any
session"); the bug it fixes was found by this slice's own test plan.
