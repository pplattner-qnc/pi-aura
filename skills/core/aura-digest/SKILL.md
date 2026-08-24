---
name: aura-digest
description: Morning routine — fetches your Aura briefing, attention items, priority queue, capacity, and reviews via a deterministic Node script (aura-digest.mjs), verifies review states, then presents a concise digest with a diff against the last run. Use when the user wants to start their day, get an Aura digest, or see what changed since last time.
disable-model-invocation: true
---

# Aura — Digest

**Run the digest now.** Start at Step 1 (Fetch) immediately and drive the
whole pipeline through to the dashboard — do not ask the user for
confirmation, do not summarize the plan first. This skill was invoked
explicitly (via `/digest`), so the user already wants the flow to run.

Inline, tool-driven pipeline. The heavy lifting still happens in the compiled
`aura-digest.mjs` script, but this skill drives the flow through typed tools:
`digest-fetch` → augment → `digest-save` → `digest-dashboard-start` → wait for
clicks → act on one via the `aura` skill → `ack` + clear →
`digest-dashboard-stop`. The orchestrator (you) does the judgment work — filling
the situation summary, surfacing corrections, and ranking suggested actions —
between `digest-fetch` and `digest-save`.

```
 ┌─────────────────┐  {digest, report}   ┌──────────────┐  corrected digest   ┌──────────────┐
 │  digest-fetch   │ ───────────────────→ │  orchestrator │ ──────────────────→ │  digest-save  │
 │  (wraps         │  details.dir        │  fill summary + │  (pass details.dir) │  (last-digest  │
 │   aura-digest   │                     │  corrections + │                     │   store)      │
 │   .mjs fetch)   │                     │  re-rank actions │                   └──────────────┘
 └─────────────────┘                     └──────┬───────┘
                                                │
                                                ↓
                                         ┌─────────────────┐
                                         │ digest-dashboard- │
                                         │ start             │
                                         └─────────────────┘
```

The interactive dashboard reads `~/.pi/aura/digest.json` (actions + followup)
and `~/.pi/aura/state.json` (ack events), and is started/stopped via the
`digest-dashboard-start` and `digest-dashboard-stop` tools.

---

## Prerequisites

The script source lives in `scripts/src/` (shared with future scripts) and is
bundled by esbuild into `skills/core/aura-digest/dist/aura-digest.mjs`. The compiled `.mjs`
file is committed, so end users of the pi package don't need to build — but in
development, rebuild after editing `scripts/src/`:

```bash
make                # from repo root: install build deps, typecheck, build, verify
# or: make build     # typecheck + bundle (assumes `make install` was run once)
```

See the repo-root `Makefile`. Build tooling (esbuild, typescript, the MCP SDK)
is isolated in `scripts/package.json` with its own `node_modules` (gitignored),
keeping the published pi package manifest clean.

`digest-fetch` internally invokes `aura-digest.mjs fetch`, which reads
`~/.config/mcp/mcp.json` at runtime for the Aura server URL + bearer token. The
token is never baked into the bundle.

**Runtime dependency (dev-links Teamwork Graph layer):** `@napi-rs/keyring` is
declared in the root `package.json` `dependencies` so pi's `npm install` (run
automatically after cloning the package) places the platform-specific native
binding in the repo-root `node_modules/`, where Node resolves it from
`dist/aura-digest.mjs` via walk-up. The import is dynamic, so if the binding is ever
missing or unsupported on a platform, the Teamwork Graph layer silently skips
(dev-links still returns GitHub + Bitbucket results) rather than crashing.
Users who never authenticate the `atlassian` MCP server see the same graceful
skip — no setup skill is required.

---

## Step 1: Fetch

Call the `digest-fetch` tool. It runs `aura-digest.mjs fetch` under the hood,
creates its own random temp directory (`/tmp/aura-morning-<hex>/`), fetches all
Aura data via MCP-over-HTTP, **and verifies review states** by calling
`getArtifactApprovals` per candidate.

The tool returns a single text content containing `JSON.stringify({ digest, report })`
plus `details.dir` (the temp directory path). Parse the JSON and capture both
objects and `details.dir`.

