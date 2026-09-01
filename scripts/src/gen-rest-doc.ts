// gen-rest-doc — build-time generator that produces
// skills/core/aura/resources/rest-api.md from the OpenAPI loader index.
//
// generateRestDocMd(index) is a pure, deterministic function (sorted by tag
// then operationId) that returns a markdown string. The CLI entry point
// (genRestDoc) writes the file; it's wired into Taskfile.yml's build target.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadOpenApi } from "@pi-aura/shared/openapi/loader";
import type { OpenApiIndex, OpMeta } from "@pi-aura/shared/openapi/loader";

const OTHER_TAG = "Other";

export function generateRestDocMd(index: OpenApiIndex): string {
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

  const lines: string[] = [];
  lines.push("# Aura REST API Reference");
  lines.push("");
  lines.push("Auto-generated from `packages/shared/openapi/openapi.yaml` by `task gen-rest-doc`.");
  lines.push("Do not edit by hand — regenerate with `task build`.");
  lines.push("");

  for (const tag of sortedTags) {
    const ops = byTag.get(tag)!;
    ops.sort((a, b) => a.operationId.localeCompare(b.operationId));
    lines.push(`## ${tag}`);
    lines.push("");

    for (const op of ops) {
      lines.push(`### \`${op.operationId}\``);
      lines.push("");
      lines.push(`\`${op.method.toUpperCase()}\` \`${op.path}\``);
      lines.push("");
      if (op.summary) {
        lines.push(`**Summary:** ${op.summary}`);
        lines.push("");
      }
      if (op.description) {
        lines.push(`**Description:** ${op.description}`);
        lines.push("");
      }
      if (op.tags.length > 0) {
        lines.push(`**Tags:** ${op.tags.join(", ")}`);
        lines.push("");
      }

      // Path params
      if (op.pathParams.length > 0) {
        lines.push("**Path parameters:**");
        lines.push("");
        lines.push("| Name | Type | Required | Description |");
        lines.push("|------|------|----------|-------------|");
        for (const p of op.pathParams) {
          const typeStr = p.schema.format
            ? `${p.schema.type ?? ""}/${p.schema.format}`
            : (p.schema.type ?? "string");
          lines.push(`| \`${p.name}\` | \`${typeStr}\` | ${p.required ? "yes" : "no"} | ${p.description ?? ""} |`);
        }
        lines.push("");
      }

      // Query params
      if (op.queryParams.length > 0) {
        lines.push("**Query parameters:**");
        lines.push("");
        lines.push("| Name | Type | Required | Style | Explode | Description |");
        lines.push("|------|------|----------|-------|---------|-------------|");
        for (const p of op.queryParams) {
          const typeStr = p.schema.format
            ? `${p.schema.type ?? ""}/${p.schema.format}`
            : (p.schema.type ?? "string");
          lines.push(
            `| \`${p.name}\` | \`${typeStr}\` | ${p.required ? "yes" : "no"} | ${p.style ?? ""} | ${p.explode ?? ""} | ${p.description ?? ""} |`,
          );
        }
        lines.push("");
      }

      // Request body
      if (op.body) {
        lines.push("**Request body:**");
        lines.push("");
        lines.push(`- Content-Type: \`${op.body.contentType}\``);
        lines.push(`- Required: ${op.body.required ? "yes" : "no"}`);
        if (op.body.schemaRef) {
          lines.push(`- Schema: \`${op.body.schemaRef}\``);
        } else if (op.body.schemaInline) {
          lines.push(`- Schema (inline): \`${JSON.stringify(op.body.schemaInline)}\``);
        }
        lines.push("");
      }

      // Responses
      if (op.responses.length > 0) {
        lines.push("**Responses:**");
        lines.push("");
        lines.push("| Code | Description | Schema |");
        lines.push("|------|-------------|--------|");
        for (const r of op.responses) {
          lines.push(`| ${r.code} | ${r.description} | ${r.schemaRef ? `\`${r.schemaRef}\`` : ""} |`);
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * CLI entry point: load openapi.yaml, generate the markdown, and write it
 * to skills/core/aura/resources/rest-api.md.
 */
export function genRestDoc(): void {
  // Resolve openapi.yaml relative to the repo root (works from repo root or scripts/).
  const repoRoot = resolve(process.cwd(), "packages", "shared", "openapi", "openapi.yaml");
  const scriptsRoot = resolve(import.meta.dirname, "..", "packages", "shared", "openapi", "openapi.yaml");
  const openApiPath = existsSync(repoRoot) ? repoRoot : scriptsRoot;
  const index = loadOpenApi(openApiPath);
  const md = generateRestDocMd(index);
  // Resolve output relative to the repo root (works from repo root or scripts/).
  const repoOut = resolve(process.cwd(), "skills", "core", "aura", "resources", "rest-api.md");
  const scriptsOut = resolve(import.meta.dirname, "..", "skills", "core", "aura", "resources", "rest-api.md");
  const outPath = existsSync(resolve(process.cwd(), "skills")) ? repoOut : scriptsOut;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md, "utf8");
  console.log(`generated ${outPath} (${md.length} bytes, ${Object.keys(index).length} operations)`);
}

// Run when invoked directly via `node --experimental-strip-types scripts/src/gen-rest-doc.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  genRestDoc();
}
