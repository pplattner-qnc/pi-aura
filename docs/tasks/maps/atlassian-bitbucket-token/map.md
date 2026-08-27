---
kind: map
slug: atlassian-bitbucket-token
title: "Split the Atlassian credential + guided PAT provisioning"
status: active
tasks:
  - slug: bitbucket-token-infra
    blocked_by: []
    done: false
  - slug: provision-atlassian-pats
    blocked_by:
      - bitbucket-token-infra
    done: false
  - slug: wire-bitbucket-guided-edit
    blocked_by:
      - provision-atlassian-pats
    done: false
---

## Destination

pi-aura stores **two** scoped Atlassian API tokens in the `@pi-aura/shared`
keyring — one for the Rovo MCP V2 gateway (Teamwork Graph) and one for the
Bitbucket direct REST fallback — because a scoped Atlassian token can cover
only one app. `/aura secrets edit` offers a **guided walkthrough** that
collaboratively creates both PATs (the user shows what the Atlassian screen
asks, the agent says what to answer, the user confirms, the agent probes the
resulting access) or skips straight to the existing per-secret paste flow.

## Why

A scoped Atlassian token covers one app, so pi-aura's two surfaces
(`mcp.atlassian.com/v1/mcp/authv2` for Teamwork Graph, `api.bitbucket.org` for
Bitbucket) need separate tokens. The prior task assumed one shared token; the
real Atlassian token-creation screen forced a split. The guided walkthrough
removes the guesswork from the scoped-token creation screen (which app, which
scopes) and verifies each token's access before moving on.

## Constraints

- **Two tokens in the keyring**, both via `/aura secrets edit` (no
  auto-discovery, no MCP env):
  - `{ service: "atlassian"; name: "api_token" }` — Rovo MCP V2 (Teamwork Graph)
  - `{ service: "atlassian"; name: "bitbucket_token" }` — Bitbucket direct REST
- `{ service: "atlassian"; name: "email" }` stays **shared**.
- The guided walkthrough is a **yes/no prompt before the chooser** in
  `/aura secrets edit`. Yes → create both PATs collaboratively + probe each.
  No → the existing per-secret paste chooser (unchanged).
- The walkthrough recording lives in a dedicated
  `docs/atlassian-api-token-walkthrough.md` that the guided-mode feature drives
  from / replays later.
- Per-token **direct API probe** verifies access after each PAT: Rovo MCP V2
  (`tools/list` + a real `getTeamworkGraphContext`), Bitbucket
  (`api.bitbucket.org/2.0/user` + list the workspace). Names the exact missing
  scope/permission.
- Read-only scopes only; pi-aura never mutates Atlassian data.

## Decisions so far

- Two tokens in the keyring (user-confirmed); email shared.
- Yes/no prompt before the chooser triggers the guided flow.
- Direct per-token API probe (not a full digest-fetch) verifies access.
- Dedicated walkthrough doc (reusable by the feature).
- Structure: infra (feature, afk) → manual provisioning session (HITL) →
  wire + guided edit (feature, hitl). The manual session sits between the
  infra and the UI so the bitbucket_token key exists before PAT 2 is created
  + probed, and the walkthrough doc exists before the guided-mode feature
  consumes it.
- **Combined email+token flow per PAT**: the chooser's two Atlassian token
  items ("Atlassian Teamwork Graph token", "Atlassian Bitbucket token") each
  prompt for the email and then the token in one flow, so the user provisions
  a PAT's full credential set from a single menu item. The standalone
  "Atlassian email" chooser item is removed — the email is set as part of
  each PAT flow (and reused if already set).

## Fog

- Exact wording of the yes/no prompt + the guided flow's step prompts (decided
  in the wire task's arch spec / slice doc).
- Whether the guided flow should offer to also set the Atlassian email if it's
  missing — now answered: yes, the email is part of each PAT's combined
  email+token flow (no standalone email item).
- The walkthrough doc's exact shape (driven by what the manual session actually
  records — see the manual task).

## Out of scope

- OAuth 3LO / refresh tokens.
- Auto-discovery of either token.
- A separate `/atlassian secrets` command.
- Changing the Rovo MCP V2 transport or the Bitbucket REST paths.
- Moving `defaultWorkspace` into the keyring.
