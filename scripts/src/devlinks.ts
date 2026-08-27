// devlinks.ts — find related PRs / branches for Aura tasks.
//
// Per queue task, in priority order:
//   1. Teamwork Graph (primary): task -> Jira keys (from Aura's jira_issues[])
//      -> atlassian getTeamworkGraphContext -> hydrate PR ARIs. Catches PRs
//      whose title/branch references the Jira key, across GitHub + Bitbucket.
//   2. GitHub fallback: `gh search prs "<AURA-key>" --owner <org>` catches PRs
//      keyed by the Aura key (no Jira link in the PR).
//   3. Bitbucket fallback: search preferredRepos first; if nothing found, fetch
//      the workspace repo list and cross-reference repo names against the
//      task's text (title + description + Jira summary) via a similarity score,\n//      then search the top 5 best-matching repos.
//
// Each layer degrades independently — errors are collected per task so the\n// orchestrator can surface them rather than silently dropping links.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { McpClient } from "./mcp-client.js";
import { atlassianClient, readBitbucketCredentials } from "./clients.js";
import {
  searchRepoBranches,
  searchRepoPRs,
  listWorkspaceRepos,
  type BbPullRequest,
  type BbBranch,
} from "./bitbucket.js";
import type {
  DevLinkBranch,
  DevLinkPullRequest,
  TaskDevLinks,
} from "./types.js";
import type { Task } from "@pi-aura/shared/aura-client";
import type { AuraDigestSettings } from "./settings.js";
import type { Keyring } from "@pi-aura/shared/keyring";

// --- Atlassian Teamwork Graph shapes (subset) -----------------------------

interface TwgContextResult {
  data: {
    data: {
      object?: { ari: string; key: string; summary: string };
      relationships?: Array<{
        relationshipName: string;
        targetObjectType: string;
        targets: Array<{ ari: string; title: string }>;
      }>;
      relationshipSummary?: Array<{
        relationshipName: string;
        targetObjectTypes: string[];
        countsByTargetType: Record<string, number>;
        totalCount: number;
      }>;
    };
  };
  statusCode: number;
}

interface TwgObjectResult {
  data: {
    data: {
      objects: Array<{
        ari: string;
        raw: {
          title: string;
          pullRequestStatus: string;
          url: string;
          displayId?: string;
          provider: { name: string };
          author?: { name: string };
          source?: { branch?: { name: string } };
          destination?: { branch?: { name: string } };
        };
      }>;
    };
  };
  statusCode: number;
}

// --- GitHub `gh` helper ---------------------------------------------------

interface GhPr {
  number: number;
  title: string;
  state: string;
  url: string;
  repository?: { name?: string; nameWithOwner?: string };
}

const execFileAsync = promisify(execFile);

// Per-owner `gh` search used to be execFileSync, which blocked the event loop
// for up to 30s per call and showed up as a blocking-io + event-loop-stall
// finding under the profiler. The async variant frees the loop and lets the
// owners run concurrently.
async function ghSearchPRsOnce(query: string, owner: string): Promise<GhPr[]> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["search", "prs", query, "--owner", owner, "--json", "number,title,state,url,repository", "--limit", "20"],
      { encoding: "utf8", timeout: 30_000 },
    );
    return JSON.parse(stdout) as GhPr[];
  } catch {
    // gh not authed, or search failed for this owner — skip silently.
    return [];
  }
}

/** Search GitHub PRs across all configured owners concurrently. */
async function ghSearchPRs(query: string, owners: string[]): Promise<GhPr[]> {
  const perOwner = await Promise.all(owners.map((o) => ghSearchPRsOnce(query, o)));
  return perOwner.flat();
}

// --- similarity scoring for the Bitbucket fallback ------------------------

/** Tokenize a string into lowercase word tokens (alnum runs). */
function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
}

/** Jaccard-like overlap score between repo slug tokens and task text tokens. */
function similarity(repoSlug: string, taskText: string): number {
  const rt = tokens(repoSlug.replace(/[-_]/g, " "));
  const tt = tokens(taskText);
  if (rt.size === 0 || tt.size === 0) return 0;
  let overlap = 0;
  for (const t of rt) if (tt.has(t)) overlap++;
  return overlap / Math.sqrt(rt.size); // favor repos whose name-words appear in the task
}

