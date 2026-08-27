---
kind: slice
slug: combined-pat-edit-flow
title: "/aura secrets edit: combined email+token flow per PAT (no standalone email item)"
task: ../task.md
mode: hitl
status: todo
size: m
blocked_by:
  - wire-bitbucket-reader
---

## End-to-end behavior

`/aura secrets edit`'s chooser no longer has a standalone "Atlassian email"
item. It offers "Aura PAT", "Atlassian Teamwork Graph token", "Atlassian
Bitbucket token". Picking a Teamwork/Bitbucket item prompts for the email and
then the token in one flow (two editor prompts, one logical provisioning), and
stores both under the right keyring keys. The Aura PAT item is unchanged.

## Acceptance criteria

- [ ] `SECRET_LABELS` is `["Aura PAT", "Atlassian Teamwork Graph token",
      "Atlassian Bitbucket token"]` (the standalone "Atlassian email" item is
      removed).
- [ ] `pickSecretKey` maps "Atlassian Teamwork Graph token" →
      `{service:"atlassian",name:"api_token"}` and "Atlassian Bitbucket token"
      → `{service:"atlassian",name:"bitbucket_token"}`. The Aura PAT mapping is
      unchanged.
- [ ] Picking a Teamwork/Bitbucket item runs a **combined email+token flow**:
      prompt for the email (prefilled with the current `atlassian/email` if
      set), then prompt for the token (prefilled with the current token if
      set), storing each via the existing `handleEdit` primitive. The two
      prompts are one logical flow from one chooser item.
- [ ] The email is shared: both PAT flows read/prefill the same
      `atlassian/email` key. Setting it via either flow makes it available to
      the other.
- [ ] `decideEditAction` / `handleEdit` are unchanged per-secret primitives;
      the combined flow calls `handleEdit` twice (email, then token).
- [ ] Labels are distinct ("Atlassian Teamwork Graph token" / "Atlassian
      Bitbucket token" — not just "API token").
- [ ] `vitest run` green with tests: `pickSecretKey` maps the new labels; the
      combined flow stores email + the right token (fake ui + keyring); the
      standalone email item is gone; the Aura PAT flow is unchanged.

## Test plan

- **Seams**: pure `pickSecretKey` (new mappings); the combined flow via
  `makeMockEditChooserUi` (extend the fake to support two sequential editor
  prompts — `editorResults: [email, token]`) + `makeMockKeyring`. Assert the
  keyring ends with `atlassian/email` + the chosen token key.
- **Failure modes**: cancel at the email prompt → no keyring write; cancel at
  the token prompt → email not written either (the flow is atomic-ish: a
  cancel aborts the whole PAT provisioning, not just half); empty-string
  confirm on either prompt → the existing confirm-on-empty guard.
- **Scenarios**: pick "Atlassian Teamwork Graph token" → email prompt then
  api_token prompt → both stored; pick "Atlassian Bitbucket token" → email
  prompt then bitbucket_token prompt → both stored; email already set → email
  prompt prefilled; cancel mid-flow → no partial write.
- **Edge cases**: a cancel mid-flow must not leave a half-provisioned PAT (no
  email without a token, no token without an email). Document the atomicity
  contract in a comment.

## Constraints and dependencies

- Depends on slice 1 (the Bitbucket reader exists so the Bitbucket token is
  meaningful) and the infra task (the `bitbucket_token` key exists).
- `hitl` slice: the edit flow opens interactive editor prompts; the human
  exercises it at handoff. Implementation writes code + tests.
- Do not add the guided yes/no prompt here (slice 3).
- Do not change `decideEditAction` / `handleEdit` — compose them.
- A cancel mid-flow aborting the whole PAT (not half) is the key UX decision —
  test it.
