---
kind: task
type: bug
slug: digest-real-data-render-bug
title: Fix the digest dashboard stuck-on-Loading bug with real Aura data
map: aura-digest-slash-launch
status: done
bug: digest-dashboard-stuck-loading-real-data
slices: [fix-stuck-loading-real-data]
---

## Observed behavior

The dashboard (`Digest.svelte`) renders the small fixture but is stuck on
"Loading digest…" with real Aura data. See
`docs/bugs/digest-dashboard-stuck-loading-real-data.md` for the full
reproduction + evidence.

## Expected behavior

The dashboard renders real Aura data after `/digest-dashboard start` + a real
`fetch`, like it renders the fixture.

## Reproduction

```bash
node skills/core/aura-digest/dist/aura-digest.mjs fetch   # real data → ~/.pi/aura/digest.json
PI_DIGEST_NO_BROWSER=1 node .pi/extensions/digest-dashboard/dist/server.mjs &
# open the URL → stuck on "Loading digest…"
```

## Scope boundaries

- **In:** `Digest.svelte` initial-load + `$effect` reactivity.
- **Out:** the slash-launch/tool-ification rewrite (separate feature task).
  The server/listener/state.json/teardown (they work). The visual polish.

## Acceptance criteria

- Real Aura data renders in a real browser after start + fetch (the owed e2e).
- Fixture still renders (no regression).
- 42 vitest tests stay green; a new regression test mounts with a realistic
  large digest + awaits `loading === false` (the current small-fixture tests
  don't trigger the race).
- Root cause identified (the `started`-guard hypothesis confirmed OR a
  different cause found + fixed).

## Implementation notes

### Slice: fix-stuck-loading-real-data

**Actual root cause** (diverges from the slice doc's `$effect`/SSE race hypothesis):
The real `~/.pi/aura/digest.json` contains duplicate task keys in
`attention.waiting_on_others` (e.g. `AURA-742` appears twice). `Digest.svelte`
rendered those lists with keyed `{#each … (item.key)}` blocks. Svelte 5 throws
`each_key_duplicate` on duplicate keys, aborting the render update so `.digest`
never appears and the loading spinner stays visible. The small fixture had no
duplicates, so it rendered fine.

**Fix:** Changed the three attention-list `{#each}` blocks in `Digest.svelte`
from `(item.key)` to index-based keys `(i)`. The attention lists are read-only
renderings and do not need stable identity-based reconciliation. Other keyed
blocks (`queue`, `reviews`, `reviews_owed`, `corrections`) were left keyed since
those data feeds aren't the duplicate-key source.

**Production bundle** rebuilt (`npm run build`) so `dist/app.js` reflects the fix.

**Test:** Added `test/digest-dashboard/real-data-load.test.ts` — mounts
`Digest.svelte` with a realistic large fixture (3 actions, 9 queue rows, 2
reviews, 9 `dev_links`, 6 `older_unread`, 1 warning) containing a duplicate
`AURA-742` in `waiting_on_others`, mocks `fetch` with a 50ms delay. Asserts
`.digest` renders and `.loading` disappears within 2s. Test was RED before the
fix, GREEN after. Full suite: 43 tests across 7 files, all green.

**Real-browser e2e:** Confirmed via a headless Chromium + CDP harness against
the actual `~/.pi/aura/digest.json` — the real digest rendered successfully.
