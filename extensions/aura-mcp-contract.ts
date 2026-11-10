/**
 * The aura-mcp-dev contract the package ships, and its drift comparison.
 *
 * `SHIPPED_AURA_MCP_TOOLS` describes the slice of the live aura-mcp-dev
 * server's surface that the typed wrapper (extensions/aura-mcp-client.ts)
 * sends or reads: the ten tools the mention machinery and the feedback tool
 * use. Every entry is transcribed verbatim from the effort's introspection
 * dump (build 2026-10-12, commit 4aa37833, 120 tools) at
 * docs/tasks/audit-update-aura-instructions/tasks/mcp-inventory-drift/.work/introspection-dump.md.
 * The provenance guard in aura-mcp-contract.test.ts cross-checks this data
 * against that dump, so a refresh of the shipped definitions is validated
 * against the recorded live evidence the same way the first transcription
 * was: refresh the dump by re-auditing the server, re-transcribe, let the
 * guard confirm.
 *
 * `compareShippedTool` compares one shipped contract against the live tool
 * schema the server reports through `listTools()`. It implements the
 * operator's drift policy for this effort:
 *
 * - cosmetic drift (a new optional parameter, a changed description, a
 *   changed default) only warns the user, naming the tool and the
 *   difference;
 * - core drift (the tool gone; a parameter the wrapper sends or reads
 *   renamed, retyped, or newly required) makes the tool's path unavailable:
 *   the wrapper fails calls fast and the warning names what broke.
 *
 * Deliberately not compared: JSON-Schema bounds (@minimum/@maximum/
 * @minLength/@maxLength and friends). The dump records them, but a bound
 * tweak neither renames nor retypes a parameter, and chasing every bound
 * would drown the drift signal the effort exists to close. Type, required,
 * enum membership, default, and description are the compared surface.
 *
 * This module is pure data plus pure functions: no imports, no I/O, so the
 * comparison is unit-testable without any MCP connection (tests construct
 * live-shaped fixtures by hand).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The JSON-Schema-compatible primitive type of a parameter the wrapper
 *  sends. `number` covers both `number` and `integer` on the wire. */
export type ShippedParamType = "string" | "number" | "boolean";

/** One parameter the wrapper sends or reads, transcribed from the dump. */
export interface ShippedToolParam {
  type: ShippedParamType;
  /** Whether the wrapper must always send it (matches the live schema's
   *  `required` array at transcription time). */
  required: boolean;
  /** Verbatim parameter description from the dump's declaration comments. */
  description: string;
  /** Closed value set when the parameter is an enum on the wire. */
  enum?: readonly string[];
  /** Schema default when the dump records one. */
  default?: unknown;
}

/** One shipped tool contract: the tool's live name (without pi's
 *  `mcp__aura_mcp_dev__` prefix), its verbatim description block, and the
 *  parameters the wrapper sends or reads. */
export interface ShippedToolContract {
  name: string;
  description: string;
  params: Record<string, ShippedToolParam>;
}

/** A live tool as the server reports it through `listTools()` (the MCP
 *  `Tool` shape, structurally typed so no module needs a static pi-mcp
 *  import). */
export interface AuraMcpLiveTool {
  name: string;
  description?: string;
  title?: string;
  inputSchema: Record<string, unknown>;
}

/** The comparison verdict for one tool. `issues` are human-readable
 *  fragments, each naming the parameter and the difference; a `core`
 *  verdict disables the tool's path in the wrapper. */
export interface ToolContractVerdict {
  verdict: "ok" | "cosmetic" | "core";
  issues: string[];
}

