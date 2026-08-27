---
kind: task
type: feature
slug: wire-bitbucket-guided-edit
title: Wire bitbucket.ts to the Bitbucket token + combined email+token edit flow + guided walkthrough
map: atlassian-bitbucket-token
status: done
slices:
- wire-bitbucket-reader
- combined-pat-edit-flow
- guided-walkthrough-mode
---

## User-visible outcome

`/aura secrets edit` first asks "Want a guided walkthrough?" **No** → a chooser
of per-secret items, where the two Atlassian items are **"Atlassian Teamwork
Graph token"** and **"Atlassian Bitbucket token"** — each prompts for the email
and then the token in one flow (no standalone email item). **Yes** → the guided
walkthrough steps the user through creating both scoped PATs at the Atlassian
token page (the agent says what to answer, the user confirms, the agent stores
+ probes each token). `bitbucket.ts` reads the Bitbucket token (not the
Teamwork Graph token); the two dev-links layers degrade independently.

## User story

- `/aura secrets edit` → "Want a guided walkthrough?" → **Yes**: the agent walks
  the user through creating the Rovo MCP V2 token + the Bitbucket token, storing
  + probing each, using the walkthrough doc as the script.
- → **No**: the chooser offers "Aura PAT", "Atlassian Teamwork Graph token",
  "Atlassian Bitbucket token". Picking a Teamwork/Bitbucket item prompts for the
  email and then the token in one flow.
- `digest-fetch`'s Teamwork Graph layer uses the Teamwork Graph token; the
  Bitbucket layer uses the Bitbucket token. Either layer skips with its own
  `/aura secrets edit` warning if its token is missing.

## Scope boundaries

In scope:
- `scripts/src/bitbucket.ts`'s `loadCreds` calls `readBitbucketCredentials` (from
  the infra task); `atlassianClient` unchanged.
- The two dev-links layers degrade independently (per-token missing warnings).
- `/aura secrets edit` chooser: remove the standalone "Atlassian email" item;
  the two Atlassian token items each prompt email-then-token in one flow.
  Add the yes/no "guided walkthrough?" prompt before the chooser.
- The guided walkthrough mode drives from `docs/atlassian-api-token-walkthrough.md`
  (produced by the manual task): steps the user through creating both PATs,
  stores + probes each.
- `docs/atlassian-api-token.md` updated to the two-token flow.

Out of scope (see map.md):
- OAuth, auto-discovery, a new slash command, transport/REST-path changes,
  moving `defaultWorkspace` to the keyring.

## Acceptance criteria

- [ ] `bitbucket.ts`'s `loadCreds` uses `readBitbucketCredentials` (Bitbucket
      token), not `readAtlassianCredentials`. Basic-auth header + REST paths
      unchanged. `atlassianClient` unchanged.
- [ ] The Bitbucket layer degrades with a warning naming `/aura secrets edit`
      when `atlassian/bitbucket_token` is missing; the Teamwork Graph layer is
      unaffected and vice versa. The two layers' independence is tested.
- [ ] `/aura secrets edit` asks a yes/no "guided walkthrough?" prompt before
      the chooser. **No** → the chooser. **Yes** → the guided flow.
- [ ] The chooser no longer has a standalone "Atlassian email" item. It offers
      "Aura PAT", "Atlassian Teamwork Graph token", "Atlassian Bitbucket token".
      Picking a Teamwork/Bitbucket item prompts for the email and then the
      token (two editor prompts, one logical flow); both are stored under the
      right keyring keys. The Aura PAT item is unchanged.
- [ ] The guided mode drives from `docs/atlassian-api-token-walkthrough.md`:
      it steps through creating the Rovo MCP V2 token (app + scopes from the
      doc), stores it via the combined email+token flow, runs the direct probe;
      then the Bitbucket token likewise. It does not put secrets in any file.
- [ ] `docs/atlassian-api-token.md` documents the two-token flow (Rovo MCP V2 +
      Bitbucket apps, one email, the combined edit flow).
- [ ] `make build` succeeds; scripts + shared + dashboard typecheck clean;
      `vitest run` green with tests for: `bitbucket.ts` using the Bitbucket
      token, the combined email+token chooser flow, the yes/no guided prompt,
      the guided mode's step sequencing (against the walkthrough doc), and the
      per-layer missing-credential independence.

## Existing abstractions to use

- `readBitbucketCredentials` + `readAtlassianEmail` (infra task) — `bitbucket.ts`
  swaps to the Bitbucket reader.
