/**
 * Tests for the guided walkthrough mode + Atlassian provisioning probes.
 *
 * Run with:
 *   node --experimental-strip-types extensions/atlassian-provision.test.ts
 */

import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseWalkthrough,
  probeTeamworkGraph,
  probeBitbucket,
  runGuidedWalkthrough,
  type ProbeResult,
  type McpProbeClient,
  type ProbeFunctions,
} from "./atlassian-provision.ts";
import { handleSecretEdit } from "./aura-secrets.ts";

// ---------------------------------------------------------------------------
// Fixture: a trimmed copy of the real walkthrough doc.
// ---------------------------------------------------------------------------

const FIXTURE_DOC = `# Atlassian API token — guided walkthrough

## Prerequisites

- An Atlassian account with access to the org.

## Sequence A — Teamwork Graph PAT (Rovo MCP V2 app, keyring \`atlassian/api_token\`)

### Step 1 — Open the token page
Go to https://id.atlassian.com/manage-profile/security/api-tokens

### Step 2 — Name and expiry
- **Label**: \`pi-aura-teamwork-graph\`

### Step 3 — Select app
- **Select "Rovo MCP V2"** (description: "API token to access Rovo MCP V2").

### Step 4 — Select scopes
**Select exactly these (read-only):**
- ✅ \`read:account\`
- ✅ \`read:jira:agent-interface\` (the Teamwork Graph tools traverse Jira work items)
- ✅ \`search:rovo:agent-interface\` (the gateway's read/search surface)

### Step 5 — Create token + copy
Click **Create token**. **Copy the token immediately**.

### Step 6 — Store in the keyring
Store the email + token in the keyring.

### Step 7 — Probe (direct, read-only)
Verify access against the Rovo MCP V2 gateway.

## Sequence B — Bitbucket PAT (Bitbucket app, keyring \`atlassian/bitbucket_token\`)

### Step 1 — Open the token page
Return to the token page.

### Step 2 — Name and expiry
- **Label**: \`pi-aura-bitbucket\`.

### Step 3 — Select app
- **Select "Bitbucket"** (description: "API token can only access Bitbucket APIs").

### Step 4 — Select scopes
**Select exactly these (read-only):**
- ✅ \`read:account\` (classic — view user profiles)
- ✅ \`read:repository:bitbucket\` (View your repositories)
- ✅ \`read:pullrequest:bitbucket\` (View your pull requests)
- ✅ \`read:workspace:bitbucket\` (View your workspaces)

### Step 5 — Create token + copy
Click **Create token**. **Copy the token immediately**.

### Step 6 — Store in the keyring
Store the token in the keyring.

### Step 7 — Probe (direct, read-only)
Verify access against api.bitbucket.org.
`;

// ---------------------------------------------------------------------------
// parseWalkthrough (pure helper)
// ---------------------------------------------------------------------------

const doc = parseWalkthrough(FIXTURE_DOC);
assert.strictEqual(doc.sequences.length, 2, "two sequences parsed");

const seqA = doc.sequences[0];
assert.strictEqual(seqA.label, "Sequence A — Teamwork Graph PAT", "Sequence A label");
assert.strictEqual(seqA.app, "Rovo MCP V2", "Sequence A app");
assert.deepStrictEqual(
  seqA.scopes,
  ["read:account", "read:jira:agent-interface", "search:rovo:agent-interface"],
  "Sequence A scopes"
);
assert.deepStrictEqual(
  seqA.tokenKey,
  { service: "atlassian", name: "api_token" },
  "Sequence A token key"
);
assert.strictEqual(seqA.kind, "teamwork-graph", "Sequence A kind");
assert.ok(seqA.steps.length >= 7, "Sequence A has steps");

const seqB = doc.sequences[1];
assert.strictEqual(seqB.label, "Sequence B — Bitbucket PAT", "Sequence B label");
assert.strictEqual(seqB.app, "Bitbucket", "Sequence B app");
assert.deepStrictEqual(
  seqB.scopes,
  ["read:account", "read:repository:bitbucket", "read:pullrequest:bitbucket", "read:workspace:bitbucket"],
  "Sequence B scopes"
);
assert.deepStrictEqual(
  seqB.tokenKey,
  { service: "atlassian", name: "bitbucket_token" },
  "Sequence B token key"
);
assert.strictEqual(seqB.kind, "bitbucket", "Sequence B kind");

