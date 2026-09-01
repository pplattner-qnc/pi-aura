// gen-rest-index — build-time index generator that reads openapi.yaml via
// the slice-1 loader, builds per-op searchable text (name + summary +
// description + OpenAPI tags + code-side tags), computes the FTS index,
// and emits a slim metadata blob (only the fields list/describe/call read).
//
// buildRestIndex(openApiPath, codeTags, resolveFn) is a PURE function returning
// a RestIndexBlob. genRestIndex() is the CLI entry that writes a generated .ts
// module. The build asserts the blob fits the size budget.
//
// DETERMINISTIC: operations and tags are sorted so regeneration is
// byte-identical.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadOpenApi } from "@pi-aura/shared/openapi/loader";
import type { OpenApiIndex, OpMeta, Param, BodyShape, ResponseEntry } from "@pi-aura/shared/openapi/loader";
import {
  buildFtsIndex,
  type SearchableOp,
  type FtsIndex,
} from "@pi-aura/shared/rest/fts";
import type { CodeTags } from "./rest-code-tags.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Slim operation metadata — only the fields list/describe/call read. */
export interface SlimOpMeta {
  operationId: string;
  method: string;
  path: string;
  pathParams: Param[];
  queryParams: Param[];
  body?: BodyShape;
  tags: string[];
  summary?: string;
  responses: ResponseEntry[];
  // NOTE: no 'description' field — long descriptions stay in FTS text only,
  // not duplicated in metadata, to fit the size budget.
}

export interface RestIndexBlob {
  version: number;
  metadata: SlimOpMeta[];
  fts: FtsIndex;
  embedModelId: null;
  vectors: null;
}

// Current version of the index blob format. Bump when the shape changes.
const BLOB_VERSION = 1;

// ---------------------------------------------------------------------------
// buildSearchableText — name + summary + description + tags + code-tags
// ---------------------------------------------------------------------------

/**
 * Build the searchable text for an operation: operationId + summary +
 * description + OpenAPI tags + code-side tags.
 */
export function buildSearchableText(
  op: OpMeta,
  codeTags: CodeTags,
  resolveFn: (op: OpMeta, tags: CodeTags) => string[],
): string {
  const parts: string[] = [op.operationId];
  if (op.summary) parts.push(op.summary);
  if (op.description) parts.push(op.description);
  parts.push(...op.tags);
  parts.push(...resolveFn(op, codeTags));
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// buildRestIndex — the pure builder
// ---------------------------------------------------------------------------

export function buildRestIndex(
  openApiPath: string,
  codeTags: CodeTags,
  resolveFn: (op: OpMeta, tags: CodeTags) => string[],
): RestIndexBlob {
  const index: OpenApiIndex = loadOpenApi(openApiPath);

  // Sort operations by operationId for determinism
  const ops = Object.values(index).sort((a, b) =>
    a.operationId.localeCompare(b.operationId),
  );

  // --- Build searchable text + FTS index ---
  const searchableOps: SearchableOp[] = ops.map((op) => ({
    operationId: op.operationId,
    text: buildSearchableText(op, codeTags, resolveFn),
  }));

  const fts = buildFtsIndex(searchableOps);

  // --- Build slim metadata ---
  const metadata: SlimOpMeta[] = ops.map((op) => ({
    operationId: op.operationId,
    method: op.method,
    path: op.path,
    pathParams: op.pathParams,
    queryParams: op.queryParams,
    body: op.body,
    tags: op.tags,
    summary: op.summary,
    responses: op.responses,
  }));

  return {
    version: BLOB_VERSION,
    metadata,
    fts,
    embedModelId: null,
    vectors: null,
  };
}

// ---------------------------------------------------------------------------
// serializeRestIndexBlob — deterministic JSON serialization
// ---------------------------------------------------------------------------

/**
 * Serialize the blob to a deterministic JSON string (sorted keys).
 * Used for size-budget assertion and for writing the generated .ts module.
 */
export function serializeRestIndexBlob(blob: RestIndexBlob): string {
  return JSON.stringify(blob);
}

// ---------------------------------------------------------------------------
// assertSizeBudget — fail loudly if the blob exceeds the budget
// ---------------------------------------------------------------------------

export const DEFAULT_SIZE_BUDGET = 3 * 1024 * 1024; // 3 MB

/**
 * Assert the inlined index (metadata + FTS) is under the given budget.
 * Throws with the actual size + remediation hints if it exceeds.
 */
export function assertSizeBudget(
  blob: RestIndexBlob,
  budgetBytes: number = DEFAULT_SIZE_BUDGET,
): void {
  const serialized = serializeRestIndexBlob(blob);
  const size = serialized.length;

  if (size > budgetBytes) {
    throw new Error(
      `REST index size budget exceeded: ${size} bytes > ${budgetBytes} bytes budget ` +
      `(${(size / 1024 / 1024).toFixed(2)} MB). ` +
      `Remediation hints: ` +
      `(1) drop long descriptions from FTS text but keep a truncated form in metadata, ` +
      `(2) prune unused fields from the metadata blob, ` +
      `(3) reduce metadata granularity (e.g. omit response schema refs).`,
    );
  }
}

// ---------------------------------------------------------------------------
// genRestIndex — CLI entry that writes the generated .ts module
// ---------------------------------------------------------------------------

/**
 * Generate the rest-index.ts module content (a .ts const export).
 */
export function generateRestIndexTs(blob: RestIndexBlob): string {
  const json = serializeRestIndexBlob(blob);
  return `// AUTO-GENERATED by task gen-rest-index — do not edit by hand.\n` +
    `// Regenerate with: task gen-rest-index\n` +
    `import type { RestIndexBlob } from "../gen-rest-index.js";\n\n` +
    `export const REST_INDEX: RestIndexBlob = ${json};\n`;
}

/**
 * CLI entry point: load openapi.yaml, build the index, assert the size
 * budget, and write the generated .ts module.
 */
export function genRestIndex(): void {
  // Resolve openapi.yaml relative to the repo root (works from repo root or scripts/).
  const repoRoot = resolve(process.cwd(), "packages", "shared", "openapi", "openapi.yaml");
  const scriptsRoot = resolve(import.meta.dirname, "..", "packages", "shared", "openapi", "openapi.yaml");
  const openApiPath = existsSync(repoRoot) ? repoRoot : scriptsRoot;

  const blob = buildRestIndex(openApiPath, CODE_TAGS_REF, resolveCodeTagsRef);

  // Assert size budget before writing
  assertSizeBudget(blob);

  // Write the generated .ts module
  const ts = generateRestIndexTs(blob);
  const outDir = resolve(import.meta.dirname, "generated");
  const outPath = resolve(outDir, "rest-index.ts");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, ts, "utf8");

  const size = serializeRestIndexBlob(blob).length;
  console.log(
    `generated ${outPath} (${size} bytes, ${blob.metadata.length} operations, ` +
    `budget: ${(DEFAULT_SIZE_BUDGET / 1024 / 1024).toFixed(0)} MB)`,
  );
}

// Late-bound imports for the CLI entry (avoids circular import issues in tests)
import { CODE_TAGS as CODE_TAGS_REF, resolveCodeTags as resolveCodeTagsRef } from "./rest-code-tags.js";

// Run when invoked directly via `node --experimental-strip-types scripts/src/gen-rest-index.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  genRestIndex();
}
