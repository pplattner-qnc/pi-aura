# Architecture spec — digest-actions-and-followup

> Status: **DRAFT — awaiting user approval**. No TDD until approved.
> Task: `docs/tasks/digest-actions-and-followup/task.md`
> Slices (3, sequential): `actions-routing-table` → `followup-working-on` → `digest-json-writer`.

## Goal of this spec

Fix the public types, the abstraction to reuse, the new write target, and
each slice's interface contract so three sequential TDD chains can land
without re-discovering decisions.

## Existing abstractions to use

- **`seedSuggestedActions(overdue, waitingOnYou, reviews, queue)`** in
  `scripts/src/aura-digest.ts` (lines ~671–700) — the current rule-based seed
  that produces `suggested_actions: string[]`. `buildActions` is its
  **structured successor**: same inputs (the already-computed
  `attention`/`reviews`/`reviews_owed`/`capacity`/`corrections`/`warnings`/`queue`),
  emits `DigestAction[]`. Do **not** fork the ranking logic — `buildActions`
  replaces `seedSuggestedActions` and `suggested_actions` is **derived** from
  `actions` (`actions.map(a => a.instruction)`) so there is one ranking.
- **`Digest` type** in `scripts/src/types.ts` (lines ~127–141) — extend in
  place, do not fork. Add `actions: DigestAction[]` and
  `followup: DigestFollowup`.
- **`LAST_DIGEST_PATH`** constant + `~/.pi/aura/` dir usage in
  `aura-digest.ts` (line ~140) — add a `DASHBOARD_DIGEST_PATH` sibling
  constant; reuse the `homedir()` + `join` import already present.
- **`writeFileSync` + `mkdirSync`** from `node:fs` — already imported (line
  ~27); reuse for the dashboard write.
- **Graceful-degradation `warnings[]` pattern** (used by the keyring/dev-links
  skip) — the dashboard write reports a write-permission failure via
  `warnings[]` rather than crashing `fetch`.

## Do NOT reimplement

- Do not re-rank actions in the renderer or in `save`; the ranking lives once
  in `buildActions`.
- Do not re-implement `suggested_actions` independently; derive it from
  `actions`.
