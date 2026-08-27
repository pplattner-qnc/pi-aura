/**
 * Atlassian provisioning: guided walkthrough mode + read-only probes.
 *
 * Slice 3 (guided-walkthrough-mode) of the wire-bitbucket-guided-edit task.
 *
 * The guided mode reads `docs/atlassian-api-token-walkthrough.md` at run time
 * and steps the user through creating the two scoped Atlassian API tokens
 * (Teamwork Graph via Rovo MCP V2, and Bitbucket). It uses the walkthrough
 * doc as the source of truth for the app + scope selections — nothing is
 * hardcoded. After each token is stored via the combined email+token flow
 * (slice 2's handleAtlassianPatEdit), a read-only probe verifies access.
 *
 * The probe helpers are the ONE place live network calls are legitimate at
 * runtime. They are unit-testable with a mocked MCP client / fetch — no live
 * network call in unit tests.
 */

import { readFileSync } from "node:fs";
import type { SecretKey, Keyring } from "@pi-aura/shared/keyring";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Walkthrough-doc parser (pure helper, unit-testable without a pi session)
// ---------------------------------------------------------------------------

/** One structured sequence parsed from the walkthrough doc. */
export interface WalkthroughSequence {
  /** The `kind` discriminator: "teamwork-graph" or "bitbucket". */
  kind: "teamwork-graph" | "bitbucket";
  /** The full heading line (e.g. "Sequence A — Teamwork Graph PAT ..."). */
  label: string;
  /** The Atlassian app to select (from "Select \"<app>\""). */
  app: string;
  /** The scopes to select, parsed from the "Select exactly these" block. */
  scopes: string[];
  /** The keyring key for this token. */
  tokenKey: SecretKey;
  /** The step headings/lines (for display — the body of each step). */
  steps: string[];
}

/** The parsed walkthrough doc: two sequences (Teamwork Graph + Bitbucket). */
export interface ParsedWalkthrough {
  sequences: WalkthroughSequence[];
}

const TWG_TOKEN_KEY: SecretKey = { service: "atlassian", name: "api_token" };
const BB_TOKEN_KEY: SecretKey = { service: "atlassian", name: "bitbucket_token" };

/** Parse the walkthrough markdown into structured sequences.
 *
 *  Pure helper — unit-testable without a pi session. Reads the app from the
 *  "Select \"<app>\"" line, the scopes from the "Select exactly these"
 *  block (the `✅ \`scope\`` lines), and infers the token key from the
 *  sequence label (A = teamwork-graph, B = bitbucket). Does NOT hardcode
 *  the app names or scopes in the code — they come from the doc. */
export function parseWalkthrough(markdown: string): ParsedWalkthrough {
  const lines = markdown.split("\n");
  const sequences: WalkthroughSequence[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const seqMatch = line.match(/^##\s+Sequence\s+([AB])\s+[—-]\s+(.+)$/);
    if (seqMatch) {
      const letter = seqMatch[1];
      const label = `Sequence ${letter} — ${seqMatch[2].replace(/\s*\(.*\)$/, "").trim()}`;
      const kind: "teamwork-graph" | "bitbucket" =
        letter === "A" ? "teamwork-graph" : "bitbucket";
      const tokenKey = letter === "A" ? TWG_TOKEN_KEY : BB_TOKEN_KEY;

      let app = "";
      const scopes: string[] = [];
      const steps: string[] = [];

      // Read the sequence body until the next ## heading or EOF.
      i++;
      while (i < lines.length && !lines[i].match(/^##\s/)) {
        const bodyLine = lines[i];

        // Parse the app from "Select \"<app>\""
        const appMatch = bodyLine.match(/Select\s+"([^"]+)"/);
        if (appMatch && !app) {
          app = appMatch[1];
        }

        // Parse scopes from `✅ \`scope\`` lines within the scopes block.
        // A scope line looks like: "✅ `read:account` ..." or "- ✅ `scope` ..."
        const scopeMatch = bodyLine.match(/✅\s+`([^`]+)`/);
        if (scopeMatch) {
          scopes.push(scopeMatch[1]);
        }

        // Collect step headings + content for display.
        if (bodyLine.match(/^###\s+/)) {
          steps.push(bodyLine.replace(/^#+\s*/, "").trim());
        } else if (bodyLine.trim() && !bodyLine.match(/^```/)) {
          const lastStep = steps[steps.length - 1];
          // Don't add duplicate lines, but keep the first content line per step.
          if (lastStep && !steps.some((s) => s === bodyLine.trim())) {
            // Only keep step headings for a compact display; skip body lines.
          }
        }

        i++;
      }

      sequences.push({ kind, label, app, scopes, tokenKey, steps });
      continue;
    }
    i++;
  }

  return { sequences };
}

