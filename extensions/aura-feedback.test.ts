/**
 * Logic tests for the pure helpers in the `aura-feedback` extension.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-feedback.test.ts
 *
 * Covers the pure, pi-session-free surface: payload validation, the
 * `source: "MCP"` forcing in {@link buildSendPayload}, log-entry shape and
 * serialization, the tool-result text formatters, and the submission path
 * itself (the MCP createFeedback call over a fake caller and over a loopback
 * fake server, the core-drift degrade path, the JSONL record). The sign-off
 * decisions are driven through the real prompt code with scripted answers;
 * only the screens' rendering and key handling are exercised by the pi
 * runtime, mirroring how the rest of the extension suite is verified.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildLogEntry,
  buildSendPayload,
  default as auraFeedback,
  formatCreatedResultText,
  formatEditedResultText,
  formatRejectedResultText,
  serializeLogEntry,
  validatePayload,
} from "./aura-feedback.ts";
import {
  createAuraMcpInterface,
  loadAuraMcpCredentials,
  type AuraMcpCaller,
  type AuraMcpToolResult,
} from "./aura-mcp-client.ts";
import {
  SHIPPED_AURA_MCP_TOOLS,
  type AuraMcpLiveTool,
  type ShippedToolContract,
} from "./aura-mcp-contract.ts";
import type { CreateFeedbackInput, FeedbackDetail } from "@pi-aura/shared/aura-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validInput(overrides: Partial<CreateFeedbackInput> = {}): CreateFeedbackInput {
  return {
    title: "A short feedback title",
    body: "x".repeat(50), // meets the 50-char floor
    is_anonymous: false,
    notify_author: false,
    ...overrides,
  };
}

function createdRow(overrides: Partial<FeedbackDetail> = {}): FeedbackDetail {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "A short feedback title",
    body: "x".repeat(50),
    source: "MCP",
    status: "NEW",
    is_anonymous: false,
    notify_author: false,
    created_at: "2025-09-01T10:00:00.000Z",
    updated_at: "2025-09-01T10:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validatePayload
// ---------------------------------------------------------------------------

{
  assert.equal(validatePayload(validInput()), null, "valid payload passes");

  const noTitle = validatePayload({ title: "", body: "x".repeat(50) });
  assert.ok(noTitle && noTitle.includes("title"), "empty title fails mentioning title");

  const longTitle = validatePayload({ title: "y".repeat(121), body: "x".repeat(50) });
  assert.ok(longTitle && longTitle.includes("120"), "overlong title mentions 120");

  const shortBody = validatePayload({ title: "ok", body: "short" });
  assert.ok(shortBody && shortBody.includes("50"), "short body mentions 50");

  const badTypes = validatePayload({ title: 42 as unknown as string, body: "x".repeat(50) });
  assert.ok(badTypes && badTypes.includes("title"), "non-string title fails");
  assert.equal(
    validatePayload({ title: "ok", body: 99 as unknown as string }),
    "body is 0 characters; minimum is 50",
    "non-string body reports 0 chars",
  );
}

// ---------------------------------------------------------------------------
// buildSendPayload always forces source: "MCP"
// ---------------------------------------------------------------------------

{
  const out = buildSendPayload(validInput());
  assert.equal(out.source, "MCP", "source forced to MCP");
  assert.equal(out.title, "A short feedback title", "title preserved");
  assert.equal(out.body, "x".repeat(50), "body preserved");
  assert.equal(out.is_anonymous, false, "is_anonymous preserved");
  assert.equal(out.notify_author, false, "notify_author preserved");

  // Even if the caller tried to set a different source, it is overwritten.
  const sneaky = buildSendPayload({ ...validInput(), source: "UI" } as CreateFeedbackInput);
  assert.equal(sneaky.source, "MCP", "caller's source overwritten to MCP");
}

// ---------------------------------------------------------------------------
// buildLogEntry + serializeLogEntry
// ---------------------------------------------------------------------------

{
  const payload = buildSendPayload(validInput({ is_anonymous: true }));
  const created = createdRow({ is_anonymous: true, notify_author: false });
  const now = new Date("2025-09-01T12:34:56.789Z");
  const entry = buildLogEntry(payload, created, now);

  assert.equal(entry.timestamp, "2025-09-01T12:34:56.789Z", "timestamp is ISO UTC");
  assert.equal(typeof entry.timestamp_local, "string", "timestamp_local present");
  assert.equal(entry.uuid, created.id, "uuid is the created row id");
  assert.deepEqual(
    entry.payload,
    {
      title: payload.title,
      body: payload.body,
      is_anonymous: true,
      notify_author: false,
      source: "MCP",
    },
    "payload records the sent fields + MCP source",
  );
  assert.equal(entry.created, created, "created row included verbatim");

  const line = serializeLogEntry(entry);
  assert.equal(line.includes("\n"), false, "serialized entry is a single line");
  // Round-trips through JSON.
  const parsed = JSON.parse(line) as { uuid: string; payload: { source: string } };
  assert.equal(parsed.uuid, created.id, "parsed uuid matches");
  assert.equal(parsed.payload.source, "MCP", "parsed source is MCP");
}

// ---------------------------------------------------------------------------
// formatCreatedResultText / formatEditedResultText
// ---------------------------------------------------------------------------

{
  const created = createdRow();
  const createdText = formatCreatedResultText(created);
  assert.ok(createdText.includes(created.id), "created text names the UUID");
  assert.ok(createdText.includes("NEW"), "created text names the status");
  assert.ok(createdText.includes(".pi/aura/feedback.jsonl"), "created text names the log path");

  const editedText = formatEditedResultText(created);
  assert.ok(editedText.includes(created.id), "edited text names the UUID");
  assert.ok(editedText.includes("edited"), "edited text mentions the edit");
}

// ---------------------------------------------------------------------------
// formatRejectedResultText: No vs Refine
// ---------------------------------------------------------------------------

{
  const noNoComment = formatRejectedResultText("no", undefined);
  assert.ok(noNoComment.includes("rejected"), "no-without-comment says rejected");
  assert.ok(!noNoComment.includes("comment"), "no-without-comment has no comment prose");

  const noWithComment = formatRejectedResultText("no", "  already filed  ");
  assert.ok(
    noWithComment.includes("already filed"),
    "no-with-comment trims and includes the comment",
  );
  assert.ok(noWithComment.includes("rejected"), "no-with-comment still says rejected");

  const refineNoComment = formatRejectedResultText("refine", undefined);
  assert.ok(
    refineNoComment.includes("refine"),
    "refine-without-comment tells the agent to refine",
  );
  assert.ok(
    refineNoComment.includes("aura_feedback"),
    "refine-without-comment points at aura_feedback",
  );

  const refineWithComment = formatRejectedResultText("refine", "be more specific");
  assert.ok(
    refineWithComment.includes("be more specific"),
    "refine-with-comment includes the user's feedback",
  );
  assert.ok(
    refineWithComment.includes("aura_feedback"),
    "refine-with-comment points at aura_feedback",
  );
}

// ---------------------------------------------------------------------------
// Factory wiring: the registered tool, captured over a fake pi
// ---------------------------------------------------------------------------

/** The tool the factory registers, as tests drive it: the name, the
 *  model-facing description, and `execute` returning the tool result. */