console.log("parseWalkthrough tests passed");

// parseWalkthrough against the REAL walkthrough doc (integration check —
// proves the doc is the source of truth and parseWalkthrough reads it
// correctly end-to-end). The manual task produced this doc.
{
  const realDoc = readFileSync(
    join(process.cwd(), "docs", "atlassian-api-token-walkthrough.md"),
    "utf8"
  );
  const realParsed = parseWalkthrough(realDoc);
  assert.strictEqual(realParsed.sequences.length, 2, "real doc has two sequences");
  const realA = realParsed.sequences[0];
  assert.strictEqual(realA.kind, "teamwork-graph", "real Sequence A is teamwork-graph");
  assert.strictEqual(realA.app, "Rovo MCP V2", "real Sequence A app is Rovo MCP V2");
  assert.deepStrictEqual(
    realA.tokenKey,
    { service: "atlassian", name: "api_token" },
    "real Sequence A token key"
  );
  assert.ok(realA.scopes.length >= 3, "real Sequence A has scopes");
  const realB = realParsed.sequences[1];
  assert.strictEqual(realB.kind, "bitbucket", "real Sequence B is bitbucket");
  assert.strictEqual(realB.app, "Bitbucket", "real Sequence B app is Bitbucket");
  assert.deepStrictEqual(
    realB.tokenKey,
    { service: "atlassian", name: "bitbucket_token" },
    "real Sequence B token key"
  );
  assert.ok(realB.scopes.length >= 4, "real Sequence B has scopes");
}

console.log("parseWalkthrough real-doc integration test passed");

// ---------------------------------------------------------------------------
// probeTeamworkGraph (mocked McpClient)
// ---------------------------------------------------------------------------

function makeFakeMcpClient(opts: {
  tools?: string[];
  callToolResult?: unknown;
  callToolThrows?: Error;
  connectThrows?: Error;
}): McpProbeClient & { connectCalls: number; callToolCalls: { name: string; args: unknown }[]; closed: boolean } {
  let connectCalls = 0;
  let closed = false;
  const callToolCalls: { name: string; args: unknown }[] = [];
  return {
    authHeader: "Basic dXNlckBleGFtcGxlLmNvbTp0d2ctdG9r",
    async connect() {
      connectCalls++;
      if (opts.connectThrows) throw opts.connectThrows;
    },
    getToolNames() {
      return opts.tools ?? [];
    },
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      callToolCalls.push({ name, args });
      if (opts.callToolThrows) throw opts.callToolThrows;
      return (opts.callToolResult ?? {}) as T;
    },
    async close() {
      closed = true;
    },
    get connectCalls() {
      return connectCalls;
    },
    get callToolCalls() {
      return callToolCalls;
    },
    get closed() {
      return closed;
    },
  };
}

// TWG probe: all tools present + callTool succeeds -> ok
{
  const fake = makeFakeMcpClient({
    tools: ["getTeamworkGraphContext", "getTeamworkGraphObject", "addTeamworkGraphContext"],
    callToolResult: { result: "ok" },
  });
  const result = await probeTeamworkGraph(
    { email: "user@example.com", token: "twg-tok" },
    "cloud-id-123",
    async () => fake
  );
  assert.strictEqual(result.ok, true, "probe ok when tools present + call succeeds");
  assert.strictEqual(fake.connectCalls, 1, "connect (initialize) called once");
  assert.ok(
    fake.callToolCalls.some((c) => c.name === "getTeamworkGraphContext"),
    "getTeamworkGraphContext called"
  );
  assert.ok(
    fake.callToolCalls[0].args &&
    typeof fake.callToolCalls[0].args === "object" &&
    "cloudId" in (fake.callToolCalls[0].args as Record<string, unknown>),
    "getTeamworkGraphContext called with cloudId"
  );
  assert.ok(fake.closed, "client closed after probe");
}

