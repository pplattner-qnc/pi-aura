// OpenAPI loader — the single parser for packages/shared/openapi/openapi.yaml.
//
// Parses the spec once into an in-memory operation index
// (Record<operationId, OpMeta>) that every rest subcommand + build generator
// reuses. Resolves only the $ref constructs the Aura spec actually uses
// (#/components/schemas/..., #/components/parameters/..., #/components/responses/...);
// fails loudly with the ref path on any unsupported construct.

import { readFileSync } from "node:fs";
import { load as parseYaml } from "js-yaml";

// ---------------------------------------------------------------------------
// Types (the contract slices 2/3/4 consume)
// ---------------------------------------------------------------------------

export interface ParamSchema {
  type?: string;
  format?: string;
  items?: ParamSchema;
  // Additional OpenAPI schema fields we pass through for later slices.
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  nullable?: boolean;
  [k: string]: unknown;
}

export interface Param {
  name: string;
  required: boolean;
  schema: ParamSchema;
  style?: string;
  explode?: boolean;
  description?: string;
}

export interface BodyShape {
  contentType: string;
  schemaRef?: string;
  schemaInline?: object;
  required: boolean;
}

export interface ResponseEntry {
  code: string;
  description: string;
  schemaRef?: string;
}

export interface OpMeta {
  operationId: string;
  method: string;
  path: string;
  pathParams: Param[];
  queryParams: Param[];
  body?: BodyShape;
  tags: string[];
  summary?: string;
  description?: string;
  responses: ResponseEntry[];
}

export type OpenApiIndex = Record<string, OpMeta>;

// ---------------------------------------------------------------------------
// Internal: raw spec types (subset we read)
// ---------------------------------------------------------------------------

interface RawParameter {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: RawSchema;
  style?: string;
  explode?: boolean;
  description?: string;
  $ref?: string;
}

interface RawSchema {
  type?: string;
  format?: string;
  items?: RawSchema;
  $ref?: string;
  [k: string]: unknown;
}

interface RawRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: RawSchema }>;
}

interface RawResponse {
  description?: string;
  content?: Record<string, { schema?: RawSchema }>;
  $ref?: string;
}

interface RawOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: RawParameter[];
  requestBody?: RawRequestBody;
  responses?: Record<string, RawResponse>;
}

interface RawSpec {
  paths?: Record<string, Record<string, RawOperation>>;
  components?: {
    parameters?: Record<string, RawParameter>;
    responses?: Record<string, RawResponse>;
    schemas?: Record<string, RawSchema>;
  };
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

const SUPPORTED_REF_PREFIXES = [
  "#/components/schemas/",
  "#/components/parameters/",
  "#/components/responses/",
];

function assertSupportedRef(ref: string): void {
  if (!SUPPORTED_REF_PREFIXES.some((p) => ref.startsWith(p))) {
    throw new Error(
      `Unsupported $ref: "${ref}". Only #/components/schemas/..., #/components/parameters/..., and #/components/responses/... are supported.`,
    );
  }
}

function refName(ref: string): string {
  return ref.split("/").pop()!;
}

// ---------------------------------------------------------------------------
// Path template param extraction
// ---------------------------------------------------------------------------

const PATH_PARAM_RE = /\{([^}]+)\}/g;

