/**
 * Logic tests for the typed aura-mcp wrapper.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-mcp-client.test.ts
 *
 * Everything runs against an injectable fake caller (the arch spec's caller
 * seam): the typed methods' tool-name and argument envelopes, the error
 * mapping (including application errors that arrive inside an HTTP 200
 * result), the JSON payload extraction, and the contract self-check verdicts
 * (cosmetic drift warns and keeps the path; core drift fails fast and marks
 * the path unavailable). No network, no pi runtime, no real keyring.
 */

import assert from "node:assert/strict";
import {
  AURA_MCP_SERVER_NAME,
  SHIPPED_AURA_MCP_TOOLS,
  type AuraMcpLiveTool,
  type ShippedToolContract,
} from "./aura-mcp-contract.ts";
import {
  AuraMcpCallError,
  AuraMcpToolUnavailableError,
  auraMcpJson,
  auraMcpText,
  createAuraMcpInterface,
  loadAuraMcpCredentials,
  resolveAuraMcpConnection,
  type AuraMcpCaller,
  type AuraMcpToolResult,
} from "./aura-mcp-client.ts";

// ---------------------------------------------------------------------------
// Fake-caller helpers
// ---------------------------------------------------------------------------

/** Convert a shipped contract into the live-shaped tool the server would
 *  report for it (no drift): the fake `listTools` baseline. */
function toLiveTool(shipped: ShippedToolContract): AuraMcpLiveTool {
  const lines = shipped.description.split("\n");
  const hasTitleLine = lines.length > 1;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, param] of Object.entries(shipped.params)) {
    properties[name] = {
      type: param.type === "number" ? "integer" : param.type,
      description: param.description,
      ...(param.enum !== undefined ? { enum: [...param.enum] } : {}),
      ...(param.default !== undefined ? { default: param.default } : {}),
    };
    if (param.required) required.push(name);
  }
  return {
    name: shipped.name,
    ...(hasTitleLine ? { title: lines[0] } : {}),
    description: hasTitleLine ? lines.slice(1).join("\n").replace(/^\n+/, "") : lines[0],
    inputSchema: { type: "object", properties, ...(required.length > 0 ? { required } : {}) },
  };
}

function cleanLiveTools(): AuraMcpLiveTool[] {
  return SHIPPED_AURA_MCP_TOOLS.map(toLiveTool);
}

interface FakeCallerOptions {
  tools?: AuraMcpLiveTool[];
  onCall?: (tool: string, args: Record<string, unknown>) => AuraMcpToolResult;
  onListTools?: () => Promise<AuraMcpLiveTool[]>;
  failClose?: boolean;
}

interface FakeCaller extends AuraMcpCaller {
  calls: Array<{ tool: string; args: Record<string, unknown> }>;
  closed: boolean;
}

function fakeCaller(options: FakeCallerOptions = {}): FakeCaller {
  const calls: FakeCaller["calls"] = [];
  const caller: FakeCaller = {
    calls,
    closed: false,
    async callTool(tool, args) {
      calls.push({ tool, args });
      if (options.onCall) return options.onCall(tool, args);
      return { content: [{ type: "text", text: "{}" }] };
    },
    async listTools() {
      if (options.onListTools) return options.onListTools();
      return options.tools ?? cleanLiveTools();
    },
    async close() {
      if (options.failClose) throw new Error("close refused");
      caller.closed = true;
    },
  };
  return caller;
}

function okResult(payload: unknown): AuraMcpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

/** Build the wrapper over a fake caller. */
function makeInterface(caller: AuraMcpCaller, notify?: (message: string, type?: "info" | "warning" | "error") => void) {
  return createAuraMcpInterface({ caller, ...(notify ? { notify } : {}) });
}

// ---------------------------------------------------------------------------
// Typed methods: tool names and argument envelopes
// ---------------------------------------------------------------------------

