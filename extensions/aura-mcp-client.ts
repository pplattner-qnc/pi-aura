/**
 * The typed aura-mcp wrapper: the package's one typed door to the
 * aura-mcp-dev server.
 *
 * The wrapper stands on `@earendil-works/pi-mcp` (the MCP client library pi
 * itself uses, present in the dependency tree and resolvable inside the pi
 * process where extensions run): its `McpClient` and `StreamableHttpTransport`
 * own every byte of protocol — JSON-RPC framing, the streamable HTTP
 * transport, reconnection, timeouts. Nothing here hand-rolls any of it; the
 * only protocol-shaped code in the package is the *contract data* in
 * aura-mcp-contract.ts, which describes the server's tool schemas, not the
 * wire.
 *
 * Surface: strictly typed methods for the tools the mention machinery and
 * the feedback tool use (task search with archived visibility, paging and
 * sorting; task read by human key; artifact search and read; knowledge
 * search; tree fetch; node reads by identifier and by path; space listing;
 * feedback creation). Input types derive 1:1 from the effort's introspection
 * dump (the same evidence `SHIPPED_AURA_MCP_TOOLS` transcribes); results are
 * the standard MCP tool-result envelope, with `auraMcpJson` / `auraMcpText`
 * helpers for payload extraction.
 *
 * Contract self-check (the operator ruling): on every initialization the
 * wrapper fetches the server's live tool schemas through the caller and
 * compares them against the shipped definitions. Cosmetic drift warns the
 * user, naming the tool and the difference, and the path stays callable.
 * Core drift (a tool gone; a parameter the wrapper sends or reads renamed,
 * retyped, or newly required) makes that tool's path unavailable: calls to
 * it fail fast with {@link AuraMcpToolUnavailableError} — the degraded-path
 * error consumers map onto their established cache-only behavior — and the
 * warning names what broke. A live fetch that itself fails skips the check
 * silently: no verdict, no warning, and natural call errors surface to the
 * consumer as always.
 *
 * Seams (arch spec):
 * - the caller seam: {@link AuraMcpCaller} is injectable; tests pass fakes
 *   and never touch pi-mcp or the network;
 * - the credential seam: the default construction reads settings + keyring
 *   through the package's dynamic-import seams ({@link loadAuraMcpCredentials}),
 *   mirroring how every existing extension resolves `@pi-aura/shared`;
 * - the degrade seam: core drift surfaces as the thrown-error shape the
 *   reference engine already maps onto cache-only answers.
 *
 * Connection lifecycle: the default caller connects lazily on first
 * construction of the interface and owns no reconnect logic (the library
 * owns it). Construction failures (missing credentials, unreachable server)
 * propagate: consumers construct the interface inside their existing
 * try/catch paths and degrade to cache-only exactly as they do for the REST
 * client today.
 */

import {
  AURA_MCP_SERVER_NAME,
  SHIPPED_AURA_MCP_TOOLS,
  auraMcpEndpointFromBaseUrl,
  runContractSelfCheck,
  type AuraMcpLiveTool,
  type ContractSelfCheck,
} from "./aura-mcp-contract.ts";

// ---------------------------------------------------------------------------
// Envelope types (structural views of pi-mcp's; no static pi-mcp import)
// ---------------------------------------------------------------------------

/** One content block of a tool result (MCP `ContentBlock`, structurally
 *  typed). */
export interface AuraMcpContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/** The MCP tool-result envelope a call resolves to. */
export interface AuraMcpToolResult {
  content: AuraMcpContentBlock[];
  isError?: boolean;
  structuredContent?: unknown;
  [key: string]: unknown;
}

/**
 * The injectable caller seam: the minimal shape of pi-mcp's `McpClient` the
 * wrapper needs. Tests pass fakes; production passes the real client
 * (built in {@link createDefaultAuraMcpCaller}).
 */
export interface AuraMcpCaller {
  callTool(tool: string, args: Record<string, unknown>): Promise<AuraMcpToolResult>;
  listTools(): Promise<AuraMcpLiveTool[]>;
  close?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Errors (the degrade seam)
// ---------------------------------------------------------------------------

/** Base class for every error the wrapper raises; `tool` names the aura-mcp-dev
 *  tool involved when there is one. */
export class AuraMcpError extends Error {
  readonly tool: string | undefined;

