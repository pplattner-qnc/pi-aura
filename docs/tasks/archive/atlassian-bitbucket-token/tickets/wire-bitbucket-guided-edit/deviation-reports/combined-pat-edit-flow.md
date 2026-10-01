## Deviation report — combined-pat-edit-flow

### Standalone "Atlassian email" chooser item REMOVED? SECRET_LABELS correct?

- **Yes — removed.** `SECRET_LABELS` is now `["Aura PAT", "Atlassian Teamwork
  Graph token", "Atlassian Bitbucket token"]` — exactly the three labels the
  spec mandates. The standalone `"Atlassian email"` entry is gone; the old
  `"Atlassian API token"` entry is gone (replaced by the two distinct token
  labels). ✓
- The `"Atlassian email"` placeholder is **kept** in `SECRET_PLACEHOLDERS`
  (keyed by `"Atlassian email"`), not removed — it's read by
  `handleSecretEdit` as the `emailPlaceholder` arg passed to
  `handleAtlassianPatEdit`. This is intentional and correct: the email
  placeholder is reused by the combined flow even though the email is no
  longer a chooser item.

### pickSecretKey maps the two new labels to their token keys? Pure single-key lookup (unchanged shape)?

- **Yes.** `pickSecretKey` is a pure single-key lookup, unchanged in shape
  (a `switch` returning `SecretKey | null`):
  - `"Atlassian Teamwork Graph token"` → `{service:"atlassian",name:"api_token"}` ✓
  - `"Atlassian Bitbucket token"` → `{service:"atlassian",name:"bitbucket_token"}` ✓
  - `"Aura PAT"` → `{service:"aura",name:"pat"}` (unchanged) ✓
  - `undefined`/unknown → `null` (unchanged) ✓
- The arch spec's "Design decision" recommended option 2 (sibling
  orchestrator) and explicitly said "`pickSecretKey` stays a pure single-key
  lookup; the dispatch decides whether a choice is a combined flow (by
  label)." The implementation follows this exactly — `pickSecretKey` returns
  one token key, and `handleSecretEdit` dispatches to `handleAtlassianPatEdit`
  for the two Atlassian labels. ✓

### handleAtlassianPatEdit orchestrator added? Combined email-then-token flow? Atomicity? handleEdit/decideEditAction unchanged?

- **Yes — `handleAtlassianPatEdit` added** (exported). Signature:
  `(ui, keyringFactory, tokenKey, label, emailPlaceholder, tokenPlaceholder)`.
  It prompts email (prefill current `atlassian/email`), then token (prefill
  current token), and writes both. ✓
- **Combined email-then-token flow**: two `ui.editor` calls in sequence
  (email first, token second), both prefilled with current keyring values. ✓