/** Cross-reference workspace repo slugs against task text, return top N. */
function topReposBySimilarity(allRepos: string[], taskText: string, n: number): string[] {
  return allRepos
    .map((slug) => ({ slug, score: similarity(slug, taskText) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.slug);
}

// --- per-task dev-links fan-out -------------------------------------------

/** Build the task text used for the Bitbucket similarity fallback: title +
 *  description + Jira summaries (if we fetched the task detail). */
function taskText(task: Task, jiraSummaries: string[]): string {
  return [task.title, task.description ?? "", ...jiraSummaries].join(" ");
}

/** Fetch dev-links for a single task across all layers. */
export async function fetchTaskDevLinks(
  task: Task,
  settings: AuraDigestSettings,
  keyring: Keyring,
  atlassian: McpClient | null,
): Promise<TaskDevLinks> {
  const taskKey = task.human_key;
  const jiraKeys = (task.jira_issues ?? []).map((j) => j.issue_key);
  const errors: string[] = [];
  const prs: DevLinkPullRequest[] = [];
  const branches: DevLinkBranch[] = [];
  const seenPrUrls = new Set<string>();

  // --- Layer 0: Aura task repositories (authoritative) ----------------
  // Aura's `TaskRepositoryRef` already carries the provider-built branch URL
  // (`browse_url`) for BITBUCKET/GITHUB repos with a linked feature branch.
  // Prefer this over the Bitbucket/GitHub search fallbacks below.
  const seenBranchKeys = new Set<string>();
  for (const repo of [...(task.repositories ?? []), ...(task.inherited_repositories ?? [])]) {
    const url = repo.browse_url ?? null;
    const branchName = repo.branch ?? null;
    // Only surface branches with a browse URL (linked-without-branch repos have none).
    if (!url || !branchName) continue;
    const key = url;
    if (seenBranchKeys.has(key)) continue;
    seenBranchKeys.add(key);
    branches.push({
      provider: repo.source.toLowerCase(),
      repo: repo.slug,
      name: branchName,
      url,
      found_via: "aura-repository",
    });
  }

  // --- Layer 1: Teamwork Graph (primary) --------------------------------
  if (atlassian && jiraKeys.length > 0) {
    try {
      for (const jiraKey of jiraKeys) {
        const ctx = await atlassian.callTool<TwgContextResult>(
          "getTeamworkGraphContext",
          {
            cloudId: settings.jiraCloudId,
            objectType: "JiraWorkItem",
            objectIdentifier: jiraKey,
            targetObjectTypes: ["ExternalPullRequest"],
            detailLevel: "summary",
          }
        );
        const summary = ctx.data?.data?.relationshipSummary ?? [];
        const hasPrs = summary.some(
          (r) => r.targetObjectTypes.includes("ExternalPullRequest") && r.totalCount > 0
        );
        if (!hasPrs) continue;
        // Fetch full to get ARIs, then hydrate.
        const full = await atlassian.callTool<TwgContextResult>(
          "getTeamworkGraphContext",
          {
            cloudId: settings.jiraCloudId,
            objectType: "JiraWorkItem",
            objectIdentifier: jiraKey,
            targetObjectTypes: ["ExternalPullRequest"],
            detailLevel: "full",
          }
        );
        const targets =
          full.data?.data?.relationships?.find((r) =>
            r.targetObjectType === "ExternalPullRequest"
          )?.targets ?? [];
        if (targets.length === 0) continue;
        const objRes = await atlassian.callTool<TwgObjectResult>(
          "getTeamworkGraphObject",
          { cloudId: settings.jiraCloudId, objects: targets.map((t) => t.ari) }
        );
        for (const obj of objRes.data?.data?.objects ?? []) {
          const r = obj.raw;
          const url = r.url;
          if (url && seenPrUrls.has(url)) continue;
          if (url) seenPrUrls.add(url);
          prs.push({
            provider: r.provider?.name?.toLowerCase() ?? "unknown",
            id: r.displayId ?? "",
            title: r.title,
            state: r.pullRequestStatus,
            url,
            source_branch: r.source?.branch?.name,
            destination_branch: r.destination?.branch?.name,
            author: r.author?.name,
            found_via: "teamwork-graph",
          });
        }
      }
    } catch (e) {
      errors.push(`teamwork-graph: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // --- Layer 2: GitHub fallback (search by Aura key) --------------------
  try {
    const ghPrs = await ghSearchPRs(taskKey, settings.github.owners);
    for (const p of ghPrs) {
      if (p.url && seenPrUrls.has(p.url)) continue;
      if (p.url) seenPrUrls.add(p.url);
      prs.push({
        provider: "github",
        id: String(p.number),
        title: p.title,
        state: p.state.toUpperCase(),
        url: p.url,
        author: p.repository?.nameWithOwner,
        found_via: "github-search",
      });
    }
  } catch (e) {
    errors.push(`github: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Layer 3: Bitbucket fallback (preferredRepos + similarity top-5) --
  const ws = settings.bitbucket.workspace;
  const preferred = settings.bitbucket.preferredRepos;

  // Pre-check: load Bitbucket credentials once. If the keyring is empty or
  // the workspace is missing, skip the entire Bitbucket layer with a single
  // warning — mirroring buildAtlassianClient's degrade pattern — instead of
  // repeating the same error for every repo.
  let bbCreds: { email: string; token: string; defaultWorkspace: string } | null = null;
  try {
    const { email, token } = await readBitbucketCredentials(keyring);
    if (!ws) {
      throw new Error("Bitbucket workspace not set in settings (configure settings.aura.digest.bitbucket.workspace)");
    }
    bbCreds = { email, token, defaultWorkspace: ws };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    errors.push(`Bitbucket dev-links layer skipped: ${reason}`);
  }

  if (bbCreds) {
    // PR search + branch search both key off the Aura key.
    const prQ = `title~"${taskKey}" or source.branch.name~"${taskKey}"`;
    const brQ = `name~"${taskKey}"`;
    const tryRepo = async (repo: string): Promise<boolean> => {
      try {
        const [repoPrs, repoBranches] = await Promise.all([
          searchRepoPRs(ws, repo, prQ, keyring),
          searchRepoBranches(ws, repo, brQ, keyring),
        ]);
        for (const p of repoPrs) addBbPr(p, repo, prs, seenPrUrls);
        for (const b of repoBranches) addBbBranch(b, repo, branches);
        return repoPrs.length > 0 || repoBranches.length > 0;
      } catch (e) {
        errors.push(`bitbucket/${repo}: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    };

    // 3a. preferredRepos first.
    let found = false;
    for (const repo of preferred) {
      if (await tryRepo(repo)) found = true;
    }
    // 3b. If nothing found, similarity fallback over the whole workspace.
    if (!found) {
      try {
        const allRepos = await listWorkspaceRepos(ws, keyring);
        const jiraSummaries = (task.jira_issues ?? []).map((j) => j.summary ?? "");
        const candidates = topReposBySimilarity(allRepos, taskText(task, jiraSummaries), 5)
          .filter((r) => !preferred.includes(r));
        for (const repo of candidates) {
          await tryRepo(repo);
        }
      } catch (e) {
        errors.push(`bitbucket/similarity: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { task_key: taskKey, jira_keys: jiraKeys, pull_requests: prs, branches, errors };
}

function addBbPr(p: BbPullRequest, repo: string, prs: DevLinkPullRequest[], seen: Set<string>): void {
  const url = p.links?.html?.href ?? `https://bitbucket.org/${repo}/pull-requests/${p.id}`;
  if (seen.has(url)) return;
  seen.add(url);
  prs.push({
    provider: "bitbucket",
    id: String(p.id),
    title: p.title,
    state: p.state,
    url,
    source_branch: p.source?.branch?.name,
    destination_branch: p.destination?.branch?.name,
    found_via: "bitbucket-search",
  });
}

function addBbBranch(b: BbBranch, repo: string, branches: DevLinkBranch[]): void {
  branches.push({
    provider: "bitbucket",
    repo,
    name: b.name,
    last_commit: b.target?.hash,
    found_via: "bitbucket-search",
  });
}

/** Try to build the Atlassian client. Returns { client, warning } where
 *  `client` is null when unavailable (so the dev-links feature degrades by
 *  skipping Teamwork Graph) and `warning` carries the reason — the caller
 *  records it in digest.warnings so the degradation is visible, not silent. */
export async function buildAtlassianClient(serverName = "atlassian"): Promise<{ client: McpClient | null; warning: string | null }> {
  try {
    const c = await atlassianClient(serverName);
    await c.connect();
    return { client: c, warning: null };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { client: null, warning: `Teamwork Graph dev-links layer skipped: ${reason}` };
  }
}
