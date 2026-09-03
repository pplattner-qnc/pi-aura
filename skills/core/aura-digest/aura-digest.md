---
name: aura-digest
description: Morning routine — fetches your Aura briefing, attention items, priority queue, capacity, and reviews via in-process tools (digest-fetch / digest-log / digest-finalize / digest-update / digest-ack + the digest-dashboard), verifies review states, then presents a concise digest with a diff against the last run. Use when the user wants to start their day, get an Aura digest, or see what changed since last time.
disable-model-invocation: true
---

# Aura — Digest

**Run the digest now.** Start at Step 1 (Start the dashboard) immediately and
drive the whole pipeline through to the dashboard — do not ask the user for
confirmation, do not summarize the plan first. This skill was invoked
explicitly (via `/aura-digest`), so the user already wants the flow to run.

Inline, tool-driven pipeline. The flow runs entirely in-process via typed tools:
`digest-dashboard-start` (ready state) → `digest-fetch` (streams the live tree) →
augment (agent calls `digest-log` per sub-step) → `digest-finalize` → wait for
clicks → act on one via the `aura` skill → `ack` + clear →
`digest-dashboard-stop`. The orchestrator (you) does the judgment work — filling
the situation summary, surfacing corrections, and ranking suggested actions —
between `digest-fetch` and `digest-finalize`.

```
 ┌─────────────────────┐  ┌─────────────────┐  {digest, report}   ┌──────────────┐
 │ digest-dashboard-  │→ │  digest-fetch    │ ───────────────────→ │  orchestrator │
 │ start (ready      │  │  (in-process     │  (in-memory;         │  fill summary + │
 │  state, browser)  │  │   fetchAction)  │  no details.dir)     │  corrections + │
 └─────────────────────┘  │  (streams live  │                     │  re-rank actions │
                           │   tree to the  │                     │  (digest-log    │
                           │   dashboard)   │                     │   per sub-step)  │
                           └─────────────────┘                     └──────┬───────┘
                                                       corrected digest    │
                                                                ─────────→│
                                                                           ↓
                                                                 ┌──────────────┐
                                                                 │  digest-finalize  │
                                                                 │  (saves the   │
                                                                 │   in-memory  │
                                                                 │   digest)    │
                                                                 │  (last-digest │
                                                                 │   store)      │
                                                                 └──────────────┘
```

Starting the dashboard first means the live progress tree (from `progress`
events) and the augment log (from `digest-log` calls) stream into the browser
while the fetch runs. If `digest-fetch` detects that the dashboard was never
started (`getDashboardUrl()` returns null — the in-process server isn't
running), the fetch still succeeds and populates the in-memory digest — a
one-shot warning is shown at the end instead of a live tree.

The interactive dashboard reads the **in-memory current digest** (served by
the in-process server's `/api/digest`, populated by `digest-fetch` /
`digest-update`) and the **in-memory event stream** (`/events` SSE, fed by
`pushEvent`), and is started/stopped via the `digest-dashboard-start` and
`digest-dashboard-stop` tools.

---

## Prerequisites

The digest runs entirely in-process via typed tools — no compiled script,
no bundle, no spawned child. The `digest-fetch` tool calls `fetchAction`
from `@pi-aura/shared/digest/aura-digest` directly in-process, fetching all
Aura data and verifying review states in a single pass.

`digest-fetch` reads `~/.config/mcp/mcp.json` at runtime for the Aura server
URL + bearer token (the same `mcp.json` the in-process MCP client uses).
The token is never baked into anything.

**Runtime dependency (dev-links Teamwork Graph layer):** `@napi-rs/keyring` is
declared in the root `package.json` `dependencies` so pi's `npm install` (run
automatically after cloning the package) places the platform-specific native
binding in the repo-root `node_modules/`, where the in-process `fetchAction`
resolves it. The import is dynamic, so if the binding is ever missing or
unsupported on a platform, the Teamwork Graph layer silently skips (dev-links
still returns GitHub + Bitbucket results) rather than crashing. Users who
never authenticate the `atlassian` MCP server see the same graceful skip — no
setup skill is required.

---

## Step 1: Start the dashboard

Call the `digest-dashboard-start` tool (params: `{ openBrowser?: true }`). It
spawns the dashboard server and opens the browser to a ready state. It returns
`{ ok, message, url }`. If the dashboard is already running, it is a no-op —
call it without worrying about double-starts.

