---
kind: task
type: manual
slug: provision-atlassian-pats
title: Collaboratively create + verify both scoped Atlassian PATs
map: atlassian-bitbucket-token
status: done
blocked_by:
- bitbucket-token-infra
---

## Exact prerequisite

Two scoped Atlassian API tokens exist in the `@pi-aura/shared` keyring and
have been **directly probed** for the access pi-aura needs:

1. **Teamwork Graph PAT** — `atlassian/api_token` — scoped to the **Rovo MCP V2**
   app, read-only Teamwork Graph scope.
2. **Bitbucket PAT** — `atlassian/bitbucket_token` — scoped to the **Bitbucket**
   app, read-only `pullrequest:read` + `repository:read`.

The shared `atlassian/email` is also stored. Both tokens are verified by a
direct API probe (not a digest-fetch) before this task is done.

## Owner / actor

- **Human (the user)**: drives the Atlassian token-creation UI in the browser,
  shows the agent what each screen asks, and confirms each selection.
- **Agent**: tells the user exactly what to answer at each step, stores the
  resulting token + email in the keyring via `/aura secrets edit`, runs the
  direct access probe after each PAT, and records the full walkthrough into
  `docs/atlassian-api-token-walkthrough.md`.

## Safe automation boundary

The agent does **not**:
- open a browser or drive the Atlassian UI (the human does);
- write credentials into any committed file or `mcp.json`;
- make Atlassian API calls beyond the read-only probe described below;
- skip the probe — a token that stores but fails the probe is **not** done.

The agent **does**:
- run `/aura secrets edit` to store each token + the email in the keyring;
- run a read-only direct API probe after each PAT;
- write the walkthrough doc (no secrets in it — only the steps + selections).

## The two provisioning sequences

### Sequence A — Teamwork Graph PAT (`atlassian/api_token`, Rovo MCP V2 app)

1. Agent: point the user to https://id.atlassian.com/manage-profile/security/api-tokens
   → Create API token.
2. Human: reports what the "Select the app" stage offers / asks.
3. Agent: instructs — select **Rovo MCP V2**; scopes: the read-only
   Teamwork Graph scope (narrowest `read:teamwork_graph` / `read:graph`
   available). No `write`/`admin`.
4. Human: confirms the selection + creates the token; reports success.
5. Agent: has the human copy the token; runs `/aura secrets edit` → the
   "Atlassian Teamwork Graph token" item, which prompts for the email and then
   the token in one flow (once the wire task ships it; until then, store via
   the infra task's keyring exports — email first, then the token under
   `atlassian/api_token`).
6. Agent: **probe** — call `mcp.atlassian.com/v1/mcp/authv2`:
   - `initialize` → expect 200;
   - `tools/list` → expect `getTeamworkGraphContext` + `getTeamworkGraphObject`
     present;
   - a real `getTeamworkGraphContext` call for one Jira key (read-only) →
     expect a 200 / non-error result, OR a clear permission error that names
     the missing org-admin `read:teamwork_graph` permission (which is an
     org-admin gate, not a token-scope failure — record it as such).
7. Record the step-by-step + the user's selections into the walkthrough doc
   (this sequence's section).

### Sequence B — Bitbucket PAT (`atlassian/bitbucket_token`, Bitbucket app)

8. Human: returns to the token page → Create API token.
9. Agent: instructs — select **Bitbucket**; scopes: `pullrequest:read` +
   `repository:read` (read-only). No `write`/`delete`.
10. Human: confirms + creates; reports success.
11. Agent: has the human copy the token; runs `/aura secrets edit` → the
    "Atlassian Bitbucket token" item, which prompts for the email and then
    the token in one flow (once the wire task ships it; until then, store via
    the infra task's keyring exports — email first, then the token under
    `atlassian/bitbucket_token`).
12. Agent: **probe** — call `api.bitbucket.org/2.0/user` with
    `Basic base64(email:bitbucket_token)` → expect 200 + the user object;
    then `GET /2.0/workspaces/<workspace>` (workspace from
    `settings.aura.digest.bitbucket.workspace`) → expect 200, or a clear
    401/403 naming the missing scope.
13. Record sequence B's steps + selections into the walkthrough doc.

## Evidence required to mark done

- [ ] `atlassian/email` is set in the keyring.
- [ ] `atlassian/api_token` is set and the Rovo MCP V2 probe succeeded
      (`tools/list` returned the Teamwork Graph tools; the real
      `getTeamworkGraphContext` call did not return a token-scope error — an
      org-admin permission error is recorded separately and is not a blocker
      for *this* task, but is flagged).
- [ ] `atlassian/bitbucket_token` is set and the Bitbucket probe succeeded
      (`/2.0/user` → 200; workspace lookup → 200 or a scope-named 403/401 that
      the user then resolves by recreating the token with the right scopes —
      the probe is re-run until it passes).
- [ ] `docs/atlassian-api-token-walkthrough.md` exists and captures both
      sequences' steps + the user's selections (no secrets in the doc).
- [ ] The walkthrough doc is structured so the wire task's guided-mode feature
      can drive from it (clear step headings, the exact app + scope names, the
      probe commands).

## Dependent tasks that remain blocked

- `wire-bitbucket-guided-edit` is blocked until this task is done: it consumes
  the walkthrough doc to implement the guided `/aura secrets edit` flow.

## Notes

- The probe is read-only and uses only the credential under test. A failing
  probe is a designed-for stop: the agent reports the exact error (missing
  scope, org-admin permission, expired/revoked token) and the user recreates or
  fixes before proceeding.
- Never put the token values in the walkthrough doc or any committed file —
  only the steps and the app/scope selections.
