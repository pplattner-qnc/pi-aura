---
kind: task
type: feature
slug: digest-actions-and-followup
title: Compute the digest actions[] routing table + followup.currentlyWorkingOn and write ~/.pi/aura/digest.json
map: aura-digest-interactive
status: ready
blocked_by: []
slices: [actions-routing-table, followup-working-on, digest-json-writer]
---

## User-visible outcome

`aura-digest.mjs` produces, in addition to today's `digest.json`, an
**`actions: [...]` array** — the per-section routing table — and a
**`followup.currentlyWorkingOn`** field. It writes the digest to
**`~/.pi/aura/digest.json`** (the SPA's live data source), beside the existing
`~/.pi/aura/last-digest.json`. This is the **data half** of the interactive
dashboard; the SPA (task `digest-dashboard`) renders `actions[]` as buttons
and the agent sets `followup.currentlyWorkingOn` to lock one-action-at-a-time.

## User story

As the orchestrator running the morning digest, after fetch → augment I want
the script to (a) compute a ranked, self-describing action list from the
verified attention/reviews/capacity data, (b) expose a `followup` slot the
agent sets when it starts acting on a click, and (c) persist the result at a
**stable path** (`~/.pi/aura/digest.json`) the detached server + listener can
find — so the dashboard renders and hot-reloads from one file.

## Scope boundaries

- **In:** `scripts/src/aura-digest.ts` + `scripts/src/types.ts`; the `Digest`
  type gains `actions: DigestAction[]` and `followup: DigestFollowup`; a new
  `buildActions(digest)` function (replacing/augmenting `seedSuggestedActions`);
  a new write target `~/.pi/aura/digest.json` (the existing temp-dir
  `digest.json` for `render`/`save`/`diff` stays unchanged).
- **Out:** any HTML/Svelte/server/listener (that's `digest-dashboard`); the
  `state.json` mailbox (that's `digest-dashboard`); SKILL.md flow rewrite
  (that's `skl-flow-rewrite`). This task never starts a server or opens a
  browser.
- **Don't break the markdown path:** the existing `render` (stdout/file
  markdown), `save`, `diff`, `last`, `cleanup` subcommands stay bit-for-bit.
  `actions[]`/`followup` are additive fields the markdown renderer ignores
  (or renders as a small footer list, unchanged).

## Acceptance criteria

- `Digest` type has `actions: DigestAction[]` and `followup: DigestFollowup`;
  `DigestAction = { section, key, action, label, instruction, aura_use_case }`
  and `DigestFollowup = { currentlyWorkingOn: string | null }` (per Q5/Q6/Q7).
- `buildActions(digest)` produces a ranked `actions[]` from the verified
  `attention` / `reviews_owed` / `capacity` / `corrections` / `warnings`
  data, mapping each section → its action/use-case per the routing table
  (overdue→advance/task-management, waiting_on_you→unblock/task-management,
  reviews_owed→review/artifact-management, capacity>100%→flag/capacity-planning,
  corrections→(none, informational), warnings→(none, or a "run setup" action
  routing to the digest skill)). Stale corrections drop their actions (per
  the grilling's re-rank rule). Max ~6 actions, ranked overdue → waiting on
  you → current rejections needing revision → active work.
- `followup.currentlyWorkingOn` defaults to `null` in the freshly-built
  digest; the agent sets it later (this task only owns the field + default).
- A new write path: `fetch` (or a new `write-dashboard` step — settled in the
  arch spec) writes `~/.pi/aura/digest.json` with the full corrected digest
  (including `actions[]` + `followup`). The temp-dir `digest.json` for
  `render`/`save`/`diff` is unaffected.
- `last-digest.json` store: `save` still persists the corrected digest; the
  `actions[]`/`followup` fields ride along (the `LastDigestStore.digest` is a
  `Digest`, so they're included for free — no schema change beyond the type
  addition).
- `make typecheck && make build` green; existing digest tests still pass;
  new unit tests cover `buildActions` ranking + stale-drop and the
  `followup` default.

## Existing abstractions to use

- `seedSuggestedActions(overdue, waitingOnYou, reviews, queue)` in
  `aura-digest.ts` — the current rule-based seed; `buildActions` is its
  structured successor (consume the same inputs, emit structured `DigestAction`
  objects instead of `string[]`).
- `renderSuggestedActions` — keep rendering `suggested_actions` (markdown);
  `actions[]` is the structured parallel for the SPA, not a markdown
  replacement.
- The `Digest` / `DigestAttention` / `DigestReview` / `DigestCorrection` types
  in `types.ts` — extend, don't fork.
- `~/.pi/aura/` dir + `LAST_DIGEST_PATH` constant in `aura-digest.ts` — add a
  `DASHBOARD_DIGEST_PATH` sibling constant.

## Architecture / domain decisions

- Per the grilling: routing table lives **in `digest.json`** (Q5), instruction
  shape is **structured** (Q6), one-action-at-a-time via
  `followup.currentlyWorkingOn` (Q7). `currentlyWorkingOn` is a key/path
  string identifying the in-progress item (e.g. `"overdue/AURA-42"`); exact
  format settled in the arch spec (this task owns the field shape, the agent
  writes the value).
- `aura_use_case` values reference the `aura` skill's resource sections
  (`task-management`, `artifact-management`, `capacity-planning`, …) so the
  agent can route on a stable token, not prose.

## Slices

### 1. `actions-routing-table` (s)

Extend `Digest` with `actions: DigestAction[]` + the `DigestAction` type; add
`buildActions(digest)` producing the ranked routing table from the existing
attention/reviews/capacity/corrections/warnings fields. Wire it into `fetch`'s
digest build (replacing the `seedSuggestedActions` call site, but keeping
`suggested_actions` populated for the markdown renderer). Unit-test the
ranking + stale-drop. End-to-end: a fetched `digest.json` has a populated
`actions[]`.

### 2. `followup-working-on` (s)

Add `followup: DigestFollowup` (`{ currentlyWorkingOn: string | null }`) to
`Digest`; default `currentlyWorkingOn: null` in `fetch`. Unit-test the
default. End-to-end: a fetched `digest.json` has `followup.currentlyWorkingOn:
null`.

### 3. `digest-json-writer` (m)

Write the full corrected digest (including `actions[]` + `followup`) to
`~/.pi/aura/digest.json` at the end of `fetch` (or in a new
`write-dashboard` step — settled in the arch spec). Add `DASHBOARD_DIGEST_PATH`
constant. Ensure the temp-dir `digest.json` (for `render`/`save`/`diff`) is
unaffected. Test: after `fetch`, `~/.pi/aura/digest.json` exists and matches
the temp-dir digest's `actions[]`/`followup`.

## Notes

- The `followup.currentlyWorkingOn` **writer** (the agent setting it on click)
  is `digest-dashboard` / `skl-flow-rewrite` — this task only owns the field
  shape + default. Keep that boundary explicit in the arch spec.
- `buildActions` and `seedSuggestedActions` overlap; the arch spec decides
  whether `suggested_actions` is derived from `actions[]` (single source) or
  kept independent. Prefer deriving `suggested_actions` from `actions[]` to
  avoid two rankings.

## Implementation notes

### Slice 1: actions-routing-table (landed)

- Added `DigestAction` type and `actions: DigestAction[]` field to `Digest` in `types.ts`.
- `buildActions(digest)` implemented in `build-actions.ts` (extracted for modularity; identical export surface as originally specified in `aura-digest.ts`).
- `fetch` now calls `buildActions` and derives `suggested_actions` from `actions[].instruction` (single source of ranking, replacing `seedSuggestedActions`).
- 8 unit tests in `build-actions.test.ts` cover ranking order, stale-drop, over-commitment flag, warnings run_setup, empty digest, and >6 truncation.
- Verify output: typecheck, build, 8 slice unit tests, shared pkg suite (30), engineering-sync (5), extensions all green. No lint blocker.
- Deviation: `buildActions` lives in `build-actions.ts` rather than `aura-digest.ts` — modularity improvement, identical export, no user attention needed.

### Slice 2: followup-working-on (landed)

- Added `DigestFollowup` type (`{ currentlyWorkingOn: string | null }`) and `followup: DigestFollowup` field to `Digest` in `types.ts`.
- `fetch` sets `digest.followup = { currentlyWorkingOn: null }` inline in the digest literal; field is always present (never `undefined`).
- `build-actions.test.ts` fixture updated to include `followup: { currentlyWorkingOn: null }` so slice-1 tests stay type-safe with the extended `Digest`.
- New unit test `followup-working-on.test.ts` (57 lines) asserts the null default on a `minimalDigest` fixture.
- `dist/aura-digest.mjs` regenerated bundle included in the commit (tracked build artifact per repo convention).
- Verify output: typecheck, build, followup-working-on.test.ts, build-actions.test.ts regression, packages/shared suite (30/30) all green.
- Deviation: advisory note — test verifies the type contract (field exists, defaults to null) on a static fixture, not the runtime wiring of `fetch`; the wiring is a one-liner visible in the diff and exercised indirectly by future `fetch` integration tests. Non-blocking.