Starting the dashboard first means the live progress tree (notifications,
tasks, reviews phase nodes streamed from the running fetch) and the augment
log (`digest-log` calls) appear in the browser as they happen, instead of a
blank screen.

If `digest-dashboard-start` fails (e.g. the server bundle is missing), surface
the message to the user and stop — do not continue the pipeline.

---

## Step 2: Fetch

Call the `digest-fetch` tool. It calls `fetchAction()` in-process, fetches all
Aura data, **and verifies review states** by calling `getArtifactApprovals`
per candidate. No spawned child, no temp dir.

The tool returns a single text content containing `JSON.stringify({ digest, report })`.
Parse the JSON and capture both objects.

While the fetch runs, progress events stream to the in-memory store (and fan
out via SSE to the dashboard) so the browser shows a live tree of operations.
If the dashboard was not running when `digest-fetch` started, the fetch still
succeeds and populates the in-memory digest — a one-shot pi-TUI warning is
shown at the end instead of a live tree.

The `report` object is the orchestrator's research basis, including:
- `artifacts_to_verify` (artifact IDs + reported versions + reported decisions,
  extracted from review notifications + pending reviews + waiting-on-others links)
- `verifications` — **automated**: for each candidate, `fetch` calls
  `getArtifactApprovals` and records the original reported state, the current
  version + decisions, a `stale` verdict (true when a rejection was reported on
  an older version and the artifact has since been advanced), and a human-readable
  note
- `notification_review_events`

If `digest-fetch` returns an error, surface the message to the user and stop —
do not continue the pipeline.

---

## Step 3: Augment (orchestrator judgment, with `digest-log`)

`digest-fetch` has already done the verification — no MCP calls needed. Read
`report` from the tool result and use `verifications` directly:

- For each verification with `stale: true`, add a `DigestCorrection` (copy the
  `reported` state, `current.version`, `stale`, and `note`). These are
  rejections that have already been addressed by a newer version in review.
- For non-stale rejections (reported REJECTED, `stale: false`, still the current
  version), the rejection stands and needs revision — surface in the summary /
  suggested actions.

Then update the parsed `digest` object in place:
1. Fill `summary` — 2-3 sentence situation based on the briefing data from the
   tool result's `digest` + the verification findings.
2. Update each `reviews` entry with the current `version`, `decided_count`,
   `total_required`, and `decisions` from the matching
   `verifications[].current`. Build the decisions list from `open_reviews`
   (all reviewers) overlaid with verdicts, so pending reviewers appear.
3. Append `corrections` (the stale ones).
4. Re-rank `suggested_actions` using the verified state: overdue → waiting on
   you → current (non-stale) rejections needing revision → active committed
   work. Drop actions for stale rejections that are already addressed.

Write the corrected `digest` back to the in-memory store with the
`digest-update` tool (pass the corrected `digest` object). The subsequent
`digest-finalize` persists that corrected version from the in-memory current
digest. (Do NOT call `digest-fetch` again — that re-fetches and overwrites
your corrections.)

### `digest-log` — push status lines to the dashboard

