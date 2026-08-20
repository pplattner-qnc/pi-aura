---
kind: task
type: feature
slug: digest-notif-window
title: "aura-digest: since-last-run + older-unread notifications, drop auto mark-read"
status: ready
size: m
slices:
- notif-window-fetch
- skill-drop-markread
---

## User-visible outcome

The aura-digest morning routine surfaces notifications in two groups:

1. **Since last run** — every notification (read *and* unread) that arrived
   after the previous digest's `fetched_at` (minus a small safety margin).
   This is "what happened while you were away", not just what still needs a
   click.
2. **Older unread** — the still-unread notifications from before that
   boundary, capped to a small set so the digest stays readable.

The skill no longer marks notifications as read automatically. Listing does
not mutate read state today (only `markAllNotificationsRead` /
`markNotificationRead` do), so this is purely a change to the SKILL.md
orchestration step.

## User story

As the digest consumer, I want the notification section to reflect
everything that landed since I last pulled a digest (regardless of whether
I've already clicked through it elsewhere), plus a bounded reminder of older
unread items — and I never want the digest itself to silently mark things
read on my behalf.

## Motivation

Two problems with the current behavior, identified during investigation:

1. **Auto mark-read is surprising.** SKILL.md Step 4 instructs the
   orchestrator to call `aura-mcp-dev_markAllNotificationsRead()` after
   presenting. The user does not want the digest to mutate read state
   automatically.
2. **Fixed window, no use of last-run timestamp.** `fetch` currently calls
   `listNotifications({ limit: 20, sort_by: "created_at", sort_dir: "desc" })`
   and then `summarizeNotifications` keeps only unread items. That is a
   20-most-recent-unread window that ignores the `fetched_at` timestamp we
   already persist in `~/.pi/aura/last-digest.json`. If the digest hasn't
   run in a while, or a burst of notifications arrived, items can fall
   outside the 20-item window and never appear.

## Investigation findings (already done — bake into implementation)

### API constraint (important)

`listNotifications` (see `scripts/src/generated/types.gen.ts`,
`ListNotificationsData`) accepts only:
- `page` (1-based)
- `limit`
- `sort_by` (`NotificationSortField` = `'created_at'` only)
- `sort_dir`

There is **no server-side `read` filter** and **no `since` / `created_after`
filter**. So "all notifications since last run" cannot be a single filtered
call — it must be **client-side pagination newest→oldest until the
`created_at` of the returned items crosses the boundary**, with a hard cap
to bound the worst case.

### Notification shape

`AuraNotification` (`scripts/src/types.ts`) carries:
- `id: string`
- `type: string`
- `read: boolean`
- `created_at: string` (ISO)

…so all filtering (by read state and by timestamp) is doable client-side.

### Last-digest store

`~/.pi/aura/last-digest.json` is a `LastDigestStore`
(`scripts/src/types.ts`) with:
- `presented_at` — when the last digest was shown (set by `save`)
- `fetched_at` — when the data was fetched (mirrors
  `digest.meta.generated_at`)

`fetched_at` is the correct "since I last pulled" boundary (not
`presented_at`, which is slightly later and could miss notifications that
arrived between fetch and present).

`loadLastDigest()` already exists in `aura-digest.ts` (used by `diff` /
`last`). `fetch` currently does **not** read the store — this task adds
that read.

### Consumers of the notifications list (must stay consistent)

Grepping `scripts/src` for `notifications` (excluding `generated/`), the
notification list is used in four places inside `fetchAction`:

1. `summarizeNotifications(notifications.items ?? [])` →
   `attention.notifications` (the rendered strings). **This is the primary
   change.**
2. `extractVerifyTargets(notifications.items ?? [], …)` — pulls
   `artifact.review_*` events into `artifactsToVerify` +
   `notification_review_events` (in `report.json`). Operates on **all** passed
   notifications; does not filter by read. **Must receive the combined
   list** (since-last-run ∪ older) so review signals aren't missed.
3. The `artifact.review_assigned` filter for "reviews I owe":
   `const assignedNotif = (notifications.items ?? []).filter(n => n.type ===
   "artifact.review_assigned")`. **Must receive the combined list** for the
   same reason.
4. `raw.notifications` in `raw.json` (the raw API bundle). Keep storing the
   full fetched set.

`renderAttention` (`aura-digest.ts`) renders
`d.attention.notifications` as a single flat list. **This needs to render
two groups.**

### Type contract

`DigestAttention.notifications` is currently `string[]`
(`scripts/src/types.ts`). This task changes it to a structured object.

`digest.json` is a versioned contract passed fetch → orchestrator → render
and persisted in `last-digest.json`. Changing the `notifications` field
shape is a breaking change to that contract. `digest.meta` has no
`schema_version` today (only `LastDigestStore` has `schema_version`).
Mitigations to consider during implementation:
- Bump / introduce a `schema_version` on `Digest` and/or `DigestAttention`,
  OR
- Make `render` + `diff` defensive against both the old `string[]` and new
  object shape, OR
- Accept the break (this is a single-user morning routine; the old store
  is simply overwritten on the next `save`). **Recommendation: accept the
  break** — `diff` doesn't currently diff notifications (it diffs queue,
  reviews, corrections, overdue, capacity), and the store is regenerated
  every run. Keep it simple.

