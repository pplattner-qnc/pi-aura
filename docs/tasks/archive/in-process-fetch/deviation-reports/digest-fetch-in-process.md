## Deviation report — digest-fetch-in-process

### API surface changes

- **Planned:** `digest-fetch` `execute` calls `fetchAction()` in-process (no
  spawn), passes an `onProgress` adapter that pushes `progress` StateEvents to
  `store.pushEvent`, calls `store.setCurrentDigest(result.digest)`, returns
  `{digest, report}` as tool text with `details` dropping `dir` (no temp dir).
- **Actual:** Exactly as planned.
  - `digest-fetch` imports `fetchAction` from `@pi-aura/shared/digest/aura-digest`
    and calls `fetchAction({ onProgress: adaptProgressToStore, ...injectedAuraClient })`.
    No `runAuraDigest(["fetch"])`, no spawn, no stdout parsing. ✅
  - `setCurrentDigest(result.digest)` is called after `fetchAction` returns —
    ends the task-2 empty-dashboard regression. ✅
  - The tool result is `AgentToolResult<Record<string, never>>` — `details`
    is `{}` (no `dir`). The return type changed from `{ dir?: string }` to
    `Record<string, never>` (the `dir` field is gone). ✅
  - Tool text is `JSON.stringify({ digest: result.digest, report: result.report })`. ✅
  - The "dashboard was down" one-shot warning is kept, based on
    `getDashboardUrl() === null`, and the digest is still populated regardless
    (setCurrentDigest ran). Added a null-guard `if (ctx.ui)` around the
    `notify` call (sensible defensive check — the test ctx may not have `ui`).
