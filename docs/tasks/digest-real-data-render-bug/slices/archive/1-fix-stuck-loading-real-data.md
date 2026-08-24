---
kind: slice
slug: fix-stuck-loading-real-data
title: Reproduce and fix the stuck-on-Loading real-data bug
task: ../task.md
mode: afk
status: done
size: m
blocked_by: []
---

## The tight command that goes red on the unfixed bug

A vitest that mounts `Digest.svelte` with a **realistic large digest fixture**
(the current tests use small fixtures that don't trigger the race) + awaits
`loading === false` within a timeout. On the unfixed bug, `loading` stays
`true` → the assertion times out (red).

```ts
// test/digest-dashboard/real-data-load.test.ts (new)
import { mount } from "svelte";
import Digest from "../../.pi/extensions/digest-dashboard/Digest.svelte";
// fixture: 3 actions, 9 queue rows, 2 reviews, 9 dev_links, 6 older_unread, 1 warning
// (mirror the real ~/.pi/aura/digest.json shape — see the bug doc's reproduction)
const realisticDigest = { /* ...full real-shape fixture... */ };

it("renders a realistic large digest (loading flips to false)", async () => {
  // mock fetch('/api/digest') → realisticDigest; fetch('/api/state') → {ok:true}
  const target = document.getElementById("app")!;
  mount(Digest, { target });
  // await loading === false (with a timeout) — RED on the unfixed bug
  await waitFor(() => expect(document.querySelector(".digest")).toBeTruthy(), { timeout: 2000 });
});
```

## Regression-test plan

- **Red first:** write the test above against the current `main` (with the
  `started`-guard). If it goes red → the guard is insufficient + the fix is
  needed. If it goes green → the guard works for the simulated timing, but
  the real-browser e2e is still owed (see below).
- **Then fix** (if red): apply the real fix (confirm root cause first — don't
  guess). Candidates: `await tick()` after `digest = data`; a single `$effect`
  with explicit SSE cleanup; move the load out of the racing `$effect`.
- **Green:** the test passes; the 42 existing tests stay green; the fixture
  test still passes.
- **Real-browser e2e (the owed confirmation):** `aura-digest.mjs fetch` (real
  data) → `server.mjs` → open in a browser → confirm `.digest` renders (not
  stuck). This is the verification the `started`-guard never had. NOTE: the
  agent's bash harness may kill background servers across tool calls — if so,
  run the server in the foreground within a single bash call that also does
  the `browser_open`-equivalent, OR use a persistent terminal / `tmux` /
  `nohup setsid` workaround. The e2e is required, not optional.

## Failure modes and edge cases

- The race may be timing-dependent → the test must use a realistic fetch
  delay (mock fetch with a small `await new Promise(r => setTimeout(r, 50))`
  to simulate the 7KB read), not an instant resolve.
- The `EventSource` mock: the test must mock `/events` (or the real
  EventSource will connect + the SSE `$effect` re-fires). Use a fake
  EventSource in the test harness.
- If the root cause is NOT the `$effect` race (e.g. a template throw on a
  real-data field the fixture lacks), the fix boundary moves — record the
  actual root cause in the slice result.

## Expected fix boundary

`Digest.svelte` only (the initial-load `$effect` + possibly the SSE `$effect`).
No server/listener/state.ts/index.ts changes. No new deps. The fix is small
(<20 lines) once the root cause is confirmed.
