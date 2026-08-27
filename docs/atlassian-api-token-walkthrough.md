# Atlassian API token — guided walkthrough

The recorded walkthrough for creating the two scoped Atlassian API tokens
pi-aura needs. The `/aura secrets edit` guided mode (task
`wire-bitbucket-guided-edit`) drives from this doc at run time.

**No secrets are stored here** — only the steps and the app/scope selections.
Tokens live only in the `@pi-aura/shared` keyring.

pi-aura needs **two** tokens because a scoped Atlassian token covers one app:

| Token | App | Used for | Keyring key |
|---|---|---|---|
| Teamwork Graph PAT | Rovo MCP V2 | Teamwork Graph dev-links (via `mcp.atlassian.com/v1/mcp/authv2`) | `atlassian/api_token` |
| Bitbucket PAT | Bitbucket | Bitbucket dev-links fallback (direct `api.bitbucket.org` REST) | `atlassian/bitbucket_token` |

The Atlassian account **email** is shared (one keyring key `atlassian/email`).

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

## Sequence A — Teamwork Graph PAT (Rovo MCP V2 app, keyring `atlassian/api_token`)

### Step 1 — Open the token page
Go to https://id.atlassian.com/manage-profile/security/api-tokens (sign in with
your Atlassian account). Click **Create API token**.

The flow has 4 steps: **Name and expiry → Select app → Select scopes →
Create token**.

### Step 2 — Name and expiry
- **Label**: `pi-aura-teamwork-graph` (or any name you'll recognize on the
  revoke screen).
- **Expiry**: the maximum your org allows (a scoped, read-only token is low
  risk).

### Step 3 — Select app
- **Select "Rovo MCP V2"** (description: "API token to access Rovo MCP V2").

### Step 4 — Select scopes
The Rovo MCP V2 app offers these scopes (all `*:agent-interface`, plus
`read:account` / `read:me`):

```
classic    read:account    Required to view users profiles.
read:bitbucket:agent-interface    Read access to Bitbucket via Agent Interface
read:confluence:agent-interface  Read access to Atlassian Confluence via Agent Interface
read:jira:agent-interface        Read access to Jira via Agent Interface
read:jsm:agent-interface         Read access to Jira Service Management via Agent Interface
read:loom:agent-interface       Read access to Loom via Agent Interface
classic    read:me    View the profile details for the currently logged-in user.
search:confluence:agent-interface  Search access to Atlassian Confluence via Agent Interface
search:jira:agent-interface       Search access to Jira via Agent Interface
search:rovo:agent-interface       Search access to Atlassian content via Rovo Agent Interface
write:bitbucket:agent-interface   Write access to Bitbucket via Agent Interface
write:confluence:agent-interface  Write access to Atlassian Confluence via Agent Interface
write:jira:agent-interface        Write access to Jira via Agent Interface
write:jsm:agent-interface        Write access to Jira Service Management via Agent Interface
write:loom:agent-interface       Write access to Loom via Agent Interface
```

**There is no `read:teamwork_graph` scope** — Teamwork Graph access is gated
by the separate org-admin `read:teamwork_graph` permission, not a token scope.
The token just needs to authenticate to the gateway.