During this augment phase, call the `digest-log` tool with `{ message: "…" }`
for each major sub-step (e.g. "Verifying review states…", "Re-ranking
actions…"). The message appears as a status line in the dashboard's log list
below the progress tree, so the user sees live progress. It always records
the line to the in-memory event stream; the line renders in the dashboard
log list when the dashboard is running. It never fails the agent call.

### The dashboard during augment (the live tree stays)

After `digest-fetch` completes (the fetch root node is `done`), the dashboard
**stays** in the live-tree view with a **"Refining…"** header — it does NOT
flip to the digest yet. Your `digest-log` lines ("Verifying review states…",
"Re-ranking actions…") appear in the log list below the tree as you augment.
The view transitions to the digest **only** when you call `digest-finalize`
(see Step 4) — that signals the digest is final. So the user sees the live
refining the whole way through fetch + augment, then the finished digest.

### Diff against last digest (optional, for "what changed")

The `digest-finalize` tool only stores the corrected digest; it does not print a
structured diff. If you want to seed the summary with movement ("since last
time, AURA-X entered review, AURA-Y cleared…"), compare the corrected digest
against `~/.pi/aura/last-digest.json` yourself and refine the `summary`
accordingly.

On the first run (no last digest), there is nothing to compare.

---

## Step 4: Finalize, then wait for clicks

After start → fetch → augment (Steps 1–3), finalize the digest and drive the
interactive dashboard.

1. **Finalize** the corrected digest: call the `digest-finalize` tool. It
   does two things: (a) persists the current in-memory digest as the
   last-digest store (`~/.pi/aura/last-digest.json`, the diff baseline — the
   only disk write in the whole flow), and (b) signals the dashboard to
   transition from the live "Refining…" tree to the digest view. Run
   `digest-fetch` first to populate the in-memory store, and `digest-update`
   with the corrected digest before finalizing.
2. **The dashboard switches to the digest** on the `digest-finalize` signal
   — the live tree gives way to the interactive digest (sections + action
   buttons). No extra step.
3. **Wait for a click.** Do not poll or prompt. The listener forwards a
   `page→agent` `action_click` event as a custom message
   (`customType: "aura-digest-event"`, `triggerTurn: true`) that wakes a new
   turn. The message's `content` is `action.instruction`; `details` is the full
   action object (`{ section, key, action, label, instruction, aura_use_case }`).
4. **On a forwarded click — act on exactly one action:**
   - **Load the `aura` skill** (the handoff rule in "Scope and handoff" below).
   - **Route on `action.aura_use_case`** to the matching use case:
     `task-management` / `artifact-management` / `capacity-planning` /
     `aura-digest` (for `run_setup`). Use `action.instruction` as the
     human-readable form of what to do.
   - **Set the in-flight lock** before acting: call the `digest-update` tool
     with the current digest object and `followup.currentlyWorkingOn` set to
     the action's key (e.g. `"overdue/AURA-42"` = `<section>/<key>`) so the
     page shows the spinner and disables sibling buttons. (The tool updates the
     in-memory current digest + fans out a `'change'` SSE so the page
     hot-reloads.)
   - **Act** via the `aura` skill: look up the task, post/resolve, comment,
     etc., following its conventions (`is_ai_generated`, `mcp*` variants,
     `recordTaskProgress`).
   - **Acknowledge the click + clear the lock** after acting: call the
     `digest-ack` tool with the `event_id` of the `action_click` event the
     agent received (from the forwarded message's `details`, or the event's
     `id`). The tool appends an `agent→page` `'ack'` event to the in-memory
     stream + clears `followup.currentlyWorkingOn`, so the page re-enables the
     sibling buttons.
   - **Report** the outcome concisely.
5. **Return to step 4** (wait for the next click), unless:
   - The user says "stop" / "done" / "that's all" → run the clean close below.
   - `actions[]` is empty (nothing actionable from the start) → run the clean
     close immediately after saving.

The digest does not mark notifications as read automatically.

### In-flight lock + ack (the `digest-update` + `digest-ack` tools)

The dashboard's in-flight lock (`followup.currentlyWorkingOn` on the current
digest) and the click acknowledgement (an `agent→page` `'ack'` event) are now
first-class tools — no `node -e` one-liners. Set the lock **before** acting;
ack + clear the lock **after** acting.

#### Set the in-flight lock (before acting)

Call `digest-update` with the current digest object (as returned by
`digest-fetch`, or the corrected one from Step 3) and `followup.currentlyWorkingOn`
set to the action's key path, e.g. `"overdue/AURA-42"` (`<section>/<key>`).
The tool replaces the in-memory current digest + fans out a `'change'` SSE,
so the page shows a spinner on that button and disables the sibling action
buttons.

#### Write the ack + clear the lock (after acting)

Call `digest-ack` with `{ event_id: <CLICK_ID> }`, where `<CLICK_ID>` is the
`id` of the `action_click` event the agent received (from the forwarded
message's `details`, or the event's `id`). The tool appends the `ack` event
to the in-memory stream (fanned out via SSE) and clears
`followup.currentlyWorkingOn`, so the page re-enables the buttons.

Note: both tools operate on the in-memory store populated by `digest-fetch`.
Run `digest-fetch` first; if the dashboard is not running the tools are still
safe (the store updates; no SSE fans out).

### Clean close

- Emit a one-line verdict from the digest, e.g.:
  `"Nothing needs you right now — N tasks committed, capacity X%, no reviews owed."`
  Fill `N` from `queue.length`, `X` from `capacity.committed_pct`, and the
  reviews count from `reviews_owed.length`.
- Stop the dashboard by calling the `digest-dashboard-stop` tool.
- **Stop** — no dangling prompt. Do not re-prompt.

---

## Routing table

This table is a **reference** for which dashboard action routes to which
`aura` use case. The source of truth is `buildActions` in
`scripts/src/build-actions.ts`; keep this table in sync with it.

| Section | `action` | `aura_use_case` | Notes |
|---|---|---|---|
| 🔴 Overdue | `advance` | `task-management` | max 3 |
| 🟡 Waiting on you | `unblock` | `task-management` | max 3 |
| Reviews I owe (current) | `review` | `artifact-management` | review-decision flow is REST/UI; route via artifact-management |
| Capacity >100% | `flag_capacity` | `capacity-planning` | 1 |
| Corrections (stale) | — | — | informational, no button |
| ⚠️ Warnings | `run_setup` | `aura-digest` | 1, only if warnings |
| Active queue | `advance` | `task-management` | fill to max 6 |

---

## Scope and handoff

**This skill covers only the fetch + digest + verification + notification
cleanup.** The moment a forwarded click (Step 4 step 4) asks you to act on an
item — looking up tasks, posting or editing comments, reading or editing
artifacts, capacity changes, wiki work, code search, signals, etc. — **load
the `aura` skill** and follow its conventions for the remainder of the session.
Do not call `aura-mcp-dev` tools ad-hoc from this skill; route that work
through the `aura` skill instead. The teardown is `digest-dashboard-stop`.

Key conventions the `aura` skill enforces (so you don't silently miss them):
- Set `is_ai_generated: true` on AI-authored comments.
- Use the file-based `aura.mjs` workflow for artifact edits > ~500 chars.
- Prefer `mcp*` tool variants (`mcpGetArtifact`, `mcpUnifiedSearch`, …).
- Log activity with `recordTaskProgress` when you act on a task.

Interaction is via the dashboard's action buttons (Step 4); teardown is
`digest-dashboard-stop`.

---

## last-digest.json store

Lives at `~/.pi/aura/last-digest.json`. See `src/types.ts` (`LastDigestStore`
+ `DigestDiff`) for the authoritative definitions. `digest-finalize` writes this
store from the current in-memory digest (populated by `digest-fetch`).

| Field | Purpose |
|-------|---------|
| `schema_version` | Store format version (for forward-compatible migrations) |
| `presented_at` | When the last digest was shown (set by `save`) |
| `fetched_at` | When the data was fetched (mirrors `digest.meta.generated_at`) |
| `digest` | The full corrected `Digest` from the last presented run |

## digest contract

The versioned shape passed from fetch → orchestrator → save. See
`@pi-aura/shared/digest/types` (`Digest`) for the authoritative TypeScript
definition. (In-process, `meta.raw_path`/`meta.report_path` are empty strings —
the CLI path fills them; the in-memory store holds the object directly.)

| Field | Filled by | Purpose |
|-------|-----------|---------|
| `date` | fetch | YYYY-MM-DD |
| `summary` | **orchestrator** | 2-3 sentence situation (null in preliminary) |
| `attention` | fetch | overdue / waiting_on_you / waiting_on_others / notifications |
| `queue` | fetch | table rows: committed + active open tasks, with cap + hours |
| `capacity` | fetch | base / committed / free / utilization / total_hours |
| `reviews` | fetch (seeded) → **orchestrator** (filled) | artifact review states |
| `suggested_actions` | fetch (seeded) → **orchestrator** (re-ranked) | ranked action list |
| `corrections` | **orchestrator** | stale review-state corrections |
| `meta` | fetch | paths to raw/report files |

## Development

The digest flow runs entirely in-process via typed tools — there is no
digest bundle to build. The `task build` target in the repo-root `Taskfile.yml`
builds only the `aura` skill's `aura.mjs` bundle (a separate skill); the
digest tools call `fetchAction` / `saveLastDigest` from `@pi-aura/shared`
directly at runtime (loaded by pi's jiti, no compile step).

The shared MCP client (`@pi-aura/shared/mcp-client`) uses the
`@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` with the bearer
token from `mcp.json` passed via `requestInit.headers`; the Atlassian (Jira)
client reuses the OAuth token pi-mcp-adapter persists in the OS keyring.
