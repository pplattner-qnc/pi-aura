# Architecture spec — digest-notif-window

> aura-digest: since-last-run + older-unread notifications, drop auto mark-read.
> Source lives in `scripts/src/`; `make` typechecks + esbuild-bundles into
> `skills/aura-digest/dist/aura-digest.mjs` (committed). The `scripts/`
> package has no test runner — verification is `make typecheck` + `make build`
> + a manual `fetch` smoke test.

## Slices

1. **`notif-window-fetch`** (size m, level 0) — the code: types, constants,
   paginated since-last-run fetch, `summarizeNotifications` refactor,
   combined-list wiring for `extractVerifyTargets` + `review_assigned`, and
   `renderAttention` two-group rendering. All in `scripts/src/`.
2. **`skill-drop-markread`** (size s, level 1, blocked by slice 1) — remove
   the `markAllNotificationsRead()` line from `skills/aura-digest/SKILL.md`
   Step 4; add a one-line note that the digest does not mark notifications
   read. Doc only.

Slice 2 is blocked by slice 1 for natural ordering (code lands first, then
the orchestration doc), even though there is no live code dependency. This
keeps the final committed state coherent in one direction.

## Slice 1 — `notif-window-fetch`

### Exports (planned public API surface)

- **`scripts/src/types.ts`** — new `DigestNotifications` interface; change
  `DigestAttention.notifications` from `string[]` to `DigestNotifications`.
- **`scripts/src/aura-digest.ts`** — new internal (non-exported) helper
  `fetchNotifications(aura, lastFetchedAt): Promise<{ since: Notification[],
  older: Notification[] }>` plus four module constants
  (`NOTIF_PAGE_SIZE`, `NOTIF_FETCH_CAP`, `NOTIF_OLDER_FETCH`,
  `NOTIF_BOUNDARY_MARGIN_MS`). `summarizeNotifications` keeps its signature
  `summarizeNotifications(items: Notification[]): string[]` but **drops the
  internal `unread` filter** (moves to the caller). `renderAttention` is
  updated for the new two-group shape.

### Existing abstractions to use (do NOT reimplement)

- `loadLastDigest()` — already in `aura-digest.ts`; read `fetched_at` from
  it inside `fetchAction` (currently `fetch` does not read the store).
- `AuraClient.listNotifications({ page, limit, sort_by, sort_dir })` from
  `@pi-aura/shared/aura-client` — the only notification list call; no
  server-side `read`/`since` filter exists.
- `Notification` / `NotificationList` / `Pagination` types from
  `@pi-aura/shared/aura-client` (`Notification` has `id`, `type`, `read`,
  `created_at` plus `[k: string]: unknown`).
- `summarizeNotifications()` — reuse as the per-item string formatter; only
  the unread filter moves out.
- `extractVerifyTargets()` — unchanged signature; just feed it the
  combined list.
- The `warnings: string[]` array already built in `fetchAction` — push the
  over-cap warning into it so it surfaces in `digest.warnings`.
- `safeString()` — for notification field access.

### Do NOT reimplement

- No server-side `read` / `created_after` filter (the API has none —
  `ListNotificationsData` accepts only `page`, `limit`, `sort_by`,
  `sort_dir`).
- No change to `listTasks`, `getBoardSummary`, `getMyCapacity`,
  `getBoardBriefing`, or the dev-links layer.
- No change to `DigestDiff` / `computeDiff` / `diffAction` / `lastAction`
  (diff does not diff notifications; the "since last run" group *is* the
  delta by construction — out of scope per task doc).
- No `schema_version` bump on `Digest` / `LastDigestStore` (accept the
  persisted-shape break; the store is regenerated each run).

### Interface contract

`DigestAttention.notifications` changes from `string[]` to:

```ts
export interface DigestNotifications {
  since_last_run: string[];
  older_unread: string[];
}
```

Consumers within this slice: `fetchAction` (builds it) and `renderAttention`
(reads it). The persisted `last-digest.json` store embeds `Digest`, so its
notification shape changes too — accepted break (regenerated each `save`).
`diff`/`last` do not read `attention.notifications`, so no cross-slice
contract to honor.

### Constants (near `WORKDAY_HOURS`)

