---
kind: slice
slug: 4-svelte-tree-view
title: Render the live tree + augment log in Digest.svelte with layered debounce
task: ../task.md
mode: afk
status: done
size: l
blocked_by: [2-dashboard-event-plumbing]
---

## End-to-end behavior

`Digest.svelte` gains a "fetch display mode": when `progress` events arrive,
it renders a nested tree of nodes (spinner while running, ✓ on done, ✕ on
error), the nodes staying on screen (append-only) until the run ends. Below
the tree, `agent_log` events render as a log list. A terminal "done" event on
the root fetch node transitions to the digest view once `digest.json` is
written. Layered debounce: ~30ms coalescing on incoming events + ~400ms
minimum dwell on running→done so a fast open→done still renders a brief ✓.

## What this slice delivers

A new view in `Digest.svelte` (tree component + log list) driven by the
`state-change` SSE from slice 2 (it reads `state.json`'s `agent→page`
`progress`/`agent_log` events). The existing digest view is unchanged and
becomes the post-transition state.

## Acceptance criteria

- On `progress` events with status "running", render a spinner next to the
  label; on "done", a ✓; on "error", a ✕. Nodes nest by `parentId`.
- Nodes are append-only: once shown, a node stays on screen until the run
  ends (never removed mid-run).
- Layered debounce: a node that goes running→done within one render tick
  still shows a brief ✓ (~400ms dwell) rather than vanishing; rapid event
  bursts (10 in <30ms) coalesce into one render.
- `agent_log` events render as a chronological log list below the tree.
- On a terminal "done" event for the root fetch node, the view transitions to
  the digest view (existing render) after `digest.json` is present.
- The existing digest view (queue/reviews/capacity/actions) is unchanged.

## Test plan

- Feed a fixture of `progress` events (a fast open→done pair, a nested
  subtree, an error) via a mock SSE; assert no flicker, correct nesting, ✓/✕.
- Assert a node finishing with `deferCloseForChildren` stays spinning until
  its children resolve, then shows ✓ (or ✕ if a child errored).
- Assert the transition to the digest view fires on the terminal event when
  `digest.json` exists.
- browser-visual-qa on the tree at desktop/tablet/mobile widths.

## Constraints and dependencies

- Blocked by 2 (event plumbing). Can be built against fixture events, so not
  blocked by 3 — but the real end-to-end test needs 3.
- Must not change the existing digest render path or the action_click flow.
