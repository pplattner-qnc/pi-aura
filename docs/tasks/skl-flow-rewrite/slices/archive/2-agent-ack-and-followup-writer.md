---
kind: slice
slug: agent-ack-and-followup-writer
title: Document the exact agent-side ack (state.json) + followup.currentlyWorkingOn clear (digest.json) writes
task: ../task.md
mode: hitl
size: s
blocked_by: [interactive-flow-step]
---

## End-to-end behavior

The SKILL.md gives the agent exact, copy-pasteable commands for the two
writes that complete the click loop: the `ack` event appended to
`~/.pi/aura/state.json` and the `followup.currentlyWorkingOn = null` edit to
`~/.pi/aura/digest.json`.

## Acceptance criteria

- The SKILL.md shows the exact `ack` event shape and a one-liner to append it, e.g.:
  ```bash
  node -e 'const p=require("fs"); const f=process.env.HOME+"/.pi/aura/state.json"; const a=JSON.parse(p.readFileSync(f,"utf8")); a.push({id:Date.now(), ts:new Date().toISOString(), dir:"agent→page", type:"ack", payload:{event_id:<the click event id>, status:"done"}}); p.writeFileSync(f, JSON.stringify(a,null,2));'
  ```
  (or a small helper subcommand `aura-digest.mjs ack <event-id>` if `digest-dashboard` adds one — note both options; the arch spec picks).
- The SKILL.md shows clearing `followup.currentlyWorkingOn`, e.g.:
  ```bash
  node -e 'const p=require("fs"); const f=process.env.HOME+"/.pi/aura/digest.json"; const d=JSON.parse(p.readFileSync(f,"utf8")); d.followup.currentlyWorkingOn=null; p.writeFileSync(f, JSON.stringify(d,null,2));'
  ```
  (or `aura-digest.mjs clear-followup` if added.)
- Both writes note that the server's `fs.watch` + SSE hot-reload the page automatically — no separate notify.
- The writes are ordered: ack first, then clear-`currentlyWorkingOn` (so the page sees the ack before the buttons re-enable).

## Test plan

- **Seams:** the commands run as `bash` one-liners (or helper subcommands) against the real `~/.pi/aura/` files.
- **Scenarios:** (a) after acting on a click → run both → `state.json` has the `ack` event + `digest.json.followup.currentlyWorkingOn` is `null` + the page hot-reloads; (b) ack with a bad `event_id` → still appends (the page just won't match it — acceptable; note it).
- **Failure modes:** `state.json`/`digest.json` absent → the command should no-op with a warning (note in SKILL.md).
- **Edge cases:** the arch spec may prefer a typed helper subcommand over raw `node -e` (safer quoting) — the SKILL.md uses whatever `digest-dashboard`/`digest-actions-and-followup` expose.

## Constraints and dependencies

- `blocked_by: [interactive-flow-step]` (the flow step references these commands).
- The exact command form depends on whether `digest-dashboard`/`digest-actions-and-followup` add helper subcommands — the arch spec reconciles; this slice documents the chosen form.
