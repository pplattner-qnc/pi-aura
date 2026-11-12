/**
 * Logic tests for the aura-mcp contract module.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-mcp-contract.test.ts
 *
 * Covers the pure surface only: the shipped tool contracts (the ten tools
 * the typed wrapper covers, derived from the effort's introspection dump),
 * the drift comparison verdicts (cosmetic vs core, each naming the tool and
 * the difference), and the endpoint derivation. The live fetch and the
 * wrapper wiring are covered in aura-mcp-client.test.ts against fakes; the
 * introspection dump itself is the independent evidence source for the
 * provenance guard.
 */

import assert from "node:assert/strict";
import {
  AURA_MCP_SERVER_NAME,
  SHIPPED_AURA_MCP_TOOLS,
  auraMcpEndpointFromBaseUrl,
  compareShippedTool,
  runContractSelfCheck,
  type ShippedToolContract,
} from "./aura-mcp-contract.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A live tool as pi-mcp's listTools() reports it (MCP Tool shape). */
function liveTool(
  name: string,
  params: Record<string, { type: string; description?: string; enum?: string[]; default?: unknown }>,
  options: { required?: string[]; description?: string; title?: string } = {},
): {
  name: string;
  description?: string;
  title?: string;
  inputSchema: Record<string, unknown>;
} {
  const properties: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(params)) {
    const property: Record<string, unknown> = { type: param.type };
    if (param.description !== undefined) property.description = param.description;
    if (param.enum !== undefined) property.enum = param.enum;
    if (param.default !== undefined) property.default = param.default;
    properties[key] = property;
  }
  const schema: Record<string, unknown> = { type: "object", properties };
  if (options.required) schema.required = options.required;
  return {
    name,
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.title !== undefined ? { title: options.title } : {}),
    inputSchema: schema,
  };
}

/** The shipped contract for `listTasks` at full schema scope (all twenty
 *  parameters the server reports, not just the six the wrapper sends),
 *  used as the known-good fixture for the comparison tests. The expected
 *  values here are hand-copied from the fresh introspection record, NOT
 *  re-derived from the shipped module (the provenance guard at the bottom
 *  cross-checks the shipped data against the record independently). */
