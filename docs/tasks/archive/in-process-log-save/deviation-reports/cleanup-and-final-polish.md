## Deviation report — cleanup-and-final-polish

### API surface changes
- **Planned:** Polish the `digest-log` tool `description` + the skill-doc
  `digest-log` section to reflect the always-records semantics (no more
  "A no-op if the dashboard is not running"). Confirm `digest-save` is final
  (unchanged). Grep `index.ts` for no residual dead refs (`joinUrl`,
  `readDashboardUrl`, agent-side `/api/state` fetch). No behavior change.
- **Actual:** Exactly as planned. Two doc-only edits + one new structural
  test file. No code/logic change.
  - `index.ts` line 433: the `digest-log` tool `description` was changed from
    "A no-op if the dashboard is not running — it never fails the agent's
    call." to "Always records the status line to the in-memory event stream;
    it renders in the dashboard log list when the dashboard is running. Never
    fails the agent call (the line is recorded regardless of whether the
    dashboard is open)." The `promptSnippet` was unchanged (still "digest-log —
    append a status line to the live digest dashboard."). The first sentence
    of the description was preserved ("Push a single status line to the
    running digest dashboard's log list (below the progress tree)."). No
    change to the `execute` body, `parameters`, `promptGuidelines`, or any
    other tool field.
  - `aura-digest.md` lines 171–175: the skill-doc `digest-log` section was
    changed from "It is a no-op if the dashboard is not running — it never
    fails the agent's call." to "It always records the line to the in-memory
    event stream; the line renders in the dashboard log list when the
    dashboard is running. It never fails the agent call." The surrounding
    prose ("During this augment phase, call the `digest-log` tool…") was
    unchanged. Minimal — not a full skill-doc rewrite (task 5 owns that).
  - `test/digest-dashboard/cleanup-and-final-polish.test.ts` (new, 105 lines,
    11 tests): structural/grep-style tests asserting no dead refs
    (`joinUrl`/`readDashboardUrl` absent; `digest-log` execute has no
    `fetch(`), `digest-save` is in its final state (uses `getCurrentDigest` +
    `saveLastDigest`, no `spawn`, errors on null), the tool description no
    longer says "A no-op if the dashboard is not running" and now says
    "records", the skill-doc no longer says "It is a no-op if the dashboard
    is not running" and now says "always records". All 11 pass.
- **Impact:** None on dependent slices — this is the final slice of the task.
  The tool description polish is advisory (the agent reads it to decide when
  to call `digest-log`); the semantics are unchanged from slice 1 (always-safe
  direct push). The skill-doc prose is guidance for the agent; task 5 does
  the full rewrite.

### Abstraction usage
- **Used/was specified: yes.**
  - No new abstractions. The slice is polish + verification only. ✅
  - `store.pushEvent` (slice 1), `saveLastDigest`/`getCurrentDigest` (task 3),
    `getDashboardUrl` (task 2, stays for `digest-fetch`) — all confirmed
    present, none added or removed. ✅
  - The `/api/state` POST route in `server.ts` was NOT removed (confirmed
    present at line 155 — the browser's `action_click` still POSTs to it;
    only the agent's self-POST is gone, which slice 1 removed). ✅
  - The skill-doc edit was minimal (one paragraph), not a full rewrite (task
    5 owns that). ✅

### digest-save unchanged (confirmed final)
- `digest-save`'s `execute` body is **byte-identical** to its state on
  `task/in-process-log-save` (before this slice). Confirmed via a direct diff
  of the `digest-save` registerTool block: zero lines changed. It uses
  `getCurrentDigest()` → `saveLastDigest(digest)`, no `dir` param, no `spawn`,
  errors when `digest` is null. This matches the arch spec's "save-final seam:
  digest-save unchanged (already final from task 3) — confirm." ✅

### Out-of-scope changes
- **None.** The slice did NOT:
  - Change `digest-log`'s `execute` body (slice 1's domain — the only change
    to `digest-log` is the `description` string, which is a doc field, not
    code). ✅ (confirmed: the `execute` body is identical to slice 1's state;
    the only diff in the `digest-log` block is the description line).
  - Delete the CLI shim (`scripts/src/aura-digest.ts`) — confirmed identical
    to the task branch. ✅ (task 5).
  - Remove the `/api/state` POST route in `server.ts` — confirmed still
    present (line 155). ✅ (browser `action_click`).
  - Touch `digest-fetch`'s execute — confirmed identical. ✅
  - Touch `server.ts` — confirmed identical. ✅
  - Touch `store.ts` — confirmed identical. ✅
  - Touch the digest data model, `digest-types.ts`, or the Svelte view. ✅
- The `docs/tasks/state.yaml` diff is a gitignored workflow artifact (the
  Pi task-state tool wrote `task: in-process-log-save`); it's tracked despite
  `.gitignore` (committed pre-rule) but is not a code change and is
  reverted/discarded at finalize. Not a scope violation.

### Residual dead refs
- **None.** Grep of `index.ts` on the slice branch:
  - `joinUrl` — absent (slice 1 dropped the import). ✅
  - `readDashboardUrl` — absent (task 1/core-move removed it; never
    re-introduced). ✅
  - agent-side `fetch(` to `/api/state` in `digest-log`'s execute — absent
    (slice 1 rewired to `pushEvent`). ✅
  - The `/api/state` POST *route* in `server.ts` — still present (correct:
    the browser POSTs `action_click` to it; only the agent's self-POST is
    gone). ✅

### Task doc update needed?
**No.** The implementation matches the arch spec and slice doc. The
`## Implementation notes` section (which the land-worker appends to) should
note:
- `digest-log` tool `description` + the skill-doc `digest-log` section were
  polished to "always records" semantics (no behavior change).
- `digest-save` confirmed final (unchanged from task 3).
- No residual dead refs; `/api/state` POST route retained (browser).
- New `cleanup-and-final-polish.test.ts` (11 structural/grep tests).

### User attention needed?
**No.** No API surfaces differ from the spec. `digest-save` logic was NOT
changed (confirmed byte-identical). No dead refs remain. Scope did not drift
— the only changes are the two doc-only description/polish edits + one new
structural test file. The `state.yaml` diff is a gitignored workflow
artifact, not a code change.