{
  const caller = fakeCaller();
  const itf = await makeInterface(caller);

  await itf.searchTasks({ q: "login", archived: "all", limit: 5, page: 2, sort_by: "title", sort_dir: "asc" });
  assert.deepEqual(caller.calls[0], {
    tool: "listTasks",
    args: { q: "login", archived: "all", limit: 5, page: 2, sort_by: "title", sort_dir: "asc" },
  });

  await itf.searchTasks();
  assert.deepEqual(caller.calls[1], { tool: "listTasks", args: {} }, "omitted optional params are not sent");

  await itf.getTaskByHumanKey("AURA-42");
  assert.deepEqual(caller.calls[2], { tool: "getTaskByHumanKey", args: { human_key: "AURA-42" } });

  await itf.getTaskByHumanKey("AURA-42", { response_format: "full" });
  assert.deepEqual(caller.calls[3], {
    tool: "getTaskByHumanKey",
    args: { human_key: "AURA-42", response_format: "full" },
  });

  await itf.searchArtifacts({ q: "spec", limit: 50, page: 1, sort_by: "created_at", sort_dir: "desc" });
  assert.deepEqual(caller.calls[4], {
    tool: "listArtifacts",
    args: { q: "spec", limit: 50, page: 1, sort_by: "created_at", sort_dir: "desc" },
  });

  await itf.getArtifact("9f3c2e8a-1111-4222-8333-444444444444", { response_format: "detail" });
  assert.deepEqual(caller.calls[5], {
    tool: "getArtifact",
    args: { id: "9f3c2e8a-1111-4222-8333-444444444444", response_format: "detail" },
  });

  await itf.searchKnowledge({ query: "PR conventions", limit: 10, space_slug: "engineering-foundation" });
  assert.deepEqual(caller.calls[6], {
    tool: "searchKnowledge",
    args: { query: "PR conventions", limit: 10, space_slug: "engineering-foundation" },
  });

  await itf.getKnowledgeTree("engineering-foundation", { depth: 2, max_nodes: 200 });
  assert.deepEqual(caller.calls[7], {
    tool: "getKnowledgeTree",
    args: { slug: "engineering-foundation", depth: 2, max_nodes: 200 },
  });

  await itf.getKnowledgeTree("engineering-foundation");
  assert.deepEqual(caller.calls[8], { tool: "getKnowledgeTree", args: { slug: "engineering-foundation" } });

  await itf.getKnowledgeNode("9f3c2e8a-1111-4222-8333-444444444444");
  assert.deepEqual(caller.calls[9], { tool: "getKnowledgeNode", args: { id: "9f3c2e8a-1111-4222-8333-444444444444" } });

  await itf.getKnowledgeNodeByPath("engineering-foundation", "guides/code-quality");
  assert.deepEqual(caller.calls[10], {
    tool: "getKnowledgeNodeByPath",
    args: { slug: "engineering-foundation", path: "guides/code-quality" },
  });

  await itf.listKnowledgeSpaces();
  assert.deepEqual(caller.calls[11], { tool: "listKnowledgeSpaces", args: {} });

  await itf.createFeedback({
    title: "A short feedback title",
    body: "x".repeat(50),
    is_anonymous: false,
    notify_author: false,
    source: "MCP",
  });
  assert.deepEqual(caller.calls[12], {
    tool: "createFeedback",
    args: { title: "A short feedback title", body: "x".repeat(50), is_anonymous: false, notify_author: false, source: "MCP" },
  });

  console.log("typed methods: tool names + argument envelopes: ok");
}

// ---------------------------------------------------------------------------
// Envelopes and payload extraction
// ---------------------------------------------------------------------------

{
  // A successful result passes through unchanged (the caller owns the
  // envelope; the wrapper never rebuilds it).
  const envelope: AuraMcpToolResult = {
    content: [{ type: "text", text: '{"items":[1,2]}' }],
    structuredContent: { items: [1, 2] },
  };
  const caller = fakeCaller({ onCall: () => envelope });
  const itf = await makeInterface(caller);
  const result = await itf.listKnowledgeSpaces();
  assert.equal(result, envelope, "success results pass through by reference");
  console.log("envelope passthrough: ok");
}