// TWG probe: tools NOT in tools/list -> non-blocker (org-admin permission missing)
{
  const fake = makeFakeMcpClient({
    tools: ["someOtherTool"],
    callToolResult: {},
  });
  const result = await probeTeamworkGraph(
    { email: "user@example.com", token: "twg-tok" },
    "cloud-id-123",
    async () => fake
  );
  assert.strictEqual(result.ok, false, "probe not ok when TWG tools missing");
  assert.strictEqual(result.nonBlocker, true, "missing TWG tools is a non-blocker");
  assert.ok(fake.closed, "client closed even on non-blocker");
}

// TWG probe: callTool throws "not found" -> ok (reached the API)
{
  const fake = makeFakeMcpClient({
    tools: ["getTeamworkGraphContext", "getTeamworkGraphObject"],
    callToolThrows: new Error("MCP tool returned an error: 404 issue not found"),
  });
  const result = await probeTeamworkGraph(
    { email: "user@example.com", token: "twg-tok" },
    "cloud-id-123",
    async () => fake
  );
  assert.strictEqual(result.ok, true, "a 404/not-found is a success signal (reached the API)");
}

// TWG probe: callTool throws an auth error -> not ok
{
  const fake = makeFakeMcpClient({
    tools: ["getTeamworkGraphContext", "getTeamworkGraphObject"],
    callToolThrows: new Error("MCP tool returned an error: 401 invalid_token"),
  });
  const result = await probeTeamworkGraph(
    { email: "user@example.com", token: "twg-tok" },
    "cloud-id-123",
    async () => fake
  );
  assert.strictEqual(result.ok, false, "an auth error is a failure");
  assert.strictEqual(result.nonBlocker, undefined, "auth error is not a non-blocker");
}

// TWG probe: connect throws -> not ok
{
  const fake = makeFakeMcpClient({
    connectThrows: new Error("initialize failed: 401"),
  });
  const result = await probeTeamworkGraph(
    { email: "user@example.com", token: "twg-tok" },
    "cloud-id-123",
    async () => fake
  );
  assert.strictEqual(result.ok, false, "connect failure -> not ok");
}

console.log("probeTeamworkGraph tests passed");

// ---------------------------------------------------------------------------
// probeBitbucket (mocked fetch)
// ---------------------------------------------------------------------------

interface FakeFetchCall {
  url: string;
  authHeader: string;
}

function makeFakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: FakeFetchCall[] = [];
  let callIndex = 0;
  const fakeFetch = async (url: URL | string, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === "string" ? url : url.toString();
    const authHeader = (init?.headers as Record<string, string>)?.Authorization ?? "";
    calls.push({ url: urlStr, authHeader });
    const response = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    } as Response;
  };
  return { fetch: fakeFetch, calls };
}

// Bitbucket probe: all endpoints 200 -> ok
{
  const ff = makeFakeFetch([
    { status: 200, body: { slug: "ws", name: "Workspace" } },
    { status: 200, body: { values: [{ slug: "repo-1" }, { slug: "repo-2" }] } },
    { status: 200, body: { values: [{ id: 1, title: "PR 1" }] } },
    { status: 200, body: { values: [{ name: "main" }] } },
  ]);
  const result = await probeBitbucket(
    { email: "user@example.com", token: "bb-tok" },
    "ws",
    ff.fetch as unknown as typeof fetch
  );
  assert.strictEqual(result.ok, true, "probe ok when all endpoints 200");
  // Assert the right endpoints are called
  assert.ok(ff.calls.some((c) => c.url.includes("/2.0/workspaces/ws")), "workspace endpoint called");
  assert.ok(
    ff.calls.some((c) => c.url.includes("/2.0/repositories/ws") && c.url.includes("pagelen=5")),
    "repositories endpoint called with pagelen=5"
  );
  assert.ok(
    ff.calls.some((c) => c.url.includes("/pullrequests")),
    "pullrequests endpoint called"
  );
  assert.ok(
    ff.calls.some((c) => c.url.includes("/refs/branches")),
    "branches endpoint called"
  );
  // Assert the Basic auth header
  const expectedAuth = "Basic " + Buffer.from("user@example.com:bb-tok").toString("base64");
  assert.ok(
    ff.calls.every((c) => c.authHeader === expectedAuth),
    "all calls use the right Basic auth header"
  );
  // Assert /2.0/user is NEVER called
  assert.ok(
    !ff.calls.some((c) => c.url.includes("/2.0/user")),
    "/2.0/user is never called"
  );
}