/** The aggregate result of one self-check run over the shipped contracts. */
export interface ContractSelfCheck {
  /** `ok`: everything matches; `cosmetic`: warnings only; `core`: at least
   *  one tool path is unavailable; `skipped`: the live fetch failed (no
   *  verdict can be made, and nothing is warned). */
  status: "ok" | "cosmetic" | "core" | "skipped";
  /** User-visible cosmetic warnings, each naming the tool and the
   *  difference. Empty when `skipped`. */
  warnings: string[];
  /** User-visible core-drift failures, each naming the tool and what
   *  broke. Empty when `skipped`. */
  failures: string[];
  /** Tool names whose path is unavailable (the `core` set). Empty when
   *  `skipped`. */
  unavailable: string[];
  /** Why the check was skipped (the underlying fetch error message). */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Server identity
// ---------------------------------------------------------------------------

/** The model-facing server name the package registers with pi. pi exposes
 *  its tools as `mcp__aura_mcp_dev__<tool>` (`-` becomes `_` in the
 *  namespace). */
export const AURA_MCP_SERVER_NAME = "aura-mcp-dev";

/**
 * Derive the aura-mcp-dev endpoint from the shared settings' REST base URL.
 * The settings store the REST base (`https://<host>/api`); the MCP server
 * lives at `https://<host>/mcp` on the same instance.
 */
export function auraMcpEndpointFromBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const withoutApi = trimmed.replace(/\/api$/, "");
  return `${withoutApi}/mcp`;
}

/**
 * Run the contract self-check: compare every shipped contract against the
 * live tool list and aggregate the verdicts into user-visible strings. Each
 * warning and failure names the tool and the difference; the `unavailable`
 * set is exactly the core-drifted tools whose path the wrapper fails fast.
 */
export function runContractSelfCheck(
  shipped: readonly ShippedToolContract[],
  liveTools: readonly AuraMcpLiveTool[],
): ContractSelfCheck {
  const warnings: string[] = [];
  const failures: string[] = [];
  const unavailable: string[] = [];
  const liveByName = new Map(liveTools.map((tool) => [tool.name, tool]));
  for (const contract of shipped) {
    const live = liveByName.get(contract.name);
    if (live === undefined) {
      failures.push(
        `aura-mcp-dev tool "${contract.name}" is gone from the live server; its path is unavailable`,
      );
      unavailable.push(contract.name);
      continue;
    }
    const verdict = compareShippedTool(contract, live);
    if (verdict.verdict === "ok") continue;
    const differences = verdict.issues.join("; ");
    if (verdict.verdict === "core") {
      failures.push(
        `aura-mcp-dev tool "${contract.name}" drifted from the shipped contract (core): ${differences}. Its path is unavailable; callers degrade to cached data.`,
      );
      unavailable.push(contract.name);
    } else {
      warnings.push(`aura-mcp-dev tool "${contract.name}" drifted from the shipped contract (cosmetic): ${differences}`);
    }
  }
  return {
    status: unavailable.length > 0 ? "core" : warnings.length > 0 ? "cosmetic" : "ok",
    warnings,
    failures,
    unavailable,
  };
}

// ---------------------------------------------------------------------------
// Shipped tool contracts (transcribed from the introspection dump)
// ---------------------------------------------------------------------------

