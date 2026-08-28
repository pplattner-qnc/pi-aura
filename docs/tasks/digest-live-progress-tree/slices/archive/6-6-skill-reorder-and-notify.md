---
kind: slice
slug: 6-skill-reorder-and-notify
title: Reorder the skill (dashboard-start first) + pi-TUI warning when dashboard absent
task: ../task.md
mode: hitl
status: done
size: s
blocked_by: [3-bundle-emits-tree, 4-svelte-tree-view]
---

## End-to-end behavior

The `aura-digest` skill's flow becomes: `digest-dashboard-start` (server up,
browser open to a "ready" state) → `digest-fetch` (streams the live tree) →
augment (agent calls `digest-log` per sub-step) → `digest-save` → wait for
clicks → teardown. Additionally, `digest-fetch`'s `execute` surfaces a
pi-TUI warning at run end when the dashboard was never running: both a warning
line in the tool-result text and `ctx.ui.notify("…", "warning")` — one-shot,
not per-event. The fetch never fails on the dashboard being absent.

## What this slice delivers

- `skills/core/aura-digest/aura-digest.md` reordered (Step 1 →
  `digest-dashboard-start`, Step 2 → `digest-fetch`, etc.).
- `.pi/extensions/digest-dashboard/index.ts`: `digest-fetch`'s `execute`
  checks `~/.pi/aura/server-url.json` at start; if absent, sets a flag; at run
  end (in the result path), if the flag is set, calls `ctx.ui.notify(...,
  "warning")` and prepends a warning line to the result text.

## Acceptance criteria

- Skill doc Step 1 is `digest-dashboard-start`; the pipeline diagram + prose
  reflect dashboard-first → fetch-streams → augment (with `digest-log`) →
  save → clicks → teardown.
- `digest-dashboard-start` called when already running is still a no-op
  (existing idempotency preserved).
- A `/aura-digest` run with the dashboard down: fetch succeeds, digest
  written, and a single pi-TUI warning + result-text warning appear at the
  end (no per-event noise).
- A run with the dashboard up: no warning, tree streams live (E2E with 3+4).

## Test plan

- E2E `/aura-digest` with dashboard up: tree appears live, transitions to
  digest, no warning. (manual / browser-qa)
- `/aura-digest` with dashboard down: fetch succeeds, digest correct, TUI
  warning shown once.
- Existing `digest-dashboard` test suite still passes (the start/stop/fetch
  tool tests).

## Constraints and dependencies

- Blocked by 3 (bundle emission) and 4 (Svelte view) — needs both for the E2E.
- `hitl` mode: the skill-doc reorder + TUI notify benefit from a human check.