{
  // auraMcpJson prefers structuredContent, falls back to the first text
  // block parsed as JSON, and yields undefined when neither parses.
  assert.deepEqual(auraMcpJson({ content: [], structuredContent: { a: 1 } }), { a: 1 });
  assert.deepEqual(auraMcpJson({ content: [{ type: "text", text: '{"b":2}' }] }), { b: 2 });
  assert.deepEqual(auraMcpJson({ content: [{ type: "text", text: "not json" }] }), undefined);
  assert.deepEqual(auraMcpJson({ content: [] }), undefined);
  assert.deepEqual(
    auraMcpJson({ content: [{ type: "text", text: "prose" }, { type: "text", text: '{"c":3}' }] }),
    undefined,
    "only the first text block is considered (the server sends one JSON payload block)",
  );
  assert.equal(auraMcpText({ content: [{ type: "text", text: "prose" }] }), "prose");
  assert.equal(auraMcpText({ content: [] }), "");
  console.log("auraMcpJson / auraMcpText extraction: ok");
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

{
  // An application error inside an HTTP 200 result (isError: true) becomes
  // an AuraMcpCallError carrying the server's message.
  const caller = fakeCaller({
    onCall: () => ({ content: [{ type: "text", text: "Task AURA-999999 not found" }], isError: true }),
  });
  const itf = await makeInterface(caller);
  await assert.rejects(
    () => itf.getTaskByHumanKey("AURA-999999"),
    (err: unknown) => {
      assert.ok(err instanceof AuraMcpCallError, "isError results map to AuraMcpCallError");
      assert.equal((err as AuraMcpCallError).tool, "getTaskByHumanKey");
      assert.match((err as Error).message, /AURA-999999/);
      return true;
    },
  );
  console.log("application error inside HTTP 200: ok");
}

{
  // A caller-level rejection (transport / protocol error from pi-mcp) also
  // becomes an AuraMcpCallError, with the cause preserved.
  const caller = fakeCaller({
    onCall: () => {
      throw new Error("connection closed");
    },
  });
  const itf = await makeInterface(caller);
  await assert.rejects(
    () => itf.listKnowledgeSpaces(),
    (err: unknown) => {
      assert.ok(err instanceof AuraMcpCallError);
      assert.equal((err as AuraMcpCallError).tool, "listKnowledgeSpaces");
      assert.match((err as Error).message, /connection closed/);
      assert.equal((err as AuraMcpCallError).cause instanceof Error, true, "the underlying error rides as cause");
      return true;
    },
  );
  console.log("caller-level rejection mapping: ok");
}

// ---------------------------------------------------------------------------
// Contract self-check wiring
// ---------------------------------------------------------------------------

{
  // Cosmetic drift warns the user, naming the tool and the difference, and
  // the tool's path stays callable.
  const notifications: Array<{ message: string; type?: string }> = [];
  const tools = cleanLiveTools();
  const listTasks = tools.find((tool) => tool.name === "listTasks")!;
  (listTasks.inputSchema as { properties: Record<string, unknown> }).properties.new_thing = {
    type: "string",
    description: "a fresh optional filter",
  };
  const caller = fakeCaller({ tools });
  const itf = await makeInterface(caller, (message, type) => notifications.push({ message, type }));

  assert.equal(notifications.length, 1, "exactly one warning for one cosmetic drift");
  assert.equal(notifications[0].type, "warning");
  assert.match(notifications[0].message, /listTasks/);
  assert.match(notifications[0].message, /new_thing/);

  await itf.searchTasks({ q: "still callable" });
  assert.equal(caller.calls.length, 1, "a cosmetically drifted tool stays callable");
  assert.equal(itf.selfCheck().status, "cosmetic");
  console.log("self-check cosmetic drift: warning + callable path: ok");
}

{
  // Core drift (tool gone) marks the path unavailable: the typed method
  // fails fast without touching the caller, the warning names what broke,
  // and sibling tools stay callable.
  const notifications: Array<{ message: string; type?: string }> = [];
  const tools = cleanLiveTools().filter((tool) => tool.name !== "getKnowledgeTree");
  const caller = fakeCaller({ tools });
  const itf = await makeInterface(caller, (message, type) => notifications.push({ message, type }));

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "error");
  assert.match(notifications[0].message, /getKnowledgeTree/);
  assert.match(notifications[0].message, /gone/);

  await assert.rejects(
    () => itf.getKnowledgeTree("engineering-foundation"),
    (err: unknown) => {
      assert.ok(err instanceof AuraMcpToolUnavailableError, "core drift fails fast with the degraded-path error");
      assert.equal((err as AuraMcpToolUnavailableError).tool, "getKnowledgeTree");
      assert.match((err as Error).message, /getKnowledgeTree/);
      return true;
    },
  );
  assert.equal(caller.calls.length, 0, "the blocked call never reaches the caller");

  await itf.getKnowledgeNode("some-uuid");
  assert.equal(caller.calls.length, 1, "sibling tools stay callable");
  assert.equal(itf.selfCheck().status, "core");
  console.log("self-check core drift (tool gone): fail-fast unavailable path: ok");
}