// Bitbucket probe: 403 on workspace -> not ok (scope-named error)
{
  const ff = makeFakeFetch([
    { status: 403, body: { error: { message: "read:workspace:bitbucket scope required" } } },
  ]);
  const result = await probeBitbucket(
    { email: "user@example.com", token: "bb-tok" },
    "ws",
    ff.fetch as unknown as typeof fetch
  );
  assert.strictEqual(result.ok, false, "403 -> not ok");
  assert.strictEqual(result.nonBlocker, undefined, "403 is not a non-blocker");
  assert.ok(
    result.summary.includes("403") || result.details.some((d) => d.includes("403")),
    "403 is reported in the summary or details"
  );
}

// Bitbucket probe: workspace missing -> error reported, not thrown
{
  const result = await probeBitbucket(
    { email: "user@example.com", token: "bb-tok" },
    "",
    makeFakeFetch([{ status: 200, body: {} }]).fetch as unknown as typeof fetch
  );
  assert.strictEqual(result.ok, false, "empty workspace -> not ok");
  assert.ok(
    result.summary.includes("workspace") || result.details.some((d) => d.includes("workspace")),
    "missing workspace is reported"
  );
}

console.log("probeBitbucket tests passed");

// ---------------------------------------------------------------------------
// runGuidedWalkthrough (fixture doc + mocked probes)
// ---------------------------------------------------------------------------

interface NotifyCall {
  message: string;
  level: "info" | "warning" | "error";
}

function makeMockGuidedUi(opts: {
  editorResults?: (string | undefined)[];
  confirmResults?: boolean[];
  confirmResult?: boolean;
} = {}) {
  const notifies: NotifyCall[] = [];
  const editorCalls: { title: string; prefill: string }[] = [];
  const confirmCalls: { title: string; message: string }[] = [];
  let editorIndex = 0;
  let confirmIndex = 0;
  return {
    ui: {
      notify(message: string, level: "info" | "warning" | "error" = "info") {
        notifies.push({ message, level });
      },
      async editor(title: string, prefill: string): Promise<string | undefined> {
        editorCalls.push({ title, prefill });
        const result = opts.editorResults?.[editorIndex];
        editorIndex++;
        return result;
      },
      async confirm(title: string, message: string): Promise<boolean> {
        confirmCalls.push({ title, message });
        if (opts.confirmResults) {
          const result = opts.confirmResults[confirmIndex];
          confirmIndex++;
          return result ?? false;
        }
        return opts.confirmResult ?? false;
      },
    },
    getNotifies() {
      return notifies;
    },
    getEditorCalls() {
      return editorCalls;
    },
    getConfirmCalls() {
      return confirmCalls;
    },
  };
}

function makeMockKeyring() {
  const stored = new Map<string, string>();
  return {
    keyring: {
      async getSecret(key: { service: string; name: string }) {
        return stored.get(`${key.service}/${key.name}`) ?? null;
      },
      async setSecret(key: { service: string; name: string }, secret: string) {
        stored.set(`${key.service}/${key.name}`, secret);
      },
      async deleteSecret() {
        return false;
      },
      async listSecrets() {
        return [...stored.entries()].map(([k, s]) => ({
          key: { service: k.split("/")[0], name: k.split("/")[1] },
          secret: s,
        }));
      },
    },
    getStored() {
      return stored;
    },
  };
}

