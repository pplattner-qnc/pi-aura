# Creating a scoped Atlassian API token for pi-aura

pi-aura authenticates to Atlassian with an **API token + your account email**
sent as HTTP Basic auth — no OAuth, no client app to register. This walks you
through creating a **scoped** token that carries only the permissions pi-aura
needs, so you don't hand it a blanket "your whole account" credential.

You need to do this **once**. The token lands in the `@pi-aura/shared` keyring
via `/aura secrets edit` and is reused by both the Teamwork Graph layer and the
Bitbucket layer.

---

## 1. Open the API token page

Sign in with your Atlassian account (the **same email** you will paste into
`/aura secrets edit`):

**https://id.atlassian.com/manage-profile/security/api-tokens**

Click **Create API token**.

> Pick a label that names its purpose, e.g. `pi-aura-digest`. You can have
> several tokens at once; the label is how you tell them apart on the revoke
> screen later.

---

## 2. Select the app(s)

You are now on the **"Select the app"** stage. pi-aura reaches Atlassian
through **two** surfaces, so the token must cover both:

| pi-aura surface | Atlassian app to select |
|---|---|
| **Teamwork Graph dev-links** (Jira → PRs) — via the Rovo MCP gateway at `mcp.atlassian.com/v1/mcp/authv2` | **Rovo MCP V2** |
| **Bitbucket fallback** (PR/branch lookup) — direct REST at `api.bitbucket.org` | **Bitbucket** |

So: **select both "Rovo MCP V2" and "Bitbucket".**

### Why Rovo MCP V2 and not the "Teamwork Graph" app?

The "Select the app" list includes a standalone **Teamwork Graph** app, which
is tempting — but pi-aura does **not** call the Teamwork Graph REST API
directly. It calls the **Rovo MCP V2 gateway** (`mcp.atlassian.com/v1/mcp/authv2`),
and that gateway exposes `getTeamworkGraphContext` / `getTeamworkGraphObject` as
its tools. The gateway is what authenticates your token, so the token must be
scoped to the **Rovo MCP V2** app. (Atlassian's own deep link for this flow
uses `appId=mcp-v2`.) Selecting the standalone "Teamwork Graph" app instead
would grant direct-graph access pi-aura never uses and would **not** authorize
the MCP gateway path — leaving you with `tools/list` returning an empty or
restricted set.

The **Bitbucket** app is needed because pi-aura's Bitbucket fallback calls
`api.bitbucket.org` directly (workspace repos, PRs, branches) — it does **not**
go through the Rovo MCP gateway for Bitbucket. The token's `email:token` Basic
auth is the same credential, but the app scope gates which Atlassian surfaces
honor it.

---

## 3. Select the scopes

After selecting the apps, Atlassian shows the scopes each app offers. Pick
the **read-only** scopes pi-ura actually uses:

### Rovo MCP V2 — select:
- **`read:teamwork_graph`** (or the closest available `read:*` scope covering
  Teamwork Graph) — lets the gateway return `getTeamworkGraphContext` /
  `getTeamworkGraphObject` results. This is the only Rovo MCP V2 scope pi-aura
  needs; it never writes to the graph.

> If the screen offers a broader `read:jira`-style scope as the only way to get
> Teamwork Graph through the gateway, that's acceptable — but prefer the
> narrowest `read:teamwork_graph` / `read:graph` option when listed. Avoid any
> `write:*` or `admin:*` scope; pi-aura is read-only against Atlassian.

### Bitbucket — select:
- **`pullrequest:read`** — read PRs and their metadata (the Bitbucket fallback
  searches PRs per repo).
- **`repository:read`** — list workspace repos and read repo metadata (needed
  to enumerate repos before searching their PRs).
- **`issue:read`** *(only if you also use pi-aura for Jira-issue lookups via
  Bitbucket — usually not needed; skip unless a later step fails.)*

> The exact scope names on the screen may differ slightly from the strings
> above (Atlassian occasionally relabels them). Match by **intent**: the
> read-only PR + read-only repository/repo scopes for Bitbucket, and the
> read-only Teamwork-Graph scope for Rovo MCP V2. Never select a `write` or
> `delete` scope — pi-aura never mutates Atlassian data.

---

## 4. Create and copy the token

1. Click **Create** (or **Create API token**).
2. **Copy the token immediately** — Atlassian shows it only once. You will not
   be able to see it again; if you lose it, revoke and recreate.
3. Do **not** close the page until you've pasted it somewhere safe or directly
   into the next step.

> Set the expiry to the maximum Atlassian offers for your org unless your
> security policy mandates shorter rotation. A scoped, read-only token is low
> risk; rotating it means re-running `/aura secrets edit`.

---

## 5. Store the token + your email in the keyring

Run the slash command in pi:

```
/aura secrets edit
```

A chooser appears with three options. Do **both** of these:

1. **Pick "Atlassian email"** → paste the Atlassian account email you signed in
   with (the same one the token is bound to). Save.
2. Run `/aura secrets edit` again → **pick "Atlassian API token"** → paste the
   token you just copied. Save.

> The email and token are stored as two separate keyring entries
> (`atlassian/email` and `atlassian/api_token`) in the same
> `@pi-aura/shared` keyring the Aura PAT uses. They are never written to the
> repo, `mcp.json`, or any committed file.

---

## 6. Verify

Run a digest fetch. The Teamwork Graph dev-links layer should now resolve
instead of skipping:

```
digest-fetch
```

- **Success**: the dev-links section populates with related PRs/branches.
- **Missing scope** (e.g. `Access denied: ... has not authorized the
  read:teamwork_graph permission`): this is an **org-admin** gate, not a token
  scope — ask your Atlassian org admin to grant the `read:teamwork_graph`
  permission for your account. The token itself is correct; the org just
  hasn't allowed it. (This is separate from the scoped-token step above.)
- **`no Atlassian credential in keyring`**: you haven't stored the email/token
  yet — repeat step 5.
- **`invalid_token`**: should no longer occur. If it does, the token was
  revoked or pasted with whitespace — re-copy and re-run step 5.

---

## 7. Revoke / rotate

To rotate or revoke the token later, return to
https://id.atlassian.com/manage-profile/security/api-tokens, find it by the
label you used, and revoke it. Then create a new one and re-run step 5 (the
keyring entry is overwritten).

---

## Summary (TL;DR)

1. https://id.atlassian.com/manage-profile/security/api-tokens → **Create API token**
2. **Select the app:** both **Rovo MCP V2** and **Bitbucket**
3. **Scopes:** `read:teamwork_graph` (Rovo MCP V2) + `pullrequest:read` +
   `repository:read` (Bitbucket). Read-only only.
4. Copy the token (shown once).
5. `/aura secrets edit` → store **Atlassian email**, then again → store
   **Atlassian API token**.
6. `digest-fetch` to verify.