{
  // Core drift variants at the interface level: a renamed parameter makes
  // the path unavailable too.
  const tools = cleanLiveTools();
  const getArtifact = tools.find((tool) => tool.name === "getArtifact")!;
  const schema = getArtifact.inputSchema as { properties: Record<string, unknown> };
  schema.properties.artifact_id = schema.properties.id;
  delete schema.properties.id;
  const caller = fakeCaller({ tools });
  const itf = await makeInterface(caller, () => {});
  await assert.rejects(() => itf.getArtifact("some-uuid"), AuraMcpToolUnavailableError);
  console.log("self-check core drift (renamed parameter): fail-fast path: ok");
}

{
  // A failed live fetch skips the check: no warnings, all paths callable,
  // natural call errors surface to the consumer.
  const notifications: Array<{ message: string; type?: string }> = [];
  const caller = fakeCaller({
    onListTools: async () => {
      throw new Error("aura unreachable");
    },
  });
  const itf = await makeInterface(caller, (message, type) => notifications.push({ message, type }));
  assert.equal(notifications.length, 0, "a skipped self-check stays silent");
  assert.equal(itf.selfCheck().status, "skipped");
  await itf.listKnowledgeSpaces();
  assert.equal(caller.calls.length, 1, "paths stay callable when the check was skipped");
  console.log("self-check transport failure: skipped, silent, callable: ok");
}

// ---------------------------------------------------------------------------
// close
// ---------------------------------------------------------------------------

{
  const caller = fakeCaller();
  const itf = await makeInterface(caller);
  await itf.close();
  assert.equal(caller.closed, true, "close delegates to the caller");
  console.log("close delegation: ok");
}

// ---------------------------------------------------------------------------
// Credential seam
// ---------------------------------------------------------------------------

{
  // resolveAuraMcpConnection derives the endpoint and demands both
  // credentials.
  const connection = resolveAuraMcpConnection({ baseUrl: "https://aura.dev-anwalt.de/api", pat: "pat-123" });
  assert.equal(connection.url, "https://aura.dev-anwalt.de/mcp");
  assert.equal(connection.pat, "pat-123");
  assert.throws(() => resolveAuraMcpConnection({ pat: "pat-123" }), /baseUrl/);
  assert.throws(() => resolveAuraMcpConnection({ baseUrl: "https://aura.dev-anwalt.de/api" }), /PAT/);
  console.log("resolveAuraMcpConnection: ok");
}