const SHIPPED_LIST_TASKS: ShippedToolContract = {
  name: "listTasks",
  description:
    "Returns paginated tasks the caller can see (membership, inherited access, and access grants). " +
    "There is no default status filter; archived tasks are hidden unless archived=all or archived=true. " +
    "related_task_id is member-scoped only and then applies status_slug, status_type, type, archived, and deadline.",
  params: {
    archived: {
      type: "string",
      required: false,
      description:
        "Archived visibility (orthogonal to status): false (default) hides archived, true only archived, all both",
      enum: ["false", "true", "all"],
    },
    deadline: {
      type: "string",
      required: false,
      description:
        'Keep tasks by their stored urgent deadline: "overdue" (before today), "soon" (today through two workdays), or an integer N in calendar days (deadline on or before today+N; negative N means at least that many days overdue). Always excludes archived and terminal tasks. Omit to keep every deadline.',
    },
    level: {
      type: "string",
      required: false,
      description:
        "Filter by hierarchy level (SAGA, EPIC, STORY, SUBTASK). The literal none keeps only tasks with no level assigned.",
      enum: ["SAGA", "EPIC", "STORY", "SUBTASK", "none"],
    },
    limit: { type: "number", required: false, description: "Number of items per page", default: 20 },
    page: { type: "number", required: false, description: "Page number (1-based)", default: 1 },
    parent_eligible: {
      type: "string",
      required: false,
      description:
        "When true, return only tasks that can act as a parent (have a level assigned and are not SUBTASK). Useful for parent-picker search in the create form.",
      enum: ["true", "false"],
    },
    parent_eligible_for_level: {
      type: "string",
      required: false,
      description:
        "Level-dependent successor of parent_eligible (AURA-1226): keep only tasks whose level may act as parent for a task at this target level — SUBTASK yields STORY only, STORY yields EPIC/SAGA, EPIC yields SAGA only, SAGA yields no candidates at all. Takes precedence over parent_eligible when both are given. Used by the guided level-change dialog's candidate list.",
      enum: ["SAGA", "EPIC", "STORY", "SUBTASK"],
    },
    parent_task_id: {
      type: "string",
      required: false,
      description: "Return only direct children of the task with this UUID (member-scoped, other filters apply)",
    },
    q: { type: "string", required: false, description: "Search query (full-text filter across relevant fields)" },
    related_task_id: {
      type: "string",
      required: false,
      description: "Return tasks that are 1-hop neighbours of the task with this UUID (member-scoped)",
    },
    relation_type: {
      type: "string",
      required: false,
      description: "Restrict the related_task_id query to a specific relation type",
      enum: ["RELATES_TO", "PART_OF", "BLOCKS", "DUPLICATES"],
    },
    role: {
      type: "string",
      required: false,
      description:
        "A TaskRole enum value — returns only tasks where the current user is a member with this role. Takes precedence over view when both are set.",
      enum: ["OWNER", "CONTRIBUTOR", "STAKEHOLDER"],
    },
    sort_by: {
      type: "string",
      required: false,
      description: "Field to sort by",
      enum: ["created_at", "updated_at", "title", "urgent_deadline"],
      default: "updated_at",
    },
    sort_dir: { type: "string", required: false, description: "Sort direction", enum: ["asc", "desc"], default: "desc" },
    status_slug: {
      type: "string",
      required: false,
      description: 'Comma-separated TaskStatus values to filter by (e.g. "OPEN,IN_DEVELOPMENT")',
    },
    status_type: {
      type: "string",
      required: false,
      description:
        'Filter by status activity class, not by progress. Comma-separated; values: OPEN, WAITING, ACTIVE, TERMINAL. Note that OPEN is the single status OPEN (nobody has picked the task up yet) — it is not a synonym for "not finished"; for everything that is not finished, pass OPEN,WAITING,ACTIVE. A progress-based cut ("not deployed yet") cannot be expressed here, because the four classes cut across the status series — use status_slug with an explicit list of statuses for that. There is no value named "open": if a user asks for "the open tasks", ask which of the two readings they mean instead of guessing.',
    },
    tag_match: {
      type: "string",
      required: false,
      description: "Whether all (AND) or any (OR) of the given tag slugs must match (default all)",
      enum: ["all", "any"],
      default: "all",
    },
    tags: {
      type: "string",
      required: false,
      description: "Comma-separated tag slugs to filter by",
    },
    type: {
      type: "string",
      required: false,
      description: "Comma-separated task types (FEATURE, BUG, IDEA, CHORE, DISCOVERY). Multiple values are OR.",
    },
    view: {
      type: "string",
      required: false,
      description:
        "Tab filter: all member tasks (default), tasks where the user has no role (no_role), or tasks created by the current user (mine)",
      enum: ["all", "no_role", "mine"],
      default: "all",
    },
  },
};

/** The full live shape the server would report for the fixture (integer
 *  types on the wire, the title/description split, every parameter).
 *  Built by the same transformation the client tests use, so the
 *  comparison tests exercise the full-schema contract the way the
 *  fake-caller tests do. */
function fullListTasksLive(): ReturnType<typeof liveTool> {
  const lines = SHIPPED_LIST_TASKS.description.split("\n");
  const properties: Record<string, unknown> = {};
  for (const [name, param] of Object.entries(SHIPPED_LIST_TASKS.params)) {
    properties[name] = {
      type: param.type === "number" ? "integer" : param.type,
      description: param.description,
      ...(param.enum !== undefined ? { enum: [...param.enum] } : {}),
      ...(param.default !== undefined ? { default: param.default } : {}),
    };
  }
  return {
    name: "listTasks",
    title: lines[0],
    description: lines.slice(1).join("\n").replace(/^\n+/, ""),
    inputSchema: { type: "object", properties },
  };
}

// ---------------------------------------------------------------------------
// The ten shipped tools
// ---------------------------------------------------------------------------

{
  const names = SHIPPED_AURA_MCP_TOOLS.map((tool) => tool.name);
  assert.deepEqual(
    names.sort(),
    [
      "createFeedback",
      "getArtifact",
      "getKnowledgeNode",
      "getKnowledgeNodeByPath",
      "getKnowledgeTree",
      "getTaskByHumanKey",
      "listArtifacts",
      "listKnowledgeSpaces",
      "listTasks",
      "searchKnowledge",
    ].sort(),
    "the shipped contracts cover exactly the ten tools the wrapper exposes",
  );
  assert.equal(AURA_MCP_SERVER_NAME, "aura-mcp-dev");
  console.log("shipped tools: ok");
}

