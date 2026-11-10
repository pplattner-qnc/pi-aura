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

/** The shipped contract for `listTasks` reduced to the params the wrapper
 *  sends, used as the known-good fixture for the comparison tests. The
 *  expected values here are hand-copied from the introspection dump, NOT
 *  re-derived from the shipped module (the provenance guard at the bottom
 *  cross-checks the shipped data against the dump independently). */
const SHIPPED_LIST_TASKS: ShippedToolContract = {
  name: "listTasks",
  description:
    "Returns paginated tasks the caller can see (membership, inherited access, and access grants). " +
    "There is no default status filter; archived tasks are hidden unless archived=all or archived=true. " +
    "related_task_id is member-scoped only and then applies status_slug, status_type, type, archived, and deadline.",
  params: {
    q: { type: "string", required: false, description: "Search query (full-text filter across relevant fields)" },
    archived: {
      type: "string",
      required: false,
      description:
        "Archived visibility (orthogonal to status): false (default) hides archived, true only archived, all both",
      enum: ["false", "true", "all"],
    },
    limit: { type: "number", required: false, description: "Number of items per page", default: 20 },
    page: { type: "number", required: false, description: "Page number (1-based)", default: 1 },
    sort_by: {
      type: "string",
      required: false,
      description: "Field to sort by",
      enum: ["created_at", "updated_at", "title", "urgent_deadline"],
      default: "updated_at",
    },
    sort_dir: { type: "string", required: false, description: "Sort direction", enum: ["asc", "desc"], default: "desc" },
  },
};

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
  const live = liveTool("listTasks", {
    q: { type: "string", description: "Search query (full-text filter across relevant fields)" },
    archived: { type: "string", enum: ["false", "true", "all"], description: SHIPPED_LIST_TASKS.params.archived.description },
    limit: { type: "integer", description: "Number of items per page", default: 20 },
    page: { type: "integer", description: "Page number (1-based)", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], description: "Field to sort by", default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], description: "Sort direction", default: "desc" },
  }, { description: SHIPPED_LIST_TASKS.description });
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "ok", `expected no drift, got: ${JSON.stringify(verdict)}`);
  console.log("compareShippedTool no-drift: ok");
}

// ---------------------------------------------------------------------------
// compareShippedTool: cosmetic drift
// ---------------------------------------------------------------------------

{
  // A new optional parameter on the live server is cosmetic.
  const live = liveTool("listTasks", {
    q: { type: "string" },
    archived: { type: "string", enum: ["false", "true", "all"] },
    limit: { type: "integer", default: 20 },
    page: { type: "integer", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc" },
    status_type: { type: "string", description: "brand new optional filter" },
  });
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "cosmetic", `expected cosmetic, got: ${JSON.stringify(verdict)}`);
  assert.ok(
    verdict.issues.join("; ").includes("status_type"),
    "the cosmetic warning names the new parameter",
  );
  console.log("compareShippedTool new optional parameter: ok");
}

{
  // A changed tool description is cosmetic.
  const live = liveTool("listTasks", {
    q: { type: "string" },
    archived: { type: "string", enum: ["false", "true", "all"] },
    limit: { type: "integer", default: 20 },
    page: { type: "integer", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc" },
  }, { description: "Returns paginated tasks the caller can see, but the wording moved on" });
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
  const live = liveTool("listTasks", {
    q: { type: "string" },
    archived: { type: "string", enum: ["false", "true", "all"] },
    limit: { type: "integer", default: 50 },
    page: { type: "integer", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc" },
  });
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
  // core drift (renamed or removed).
  const live = liveTool("listTasks", {
    archived: { type: "string", enum: ["false", "true", "all"], description: SHIPPED_LIST_TASKS.params.archived.description },
    limit: { type: "integer", default: 20 },
    page: { type: "integer", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc" },
  });
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
  const live = liveTool("listTasks", {
    q: { type: "number" },
    archived: { type: "string", enum: ["false", "true", "all"], description: SHIPPED_LIST_TASKS.params.archived.description },
    limit: { type: "integer", default: 20 },
    page: { type: "integer", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc" },
  });
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "core");
  assert.ok(verdict.issues.join("; ").includes('"q"') && verdict.issues.join("; ").includes("retyped"));
  console.log("compareShippedTool retyped parameter: ok");
}

{
  // An enum that drops values the wrapper sends is core drift (retyped).
  const live = liveTool("listTasks", {
    q: { type: "string" },
    archived: { type: "string", enum: ["false", "true"], description: SHIPPED_LIST_TASKS.params.archived.description },
    limit: { type: "integer", default: 20 },
    page: { type: "integer", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc" },
  });
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
  const live = liveTool("listTasks", {
    q: { type: "string" },
    archived: { type: "string", enum: ["false", "true", "all"], description: SHIPPED_LIST_TASKS.params.archived.description },
    limit: { type: "integer", default: 20 },
    page: { type: "integer", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc" },
  }, { required: ["q"] });
  const verdict = compareShippedTool(SHIPPED_LIST_TASKS, live);
  assert.equal(verdict.verdict, "core");
  assert.ok(verdict.issues.join("; ").includes('"q"') && verdict.issues.join("; ").includes("newly required"));
  console.log("compareShippedTool newly required parameter: ok");
}

{
  // A brand-new required parameter the wrapper does not send is core drift
  // (every call would fail validation).
  const live = liveTool("listTasks", {
    q: { type: "string" },
    archived: { type: "string", enum: ["false", "true", "all"], description: SHIPPED_LIST_TASKS.params.archived.description },
    limit: { type: "integer", default: 20 },
    page: { type: "integer", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc" },
    project_slug: { type: "string", description: "new mandatory scope" },
  }, { required: ["project_slug"] });
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
  const live = liveTool("listTasks", {
    q: { type: "string" },
    archived: { type: "string", enum: ["false", "true", "all", "only-mine"], description: SHIPPED_LIST_TASKS.params.archived.description },
    limit: { type: "integer", default: 20 },
    page: { type: "integer", default: 1 },
    sort_by: { type: "string", enum: ["created_at", "updated_at", "title", "urgent_deadline"], default: "updated_at" },
    sort_dir: { type: "string", enum: ["asc", "desc"], default: "desc" },
  });
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

console.log("\nall aura-mcp-contract tests passed");