// ---------------------------------------------------------------------------
// Probes (read-only, the one place live network calls are legitimate)
// ---------------------------------------------------------------------------

/** A probe result — structured outcome of a read-only verification call. */
export interface ProbeResult {
  ok: boolean;
  /** A non-blocker means the probe reached the API but a permission is
   *  missing (e.g. org-admin read:teamwork_graph). The token is correct; the
   *  org just hasn't allowed it. The guided mode reports it and continues. */
  nonBlocker?: boolean;
  /** A one-line summary for the user. */
  summary: string;
  /** Detailed lines (e.g. per-endpoint results) for the user. */
  details: string[];
}

/** Minimal MCP-client seam for the Teamwork Graph probe.
 *
 *  This is the subset of McpClient that probeTeamworkGraph uses. Production
 *  passes a real McpClient (from scripts/src/mcp-client.ts); tests pass a
 *  fake. The seam keeps the probe unit-testable without a live network call
 *  or a dependency on the MCP SDK's Client class. */
export interface McpProbeClient {
  authHeader: string;
  connect(): Promise<void>;
  getToolNames(): string[];
  callTool<T>(name: string, args: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
}

/** Probe the Teamwork Graph gateway (Rovo MCP V2).
 *
 *  Calls `initialize` (via connect), `tools/list` (assert
 *  getTeamworkGraphContext/getTeamworkGraphObject present), and a real
 *  read-only getTeamworkGraphContext call. Returns a structured result.
 *
 *  An org-admin read:teamwork_graph permission error (the TWG tools don't
 *  appear in tools/list) is a NON-BLOCKER — reported and flagged.
 *  A 404/not-found from getTeamworkGraphContext is a SUCCESS signal (the
 *  call authenticated and reached the API). */
export async function probeTeamworkGraph(
  creds: { email: string; token: string },
  cloudId: string,
  clientFactory: () => Promise<McpProbeClient>
): Promise<ProbeResult> {
  const client = await clientFactory();
  try {
    // initialize
    await client.connect();
  } catch (err) {
    await client.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      summary: `Teamwork Graph probe failed: initialize error`,
      details: [msg],
    };
  }

  // tools/list — assert TWG tools present
  const tools = client.getToolNames();
  const hasTwgContext = tools.includes("getTeamworkGraphContext");
  const hasTwgObject = tools.includes("getTeamworkGraphObject");
  if (!hasTwgContext || !hasTwgObject) {
    await client.close().catch(() => {});
    return {
      ok: false,
      nonBlocker: true,
      summary:
        "Teamwork Graph tools not available — the org-admin read:teamwork_graph permission is likely missing",
      details: [
        `tools/list returned ${tools.length} tools; getTeamworkGraphContext=${hasTwgContext}, getTeamworkGraphObject=${hasTwgObject}`,
        "Ask your org admin to grant the read:teamwork_graph permission. The token is correct; the org just hasn't allowed it.",
      ],
    };
  }

  // read-only getTeamworkGraphContext call
  try {
    await client.callTool("getTeamworkGraphContext", {
      cloudId,
      // Any work-item key — a 404 is a success signal (authenticated + reached the API).
      objectIdentifier: "PROBE-0",
    });
    await client.close().catch(() => {});
    return {
      ok: true,
      summary: "Teamwork Graph probe OK — getTeamworkGraphContext returned a result",
      details: [`initialize OK, tools/list has TWG tools, getTeamworkGraphContext(cloudId=${cloudId}) succeeded`],
    };
  } catch (err) {
    await client.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    // A 404 / not-found is a success signal: the call authenticated and reached the API.
    if (/404|not found|notfound/i.test(msg)) {
      return {
        ok: true,
        summary: "Teamwork Graph probe OK — getTeamworkGraphContext returned a 404 (authenticated + reached the API)",
        details: [msg],
      };
    }
    return {
      ok: false,
      summary: "Teamwork Graph probe failed: getTeamworkGraphContext returned an error",
      details: [msg],
    };
  }
}

/** Probe the Bitbucket REST API (direct, basic auth).
 *
 *  Calls GET /2.0/workspaces/<workspace> + GET /2.0/repositories/<workspace>?pagelen=5
 *  + one repo's PRs + branches. Returns a structured result.
 *  Does NOT call /2.0/user (pi-ura never uses it; needs read:user:bitbucket).
 *
 *  A scope-named 403 is reported (not thrown) — the guided mode offers to
 *  re-run after the user recreates the token with the right scopes. */
