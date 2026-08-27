# Architecture spec — wire-bitbucket-guided-edit

Wires `bitbucket.ts` to the Bitbucket token, replaces the standalone
"Atlassian email" chooser item with combined email+token flows per PAT, and
adds a guided walkthrough mode driven by `docs/atlassian-api-token-walkthrough.md`.
Extends the shipped `aura-secrets` + `clients`/`bitbucket` patterns; no new
abstractions beyond a thin probe helper.

---

## Existing abstractions to use

- **`readBitbucketCredentials`** (`scripts/src/clients.ts`, infra task) —
  `bitbucket.ts`'s `loadCreds` swaps to it. Basic-auth header + REST paths
  unchanged.
- **`readAtlassianCredentials`** (Teamwork Graph) — `atlassianClient` unchanged.
- **`buildAtlassianClient`** (`scripts/src/devlinks.ts`) — unchanged; the
  Teamwork Graph layer's warning already flows through it. The Bitbucket
  layer's degrade wrapper (the pre-check that catches a thrown reader and
  pushes `Bitbucket dev-links layer skipped: <reason>`) already exists from
  the prior task — extend it to use `readBitbucketCredentials`.
- **`/aura secrets edit`** (`extensions/aura-secrets.ts`: `SECRET_LABELS`,
  `SECRET_PLACEHOLDERS`, `pickSecretKey`, `handleSecretEdit`, `handleEdit`,
  `decideEditAction`) — replace the standalone "Atlassian email" item with
  two combined email+token items; add the yes/no guided prompt. `handleEdit`
  + `decideEditAction` stay the per-secret edit primitives (the combined flow
  calls `handleEdit` twice: email, then token).
- **`docs/atlassian-api-token-walkthrough.md`** (manual task) — the guided
  mode reads it at run time; it is the source of truth for the steps + app/
  scope selections.
- **`loadSettings()`** (`scripts/src/settings.ts`) — the Bitbucket probe's
  workspace + the Teamwork Graph probe's `jiraCloudId` come from here.

## Do NOT reimplement

- Do not fork the keyring or change `readBitbucketCredentials`/`readAtlassianCredentials`.
- Do not change the Bitbucket REST paths or the Basic-auth header construction.
- Do not change `atlassianClient` / the Rovo MCP V2 transport.
- Do not add auto-discovery for either token.
- Do not hardcode the Atlassian app names / scopes in the guided mode — read
  them from the walkthrough doc so the doc is the source of truth.
- Do not write secrets to any file (only the keyring).

---

## Slice 1 — wire-bitbucket-reader (afk, s)

**Exports:** none new. `bitbucket.ts`'s `loadCreds` calls
`readBitbucketCredentials`; the Bitbucket layer degrades independently.

**Seams (test only here):**
- `bitbucket.ts`'s `loadCreds(keyring, defaultWorkspace)` is injectable (prior
  task); extend tests with a fake keyring holding `bitbucket_token` vs
  `api_token` → assert the right token is used (decode the Basic header or
  assert the reader was called).
- Per-layer independence: fake keyring with only `bitbucket_token` → Bitbucket
  resolves, Teamwork Graph skips; only `api_token` → TWG resolves, Bitbucket
  skips; both missing → both skip with their own `/aura secrets edit` warnings.
  Test via the `buildAtlassianClient` + Bitbucket degrade wrappers in
  `devlinks.ts` (inject a fake keyring through the readers).

**Interface contract for later slices:** the Bitbucket layer now reads
`bitbucket_token`; the two layers are independent.

---

## Slice 2 — combined-pat-edit-flow (hitl, m)

**Exports:** updated `SECRET_LABELS`, `SECRET_PLACEHOLDERS`, `pickSecretKey`,
`handleSecretEdit` in `extensions/aura-secrets.ts`. New pure helper
`pickSecretFlow(choice)` (or extend `pickSecretKey` to return a *flow*
descriptor, not just one key) — see "Design decision" below.

**API surface change:**
- `SECRET_LABELS` → `["Aura PAT", "Atlassian Teamwork Graph token",
  "Atlassian Bitbucket token"]` (standalone "Atlassian email" removed).
- `pickSecretKey` maps the two new labels to their token keys
  (`api_token` / `bitbucket_token`); Aura PAT unchanged.
- A new **combined flow** for the two Atlassian token items: prompt email
  (prefill current `atlassian/email`), then prompt token (prefill current
  token), storing each via `handleEdit`. **Atomicity**: a cancel at either
  prompt aborts the whole PAT provisioning — no email-without-token or
  token-without-email left behind.

**Design decision — chooser → flow mapping:**
The current `handleSecretEdit` maps choice → one `SecretKey` → one `handleEdit`.
The combined flow maps choice → *two* secrets (email + token). Two clean options:
1. **Flow descriptor**: extend `pickSecretKey` to return either a single key
   (Aura PAT) or a `{ emailKey, tokenKey, label, placeholders }` flow descriptor;
   `handleSecretEdit` branches on the shape. Keeps one entry point.
2. **Sibling orchestrator**: add `handleAtlassianPatEdit(ui, keyringFactory,
   tokenKey, label, placeholders)` for the combined flow; `handleSecretEdit`
   dispatches to it for the two Atlassian labels and to `handleEdit` for Aura.