interface RegisteredTool {
  name: string;
  description: string;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: unknown,
    onUpdate: unknown,
    ctx: unknown,
  ): Promise<{ content: Array<{ type: string; text?: string }>; details?: AuraFeedbackDetailsShape }>;
}

/** The `details` payload the tool result carries (structural view). */
interface AuraFeedbackDetailsShape {
  outcome: "created" | "rejected" | "refined";
  sentPayload?: Record<string, unknown>;
  created?: Record<string, unknown>;
  comment?: string;
  edited?: boolean;
}

/** Run the extension factory over a fake pi and return the tool it
 *  registered, so tests can assert the model-facing surface and drive
 *  `execute` directly. */
function captureRegisteredTool(options: Record<string, unknown> = {}): RegisteredTool {
  let registered: RegisteredTool | undefined;
  const fakePi = {
    registerTool(tool: RegisteredTool) {
      registered = tool;
    },
  };
  auraFeedback(fakePi as never, options as never);
  if (!registered) throw new Error("the feedback extension registered no tool");
  return registered;
}

// ---------------------------------------------------------------------------
// Criterion 3: the injected warning names the current full tool name and
// still forbids direct model calls without sign-off
// ---------------------------------------------------------------------------

{
  const tool = captureRegisteredTool();
  assert.equal(tool.name, "aura_feedback", "the tool keeps its identity");
  assert.ok(
    tool.description.includes("mcp__aura_mcp_dev__createFeedback"),
    "the warning names the current full tool name (pi's mcp__<server>__<tool> naming)",
  );
  assert.ok(
    !tool.description.includes("aura-mcp-dev_createFeedback"),
    "the stale token from the retired naming scheme is gone",
  );
  assert.ok(
    tool.description.includes("Do not use") && tool.description.includes("no human sign-off"),
    "the warning still forbids direct model calls without sign-off",
  );
  console.log("warning text: corrected tool naming, sign-off requirement kept: ok");
}