export function extractPathParamNames(path: string): string[] {
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PATH_PARAM_RE.exec(path)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Schema / param / response parsing
// ---------------------------------------------------------------------------

function parseSchema(raw: RawSchema): ParamSchema {
  const result: ParamSchema = {};
  if (raw.type) result.type = raw.type;
  if (raw.format) result.format = raw.format;
  if (raw.items) result.items = parseSchema(raw.items);
  if (raw.enum !== undefined) result.enum = raw.enum as unknown[];
  if (raw.default !== undefined) result.default = raw.default;
  if (raw.minimum !== undefined) result.minimum = raw.minimum as number;
  if (raw.maximum !== undefined) result.maximum = raw.maximum as number;
  if (raw.nullable !== undefined) result.nullable = raw.nullable as boolean;
  return result;
}

function parseParam(
  raw: RawParameter,
  components: RawSpec["components"],
): Param {
  let resolved = raw;
  if (raw.$ref) {
    assertSupportedRef(raw.$ref);
    const name = refName(raw.$ref);
    resolved = components?.parameters?.[name] ?? {};
  }

  return {
    name: resolved.name ?? "",
    required: resolved.required ?? false,
    schema: parseSchema(resolved.schema ?? {}),
    style: resolved.style,
    explode: resolved.explode,
    description: resolved.description,
  };
}

function parseBody(
  raw: RawRequestBody | undefined,
): BodyShape | undefined {
  if (!raw) return undefined;
  const content = raw.content ?? {};
  // Aura spec uses application/json for all request bodies.
  const contentType = "application/json" in content
    ? "application/json"
    : Object.keys(content)[0] ?? "application/json";
  const entry = content[contentType];
  const schema = entry?.schema;

  let schemaRef: string | undefined;
  let schemaInline: object | undefined;
  if (schema) {
    if (schema.$ref) {
      assertSupportedRef(schema.$ref);
      schemaRef = refName(schema.$ref);
    } else {
      schemaInline = schema;
    }
  }

  return {
    contentType,
    schemaRef,
    schemaInline,
    required: raw.required ?? false,
  };
}

function parseResponse(
  code: string,
  raw: RawResponse,
  components: RawSpec["components"],
): ResponseEntry {
  let resolved = raw;
  if (raw.$ref) {
    assertSupportedRef(raw.$ref);
    const name = refName(raw.$ref);
    resolved = components?.responses?.[name] ?? {};
  }

  let schemaRef: string | undefined;
  const content = resolved.content ?? {};
  const jsonEntry = content["application/json"] ?? content["application/problem+json"];
  if (jsonEntry?.schema?.$ref) {
    assertSupportedRef(jsonEntry.schema.$ref);
    schemaRef = refName(jsonEntry.schema.$ref);
  }

  return {
    code,
    description: resolved.description ?? "",
    schemaRef,
  };
}

// ---------------------------------------------------------------------------
// Operation parsing
// ---------------------------------------------------------------------------

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

function parseOperation(
  method: string,
  path: string,
  raw: RawOperation,
  components: RawSpec["components"],
): OpMeta | null {
  if (!raw.operationId) {
    console.warn(
      `[openapi-loader] WARNING: skipping operation with no operationId: ${method.toUpperCase()} ${path}`,
    );
    return null;
  }

  const pathParamNames = extractPathParamNames(path);
  const allParams = (raw.parameters ?? []).map((p) => parseParam(p, components));

  const pathParams: Param[] = [];
  const queryParams: Param[] = [];

  for (const p of allParams) {
    // Determine 'in' — for resolved $ref params, we need to check the raw.
    // We re-resolve to find 'in' since parseParam doesn't keep it.
    const inLocation = findParamIn(p, raw.parameters ?? [], components);
    if (inLocation === "path") {
      pathParams.push(p);
    } else if (inLocation === "query") {
      queryParams.push(p);
    }
  }

  // Cross-check: path template names must match path params.
  const pathParamNamesFromParams = pathParams.map((p) => p.name);
  for (const name of pathParamNames) {
    if (!pathParamNamesFromParams.includes(name)) {
      // Path template has a param not declared in parameters — add a minimal stub.
      pathParams.push({
        name,
        required: true,
        schema: {},
      });
    }
  }

  const responses: ResponseEntry[] = [];
  for (const [code, respRaw] of Object.entries(raw.responses ?? {})) {
    responses.push(parseResponse(code, respRaw, components));
  }

  return {
    operationId: raw.operationId,
    method,
    path,
    pathParams,
    queryParams,
    body: parseBody(raw.requestBody),
    tags: raw.tags ?? [],
    summary: raw.summary,
    description: raw.description,
    responses,
  };
}

function findParamIn(
  param: Param,
  rawParams: RawParameter[],
  components: RawSpec["components"],
): string | undefined {
  for (const rp of rawParams) {
    let name: string | undefined;
    let inLoc: string | undefined;
    if (rp.$ref) {
      assertSupportedRef(rp.$ref);
      const refN = refName(rp.$ref);
      const resolved = components?.parameters?.[refN];
      name = resolved?.name;
      inLoc = resolved?.in;
    } else {
      name = rp.name;
      inLoc = rp.in;
    }
    if (name === param.name) return inLoc;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main entry: loadOpenApi (cached per process)
// ---------------------------------------------------------------------------

const cache = new Map<string, OpenApiIndex>();

export function loadOpenApi(path: string): OpenApiIndex {
  const cached = cache.get(path);
  if (cached) return cached;

  const raw = readFileSync(path, "utf8");
  const spec = parseYaml(raw) as RawSpec;
  const components = spec.components;
  const index: OpenApiIndex = {};

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const rawOp = methods[method];
      if (!rawOp) continue;
      const op = parseOperation(method, path, rawOp, components);
      if (!op) continue;
      if (index[op.operationId]) {
        const existing = index[op.operationId];
        throw new Error(
          `Duplicate operationId "${op.operationId}": ` +
          `first at ${existing.method.toUpperCase()} ${existing.path}, ` +
          `second at ${op.method.toUpperCase()} ${op.path}`,
        );
      }
      index[op.operationId] = op;
    }
  }

  cache.set(path, index);
  return index;
}
