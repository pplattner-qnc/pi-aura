---
name: aura-digest
description: Morning routine — fetches your Aura briefing, attention items, priority queue, capacity, and reviews via a deterministic Node script (aura-digest.mjs), verifies review states, then presents a concise digest with a diff against the last run. Use when the user wants to start their day, get an Aura digest, or see what changed since last time.
---

# Aura — Digest

Inline, script-driven pipeline. One deterministic Node script (`aura-digest.mjs`) with
six subcommands — `fetch`, `render`, `cleanup`, `save`, `diff`, `last` —
handles all data gathering, formatting, temp-file cleanup, and the persistent
last-digest store. The orchestrator (you) does the judgment work — filling the
situation summary, surfacing corrections, and ranking suggested actions —
between `fetch` and `render`.

```
 ┌────────────────────┐  raw.json    ┌──────────────┐  digest.json   ┌────────────────────┐
 │  aura-digest.mjs   │ ──────────→ │  orchestrator │ ────────────→ │  aura-digest.mjs   │ → markdown
 │  fetch             │  digest.json │  fill summary + │              └────────────────────┘
 │  (Aura MCP +       │  report.json │  corrections +  │
 │   verification)    │              │  re-rank actions │
 └────────────────────┘              └──────┬───────┘
                                          │ (after presenting)
                                          ↓
                                   ┌────────────────────┐   ~/.pi/aura/
                                   │  aura-digest.mjs   │ → last-digest.json
                                   │  save              │
                                   └────────────────────┘
                                          │ (next run, before presenting)
                                          ↓
                                   ┌────────────────────┐
                                   │  aura-digest.mjs   │ → what changed
                                   │  diff              │
                                   └────────────────────┘
                                          │
                                          ↓
                                   ┌────────────────────┐
                                   │  aura-digest.mjs   │
                                   │  cleanup           │
                                   └────────────────────┘
```

---

## Prerequisites

The script source lives in `scripts/src/` (shared with future scripts) and is
bundled by esbuild into `skills/aura-digest/dist/aura-digest.mjs`. The compiled `.mjs`
file is committed, so end users of the pi package don't need to build — but in
development, rebuild after editing `scripts/src/`:

```bash
make                # from repo root: install build deps, typecheck, build, verify
# or: make build     # typecheck + bundle (assumes `make install` was run once)
```

See the repo-root `Makefile`. Build tooling (esbuild, typescript, the MCP SDK)
is isolated in `scripts/package.json` with its own `node_modules` (gitignored),
keeping the published pi package manifest clean.

`aura-digest.mjs fetch` reads `~/.config/mcp/mcp.json` at runtime for the Aura server
URL + bearer token. The token is never baked into the bundle.

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

```bash
OUT="$(node <skill-dir>/dist/aura-digest.mjs fetch 2>/dev/null | sed -n 's/^output directory: //p')"
```

`fetch` creates its own random temp directory (`/tmp/aura-morning-<hex>/`),
fetches all Aura data via MCP-over-HTTP, **and verifies review states** by
calling `getArtifactApprovals` per candidate. It prints
`output directory: /tmp/aura-morning-<hex>/` to stdout (progress goes to
stderr). `$OUT` captures that path.

This writes three files in `$OUT`:
- `raw.json` — full API response bundle
- `digest.json` — preliminary digest with `summary: null`, `corrections: []`,
  rule-based `suggested_actions`, and `reviews` seeded from
  `waiting_on_others` (versions left at 0 — the digest stays conservative and
  makes no unverified claims)
- `report.json` — the orchestrator's research basis, including:
  - `artifacts_to_verify` (artifact IDs + reported versions + reported
    decisions, extracted from review notifications + pending reviews +
    waiting-on-others links)
  - `verifications` — **automated**: for each candidate, `fetch` calls
    `getArtifactApprovals` and records the original reported state, the
    current version + decisions, a `stale` verdict (true when a rejection was
    reported on an older version and the artifact has since been advanced),
    and a human-readable note
  - `notification_review_events`

## Step 2: Augment (orchestrator judgment)

`fetch` has already done the verification — no MCP calls needed. Read
`$OUT/report.json` and use `verifications` directly:

- For each verification with `stale: true`, add a `DigestCorrection` (copy the
  `reported` state, `current.version`, `stale`, and `note`). These are
  rejections that have already been addressed by a newer version in review.
- For non-stale rejections (reported REJECTED, `stale: false`, still the
  current version), the rejection stands and needs revision — surface in the
  summary / suggested actions.

Then update `$OUT/digest.json`:
1. Fill `summary` — 2-3 sentence situation based on `getBoardBriefing` (in
   `raw.json`) + the verification findings.
2. Update each `reviews` entry with the current `version`, `decided_count`,
   `total_required`, and `decisions` from the matching
   `verifications[].current`. Build the decisions list from `open_reviews`
   (all reviewers) overlaid with verdicts, so pending reviewers appear.