```ts
const NOTIF_PAGE_SIZE = 50;
const NOTIF_FETCH_CAP = 500;        // hard safety cap; ~10 pages
const NOTIF_OLDER_FETCH = 20;       // newest N older-than-boundary, then drop read
const NOTIF_BOUNDARY_MARGIN_MS = 5 * 60 * 1000;  // fetched_at - 5min
```

### Paginated fetch helper — behavior

`fetchNotifications(aura, lastFetchedAt)` returns `{ since, older }`:

- `sinceBoundary = lastFetchedAt
    ? new Date(Date.parse(lastFetchedAt) - NOTIF_BOUNDARY_MARGIN_MS).toISOString()
    : null`.
- Paginate `listNotifications({ sort_by: "created_at", sort_dir: "desc",
  page: p, limit: NOTIF_PAGE_SIZE })` newest→oldest.
- **Boundary set:** collect *all* items (read + unread) while
  `item.created_at > sinceBoundary`, page by page, until a page contains an
  item with `created_at <= sinceBoundary` (stop after that page — don't
  fetch further pages for the "since" group). Collect the at/older items
  from that boundary-crossing page plus subsequent paging into `older`
  until it reaches `NOTIF_OLDER_FETCH` items (regardless of read state),
  then stop.
- **First run (`sinceBoundary` null):** no `since` group; fetch a single
  page of `NOTIF_OLDER_FETCH` newest items as the `older` pool.
- **Hard cap:** never fetch more than `NOTIF_FETCH_CAP` total across both
  groups; if hit, stop and push a warning into the caller's `warnings[]`.

Replace the single `listNotifications` call inside the `Promise.all` in
`fetchAction` with this helper's result (it can't stay in the `Promise.all`
because pagination is sequential — call it after the parallel block, or
make it a separate `await` before building `raw`).

### summarizeNotifications refactor

Keep `summarizeNotifications(items: Notification[]): string[]` as the
per-item formatter (`date — type by actor: target vN (decision)`). Remove
the `unread` filter + the `["No unread notifications."]` fallback — those
move to the caller. Then:

```ts
const notifSummaries: DigestNotifications = {
  since_last_run: summarizeNotifications(sinceNotifs),              // all, incl. read
  older_unread: summarizeNotifications(olderNotifs.filter(n => !n.read)),
};
```

### Combined list for review-signal consumers

```ts
const allNotifs = [...sinceNotifs, ...olderNotifs];
extractVerifyTargets(allNotifs, pendingReviews.items ?? [], waitingOnOthersLinks);
const assignedNotif = allNotifs.filter(n => safeString(n.type) === "artifact.review_assigned");
```

`raw.notifications` stores the full `allNotifs` set (the existing
`NotificationList` shape — keep storing what was fetched; the raw bundle is
for debugging).

### renderAttention

Replace the single `- 📬 ...` line with two lines:

```
- 📬 **Since last run:** <items or "Nothing new since last run.">
- 📬 **Older unread:** <items or "No unread notifications.">
```

### Verify

```bash
make typecheck   # catches the type change
make build       # bundles to skills/aura-digest/dist/aura-digest.mjs
```

Manual smoke test (informational, not gated — requires a live Aura PAT):
`node skills/aura-digest/dist/aura-digest.mjs fetch` and inspect
`$OUT/digest.json` (`attention.notifications` should have the new shape) +
the rendered markdown via `render "$OUT"`.

## Slice 2 — `skill-drop-markread`

### Exports

None (documentation only).

### Existing abstractions to use

- `skills/aura-digest/SKILL.md` Step 4 ("Present, save, and act").

### Do NOT reimplement

- Do not touch the `save` / `cleanup` steps or any other section of
  SKILL.md.
- Do not edit `aura-digest.ts` (the script never called
  `markAllNotificationsRead` — it was only an orchestrator instruction).

### Change

Delete the Step 4 bullet:

> - Mark notifications read via MCP: `aura-mcp-dev_markAllNotificationsRead()`

Optionally add a one-line note that the digest does **not** mark
notifications read, so the behavior is documented.

### Verify

Read the resulting Step 4; confirm the `save` + `cleanup` bullets remain
intact and no wording implies notifications are auto-cleared. (No build
needed — doc only.)
