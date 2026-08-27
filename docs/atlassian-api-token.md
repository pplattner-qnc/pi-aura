# Creating scoped Atlassian API tokens for pi-aura

pi-aura authenticates to Atlassian with **API tokens + your account email**
sent as HTTP Basic auth — no OAuth, no client app to register. pi-ura needs
**two** tokens because a scoped Atlassian token covers one app:

| Token | App | Used for | Keyring key |
|---|---|---|---|
| **Teamwork Graph PAT** | Rovo MCP V2 | Teamwork Graph dev-links (via `mcp.atlassian.com/v1/mcp/authv2`) | `atlassian/api_token` |
| **Bitbucket PAT** | Bitbucket | Bitbucket dev-links fallback (direct `api.bitbucket.org` REST) | `atlassian/bitbucket_token` |

The Atlassian account **email** is shared (one keyring key `atlassian/email`).
No secrets are written to any file — only the `@pi-aura/shared` keyring.

> The **guided mode** (`/aura secrets edit` → "Guided walkthrough?" → **Yes**)
> reads [`docs/atlassian-api-token-walkthrough.md`](./atlassian-api-token-walkthrough.md)
> at run time and steps you through creating both tokens, storing each, and
> probing access. This is the recommended path — the walkthrough doc is the
> source of truth for the app + scope selections. The manual steps below are
> the same flow for reference.

---

## Prerequisites

- An Atlassian account with access to the org.
- The org admin must have granted the **`read:teamwork_graph`** permission for
  your account — this is a separate org-admin gate, not a token scope. The
  Rovo MCP V2 gateway only returns the Teamwork Graph tools when this
  permission is granted. (If `tools/list` returns no `getTeamworkGraph*` tools,
  this permission is missing — ask your org admin.)
- The Bitbucket workspace configured in `settings.aura.digest.bitbucket.workspace`
  (a non-secret; the Bitbucket probe lists it).

---

## 1. Open the API token page

Sign in with your Atlassian account (the **same email** you will paste into
`/aura secrets edit`):

**https://id.atlassian.com/manage-profile/security/api-tokens**

Click **Create API token**. The flow has 4 steps: **Name and expiry → Select
app → Select scopes → Create token**.

> Pick a label that names its purpose (e.g. `pi-aura-teamwork-graph`,
> `pi-aura-bitbucket`). You can have several tokens at once; the label is how
> you tell them apart on the revoke screen later.

---

## 2. Sequence A — Teamwork Graph PAT (Rovo MCP V2 app)

### Select app
- **Select "Rovo MCP V2"** (description: "API token to access Rovo MCP V2").

### Why Rovo MCP V2 and not the "Teamwork Graph" app?

The "Select the app" list includes a standalone **Teamwork Graph** app, which
is tempting — but pi-aura does **not** call the Teamwork Graph REST API
directly. It calls the **Rovo MCP V2 gateway** (`mcp.atlassian.com/v1/mcp/authv2`),
and that gateway exposes `getTeamworkGraphContext` / `getTeamworkGraphObject` as
its tools. The gateway is what authenticates your token, so the token must be
scoped to the **Rovo MCP V2** app. Selecting the standalone "Teamwork Graph"
app instead would grant direct-graph access pi-aura never uses and would
**not** authorize the MCP gateway path — leaving you with `tools/list`
returning an empty or restricted set.

### Select scopes
The Rovo MCP V2 app offers `*:agent-interface` scopes plus `read:account` /
`read:me`. **There is no `read:teamwork_graph` scope** — Teamwork Graph access
is gated by the separate org-admin `read:teamwork_graph` permission, not a
token scope. The token just needs to authenticate to the gateway.