Recommended: **option 2** (sibling orchestrator) — `handleSecretEdit` already
dispatches; a dedicated `handleAtlassianPatEdit` keeps the combined-flow logic
(email-then-token + atomicity) in one testable function, and `handleEdit` stays
the per-secret primitive. `pickSecretKey` stays a pure single-key lookup; the
dispatch decides whether a choice is a combined flow (by label).

**Seams (test only here):**
- `pickSecretKey` (pure): the two new labels → their token keys; Aura PAT
  unchanged; unknown/cancel → null.
- `handleAtlassianPatEdit` via `makeMockEditChooserUi` (extend to support two
  sequential `editor` prompts — `editorResults: [emailValue, tokenValue]`) +
  `makeMockKeyring`: assert the keyring ends with `atlassian/email` + the chosen
  token. **Atomicity**: cancel at the email prompt → no keyring write; cancel at
  the token prompt → email also not written (abort the whole PAT).
- `handleSecretEdit` dispatch: Aura PAT → `handleEdit` (unchanged); the two
  Atlassian labels → `handleAtlassianPatEdit`.
- Labels distinct ("Atlassian Teamwork Graph token" / "Atlassian Bitbucket
  token").

**Interface contract for slice 3:** the chooser + combined flow exist; slice 3
adds the yes/no guided prompt *before* the chooser and the guided mode that
calls the combined flow.

---

## Slice 3 — guided-walkthrough-mode (hitl, l)

**Exports:** `handleSecretEdit` gains the yes/no "guided walkthrough?" prompt
before the chooser; new `runGuidedWalkthrough(ui, keyringFactory, docPath,
probeFns)` orchestrator + `probeTeamworkGraph(creds, cloudId)` /
`probeBitbucket(creds, workspace)` probe helpers (all in `aura-secrets.ts` or
a sibling module — see "Module placement").

**Behavior:**
- `/aura secrets edit` → `ui.confirm("Guided walkthrough?", "...")`. No → the
  chooser (slice 2). Yes → `runGuidedWalkthrough`. Cancel → "no change".
- `runGuidedWalkthrough` reads `docs/atlassian-api-token-walkthrough.md`,
  steps through Sequence A (Teamwork Graph) then Sequence B (Bitbucket): tells
  the user the app + scopes (from the doc), has them create + copy the token,
  stores it via the combined email+token flow (slice 2's
  `handleAtlassianPatEdit`), then runs the probe.
- **Probes** (read-only, the one place live network calls are legitimate at
  runtime):
  - `probeTeamworkGraph({email, token}, cloudId)`: `initialize` + `tools/list`
    (assert `getTeamworkGraphContext`/`getTeamworkGraphObject` present) + a real
    read-only `getTeamworkGraphContext` call. Returns a structured result.
  - `probeBitbucket({email, token}, workspace)`: `GET /2.0/workspaces/<ws>` +
    `GET /2.0/repositories/<ws>?pagelen=5` + one repo's PRs + branches.
    Returns a structured result. (Do **not** call `/2.0/user` — pi-ura never
    uses it and it needs an extra scope.)
- Reports probe outcomes to the user; an org-admin `read:teamwork_graph`
  permission error is a non-blocker (recorded, flagged). A scope-named 403 on
  Bitbucket → offer to re-run after the user recreates the token.
- No secrets written to any file; only the keyring.

**Module placement:** the probe helpers + `runGuidedWalkthrough` are UI +
network orchestration. Put them in `extensions/aura-secrets.ts` (next to
`handleSecretEdit`) or a sibling `extensions/atlassian-provision.ts` if
`aura-secrets.ts` gets too large — decide by file size; the code-quality rule
says split proactively. The walkthrough-doc parser is a pure helper
(`parseWalkthrough(markdown)` → steps), unit-testable without a pi session.

**Seams (test only here):**
- The yes/no prompt routes to the chooser vs `runGuidedWalkthrough` (fake ui
  `confirm`).
- `parseWalkthrough` (pure): against a fixture markdown doc → the two sequences'
  app + scopes + steps.
- `runGuidedWalkthrough` with a fixture doc + mocked probes (inject fake
  `probeTeamworkGraph`/`probeBitbucket`): asserts the right app + scopes are read
  from the doc, the combined flow is called with the right token key, and the
  probe is called with the right credential. **No live network call in the unit
  test** — mock the probe functions + `fetch`.
- `probeTeamworkGraph`/`probeBitbucket` unit-tested with a mocked `fetch` / MCP
  client (assert the right endpoint + Basic header; no live call).
- `docs/atlassian-api-token.md` updated to the two-token flow + the guided mode.

**Interface contract for later slices:** none (leaf).

---

## Architecture notes

- The combined email+token flow is the chooser's per-PAT provisioning unit;
  the standalone "Atlassian email" item is gone. Email is shared (both PAT
  flows read/prefill the same `atlassian/email`).
- The guided mode is a run-time reader of the walkthrough doc, not a hardcoded
  script — the doc (produced by the manual task) is the source of truth.
- Per-layer independence: each dev-links layer keeps its own missing-token
  warning; no shared "no Atlassian credential" message that conflates them.
- The probe helpers are the one place live network calls are legitimate at
  runtime; unit tests mock them.
- Atomicity of the combined flow (cancel mid-flow → no partial write) is a
  key UX contract — test it.