{
  // The stale token is gone from the whole module (doc comments included).
  const source = readFileSync(new URL("./aura-feedback.ts", import.meta.url), "utf8");
  assert.ok(
    !source.includes("aura-mcp-dev_createFeedback"),
    "no stale tool-name token anywhere in the module",
  );
  console.log("module source: stale token gone: ok");
}

// ---------------------------------------------------------------------------
// Submission-path helpers: fake caller, fake session context, tmp log
// ---------------------------------------------------------------------------

/** Convert a shipped contract into the live-shaped tool the server would
 *  report for it (no drift): the fake `listTools` baseline (the same helper
 *  the aura-mcp-client suite uses). */
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

interface FakeCallerShape extends AuraMcpCaller {
  calls: Array<{ tool: string; args: Record<string, unknown> }>;
  closed: boolean;
}

/** A recording fake caller (the caller seam): drift-free tool list unless
 *  overridden, scripted call results, close recorded. */
function fakeCaller(
  options: { tools?: AuraMcpLiveTool[]; onCall?: (tool: string, args: Record<string, unknown>) => AuraMcpToolResult } = {},
): FakeCallerShape {
  const caller: FakeCallerShape = {
    calls: [],
    closed: false,
    async callTool(tool, args) {
      caller.calls.push({ tool, args });
      if (options.onCall) return options.onCall(tool, args);
      return { content: [{ type: "text", text: "{}" }] };
    },
    async listTools() {
      return options.tools ?? cleanLiveTools();
    },
    async close() {
      caller.closed = true;
    },
  };
  return caller;
}

/** The created row the fake instance/caller returns for createFeedback (the
 *  JSON payload shape the live server's tool result carries). */
function mcpCreatedRow(args: Record<string, unknown>) {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    title: String(args.title ?? ""),
    body: String(args.body ?? ""),
    source: "MCP",
    status: "NEW",
    is_anonymous: Boolean(args.is_anonymous),
    notify_author: Boolean(args.notify_author),
    created_at: "2025-11-03T09:00:00.000Z",
    updated_at: "2025-11-03T09:00:00.000Z",
  };
}

function okRowResult(row: unknown): AuraMcpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(row) }] };
}

/** A TUI session context: the sign-off screens are driven by the real code,
 *  the fake `ctx.ui.custom` resolves the next scripted decision directly
 *  ("Yes" submits as shown), and notify calls are recorded. */
function feedbackCtx(script: string[]) {
  const notifies: Array<{ message: string; type?: "info" | "warning" | "error" }> = [];
  const ctx = {
    mode: "tui",
    ui: {
      notify(message: string, type?: "info" | "warning" | "error") {
        notifies.push({ message, type });
      },
      custom() {
        return Promise.resolve(script.length > 0 ? script.shift() : "escape");
      },
    },
  };
  return { ctx, notifies };
}

/** A hermetic JSONL log path (the submission tests must never touch the
 *  real ~/.pi/aura/feedback.jsonl). */
function tmpLogPath(): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "aura-feedback-test-"));
  return { path: join(dir, "feedback.jsonl"), dir };
}