export const SHIPPED_AURA_MCP_TOOLS: readonly ShippedToolContract[] = [
  {
    name: "listTasks",
    description: [
      "Tasks: List (paginated)",
      "",
      "Returns paginated tasks the caller can see (membership, inherited access, and access grants). There is no default status filter; archived tasks are hidden unless archived=all or archived=true. related_task_id is member-scoped only and then applies status_slug, status_type, type, archived, and deadline.",
    ].join("\n"),
    params: {
      q: {
        type: "string",
        required: false,
        description: "Search query (full-text filter across relevant fields)",
      },
      archived: {
        type: "string",
        required: false,
        description:
          "Archived visibility (orthogonal to status): false (default) hides archived, true only archived, all both",
        enum: ["false", "true", "all"],
      },
      limit: {
        type: "number",
        required: false,
        description: "Number of items per page",
        default: 20,
      },
      page: {
        type: "number",
        required: false,
        description: "Page number (1-based)",
        default: 1,
      },
      sort_by: {
        type: "string",
        required: false,
        description: "Field to sort by",
        enum: ["created_at", "updated_at", "title", "urgent_deadline"],
        default: "updated_at",
      },
      sort_dir: {
        type: "string",
        required: false,
        description: "Sort direction",
        enum: ["asc", "desc"],
        default: "desc",
      },
    },
  },
  {
    name: "getTaskByHumanKey",
    description: [
      "Tasks: Get by human-readable key",
      "",
      'Resolves a task via its human-readable identifier (e.g. "AURA-42", ANW-7570). 404 when the key is unknown or malformed; 403 (ANW-7662) when the task exists but the caller lacks access — naming the owner in `meta`. Returns the same payload as GET /tasks/{id} so opening a task by key costs a single request (ANW-7848).',
    ].join("\n"),
    params: {
      human_key: {
        type: "string",
        required: true,
        description: 'Human-readable task key (e.g. "AURA-42").',
      },
      response_format: {
        type: "string",
        required: false,
        description:
          "compact (default) returns identity fields; detail is the working view (description, members, ancestors, allowed next statuses); full returns every field except classified exclusions. MCP-only — not part of the HTTP API.",
        enum: ["compact", "detail", "full"],
        default: "compact",
      },
    },
  },
  {
    name: "listArtifacts",
    description: [
      "Artifacts: List all (paginated)",
      "",
      "Returns paginated artifacts owned by or shared with the authenticated user.",
    ].join("\n"),
    params: {
      q: {
        type: "string",
        required: false,
        description: "Free-text search over the artifact title.",
      },
      limit: {
        type: "number",
        required: false,
        description: "Page size.",
        default: 20,
      },
      page: {
        type: "number",
        required: false,
        description: "1-based page number.",
        default: 1,
      },
      sort_by: {
        type: "string",
        required: false,
        description: "Field to sort by.",
        enum: ["created_at", "updated_at", "title"],
        default: "updated_at",
      },
      sort_dir: {
        type: "string",
        required: false,
        description: "Sort direction.",
        enum: ["asc", "desc"],
        default: "desc",
      },
    },
  },
  {
    name: "getArtifact",
    description: [
      "Artifacts: Get detail",
      "",
      "Returns the detail of an artifact including its latest version body. 404 when the artifact does not exist (or is inactive/deleted); 403 (ANW-7662) when it exists but the caller lacks access — naming the owner in `meta`.",
    ].join("\n"),
    params: {
      id: {
        type: "string",
        required: true,
        description: "UUID of the artifact to read.",
      },
      response_format: {
        type: "string",
        required: false,
        description:
          "compact (default) returns identity and status fields; detail is the working view. MCP-only — not part of the HTTP API.",
        enum: ["compact", "detail"],
        default: "compact",
      },
    },
  },
  {
    name: "searchKnowledge",
    description: [
      "Search wiki, repository and skill knowledge spaces",
      "",
      "Hybrid search over knowledge pages — literal (German full-text plus a trigram fallback for compound words) and semantic, merged into one ranked list via reciprocal rank fusion. Restricted to the caller's readable spaces.",
    ].join("\n"),
    params: {
      query: {
        type: "string",
        required: true,
        description:
          "Search text. Matched literally against page titles and bodies (German full-text search, weighted higher on the title) plus a trigram fallback that also finds the term as part of a German compound word (e.g. \"Konvention\" inside \"Namenskonventionen\"), and — from 3 characters — matched semantically as well, so a paraphrase with no shared words can still find the thematically relevant page. Results from both ways are merged into one ranked list; each item reports whether it was found literally, semantically, or both.",
      },
      limit: {
        type: "number",
        required: false,
        description: "Maximum number of matching pages to return, ordered by relevance.",
        default: 20,
      },
      space_slug: {
        type: "string",
        required: false,
        description:
          "Restrict the search to one knowledge space, identified by its slug. Omit to search every space the caller may read.",
      },
    },
  },
  {
    name: "getKnowledgeTree",
    description: [
      "Get the full node tree for a space",
      "",
      "Returns the complete tree of folders and documents (body omitted — load via GET /knowledge/nodes/{id}). The optional `depth` and `max_nodes` bound the answer; omitted, the whole tree comes back.",
    ].join("\n"),
    params: {
      slug: {
        type: "string",
        required: true,
        description: "Slug of the knowledge space whose node tree to load.",
      },
      depth: {
        type: "number",
        required: false,
        description:
          "Maximum tree depth below the roots. Omitted returns the whole tree; the MCP tool asks for 2 (AURA-1390 / D8).",
      },
      max_nodes: {
        type: "number",
        required: false,
        description:
          "Maximum number of nodes in the answer. Omitted returns all of them; the MCP tool asks for 200 (AURA-1390 / D8).",
      },
    },
  },
  {
    name: "getKnowledgeNode",
    description: "Get a single node (includes body for documents)",
    params: {
      id: {
        type: "string",
        required: true,
        description: "UUID of the knowledge node to read.",
      },
    },
  },
  {
    name: "getKnowledgeNodeByPath",
    description: [
      "Get a knowledge node by its slug path within a space",
      "",
      "Resolves a document node by traversing the slug hierarchy. Returns the full node including body, suitable for rendering the document view.",
    ].join("\n"),
    params: {
      path: {
        type: "string",
        required: true,
        description: "Slash-separated path within the space, or a single node UUID.",
      },
      slug: {
        type: "string",
        required: true,
        description: "Slug of the knowledge space to resolve the path in.",
      },
    },
  },
  {
    name: "listKnowledgeSpaces",
    description: [
      "List knowledge spaces",
      "",
      "Returns all knowledge spaces (topics). Accessible to all authenticated users.",
    ].join("\n"),
    params: {},
  },
  {
    name: "createFeedback",
    description: [
      "Feedback: Create",
      "",
      "Submits a feedback entry. Requires SUBMIT_FEEDBACK. Anonymous submissions store no author.",
    ].join("\n"),
    params: {
      title: {
        type: "string",
        required: true,
        description: "Short title of the feedback, at most 120 characters.",
      },
      body: {
        type: "string",
        required: true,
        description: "The feedback text itself. At least 50 characters so the report is usable.",
      },
      is_anonymous: {
        type: "boolean",
        required: false,
        description: "When true, the entry is stored without an author even though the actor is known.",
      },
      notify_author: {
        type: "boolean",
        required: false,
        description:
          "Whether to notify the author when a linked task is done. Forced false for anonymous entries.",
      },
      source: {
        type: "string",
        required: false,
        description: "How the entry arrived: UI, AGENT (chat card), or MCP.",
        enum: ["UI", "AGENT", "MCP"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Drift comparison
// ---------------------------------------------------------------------------

/** Collapse all whitespace runs so a formatting-only difference cannot look
 *  like drift. */
function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The live tool's description as one comparable string. describeTool (the
 *  dump) renders `title` and `description` as consecutive paragraphs while
 *  `listTools()` reports them as separate fields, so the shipped block may
 *  legitimately equal the title, the description, or their join. */
function liveDescriptionOf(live: AuraMcpLiveTool): string {
  return [live.title, live.description].filter((part) => typeof part === "string" && part.length > 0).join("\n");
}

function describeDefault(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/** Whether the live schema's type is compatible with the shipped type.
 *  `number` accepts both `number` and `integer` (the dump's `@integer`
 *  markers surface as `integer` in the live schema). */
function typeCompatible(shipped: ShippedParamType, liveType: unknown): boolean {
  const types = Array.isArray(liveType) ? liveType : [liveType];
  if (types.includes(shipped)) return true;
  if (shipped === "number") return types.includes("integer");
  return false;
}

function isLiveRequired(live: AuraMcpLiveTool, param: string): boolean {
  const required = (live.inputSchema as { required?: unknown }).required;
  return Array.isArray(required) && required.includes(param);
}

function liveProperty(live: AuraMcpLiveTool, param: string): Record<string, unknown> | undefined {
  const properties = (live.inputSchema as { properties?: Record<string, unknown> }).properties;
  const property = properties?.[param];
  return property !== null && typeof property === "object" ? (property as Record<string, unknown>) : undefined;
}

/**
 * Compare one shipped contract against the live tool schema. Returns the
 * verdict plus issue fragments (each naming the parameter and the
 * difference); the verdict is `core` when any core issue is present,
 * `cosmetic` when only cosmetic ones are, `ok` otherwise.
 */
export function compareShippedTool(shipped: ShippedToolContract, live: AuraMcpLiveTool): ToolContractVerdict {
  const core: string[] = [];
  const cosmetic: string[] = [];

  // Tool-level description drift (cosmetic). The title/description split
  // leniency lives in liveDescriptionOf.
  const shippedDescription = normalizeText(shipped.description);
  const liveDescription = normalizeText(liveDescriptionOf(live));
  if (shippedDescription !== "" && liveDescription !== "" && shippedDescription !== liveDescription) {
    cosmetic.push("tool description changed");
  }

  // Parameters the wrapper sends or reads: gone, retyped, newly required,
  // description or default changed.
  for (const [name, param] of Object.entries(shipped.params)) {
    const property = liveProperty(live, name);
    if (property === undefined) {
      core.push(`parameter "${name}" is gone from the live schema (renamed or removed)`);
      continue;
    }
    if (!typeCompatible(param.type, property.type)) {
      core.push(`parameter "${name}" changed type from ${param.type} to ${String(property.type)} (retyped)`);
    }
    const liveRequired = isLiveRequired(live, name);
    if (liveRequired && !param.required) {
      core.push(`parameter "${name}" is newly required`);
    }
    const shippedEnum = param.enum;
    const liveEnum = Array.isArray(property.enum) ? (property.enum as unknown[]).map(String) : undefined;
    if (shippedEnum !== undefined && liveEnum !== undefined) {
      const dropped = shippedEnum.filter((value) => !liveEnum.includes(value));
      if (dropped.length > 0) {
        core.push(`parameter "${name}" no longer allows ${dropped.map((v) => JSON.stringify(v)).join(", ")} (retyped)`);
      }
    } else if (shippedEnum === undefined && liveEnum !== undefined) {
      cosmetic.push(`parameter "${name}" now restricts values to ${liveEnum.map((v) => JSON.stringify(v)).join(", ")}`);
    }
    if (
      typeof property.description === "string" &&
      normalizeText(property.description) !== normalizeText(param.description)
    ) {
      cosmetic.push(`description of parameter "${name}" changed`);
    }
    if ("default" in property) {
      if (param.default === undefined) {
        cosmetic.push(`parameter "${name}" gained default ${describeDefault(property.default)}`);
      } else if (JSON.stringify(property.default) !== JSON.stringify(param.default)) {
        cosmetic.push(
          `default of parameter "${name}" changed from ${describeDefault(param.default)} to ${describeDefault(property.default)}`,
        );
      }
    }
  }

  // Parameters the live server reports that the wrapper does not send: a
  // new required one breaks every call (core), a new optional one is
  // cosmetic.
  const properties = (live.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  for (const name of Object.keys(properties)) {
    if (shipped.params[name] !== undefined) continue;
    if (isLiveRequired(live, name)) {
      core.push(`parameter "${name}" is new and required (the wrapper does not send it)`);
    } else {
      cosmetic.push(`new optional parameter "${name}"`);
    }
  }

  if (core.length > 0) return { verdict: "core", issues: [...core, ...cosmetic] };
  if (cosmetic.length > 0) return { verdict: "cosmetic", issues: cosmetic };
  return { verdict: "ok", issues: [] };
}
