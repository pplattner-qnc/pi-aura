---
kind: slice
slug: notif-window-fetch
title: "Code: since-last-run + older-unread notifications in fetch/render"
task: ../task.md
mode: hitl
status: ready
size: m
blocked_by: []
---

## End-to-end behavior

`fetch` reads `~/.pi/aura/last-digest.json` `fetched_at`, paginates
notifications newest→oldest, splits them into a "since last run" group
(everything newer than `fetched_at - 5min`, read + unread) and an "older
unread" pool (newest 20 at/older than the boundary, read dropped), and
writes both groups to `digest.json` `attention.notifications`. The
combined set feeds `extractVerifyTargets` and the `review_assigned`
filter so review signals are not lost. `renderAttention` renders two
lines. A 500-item hard cap bounds the worst case and surfaces a warning.

## Acceptance criteria

- `scripts/src/types.ts` exports `DigestNotifications` with
  `since_last_run: string[]` and `older_unread: string[]`, and
  `DigestAttention.notifications` is typed `DigestNotifications` (not
  `string[]`).
- `scripts/src/aura-digest.ts` adds the four constants
  (`NOTIF_PAGE_SIZE = 50`, `NOTIF_FETCH_CAP = 500`,
  `NOTIF_OLDER_FETCH = 20`, `NOTIF_BOUNDARY_MARGIN_MS = 5 * 60 * 1000`)
  near `WORKDAY_HOURS`.
- A `fetchNotifications(aura, lastFetchedAt)` helper (internal, not
  exported) returns `{ since: Notification[], older: Notification[] }`
  implementing the boundary + pagination logic from the arch spec:
  - `sinceBoundary = lastFetchedAt
      ? new Date(Date.parse(lastFetchedAt) - NOTIF_BOUNDARY_MARGIN_MS).toISOString()
      : null`.
  - Paginates `listNotifications({ sort_by: "created_at", sort_dir:
    "desc", page: p, limit: NOTIF_PAGE_SIZE })` newest→oldest.
  - Boundary set: collects all items while
    `item.created_at > sinceBoundary`; stops after the page that first
    contains an item with `created_at <= sinceBoundary`.
  - Collects at/older items into `older` until it reaches
    `NOTIF_OLDER_FETCH` items (regardless of read state), then stops.
  - First run (`sinceBoundary` null): `since` is empty; `older` is a
    single page of `NOTIF_OLDER_FETCH` newest items.
  - Hard cap: never fetch more than `NOTIF_FETCH_CAP` total; on hitting
    it, stop and push a human-readable warning into the caller's
    `warnings[]`.
- `fetchAction` calls `loadLastDigest()` to read `fetched_at` (null when
  no store), calls `fetchNotifications`, and uses the result in place of
  the old single `listNotifications` call. The `Promise.all` no longer
  includes `listNotifications` (pagination is sequential).
- `summarizeNotifications(items)` keeps its signature but **drops the
  internal `unread` filter and the `["No unread notifications."]`
  fallback** — it now formats whatever items it is given (empty input
  returns `[]`).
- `attention.notifications` is built as:
  ```ts
  {
    since_last_run: summarizeNotifications(sinceNotifs),
    older_unread: summarizeNotifications(olderNotifs.filter(n => !n.read)),
  }
  ```
- `extractVerifyTargets` and the `review_assigned` filter receive
  `allNotifs = [...sinceNotifs, ...olderNotifs]`.
- `raw.notifications` stores the full fetched set (the `NotificationList`
  shape is unchanged for the raw bundle — store `allNotifs` or the
  original pagination result; the raw bundle is for debugging).
- `renderAttention` renders two lines:
  - `- 📬 **Since last run:** <items or "Nothing new since last run.">`
  - `- 📬 **Older unread:** <items or "No unread notifications.">`
- `make typecheck` passes.
- `make build` passes and produces
  `skills/aura-digest/dist/aura-digest.mjs`.

## Test plan

- **Seams:** the pagination helper takes the Aura client as an argument,
  so a test can pass a fake client whose `listNotifications` returns
  scripted pages and assert the boundary split. (`node:test` is available
  but `scripts/` has no test runner wired — a small ad-hoc
  `node --test` file under `scripts/` is acceptable if it helps, but the
  gate is `make typecheck` + `make build`.)
- **Failure modes:**
  - `last-digest.json` missing → `loadLastDigest()` returns null →
    `sinceBoundary` null → `since` empty, `older` = newest 20.
  - `last-digest.json` present but unparseable → `loadLastDigest()`
    returns null (existing behavior) → same as missing.
  - A page returns zero items (end of list) → stop paginating.
  - Hard cap hit → stop, push warning into `warnings[]`, surface in
    `digest.warnings`.
- **Scenarios:**
  - Boundary in the middle of a page → that page's older items seed
    `older`; no extra fetch for `since`.
  - Boundary older than every notification → `since` gets everything
    fetched up to the cap; `older` stays empty (or gets the tail if the
    cap is not hit).
  - First run → `since` empty, `older` = newest 20 with read dropped.
  - All `since` items read → they still appear in `since_last_run` (read
    items included by design).
- **Edge cases:**
  - Malformed `created_at` → `Date.parse` returns `NaN`; treat as
    "older than boundary" (don't crash). Keep the comparison defensive.
  - Empty notification inbox → `since` and `older` both empty; both
    render their empty-state strings.
- **Regression:** `extractVerifyTargets` still sees review events from
  both groups; the `review_assigned` filter still finds assigned
  reviews older than the boundary.

## Constraints / dependencies

- None. This is the foundation slice.
- No change to `DigestDiff` / `diff` / `last` (out of scope).
- No `schema_version` bump (accept the persisted-shape break).