**Select exactly these (read-only):**
- ✅ `read:account`
- ✅ `read:jira:agent-interface` (the Teamwork Graph tools traverse Jira work items)
- ✅ `search:rovo:agent-interface` (the gateway's read/search surface)

**Do not select** any `write:*` scope, and skip the other read/search scopes
(Bitbucket/Confluence/JSM/Loom) — this PAT is only for Teamwork Graph via the
gateway.

### Create + copy + store
Click **Create token**. **Copy the token immediately** — Atlassian shows it
only once. Store it via `/aura secrets edit`:

```
/aura secrets edit
```

- **Guided mode** (recommended): pick **Yes** at the "Guided walkthrough?"
  prompt — the agent steps you through both tokens and stores each.
- **Manual**: pick **No** at the prompt, then pick **"Atlassian Teamwork Graph
  token"** → paste your Atlassian email, then paste the token. Both are stored
  in one flow (`atlassian/email` + `atlassian/api_token`).

### Probe (direct, read-only)
The guided mode runs this automatically after storing the token:
1. `initialize` → expect 200.
2. `tools/list` → expect `getTeamworkGraphContext`, `getTeamworkGraphObject`,
   `addTeamworkGraphContext` present.
   - If absent: the org-admin `read:teamwork_graph` permission is missing —
     ask your org admin. The token is correct; the org just hasn't allowed it.
     This is a **non-blocker** — the guided mode reports it and continues.
3. A real read-only `getTeamworkGraphContext` call (with the Jira `cloudId`
   from `settings.aura.digest.jiraCloudId`) → expect a structured response
   (a 404 for a non-existent key is a *success* signal: the call authenticated
   and reached the API; an auth/permission error would be the failure signal).

---

## 3. Sequence B — Bitbucket PAT (Bitbucket app)

### Select app
- **Select "Bitbucket"** (description: "API token can only access Bitbucket
  APIs and perform git operations").

The **Bitbucket** app is needed because pi-aura's Bitbucket fallback calls
`api.bitbucket.org` directly (workspace repos, PRs, branches) — it does **not**
go through the Rovo MCP gateway for Bitbucket. The token's `email:token` Basic
auth is the same credential shape, but the app scope gates which Atlassian
surfaces honor it.

### Select scopes
The Bitbucket app offers `read:*:bitbucket`, `write:*:bitbucket`,
`admin:*:bitbucket`, `delete:*:bitbucket` scopes. **Select exactly these
(read-only):**
- ✅ `read:account` (classic — view user profiles)
- ✅ `read:repository:bitbucket` (View your repositories — covers list workspace
  repos + list repo branches)
- ✅ `read:pullrequest:bitbucket` (View your pull requests — covers list repo PRs)
- ✅ `read:workspace:bitbucket` (View your workspaces — covers the workspace lookup)

**Do not select** any `write:*`, `delete:*`, or `admin:*` scope, and skip the
other `read:*` scopes (pipeline, project, snippet, wiki, etc.) — pi-ura doesn't
use them.

> `GET /2.0/user` (identity) requires `read:user:bitbucket`, which is **not**
> in this set. pi-ura never calls `/2.0/user`, so it's intentionally omitted.
> The probes use the workspace + repository endpoints, which pi-ura does call.

### Create + copy + store
Click **Create token**. **Copy the token immediately.** Store it via
`/aura secrets edit`:
- **Guided mode**: the agent continues to Sequence B after Sequence A and
  stores the Bitbucket token (the email is already set — shared).
- **Manual**: pick **No** at the prompt, then pick **"Atlassian Bitbucket
  token"** → paste your Atlassian email (or it's already set from Sequence A),
  then paste the Bitbucket token (`atlassian/bitbucket_token`).

### Probe (direct, read-only)
The guided mode runs this automatically after storing the token:
1. `GET /2.0/workspaces/<workspace>` → expect 200 + the workspace object.
2. `GET /2.0/repositories/<workspace>?pagelen=5` → expect 200 + a list of repos.
3. `GET /2.0/repositories/<workspace>/<repo>/pullrequests?pagelen=3` → expect
   200 (an empty list is fine).
4. `GET /2.0/repositories/<workspace>/<repo>/refs/branches?pagelen=3` → expect
   200 + a list of branch names.
   - A 403 naming a missing scope → recreate the token with the right scopes
     and re-probe. (Do **not** probe `/2.0/user` — it needs
     `read:user:bitbucket`, which pi-ura doesn't use.)

---

## 4. Verify

After both tokens are stored, run a digest fetch. The Teamwork Graph dev-links
layer and the Bitbucket dev-links layer should now resolve independently:

```
digest-fetch
```

- **Success**: the dev-links section populates with related PRs/branches.
- **Missing `read:teamwork_graph` permission** (Teamwork Graph tools absent
  from `tools/list`): this is an **org-admin** gate, not a token scope — ask
  your Atlassian org admin to grant the `read:teamwork_graph` permission for
  your account. The token itself is correct; the org just hasn't allowed it.
  The Teamwork Graph layer skips with its own `/aura secrets edit` warning;
  the Bitbucket layer is unaffected (the two layers degrade independently).
- **`no Atlassian credential in keyring`** / **`no Bitbucket credential in
  keyring`**: you haven't stored the email/token yet — re-run `/aura secrets
  edit`.
- **`invalid_token`**: the token was revoked or pasted with whitespace —
  re-copy and re-run `/aura secrets edit`.

---

## 5. Revoke / rotate

To rotate or revoke a token, return to
https://id.atlassian.com/manage-profile/security/api-tokens, find it by the
label you used, and revoke it. Then create a new one and re-run
`/aura secrets edit` (the keyring entry is overwritten).

---

## Summary (TL;DR)

1. `/aura secrets edit` → **Yes** at "Guided walkthrough?" → the agent steps
   you through both tokens from the walkthrough doc (recommended), OR
   `/aura secrets edit` → **No** → pick **"Atlassian Teamwork Graph token"**
   then **"Atlassian Bitbucket token"** to store each manually.
2. **Two tokens, one email:** Teamwork Graph PAT (Rovo MCP V2 app, scopes
   `read:account` + `read:jira:agent-interface` + `search:rovo:agent-interface`)
   → `atlassian/api_token`; Bitbucket PAT (Bitbucket app, scopes `read:account`
   + `read:repository:bitbucket` + `read:pullrequest:bitbucket` +
   `read:workspace:bitbucket`) → `atlassian/bitbucket_token`. Shared
   `atlassian/email`.
3. Read-only only — never select `write:*`, `delete:*`, or `admin:*`.
4. The guided mode probes each token after storing it; a missing
   `read:teamwork_graph` permission is a non-blocker (reported, flagged).
5. `digest-fetch` to verify. The two dev-links layers degrade independently.