// ---------------------------------------------------------------------------
// compareShippedTool: no drift
// ---------------------------------------------------------------------------

{
  // The full live shape (all twenty parameters, integer types on the wire,
  // the title/description split) matches the full-schema contract exactly.
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, fullListTasksLive());
  assert.equal(verdict.verdict, "ok", `expected no drift, got: ${JSON.stringify(verdict)}`);
  assert.equal(verdict.issues.length, 0, "a clean comparison reports no issues");
  console.log("compareShippedTool no-drift (full schema): ok");
}

// ---------------------------------------------------------------------------
// compareShippedTool: cosmetic drift
// ---------------------------------------------------------------------------

{
  // A new optional parameter on the live server is cosmetic. The name must
  // be one the full-schema contract does not carry (status_type and
  // friends are shipped since the full-scope refresh).
  const live = fullListTasksLive();
  (live.inputSchema as { properties: Record<string, unknown> }).properties.brand_new_filter = {
    type: "string",
    description: "brand new optional filter",
  };
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "cosmetic", `expected cosmetic, got: ${JSON.stringify(verdict)}`);
  assert.ok(
    verdict.issues.join("; ").includes("brand_new_filter"),
    "the cosmetic warning names the new parameter",
  );
  console.log("compareShippedTool new optional parameter: ok");
}

{
  // A changed tool description is cosmetic.
  const live = fullListTasksLive();
  live.description = "Returns paginated tasks the caller can see, but the wording moved on";
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "cosmetic");
  assert.ok(
    verdict.issues.join("; ").includes("description"),
    "the cosmetic warning names the changed description",
  );
  console.log("compareShippedTool changed description: ok");
}

{
  // A changed default on a shipped parameter is cosmetic.
  const live = fullListTasksLive();
  (live.inputSchema as { properties: Record<string, unknown> }).properties.limit = {
    type: "integer",
    description: SHIPPED_LIST_TASKS.params.limit.description,
    default: 50,
  };
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "cosmetic");
  assert.ok(
    verdict.issues.join("; ").includes("limit") && verdict.issues.join("; ").includes("default"),
    "the cosmetic warning names the changed default",
  );
  console.log("compareShippedTool changed default: ok");
}

// ---------------------------------------------------------------------------
// compareShippedTool: core drift
// ---------------------------------------------------------------------------

{
  // A parameter the wrapper sends that the live schema no longer has is
  // core drift (renamed or removed), even though the full-schema contract
  // carries seventeen parameters the live shape still reports.
  const live = fullListTasksLive();
  const schema = live.inputSchema as { properties: Record<string, unknown> };
  delete schema.properties.q;
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "core");
  assert.ok(
    verdict.issues.join("; ").includes('"q"') && verdict.issues.join("; ").includes("renamed"),
    `the core failure names the renamed parameter, got: ${JSON.stringify(verdict)}`,
  );
  console.log("compareShippedTool renamed parameter: ok");
}

{
  // A retyped parameter (string -> number) is core drift.
  const live = fullListTasksLive();
  (live.inputSchema as { properties: Record<string, unknown> }).properties.q = { type: "number" };
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "core");
  assert.ok(verdict.issues.join("; ").includes('"q"') && verdict.issues.join("; ").includes("retyped"));
  console.log("compareShippedTool retyped parameter: ok");
}

{
  // An enum that drops values the wrapper sends is core drift (retyped).
  const live = fullListTasksLive();
  (live.inputSchema as { properties: Record<string, unknown> }).properties.archived = {
    type: "string",
    enum: ["false", "true"],
    description: SHIPPED_LIST_TASKS.params.archived.description,
  };
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "core");
  assert.ok(
    verdict.issues.join("; ").includes('"archived"') && verdict.issues.join("; ").includes('"all"'),
    `the core failure names the narrowed enum, got: ${JSON.stringify(verdict)}`,
  );
  console.log("compareShippedTool narrowed enum: ok");
}

{
  // A shipped-optional parameter that becomes required is core drift.
  const live = fullListTasksLive();
  (live.inputSchema as { required?: string[] }).required = ["q"];
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "core");
  assert.ok(verdict.issues.join("; ").includes('"q"') && verdict.issues.join("; ").includes("newly required"));
  console.log("compareShippedTool newly required parameter: ok");
}

