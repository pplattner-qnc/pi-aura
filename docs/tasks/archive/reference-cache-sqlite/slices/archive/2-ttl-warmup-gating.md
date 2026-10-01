---
kind: slice
slug: 2-ttl-warmup-gating
title: "TTL from settings, gating the session-start warmup"
task: ../task.md
mode: afk
status: done
size: m
legacy_blocked_by: [1-sqlite-store-wiring]
---

## End-to-end behavior

The TTL comes from `aura.references.cacheTtlMs` in
`~/.pi/agent/settings.json` with a project `.pi/settings.json` override
(the project value wins when present), defaulting to a value on the
order of hours. The TTL gates the session-start warmup only: while the
persisted cache is within TTL and non-empty, the warmup fetch is
skipped entirely (instant session start); expired or empty caches
trigger the warmup fetch. Reads always serve entries instantly,
regardless of expiry (stale-while-revalidate). The per-query background
refresh is unchanged and stays always-on (a recently renamed title
still corrects itself within a keystroke). Demo: with a tiny TTL, a
fresh session fires the warmup fetch; with a fresh cache inside the
TTL, the warmup is skipped and suggestions appear instantly.

## Acceptance criteria

- [ ] `aura.references.cacheTtlMs` read from global settings with project override precedence; missing or malformed settings fall back to the default without throwing.
- [ ] The default TTL is on the order of hours (exact value decided in implementation and recorded in the task doc's implementation notes).
- [ ] The warmup gate is a pure decision function (items, `fetchedAt`, ttl, now, injectable clock): within TTL and non-empty skips the fetch; expired or empty fetches.
- [ ] Expired entries are still served instantly by reads.
- [ ] The per-query background refresh behavior is unchanged (always-on, abort-guarded, write-through).
- [ ] Unit tests cover the gate function (injected clock) and the settings loader (injectable paths, malformed file fallback).

## Test plan

Seams: the warmup-gate decision function (injected clock); the TTL
settings loader (injectable paths).

Failure modes: missing settings file (default TTL); unparseable JSON
(default TTL); missing `aura.references` block (default TTL); negative
or zero TTL (treat as always-expired, not as skip-everything).

Scenarios: fresh cache within TTL (skip); cache expired by one
millisecond (fetch); empty cache (fetch); project override beats global;
TTL boundary is inclusive/exclusive as documented in the code.

Edge cases: cache with items but no `fetched_at` stamps (treat as
expired, never fresh-by-omission, per the arch spec contract); TTL
changing between sessions.

## Constraints

- Do not touch `refreshReferenceKind`, the provider, or the `canRefresh`
  gate: only the warmup path and the settings loader change.
- No em-dashes in prose.