- `/aura secrets edit` chooser (`extensions/aura-secrets.ts`: `SECRET_LABELS`,
  `SECRET_PLACEHOLDERS`, `pickSecretKey`, `handleSecretEdit`, `handleEdit`,
  `decideEditAction`) — replace the standalone email item with the two combined
  email+token items; add the yes/no prompt; add the guided mode. Keep
  `decideEditAction` / `handleEdit` as the per-secret edit primitives (the
  combined flow calls `handleEdit` twice — once for email, once for the token).
- `buildAtlassianClient` (`scripts/src/devlinks.ts`) — unchanged.
- `docs/atlassian-api-token-walkthrough.md` (manual task) — the guided mode's
  script; read it at run time.

## Architecture / domain decisions

- Combined email+token flow per PAT: the email is no longer a standalone chooser
  item; each Atlassian token item prompts email-then-token, reusing the existing
  `handleEdit` per secret. The email is shared across both PATs — if already
  set, the flow may prefill/skip it (decided in the arch spec).
- The guided mode is a run-time reader of the walkthrough doc, not hardcoded
  steps — so the doc (produced collaboratively in the manual task) is the source
  of truth and the feature replays it.
- Per-layer independence: the two dev-links layers keep separate missing-token
  warnings; no shared "no Atlassian credential" message that conflates them.

## Implementation notes

### slice: wire-bitbucket-reader (landed)

- `scripts/src/bitbucket.ts`'s `loadCreds` swapped `readAtlassianCredentials` →
  `readBitbucketCredentials` (reads `atlassian/email` + `atlassian/bitbucket_token`);
  Basic-auth header (`Buffer.from(`${email}:${token}`)`) and all REST paths
  (`/2.0/repositories`, `/pullrequests`, `/refs/branches`) are byte-identical — only
  the token *source* changed. `atlassianClient` / `readAtlassianCredentials`
  (Teamwork Graph, `api_token`) is untouched (`clients.ts` empty diff).
- `scripts/src/devlinks.ts` Layer 3 pre-check swapped to `readBitbucketCredentials`;
  on throw it pushes `Bitbucket dev-links layer skipped: <reason>`. The Teamwork
  Graph layer's `buildAtlassianClient` (unchanged) yields
  `Teamwork Graph dev-links layer skipped: <reason>`. The two warnings are
  distinguishable and independent — no shared message.
- Tests: new `test/wire-bitbucket-reader/wire-bitbucket-reader.test.ts` (12 tests)
  covers `loadCreds` reading `bitbucket_token` (not `api_token`) and the per-layer
  independence (both present / only-bitbucket / only-TWG / both-missing / email-
  missing); pre-existing `test/atlassian-keyring-auth/bitbucket.test.ts` updated to
  use `bitbucket_token` (would otherwise fail against the swapped reader).
- Validation: `scripts` typecheck clean, `packages/shared` typecheck clean, build
  succeeds (dist committed), `vitest run` green — 15 files / 120 tests pass.
- No out-of-scope changes: chooser, guided mode, `aura-secrets.ts`, `settings.ts`,
  keyring package untouched — those are later slices.

### slice: combined-pat-edit-flow (landed)

- `extensions/aura-secrets.ts`: `SECRET_LABELS` changed from
  `["Aura PAT", "Atlassian email", "Atlassian API token"]` to
  `["Aura PAT", "Atlassian Teamwork Graph token", "Atlassian Bitbucket token"]` —
  the standalone "Atlassian email" chooser item is removed. `pickSecretKey` maps
  the two new token labels to `{service:"atlassian",name:"api_token"}` and
  `{service:"atlassian",name:"bitbucket_token"}` respectively; the Aura PAT mapping
  is unchanged.
- New `handleAtlassianPatEdit` implements the combined email+token flow: it opens
  the email editor (prefilled with the current `atlassian/email` if set), then the
  token editor (prefilled with the current token if set), runs `decideEditAction`
  (the unchanged pure primitive) on both, and only then writes both secrets — a
  cancel at either prompt aborts the whole PAT provisioning with no partial write
  (the atomicity contract is documented in a comment). The confirm-on-empty guard
  is applied per secret via a new `resolveEmptyGuard` helper that mirrors the same
  logic `handleEdit` uses. `decideEditAction` / `handleEdit` are unchanged.