{
  // A brand-new required parameter the wrapper does not send is core drift
  // (every call would fail validation).
  const live = fullListTasksLive();
  const schema = live.inputSchema as { properties: Record<string, unknown>; required?: string[] };
  schema.properties.project_slug = { type: "string", description: "new mandatory scope" };
  schema.required = ["project_slug"];
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "core");
  assert.ok(
    verdict.issues.join("; ").includes('"project_slug"') && verdict.issues.join("; ").includes("required"),
    `the core failure names the new required parameter, got: ${JSON.stringify(verdict)}`,
  );
  console.log("compareShippedTool new required parameter: ok");
}

{
  // The enum-lenient comparison: a shipped string param whose live schema
  // widened to more values is not drift at all (a pure relaxation; the
  // wrapper's sends stay valid and neither enumerated drift class fires).
  const live = fullListTasksLive();
  (live.inputSchema as { properties: Record<string, unknown> }).properties.archived = {
    type: "string",
    enum: ["false", "true", "all", "only-mine"],
    description: SHIPPED_LIST_TASKS.params.archived.description,
  };
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "ok", `enum widening must not read as drift, got: ${JSON.stringify(verdict)}`);
  console.log("compareShippedTool widened enum is not drift: ok");
}

// ---------------------------------------------------------------------------
// runContractSelfCheck: aggregation
// ---------------------------------------------------------------------------

{
  // One clean live list yields status ok with no warnings and no
  // unavailable paths.
  const clean = liveTool("listTasks", {
    q: { type: "string", description: SHIPPED_LIST_TASKS.params.q.description },
    archived: { type: "string", enum: ["false", "true", "all"], description: SHIPPED_LIST_TASKS.params.archived.description },
    limit: { type: "integer", default: 20, description: SHIPPED_LIST_TASKS.params.limit.description },
    page: { type: "integer", default: 1, description: SHIPPED_LIST_TASKS.params.page.description },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at", description: SHIPPED_LIST_TASKS.params.sort_by.description },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc", description: SHIPPED_LIST_TASKS.params.sort_dir.description },
  }, { title: "Tasks: List (paginated)", description: SHIPPED_LIST_TASKS.description.replace(/^Tasks: List \(paginated\)\n\n/, "") });
  const check = runContractSelfCheck(SHIPPED_AURA_MCP_TOOLS, [clean]);
  assert.equal(check.status, "core"); // the other nine tools are gone from this live list
  assert.ok(check.failures.join("\n").includes("getTaskByHumanKey"), "a missing tool is named as a core failure");
  assert.ok(check.unavailable.includes("getTaskByHumanKey"), "missing tools are unavailable paths");
  console.log("runContractSelfCheck missing tool: ok");
}

{
  // The title/description leniency: a shipped block that starts with the
  // tool title matches a live tool that reports title and description as
  // separate fields.
  const shipped: ShippedToolContract = {
    name: "listKnowledgeSpaces",
    description: ["List knowledge spaces", "", "Returns all knowledge spaces (topics). Accessible to all authenticated users."].join("\n"),
    params: {},
  };
  const live = liveTool("listKnowledgeSpaces", {}, {
    title: "List knowledge spaces",
    description: "Returns all knowledge spaces (topics). Accessible to all authenticated users.",
  });
  const verdict = compareShippedTool(shipped, live);
  assert.equal(verdict.verdict, "ok", `title/description split must not read as drift, got: ${JSON.stringify(verdict)}`);
  console.log("compareShippedTool title/description leniency: ok");
}

{
  // Whitespace-only formatting differences are not drift.
  const shipped: ShippedToolContract = {
    name: "listKnowledgeSpaces",
    description: "List knowledge spaces\nReturns  all knowledge spaces (topics). Accessible to all authenticated users.",
    params: {},
  };
  const live = liveTool("listKnowledgeSpaces", {}, {
    description: "List knowledge spaces\n\nReturns all knowledge spaces (topics). Accessible to\nall authenticated users.",
  });
  const verdict = compareShippedTool(shipped, live);
  assert.equal(verdict.verdict, "ok", `whitespace-only differences must not read as drift, got: ${JSON.stringify(verdict)}`);
  console.log("compareShippedTool whitespace leniency: ok");
}

// ---------------------------------------------------------------------------
// Endpoint derivation
// ---------------------------------------------------------------------------

