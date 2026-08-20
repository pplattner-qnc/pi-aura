## Deviation report — notif-window-fetch

### API surface changes
- **Planned:** `fetchNotifications(aura, lastFetchedAt): Promise<{ since, older }>`.
- **Actual:** `fetchNotifications(aura, lastFetchedAt, warnings): Promise<{ since, older }>` — added a third `warnings: string[]` parameter so the helper can push the over-cap warning directly into the caller's existing `warnings` array.
- **Impact:** None on dependent slices. The helper is internal/non-exported. The arch spec itself said "push a warning into the caller's `warnings[]`" — the implementer chose to thread the array through rather than return it, which is a minor signature widening, not a public API change. Slice 2 is doc-only and doesn't call this helper.

### Abstraction usage
- Used/was specified: **yes** — `loadLastDigest()`, `AuraClient.listNotifications()`, `summarizeNotifications()`, `extractVerifyTargets()`, `safeString()`, and the existing `warnings: string[]` array are all reused as specified. No reimplemented abstractions.

### Out-of-scope changes
- **`raw.notifications` synthetic pagination:** The implementation builds a synthetic `NotificationList` wrapper `{ items: allNotifs, pagination: { page: 1, limit: allNotifs.length, total: allNotifs.length } }` around the combined fetched set. The arch spec explicitly allowed either `allNotifs` or the original pagination result for `raw.notifications`, so this is within scope. The synthetic `Pagination` object satisfies the `Pagination` interface (`page`, `limit`, `total`, `[k: string]: unknown`).
- **No ad-hoc test file added.** The slice doc said this was acceptable ("a small ad-hoc `node --test` file is acceptable if it helps, but the gate is `make typecheck` + `make build`"). The implementer relied on typecheck + build + manual render smoke test. This is within the documented gate.
- **No changes to `computeDiff` / `diffAction` / `lastAction` / `DigestDiff`** — confirmed via diff inspection. `computeDiff` never accesses `attention.notifications`, so the type change is transparent to diff. ✓
- **No `schema_version` bump** — `LAST_DIGEST_SCHEMA_VERSION` stays at 1, as the spec says "accept the break." ✓
- **No changes to `listTasks`, `getBoardSummary`, `getMyCapacity`, `getBoardBriefing`, or dev-links** — confirmed. ✓

### Boundary logic correctness review

Traced the `fetchNotifications` helper against the arch spec's boundary algorithm:

1. **Boundary computation:** `sinceBoundary = lastFetchedAt ? new Date(Date.parse(lastFetchedAt) - 5min).toISOString() : null` — matches spec exactly. ✓
2. **Pagination:** `listNotifications({ sort_by: "created_at", sort_dir: "desc", page, limit: 50 })` newest→oldest. ✓
3. **Since group:** Items pushed to `since` while `!crossedBoundary`. When an item has `created_at <= boundaryTime` (or malformed `NaN`), `crossedBoundary` flips to `true`. Subsequent items in the same page go to `older`. ✓
4. **Older group:** Fills up to `NOTIF_OLDER_FETCH` (20) items from the boundary-crossing page onward. Subsequent pages are fetched only if `older` isn't full yet. ✓
5. **First run (`sinceBoundary` null):** `since` stays empty; `older` collects up to 20 newest items from a single page, then breaks. ✓
6. **Hard cap:** `totalFetched >= NOTIF_FETCH_CAP` breaks the inner loop; outer while-condition also checks it. Warning pushed post-loop. ✓
7. **Empty page:** `if (items.length === 0) break` — stops pagination at end of list. ✓
8. **Malformed `created_at`:** `Number.isNaN(createdAt)` treated as older-than-boundary (sets `crossedBoundary = true`). Matches the slice doc's edge case requirement. ✓

**Minor observation (not a deviation):** The spec said "stop after that page — don't fetch further pages for the 'since' group." The implementation doesn't break the page loop at the boundary crossing; it continues to fill `older` from the same and subsequent pages. This is correct behavior — `since` items only accumulate while `!crossedBoundary`, so no extra items leak into `since` after the boundary is crossed. The continuation is solely to fill `older`, which is what the spec intends.

### Divergence from slice doc's acceptance criteria

All acceptance criteria are met:

- ✅ `DigestNotifications` exported with `since_last_run: string[]` and `older_unread: string[]`; `DigestAttention.notifications` typed as `DigestNotifications`.
- ✅ Four constants added near `WORKDAY_HOURS` with correct values.
- ✅ `fetchNotifications` helper implements boundary + pagination logic (with the `warnings` param addition noted above).
- ✅ `fetchAction` calls `loadLastDigest()` for `fetched_at`, `listNotifications` removed from `Promise.all`.
- ✅ `summarizeNotifications` drops unread filter + fallback; formats all given items.
- ✅ `attention.notifications` built as `{ since_last_run, older_unread }`.
- ✅ `extractVerifyTargets` and `review_assigned` filter receive `allNotifs`.
- ✅ `raw.notifications` stores the full fetched set.
- ✅ `renderAttention` renders two lines with correct empty-state strings.
- ✅ `make typecheck` passes (verified: `cd scripts && npm run typecheck`).
- ✅ `make build` passes (verified: `cd scripts && npm run build`).

### Task doc update needed?
**No.** No `## Implementation notes` update required. The `warnings` param addition is a minor internal detail that doesn't change the task-level contract.

### User attention needed?
**No.** The only deviation (third `warnings` parameter on an internal helper) is explicitly endorsed by the arch spec's own wording ("push a warning into the caller's `warnings[]`"). No public API surface changed, no scope widened, no out-of-scope code touched.
