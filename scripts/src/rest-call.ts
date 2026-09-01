// rest-call — the generic REST operation invoker behind `aura.mjs rest call`.
//
// restCall(index, credentials, args, out) resolves an operation by operationId
// from the loader's index, builds a fetch request (path-fill, query serialize,
// JSON body), sends it with Authorization: Bearer <pat>, and prints the raw
// JSON response. HTTP errors print status + body and exit 1. Unknown
// operationId lists closest matches and exits 2.
//
// Refactored out of main() so it's unit-testable without spawning the process.

import { readFileSync } from "node:fs";
import { buildRequest } from "@pi-aura/shared/rest/build-request";
import type { OpenApiIndex } from "@pi-aura/shared/openapi/loader";
import type { FtsIndex } from "@pi-aura/shared/rest/fts";
import type { OutSink } from "./rest-list-describe.js";
import { closestMatches } from "./closest-match.js";

// ---------------------------------------------------------------------------
// Args parsing (multi-valued --param, --body-file / --body)
// ---------------------------------------------------------------------------

export interface CallArgs {
  params: Record<string, string[]>;
  bodyFile?: string;
  body?: string;
}

/**
 * Parse the `rest call` argument vector: repeatable `--param name=val`,
 * `--body-file F`, and `--body <json>` (mutually exclusive).
 *
 * Unlike parseFlags (which overwrites repeated keys), this collects repeated
 * `--param` keys into arrays so `--param level=A --param level=B` preserves
 * both values.
 */
export function parseCallArgs(args: string[]): CallArgs {
  const params: Record<string, string[]> = {};
  let bodyFile: string | undefined;
  let body: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--param") {
      const val = args[i + 1];
      if (val === undefined || val.startsWith("--")) {
        throw new Error("rest call: --param requires a name=value argument");
      }
      const eqIdx = val.indexOf("=");
      if (eqIdx === -1) {
        throw new Error(`rest call: --param "${val}" must be in name=value format`);
      }
      const name = val.slice(0, eqIdx);
      const value = val.slice(eqIdx + 1);
      if (!params[name]) params[name] = [];
      params[name].push(value);
      i++;
    } else if (a === "--body-file") {
      const val = args[i + 1];
      if (val === undefined || val.startsWith("--")) {
        throw new Error("rest call: --body-file requires a file path argument");
      }
      if (body !== undefined) {
        throw new Error("rest call: --body and --body-file are mutually exclusive");
      }
      bodyFile = val;
      i++;
    } else if (a === "--body") {
      const val = args[i + 1];
      if (val === undefined || val.startsWith("--")) {
        throw new Error("rest call: --body requires a JSON string argument");
      }
      if (bodyFile !== undefined) {
        throw new Error("rest call: --body and --body-file are mutually exclusive");
      }
      body = val;
      i++;
    }
  }

  return { params, bodyFile, body };
}

// ---------------------------------------------------------------------------
// restCall — the main invoker function
// ---------------------------------------------------------------------------

export interface RestCallArgs {
  operationId: string;
  params: Record<string, string[]>;
  body?: unknown;
}

export interface RestCallOptions {
  fetchImpl?: typeof fetch;
  /** Inlined FTS index for unknown-op suggestions (undefined → fallback). */
  fts?: FtsIndex;
}

const PRETTY_PRINT_THRESHOLD = 5000; // chars — below this, pretty-print JSON

/**
 * Invoke a REST operation by operationId. Resolves the op from the index,
 * builds the request (path-fill, query, body), fetches with credentials,
 * and prints the raw JSON response.
 *
 * - Unknown operationId → error listing closest matches, exit 2.
 * - HTTP error (≥400) → print status + body, exit 1.
 * - Success → print raw JSON (pretty-printed if small).
 */
export async function restCall(
  index: OpenApiIndex,
  credentials: { baseUrl: string; pat: string },
  args: RestCallArgs,
  out: OutSink,
  opts: RestCallOptions = {},
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;

  // --- Resolve operation ---
  const op = index[args.operationId];
  if (!op) {
    const ids = Object.keys(index);
    const matches = closestMatches(opts.fts, ids, args.operationId);
    out.error(`Error: unknown operationId "${args.operationId}".`);
    if (matches.length > 0) {
      out.error(`Closest matches:`);
      for (const m of matches) out.error(`  ${m}`);
    }
    process.exit(2);
  }

  // --- Parse body ---
  let body: unknown | undefined;
  if (args.body !== undefined) {
    body = args.body;
  }

  // --- Build request (pure; throws on missing params, etc.) ---
  // Convert params from Record<string, string[]> to Record<string, string|string[]>,
  // using single-element arrays as scalars where appropriate.
  const buildParams: Record<string, string | string[]> = {};
  for (const [key, values] of Object.entries(args.params)) {
    buildParams[key] = values.length === 1 ? values[0] : values;
  }

  const request = buildRequest(op, buildParams, body);

  // --- Fetch ---
  const url = `${credentials.baseUrl}${request.urlPath}${request.query}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credentials.pat}`,
    ...request.headers,
  };

  const response = await fetchImpl(url, {
    method: request.method,
    headers,
    body: request.body,
  });

  // --- Handle response ---
  const responseText = await response.text();

  if (!response.ok) {
    out.error(`HTTP ${response.status}: ${responseText}`);
    process.exit(1);
  }

  // Print response — pretty-print if small, raw otherwise
  let output: string;
  if (responseText.length <= PRETTY_PRINT_THRESHOLD) {
    try {
      const parsed = JSON.parse(responseText);
      output = JSON.stringify(parsed, null, 2);
    } catch {
      output = responseText;
    }
  } else {
    output = responseText;
  }

  out.log(output);
}

// ---------------------------------------------------------------------------
// resolveBody — parse body from --body-file or --body string
// ---------------------------------------------------------------------------

/**
 * Parse the request body from the CallArgs. Reads --body-file or parses
 * --body as JSON. Throws a clear error on invalid JSON.
 */
export function resolveBody(args: CallArgs): unknown | undefined {
  if (args.bodyFile) {
    const raw = readFileSync(args.bodyFile, "utf8");
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`rest call: --body-file "${args.bodyFile}" is not valid JSON: ${(e as Error).message}`);
    }
  }
  if (args.body !== undefined) {
    try {
      return JSON.parse(args.body);
    } catch (e) {
      throw new Error(`rest call: --body is not valid JSON: ${(e as Error).message}`);
    }
  }
  return undefined;
}