- Do not add a server, listener, or browser code (that's `digest-dashboard`).
- Do not touch the temp-dir `digest.json` write (line ~577) — the dashboard
  write is an **additional** write to a stable path, not a replacement.

## Type additions (`scripts/src/types.ts`)

```ts
/** A clickable next-action on the interactive dashboard. The routing table. */
export interface DigestAction {
  section: string;        // "overdue" | "waiting_on_you" | "reviews_owed" | "capacity" | "warnings" | "queue"
  key: string;            // human key ("AURA-42") or singleton id ("capacity", "<artifact-id>")
  action: string;         // "advance" | "unblock" | "review" | "flag_capacity" | "run_setup"
  label: string;          // button text, e.g. "Advance AURA-42 — Fix login (3d)"
  instruction: string;    // human-readable form the agent shows + acts on
  aura_use_case: string;  // "task-management" | "artifact-management" | "capacity-planning" | "aura-digest"
}

/** In-flight lock for one-action-at-a-time (Q7). The agent sets
 *  `currentlyWorkingOn` when it starts acting on a click; the SPA shows a
 *  spinner + "continue in pi" tooltip on the matching button and disables
 *  the others. `null` when idle. This task only owns the shape + default. */
export interface DigestFollowup {
  currentlyWorkingOn: string | null; // e.g. "overdue/AURA-42"; null when idle
}
```

`Digest` gains (additive, after `suggested_actions`):
```ts
  actions: DigestAction[];          // structured routing table (SPA renders)
  followup: DigestFollowup;          // in-flight lock (default {currentlyWorkingOn: null})
```

## `buildActions(digest)` — the routing-table builder

New pure function in `aura-digest.ts`. Input: a `Digest`-shaped object **minus**
`actions`/`followup` (the fields it reads are all already built before the
`const digest = {...}` literal at line ~539). Output: `DigestAction[]`, ≤ 6,
ranked:

1. `attention.overdue` (max 3) → `{action:"advance", aura_use_case:"task-management"}`.
   `key` = item.key; `label` = `Advance ${key} — ${title}${days? ` (${days}d)`}`;
   `instruction` = `Advance ${key} — ${title}${days? ` (it's ${days} days overdue)`}`.
2. `attention.waiting_on_you` (max 3) → `{action:"unblock", aura_use_case:"task-management"}`.
   `label`/`instruction` = `Unblock ${key} — ${title}`.
3. `reviews_owed` (max 3) → `{action:"review", aura_use_case:"artifact-management"}`.
   `key` = artifact_id; `label` = `Review ${title} v${version}`; `instruction` =
   `Review artifact ${title} (v${version}) — you owe it`. (Stale corrections
   drop their actions — a `reviews_owed` entry whose artifact is in
   `corrections` with `stale:true` is skipped, mirroring the grilling's
   re-rank rule.)
4. `capacity.over` (1) → `{section:"capacity", key:"capacity", action:"flag_capacity",
   aura_use_case:"capacity-planning", label:"Flag over-commitment (${utilization_pct}%)",
   instruction:"Capacity is at ${utilization_pct}% committed — adjust or flag to manager"}`.
5. `warnings.length > 0` (1) → `{section:"warnings", key:"warnings", action:"run_setup",
   aura_use_case:"aura-digest", label:"Run setup / auth", instruction:"Run the digest setup — ${warnings[0]}"}`.
6. Fill to max 6 with active `queue` rows where `capacity_pct > 0` →
   `{action:"advance", aura_use_case:"task-management"}`, `label` =
   `Advance ${key} — ${title} (${status})`.

Total ≤ 6. Empty digest → `[]`. All section reads guarded with `?? []`.

`seedSuggestedActions` is **removed**; `suggested_actions` becomes
`buildActions(digest).map(a => a.instruction)`. The markdown renderer
(`renderSuggestedActions`) is unchanged (it reads `suggested_actions`).

## Slice interface contracts

### Slice 1 — `actions-routing-table` (s)
**Exports:** `DigestAction` type (types.ts) + `buildActions(digest)` (aura-digest.ts).
**Wire:** `fetch`'s digest-build (line ~539–552) calls `buildActions` and sets
`digest.actions`; `suggested_actions` derived from it.
**Contract for slice 2:** `Digest` has `actions: DigestAction[]`; `followup`
not yet present (slice 2 adds it).
**Test seam:** `buildActions` is pure → unit-test with fixture digests (no MCP).

### Slice 2 — `followup-working-on` (s)
**Exports:** `DigestFollowup` type (types.ts).
**Wire:** `fetch` sets `digest.followup = { currentlyWorkingOn: null }`.
**Contract for slice 3:** `Digest` is now complete (`actions` + `followup`).
**Test seam:** assert `followup.currentlyWorkingOn === null` in the `fetch` fixture.

### Slice 3 — `digest-json-writer` (m)
**Exports:** `DASHBOARD_DIGEST_PATH` constant + the dashboard write.
**Wire:** after the temp-dir `writeFileSync(digestPath, ...)` (line ~577), add
`writeFileSync(DASHBOARD_DIGEST_PATH, JSON.stringify(digest, null, 2) + "\n")`;
`mkdirSync(dirname(DASHBOARD_DIGEST_PATH), { recursive: true })` first (idempotent).
**Contract for downstream (`digest-dashboard`):** `~/.pi/aura/digest.json`
exists after `fetch`, parses as `Digest`, with `actions` + `followup`.
**Test seam:** inject a temp `HOME` so the test doesn't write the real
`~/.pi/aura/`; assert the file matches the temp-dir digest's `actions`/`followup`.

## Decisions settled here (for the TDD workers)

1. **One ranking:** `suggested_actions` is derived from `actions` (no dual ranking).
2. **`buildActions` replaces `seedSuggestedActions`** (the old function is removed, not kept).
3. **Dashboard write is inline in `fetch`** (no new `write-dashboard` subcommand) — one extra `writeFileSync` after the temp-dir write. The SKILL.md (`skl-flow-rewrite`) will note `fetch` writes both.
4. **`followup.currentlyWorkingOn` default is `null`**; this task never sets it (the agent does, via `digest-dashboard`/`skl-flow-rewrite`).
5. **`key` for `reviews_owed` is the artifact_id**; for `capacity`/`warnings` it's the literal `"capacity"`/`"warnings"`.
6. **Stale corrections drop their actions** — a `reviews_owed` whose artifact_id is in `corrections` with `stale:true` is skipped.
7. **Dashboard write failure is non-fatal** — append to `warnings[]`, don't crash `fetch`.

## Out of scope for this task (do not touch)

- `digest-dashboard` (server/listener/SPA/teardown).
- `skl-flow-rewrite` (SKILL.md flow).
- The markdown `render`/`save`/`diff`/`last`/`cleanup` subcommands (unchanged).
- The `state.json` mailbox.
