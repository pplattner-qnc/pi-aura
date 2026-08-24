---
kind: slice
slug: actions-routing-table
title: Add Digest.actions[] + buildActions() routing table
task: ../task.md
mode: afk
size: s
blocked_by: []
status: done
---

## End-to-end behavior

A fetched `digest.json` carries a populated `actions: DigestAction[]` — the
per-section routing table — ranked from the verified attention/reviews/
capacity/corrections/warnings data. The markdown render path is unchanged.

## Acceptance criteria

- `types.ts`: `DigestAction = { section: string; key: string; action: string; label: string; instruction: string; aura_use_case: string }`; `Digest` gains `actions: DigestAction[]`.
- `aura-digest.ts`: `buildActions(digest)` produces the ranked list, mapping each section → `{action, aura_use_case}`:
  - `attention.overdue` → `{action:"advance", aura_use_case:"task-management"}` (max 3)
  - `attention.waiting_on_you` → `{action:"unblock", aura_use_case:"task-management"}` (max 3)
  - `reviews_owed` (non-stale, current version) → `{action:"review", aura_use_case:"artifact-management"}` (max 3)
  - `capacity.over` → `{action:"flag_capacity", aura_use_case:"capacity-planning"}` (1)
  - `corrections` (stale) → no action (informational; dropped)
  - `warnings` → optional `{action:"run_setup", aura_use_case:"aura-digest"}` (1, only if warnings)
  - active queue rows with capacity → `{action:"advance", aura_use_case:"task-management"}` (fill to max 6)
  - total ≤ 6, ranked overdue → waiting → rejections → active.
- `label` is the button text (e.g. `"Advance AURA-42 — <title> (3d)"`); `instruction` is the human-readable form the agent shows (e.g. `"Advance AURA-42 — <title> (it's 3 days overdue)"`).
- `fetch` calls `buildActions` and sets `digest.actions` (replacing the `seedSuggestedActions` call site). `suggested_actions` (for markdown) is derived from `actions[]` (`actions.map(a => a.instruction)`) so there's one ranking.
- `make typecheck && make build` green; `render` markdown unchanged or with `actions` reflected only as the existing suggested-actions list.

## Test plan

- **Seams:** `buildActions` is a pure function over a `Digest` (minus `actions`/`followup`) → unit-test directly with fixture digests.
- **Scenarios:** (a) overdue+waiting+reviews → ranking order; (b) stale correction → its action dropped; (c) over-commitment → flag_capacity action present; (d) warnings → run_setup present; (e) empty digest → `actions: []`; (f) >6 candidates → truncated to 6 in rank order.
- **Failure modes:** a section with missing optional fields (e.g. `reviews_owed` absent) must not throw — guard with `?? []`.
- **Edge cases:** `key` for reviews_owed is the artifact id (not a human key); `key` for capacity is `"capacity"` (singleton).
- **Integration:** after `fetch`, the temp-dir `digest.json` has `actions` matching the fixture; `render` still emits valid markdown.

## Constraints and dependencies

- None blocking. Types live in `types.ts` (shared with `digest-dashboard`).
- Do not touch the SPA/server (out of scope).
