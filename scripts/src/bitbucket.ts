// bitbucket.ts — Bitbucket REST client (direct HTTP, basic auth).
//
// The atlassian-bitbucket MCP server is stdio (npx), which a standalone script
// can't easily drive, but the same Atlassian email + API token stored in the
// @pi-aura/shared keyring ({service:"atlassian",name:"email"} +
// {service:"atlassian",name:"api_token"}) work against api.bitbucket.org
// directly via HTTP basic auth. The workspace comes from
// settings.aura.digest.bitbucket.workspace (a non-secret config value).
// This module wraps the small subset we need: list workspace repos, list repo
// PRs (with a q filter), list repo branches.

import { readAtlassianCredentials } from "./clients.js";
import type { Keyring } from "@pi-aura/shared/keyring";

interface BitbucketCreds {
  email: string;
  token: string;
  defaultWorkspace: string;
}

/** Load Bitbucket credentials from the shared Atlassian keyring + a
 *  caller-provided defaultWorkspace (from settings). Throws an Error whose
 *  message names `/aura secrets edit` when the Atlassian keyring entries are
 *  missing/empty. Throws when defaultWorkspace is empty (workspace-specific
 *  warning). The caller (devlinks.ts) wraps these throws into a layer-skip
 *  warning, mirroring buildAtlassianClient's degrade pattern — the Bitbucket
 *  layer is skipped, never an unhandled throw.
 *
 *  Exported for unit testing with an injectable Keyring + a
 *  defaultWorkspace string — no mcp.json read. */
export async function loadCreds(
  keyring: Keyring,
  defaultWorkspace: string,
): Promise<BitbucketCreds> {
  const { email, token } = await readAtlassianCredentials(keyring);
  if (!defaultWorkspace) {
    throw new Error("Bitbucket workspace not set in settings (configure settings.aura.digest.bitbucket.workspace)");
  }
  return { email, token, defaultWorkspace };
}

async function bbFetch<T>(
  path: string,
  query: Record<string, string>,
  keyring: Keyring,
  defaultWorkspace: string,
): Promise<T> {
  const creds = await loadCreds(keyring, defaultWorkspace);
  const url = new URL(`https://api.bitbucket.org/2.0${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${creds.email}:${creds.token}`).toString("base64"),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bitbucket ${path} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

interface BbPaginated<T> {
  size?: number;
  pagelen: number;
  page?: number;
  next?: string | null;
  values: T[];
}

export interface BbPullRequest {
  id: number;
  title: string;
  state: string;
  source: { branch: { name: string } };
  destination: { branch: { name: string } };
  links?: { html?: { href: string } };
}

export interface BbBranch {
  name: string;
  target: { hash: string };
}

/** List all repo slugs in the workspace (sorted by updated_on desc). */
export async function listWorkspaceRepos(
  workspace: string,
  keyring: Keyring,
): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;
  // Page through; 100 per page.
  for (let safety = 0; safety < 10; safety++) {
    const data = await bbFetch<BbPaginated<{ slug: string; updated_on: string }>>(
      `/repositories/${workspace}`,
      { pagelen: "100", page: String(page), sort: "updated_on", fields: "values.slug,pagelen,page,next" },
      keyring,
      workspace,
    );
    slugs.push(...data.values.map((v) => v.slug));
    if (!data.next) break;
    page++;
  }
  return slugs;
}

/** Search a repo's PRs (any state) by a `q` filter, returning matched PRs. */
export async function searchRepoPRs(
  workspace: string,
  repo: string,
  q: string,
  keyring: Keyring,
): Promise<BbPullRequest[]> {
  const data = await bbFetch<BbPaginated<BbPullRequest>>(
    `/repositories/${workspace}/${repo}/pullrequests`,
    { pagelen: "50", q, fields: "values.id,values.title,values.state,values.source.branch.name,values.destination.branch.name,values.links.html.href" },
    keyring,
    workspace,
  );
  return data.values;
}

/** Search a repo's branches by a `q` filter (name~"..."). */
export async function searchRepoBranches(
  workspace: string,
  repo: string,
  q: string,
  keyring: Keyring,
): Promise<BbBranch[]> {
  const data = await bbFetch<BbPaginated<BbBranch>>(
    `/repositories/${workspace}/${repo}/refs/branches`,
    { pagelen: "50", q, fields: "values.name,values.target.hash" },
    keyring,
    workspace,
  );
  return data.values;
}