- `handleSecretEdit` dispatch: Aura PAT routes through the unchanged `handleEdit`
  (single-secret edit); the two Atlassian token labels route through
  `handleAtlassianPatEdit`. `SECRET_PLACEHOLDERS` retains the "Atlassian email"
  placeholder key (used by the combined flow's email prompt) and adds distinct
  placeholders for each token label.
- Tests: `extensions/aura-secrets.test.ts` extended — `makeMockEditChooserUi` now
  supports sequential editor prompts (`editorResults: [email, token]`). New tests
  cover: `pickSecretKey` maps the new labels; the combined flow stores email +
  api_token (Teamwork) / email + bitbucket_token (Bitbucket); atomicity — cancel
  at email prompt → no write, cancel at token prompt → email also not written;
  email/token prefilled from current keyring values; chooser has no standalone
  email item and labels are distinct; Aura PAT flow unchanged. The standalone
  "Atlassian email" and "Atlassian API token" chooser-routing tests were replaced
  by the combined-flow tests.
- Validation: `scripts` typecheck clean, `packages/shared` typecheck clean, build
  succeeds, `vitest run` green — 15 files / 120 tests pass,
  `node --experimental-strip-types extensions/aura-secrets.test.ts` passes (all
  test sections green including "combined email+token flow tests passed").
- No out-of-scope changes: guided yes/no prompt (slice 3), `bitbucket.ts`,
  `devlinks.ts`, `settings.ts`, keyring package untouched.

### slice: guided-walkthrough-mode (landed)

- The guided mode lives in a new sibling module `extensions/atlassian-provision.ts`
  (489 lines), not `aura-secrets.ts` — `aura-secrets.ts` only gained the yes/no
  prompt + a dynamic import of `runGuidedWalkthrough` (+~30 lines). The split is
  justified by the code-quality rule (proactive file-size management): growing
  `aura-secrets.ts` (already ~470 from slice 2) by ~490 would have made it
  ~960 lines. `aura-secrets.ts` owns the entry point (`handleSecretEdit` + the
  yes/no prompt + `WALKTHROUGH_DOC_PATH`); `atlassian-provision.ts` owns the
  guided-mode machinery (`parseWalkthrough`, `probeTeamworkGraph`,
  `probeBitbucket`, `runGuidedWalkthrough`).
- `handleSecretEdit` asks `ui.confirm("Guided walkthrough?", ...)` before the
  chooser. **Yes** → dynamic-imports `runGuidedWalkthrough` + `loadSettings` and
  calls it with `WALKTHROUGH_DOC_PATH` + `{ jiraCloudId, bitbucketWorkspace }`
  from settings; **No** (confirm=false) → the existing chooser (slice 2, unchanged).
  A confirm is inherently binary, so there is no distinct cancel path for the
  yes/no prompt — false means "just the chooser".
- `runGuidedWalkthrough` reads the walkthrough doc at run time via
  `readFileSync(docPath, "utf8")` and parses it with the pure `parseWalkthrough`
  helper. App names + scopes come entirely from the parsed doc (`seq.app`,
  `seq.scopes`), shown to the user via `ui.notify` — no Atlassian app name or
  scope string is hardcoded. The only hardcoded constants are the `SecretKey`
  literals, the probe endpoint URLs, and the token-key inference from the
  sequence letter (A → teamwork-graph, B → bitbucket). A real-doc integration
  test asserts the real `docs/atlassian-api-token-walkthrough.md` parses to 2
  sequences with the right app + scopes + token keys.
- `probeTeamworkGraph` (read-only): `initialize` (connect), `tools/list` (assert
  `getTeamworkGraphContext` + `getTeamworkGraphObject` present), then a real
  `getTeamworkGraphContext` call. An org-admin `read:teamwork_graph` permission
  error (TWG tools absent from `tools/list`) is a NON-BLOCKER (reported +
  flagged; the walkthrough continues). A 404/not-found from
  `getTeamworkGraphContext` is a SUCCESS signal (authenticated + reached the
  API). Uses an `McpProbeClient` interface (subset of `McpClient`) so tests
  inject a fake — no live network call in unit tests.
- `probeBitbucket` (read-only): `GET /2.0/workspaces/<ws>` +
  `GET /2.0/repositories/<ws>?pagelen=5` + one repo's PRs + branches. Does NOT
  call `/2.0/user` (pi-ura never uses it; needs `read:user:bitbucket`). A
  scope-named 403 is reported (not thrown). Tests inject a fake `fetch`.
- A failed (non-nonBlocker) probe offers to re-run after the user recreates the
  token (`ui.confirm("Re-probe ...?")`); applies to any non-org-admin failure,
  not just Bitbucket 403 — a reasonable generalization.
- Atomicity preserved + tested: in `runGuidedWalkthrough`, both editor prompts
  (email, then token) are opened; if either returns undefined/null, the function
  returns "no change" before any `keyring.setSecret` call. A cancel at the
  token prompt does NOT leave the email stored.
- **Deliberate deviation (flag for coherence-refactor stage):**
  `runGuidedWalkthrough` inlines its own email+token atomic-write rather than
  calling slice 2's `handleAtlassianPatEdit`. The guided mode operates inside a
  per-sequence loop with its own probe-after-store flow, and
  `handleAtlassianPatEdit` returns `void` (it doesn't surface the stored creds
  for the probe). The inline version reads the stored creds from the editor
  results and passes them to the probe. The atomicity contract is preserved.
  A shared `storeEmailAndTokenAtomically` helper with ≥2 call sites is a
  future-refactor candidate. Two further minor divergences (both low risk):
  `probeTeamworkGraph` uses `workItemKey` instead of `objectIdentifier` in the
  `callTool` args (cosmetic — the probe's success criterion is "reached the
  API," not "valid data"; should be aligned for correctness); and the
  production `McpClient` dynamic import is cast `as unknown as McpProbeClient`
  (structurally satisfies the seam; localized type-system smell).
- Tests: new `extensions/atlassian-provision.test.ts` (742 lines) covers
  `parseWalkthrough` (fixture + real-doc integration), `probeTeamworkGraph` (5
  scenarios via fake `McpProbeClient`), `probeBitbucket` (3 scenarios via fake
  `fetch`), `runGuidedWalkthrough` step sequencing + atomicity (cancel at email
  / token / mid-guided → no partial write), and `handleSecretEdit` yes/no
  routing. All probe/network seams are mocked — no live network call in any
  unit test.
- Validation: `scripts` typecheck clean, `packages/shared` typecheck clean,
  `.pi/extensions/digest-dashboard` typecheck clean, build succeeds, `vitest run`
  green — 15 files / 120 tests pass;
  `node --experimental-strip-types extensions/atlassian-provision.test.ts` passes;
  `node --experimental-strip-types extensions/aura-secrets.test.ts` passes.
  `make` unavailable in the sandbox; equivalent `tsc` + `esbuild.config.mjs`
  commands (what `make build` runs) were run directly and passed.
- This was the last slice; the task is complete.

### Coherence refactor + whole-task code review (post-landing)

- Extracted `makeMcpProbeClient(creds)` in `extensions/atlassian-provision.ts`:
  the `McpClient` factory closure was duplicated verbatim in both the initial
  probe and the re-probe path (the review's clearest Duplicated-Code smell).
  One factory, two call sites.
- Aligned `probeTeamworkGraph`'s `callTool` arg from `workItemKey` to
  `objectIdentifier`, matching the real `getTeamworkGraphContext` tool signature
  (cosmetic — the probe's success criterion is reaching the API, but
  correctness matters).
- Advisory whole-task code review (`code-reviewer`): no documented-standard
  breach; all spec criteria met. Judgement-call smells left as-is: the
  `KNOWN_SECRET_KEYS` array duplicated across the 3 keyring backends
  (intentional — each backend is independent), the `ProbeFunctions` test seam
  (justifiable boundary abstraction), and the `{email, token}` data clump
  (a small `Credentials` type is a future-refactor candidate, not this task).

### Notable implementation deviations (documented for future readers)

- **Slice 2 (`handleAtlassianPatEdit`)** deliberately composes `decideEditAction`
  + a `resolveEmptyGuard` + an atomic double-write instead of calling
  `handleEdit` twice. `handleEdit` writes immediately on save, so calling it
  for the email then checking for a token cancel would leave a
  half-provisioned PAT. The atomicity contract (cancel mid-flow → no partial
  write) — the slice's explicitly-called-out key UX decision — was prioritized
  over the literal "call `handleEdit` twice" phrasing. `handleEdit` /
  `decideEditAction` remain unchanged per-secret primitives.
- **Slice 3 (`runGuidedWalkthrough`)** inlines its own email+token atomic-write
  rather than calling slice 2's `handleAtlassianPatEdit`, because the guided
  mode needs the stored creds for the post-store probe (`handleAtlassianPatEdit`
  returns `void`). The atomicity contract is preserved and tested. A shared
  `storeEmailAndTokenAtomically` helper is a future-refactor candidate (≥2 call
  sites would then exist).
- **Slice 3 module split**: the guided-mode machinery (probes + parser +
  orchestrator) lives in a new sibling `extensions/atlassian-provision.ts`
  (489 lines) rather than growing `aura-secrets.ts` to ~1000 lines, per the
  code-quality rule's "split proactively" guidance.
