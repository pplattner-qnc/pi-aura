// bitbucket.ts — Bitbucket REST client (direct HTTP, basic auth).
//
// The atlassian-bitbucket MCP server is stdio (npx), which a standalone script
// can't easily drive, but the same credentials in mcp.json
// (ATLASSIAN_USER_EMAIL + ATLASSIAN_API_TOKEN) work against api.bitbucket.org
// directly via HTTP basic auth. This module wraps the small subset we need:
// list workspace repos, list repo PRs (with a q filter), list repo branches.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MCP_CONFIG_PATH = join(homedir(), ".config", "mcp", "mcp.json");

interface BitbucketCreds {
  email: string;
  token: string;
  defaultWorkspace: string;
}

function loadCreds(serverName = "atlassian-bitbucket"): BitbucketCreds {
  const config = JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf8")) as {
    mcpServers: Record<string, { env?: Record<string, string> }>;
  };
  const env = config.mcpServers[serverName]?.env;
  if (!env) throw new Error(`${serverName} server not found in mcp.json`);
  const email = env.ATLASSIAN_USER_EMAIL;
  const token = env.ATLASSIAN_API_TOKEN;
  const defaultWorkspace = env.BITBUCKET_DEFAULT_WORKSPACE;
  if (!email || !token || !defaultWorkspace) {
    throw new Error(`${serverName} env missing ATLASSIAN_USER_EMAIL/ATLASSIAN_API_TOKEN/BITBUCKET_DEFAULT_WORKSPACE`);
  }
  return { email, token, defaultWorkspace };
}

async function bbFetch<T>(path: string, query: Record<string, string>, serverName = "atlassian-bitbucket"): Promise<T> {
  const creds = loadCreds(serverName);
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
export async function listWorkspaceRepos(workspace: string, serverName = "atlassian-bitbucket"): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;
  // Page through; 100 per page.
  for (let safety = 0; safety < 10; safety++) {
    const data = await bbFetch<BbPaginated<{ slug: string; updated_on: string }>>(
      `/repositories/${workspace}`,
      { pagelen: "100", page: String(page), sort: "updated_on", fields: "values.slug,pagelen,page,next" },
      serverName
    );
    slugs.push(...data.values.map((v) => v.slug));
    if (!data.next) break;
    page++;
  }
  return slugs;
}

/** Search a repo's PRs (any state) by a `q` filter, returning matched PRs. */
export async function searchRepoPRs(workspace: string, repo: string, q: string, serverName = "atlassian-bitbucket"): Promise<BbPullRequest[]> {
  const data = await bbFetch<BbPaginated<BbPullRequest>>(
    `/repositories/${workspace}/${repo}/pullrequests`,
    { pagelen: "50", q, fields: "values.id,values.title,values.state,values.source.branch.name,values.destination.branch.name,values.links.html.href" },
    serverName
  );
  return data.values;
}

/** Search a repo's branches by a `q` filter (name~"..."). */
export async function searchRepoBranches(workspace: string, repo: string, q: string, serverName = "atlassian-bitbucket"): Promise<BbBranch[]> {
  const data = await bbFetch<BbPaginated<BbBranch>>(
    `/repositories/${workspace}/${repo}/refs/branches`,
    { pagelen: "50", q, fields: "values.name,values.target.hash" },
    serverName
  );
  return data.values;
}