`digest-fetch` also writes `~/.pi/aura/digest.json` for the dashboard (including
`actions[]` + `followup`).

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

## Step 2: Augment (orchestrator judgment)

`digest-fetch` has already done the verification — no MCP calls needed. Read
`report` from the tool result and use `verifications` directly:

- For each verification with `stale: true`, add a `DigestCorrection` (copy the
  `reported` state, `current.version`, `stale`, and `note`). These are
  rejections that have already been addressed by a newer version in review.
- For non-stale rejections (reported REJECTED, `stale: false`, still the current
  version), the rejection stands and needs revision — surface in the summary /
  suggested actions.

Then update the parsed `digest` object in place:
1. Fill `summary` — 2-3 sentence situation based on `getBoardBriefing` in
   `<dir>/raw.json` (where `<dir>` is `details.dir` from `digest-fetch`) + the
   verification findings.
2. Update each `reviews` entry with the current `version`, `decided_count`,
   `total_required`, and `decisions` from the matching
   `verifications[].current`. Build the decisions list from `open_reviews`
   (all reviewers) overlaid with verdicts, so pending reviewers appear.
3. Append `corrections` (the stale ones).
4. Re-rank `suggested_actions` using the verified state: overdue → waiting on
   you → current (non-stale) rejections needing revision → active committed
   work. Drop actions for stale rejections that are already addressed.

Write the corrected `digest` back to `<dir>/digest.json` (where `<dir>` is the
`details.dir` from the `digest-fetch` result). This ensures the subsequent
`digest-save` persists the corrected version.

### Diff against last digest (optional, for "what changed")