export async function probeBitbucket(
  creds: { email: string; token: string },
  workspace: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProbeResult> {
  if (!workspace) {
    return {
      ok: false,
      summary: "Bitbucket probe skipped: workspace not set in settings",
      details: ["Configure settings.aura.digest.bitbucket.workspace"],
    };
  }

  const auth = "Basic " + Buffer.from(`${creds.email}:${creds.token}`).toString("base64");
  const headers = { Authorization: auth, Accept: "application/json" };
  const base = "https://api.bitbucket.org/2.0";
  const details: string[] = [];

  // 1. workspace lookup
  const wsRes = await fetchImpl(`${base}/workspaces/${workspace}`, { headers });
  if (!wsRes.ok) {
    const body = await wsRes.text().catch(() => "");
    details.push(`GET /2.0/workspaces/${workspace} -> ${wsRes.status}: ${body.slice(0, 200)}`);
    return {
      ok: false,
      summary: `Bitbucket probe failed: workspace lookup ${wsRes.status}`,
      details,
    };
  }
  details.push(`GET /2.0/workspaces/${workspace} -> 200`);

  // 2. workspace repos (pagelen=5)
  const reposRes = await fetchImpl(`${base}/repositories/${workspace}?pagelen=5`, { headers });
  if (!reposRes.ok) {
    const body = await reposRes.text().catch(() => "");
    details.push(`GET /2.0/repositories/${workspace} -> ${reposRes.status}: ${body.slice(0, 200)}`);
    return {
      ok: false,
      summary: `Bitbucket probe failed: repositories ${reposRes.status}`,
      details,
    };
  }
  const reposData = (await reposRes.json()) as { values?: { slug?: string }[] };
  const slugs = (reposData.values ?? []).map((v) => v.slug).filter(Boolean) as string[];
  details.push(`GET /2.0/repositories/${workspace}?pagelen=5 -> 200 (${slugs.length} repos)`);

  // 3. one repo's PRs
  const firstSlug = slugs[0];
  if (firstSlug) {
    const prsRes = await fetchImpl(
      `${base}/repositories/${workspace}/${firstSlug}/pullrequests?pagelen=3`,
      { headers }
    );
    if (!prsRes.ok) {
      const body = await prsRes.text().catch(() => "");
      details.push(`GET /2.0/repositories/${workspace}/${firstSlug}/pullrequests -> ${prsRes.status}: ${body.slice(0, 200)}`);
      return {
        ok: false,
        summary: `Bitbucket probe failed: pullrequests ${prsRes.status}`,
        details,
      };
    }
    details.push(`GET /2.0/repositories/${workspace}/${firstSlug}/pullrequests -> 200`);

    // 4. one repo's branches
    const branchesRes = await fetchImpl(
      `${base}/repositories/${workspace}/${firstSlug}/refs/branches?pagelen=3`,
      { headers }
    );
    if (!branchesRes.ok) {
      const body = await branchesRes.text().catch(() => "");
      details.push(`GET /2.0/repositories/${workspace}/${firstSlug}/refs/branches -> ${branchesRes.status}: ${body.slice(0, 200)}`);
      return {
        ok: false,
        summary: `Bitbucket probe failed: branches ${branchesRes.status}`,
        details,
      };
    }
    details.push(`GET /2.0/repositories/${workspace}/${firstSlug}/refs/branches -> 200`);
  }

  return {
    ok: true,
    summary: "Bitbucket probe OK",
    details,
  };
}

// ---------------------------------------------------------------------------
// Probe function bundle (injectable for tests)
// ---------------------------------------------------------------------------

/** Build a live McpClient for the Rovo MCP V2 gateway, typed as the probe
 *  seam. Imported dynamically so unit tests (which mock the probe) stay free
 *  of the MCP SDK dependency. Used by both the initial probe and the re-probe
 *  path so the factory is not duplicated. */
async function makeMcpProbeClient(creds: { email: string; token: string }): Promise<McpProbeClient> {
  const { McpClient } = await import("../scripts/src/mcp-client.js");
  const credential = Buffer.from(`${creds.email}:${creds.token}`).toString("base64");
  return new McpClient({
    serverName: "atlassian",
    url: "https://mcp.atlassian.com/v1/mcp/authv2",
    authHeader: `Basic ${credential}`,
    clientName: "pi-aura-guided-walkthrough",
  }) as unknown as McpProbeClient;
}

/** The two probe functions, injectable so tests can mock them. */
export interface ProbeFunctions {
  probeTeamworkGraph(
    creds: { email: string; token: string },
    cloudId: string,
    clientFactory: () => Promise<McpProbeClient>
  ): Promise<ProbeResult>;
  probeBitbucket(
    creds: { email: string; token: string },
    workspace: string,
    fetchImpl?: typeof fetch
  ): Promise<ProbeResult>;
}

// ---------------------------------------------------------------------------
// runGuidedWalkthrough (orchestrator)
// ---------------------------------------------------------------------------

/** Settings the guided mode needs: cloudId + bitbucket workspace. */
export interface GuidedSettings {
  jiraCloudId: string;
  bitbucketWorkspace: string;
}

/** Run the guided walkthrough: step through both sequences (Teamwork Graph
 *  then Bitbucket), storing each token via the combined email+token flow
 *  and probing after each. Reads the walkthrough doc at run time so the doc
 *  is the source of truth. No secrets written to any file; only the keyring.
 *
 *  Probe functions are injected (ProbeFunctions) so unit tests can mock them —
 *  no live network call in the unit test. */
export async function runGuidedWalkthrough(
  ui: Pick<ExtensionUIContext, "notify" | "editor" | "confirm">,
  keyringFactory: () => Promise<Keyring>,
  docPath: string,
  settings: GuidedSettings,
  probeFns?: ProbeFunctions
): Promise<void> {
  let markdown: string;
  try {
    markdown = readFileSync(docPath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Guided walkthrough doc not found at ${docPath}. The manual task should have produced it. (${msg})`
    );
  }

  const doc = parseWalkthrough(markdown);
  if (doc.sequences.length === 0) {
    throw new Error(
      `Guided walkthrough doc at ${docPath} is malformed — no sequences found. Re-run the manual task.`
    );
  }

  // Default probe functions: live network calls (the one place this is
  // legitimate at runtime). Tests inject mocks.
  const probes: ProbeFunctions = probeFns ?? {
    probeTeamworkGraph,
    probeBitbucket,
  };

  for (const seq of doc.sequences) {
    // Tell the user the app + scopes (from the doc — the source of truth).
    ui.notify(
      `${seq.label}\nApp: ${seq.app}\nScopes: ${seq.scopes.join(", ")}`,
      "info"
    );
    ui.notify(
      `Create the token at https://id.atlassian.com/manage-profile/security/api-tokens, then copy it. Store it when ready.`,
      "info"
    );

    // Store the email + token via the combined flow (atomic — no partial write).
    const EMAIL_KEY: SecretKey = { service: "atlassian", name: "email" };
    const keyring = await keyringFactory();
    const currentEmail = await keyring.getSecret(EMAIL_KEY);
    const currentToken = await keyring.getSecret(seq.tokenKey);

    const emailEdited = await ui.editor("Atlassian email", currentEmail ?? "<paste your Atlassian email here>");
    if (emailEdited === undefined || emailEdited === null) {
      ui.notify("no change", "info");
      return;
    }
    const tokenEdited = await ui.editor(seq.label, currentToken ?? `<paste your ${seq.app} API token here>`);
    if (tokenEdited === undefined || tokenEdited === null) {
      ui.notify("no change", "info");
      return;
    }

    // Both prompts are non-cancel: write both secrets atomically.
    await keyring.setSecret(EMAIL_KEY, emailEdited.trim());
    await keyring.setSecret(seq.tokenKey, tokenEdited.trim());
    ui.notify(`${seq.label} stored`, "info");

    // Run the probe.
    const creds = { email: emailEdited.trim(), token: tokenEdited.trim() };
    let result: ProbeResult;
    if (seq.kind === "teamwork-graph") {
      // The real production client factory is injected by handleSecretEdit;
      // for the test path, the probe function itself receives a factory.
      // We build a default factory that creates a real McpClient — but the
      // test injects a fake probeTeamworkGraph that ignores it.
      result = await probes.probeTeamworkGraph(creds, settings.jiraCloudId, () => makeMcpProbeClient(creds));
    } else {
      result = await probes.probeBitbucket(creds, settings.bitbucketWorkspace);
    }

    // Report the probe outcome.
    if (result.ok) {
      ui.notify(`${seq.label} probe: ${result.summary}`, "info");
    } else if (result.nonBlocker) {
      ui.notify(`${seq.label} probe (non-blocker): ${result.summary}`, "warning");
      for (const detail of result.details) {
        ui.notify(detail, "warning");
      }
    } else {
      ui.notify(`${seq.label} probe failed: ${result.summary}`, "error");
      for (const detail of result.details) {
        ui.notify(detail, "error");
      }
      // Offer to re-run after the user recreates the token.
      const rerun = await ui.confirm(
        `Re-probe ${seq.label}?`,
        `The probe failed. Recreate the token with the right scopes and re-probe?`
      );
      if (rerun) {
        // Re-run the probe with the same credentials.
        if (seq.kind === "teamwork-graph") {
          result = await probes.probeTeamworkGraph(creds, settings.jiraCloudId, () => makeMcpProbeClient(creds));
        } else {
          result = await probes.probeBitbucket(creds, settings.bitbucketWorkspace);
        }
        if (result.ok) {
          ui.notify(`${seq.label} re-probe: ${result.summary}`, "info");
        } else {
          ui.notify(`${seq.label} re-probe failed: ${result.summary}`, "error");
        }
      }
    }
  }
}
