# Architecture spec — skl-flow-rewrite

> Status: **DRAFT — awaiting user approval**. No edits until approved.
> Task: `docs/tasks/skl-flow-rewrite/task.md`
> Slices (3, sequential): `interactive-flow-step` → `agent-ack-and-followup-writer` → `routing-table-and-clean-close-docs`.

## Goal of this spec

Fix the exact prose contract the `aura-digest` SKILL.md gives the orchestrator
for the **interactive dashboard** flow, so a fresh agent following it produces
the right sequence: save → write `digest.json` → start dashboard → wait for
click → load `aura` → act on one action → write `ack` + clear
`currentlyWorkingOn` → report → wait or clean-close. Plus the routing-table
reference + the clean-close terminal, replacing the old `[ASK]` block.

This is **prose-only** (SKILL.md). The mechanism (`digest-dashboard`) and the
data (`digest-actions-and-followup`) are landed; this task wires them into the
agent's instructions.

## Existing abstractions to use

- The current SKILL.md Steps 1–3 (fetch → augment → render markdown) stay
  **unchanged** — the markdown digest remains available as a reference/scripted
  output.
- The current Step 4 (`save` + `cleanup`) + "Scope and handoff" + `[ASK]` block
  are **rewritten** (this task).
- `~/.pi/aura/digest.json` (written by `digest-actions-and-followup`'s
  `DASHBOARD_DIGEST_PATH`) — the agent reads `actions[]` from it and writes
  `followup.currentlyWorkingOn`.