- **Atomicity (cancel mid-flow → no partial write)**: implemented and tested.
  The key design choice — documented in the function's JSDoc — is that
  `handleEdit` writes *immediately* on save, so it cannot be called for the
  email then checked for a token cancel (the email would already be
  persisted). Instead, `handleAtlassianPatEdit` opens both editors, runs the
  pure `decideEditAction` on each, aborts if either is `cancel`, and only
  then writes both secrets. A `resolveEmptyGuard` helper applies the
  confirm-on-empty guard per secret before the atomic write. ✓
  - Cancel at email prompt → `stored.length === 0`, only 1 editor opened (test
    asserts). ✓
  - Cancel at token prompt → `stored.length === 0`, email NOT written, 2
    editors opened (test asserts "no partial write: email not left without a
    token"). ✓
- **handleEdit / decideEditAction unchanged**: confirmed by diff — neither
  function body has any `+`/`-` lines. `handleAtlassianPatEdit` *composes*
  `decideEditAction` (calls it on each editor result) and reuses the
  confirm-on-empty *logic* (via `resolveEmptyGuard`, which mirrors
  `handleEdit`'s guard), but does not modify either primitive. ✓

### Email shared (both PAT flows prefill/read atlassian/email)?

- **Yes.** Both Atlassian token flows read/prefill the same `atlassian/email`
  key: `handleAtlassianPatEdit` reads `currentEmail` from
  `{service:"atlassian",name:"email"}` and prefills the email prompt with it.
  Setting the email via the Teamwork Graph flow makes it available to the
  Bitbucket flow (same key). Test: "email already set → email prompt
  prefilled with current `atlassian/email` value" asserts the prefill. ✓

### Labels distinct?

- **Yes.** `"Atlassian Teamwork Graph token"` and `"Atlassian Bitbucket
  token"` — not just "API token". Tests assert both labels are present, the
  set size equals the array length (all distinct), and the old labels
  (`"Atlassian email"`, `"Atlassian API token"`) are absent. ✓

### No guided yes/no prompt yet (slice 3)? No new slash command? getArgumentCompletions/parseAuraArgs unchanged?

- **No guided prompt**: the diff contains no `+` lines mentioning "guided",
  "walkthrough", or a `confirm("Guided walkthrough?")` call. The yes/no
  guided prompt is correctly deferred to slice 3. ✓
- **No new slash command**: no `registerCommand`/`registerTool` `+` lines in
  the diff. ✓
- **getArgumentCompletions / parseAuraArgs unchanged**: confirmed — no diff
  lines on either function. ✓

### Out-of-scope additions / divergence from acceptance criteria

- **`resolveEmptyGuard` confirm wording uses `${kind}` not `${label}`**: the
  combined flow's confirm-on-empty body says `"An empty email won't
  authenticate"` / `"An empty token won't authenticate"` (via the `kind`
  param), whereas `handleEdit` says `"An empty ${label} won't authenticate"`
  (e.g. "An empty Aura PAT won't authenticate"). This is a **justified,
  in-scope wording choice**, not a deviation — the arch spec says the guard
  "mirrors the confirm-on-empty logic in `handleEdit`", and `kind` ("email"/
  "token") is arguably clearer than the full label for the combined flow.
  The `Save empty ${label}?` title still uses the label. No acceptance
  criterion is violated.
- **`resolveEmptyGuard` is a new internal helper** (not exported) that
  factors the confirm-on-empty logic so the combined flow can apply it per
  secret before the atomic write. It is not in the arch spec's literal
  "Exports" list (which names `handleAtlassianPatEdit`), but it is the
  mechanism the spec described ("the confirm-on-empty guard is applied per
  secret via the same `decideEditAction` + `ui.confirm` logic `handleEdit`
  uses"). It has one call site (`handleAtlassianPatEdit`), so it clears the
  ≥2-call-site bar only barely — acceptable as a readability extraction that
  keeps the atomic-write logic readable.
- No other out-of-scope changes. The diff is exactly 2 files
  (`extensions/aura-secrets.ts` +155/-... , `extensions/aura-secrets.test.ts`
  +194/-...). No source files outside the spec were touched (`clients.ts`,
  `bitbucket.ts`, `devlinks.ts`, `settings.ts`, keyring package — all
  unchanged). No dist rebuild (this slice touches no code that feeds
  `make build`).

### Acceptance-criteria divergence

| Criterion | Status |
|---|---|
| `SECRET_LABELS` = the three labels (standalone email removed) | **met** |
| `pickSecretKey` maps the two new labels → token keys; Aura PAT unchanged; pure single-key | **met** |
| Combined email+token flow: email prompt (prefill current), then token prompt (prefill current), store via `handleEdit` primitive | **met** (composes `decideEditAction` + reuses the confirm logic; see atomicity note) |
| Email shared: both flows read/prefill `atlassian/email` | **met** |
| `decideEditAction`/`handleEdit` unchanged; combined flow calls `handleEdit` twice | **partially met** — see note below |
| Labels distinct | **met** |
| `vitest run` green with the required tests | **met** (120 tests; combined-flow + pickSecretKey + chooser tests) |

**Note on "calls `handleEdit` twice":** the slice doc's acceptance criterion
says "the combined flow calls `handleEdit` twice (email, then token)." The
implementation does **not** call `handleEdit` twice — it calls `decideEditAction`
twice + a `resolveEmptyGuard` + a single atomic double-write, because
`handleEdit` writes immediately on save and would break atomicity (a token
cancel after an email `handleEdit` save would leave a half-provisioned PAT).
This is a **deliberate, documented deviation from the literal criterion** to
satisfy the *atomicity* criterion (which the same slice doc lists as the "key
UX decision — test it"). The two criteria are in tension: "call handleEdit
twice" vs "cancel mid-flow → no partial write." The implementer correctly
prioritized atomicity (the explicitly-called-out key UX decision) over the
literal "call handleEdit twice" phrasing, and documented the reasoning in the
`handleAtlassianPatEdit` JSDoc. `handleEdit` and `decideEditAction` remain
unchanged per-secret primitives; the combined flow *composes* `decideEditAction`
and reuses the confirm logic rather than calling `handleEdit` directly. This
is the right call and should be noted in the task doc's Implementation notes.

### Task doc update needed?

**Yes — minor.** The `handleAtlassianPatEdit` implementation deliberately does
not call `handleEdit` twice (to preserve atomicity); it composes
`decideEditAction` + `resolveEmptyGuard` + an atomic double-write instead.
Append a note to `## Implementation notes` so future readers understand why
the combined flow doesn't reuse `handleEdit` directly despite the slice doc
saying "calls `handleEdit` twice."

### User attention needed?

**No.** Scope was followed; the API surface matches the spec. The
`resolveEmptyGuard` wording (`kind` vs `label`) and the
"compose-decideEditAction-instead-of-calling-handleEdit-twice" choice are both
justified in-scope decisions, the latter documented in the function's JSDoc.
The atomicity contract — the slice's key UX decision — is implemented and
tested (cancel-at-email and cancel-at-token both assert `stored.length === 0`).
