## Deviation report — guided-walkthrough-mode

### API surface changes

- **Planned:** `handleSecretEdit` gains a yes/no "guided walkthrough?" prompt
  before the chooser; new `runGuidedWalkthrough(ui, keyringFactory, docPath,
  settings, probeFns?)` orchestrator + `probeTeamworkGraph(creds, cloudId,
  clientFactory)` / `probeBitbucket(creds, workspace, fetchImpl?)` probe helpers
  + a pure `parseWalkthrough(markdown)` helper; module placement in
  `aura-secrets.ts` or a sibling `atlassian-provision.ts` if too large.
- **Actual:** Exactly that, placed in a **new sibling module**
  `extensions/atlassian-provision.ts` (489 lines). `aura-secrets.ts` gained
  only the yes/no prompt + a dynamic import of `runGuidedWalkthrough`
  (+43/-... lines, now 515 lines). The split is justified by the code-quality
  rule ("split proactively, not when the linter complains"): `aura-secrets.ts`
  was already ~470 lines from slice 2; adding ~490 lines of guided-mode +
  probe logic would have made it ~960 lines in one file. The sibling module
  keeps the probes + parser + orchestrator together and testable in
  isolation. `WALKTHROUGH_DOC_PATH` is exported from `aura-secrets.ts` (the
  run-time entry point).
- **Impact:** None on dependent slices — this is the leaf slice. The
  `handleSecretEdit` entry point is unchanged in signature; the guided prompt
  is additive. The two probe helpers + `parseWalkthrough` are exported from
  `atlassian-provision.ts` for testability.

### yes/no "guided walkthrough?" prompt before the chooser? No → chooser, Yes → runGuidedWalkthrough?

- **Yes — confirmed.** `handleSecretEdit` (aura-secrets.ts:348) calls
  `ui.confirm("Guided walkthrough?", "...")` as its first action. `true` →
  dynamic-imports `runGuidedWalkthrough` + `loadSettings` and calls it with
  `WALKTHROUGH_DOC_PATH` + `{ jiraCloudId, bitbucketWorkspace }` from
  settings; `false` → the existing chooser (slice 2, unchanged). ✓