The `digest-save` tool only stores the corrected digest; it does not print a
structured diff. If you want to seed the summary with movement ("since last
time, AURA-X entered review, AURA-Y cleared…"), compare the corrected digest
against `~/.pi/aura/last-digest.json` yourself and refine the `summary`
accordingly.

On the first run (no last digest), there is nothing to compare.

---

## Step 3: Start the dashboard, then wait for clicks

After fetch → augment (Steps 1–2), drive the interactive dashboard.

1. **Save** the corrected digest as the last-digest store. Call the
   `digest-save` tool with the required `dir` parameter set to the
   `details.dir` value from `digest-fetch`.
2. **The dashboard digest is already written** — `digest-fetch` writes
   `~/.pi/aura/digest.json` (including `actions[]` + `followup`) automatically.
   No extra step.
3. **Start the dashboard** — call the `digest-dashboard-start` tool (params:
   `{ openBrowser?: true }`). It returns `{ ok, message, url }`.
4. **Wait for a click.** Do not poll or prompt. The listener forwards a
   `page→agent` `action_click` event as a custom message
   (`customType: "aura-digest-event"`, `triggerTurn: true`) that wakes a new
   turn. The message's `content` is `action.instruction`; `details` is the full
   action object (`{ section, key, action, label, instruction, aura_use_case }`).
5. **On a forwarded click — act on exactly one action:**
   - **Load the `aura` skill** (the handoff rule in "Scope and handoff" below).
   - **Route on `action.aura_use_case`** to the matching use case:
     `task-management` / `artifact-management` / `capacity-planning` /
     `aura-digest` (for `run_setup`). Use `action.instruction` as the
     human-readable form of what to do.
   - **Set the in-flight lock** before acting: write
     `followup.currentlyWorkingOn` in `~/.pi/aura/digest.json` to the action's
     key (e.g. `"overdue/AURA-42"`) so the page shows the spinner and disables
     sibling buttons. The exact command is documented in the next section.
   - **Act** via the `aura` skill: look up the task, post/resolve, comment,
     etc., following its conventions (`is_ai_generated`, `mcp*` variants,
     `recordTaskProgress`).
   - **Write an `ack` event** to `~/.pi/aura/state.json` and **clear**
     `followup.currentlyWorkingOn` in `~/.pi/aura/digest.json` so the page
     hot-reloads the buttons back to enabled. The exact command is documented
     in the next section.
   - **Report** the outcome concisely.
6. **Return to step 5** (wait for the next click), unless:
   - The user says "stop" / "done" / "that's all" → run the clean close below.
   - `actions[]` is empty (nothing actionable from the start) → run the clean
     close immediately after starting.

The digest does not mark notifications as read automatically.

### Agent-side writes (set the lock + ack/clear)

The dashboard mechanism does not provide helper subcommands for these two
writes, so use the `node -e` one-liners below. Both edit `~/.pi/aura/digest.json`
and/or `~/.pi/aura/state.json`; because the dashboard server `fs.watch`es these
files, each write emits an SSE and the page hot-reloads automatically. Set the
lock **before** acting; write the ack + clear the lock **after** acting.

#### Set the in-flight lock (before acting)

```bash
node -e 'const p=require("fs"),os=require("os"),Path=require("path");const f=Path.join(os.homedir(),".pi","aura","digest.json");const d=JSON.parse(p.readFileSync(f,"utf8"));d.followup.currentlyWorkingOn="<KEY>";p.writeFileSync(f,JSON.stringify(d,null,2));'
```

Replace `<KEY>` with the action's key path, e.g. `overdue/AURA-42`
(`<section>/<key>`). This makes the page show a spinner on that button and
disables the sibling action buttons.

#### Write the ack + clear the lock (after acting)

```bash
node -e 'const p=require("fs"),os=require("os"),Path=require("path");const sf=Path.join(os.homedir(),".pi","aura","state.json");const df=Path.join(os.homedir(),".pi","aura","digest.json");const s=JSON.parse(p.readFileSync(sf,"utf8"));s.events.push({id:Date.now(),ts:new Date().toISOString(),dir:"agent→page",type:"ack",payload:{event_id:<CLICK_ID>,status:"done"}});p.writeFileSync(sf,JSON.stringify(s,null,2));const d=JSON.parse(p.readFileSync(df,"utf8"));d.followup.currentlyWorkingOn=null;p.writeFileSync(df,JSON.stringify(d,null,2));'
```

Replace `<CLICK_ID>` with the `id` of the `action_click` event the agent
received (from the custom message's `details`, or the event's `id`). This
appends the ack to `state.json` and clears `followup.currentlyWorkingOn` in
`digest.json`, so the page re-enables the buttons.

Note: these one-liners assume `~/.pi/aura/digest.json` and
`~/.pi/aura/state.json` already exist (written by `digest-fetch` and
`digest-dashboard-start`). If a file is missing, re-run the dashboard or fetch
rather than creating it by hand.

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
cleanup.** The moment a forwarded click (Step 3 step 5) asks you to act on an
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

Interaction is via the dashboard's action buttons (Step 3); teardown is
`digest-dashboard-stop`.

---

## last-digest.json store

Lives at `~/.pi/aura/last-digest.json`. See `src/types.ts` (`LastDigestStore`
+ `DigestDiff`) for the authoritative definitions. `digest-save` writes this
store from the corrected digest in the temp directory returned by
`digest-fetch`.

| Field | Purpose |
|-------|---------|
| `schema_version` | Store format version (for forward-compatible migrations) |
| `presented_at` | When the last digest was shown (set by `save`) |
| `fetched_at` | When the data was fetched (mirrors `digest.meta.generated_at`) |
| `digest` | The full corrected `Digest` from the last presented run |

## digest.json contract

The versioned shape passed from fetch → orchestrator → save. See `src/types.ts`
(`Digest`) for the authoritative TypeScript definition.

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

Run from the repo root via `make`:

- `make typecheck` — TypeScript type-check (no emit)
- `make build` — esbuild bundle to `skills/core/aura-digest/dist/aura-digest.mjs`
- `make watch` — rebuild on change
- `make clean` — remove `scripts/node_modules` + built `dist/`

The script is plain ESM. `digest-fetch` internally invokes the bundled `.mjs`,
which uses the `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` with
the bearer token from `mcp.json` passed via `requestInit.headers`; the Atlassian
(Jira) client reuses the OAuth token pi-mcp-adapter persists in the OS keyring.