**Select exactly these (read-only):**
- ✅ `read:account`
- ✅ `read:jira:agent-interface` (the Teamwork Graph tools traverse Jira work items)
- ✅ `search:rovo:agent-interface` (the gateway's read/search surface)

**Do not select** any `write:*` scope, and skip the other read/search scopes
(Bitbucket/Confluence/JSM/Loom) — this PAT is only for Teamwork Graph via the
gateway.

### Step 5 — Create token + copy
Click **Create token**. **Copy the token immediately** — Atlassian shows it
only once.

### Step 6 — Store in the keyring
Store the email + token in the keyring (via `/aura secrets edit` once the
combined flow ships, or directly during this guided session):
- `atlassian/email` → your Atlassian account email
- `atlassian/api_token` → the copied token

### Step 7 — Probe (direct, read-only)
Verify access against the Rovo MCP V2 gateway:
1. `initialize` → expect 200.
2. `tools/list` → expect `getTeamworkGraphContext`, `getTeamworkGraphObject`,
   `addTeamworkGraphContext` present.
   - If absent: the org-admin `read:teamwork_graph` permission is missing —
     ask your org admin. The token is correct; the org just hasn't allowed it.
3. A real read-only `getTeamworkGraphContext` call (with the Jira `cloudId`
   from `settings.aura.digest.jiraCloudId` and any Jira work-item key) → expect
   a structured response (a 404 for a non-existent key is a *success* signal:
   the call authenticated and reached the API; an auth/permission error would
   be the failure signal).

**Recorded result (this session):** `initialize` 200, `tools/list` 200, all
three TWG tools present; real `getTeamworkGraphContext` returned a structured
`PROBE-0` 404 (issue not found) — confirming end-to-end access.

---

## Sequence B — Bitbucket PAT (Bitbucket app, keyring `atlassian/bitbucket_token`)

### Step 1 — Open the token page
Return to https://id.atlassian.com/manage-profile/security/api-tokens. Click
**Create API token**.

### Step 2 — Name and expiry
- **Label**: `pi-aura-bitbucket`.
- **Expiry**: the maximum your org allows.

### Step 3 — Select app
- **Select "Bitbucket"** (description: "API token can only access Bitbucket APIs
  and perform git operations").

### Step 4 — Select scopes
The Bitbucket app offers many scopes (`read:*:bitbucket`, `write:*:bitbucket`,
`admin:*:bitbucket`, `delete:*:bitbucket`). pi-ura's Bitbucket fallback makes
three calls — list workspace repos, list repo PRs, list repo branches — plus a
workspace lookup. **Select exactly these (read-only):**
- ✅ `read:account` (classic — view user profiles)
- ✅ `read:repository:bitbucket` (View your repositories — covers list workspace
  repos + list repo branches)
- ✅ `read:pullrequest:bitbucket` (View your pull requests — covers list repo PRs)
- ✅ `read:workspace:bitbucket` (View your workspaces — covers the workspace lookup)

**Do not select** any `write:*`, `delete:*`, or `admin:*` scope, and skip the
other `read:*` scopes (pipeline, project, snippet, wiki, etc.) — pi-ura doesn't
use them.

> Note: `GET /2.0/user` (identity) requires `read:user:bitbucket`, which is **not**
> in this set. pi-ura never calls `/2.0/user`, so it's intentionally omitted. The
> probes below use the workspace + repository endpoints, which pi-ura does call.

### Step 5 — Create token + copy
Click **Create token**. **Copy the token immediately.**

### Step 6 — Store in the keyring
- `atlassian/email` → (already set from Sequence A — shared)
- `atlassian/bitbucket_token` → the copied token

### Step 7 — Probe (direct, read-only)
Verify access against `api.bitbucket.org` (workspace from
`settings.aura.digest.bitbucket.workspace`):
1. `GET /2.0/workspaces/<workspace>` → expect 200 + the workspace object.
2. `GET /2.0/repositories/<workspace>?pagelen=5` → expect 200 + a list of repos.
3. `GET /2.0/repositories/<workspace>/<repo>/pullrequests?pagelen=3` → expect
   200 (an empty list is fine).
4. `GET /2.0/repositories/<workspace>/<repo>/refs/branches?pagelen=3` → expect
   200 + a list of branch names.
   - A 403 naming a missing scope → recreate the token with the right scopes
     and re-probe. (Do **not** probe `/2.0/user` — it needs `read:user:bitbucket`,
     which pi-ura doesn't use.)

**Recorded result (this session):** workspace lookup 200, workspace repos 200
(real repos listed), repo PRs 200, repo branches 200 (real branches listed).
The `/2.0/user` identity probe returned 403 (needs `read:user:bitbucket`) —
intentionally not in scope; pi-ura never calls it.
