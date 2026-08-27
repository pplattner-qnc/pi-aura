---
kind: slice
slug: aura-secrets-edit-picker
title: "/aura secrets edit chooses which secret (Aura PAT / Atlassian email / Atlassian API token) to edit"
task: ../task.md
mode: hitl
status: done
size: m
blocked_by:
  - keyring-atlassian-secret-keys
---

## End-to-end behavior

Running `/aura secrets edit` shows a chooser for which credential to edit
(Aura PAT, Atlassian email, Atlassian API token), then opens the existing
editor + confirm flow for the chosen secret. This is the only provisioning
surface for the Atlassian credential (no auto-discovery, no new slash command).

## Acceptance criteria

- [ ] `/aura secrets edit` first asks (via `ctx.ui.select`) which secret to
      edit: "Aura PAT", "Atlassian email", "Atlassian API token", with a
      cancel option. Selecting cancel exits with "no change".
- [ ] The chosen secret flows through the existing `handleEdit` /
      `decideEditAction` path: editor prefilled with the current value (or
      placeholder), confirm-on-empty guard, write to the keyring under the
      matching `SecretKey`.
- [ ] The Aura PAT path is unchanged behavior (only routed through the new
      chooser); the two new paths store under
      `{service:"atlassian",name:"email"}` and
      `{service:"atlassian",name:"api_token"}` respectively.
- [ ] `/aura secrets discover` is unchanged (still only discovers the Aura
      PAT from `mcp.json`; no Atlassian discovery source is added).
- [ ] No new slash command is registered — the existing `aura` command and
      its `getArgumentCompletions` are preserved.
- [ ] `extensions/aura-secrets.ts` unit tests cover the chooser wiring:
      picking each of the three secrets routes to the right `SecretKey`;
      cancel exits cleanly; a non-TUI / undefined select is handled without
      throwing.

## Test plan

- **Seams**: `decideEditAction` is already pure and tested; extend the
  edit-handler tests to cover the chooser. Inject a fake `ui` (with
  `select`, `confirm`, `editor`, `notify`) and a fake `keyring` factory.
- **Failure modes**: `ui.select` returns `undefined` (cancel / non-TUI) →
  "no change", no keyring write. Empty-string confirm flow (already covered
  for the Aura PAT) applies identically to the two new secrets.
- **Scenarios**: choose Aura PAT → edits `aura/pat`; choose Atlassian email →
  edits `atlassian/email`; choose Atlassian API token → edits
  `atlassian/api_token`; cancel → no keyring write.
- **Edge cases**: the chooser labels must be distinct and unambiguous (the
  Aura PAT and the Atlassian token are both "tokens" — label the Atlassian one
  "Atlassian API token", not just "API token"). Prefill placeholder for the
  new secrets: `<paste your Atlassian email here>` and
  `<paste your Atlassian API token here>`.

## Constraints and dependencies

- Depends on slice 1 for the `SecretKey` members.
- Reuse `handleEdit` / `decideEditAction` as-is; the only new logic is the
  chooser → `SecretKey` mapping. If the chooser logic is testable as a pure
  function (input: choice string; output: `SecretKey`), extract it and unit
  test it without a pi session, mirroring `decideEditAction`.
- This is a `hitl` slice: the edit flow opens an interactive editor, so the
  human is in the loop by construction. Implementation still writes the code +
  tests; the human exercises the live `/aura secrets edit` at handoff.
- Do not add a "list/status" view in this slice (see map.md Fog — deferred).