### Build pipeline

Sources live in `scripts/src/`; `make` (repo-root `Makefile`) runs
`typecheck` + esbuild bundle into `skills/aura-digest/dist/aura-digest.mjs`
(the compiled `.mjs` is committed). Run `make` (or `make build`) after
editing `scripts/src/`. `make typecheck` catches the type changes.

## Scope boundaries

**In scope:**
- `scripts/src/types.ts` — change `DigestAttention.notifications` shape.
- `scripts/src/aura-digest.ts` — read `fetched_at` from the last-digest
  store in `fetchAction`; add a paginated notification fetch helper; split
  `summarizeNotifications` output into the two groups; feed the combined
  list into `extractVerifyTargets` and the `review_assigned` filter;
  update `renderAttention` to render both groups.
- `skills/aura-digest/SKILL.md` — remove the
  `aura-mcp-dev_markAllNotificationsRead()` line from Step 4 (and any
  wording implying notifications are auto-cleared).

**Out of scope:**
- Adding a notification delta to `DigestDiff` / the `diff` subcommand.
  The "since last run" group *is* the delta by construction; `diff` doesn't
  need to recompute it. (Can be revisited later.)
- Any change to `listTasks`, `getBoardSummary`, capacity, or dev-links.
- Bumping `LastDigestStore.schema_version` (the persisted digest shape
  changes, but the store is regenerated each run — accept the break).

## Implementation plan

### 1. Types (`scripts/src/types.ts`)

Change:

```ts
export interface DigestAttention {
  overdue: DigestAttentionItem[];
  waiting_on_you: DigestAttentionItem[];
  waiting_on_others: DigestAttentionItem[];
  notifications: string[]; // human-readable notification summaries
}
```

to:

```ts
export interface DigestNotifications {
  /** Notifications that arrived since the last digest's `fetched_at` (minus a
   * small safety margin so nothing at the exact fetch instant slips through).
   * Includes both read and unread — "what happened while you were away", not
   * just what still needs a click. Bounded by a hard fetch cap. */
  since_last_run: string[];
  /** Unread notifications older than the since-last-run boundary. Computed by
   * fetching the newest N notifications at/older than the boundary (regardless
   * of read state) and dropping the read ones — so this surfaces only items
   * that still need attention. N is a small cap, not an unread count. */
  older_unread: string[];
}

export interface DigestAttention {
  overdue: DigestAttentionItem[];
  waiting_on_you: DigestAttentionItem[];
  waiting_on_others: DigestAttentionItem[];
  notifications: DigestNotifications;
}
```

### 2. Constants (`scripts/src/aura-digest.ts`, near `WORKDAY_HOURS`)

```ts
const NOTIF_PAGE_SIZE = 50;
const NOTIF_FETCH_CAP = 500;        // hard safety cap; ~10 pages
const NOTIF_OLDER_FETCH = 20;       // newest N older-than-boundary, then drop read
const NOTIF_BOUNDARY_MARGIN_MS = 5 * 60 * 1000;  // fetched_at - 5min
```

(Decisions confirmed with the user: 5-min margin; 20 older items regardless
of read state then filter read; 500 hard cap.)

### 3. Paginated fetch helper (`scripts/src/aura-digest.ts`)

Add a helper that, given the Aura client and an optional `sinceBoundary`
(ISO string or null for first run), returns `{ since: AuraNotification[],
older: AuraNotification[] }`:

- Compute `sinceBoundary = lastFetchedAt ? new Date(Date.parse(lastFetchedAt)
  - NOTIF_BOUNDARY_MARGIN_MS).toISOString() : null`.
- Paginate `listNotifications({ sort_by: "created_at", sort_dir: "desc",
  page: p, limit: NOTIF_PAGE_SIZE })` newest→oldest.
- **If `sinceBoundary` is set:** collect *all* items (read + unread) while
  `item.created_at > sinceBoundary`, page by page, until a page contains an
  item with `created_at <= sinceBoundary` (stop after that page — don't
  fetch further pages for the "since" group). Collect the at/older items
  from that boundary-crossing page plus subsequent paging into the "older"
  pool until it reaches `NOTIF_OLDER_FETCH` items (regardless of read
  state), then stop.
- **If `sinceBoundary` is null (first run):** no "since" group; fetch a
  single page of `NOTIF_OLDER_FETCH` newest items as the "older" pool.
- **Hard cap:** never fetch more than `NOTIF_FETCH_CAP` total notifications
  across both groups; if hit, stop and log a warning (push to the existing
  `warnings: string[]` array so it surfaces in the digest).

Replace the current single `listNotifications` call inside the
`Promise.all` in `fetchAction` with this helper's result.

### 4. Summaries (`scripts/src/aura-digest.ts`)

Refactor `summarizeNotifications(items: AuraNotification[]): string[]` —
keep it as the per-item string formatter (it already does the
`date — type by actor: target vN (decision)` formatting). The unread
filter it currently applies moves *out* to the caller, because the
"since last run" group must include read items.