- **Impact:** The `details.dir` removal means `digest-save` (which currently
  takes `dir` from the fetch result) will break when a caller passes the
  fetch's `details` — but `digest-save` still spawns `runAuraDigest(["save",
  params.dir])` where `params.dir` is the *tool parameter* (the agent passes
  the `dir` explicitly), not the fetch's `details.dir`. The agent-facing
  handoff (the skill doc tells the agent to pass the `dir` to digest-save)
  is now mismatched: digest-fetch returns no `dir`, but digest-save still
  expects one. This is expected and explicitly deferred to slice 3
  (`drop-digest-json-and-rework-save`), which reworks digest-save. Between
  slice 2 and slice 3, the fetch→save handoff is temporarily broken at the
  agent-facing level — acceptable, since slices are sequential and slice 3
  follows immediately.

### The onProgress → pushEvent adapter

- **Planned:** `ProgressEvent` → `StateEvent` with `payload` matching
  `ProgressPayload` in `digest-types.ts` (`id, label, parentId?, status,
  startedAt, endedAt?, kind`). 1 event = 1 push (no batching). Store assigns
  monotonic id (overwrites `id:0`).
- **Actual:** Exactly as planned. The `adaptProgressToStore` function builds
  a `ProgressPayload` typed object with all 7 fields
  (`id, label, parentId, status, startedAt, endedAt, kind`) mapped 1:1 from
  the `ProgressEvent`, wraps it in a `StateEvent` (`id:0, ts, dir:"agent→page",
  type:"progress", payload`), and calls `pushEvent(stateEvent)`. The
  `ProgressPayload` type annotation on the payload ensures compile-time
  shape checking against `digest-types.ts`. ✅
- **Shape match confirmed:** `ProgressPayload` (digest-types.ts) = `{id:
  string; label: string; parentId?: string; status: "running"|"done"|"error";
  startedAt: number; endedAt?: number; kind: string}`. The adapter's payload
  has exactly these fields. The scheduler's `ProgressEvent` has the same
  shape. ✅ No mismatch.

### The auraClient injection seam for tests

- **Planned (arch spec):** "Decide in the slice: prefer injecting an
  `auraClient?` param into `fetchAction` (optional; defaults to
  `createDefaultAuraClient()`) so tests pass a fake without module mocking —
  cleaner."
- **Actual:** A **module-level setter** approach was chosen instead of
  passing `auraClient` directly through the tool's `execute`. The extension
  exports `_setAuraClientForTesting(client: AuraClient | undefined)` which
  sets a module-scope `injectedAuraClient`. `digest-fetch` spreads it into
  `fetchAction`'s opts: `...(injectedAuraClient ? { auraClient:
  injectedAuraClient } : {})`. In production, `injectedAuraClient` is
  `undefined` and `fetchAction` calls `createDefaultAuraClient()` internally.
- **Is it clean (not a hack)?** It's a reasonable, conventional test seam —
  a `_setXForTesting` function is a recognized pattern for injecting a
  collaborator that a tool constructs internally (the tool can't accept
  `auraClient` as a tool parameter since tool params are user-facing). The
  `@internal` JSDoc tag + the `_` prefix signal it's test-only. The
  alternative (passing `auraClient` as a tool parameter) would leak test
  infrastructure into the user-facing tool schema — worse. The `vi.mock`
  alternative (mocking the module) is heavier and breaks the "inject a fake
  AuraClient" convention in `docs/testing.md`. The chosen seam is clean,
  documented, and not a hack. ✅
  - One minor note: the setter is module-scope mutable state. Tests call
    `_setAuraClientForTesting(undefined)` in `afterEach` to clean up. This
    is standard for this pattern and not a leak risk in practice (tests are
    sequential within a file).

### Out-of-scope changes

- **digest-save:** NOT rewired. Still spawns `runAuraDigest(["save",
  params.dir])`. ✅ (Slice 3 owns this.)
- **digest-log:** NOT rewired. Still HTTP-POSTs to `/api/state` via
  `joinUrl(getDashboardUrl(), "/api/state")`. ✅ (Task 4 owns this.)
- **CLI digest.json:** NOT dropped from the CLI path. `fetchAction` still
  exports `DASHBOARD_DIGEST_PATH`; the CLI shim (slice 1) writes it. ✅
  (Task 5 owns CLI deletion.)
- **runAuraDigest / resolveAuraDigestScriptPath / spawn import:** NOT
  deleted. Still present for `digest-save`'s spawn path. ✅ (Slice 3 removes
  them.)
- **digest-types.ts:** NOT changed. ✅
- **store.ts:** NOT changed (slice 2 only *consumes* the store's existing
  exports). ✅
- **packages/shared/src/digest/aura-digest.ts:** NOT changed (slice 1
  already made it a pure function; slice 2 only calls it). ✅
- **Svelte view / Digest.svelte:** NOT changed. ✅

### setCurrentDigest ends the task-2 regression

- **Confirmed.** The test suite explicitly asserts `getCurrentDigest()` is
  not null after a successful fetch (even when the dashboard is down). The
  SSE test confirms a `'change'` event fans out to a connected `/events`
  client when `setCurrentDigest` fires. The dashboard's `/api/digest` now
  serves the populated digest. The task-2 empty-dashboard regression is
  ended. ✅

### Task doc update needed?

**No.** The implementation matches the arch spec and slice doc. The
`_setAuraClientForTesting` seam is a minor implementation detail worth noting
in `## Implementation notes` (the land-worker appends it), but it doesn't
change the task's interface contract. The `details.dir` → `digest-save`
handoff is temporarily broken between slice 2 and slice 3 (expected; slice 3
fixes it).

### User attention needed?

**No.** No API surfaces differ from the spec. The adapter payload matches
`ProgressPayload` exactly. The test seam is a clean, conventional
`_setAuraClientForTesting` pattern (not a hack). Scope did not drift —
digest-save, digest-log, the CLI, the Svelte view, the store, and the shared
core were all correctly left untouched. `setCurrentDigest` ends the
task-2 regression. All gates pass (19 files / 206 tests, all three
typechecks green).