{
  assert.equal(auraMcpEndpointFromBaseUrl("https://aura.dev-anwalt.de/api"), "https://aura.dev-anwalt.de/mcp");
  assert.equal(auraMcpEndpointFromBaseUrl("https://aura.dev-anwalt.de/api/"), "https://aura.dev-anwalt.de/mcp");
  assert.equal(auraMcpEndpointFromBaseUrl("https://aura.example.com"), "https://aura.example.com/mcp");
  assert.equal(auraMcpEndpointFromBaseUrl("https://aura.example.com/"), "https://aura.example.com/mcp");
  console.log("auraMcpEndpointFromBaseUrl: ok");
}

// ---------------------------------------------------------------------------
// Provenance guard: shipped data vs the fresh introspection record
// ---------------------------------------------------------------------------

{
  // The shipped contracts claim to be transcribed verbatim, at full schema
  // scope, from the effort's fresh introspection record (build d3886f06,
  // 2026-11-09 14:59:59, 120 tools). This guard makes the claim true or
  // fails the suite, in BOTH directions: every shipped parameter must
  // exist in the record with the same requiredness, type, enum values,
  // default, and normalized description, and every parameter the record
  // holds for a covered tool must exist in the shipped contract. The
  // record is the independent evidence source (captured live from the
  // server through the package's own access path, with the raw payload and
  // its round-trip verification beside it in the same .work directory);
  // the shipped module is the derived artifact, so agreement here is not a
  // tautology. When the package re-audits the server, capture a fresh
  // record first (the ticket's .work capture script), then re-transcribe,
  // and this guard validates the refresh. Full scope is the operator's
  // ruling: a cosmetic warning must mean the server actually changed since
  // the audit, which only holds when the shipped contract carries every
  // server-side parameter, not just the slice the wrapper sends.
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const repoRoot = join(import.meta.dirname, "..");
  const dumpPath = join(
    repoRoot,
    "docs",
    "tasks",
    "archive",
    "audit-update-aura-instructions",
    "tickets",
    "contract-refresh-d3886f06",
    ".work",
    "introspection-dump-d3886f06.md",
  );
  const dump = readFileSync(dumpPath, "utf-8");

  // Parse the record: per-tool sections headed by
  // `### mcp__aura_mcp_dev__<tool>`, each carrying a description block and
  // one fenced ```ts codemode declaration with the parameter list. Marker
  // lines (@integer/@minimum/.../@default) carry the schema facets; only
  // @default is part of the compared surface, and it may share its line
  // with the other facets.
  interface DumpParam {
    required: boolean;
    type: string;
    enum?: string[];
    description: string;
    default?: unknown;
    hasDefault: boolean;
  }
  const dumpTools = new Map<string, { descriptionBlock: string; params: Map<string, DumpParam> }>();
  const sectionRe = /^### mcp__aura_mcp_dev__(\w+)\s*$/gm;
  let match: RegExpExecArray | null;
  const sectionStarts: Array<{ name: string; start: number; end: number }> = [];
  while ((match = sectionRe.exec(dump)) !== null) {
    sectionStarts.push({ name: match[1], start: match.index, end: dump.length });
  }
  for (let i = 0; i < sectionStarts.length; i++) {
    sectionStarts[i].end = i + 1 < sectionStarts.length ? sectionStarts[i + 1].start : dump.length;
  }
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  for (const section of sectionStarts) {
    const body = dump.slice(section.start, section.end);
    const fenceStart = body.indexOf("```ts");
    const headingEnd = body.indexOf("\n");
    const blockEnd = body.indexOf("codemode tool declaration:");
    const descriptionBlock = normalize(body.slice(headingEnd + 1, blockEnd === -1 ? fenceStart : blockEnd));
    const params = new Map<string, DumpParam>();
    if (fenceStart !== -1) {
      const argsStart = body.indexOf("args: {", fenceStart);
      const argsEnd = body.indexOf("}): Promise<", argsStart);
      // Slice past the "args: {" opener so the empty-schema index signature
      // ("[key: string]: unknown;") parses as no parameter.
      const argsBody = body.slice(argsStart + "args: {".length, argsEnd);
      let pendingDescription = "";
      let pendingDefault: unknown;
      let hasPendingDefault = false;
      for (const rawLine of argsBody.split("\n")) {
        const line = rawLine.trim();
        if (line.startsWith("//")) {
          const text = line.replace(/^\/\/+/, "").trim();
          if (/^@[a-zA-Z]/.test(text)) {
            const defaultMatch = /@default\s+("[^"]*"|\[[^\]]*\]|[^\s@]+)/.exec(text);
            if (defaultMatch) {
              const literal = defaultMatch[1];
              pendingDefault = literal.startsWith('"') || literal.startsWith("[")
                ? JSON.parse(literal)
                : literal === "true"
                  ? true
                  : literal === "false"
                    ? false
                    : literal === "null"
                      ? null
                      : Number(literal);
              hasPendingDefault = true;
            }
            continue;
          }
          pendingDescription = normalize((pendingDescription + " " + text).trim());
          continue;
        }
        // The index signature line ("[key: string]: unknown;") starts with
        // a bracket and cannot match the declaration regex.
        const paramMatch = /^([A-Za-z_]\w*)(\?)?:\s*(.+?);\s*$/.exec(line);
        if (paramMatch) {
          const [, name, optional, typeText] = paramMatch;
          const enumMatch = /^"([^"]*)"(?:\s*\|\s*"([^"]*)")*$/.exec(typeText);
          const enumValues = enumMatch ? (typeText.match(/"([^"]*)"/g) ?? []).map((v) => v.slice(1, -1)) : undefined;
          const baseType = typeText.includes("number") ? "number" : typeText.includes("boolean") ? "boolean" : "string";
          params.set(name, {
            required: optional === undefined,
            type: baseType,
            ...(enumValues !== undefined ? { enum: enumValues } : {}),
            description: pendingDescription,
            ...(hasPendingDefault ? { default: pendingDefault } : {}),
            hasDefault: hasPendingDefault,
          });
          pendingDescription = "";
          pendingDefault = undefined;
          hasPendingDefault = false;
        }
      }
    }
    dumpTools.set(section.name, { descriptionBlock, params });
  }

  // The record must hold the full audited surface: 120 tools.
  assert.equal(dumpTools.size, 120, "the fresh introspection record must hold the full 120-tool surface");

  // Full-scope cross-check, both directions.
  for (const shipped of SHIPPED_AURA_MCP_TOOLS) {
    const dumped = dumpTools.get(shipped.name);
    assert.ok(dumped, `tool ${shipped.name} must exist in the fresh introspection record`);
    assert.equal(
      normalize(shipped.description),
      dumped.descriptionBlock,
      `tool ${shipped.name}: shipped description must be the record's verbatim block (whitespace-normalized)`,
    );
    // Direction one: every shipped parameter must exist in the record with
    // the same requiredness, type, enum values, default, and description.
    for (const [paramName, shippedParam] of Object.entries(shipped.params)) {
      const dumpedParam = dumped.params.get(paramName);
      assert.ok(dumpedParam, `tool ${shipped.name}: shipped parameter "${paramName}" must exist in the record`);
      assert.equal(shippedParam.required, dumpedParam.required, `tool ${shipped.name}.${paramName}: requiredness must match the record`);
      assert.equal(shippedParam.type, dumpedParam.type, `tool ${shipped.name}.${paramName}: type must match the record`);
      if (shippedParam.enum !== undefined) {
        assert.deepEqual(
          [...shippedParam.enum].sort(),
          [...(dumpedParam.enum ?? [])].sort(),
          `tool ${shipped.name}.${paramName}: enum values must match the record`,
        );
      }
      assert.equal(
        normalize(shippedParam.description),
        dumpedParam.description,
        `tool ${shipped.name}.${paramName}: description must match the record`,
      );
      assert.equal(
        shippedParam.default !== undefined,
        dumpedParam.hasDefault,
        `tool ${shipped.name}.${paramName}: default presence must match the record`,
      );
      if (dumpedParam.hasDefault && shippedParam.default !== undefined) {
        assert.equal(
          JSON.stringify(shippedParam.default),
          JSON.stringify(dumpedParam.default),
          `tool ${shipped.name}.${paramName}: default value must match the record`,
        );
      }
    }
    // Direction two (full scope): the shipped contract must record the
    // complete server schema, so every parameter the record holds for the
    // tool must be shipped, not just the slice the wrapper sends.
    const missing = [...dumped.params.keys()].filter((paramName) => shipped.params[paramName] === undefined);
    assert.deepEqual(
      missing,
      [],
      `tool ${shipped.name}: shipped contract must record the complete server schema; missing from the shipped data: ${missing.join(", ")}`,
    );
  }
  console.log(`provenance guard: ${SHIPPED_AURA_MCP_TOOLS.length} shipped tools verified full-scope against the fresh record: ok`);
}

console.log("\nall aura-mcp-contract tests passed");