Then build:

```ts
const notifSummaries: DigestNotifications = {
  since_last_run: summarizeNotifications(sinceNotifs),        // all, incl. read
  older_unread: summarizeNotifications(olderNotifs.filter(n => !n.read)),
};
```

(Empty-array rendering: keep the current "No unread notifications."
fallback for `older_unread`, and use e.g. "Nothing new since last run."
for an empty `since_last_run`.)

### 5. Keep review-signal consumers on the combined list

```ts
const allNotifs = [...sinceNotifs, ...olderNotifs];
// extractVerifyTargets:
extractVerifyTargets(allNotifs, pendingReviews.items ?? [], waitingOnOthersLinks);
// reviews I owe:
const assignedNotif = allNotifs.filter(n => safeString(n.type) === "artifact.review_assigned");
```

`raw.notifications` should store the full `allNotifs` set (or a
`{ since_last_run, older_unread }` split — implementer's choice; the raw
bundle is for debugging).

### 6. Render (`scripts/src/aura-digest.ts`, `renderAttention`)

Replace the single `- 📬 ...` line with two lines, e.g.:

```
- 📬 **Since last run:** <items or "Nothing new since last run.">
- 📬 **Older unread:** <items or "No unread notifications.">
```

### 7. SKILL.md (`skills/aura-digest/SKILL.md`, Step 4)

Delete the bullet:

> - Mark notifications read via MCP: `aura-mcp-dev_markAllNotificationsRead()`

Leave the `save` + `cleanup` steps intact. Optionally add a one-line note
that the digest does **not** mark notifications read, so the behavior is
documented.

### 8. Build + verify

```bash
make typecheck   # catches the type change
make build       # bundles to skills/aura-digest/dist/aura-digest.mjs
```

Then a manual smoke test: `node skills/aura-digest/dist/aura-digest.mjs
fetch` and inspect `$OUT/digest.json` (`attention.notifications` should
have the new shape) and the rendered markdown.

## Acceptance criteria

- [ ] `digest.json` `attention.notifications` is an object with
      `since_last_run: string[]` and `older_unread: string[]`.
- [ ] On a run with a prior `last-digest.json`, `since_last_run` contains
      notifications newer than `fetched_at - 5min` (read ones included).
- [ ] On the first run (no store), `since_last_run` is empty and
      `older_unread` reflects the newest 20 with read dropped.
- [ ] `extractVerifyTargets` and the `review_assigned` filter see the
      combined notification set (review signals not lost).
- [ ] `render` output shows both groups with sensible empty-state text.
- [ ] SKILL.md no longer instructs marking notifications read.
- [ ] `make typecheck` + `make build` pass.
- [ ] Hard cap (500) is respected; over-cap produces a `warnings[]` entry.

## Implementation notes

### Slice: notif-window-fetch (landed)

- Implemented the since-last-run + older-unread notification window in
  `scripts/src/types.ts` and `scripts/src/aura-digest.ts`, with the rebuilt
  bundle in `skills/aura-digest/dist/aura-digest.mjs`.
- Added exported `DigestNotifications { since_last_run: string[];
  older_unread: string[] }`; changed `DigestAttention.notifications` to this
  structured type.
- Added `fetchNotifications(aura, lastFetchedAt, warnings)` internal helper
  with boundary logic, pagination, first-run behavior, 500-item hard cap,
  and defensive NaN `created_at` handling.
- `fetchAction` reads `loadLastDigest()?.fetched_at`, splits notifications
  into since/older groups, feeds the combined list into
  `extractVerifyTargets` and the `review_assigned` filter, and stores the
  full set in `raw.notifications`.
- `summarizeNotifications` no longer filters unread or emits a fallback
  string; `renderAttention` renders two lines with empty-state text.
- **Minor deviation (spec-endorsed):** the internal `fetchNotifications`
  helper takes a third `warnings: string[]` param (pushes the over-cap
  warning directly into the caller's array) — the arch spec explicitly
  allowed this.
- Verification: `npm run typecheck` + `npm run build` passed in
  `scripts/`; `packages/shared` typecheck + tests (4/4) passed.
- `ui-noter` returned "no_ui_work".
- `scripts/` has no test runner wired; correctness verified by typecheck +
  build + manual smoke tests, per the slice doc's test plan.
- SKILL.md changes are **not** part of this slice — they are the separate
  `skill-drop-markread` slice (slice 2).

### Slice: skill-drop-markread (landed)

- Documentation-only slice. `skills/aura-digest/SKILL.md` Step 4 no longer
  instructs the orchestrator to call `aura-mcp-dev_markAllNotificationsRead()`;
  the bullet was deleted and a one-line note ("The digest does not mark
  notifications as read automatically.") added to the Step 4 intro.
- The `save` and `cleanup` bullets remain intact and in order; the
  `diff`/`last` sections still reference `last-digest.json`.
- Diff confined to Step 4 (1 insertion, 2 deletions); no other section
  changed.
- No linter configured in the repo; verification was a read-through plus
  `npm run typecheck` (scripts + packages/shared) and `packages/shared`
  tests (4/4), all green.
- No divergence from plan.
