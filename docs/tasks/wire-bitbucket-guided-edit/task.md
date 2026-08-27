---
kind: task
type: feature
slug: wire-bitbucket-guided-edit
title: Wire bitbucket.ts to the Bitbucket token + combined email+token edit flow + guided walkthrough
map: atlassian-bitbucket-token
status: ready
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