  constructor(message: string, options: { tool?: string; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AuraMcpError";
    this.tool = options.tool;
  }
}

/** A call failed: either the server reported an application error inside an
 *  HTTP 200 result (`isError: true`), or the caller rejected (transport,
 *  protocol, timeout — the underlying error rides as `cause`). */
export class AuraMcpCallError extends AuraMcpError {
  declare readonly tool: string;

  constructor(tool: string, message: string, options: { cause?: unknown } = {}) {
    super(message, { tool, ...(options.cause !== undefined ? { cause: options.cause } : {}) });
    this.name = "AuraMcpCallError";
  }
}

/** The degraded-path error: the tool's contract drifted in a way the
 *  wrapper cannot honor, so its path is unavailable and calls fail fast
 *  without touching the network. Consumers map this onto their established
 *  cache-only behavior. */
export class AuraMcpToolUnavailableError extends AuraMcpError {
  declare readonly tool: string;
  readonly issues: readonly string[];

  constructor(tool: string, issues: readonly string[]) {
    super(
      `aura-mcp-dev tool "${tool}" is unavailable (contract drift): ${issues.join("; ")}. Calls fail fast; consume cached data instead.`,
      { tool },
    );
    this.name = "AuraMcpToolUnavailableError";
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Payload extraction helpers
// ---------------------------------------------------------------------------

/** The text of the result's first text content block, or `""`. */
export function auraMcpText(result: AuraMcpToolResult): string {
  const block = result.content?.find((candidate) => candidate.type === "text" && typeof candidate.text === "string");
  return block?.text ?? "";
}

/** The result's JSON payload: `structuredContent` when the server provides
 *  it, else the first text block parsed as JSON, else `undefined`. */
export function auraMcpJson(result: AuraMcpToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = auraMcpText(result);
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Typed parameters (derived 1:1 from the introspection dump)
// ---------------------------------------------------------------------------

/** `listTasks` parameters: full-text search, archived visibility, paging,
 *  sorting. */
export interface SearchTasksParams {
  /** Search query (full-text filter across relevant fields). */
  q?: string;
  /** Archived visibility (orthogonal to status): "false" (default) hides
   *  archived, "true" only archived, "all" both. */
  archived?: "false" | "true" | "all";
  /** Page number (1-based, default 1). */
  page?: number;
  /** Number of items per page (1-100, default 20). */
  limit?: number;
  /** Field to sort by (default "updated_at"). */
  sort_by?: "created_at" | "updated_at" | "title" | "urgent_deadline";
  /** Sort direction (default "desc"). */
  sort_dir?: "asc" | "desc";
}

/** `listArtifacts` parameters: title search, paging, sorting. */
export interface SearchArtifactsParams {
  /** Free-text search over the artifact title. */
  q?: string;
  /** 1-based page number (default 1). */
  page?: number;
  /** Page size (1-100, default 20). */
  limit?: number;
  /** Field to sort by (default "updated_at"). */
  sort_by?: "created_at" | "updated_at" | "title";
  /** Sort direction (default "desc"). */
  sort_dir?: "asc" | "desc";
}

/** `searchKnowledge` parameters. */
export interface SearchKnowledgeParams {
  /** Search text (literal plus semantic matching, from 3 characters). */
  query: string;
  /** Maximum number of matching pages (1-50, default 20). */
  limit?: number;
  /** Restrict the search to one knowledge space, by slug. */
  space_slug?: string;
}

/** `createFeedback` parameters (the server's tool, not the sign-off flow —
 *  the aura_feedback extension owns that and calls this underneath). */
export interface CreateFeedbackParams {
  /** Short title of the feedback, at most 120 characters. */
  title: string;
  /** The feedback text itself, at least 50 characters. */
  body: string;
  /** When true, the entry is stored without an author. */
  is_anonymous?: boolean;
  /** Whether to notify the author when a linked task is done. */
  notify_author?: boolean;
  /** How the entry arrived. */
  source?: "UI" | "AGENT" | "MCP";
}

/** Optional `response_format` on the two reads that declare it. */
export type ResponseFormat = "compact" | "detail" | "full";

// ---------------------------------------------------------------------------
// Credentials (the credential seam)
// ---------------------------------------------------------------------------

/** Credentials for one aura-mcp-dev connection. */
export interface AuraMcpCredentials {
  baseUrl?: string;
  pat: string | null;
}

export interface LoadAuraMcpCredentialsOptions {
  /** Override the settings.json path (test hook; defaults to the real one). */
  settingsPath?: string;
  /** Inject a keyring (test hook; defaults to the OS keyring). */
  keyring?: {
    getSecret(key: { service: string; name: string }): Promise<string | null>;
  };
}

/**
 * Read the Aura credentials from the package's existing seams: the
 * `aura.baseUrl` from `~/.pi/agent/settings.json` (via
 * `@pi-aura/shared/settings`) and the PAT from the OS keyring (via
 * `@pi-aura/shared/keyring`, service "aura", name "pat"). Both load through
 * dynamic imports — the package's standard seam, which keeps the unit-test
 * entry runnable with `node --experimental-strip-types`.
 *
 * Never throws: a missing settings file yields no `baseUrl`; a failing or
 * missing keyring yields a `null` PAT. Callers decide what absence means.
 */
export async function loadAuraMcpCredentials(
  options: LoadAuraMcpCredentialsOptions = {},
): Promise<AuraMcpCredentials> {
  let baseUrl: string | undefined;
  try {
    const settings = (await import("@pi-aura/shared/settings")) as {
      loadAuraClientSettings(settingsPath?: string): { baseUrl?: string };
    };
    baseUrl = settings.loadAuraClientSettings(options.settingsPath).baseUrl;
  } catch {
    baseUrl = undefined;
  }

  let pat: string | null = null;
  try {
    let store = options.keyring;
    if (store === undefined) {
      const keyring = (await import("@pi-aura/shared/keyring")) as {
        createKeyring(): Promise<{ getSecret(key: { service: string; name: string }): Promise<string | null> }>;
      };
      store = await keyring.createKeyring();
    }
    pat = await store.getSecret({ service: "aura", name: "pat" });
  } catch {
    pat = null;
  }
  return { ...(baseUrl !== undefined ? { baseUrl } : {}), pat };
}

/**
 * Resolve the concrete connection parameters for the aura-mcp-dev endpoint:
 * the MCP URL derived from the REST base URL, plus the PAT. Throws
 * actionable errors when either credential is missing (the same shape the
 * shared REST client's credential resolution throws).
 */
export function resolveAuraMcpConnection(credentials: {
  baseUrl?: string;
  pat: string | null;
}): { url: string; pat: string } {
  if (!credentials.baseUrl) {
    throw new Error(
      'Missing `aura.baseUrl` in ~/.pi/agent/settings.json. Add the Aura base URL (e.g. "https://aura.dev-anwalt.de/api") to the `aura` block.',
    );
  }
  if (!credentials.pat) {
    throw new Error(
      'No Aura PAT found in the OS keyring. Run `/aura secrets discover` to store one (service: "aura", name: "pat").',
    );
  }
  return { url: auraMcpEndpointFromBaseUrl(credentials.baseUrl), pat: credentials.pat };
}

/**
 * Build the production caller on pi's MCP client library. Dynamic import:
 * `@earendil-works/pi-mcp` resolves inside the pi process (and in this
 * repo, where it is a transitive install of the peer dependency), the same
 * way the existing `@pi-aura/shared` seams resolve.
 */
export async function createDefaultAuraMcpCaller(credentials: {
  baseUrl?: string;
  pat?: string;
}): Promise<AuraMcpCaller> {
  const resolved = resolveAuraMcpConnection({
    ...(credentials.baseUrl !== undefined ? { baseUrl: credentials.baseUrl } : {}),
    pat: credentials.pat ?? null,
  });
  const piMcp = (await import("@earendil-works/pi-mcp")) as {
    McpClient: new (options: { name: string; version: string }) => {
      connect(transport: unknown): Promise<unknown>;
      callTool(name: string, args?: Record<string, unknown>): Promise<AuraMcpToolResult>;
      listTools(): Promise<AuraMcpLiveTool[]>;
      close(): Promise<void>;
    };
    StreamableHttpTransport: new (options: {
      url: string;
      headers?: Record<string, string>;
    }) => unknown;
  };
  const client = new piMcp.McpClient({ name: "pi-aura", version: "0.8.0" });
  const transport = new piMcp.StreamableHttpTransport({
    url: resolved.url,
    headers: { Authorization: `Bearer ${resolved.pat}` },
  });
  await client.connect(transport);
  return {
    callTool: (tool, args) => client.callTool(tool, args),
    listTools: () => client.listTools(),
    close: () => client.close(),
  };
}

// ---------------------------------------------------------------------------
// The typed interface
// ---------------------------------------------------------------------------

/** The map from typed method to server-side tool name. */
const METHOD_TOOLS = {
  searchTasks: "listTasks",
  getTaskByHumanKey: "getTaskByHumanKey",
  searchArtifacts: "listArtifacts",
  getArtifact: "getArtifact",
  searchKnowledge: "searchKnowledge",
  getKnowledgeTree: "getKnowledgeTree",
  getKnowledgeNode: "getKnowledgeNode",
  getKnowledgeNodeByPath: "getKnowledgeNodeByPath",
  listKnowledgeSpaces: "listKnowledgeSpaces",
  createFeedback: "createFeedback",
} as const;

export type AuraMcpMethodName = keyof typeof METHOD_TOOLS;

/** Notification hook for drift warnings (the extension warning pattern: a
 *  UI notify naming the failure). Defaults to collecting without
 *  surfacing. */
export type AuraMcpNotify = (message: string, type?: "info" | "warning" | "error") => void;

export interface AuraMcpInterface {
  /** Full-text task search with archived visibility, paging, sorting
   *  (server tool `listTasks`). */
  searchTasks(params?: SearchTasksParams): Promise<AuraMcpToolResult>;
  /** Task read by human key, e.g. "AURA-42" (server tool
   *  `getTaskByHumanKey`). */
  getTaskByHumanKey(human_key: string, options?: { response_format?: ResponseFormat }): Promise<AuraMcpToolResult>;
  /** Artifact search (server tool `listArtifacts`). */
  searchArtifacts(params?: SearchArtifactsParams): Promise<AuraMcpToolResult>;
  /** Artifact read by UUID, latest version body included (server tool
   *  `getArtifact`). */
  getArtifact(id: string, options?: { response_format?: Exclude<ResponseFormat, "full"> }): Promise<AuraMcpToolResult>;
  /** Hybrid knowledge search (server tool `searchKnowledge`). */
  searchKnowledge(params: SearchKnowledgeParams): Promise<AuraMcpToolResult>;
  /** The full node tree of a knowledge space (server tool
   *  `getKnowledgeTree`). */
  getKnowledgeTree(slug: string, options?: { depth?: number; max_nodes?: number }): Promise<AuraMcpToolResult>;
  /** Knowledge node read by identifier, body included (server tool
   *  `getKnowledgeNode`). */
  getKnowledgeNode(id: string): Promise<AuraMcpToolResult>;
  /** Knowledge node read by slug path within a space (server tool
   *  `getKnowledgeNodeByPath`). */
  getKnowledgeNodeByPath(slug: string, path: string): Promise<AuraMcpToolResult>;
  /** Knowledge space listing (server tool `listKnowledgeSpaces`). */
  listKnowledgeSpaces(): Promise<AuraMcpToolResult>;
  /** Feedback creation (server tool `createFeedback`). */
  createFeedback(input: CreateFeedbackParams): Promise<AuraMcpToolResult>;
  /** The outcome of the initialization self-check (verdicts, warnings,
   *  unavailable paths). */
  selfCheck(): ContractSelfCheck;
  /** Release the underlying connection (no-op on an injected caller without
   *  a close hook). */
  close(): Promise<void>;
}

export interface CreateAuraMcpInterfaceOptions {
  /** Inject a caller (the test seam). Omit to build the real pi-mcp caller
   *  from settings + keyring. */
  caller?: AuraMcpCaller;
  /** Override the REST base URL the endpoint derives from (test hook;
   *  defaults to the shared settings). */
  baseUrl?: string;
  /** Override the PAT (test hook; defaults to the OS keyring). */
  pat?: string;
  /** Drift-warning sink (the extension warning pattern). Omit to keep
   *  warnings retrievable via {@link AuraMcpInterface.selfCheck} only. */
  notify?: AuraMcpNotify;
}

/**
 * Build the typed aura-mcp interface. On every initialization the wrapper
 * runs the contract self-check against the live tool schemas (see the
 * module comment for the drift policy). Resolves to the interface; rejects
 * when the default construction cannot establish credentials or a
 * connection (consumers catch and degrade to cache-only, their established
 * behavior).
 */
export async function createAuraMcpInterface(
  options: CreateAuraMcpInterfaceOptions = {},
): Promise<AuraMcpInterface> {
  const caller =
    options.caller ??
    (await createDefaultAuraMcpCaller({
      ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
      ...(options.pat !== undefined ? { pat: options.pat } : {}),
    }));

  // Contract self-check: fetch the live tool schemas once per
  // initialization and compare against the shipped definitions. A failing
  // fetch skips the check silently (no verdict, no warning); natural call
  // errors surface to the consumer as always.
  let selfCheck: ContractSelfCheck;
  try {
    selfCheck = runContractSelfCheck(SHIPPED_AURA_MCP_TOOLS, await caller.listTools());
  } catch (error) {
    selfCheck = {
      status: "skipped",
      warnings: [],
      failures: [],
      unavailable: [],
      coreIssues: {},
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (selfCheck.status !== "skipped") {
    for (const warning of selfCheck.warnings) options.notify?.(warning, "warning");
    for (const failure of selfCheck.failures) options.notify?.(failure, "error");
  }
  const unavailable = new Set(selfCheck.unavailable);

  function guardAvailable(tool: string): void {
    if (!unavailable.has(tool)) return;
    throw new AuraMcpToolUnavailableError(tool, selfCheck.coreIssues[tool] ?? []);
  }

  async function call(tool: string, args: Record<string, unknown>): Promise<AuraMcpToolResult> {
    guardAvailable(tool);
    let result: AuraMcpToolResult;
    try {
      result = await caller.callTool(tool, args);
    } catch (error) {
      throw new AuraMcpCallError(tool, error instanceof Error ? error.message : String(error), {
        cause: error,
      });
    }
    if (result.isError) {
      throw new AuraMcpCallError(tool, auraMcpText(result) || "the aura-mcp-dev server reported an error");
    }
    return result;
  }

  /** Copy only the defined keys, so the wire envelope never carries
   *  `undefined` placeholders. */
  function defined<T extends object>(input: T | undefined): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input ?? {})) {
      if (value !== undefined) out[key] = value;
    }
    return out;
  }

  return {
    searchTasks: (params) => call(METHOD_TOOLS.searchTasks, defined(params)),
    getTaskByHumanKey: (human_key, opts) =>
      call(METHOD_TOOLS.getTaskByHumanKey, { human_key, ...defined(opts) }),
    searchArtifacts: (params) => call(METHOD_TOOLS.searchArtifacts, defined(params)),
    getArtifact: (id, opts) => call(METHOD_TOOLS.getArtifact, { id, ...defined(opts) }),
    searchKnowledge: (params) => call(METHOD_TOOLS.searchKnowledge, defined(params)),
    getKnowledgeTree: (slug, opts) => call(METHOD_TOOLS.getKnowledgeTree, { slug, ...defined(opts) }),
    getKnowledgeNode: (id) => call(METHOD_TOOLS.getKnowledgeNode, { id }),
    getKnowledgeNodeByPath: (slug, path) => call(METHOD_TOOLS.getKnowledgeNodeByPath, { slug, path }),
    listKnowledgeSpaces: () => call(METHOD_TOOLS.listKnowledgeSpaces, {}),
    createFeedback: (input) => call(METHOD_TOOLS.createFeedback, defined(input)),

    selfCheck: () => selfCheck,

    close: async () => {
      await caller.close?.();
    },
  };
}

/** The model-facing server name, re-exported for the registration extension
 *  and consumers. */
export { AURA_MCP_SERVER_NAME };
