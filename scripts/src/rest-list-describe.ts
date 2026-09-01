// rest list / rest describe — pure rendering functions for the REST browse
// subcommands. Refactored out of main() so they're unit-testable without
// spawning the process.
//
// restList(index, out)  → prints all operations grouped by tag.
// restDescribe(index, opId, out)  → prints the full shape of one operation.

import type { OpenApiIndex, OpMeta } from "@pi-aura/shared/openapi/loader";
import type { FtsIndex } from "@pi-aura/shared/rest/fts";
import { closestMatches } from "@pi-aura/shared/rest/closest-match";

export interface OutSink {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const OTHER_TAG = "Other";

// ---------------------------------------------------------------------------
// rest list
// ---------------------------------------------------------------------------

export function restList(index: OpenApiIndex, out: OutSink): void {
  // Group operations by tag.
  const byTag = new Map<string, OpMeta[]>();
  for (const op of Object.values(index)) {
    const tags = op.tags.length > 0 ? op.tags : [OTHER_TAG];
    for (const tag of tags) {
      let group = byTag.get(tag);
      if (!group) {
        group = [];
        byTag.set(tag, group);
      }
      group.push(op);
    }
  }

  // Sort tags alphabetically; "Other" goes last.
  const sortedTags = [...byTag.keys()].sort((a, b) => {
    if (a === OTHER_TAG) return 1;
    if (b === OTHER_TAG) return -1;
    return a.localeCompare(b);
  });

  for (const tag of sortedTags) {
    const ops = byTag.get(tag)!;
    ops.sort((a, b) => a.operationId.localeCompare(b.operationId));
    out.log(`## ${tag}`);
    for (const op of ops) {
      const method = op.method.toUpperCase().padEnd(6);
      out.log(`  ${op.operationId}  ${method}  ${op.path}  — ${op.summary ?? ""}`);
    }
    out.log("");
  }
}

// ---------------------------------------------------------------------------
// rest describe
// ---------------------------------------------------------------------------

export function restDescribe(index: OpenApiIndex, opId: string, out: OutSink, fts?: FtsIndex): void {
  const op = index[opId];
  if (!op) {
    const ids = Object.keys(index);
    const matches = closestMatches(fts, ids, opId);
    out.error(`Error: unknown operationId "${opId}".`);
    if (matches.length > 0) {
      out.error(`Closest matches:`);
      for (const m of matches) out.error(`  ${m}`);
    }
    process.exit(2);
  }

  out.log(`${op.method.toUpperCase()}  ${op.path}`);
  out.log(`operationId: ${op.operationId}`);
  if (op.summary) out.log(`summary: ${op.summary}`);
  if (op.description) out.log(`description: ${op.description}`);
  if (op.tags.length > 0) out.log(`tags: ${op.tags.join(", ")}`);

  // Path params
  if (op.pathParams.length > 0) {
    out.log("");
    out.log("Path parameters:");
    for (const p of op.pathParams) {
      const typeStr = p.schema.format ? `${p.schema.type}/${p.schema.format}` : (p.schema.type ?? "string");
      out.log(`  ${p.name}  (${typeStr})${p.required ? " [required]" : ""}`);
      if (p.description) out.log(`    ${p.description}`);
    }
  }

  // Query params
  if (op.queryParams.length > 0) {
    out.log("");
    out.log("Query parameters:");
    for (const p of op.queryParams) {
      const typeStr = p.schema.format ? `${p.schema.type}/${p.schema.format}` : (p.schema.type ?? "string");
      const explodeStr = p.explode !== undefined ? `, explode=${p.explode}` : "";
      const styleStr = p.style !== undefined ? `, style=${p.style}` : "";
      out.log(`  ${p.name}  (${typeStr}${styleStr}${explodeStr})${p.required ? " [required]" : ""}`);
      if (p.description) out.log(`    ${p.description}`);
    }
  }

  // Request body
  if (op.body) {
    out.log("");
    out.log("Request body:");
    out.log(`  Content-Type: ${op.body.contentType}`);
    out.log(`  Required: ${op.body.required}`);
    if (op.body.schemaRef) {
      out.log(`  Schema: ${op.body.schemaRef}`);
    } else if (op.body.schemaInline) {
      out.log(`  Schema (inline): ${JSON.stringify(op.body.schemaInline)}`);
    }
  }

  // Responses
  if (op.responses.length > 0) {
    out.log("");
    out.log("Responses:");
    for (const r of op.responses) {
      const refStr = r.schemaRef ? ` → ${r.schemaRef}` : "";
      out.log(`  ${r.code}  ${r.description}${refStr}`);
    }
  }
}