{
  // loadAuraMcpCredentials reads settings + keyring through the existing
  // dynamic-import seams (fixtures: tmp settings file + fake keyring) and
  // never throws: a missing keyring degrades to a null PAT.
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "aura-mcp-creds-"));
  const settingsPath = join(dir, "settings.json");
  writeFileSync(settingsPath, JSON.stringify({ aura: { baseUrl: "https://aura.example.com/api" } }), "utf8");

  class FakeKeyring {
    private readonly pat: string | null;
    constructor(pat: string | null) {
      this.pat = pat;
    }
    async getSecret(key: { service: string; name: string }): Promise<string | null> {
      assert.equal(key.service, "aura");
      assert.equal(key.name, "pat");
      return this.pat;
    }
  }

  const withPat = await loadAuraMcpCredentials({
    settingsPath,
    keyring: new FakeKeyring("pat-abc") as never,
  });
  assert.deepEqual(withPat, { baseUrl: "https://aura.example.com/api", pat: "pat-abc" });

  const withoutPat = await loadAuraMcpCredentials({ settingsPath, keyring: new FakeKeyring(null) as never });
  assert.deepEqual(withoutPat, { baseUrl: "https://aura.example.com/api", pat: null });

  const missingSettings = await loadAuraMcpCredentials({
    settingsPath: join(dir, "absent.json"),
    keyring: new FakeKeyring("pat-abc") as never,
  });
  assert.deepEqual(missingSettings, { pat: "pat-abc" }, "a missing settings file yields no baseUrl, never throws");

  const throwingKeyring = await loadAuraMcpCredentials({
    settingsPath,
    keyring: {
      async getSecret() {
        throw new Error("keyring locked");
      },
    } as never,
  });
  assert.deepEqual(throwingKeyring, { baseUrl: "https://aura.example.com/api", pat: null }, "a failing keyring degrades to null");
  console.log("loadAuraMcpCredentials (settings + keyring seams): ok");
}

// ---------------------------------------------------------------------------
// Server identity
// ---------------------------------------------------------------------------

{
  assert.equal(AURA_MCP_SERVER_NAME, "aura-mcp-dev");
  assert.equal(SHIPPED_AURA_MCP_TOOLS.length, 10);
  console.log("server identity: ok");
}

// ---------------------------------------------------------------------------
// Guards: no hand-rolled protocol, no new runtime dependency
// ---------------------------------------------------------------------------

{
  // The wrapper and registration modules must stand on pi's MCP client
  // library: no static import of it (the dynamic-import seam only), and no
  // JSON-RPC wire literals anywhere (no hand-rolled protocol code).
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  for (const file of ["aura-mcp-client.ts", "aura-mcp-server.ts", "aura-mcp-contract.ts"]) {
    const source = readFileSync(join(import.meta.dirname, file), "utf8");
    assert.doesNotMatch(
      source,
      /^import\s[^;]*@earendil-works\/pi-mcp/m,
      `${file} must not statically import @earendil-works/pi-mcp (dynamic-import seam only)`,
    );
    assert.doesNotMatch(source, /jsonrpc/i, `${file} must contain no JSON-RPC wire literals`);
    assert.doesNotMatch(source, /"tools\/(call|list)"/, `${file} must contain no MCP wire method literals`);
  }

  // The package manifest gains no runtime dependency (the import resolves
  // inside the pi process, where the library is already present).
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  assert.equal(manifest.dependencies, undefined, "the package must carry no runtime dependencies block");
  assert.equal(
    manifest.peerDependencies?.["@earendil-works/pi-mcp"],
    undefined,
    "pi-mcp must not become a declared (peer) dependency: it resolves inside the pi process",
  );
  console.log("guards: no static pi-mcp import, no wire literals, no new runtime dependency: ok");
}

{
  // The dynamic import resolves in this environment; this repo IS the
  // installed package, so a green resolution here is the packaged-extension
  // verification the arch spec asks for.
  const piMcp = (await import("@earendil-works/pi-mcp")) as Record<string, unknown>;
  assert.equal(typeof piMcp.McpClient, "function");
  assert.equal(typeof piMcp.StreamableHttpTransport, "function");
  console.log("pi-mcp dynamic import resolution: ok");
}

console.log("\nall aura-mcp-client tests passed");
