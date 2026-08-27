---
kind: slice
slug: guided-walkthrough-mode
title: "Guided walkthrough mode in /aura secrets edit, driven by the walkthrough doc"
task: ../task.md
mode: hitl
status: todo
size: l
blocked_by:
  - combined-pat-edit-flow
---

## End-to-end behavior

`/aura secrets edit` first asks a yes/no "guided walkthrough?" prompt. **No** →
the chooser (slice 2). **Yes** → the guided mode, which drives from
`docs/atlassian-api-token-walkthrough.md` (produced by the manual task): it
steps the user through creating the Rovo MCP V2 token (app + scopes from the
doc), stores it via the combined email+token flow, runs the direct probe; then
the Bitbucket token likewise. No secrets are written to any file.

## Acceptance criteria

- [ ] `/aura secrets edit` asks a yes/no "guided walkthrough?" prompt before
      the chooser. **No** → the chooser (slice 2, unchanged). **Yes** → the
      guided mode. Cancel → "no change".
- [ ] The guided mode reads `docs/atlassian-api-token-walkthrough.md` at run
      time and steps through it: for each PAT, it tells the user the app to
      select + the scopes (from the doc), has the user create + copy the token,
      stores it via the combined email+token flow (slice 2), then runs the
      direct probe.
- [ ] **Direct probe after the Teamwork Graph PAT**: call
      `mcp.atlassian.com/v1/mcp/authv2` — `initialize` (expect 200),
      `tools/list` (expect `getTeamworkGraphContext` + `getTeamworkGraphObject`
      present), and a real read-only `getTeamworkGraphContext` call (expect a
      non-error result, or a clear org-admin `read:teamwork_graph` permission
      error recorded as a non-blocker). Reports the outcome to the user.
- [ ] **Direct probe after the Bitbucket PAT**: call `api.bitbucket.org/2.0/user`
      (Basic auth with email + bitbucket_token, expect 200 + user object) and
      `GET /2.0/workspaces/<workspace>` (workspace from
      `settings.aura.digest.bitbucket.workspace`, expect 200 or a scope-named
      403/401). Reports the outcome; re-run the probe if the user recreates the
      token with the right scopes.
- [ ] The guided mode does not write secrets to any file; only the keyring.
- [ ] `docs/atlassian-api-token.md` is updated to the two-token flow (Rovo MCP
      V2 + Bitbucket apps, one email, the combined edit flow, the guided mode).
- [ ] `make build` succeeds; scripts + shared + dashboard typecheck clean;
      `vitest run` green with tests: the yes/no prompt routes to the chooser vs
      the guided mode; the guided mode's step sequencing (against a fixture
      walkthrough doc) calls the combined flow + the probe with the right
      credential; the probe is mocked (no live network call in the unit test).

## Test plan

- **Seams**: the yes/no prompt via `makeMockEditChooserUi` (add a
  `confirmResult` for the guided prompt); the guided mode's step function,
  tested against a fixture walkthrough doc + a mocked probe (inject a fake
  fetch / MCP client; assert the right app + scopes are read from the doc and
  the right credential is probed). The probe itself is a thin function
  (`probeTeamworkGraph(creds)` / `probeBitbucket(creds)`) that's unit-testable
  with a mocked HTTP client — do not make a live call in the unit test.
- **Failure modes**: yes→guided but the walkthrough doc is missing → clear error
  naming the doc path (the manual task should have produced it); a probe
  returning a scope-named 401/403 → the guided mode reports it and offers to
  re-run after the user recreates the token; a probe returning an org-admin
  permission error → reported as a non-blocker.
- **Scenarios**: no→chooser; yes→guided steps through PAT 1 (Teamwork Graph) +
  probe + PAT 2 (Bitbucket) + probe; cancel at the yes/no → no change; cancel
  mid-guided → no partial keyring write (same atomicity as slice 2).
- **Edge cases**: the walkthrough doc missing or malformed → the guided mode
  fails fast with a message pointing at the manual task / the doc path; the
  workspace setting missing → the Bitbucket probe reports it.

## Constraints and dependencies

- Depends on slice 2 (the combined email+token flow) and the manual task (the
  walkthrough doc must exist for the guided mode to drive from).
- `hitl` slice: the guided mode is interactive; the human exercises it at
  handoff. Implementation writes code + tests.
- The probe functions are the one place a live network call is legitimate at
  runtime, but unit tests must mock them.
- Do not hardcode the Atlassian app names / scopes in the code — read them from
  the walkthrough doc so the doc is the source of truth (the manual task
  records the real selections; the feature replays them).
- The guided mode is a run-time reader of the walkthrough doc, not a hardcoded
  script — this is the key design point.