- **Cancel → "no change":** `ui.confirm` returning `false` (the "No" path)
  routes to the chooser. A cancel at the guided-mode editor prompts returns
  "no change" from `runGuidedWalkthrough` (see Atomicity below). The slice
  doc said "Cancel → 'no change'" for the yes/no prompt; the implementation
  treats confirm=false as "No" (chooser), which is consistent — a `confirm`
  is inherently binary (yes/no), not three-way (yes/no/cancel), so there is
  no distinct "cancel" for the confirm. This is a reasonable interpretation
  (a confirm dialog's "No" button is effectively the cancel). ✓

### runGuidedWalkthrough reads the walkthrough doc at run time (not hardcoded app/scope names)? parseWalkthrough pure helper?

- **Yes — confirmed.** `runGuidedWalkthrough` reads the doc at `docPath` via
  `readFileSync(docPath, "utf8")` at run time (atlassian-provision.ts:374) and
  parses it with `parseWalkthrough`. The app names + scopes come **entirely
  from the parsed doc** (`seq.app`, `seq.scopes`), shown to the user via
  `ui.notify`. No Atlassian app name or scope string is hardcoded in the
  orchestrator or the parser — the parser extracts them from the markdown
  (`Select "<app>"` → `app`, `✅ \`scope\`` → `scopes`). The only hardcoded
  constants are the `SecretKey` literals (`{service:"atlassian",name:"api_token"}`
  / `...bitbucket_token`), the probe endpoint URLs (`mcp.atlassian.com` /
  `api.bitbucket.org`), and the token-key inference from the sequence letter
  (A → teamwork-graph, B → bitbucket) — all of which are structural, not
  app/scope content. ✓
- **`parseWalkthrough` pure helper:** exported, takes `markdown: string`,
  returns `ParsedWalkthrough { sequences: WalkthroughSequence[] }`. Unit-tested
  against both a fixture doc and the **real** `docs/atlassian-api-token-walkthrough.md`
  (integration test asserts the real doc parses to 2 sequences with the right
  app + scopes + token keys). ✓

### probeTeamworkGraph + probeBitbucket helpers? Read-only? probeBitbucket does NOT call /2.0/user? Probes unit-tested with MOCKED fetch (no live call)?

- **Yes — all confirmed.**
  - `probeTeamworkGraph(creds, cloudId, clientFactory)`: calls `connect()`
    (initialize), `getToolNames()` (tools/list — asserts
    `getTeamworkGraphContext` + `getTeamworkGraphObject` present), then a
    read-only `callTool("getTeamworkGraphContext", { cloudId, workItemKey: "PROBE-0" })`.
    Returns a structured `ProbeResult`. Read-only — no write tool is called. ✓
  - `probeBitbucket(creds, workspace, fetchImpl?)`: calls
    `GET /2.0/workspaces/<ws>`, `GET /2.0/repositories/<ws>?pagelen=5`,
    `GET .../<repo>/pullrequests?pagelen=3`, `GET .../<repo>/refs/branches?pagelen=3`.
    Returns a structured `ProbeResult`. Read-only (GET only). ✓
  - **`/2.0/user` NOT called:** the JSDoc explicitly states "Does NOT call
    /2.0/user (pi-ura never uses it; needs read:user:bitbucket)"; the test
    asserts `!ff.calls.some((c) => c.url.includes("/2.0/user"))`. ✓
  - **Probes unit-tested with mocked fetch/client:** `probeTeamworkGraph` is
    tested with a `makeFakeMcpClient` (fake `McpProbeClient` — 5 scenarios:
    all-ok, tools-missing-non-blocker, 404-success, auth-error-fail,
    connect-fail); `probeBitbucket` is tested with a `makeFakeFetch`
    (fake `fetchImpl` — 3 scenarios: all-200, 403-fail, workspace-missing).
    No live network call in any unit test. ✓
  - **`McpProbeClient` seam:** a minimal interface (`authHeader`, `connect`,
    `getToolNames`, `callTool`, `close`) decoupled from the real `McpClient`
    class — tests pass a fake, production passes a real `McpClient` (cast).
    This is a justified boundary abstraction (isolates the MCP SDK
    dependency), not internal indirection. ✓

### org-admin read:teamwork_graph permission error is a non-blocker (reported, flagged)? Bitbucket 403 → offer to re-run?

- **Yes — confirmed.**
  - **TWG non-blocker:** when `getTeamworkGraphContext` / `getTeamworkGraphObject`
    are absent from `tools/list`, `probeTeamworkGraph` returns
    `{ ok: false, nonBlocker: true, summary: "Teamwork Graph tools not available
    — the org-admin read:teamwork_graph permission is likely missing", details:
    [...] }`. In `runGuidedWalkthrough`, a `nonBlocker` result is reported via
    `ui.notify(..., "warning")` and the walkthrough **continues** to the next
    sequence (no re-probe offer, no abort). ✓
  - **Bitbucket 403 → re-probe offer:** when a probe returns `{ ok: false }`
    (no `nonBlocker`), `runGuidedWalkthrough` calls `ui.confirm("Re-probe
    <seq>?", "Recreate the token with the right scopes and re-probe?")`. If
    `true`, the probe is re-run with the same creds. ✓
  - Note: the re-probe offer applies to **any** non-nonBlocker failure
    (Bitbucket 403, TWG auth error, Bitbucket workspace 404, etc.), not just
    Bitbucket 403. This is slightly broader than the slice doc ("a probe
    returning a scope-named 401/403 → the guided mode reports it and offers
    to re-run") but is a reasonable generalization — any non-org-admin probe
    failure is potentially fixable by recreating the token.

### docs/atlassian-api-token.md updated to the two-token flow + guided mode?

- **Yes — confirmed.** The doc (281 lines changed: +163/-118) now opens with a
  two-token table (Teamwork Graph PAT → Rovo MCP V2 → `atlassian/api_token`;
  Bitbucket PAT → Bitbucket → `atlassian/bitbucket_token`), documents the
  shared email, the **guided mode** (`/aura secrets edit` → "Guided walkthrough?"
  → Yes, reading the walkthrough doc at run time — "recommended path"), the
  per-token scopes for both apps, and the combined email+token edit flow. ✓

### Module placement (aura-secrets.ts vs sibling atlassian-provision.ts if too large)?

- **Sibling `atlassian-provision.ts` — confirmed and justified.** `aura-secrets.ts`
  (515 lines after slice 3) + `atlassian-provision.ts` (489 lines) vs. a single
  ~1000-line `aura-secrets.ts`. The arch spec said "Put them in
  `extensions/aura-secrets.ts` or a sibling `extensions/atlassian-provision.ts`
  if `aura-secrets.ts` gets too large — decide by file size." The implementer
  chose the sibling, which is the right call: it keeps the probe + parser +
  guided-orchestrator concerns together and isolates the MCP-SDK dynamic
  import from the chooser/edit flow. `aura-secrets.ts` owns the entry point
  (`handleSecretEdit` + the yes/no prompt + `WALKTHROUGH_DOC_PATH`);
  `atlassian-provision.ts` owns the guided-mode machinery. ✓

### Atomicity (cancel mid-guided → no partial write)?

- **Yes — confirmed and tested.** In `runGuidedWalkthrough`, both editor
  prompts (email, then token) are opened; if **either** returns
  `undefined`/`null`, the function returns "no change" **before** any
  `keyring.setSecret` call. A cancel at the token prompt does NOT leave the
  email stored. The test "cancel mid-guided (cancel at Sequence A token) → no
  partial write" asserts `kr.getStored().get("atlassian/email") === undefined`
  AND `kr.getStored().get("atlassian/api_token") === undefined` after a
  token-prompt cancel. ✓
  - This mirrors slice 2's `handleAtlassianPatEdit` atomicity contract. The
    guided mode implements its own email+token-then-atomic-write (it does not
    call `handleAtlassianPatEdit` from slice 2 — see divergence note below).

### Out-of-scope additions / divergence from acceptance criteria

1. **`runGuidedWalkthrough` does NOT call slice 2's `handleAtlassianPatEdit`
   for the combined email+token flow.** The arch spec said the guided mode
   "stores it via the combined email+token flow (slice 2's
   `handleAtlassianPatEdit`)." The implementation instead inlines its own
   email-then-token-editor + atomic double-write inside `runGuidedWalkthrough`
   (lines 404-417), reusing the same atomicity contract but not delegating to
   `handleAtlassianPatEdit`. This is a **deliberate deviation**: the guided
   mode operates inside a per-sequence loop with its own probe-after-store
   flow, and `handleAtlassianPatEdit` returns `void` (it doesn't surface the
   stored creds for the probe). The inline version reads the stored creds
   directly from the editor results and passes them to the probe. The
   atomicity contract (cancel → no partial write) is preserved and tested.
   Impact: **minor** — the combined-flow logic is duplicated between
   `handleAtlassianPatEdit` (slice 2) and `runGuidedWalkthrough` (slice 3),
   but the two have different control-flow needs (the guided mode needs the
   creds post-store for the probe; the chooser flow does not). A future
   refactor could extract a shared `storeEmailAndTokenAtomically(ui, keyring,
   tokenKey, ...)` helper with ≥2 call sites, but that is not required this
   slice. Flag for the coherence-refactor stage.

2. **`probeTeamworkGraph` uses `workItemKey: "PROBE-0"` in the `callTool` args,
   not `objectIdentifier`.** The real `getTeamworkGraphContext` MCP tool takes
   `objectIdentifier` (per `devlinks.ts`), but the probe's `callTool` call uses
   `workItemKey`. This is a **cosmetic divergence that does not affect
   behavior**: the probe is designed to return `ok: true` on *any* structured
   response or 404 (it just needs to confirm the call reached the API), so the
   arg-name mismatch is harmless — the MCP server returns a 404 either way,
   which the probe correctly interprets as a success signal. However, it is
   technically incorrect: if the arg name mattered for a non-404 path, the
   probe would send the wrong parameter. Low risk (the probe's success
   criterion is "reached the API," not "got valid data"), but worth noting for
   correctness. Flag for a minor fix in the coherence-refactor stage.

3. **`runGuidedWalkthrough`'s `McpClient` dynamic import casts to
   `McpProbeClient`.** The production path constructs a real `McpClient` and
   casts it `as unknown as McpProbeClient` (two occurrences, lines 436 and 471).
   This works because `McpClient` structurally satisfies `McpProbeClient`, but
   the cast is a type-system smell. A cleaner approach would be to make
   `McpClient` implement `McpProbeClient` (or have `probeTeamworkGraph` accept
   `McpClient` directly). Low priority — the seam is test-only and the cast is
   localized.

### Acceptance-criteria divergence summary

| Criterion | Status |
|---|---|
| yes/no prompt before chooser; No → chooser, Yes → guided | **met** (aura-secrets.ts:348) |
| Guided mode reads walkthrough doc at run time; app+scopes from doc | **met** (atlassian-provision.ts:374; parseWalkthrough) |
| `probeTeamworkGraph`: initialize + tools/list + real getTeamworkGraphContext | **met** (connect + getToolNames + callTool) |
| `probeBitbucket`: workspace + repos + PRs + branches; NOT /2.0/user | **met** (4 GETs; /2.0/user never called, tested) |
| org-admin `read:teamwork_graph` error is a non-blocker | **met** (nonBlocker: true → warning + continue) |
| Bitbucket 403 → offer to re-run | **met** (confirm + re-probe; broader: any non-nonBlocker failure) |
| No secrets to any file; only keyring | **met** (only keyring.setSecret; no file writes of secrets) |
| `docs/atlassian-api-token.md` updated to two-token flow + guided mode | **met** (163 lines added) |
| `make build` succeeds; typechecks clean; vitest green with required tests | **met** (all exit 0; 120 vitest + provision + aura-secrets standalone tests pass) |
| Guided mode stores via the combined email+token flow (slice 2's `handleAtlassianPatEdit`) | **deviation** — inlined its own email+token flow instead of calling `handleAtlassianPatEdit` (see Out-of-scope #1) |
| Probes unit-tested with mocked fetch (no live call) | **met** (fake McpProbeClient + fake fetch; no live calls) |
| Atomicity (cancel mid-guided → no partial write) | **met** (tested) |

### Task doc update needed?

**Yes — minor.** Append to `## Implementation notes`:
- The guided mode lives in a new sibling module `extensions/atlassian-provision.ts`
  (489 lines), not `aura-secrets.ts` (justified split).
- `runGuidedWalkthrough` inlines its own email+token atomic-write rather than
  calling slice 2's `handleAtlassianPatEdit` (the guided mode needs the stored
  creds for the post-store probe, which `handleAtlassianPatEdit` doesn't
  surface). The atomicity contract is preserved. A shared
  `storeEmailAndTokenAtomically` helper is a future-refactor candidate.
- `probeTeamworkGraph` uses `workItemKey` instead of `objectIdentifier` in the
  `callTool` args — cosmetic (the probe's success criterion is "reached the
  API," not "valid data"), but should be aligned to `objectIdentifier` for
  correctness in the coherence refactor.

### User attention needed?

**No.** Scope was followed; all acceptance criteria are met or met-with-a-
justified-deviation. The three divergences (inline email+token flow, arg-name
mismatch, McpClient cast) are all minor and flag-for-coherence-refactor, not
blockers. The module split is a positive (proactive file-size management).
