---
kind: bug
slug: digest-dashboard-stuck-loading-real-data
title: Digest dashboard stuck on "Loading…" with real Aura data (unverified fix on main)
map: aura-digest-slash-launch
status: fixed
fix_commit: cece11dba8b073dc835b613d0a7ef1703c5154fa
---

## Root cause

The real `~/.pi/aura/digest.json` contains a **duplicate task key** in
`attention.waiting_on_others` (`AURA-742` appears twice). `Digest.svelte`
rendered those lists with Svelte 5 keyed `{#each … (item.key)}` blocks, which
throw `each_key_duplicate` on duplicate keys. The throw aborted the render
update so `.digest` never appeared and `loading` never flipped to `false`.
The small `live/digest.json` fixture had no duplicate keys, so it rendered
fine and masked the bug. The `started`-guard fix on main (commit `e6b42fe`)
targeted a suspected `$effect`/SSE race — the wrong cause.

## Fix summary

Switched the three read-only attention-list `{#each}` blocks in
`Digest.svelte` from `(item.key)` to index-based keys `(i)` (overdue,
waiting_on_you, waiting_on_others — 6 lines). These lists need no identity
reconciliation. Other keyed blocks (queue, reviews, reviews_owed,
corrections) were left keyed since those feeds aren't the duplicate-key
source. Added `test/digest-dashboard/real-data-load.test.ts` with a
realistic large fixture (including the duplicate `AURA-742`) + a 50ms fetch
delay; confirmed via a real-browser e2e against real data. Full suite: 43
tests green.

## Observed behavior

The interactive digest dashboard (`Digest.svelte`) renders fine with the
small `live/digest.json` fixture, but gets **stuck on "Loading digest…"**
when served **real Aura data** (a fresh `~/.pi/aura/digest.json` written by
`aura-digest.mjs fetch`). The page mounts (the "Loading digest…" `<p>`
appears), `/api/digest` returns 200 with valid JSON (verified via
`browser_eval` fetch from the page), and the component's `loadDigest` +
derived computations all execute without throwing (verified by reproducing
each derivation in the page console) — but `loading` never flips to `false`
and `digest` never renders.

## Expected behavior

The dashboard renders the real Aura digest (sections + action buttons) after
`/digest-dashboard start` + a real `fetch`, exactly as it renders the fixture.

## Reproduction

```
# 1. fetch real data (needs Aura PAT in keyring + aura.baseUrl in settings)
node skills/core/aura-digest/dist/aura-digest.mjs fetch
# → writes ~/.pi/aura/digest.json (real data: 3 actions, 9 queue, 2 reviews, 9 dev_links, 6 older_unread, 1 warning)

# 2. start the dashboard server
PI_DIGEST_NO_BROWSER=1 node .pi/extensions/digest-dashboard/dist/server.mjs &
# → writes ~/.pi/aura/server-url.json

# 3. open the URL in a browser → page stuck on "Loading digest…"
# (curl http://<url>/api/digest returns 200 + valid JSON; the fixture renders fine)
```

Reproduced during the post-finalization e2e (2026-08-24): fixture → `digest:
true, loading: false` (renders); real data → `loading: true, digest: false`
(stuck). All single-field substitution tests (real queue / real reviews / real
actions / real notifications) rendered fine; only the **full** real digest
stuck — so it's a combination/timing issue, not a single field.

## Scope boundaries

- **In:** `Digest.svelte`'s initial-load + `$effect` reactivity. The server,
  listener, `state.json`, teardown are NOT in scope (they work).
- **Out:** the slash-launch / tool-ification rewrite (separate feature task,
  blocked-by this bug). The Impeccable visual polish (keep it; just fix the
  load).

## Acceptance criteria

- The dashboard renders **real** Aura data after `/digest-dashboard start` +
  a real `fetch` (confirmed in a real browser, not just unit tests).
- The fixture still renders (no regression).
- The 42 vitest tests stay green; add a regression test that exercises the
  real-data load path (a vitest that mounts with a realistic large digest +
  awaits `loading === false` — the current tests use small fixtures that
  don't trigger the race).
- The fix's root cause is identified (the `started`-guard hypothesis confirmed
  OR a different cause found + fixed).

## Notes

- Commit `e6b42fe` on main added a `started`-guard `$effect` as a fix, but it
  was **never confirmed against real data** — the verification was blocked by
  the agent's bash harness killing background servers across tool calls. So
  the fix is *unverified*: it targets the suspected Svelte 5 `$effect`
  double-invocation race, but the real-data e2e is still owed.
- Suspected cause: Svelte 5 `$effect(() => { loadDigest(); })` double-
  invocation (strict-mode) + the `EventSource` `$effect`'s `onmessage →
  loadDigest()` racing the initial fetch. For the small fixture the first
  load wins; for the larger/slower real fetch the race leaves `loading` true.
- If the `started`-guard is insufficient, candidate fixes: `await tick()`
  after `digest = data`; move the assignment out of the async callback; a
  single `$effect` with explicit SSE teardown; or an `onMount`-equivalent
  pattern Svelte 5 supports.
