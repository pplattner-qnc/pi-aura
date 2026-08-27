---
kind: slice
slug: wire-bitbucket-reader
title: "bitbucket.ts reads the Bitbucket token; the two layers degrade independently"
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: []
---

## End-to-end behavior

`bitbucket.ts`'s `loadCreds` uses `readBitbucketCredentials` (Bitbucket token),
not `readAtlassianCredentials`. The Bitbucket and Teamwork Graph dev-links
layers degrade independently — each skips with its own `/aura secrets edit`
warning when its token is missing, without dragging the other down.

## Acceptance criteria

- [ ] `bitbucket.ts`'s `loadCreds` calls `readBitbucketCredentials(keyring)`
      (from the infra task), reading `atlassian/email` +
      `atlassian/bitbucket_token`. Basic-auth header + REST paths unchanged.
- [ ] `atlassianClient` (Teamwork Graph) still uses `readAtlassianCredentials`
      — unchanged behavior.
- [ ] Bitbucket token missing → Bitbucket layer skips with a warning naming
      `/aura secrets edit` (distinguishable from the Teamwork Graph
      missing-token warning); no unhandled throw; Teamwork Graph unaffected.
- [ ] Teamwork Graph token missing but Bitbucket token present → Teamwork Graph
      skips, Bitbucket still resolves. The two layers are independent.
- [ ] `make build` succeeds; scripts + shared typecheck clean; `vitest run`
      green with tests asserting: `bitbucket.ts` reads `bitbucket_token` (not
      `api_token`); both-tokens-present → both layers resolve; only-bitbucket
      → Bitbucket resolves, TWG skips; only-TWG → TWG resolves, Bitbucket skips;
      both-missing → both skip with their own warnings.

## Test plan

- **Seams**: `bitbucket.ts`'s `loadCreds(keyring, defaultWorkspace)` is
  injectable (prior task); extend its tests with a fake keyring holding
  `bitbucket_token` vs `api_token` to assert the right token is used. The
  per-layer independence is testable via the `buildAtlassianClient` /
  Bitbucket degrade wrappers in `devlinks.ts` (fake keyring → assert each
  layer's warning independently).
- **Failure modes**: bitbucket token missing → Bitbucket skip + warning;
  api_token missing → TWG skip; both missing → both skip; bitbucket token set
  but email missing → Bitbucket skip (the reader throws on missing email).
- **Scenarios**: both present → both resolve; only one present → only that
  layer resolves; the missing-token warnings name `/aura secrets edit` and
  distinguish which token.

## Constraints and dependencies

- Depends on the infra task (`readBitbucketCredentials`).
- Do not change the Bitbucket REST paths or the Basic-auth header construction.
- Do not change `atlassianClient` / `readAtlassianCredentials`.
- Do not touch the chooser or the guided mode here (later slices).
- The two layers' independence is the key behavioral change — test it.
