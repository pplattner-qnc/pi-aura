---
kind: slice
slug: 1-task-autocomplete-warm-cache
title: "#task: autocomplete from a warmed session cache"
task: ../task.md
mode: afk
status: done
size: l
blocked_by: []
---

## End-to-end behavior

A new pi extension (working name `aura-references`) ships the shared
reference engine with the task kind as its first adapter. At session
start the engine registers an autocomplete provider on `#` and kicks off
a fire-and-forget task warmup (`listTasks` pagination) into a
session-scoped in-memory cache behind the small cache interface. Typing
`#task:` (or `#task:AUR`, `#task:login` at a token boundary) instantly
offers matching tasks: key-number prefix or title substring,
case-insensitive. Selecting one inserts `#task:AURA-42`. Tokens that are
not reference tokens (a `#` heading, a mid-word `#`, code) defer to the
built-in provider. Without Aura credentials, warmup and suggestions
silently no-op (defer). Legacy `@AURA-` behavior is untouched:
`aura-tasks.ts` still owns it in parallel.

## Acceptance criteria

- [ ] `#task:` extraction happens at token boundaries only (start of line or after whitespace); non-reference `#` tokens defer to the built-in provider; `shouldTriggerFileCompletion` defers likewise.
- [ ] Warmup starts at `session_start` (fire-and-forget) and populates the in-memory cache via `listTasks` pagination.
- [ ] Local filtering matches key prefix and title substring, case-insensitively; results are capped at a max-suggestions bound.
- [ ] Selecting a suggestion inserts `#task:AURA-42` (canonical key casing).
- [ ] Missing credentials: warmup no-ops, the provider defers, nothing throws into the session.
- [ ] The engine is registry-driven: kind prefixes, adapters, and the (dormant) alias table are data that extraction and filtering dispatch through; a second kind would be a new adapter plus a registration, not engine surgery.
- [ ] The extension is registered in the package manifest.
- [ ] Pure seams unit-tested: extraction + deferral, filtering, in-memory cache.

## Test plan

Seams: token extraction + deferral (pure); autocomplete filtering (pure);
the in-memory cache.

Failure modes: no credentials (defer, no throw); empty cache (defer);
warmup aborted mid-flight (no throw into the session); credentials
appear later in the session (warmup already no-oped; provider keeps
deferring, no crash).

Scenarios: `#task:` with empty partial shows the head of the cache;
`#task:42` matches by number prefix; `#task:login` matches by title
substring; `#TASK:` matches case-insensitively; `# task` (space between)
is not a token; `foo#task:` mid-word is not a token; `#heading` and
`#rule:` defer (rule is not yet a registered kind); a zero-match partial
defers to the built-in provider.

Edge cases: task with empty title; unicode title substring matching;
cache entry whose key has nonstandard casing (match, insert canonical).

## Constraints

- Dependency-free beyond the pi peer dep; no sqlite in this ticket (the
  in-memory cache is the only implementation).
- The dynamic-import seam for `@pi-aura/shared/aura-client` must be
  preserved.
- No em-dashes in prose.
- Tests are pure exported functions run with
  `node --experimental-strip-types` + `node:assert`.
