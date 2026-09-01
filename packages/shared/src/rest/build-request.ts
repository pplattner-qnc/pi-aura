// build-request — pure request builder for the generic REST invoker.
//
// Takes a parsed operation (OpMeta from the loader) + user-provided params +
// optional body, and produces a fetch-ready request shape:
//   { method, urlPath, query, headers, body? }
//
// No network, no auth. Path-fill {name} from params, serialize query params
// (scalar as-is; array with style "form" default comma-separated), attach a
// JSON body with Content-Type: application/json.
//
// Errors loudly on:
//   - missing required path param (names the param + the operation)
//   - extra path param not in the template
//   - required body omitted
//   - body given when the op declares no requestBody
//   - unsupported query style (spaceDelimited / pipeDelimited)

import type { OpMeta, Param } from "../openapi/loader.js";
import { extractPathParamNames } from "../openapi/loader.js";

export interface BuiltRequest {
  method: string;
  urlPath: string;
  query: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Build a fetch-ready request shape from a parsed operation + user params +
 * optional body. Pure — no network, no auth.
 */
export function buildRequest(
  op: OpMeta,
  params: Record<string, string | string[]>,
  body?: unknown,
): BuiltRequest {
  // --- Path filling ---
  let urlPath = op.path;
  const templateNames = extractPathParamNames(op.path);
  const providedPathKeys = new Set<string>();

  for (const name of templateNames) {
    const val = params[name];
    if (val === undefined) {
      throw new Error(
        `Missing required path param "${name}" for operation "${op.operationId}".`,
      );
    }
    if (Array.isArray(val)) {
      throw new Error(
        `Path param "${name}" for operation "${op.operationId}" must be a single value, got an array.`,
      );
    }
    urlPath = urlPath.replace(`{${name}}`, encodeURIComponent(val));
    providedPathKeys.add(name);
  }

  // Detect extra path params (provided but not in the template).
  // We only flag keys that are not also query params for this operation.
  const queryParamNames = new Set(op.queryParams.map((p) => p.name));
  for (const key of Object.keys(params)) {
    if (!templateNames.includes(key) && !queryParamNames.has(key)) {
      throw new Error(
        `Extra param "${key}" is not a path or query param of operation "${op.operationId}".`,
      );
    }
    if (templateNames.includes(key)) {
      providedPathKeys.add(key);
    }
  }

  // --- Query serialization ---
  const queryParts: string[] = [];
  for (const qp of op.queryParams) {
    const val = params[qp.name];
    if (val === undefined) continue; // omit if not provided
    queryParts.push(serializeQueryParam(qp, val));
  }
  const query = queryParts.length > 0 ? "?" + queryParts.join("&") : "";

  // --- Body ---
  const headers: Record<string, string> = {};
  let bodyStr: string | undefined;

  if (body !== undefined) {
    if (!op.body) {
      throw new Error(
        `Operation "${op.operationId}" does not declare a request body; remove the body argument.`,
      );
    }
    bodyStr = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  } else {
    if (op.body?.required) {
      throw new Error(
        `Operation "${op.operationId}" requires a request body; provide one via --body-file or --body.`,
      );
    }
  }

  return {
    method: op.method.toUpperCase(),
    urlPath,
    query,
    headers,
    body: bodyStr,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPPORTED_QUERY_STYLES = new Set(["form", undefined]);

function serializeQueryParam(param: Param, val: string | string[]): string {
  if (!Array.isArray(val)) {
    return `${encodeURIComponent(param.name)}=${encodeURIComponent(val)}`;
  }

  const style = param.style ?? "form";

  if (!SUPPORTED_QUERY_STYLES.has(style)) {
    throw new Error(
      `Unsupported query style "${style}" for param "${param.name}" in operation. Only "form" is supported.`,
    );
  }

  // style: form
  if (param.explode === true) {
    return val.map((v) => `${encodeURIComponent(param.name)}=${encodeURIComponent(v)}`).join("&");
  }
  // Default: comma-separated (no explode)
  return `${encodeURIComponent(param.name)}=${val.map(encodeURIComponent).join(",")}`;
}