function cleanupTmp(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

const PROPOSAL = { title: "A short feedback title", body: "x".repeat(50) };

/** Drive the registered tool's execute and flatten the result. */
async function runTool(
  tool: RegisteredTool,
  ctx: unknown,
): Promise<{ text: string; details: AuraFeedbackDetailsShape }> {
  const result = await tool.execute("test-call", { ...PROPOSAL }, undefined, undefined, ctx);
  const text = result.content.find((block) => block.type === "text")?.text ?? "";
  return { text, details: (result.details ?? {}) as AuraFeedbackDetailsShape };
}

// ---------------------------------------------------------------------------
// Criterion 4: simulated interface unavailability (core drift on the
// feedback path) surfaces as a user-visible error from the sign-off flow,
// not a silent no-op
// ---------------------------------------------------------------------------

{
  const log = tmpLogPath();
  // Core drift: the createFeedback tool is gone from the live server, so
  // the interface's feedback path is unavailable (the degrade seam).
  const caller = fakeCaller({ tools: cleanLiveTools().filter((tool) => tool.name !== "createFeedback") });
  const { ctx, notifies } = feedbackCtx(["Yes"]);
  const tool = captureRegisteredTool({
    createInterface: () => createAuraMcpInterface({ caller }),
    logPath: log.path,
  });
  const { text, details } = await runTool(tool, ctx);
  assert.equal(details.outcome, "rejected", "the flow reports a rejection, not a creation");
  assert.ok(
    text.includes("unavailable") && text.includes("createFeedback"),
    `the error names the unavailable feedback path: ${text}`,
  );
  assert.ok(text.includes("nothing was sent"), "the error says nothing was sent to Aura");
  assert.ok(!existsSync(log.path), "nothing was logged locally");
  assert.equal(
    caller.calls.filter((call) => call.tool === "createFeedback").length,
    0,
    "the unavailable path fails fast: no createFeedback call reached the caller",
  );
  cleanupTmp(log.dir);
  console.log("core drift: user-visible error from the sign-off flow, fail fast, nothing logged: ok");
}

// ---------------------------------------------------------------------------
// Criterion 4 (production path): core drift on the default construction
// surfaces through the notify hook AND as the user-visible tool error; the
// wire never sees a submission
// ---------------------------------------------------------------------------

{
  const instance = await fakeAuraInstance(
    { createFeedback: (args) => mcpCreatedRow(args) },
    // Core drift: the live server no longer reports the createFeedback tool.
    cleanLiveTools().filter((tool) => tool.name !== "createFeedback"),
  );
  try {
    const dir = mkdtempSync(join(tmpdir(), "aura-feedback-drift-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ aura: { baseUrl: instance.baseUrl } }), "utf8");
    const log = tmpLogPath();
    const { ctx, notifies } = feedbackCtx(["Yes"]);
    const tool = captureRegisteredTool({
      loadCredentials: () =>
        loadAuraMcpCredentials({
          settingsPath,
          keyring: {
            async getSecret() {
              return "pat-feedback-drift-test";
            },
          },
        }),
      logPath: log.path,
    });
    const { text, details } = await runTool(tool, ctx);
    assert.ok(
      notifies.some((n) => n.message.includes("createFeedback") && n.type === "error"),
      "the construction surfaced the core drift to the user through the notify hook",
    );
    assert.equal(details.outcome, "rejected", "the flow reports a rejection, not a creation");
    assert.ok(
      text.includes("unavailable") && text.includes("createFeedback") && text.includes("nothing was sent"),
      `the tool result is a user-visible error naming what broke: ${text}`,
    );
    assert.ok(!existsSync(log.path), "nothing was logged locally");
    assert.equal(
      instance.calls.filter((call) => call.method === "tools/call").length,
      0,
      "the unavailable path fails fast: the wire never saw a submission",
    );
    cleanupTmp(log.dir);
    cleanupTmp(dir);
    console.log("core drift (production path): notify hook + user-visible error, fail fast: ok");
  } finally {
    await instance.close();
  }
}

// ---------------------------------------------------------------------------
// Criterion 1: a confirmed submission lands via the MCP path; no REST call
// site remains in the feedback extension
// ---------------------------------------------------------------------------

{
  const log = tmpLogPath();
  const row = mcpCreatedRow(PROPOSAL);
  const caller = fakeCaller({ onCall: (name) => (name === "createFeedback" ? okRowResult(row) : { content: [{ type: "text", text: "{}" }] }) });
  const { ctx } = feedbackCtx(["Yes"]);
  const tool = captureRegisteredTool({
    createInterface: () => createAuraMcpInterface({ caller }),
    logPath: log.path,
  });
  const { text, details } = await runTool(tool, ctx);
  assert.deepEqual(
    caller.calls,
    [{ tool: "createFeedback", args: { title: PROPOSAL.title, body: PROPOSAL.body, is_anonymous: false, notify_author: false, source: "MCP" } }],
    "the confirmed submission rode the typed interface's createFeedback tool with the forced MCP source",
  );
  assert.equal(details.outcome, "created", "the flow reports a creation");
  assert.equal(
    details.created && (details.created as { id?: string }).id,
    row.id,
    "the result details carry the created row",
  );
  assert.ok(text.includes(row.id) && text.includes("created"), "the result names the created UUID");
  assert.equal(caller.closed, true, "the interface connection was released after the submission");
  assert.ok(existsSync(log.path), "the JSONL audit record was appended");
  // No REST call site remains: no import of the shared REST client and no
  // REST client factory call anywhere in the extension.
  const source = readFileSync(new URL("./aura-feedback.ts", import.meta.url), "utf8");
  assert.ok(!source.includes("@pi-aura/shared/aura-client"), "no REST client import in the feedback extension");
  assert.ok(!source.includes("createDefaultAuraClient"), "no REST client call site in the feedback extension");
  cleanupTmp(log.dir);
  console.log("submission: confirmed sign-off lands on the MCP createFeedback path, REST gone: ok");
}

// ---------------------------------------------------------------------------
// Criterion 1 (production path): the real loader over its fixture seams, the
// default pi-mcp caller, a reachable fake aura-mcp-dev over loopback HTTP
// ---------------------------------------------------------------------------

interface FakeInstanceCall {
  method: string | undefined;
  tool: string | undefined;
  args: Record<string, unknown> | undefined;
  authorization: string | undefined;
  url: string | undefined;
}

/** A reachable stand-in for the live aura-mcp-dev server: the minimal
 *  streamable-HTTP MCP handshake (initialize, notifications/initialized,
 *  tools/list) plus the tool calls the submission exercises, served over
 *  real loopback HTTP so the production construction path (the default
 *  caller built from the loaded credentials) connects end to end. The same
 *  shape the aura-references construction-path test uses. */
async function fakeAuraInstance(
  handlers: Record<string, (args: Record<string, unknown>) => unknown>,
  tools: AuraMcpLiveTool[] = cleanLiveTools(),
) {
  const calls: FakeInstanceCall[] = [];
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    if (req.method === "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    if (req.method === "DELETE") {
      res.writeHead(200);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
    });
    req.on("end", () => {
      let message: {
        id?: unknown;
        method?: string;
        params?: { protocolVersion?: string; name?: string; arguments?: Record<string, unknown> };
      } = {};
      try {
        message = JSON.parse(body) as typeof message;
      } catch {
        // Malformed body: handled by the fallthrough error reply below.
      }
      calls.push({
        method: message.method,
        tool: message.params?.name,
        args: message.params?.arguments,
        authorization: req.headers.authorization,
        url: req.url,
      });
      const json = (payload: unknown) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, ...payload }));
      };
      if (message.id === undefined) {
        // A notification: acknowledged with 202, no reply body.
        res.writeHead(202);
        res.end();
        return;
      }
      if (message.method === "initialize") {
        json({
          result: {
            protocolVersion: message.params?.protocolVersion,
            capabilities: {},
            serverInfo: { name: "aura-mcp-dev", version: "test-instance" },
          },
        });
        return;
      }
      if (message.method === "tools/list") {
        json({ result: { tools } });
        return;
      }
      if (message.method === "tools/call") {
        const handler = handlers[message.params?.name ?? ""];
        if (handler === undefined) {
          json({ error: { code: -32601, message: `no fake handler for ${message.params?.name}` } });
          return;
        }
        json({ result: { content: [{ type: "text", text: JSON.stringify(handler(message.params?.arguments ?? {})) }] } });
        return;
      }
      json({ error: { code: -32601, message: `method not found: ${message.method}` } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return {
    calls,
    baseUrl: `http://127.0.0.1:${port}/api`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
    },
  };
}

{
  // NO injected interface anywhere: the real loadAuraMcpCredentials runs
  // over its fixture seams (a tmp settings file plus a fake keyring), the
  // production caller connects to the reachable fake instance, and the
  // LOADED credentials must reach the wire. The instance serves a
  // cosmetically drifted createFeedback schema, so the construction also
  // proves the extension passes the notify hook (the user sees the drift
  // warning; the path stays callable).
  const driftedTools = cleanLiveTools().map((tool) => {
    if (tool.name !== "createFeedback") return tool;
    const schema = tool.inputSchema as { properties: Record<string, Record<string, unknown>> };
    return {
      ...tool,
      inputSchema: {
        ...schema,
        properties: {
          ...schema.properties,
          title: { ...schema.properties.title, description: "Short title of the feedback, at most 120 characters (drifted)." },
        },
      },
    };
  });
  const instance = await fakeAuraInstance({ createFeedback: (args) => mcpCreatedRow(args) }, driftedTools);
  try {
    const dir = mkdtempSync(join(tmpdir(), "aura-feedback-construction-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ aura: { baseUrl: instance.baseUrl } }), "utf8");
    const keyringCalls: Array<{ service: string; name: string }> = [];
    const keyring = {
      async getSecret(key: { service: string; name: string }) {
        keyringCalls.push({ ...key });
        return "pat-feedback-production-test";
      },
    };
    const log = tmpLogPath();
    const { ctx, notifies } = feedbackCtx(["Yes"]);
    const tool = captureRegisteredTool({
      loadCredentials: () => loadAuraMcpCredentials({ settingsPath, keyring }),
      logPath: log.path,
    });
    const { text, details } = await runTool(tool, ctx);
    assert.deepEqual(
      keyringCalls,
      [{ service: "aura", name: "pat" }],
      "the construction consulted the real loader over the fake keyring fixture",
    );
    assert.ok(
      notifies.some((n) => n.message.includes("createFeedback") && n.type === "warning"),
      "cosmetic drift warned the user through the notify hook (the extension passes it into the construction)",
    );
    assert.ok(
      !notifies.some((n) => n.type === "error"),
      "cosmetic drift keeps the path callable: no core-drift error",
    );
    const submit = instance.calls.find((call) => call.method === "tools/call");
    assert.notEqual(submit, undefined, "the submission reached the instance as a tools/call");
    assert.equal(submit?.tool, "createFeedback", "the wire tool was the server's createFeedback");
    assert.deepEqual(
      submit?.args,
      { title: PROPOSAL.title, body: PROPOSAL.body, is_anonymous: false, notify_author: false, source: "MCP" },
      "the confirmed payload rode the wire with the forced MCP source",
    );
    assert.equal(submit?.authorization, "Bearer pat-feedback-production-test", "the loaded keyring PAT rode the production caller");
    assert.equal(submit?.url, "/mcp", "the endpoint was derived from the loaded settings baseUrl");
    assert.equal(details.outcome, "created", "the flow reports a creation");
    assert.ok(text.includes("123e4567-e89b-42d3-a456-426614174000"), "the result names the created UUID");
    assert.ok(existsSync(log.path), "the JSONL audit record was appended");
    cleanupTmp(log.dir);
    cleanupTmp(dir);
    console.log("production path: real loader over fixture seams, loaded credentials on the wire, confirmed submission lands: ok");
  } finally {
    await instance.close();
  }
}

// ---------------------------------------------------------------------------
// Criterion 2: the local JSONL audit record is appended exactly as before,
// with the same fields
// ---------------------------------------------------------------------------

{
  const log = tmpLogPath();
  const row = mcpCreatedRow(PROPOSAL);
  const caller = fakeCaller({ onCall: (name) => (name === "createFeedback" ? okRowResult(row) : { content: [{ type: "text", text: "{}" }] }) });
  const { ctx } = feedbackCtx(["Yes"]);
  const tool = captureRegisteredTool({
    createInterface: () => createAuraMcpInterface({ caller }),
    logPath: log.path,
  });
  await runTool(tool, ctx);
  const lines = readFileSync(log.path, "utf8").trim().split("\n");
  assert.equal(lines.length, 1, "exactly one JSONL line for one submission");
  const entry = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
  assert.ok(
    typeof entry.timestamp === "string" && !Number.isNaN(Date.parse(entry.timestamp as string)),
    "timestamp is an ISO string",
  );
  assert.ok(typeof entry.timestamp_local === "string", "timestamp_local present");
  assert.equal(entry.uuid, row.id, "uuid is the created row id");
  assert.deepEqual(
    entry.payload,
    { title: PROPOSAL.title, body: PROPOSAL.body, is_anonymous: false, notify_author: false, source: "MCP" },
    "payload records the sent fields with the forced MCP source",
  );
  assert.deepEqual(entry.created, row, "the created row is included verbatim");
  cleanupTmp(log.dir);
  console.log("audit record: same fields as before, appended once: ok");
}

console.log("all aura-feedback tests passed");