// runGuidedWalkthrough: steps through both sequences with mocked probes
{
  const tmpDir = mkdtempSync(join(tmpdir(), "guided-walkthrough-"));
  const docPath = join(tmpDir, "walkthrough.md");
  writeFileSync(docPath, FIXTURE_DOC);

  try {
    const mock = makeMockGuidedUi({
      editorResults: [
        // Sequence A: email + token
        "user@example.com",
        "twg-tok-123",
        // Sequence B: email (already set, re-entered) + token
        "user@example.com",
        "bb-tok-456",
      ],
    });
    const kr = makeMockKeyring();

    const probeCalls: { type: string; creds: { email: string; token: string }; param: string }[] = [];

    const probeFns: ProbeFunctions = {
      async probeTeamworkGraph(creds, cloudId) {
        probeCalls.push({ type: "twg", creds: { ...creds }, param: cloudId });
        return { ok: true, summary: "TWG probe ok", details: [] };
      },
      async probeBitbucket(creds, workspace) {
        probeCalls.push({ type: "bb", creds: { ...creds }, param: workspace });
        return { ok: true, summary: "BB probe ok", details: [] };
      },
    };

    await runGuidedWalkthrough(
      mock.ui,
      async () => kr.keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
      docPath,
      { jiraCloudId: "cloud-id-123", bitbucketWorkspace: "ws" },
      probeFns
    );

    // Two probes called in order: TWG then BB
    assert.strictEqual(probeCalls.length, 2, "two probes called");
    assert.strictEqual(probeCalls[0].type, "twg", "first probe is Teamwork Graph");
    assert.strictEqual(probeCalls[0].creds.token, "twg-tok-123", "TWG probe gets the right token");
    assert.strictEqual(probeCalls[0].creds.email, "user@example.com", "TWG probe gets the email");
    assert.strictEqual(probeCalls[0].param, "cloud-id-123", "TWG probe gets the cloudId");
    assert.strictEqual(probeCalls[1].type, "bb", "second probe is Bitbucket");
    assert.strictEqual(probeCalls[1].creds.token, "bb-tok-456", "BB probe gets the right token");
    assert.strictEqual(probeCalls[1].param, "ws", "BB probe gets the workspace");

    // Both tokens stored in the keyring
    assert.strictEqual(
      kr.getStored().get("atlassian/api_token"),
      "twg-tok-123",
      "Teamwork Graph token stored"
    );
    assert.strictEqual(
      kr.getStored().get("atlassian/bitbucket_token"),
      "bb-tok-456",
      "Bitbucket token stored"
    );
    assert.strictEqual(
      kr.getStored().get("atlassian/email"),
      "user@example.com",
      "email stored"
    );

    // The app + scopes from the doc are shown to the user
    const notifies = mock.getNotifies();
    assert.ok(
      notifies.some((n) => n.message.includes("Rovo MCP V2")),
      "Sequence A app (Rovo MCP V2) is shown"
    );
    assert.ok(
      notifies.some((n) => n.message.includes("search:rovo:agent-interface")),
      "Sequence A scopes are shown"
    );
    assert.ok(
      notifies.some((n) => n.message.includes("Bitbucket")),
      "Sequence B app (Bitbucket) is shown"
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log("runGuidedWalkthrough tests passed");

// runGuidedWalkthrough: missing doc -> clear error
{
  const mock = makeMockGuidedUi({});
  const kr = makeMockKeyring();
  await assert.rejects(
    runGuidedWalkthrough(
      mock.ui,
      async () => kr.keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
      "/nonexistent/walkthrough.md",
      { jiraCloudId: "cloud-id", bitbucketWorkspace: "ws" }
    ),
    (err: Error) => err.message.includes("walkthrough"),
    "missing doc -> error mentioning the doc"
  );
}

// runGuidedWalkthrough: cancel mid-guided (cancel at Sequence A token) -> no partial write
{
  const tmpDir = mkdtempSync(join(tmpdir(), "guided-walkthrough-cancel-"));
  const docPath = join(tmpDir, "walkthrough.md");
  writeFileSync(docPath, FIXTURE_DOC);

  try {
    const mock = makeMockGuidedUi({
      editorResults: [
        // Sequence A: email entered, token cancelled
        "user@example.com",
        undefined,
      ],
    });
    const kr = makeMockKeyring();

    const probeFns: ProbeFunctions = {
      async probeTeamworkGraph() {
        return { ok: true, summary: "ok", details: [] };
      },
      async probeBitbucket() {
        return { ok: true, summary: "ok", details: [] };
      },
    };

    await runGuidedWalkthrough(
      mock.ui,
      async () => kr.keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
      docPath,
      { jiraCloudId: "cloud-id", bitbucketWorkspace: "ws" },
      probeFns
    );

    // No partial write: email is NOT stored when the token prompt is cancelled
    assert.strictEqual(
      kr.getStored().get("atlassian/email"),
      undefined,
      "no partial write: email not stored when token cancelled"
    );
    assert.strictEqual(
      kr.getStored().get("atlassian/api_token"),
      undefined,
      "no partial write: token not stored when cancelled"
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log("runGuidedWalkthrough atomicity tests passed");

// ---------------------------------------------------------------------------
// handleSecretEdit yes/no routing (guided vs chooser)
// ---------------------------------------------------------------------------

function makeMockEditChooserUi(opts: {
  selectResult?: string;
  editorResult?: string;
  editorResults?: (string | undefined)[];
  confirmResults?: boolean[];
  confirmResult?: boolean;
} = {}) {
  const notifies: NotifyCall[] = [];
  const editorCalls: { title: string; prefill: string }[] = [];
  const selectCalls: { title: string; options: string[] }[] = [];
  const confirmCalls: { title: string; message: string }[] = [];
  let editorCallIndex = 0;
  let confirmCallIndex = 0;
  return {
    ui: {
      notify(message: string, level: "info" | "warning" | "error" = "info") {
        notifies.push({ message, level });
      },
      async select(title: string, selectOptions: string[]) {
        selectCalls.push({ title, options: selectOptions });
        return opts.selectResult;
      },
      async editor(title: string, prefill: string): Promise<string | undefined> {
        editorCalls.push({ title, prefill });
        let result: string | undefined;
        if (opts.editorResults) {
          result = opts.editorResults[editorCallIndex];
          editorCallIndex++;
        } else {
          result = opts.editorResult;
        }
        return result;
      },
      async confirm(title: string, message: string): Promise<boolean> {
        confirmCalls.push({ title, message });
        if (opts.confirmResults) {
          const result = opts.confirmResults[confirmCallIndex];
          confirmCallIndex++;
          return result ?? false;
        }
        return opts.confirmResult ?? false;
      },
    },
    getNotifies() {
      return notifies;
    },
    getEditorCalls() {
      return editorCalls;
    },
    getSelectCalls() {
      return selectCalls;
    },
    getConfirmCalls() {
      return confirmCalls;
    },
  };
}

// confirm(true) -> guided walkthrough (NOT the chooser)
//
// This routing test verifies the yes/no prompt routes to the guided mode,
// not the chooser. It cancels at the first editor prompt (the email prompt for
// Sequence A) so the guided walkthrough starts (proving the route) but aborts
// before reaching the probes — no live network call. The full guided
// walkthrough (with mocked probes) is tested in the runGuidedWalkthrough suite.
{
  const mock = makeMockEditChooserUi({
    confirmResults: [true], // guided walkthrough? -> Yes
    editorResults: [undefined], // cancel at the first (email) prompt
  });
  const kr = makeMockKeyring();
  await handleSecretEdit(
    mock.ui,
    async () => kr.keyring as unknown as import("@pi-aura/shared/keyring").Keyring
  );
  // The chooser (select) should NOT be shown when guided is chosen
  assert.strictEqual(mock.getSelectCalls().length, 0, "chooser not shown when guided=yes");
  // The guided walkthrough confirm was asked
  assert.ok(
    mock.getConfirmCalls().some((c) => c.title.includes("Guided walkthrough")),
    "guided walkthrough confirm asked"
  );
  // The guided walkthrough opened the email editor (Sequence A started)
  assert.ok(
    mock.getEditorCalls().some((c) => c.title.includes("email")),
    "guided walkthrough opened the email editor"
  );
  // No keyring write on cancel
  assert.strictEqual(kr.getStored().size, 0, "no keyring write on guided cancel");
}

// confirm(false) -> the chooser (NOT the guided mode)
{
  const mock = makeMockEditChooserUi({
    confirmResults: [false], // guided walkthrough? -> No
    selectResult: "Aura PAT",
    editorResult: "new-aura-pat",
  });
  const kr = makeMockKeyring();
  await handleSecretEdit(
    mock.ui,
    async () => kr.keyring as unknown as import("@pi-aura/shared/keyring").Keyring
  );
  // The chooser IS shown
  assert.strictEqual(mock.getSelectCalls().length, 1, "chooser shown when guided=no");
  assert.ok(
    mock.getSelectCalls()[0].options.includes("Aura PAT"),
    "chooser offers Aura PAT"
  );
  // The Aura PAT editor was opened
  assert.strictEqual(mock.getEditorCalls().length, 1, "Aura PAT editor opened");
}

console.log("handleSecretEdit yes/no routing tests passed");

console.log("All atlassian-provision tests passed");
