---
kind: slice
slug: cleanup-and-final-polish
title: Confirm digest-save final state; drop dead HTTP-POST refs; polish skill-doc digest-log description
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: [digest-log-direct-push]
---

## End-to-end behavior

No behavior change. `digest-save` is confirmed in its final state (task 3
reworked it: `getCurrentDigest` → `saveLastDigest`, no `dir`, no spawn). The
now-dead HTTP-POST path (`joinUrl`/`fetch` for `/api/state` from the agent
side) is gone (slice 1 dropped `joinUrl`; this slice confirms no residual).
The `digest-log` tool description + the skill-doc `digest-log` line are
polished to reflect the new "always records; renders when the dashboard is
up" semantics.

## What this slice delivers

- Confirm `digest-save` is final: writes `last-digest.json` from `getCurrentDigest()`; no `dir`; no spawn; error when null. No code change unless a small description polish is needed.
- Grep `index.ts`: no `joinUrl`, no agent-side HTTP `fetch` to `/api/state` (digest-log was the last), no `readDashboardUrl`. The `/api/state` POST route stays in `server.ts` (browser action_click). Confirm.
- Update the `digest-log` tool `description`/`promptSnippet` if it still says "no-op if the dashboard is not running" → "always records the line; renders in the dashboard when it's running" (the new semantics).
- Skill doc (`aura-digest.md`): the `digest-log` section says "A no-op if the dashboard is not running" — update to "always records the line; renders in the dashboard when it's running". Minimal (task 5 does the full rewrite).
- Final gate: full vitest + all typechecks + CLI build green; no `joinUrl` in `index.ts`; `digest-log` never calls `fetch`.

## Acceptance criteria

- `digest-save` unchanged-but-confirmed final (last-digest.json from memory; no dir/spawn).
- No `joinUrl`/agent-side `/api/state` fetch in `index.ts`; `digest-log` never calls `fetch`.
- Tool description + skill-doc `digest-log` line reflect the always-records semantics.
- Full vitest + typecheck + CLI build green.

## Test plan

- Grep: no `joinUrl` in `index.ts`; no `fetch(` in `digest-log`'s execute.
- `digest-save` tests still pass (unchanged from task 3).
- Full vitest + typecheck green; CLI builds.

## Constraints and dependencies

- Blocked by slice 1.
- Do NOT delete the CLI shim/bundle (task 5).
- Do NOT remove the `/api/state` POST route in `server.ts` (browser action_click).
- Do NOT change the digest data model or Svelte view.
- Do NOT touch `digest-fetch`/the store/the server.