- `~/.pi/aura/state.json` (`digest-dashboard`'s `StateFile` = `{pid,
  server_started, events: StateEvent[]}`) — the agent appends `ack` events.
- `/digest-dashboard start|stop` commands + the `digest-dashboard-start` tool
  (from `digest-dashboard` slice 6) — the agent invokes these.
- The `aura` skill + its use-case resources (`task-management`,
  `artifact-management`, `capacity-planning`, …) — the agent routes into them
  by `action.aura_use_case`.

## The exact new Step 4 flow (settled here)

### Step 4: Start the dashboard, then wait for clicks

After fetch → augment (Steps 1–2), and rendering the markdown digest (Step 3,
still done for reference/logging):

1. **Save** the corrected digest as the last-digest store (unchanged):
   ```bash
   node <skill-dir>/dist/aura-digest.mjs save "$OUT"
   ```
2. **The dashboard digest is already written** — `fetch` writes
   `~/.pi/aura/digest.json` (including `actions[]` + `followup`) automatically
   (the `digest-actions-and-followup` task). No extra step.
3. **Clean up the temp directory** (unchanged):
   ```bash
   node <skill-dir>/dist/aura-digest.mjs cleanup "$OUT"
   ```
4. **Start the dashboard** (the agent calls the tool — preferred — or the
   slash command):
   - Tool: `digest-dashboard-start` (params: `{ openBrowser?: true }`) →
     returns `{ ok, message, url }`.
   - Or command: `/digest-dashboard start`.
   This spawns the detached server (opens the browser to the rendered
   digest with action buttons) and starts the in-process listener. The page
   hot-reloads when the agent writes `digest.json`.
5. **Wait for a click.** Do not poll or prompt. The listener forwards a
   `page→agent` `action_click` event as a custom message
   (`customType: "aura-digest-event"`) that wakes the agent (a new turn). The
   message's `content` is `action.instruction`; `details` is the full action
   object (`{section, key, action, label, instruction, aura_use_case}`).
6. **On a forwarded click — act on exactly one action:**
   - **Load the `aura` skill** (the handoff rule below).
   - **Route on `action.aura_use_case`** to the matching use case:
     `task-management` / `artifact-management` / `capacity-planning` /
     `aura-digest` (for `run_setup`). Use `action.instruction` as the
     human-readable form of what to do.
   - **Set the in-flight lock** before acting: write
     `followup.currentlyWorkingOn` in `~/.pi/aura/digest.json` to the action's
     key (e.g. `"overdue/AURA-42"`) so the page shows the spinner + disables
     siblings (see the exact command in the `agent-ack-and-followup-writer`
     section).
   - **Act** (via the `aura` skill: look up the task, post/resolve, comment,
     etc., following its conventions — `is_ai_generated`, `mcp*` variants,
     `recordTaskProgress`).
   - **Write an `ack` event** to `~/.pi/aura/state.json` and **clear**
     `followup.currentlyWorkingOn` (exact commands below) so the page
     hot-reloads the buttons back to enabled.
   - **Report** the outcome concisely.
7. **Return to step 5** (wait for the next click), unless:
   - The user says "stop" / "done" / "that's all" → run the **clean close**
     (below).
   - `actions[]` is empty (nothing actionable from the start) → run the
     **clean close** immediately after starting.

### Clean close (terminal)

- Emit a **one-line verdict** from the digest, e.g.:
  `"Nothing needs you right now — N tasks committed, capacity X%, no reviews owed."`
  (template; the agent fills `queue` length, `capacity.committed_pct`,
  `reviews_owed.length`).
- **Stop the dashboard**:
  - Command: `/digest-dashboard stop` (kills the detached server PID, deletes
    `state.json` + `server-url.json`; the listener observes `state.json`
    deletion and exits).
- **Stop** — no dangling prompt. Do not re-prompt.

### Routing table (new section — reference, not the source of truth)

A table mirroring `buildActions` (`digest-actions-and-followup`), so the SKILL.md
reader understands which button becomes which capability. The source of truth
is `buildActions` in `scripts/src/build-actions.ts`; this table is a reference
and notes that.

| Section | `action` | `aura_use_case` | Notes |
|---|---|---|---|
| 🔴 Overdue | `advance` | `task-management` | max 3 |
| 🟡 Waiting on you | `unblock` | `task-management` | max 3 |
| Reviews I owe (current) | `review` | `artifact-management` | review-decision flow is REST/UI; route via artifact-management |
| Capacity >100% | `flag_capacity` | `capacity-planning` | 1 |
| Corrections (stale) | — | — | informational, no button |
| ⚠️ Warnings | `run_setup` | `aura-digest` | 1, only if warnings |
| Active queue | `advance` | `task-management` | fill to max 6 |

### Scope and handoff (updated)

Keep the "load the `aura` skill" rule — now **triggered by a forwarded click**
(step 6), not an ad-hoc `[ASK]`. Keep the conventions list
(`is_ai_generated`, `mcp*` variants, `recordTaskProgress`). Add: the agent must
**not** call `aura-mcp-dev` tools ad-hoc from `aura-digest`; route through
`aura`. Add: the teardown is `/digest-dashboard stop`.

### What's removed

- The `[ASK]` block (the dashboard's buttons *are* the ask).
- The "The digest does not mark notifications as read automatically" note can
  stay (still true) — keep it as a one-liner.

## The exact agent-side write commands (settled here)

The mechanism did **not** add helper subcommands to `aura-digest.mjs`, so the
agent uses small `node -e` one-liners. These are the canonical commands the
SKILL.md gives (slice 2 documents them):

### Set the in-flight lock (before acting)

```bash
node -e 'const p=require("fs"),os=require("os"),Path=require("path");const f=Path.join(os.homedir(),".pi","aura","digest.json");const d=JSON.parse(p.readFileSync(f,"utf8"));d.followup.currentlyWorkingOn="<KEY>";p.writeFileSync(f,JSON.stringify(d,null,2));'
```
where `<KEY>` is the action's key path, e.g. `overdue/AURA-42` (section + "/"
+ key).

### Write the ack + clear the lock (after acting)

```bash
node -e 'const p=require("fs"),os=require("os"),Path=require("path");const sf=Path.join(os.homedir(),".pi","aura","state.json");const df=Path.join(os.homedir(),".pi","aura","digest.json");const s=JSON.parse(p.readFileSync(sf,"utf8"));s.events.push({id:Date.now(),ts:new Date().toISOString(),dir:"agent→page",type:"ack",payload:{event_id:<CLICK_ID>,status:"done"}});p.writeFileSync(sf,JSON.stringify(s,null,2));const d=JSON.parse(p.readFileSync(df,"utf8"));d.followup.currentlyWorkingOn=null;p.writeFileSync(df,JSON.stringify(d,null,2));'
```
where `<CLICK_ID>` is the `id` of the `action_click` event the agent received.

Both trigger the server's `fs.watch` + SSE → the page hot-reloads automatically.

## Decisions settled here (for the tdd-worker)

1. **Steps 1–3 unchanged; Step 4 rewritten** to the start-dashboard → wait →
   act → ack+clear → report → wait/close flow.
2. **`save` + `cleanup` stay** (before starting the dashboard).
3. **The dashboard digest is already written by `fetch`** — no extra step in
   the SKILL.md.
4. **Prefer the `digest-dashboard-start` tool** over the `/digest-dashboard
   start` slash command (the tool returns `{ok, message, url}` the agent can
   use; the command just notifies).
5. **Routing table is a reference** in the SKILL.md; `buildActions` is the
   source of truth.
6. **Agent-side writes are `node -e` one-liners** (no helper subcommands
   exist; the arch spec offered them as an alternative but the mechanism
   didn't add them).
7. **Clean close** = one-line verdict + `/digest-dashboard stop` + stop.
8. **`[ASK]` block removed** (the dashboard is the ask).
9. **One action at a time**: set `currentlyWorkingOn` before acting, clear it
   (with the `ack`) after.

## Slice interface contracts

### Slice 1 — `interactive-flow-step` (m, hitl)
**Delivers:** the rewritten Step 4 (the 7-step flow above) + the updated
pipeline diagram/subcommand list (mention `digest.json` + `state.json` +
`/digest-dashboard start|stop`). Steps 1–3 unchanged.
**Contract for slice 2:** Step 4 references the exact ack/clear commands,
which slice 2 documents.
**Test seam:** a reader (the agent) follows it end-to-end against the landed
`digest-dashboard`.

### Slice 2 — `agent-ack-and-followup-writer` (s, hitl)
**Delivers:** the exact `node -e` commands for (a) setting
`followup.currentlyWorkingOn` before acting and (b) writing the `ack` +
clearing `currentlyWorkingOn` after acting, with the `<KEY>` / `<CLICK_ID>`
placeholders + the note that both trigger hot-reload.
**Contract for slice 3:** the routing-table reference + clean-close terminal.
**Test seam:** the commands run as `bash` one-liners against the real
`~/.pi/aura/` files.

### Slice 3 — `routing-table-and-clean-close-docs` (s, hitl)
**Delivers:** the "Routing table" section (the table above, referencing
`buildActions` as source of truth) + the "Clean close" terminal (one-line
verdict + `/digest-dashboard stop` + stop) + removal of the `[ASK]` block +
a one-line note that the dashboard is the ask.
**Contract for downstream (finalize):** the SKILL.md is the complete contract.

## Out of scope (do not touch)

- Any code (`digest-dashboard`, `digest-actions-and-followup` are landed;
  this task is prose-only).
- The `aura` skill's content (only routes into it).
- The markdown render path (Steps 1–3 unchanged).
- `aura-digest.mjs` (no new subcommands — the agent uses `node -e`).