3. Append `corrections` (the stale ones).
4. Re-rank `suggested_actions` using the verified state: overdue → waiting on
   you → current (non-stale) rejections needing revision → active committed
   work. Drop actions for stale rejections that are already addressed.

Write the corrected `digest.json` back to `$OUT/digest.json` (or a
`$OUT/digest-corrected.json` copy).

### Diff against last digest (optional, for "what changed")

```bash
node <skill-dir>/dist/aura-digest.mjs diff "$OUT"   # JSON to stdout
```

**Run `diff` *after* augmenting**, not before. It compares the current
*corrected* `digest.json` to the last saved digest
(`~/.pi/aura/last-digest.json`) and prints a structured `DigestDiff`: queue
added/removed/status-changed, capacity delta, reviews added/progressed,
corrections resolved/new, overdue added/cleared, and days elapsed. On the first
run (no last digest) prints `{"first_run": true}`.

Comparing the *preliminary* digest (before corrections are filled) would
falsely report `corrections_resolved` — the preliminary digest has
`corrections: []` because that field is filled by the orchestrator, not
`fetch`. Always diff the corrected digest. Use the diff to seed the summary with
movement ("since last time, AURA-X entered review, AURA-Y cleared…") — if you
use it, refine the `summary` accordingly.

## Step 3: Render

```bash
node <skill-dir>/dist/aura-digest.mjs render "$OUT"           # markdown to stdout
node <skill-dir>/dist/aura-digest.mjs render "$OUT" out.md    # markdown to a file
```

`render` reads `<dir>/digest.json` and renders the final digest markdown. Pass
a second arg to write to a file instead of stdout.

## Step 4: Present, save, and act

Present the rendered digest. Then:

- Mark notifications read via MCP: `aura-mcp-dev_markAllNotificationsRead()`
- **Save the presented digest** as the last-digest store (so the next run can
  diff against it):
  ```bash
  node <skill-dir>/dist/aura-digest.mjs save "$OUT"
  ```
- **Clean up the temp directory** — it was only transport:
  ```bash
  node <skill-dir>/dist/aura-digest.mjs cleanup "$OUT"
  ```

`save` writes `~/.pi/aura/last-digest.json` with the digest, `presented_at`
(now), `fetched_at`, and a `schema_version`. Call it *after* presenting and
*before* cleanup.

---

## Scope and handoff

**This skill covers only the fetch + digest + verification + notification
cleanup.** The moment you move on to any further Aura work — looking up
tasks, posting or editing comments, reading or editing artifacts, capacity
changes, wiki work, code search, signals, etc. — **load the `aura` skill** and
follow its conventions for the remainder of the session. Do not call
`aura-mcp-dev` tools ad-hoc from this skill; route that work through the `aura`
skill instead.

Key conventions the `aura` skill enforces (so you don't silently miss them):
- Set `is_ai_generated: true` on AI-authored comments.
- Use the file-based `aura.mjs` workflow for artifact edits > ~500 chars.
- Prefer `mcp*` tool variants (`mcpGetArtifact`, `mcpUnifiedSearch`, …).
- Log activity with `recordTaskProgress` when you act on a task.

**[ASK]** only if there are actionable items:

- Anything overdue or waiting on you → "These need your attention. Want to tackle any now?"
- Reviews pending → "You have N reviews waiting. Start any?"
- Over-committed → "You're at X% commitment — adjust or flag to manager?"
- Otherwise → "Ready to go?"

---

## last-digest.json store

Lives at `~/.pi/aura/last-digest.json`. See `src/types.ts` (`LastDigestStore`
+ `DigestDiff`) for the authoritative definitions.

| Field | Purpose |
|-------|---------|
| `schema_version` | Store format version (for forward-compatible migrations) |
| `presented_at` | When the last digest was shown (set by `save`) |
| `fetched_at` | When the data was fetched (mirrors `digest.meta.generated_at`) |
| `digest` | The full corrected `Digest` from the last presented run |

`diff` reads this and compares it to the current `<dir>/digest.json`,
emitting a `DigestDiff`. `last` prints the store as-is (for inspection).

## digest.json contract

The versioned shape passed from fetch → orchestrator → render. See
`src/types.ts` (`Digest`) for the authoritative TypeScript definition.

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
- `make build` — esbuild bundle to `skills/aura-digest/dist/aura-digest.mjs`
- `make watch` — rebuild on change
- `make clean` — remove `scripts/node_modules` + built `dist/`
- Test the renderer with a saved fixture:
  `node skills/aura-digest/dist/aura-digest.mjs render <dir-with-digest.json>`

The script is plain ESM. `fetch` uses the `@modelcontextprotocol/sdk`
`StreamableHTTPClientTransport` with the bearer token from `mcp.json` passed
via `requestInit.headers`; the Atlassian (Jira) client reuses the OAuth token
pi-mcp-adapter persists in the OS keyring.
