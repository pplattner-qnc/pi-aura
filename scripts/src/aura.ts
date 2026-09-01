// aura.ts — the `aura` skill's CLI for artifact + wiki file-based workflows.
//
// Replaces the old `mcpx exec` shell-outs with a script that owns the lifecycle
// of the local temp files (the "workdir" model): a fresh dir per round-trip
// pairs the entity id with its body file, so id↔body mismatch is impossible and
// the dir is removed on upload — no stale files to forget.
//
// Usage:
//   node aura.mjs artifact get <artifact-uuid>            -> workdir with body.md + meta.json
//   node aura.mjs artifact update <workdir> [--summary S]  -> uploads, removes workdir
//   node aura.mjs artifact create --title T --kind K [--body-file F] [--summary S]
//   node aura.mjs artifact section <id> --heading H --body B --summary S  (small section edit)
//   node aura.mjs artifact cleanup <workdir> | --stale
//   node aura.mjs wiki get --slug "eng/auth" | --uuid <node-uuid>     -> workdir
//   node aura.mjs wiki save <workdir> [--summary S]                   -> uploads, removes workdir
//   node aura.mjs wiki search "<query>" [--space <slug>] [--limit N]  -> inline results
//   node aura.mjs wiki tree --slug "<space>"                          -> inline tree
//   node aura.mjs wiki create --space <slug> --title T --slug S        -> prints new node uuid
//   node aura.mjs upload create --file <path> [--mime <type>] [--filename <name>]  -> prints upload uuid
//   node aura.mjs upload get <upload-uuid> [--out <path>]            -> parsed text to file (or stdout if small)
//
// Auth: createDefaultAuraClient() reads aura.baseUrl from
// ~/.pi/agent/settings.json + a PAT from the OS keyring. No MCP SDK needed.

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createDefaultAuraClient } from "@pi-aura/shared/aura-client";
import { resolveAuraCredentials } from "@pi-aura/shared/aura-credentials";
import { loadOpenApi } from "@pi-aura/shared/openapi/loader";
import type { OpenApiIndex } from "@pi-aura/shared/openapi/loader";
import { restList, restDescribe } from "./rest-list-describe.js";
import { restCall, parseCallArgs, resolveBody } from "./rest-call.js";
import { restSearch } from "./rest-search.js";
import { REST_INDEX } from "./generated/rest-index.js";
import type {
  AuraClient,
  ArtifactKind,
  ArtifactReview,
  ArtifactApprovals,
  ReviewerRole,
  KnowledgeNode,
  WikiSearchResult,
  KnowledgeTree,
  UploadDocument,
} from "@pi-aura/shared/aura-client";

const USAGE = `Usage:
  node aura.mjs artifact get <artifact-uuid>              fetch body+meta into a workdir
  node aura.mjs artifact update <workdir> [--summary S]   upload from workdir, then remove it
  node aura.mjs artifact create --title T --kind K [--body-file F] [--summary S]
  node aura.mjs artifact section <id> --heading H --body B --summary S
  node aura.mjs artifact cleanup <workdir> | --stale
  node aura.mjs artifact review-get <id>                  compact review state
  node aura.mjs artifact review-approvals <id>            decisions + decided/total
  node aura.mjs artifact review-request <id>             request a review
  node aura.mjs artifact review-start <id> --version V --roles R[,R] --user-ids U[,U] [--deadline D]
  node aura.mjs artifact review-decide <id> --version V --decision APPROVED|REJECTED
  node aura.mjs artifact review-reopen <id> --version V  reopen an approved review
  node aura.mjs wiki get --slug "eng/auth" | --uuid <node-uuid>   fetch body+meta into a workdir
  node aura.mjs wiki save <workdir> [--summary S]                upload, then remove workdir
  node aura.mjs wiki search "<query>" [--space <slug>] [--limit N]
  node aura.mjs wiki tree --slug "<space>"
  node aura.mjs wiki create --space <slug> --title T --slug S    prints new node uuid
  node aura.mjs upload create --file <path> [--mime <type>] [--filename <name>]
  node aura.mjs upload get <upload-uuid> [--out <path>]          parsed text to file (or stdout if small)
  node aura.mjs rest list                                    list all REST operations grouped by tag
  node aura.mjs rest describe <operationId>                  print the full shape of one REST operation
  node aura.mjs rest call <operationId> [--param name=val …] [--body-file F] [--body <json>]
                                                            invoke a REST operation by id
  node aura.mjs rest search "<natural-language intent>"     find REST operations by full-text search`;

function fail(msg: string, usage = false, code = 2): never {
  console.error(msg);
  if (usage) console.error(USAGE);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Workdir model
// ---------------------------------------------------------------------------

const LARGE_BODY_THRESHOLD = 500; // chars; below this, the resource rule says use direct calls.

interface ArtifactMeta {
  kind: "artifact";
  artifact_id: string;
  version: number;
  title: string;
  artifact_kind: string; // GENERIC | PLAN | REVIEW
}
interface WikiMeta {
  kind: "wiki";
  node_uuid: string;
  slug: string;
  title: string;
  version: number;
}
type Meta = ArtifactMeta | WikiMeta;

function freshWorkdir(prefix: "aura-artifact" | "aura-wiki" | "aura-upload"): string {
  const dir = join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeWorkdir(dir: string, meta: Meta, body: string): void {
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
  writeFileSync(join(dir, "body.md"), body, "utf8");
}

function readWorkdirMeta(dir: string): Meta {
  const p = join(dir, "meta.json");
  if (!existsSync(p)) fail(`workdir ${dir} has no meta.json`);
  return JSON.parse(readFileSync(p, "utf8")) as Meta;
}

function removeWorkdir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Remove all aura-artifact-* / aura-wiki-* dirs older than 1h. */
function cleanupStale(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const tmp = tmpdir();
  let count = 0;
  for (const name of readdirSync(tmp)) {
    if (!/^aura-(artifact|wiki|upload)-[0-9a-f]+$/.test(name)) continue;
    const p = join(tmp, name);
    try {
      if (statSync(p).mtimeMs < cutoff) {
        rmSync(p, { recursive: true, force: true });
        count++;
      }
    } catch { /* ignore */ }
  }
  console.error(`removed ${count} stale workdir(s)`);
}

// ---------------------------------------------------------------------------
// artifact subcommands
// ---------------------------------------------------------------------------

async function artifactGet(client: AuraClient, id: string): Promise<void> {
  const detail = await client.getArtifact(id);
  const body = detail.body ?? "";
  const dir = freshWorkdir("aura-artifact");
  writeWorkdir(dir, {
    kind: "artifact",
    artifact_id: id,
    version: detail.latest_version ?? 0,
    title: detail.title ?? "",
    artifact_kind: detail.kind ?? "GENERIC",
  }, body);
  // stdout: the workdir path + a one-line summary. Body never on stdout.
  console.log(`workdir: ${dir}/`);
  console.error(`  ${detail.title ?? "(untitled)"}  v${detail.latest_version ?? 0}  (${body.length} bytes)`);
}

async function artifactUpdate(client: AuraClient, dir: string, summary?: string): Promise<void> {
  const meta = readWorkdirMeta(dir);
  if (meta.kind !== "artifact") fail(`workdir ${dir} is not an artifact workdir`);
  const bodyPath = join(dir, "body.md");
  if (!existsSync(bodyPath)) fail(`workdir ${dir} has no body.md`);
  const body = readFileSync(bodyPath, "utf8");
  await client.mcpUpdateArtifact({
    id: meta.artifact_id,
    mode: "whole",
    body,
    summary: summary ?? `Updated via aura.mjs (v${meta.version} → next)`,
    confirm_full_replace: true,
  });
  removeWorkdir(dir);
  console.error(`updated ${meta.artifact_id}; cleaned up ${dir}/`);
}

async function artifactCreate(client: AuraClient, opts: { title: string; kind: string; bodyFile?: string; summary?: string }): Promise<void> {
  let body = "";
  if (opts.bodyFile) {
    body = readFileSync(opts.bodyFile, "utf8");
    if (body.length < LARGE_BODY_THRESHOLD) console.error(`note: body is ${body.length} bytes (≤ ${LARGE_BODY_THRESHOLD}); a direct mcpCreateArtifact call would also be fine.`);
  }
  const created = await client.mcpCreateArtifact({
    title: opts.title,
    kind: opts.kind as ArtifactKind,
    body,
    summary: opts.summary ?? "Initial version",
  });
  if (opts.bodyFile) rmSync(opts.bodyFile, { force: true });
  console.log(`created ${created.id} (v${created.latest_version ?? 1})`);
}

async function artifactSection(client: AuraClient, id: string, heading: string, body: string, summary: string): Promise<void> {
  await client.mcpUpdateArtifact({
    id,
    mode: "section",
    target_heading: heading,
    body,
    summary,
  });
  console.error(`updated section ${heading} of ${id}`);
}

// ---------------------------------------------------------------------------
// artifact review-* subcommands
// ---------------------------------------------------------------------------
// These wire the 6 review/approval verbs on AuraClient (landed in slice 1) to
// the CLI surface the salvaged docs reference. Each calls the AuraClient verb
// and prints a compact human-readable summary to stdout; errors go to stderr
// via the top-level catch (exit 1), usage errors via fail() (exit 2).

/** Parse a comma-separated flag value into a string array. */
function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

async function reviewGet(client: AuraClient, id: string): Promise<void> {
  const review: ArtifactReview = await client.getArtifactReview(id);
  console.log(`artifact ${id}  v${review.version}  state: ${review.review_state}`);
  if (review.reviewers.length > 0) {
    console.log("  reviewers:");
    for (const r of review.reviewers) {
      console.log(`    ${r.user_name} (${r.user_id})  ${r.status}`);
    }
  } else {
    console.log("  reviewers: (none)");
  }
  if (review.review_deadline_at) console.log(`  deadline: ${review.review_deadline_at}`);
  const init = review.initiator;
  console.log(`  initiator: ${init ? `${init.user_name} (${init.user_id})` : "(none)"}`);
}

async function reviewApprovals(client: AuraClient, id: string): Promise<void> {
  const ap: ArtifactApprovals = await client.getArtifactApprovals(id);
  console.log(`artifact ${id}  v${ap.version} (latest ${ap.latest_version})  ${ap.decided_count}/${ap.total_required} decided`);
  for (const d of ap.decisions) {
    console.log(`  ${d.user_name}: ${d.decision}`);
  }
  if (ap.open_reviews.length > 0) {
    console.log("  pending:");
    for (const o of ap.open_reviews) {
      const tag = o.decided ? "decided" : "open";
      console.log(`    ${o.user_name} (${o.user_id})  ${tag}`);
    }
  }
}

async function reviewRequest(client: AuraClient, id: string): Promise<void> {
  await client.requestArtifactReview(id);
  console.log(`review requested for ${id}`);
}

async function reviewStart(
  client: AuraClient,
  opts: { id: string; version: number; roles: ReviewerRole[]; userIds: string[]; deadline?: string },
): Promise<void> {
  await client.startArtifactReview({
    id: opts.id,
    version: opts.version,
    roles: opts.roles,
    user_ids: opts.userIds,
    deadline: opts.deadline,
  });
  console.log(`review started for ${opts.id} v${opts.version} (roles: ${opts.roles.join(",") || "(none)"}, reviewers: ${opts.userIds.join(",") || "(none)"}${opts.deadline ? `, deadline: ${opts.deadline}` : ""})`);
}

async function reviewDecide(
  client: AuraClient,
  opts: { id: string; version: number; decision: "APPROVED" | "REJECTED" },
): Promise<void> {
  await client.submitArtifactDecision({
    id: opts.id,
    version: opts.version,
    decision: opts.decision,
  });
  console.log(`${opts.decision} recorded for ${opts.id} v${opts.version}`);
}

async function reviewReopen(client: AuraClient, id: string, version: number): Promise<void> {
  await client.reopenArtifactReview(id, version);
  console.log(`review reopened for ${id} v${version}`);
}

// ---------------------------------------------------------------------------
// wiki subcommands
// ---------------------------------------------------------------------------

async function wikiGet(client: AuraClient, opts: { slug?: string; uuid?: string }): Promise<void> {
  let node: KnowledgeNode;
  if (opts.uuid) {
    node = await client.getKnowledgeNode(opts.uuid, { includeBody: true });
  } else if (opts.slug) {
    // Seam B: the CLI --slug is the full slash-separated path (e.g. "daten/chat").
    // Split into spaceSlug (first segment) + path (remainder).
    const slashIdx = opts.slug.indexOf("/");
    const spaceSlug = slashIdx === -1 ? opts.slug : opts.slug.slice(0, slashIdx);
    const path = slashIdx === -1 ? "" : opts.slug.slice(slashIdx + 1);
    node = await client.getKnowledgeNodeByPath(spaceSlug, path, { includeBody: true });
  } else {
    fail("wiki get requires --slug or --uuid", true);
  }
  const body = node.body ?? "";
  const dir = freshWorkdir("aura-wiki");
  writeWorkdir(dir, {
    kind: "wiki",
    node_uuid: node.id,
    slug: node.slug ?? opts.slug ?? "",
    title: node.title ?? "",
    version: node.latest_version ?? 0,
  }, body);
  console.log(`workdir: ${dir}/`);
  console.error(`  ${node.title ?? "(untitled)"}  ${node.slug ?? ""}  (v${node.latest_version ?? 0}, ${body.length} bytes)`);
}

async function wikiSave(client: AuraClient, dir: string, summary?: string): Promise<void> {
  const meta = readWorkdirMeta(dir);
  if (meta.kind !== "wiki") fail(`workdir ${dir} is not a wiki workdir`);
  const bodyPath = join(dir, "body.md");
  if (!existsSync(bodyPath)) fail(`workdir ${dir} has no body.md`);
  const body = readFileSync(bodyPath, "utf8");
  await client.saveKnowledgeNodeBody({
    uuid: meta.node_uuid,
    body,
    summary: summary ?? `Updated via aura.mjs`,
  });
  removeWorkdir(dir);
  console.error(`saved ${meta.slug}; cleaned up ${dir}/`);
}

async function wikiSearch(client: AuraClient, query: string, spaceSlug?: string, limit?: number): Promise<void> {
  const res: WikiSearchResult = await client.mcpWikiSearch({
    query,
    space_slug: spaceSlug,
    limit: limit ?? 10,
  });
  for (const it of res.items) {
    console.log(`- ${it.title}  [${it.space_slug}]  (${it.url})`);
  }
}

async function wikiTree(client: AuraClient, slug: string): Promise<void> {
  const res: KnowledgeTree = await client.getKnowledgeTree(slug);
  console.log(JSON.stringify(res, null, 2));
}

async function wikiCreate(client: AuraClient, opts: { space: string; title: string; slug: string }): Promise<void> {
  const res = await client.createKnowledgeNode({
    space_slug: opts.space,
    kind: "DOCUMENT",
    title: opts.title,
    slug: opts.slug,
  });
  console.log(res.id);
}

// ---------------------------------------------------------------------------
// upload subcommands (file-based: base64 stays on disk, out of LLM context)
// ---------------------------------------------------------------------------

async function uploadCreate(client: AuraClient, opts: { file: string; mime?: string; filename?: string }): Promise<void> {
  const buf = readFileSync(opts.file);
  const contentBase64 = buf.toString("base64");
  const filename = opts.filename ?? opts.file.split("/").pop() ?? "upload";
  const res = await client.mcpCreateUploadDocument({
    filename,
    content_base64: contentBase64,
    mime_type: opts.mime ?? "application/octet-stream",
  });
  console.log(res.id);
}

async function uploadGet(client: AuraClient, id: string, outPath?: string): Promise<void> {
  const doc: UploadDocument = await client.mcpGetUploadDocument(id);
  // Domain UploadDocument.pages items use `content` (not `text`); map accordingly.
  const text = doc.pages.map((p) => p.content ?? "").join("\n\n---\n\n");
  const summary = `# ${doc.filename}\n\n- mime: ${doc.mime_type}\n- size: ${doc.byte_size ?? "?"} bytes\n- pages: ${doc.page_count ?? "?"}\n- ingest: ${doc.ingest_status ?? "?"}\n- summary: ${doc.summary ?? ""}\n\n## Extracted text\n\n${text}\n`;
  if (outPath) {
    writeFileSync(outPath, summary, "utf8");
    console.log(`wrote ${outPath} (${summary.length} bytes)`);
  } else if (summary.length <= LARGE_BODY_THRESHOLD * 4) {
    process.stdout.write(summary);
  } else {
    const dir = freshWorkdir("aura-upload");
    writeFileSync(join(dir, "parsed.md"), summary, "utf8");
    console.log(`workdir: ${dir}/`);
    console.error(`  ${doc.filename}  (${summary.length} bytes) — parsed text in parsed.md`);
  }
}

// ---------------------------------------------------------------------------
// arg parsing + dispatch
// ---------------------------------------------------------------------------

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// REST index resolution (inlined blob → OpenApiIndex, or dev-mode fallback)
// ---------------------------------------------------------------------------

/**
 * Resolve the REST operation index for list/describe/call. The committed
 * bundle uses the inlined REST_INDEX metadata (no openapi.yaml at runtime).
 * In dev/source mode (REST_INDEX absent), fall back to loadOpenApi.
 */
function getRestIndex(): OpenApiIndex {
  if (REST_INDEX) {
    const index: OpenApiIndex = {};
    for (const m of REST_INDEX.metadata) {
      index[m.operationId] = {
        operationId: m.operationId,
        method: m.method,
        path: m.path,
        pathParams: m.pathParams,
        queryParams: m.queryParams,
        body: m.body,
        tags: m.tags,
        summary: m.summary,
        // description omitted in slim metadata (stays in FTS text only)
        responses: m.responses,
      };
    }
    return index;
  }
  // Dev fallback: read openapi.yaml from the repo root.
  const openApiPath = resolve(process.cwd(), "packages", "shared", "openapi", "openapi.yaml");
  return loadOpenApi(openApiPath);
}

async function main(): Promise<void> {
  const group = process.argv[2];
  const sub = process.argv[3];
  const rest = process.argv.slice(4);

  // The `rest` group's list/describe subcommands are pure metadata (no
  // network, no auth); do NOT eagerly resolve credentials for them.
  // Only construct the client for groups that actually need it.
  const needsClient = group !== "rest";
  const client = needsClient ? await createDefaultAuraClient() : null as never;

  try {
    if (group === "artifact") {
      switch (sub) {
        case "get": {
          const id = rest[0];
          if (!id) fail("artifact get: missing <artifact-uuid>", true);
          await artifactGet(client, id);
          return;
        }
        case "update": {
          const dir = rest[0];
          if (!dir) fail("artifact update: missing <workdir>", true);
          const flags = parseFlags(rest.slice(1));
          await artifactUpdate(client, resolve(dir), flags.summary);
          return;
        }
        case "create": {
          const flags = parseFlags(rest);
          if (!flags.title || !flags.kind) fail("artifact create: --title and --kind required", true);
          await artifactCreate(client, {
            title: flags.title,
            kind: flags.kind,
            bodyFile: flags["body-file"],
            summary: flags.summary,
          });
          return;
        }
        case "section": {
          const id = rest[0];
          const flags = parseFlags(rest.slice(1));
          if (!id || !flags.heading || !flags.body || !flags.summary) {
            fail("artifact section: <id> --heading H --body B --summary S required", true);
          }
          await artifactSection(client, id, flags.heading, flags.body, flags.summary);
          return;
        }
        case "cleanup": {
          if (rest[0] === "--stale") { cleanupStale(); return; }
          const dir = rest[0];
          if (!dir) fail("artifact cleanup: <workdir> or --stale required", true);
          removeWorkdir(resolve(dir));
          console.error(`cleaned up ${dir}`);
          return;
        }
        case "review-get": {
          const id = rest[0];
          if (!id) fail("artifact review-get: missing <id>", true);
          await reviewGet(client, id);
          return;
        }
        case "review-approvals": {
          const id = rest[0];
          if (!id) fail("artifact review-approvals: missing <id>", true);
          await reviewApprovals(client, id);
          return;
        }
        case "review-request": {
          const id = rest[0];
          if (!id) fail("artifact review-request: missing <id>", true);
          await reviewRequest(client, id);
          return;
        }
        case "review-start": {
          const id = rest[0];
          if (!id) fail("artifact review-start: missing <id>", true);
          const flags = parseFlags(rest.slice(1));
          if (!flags.version) fail("artifact review-start: --version required", true);
          if (!flags.roles) fail("artifact review-start: --roles required", true);
          if (!flags["user-ids"]) fail("artifact review-start: --user-ids required", true);
          const version = Number(flags.version);
          if (!Number.isFinite(version)) fail("artifact review-start: --version must be a number", true);
          const roles = parseCsv(flags.roles) as ReviewerRole[];
          const userIds = parseCsv(flags["user-ids"]);
          await reviewStart(client, { id, version, roles, userIds, deadline: flags.deadline });
          return;
        }
        case "review-decide": {
          const id = rest[0];
          if (!id) fail("artifact review-decide: missing <id>", true);
          const flags = parseFlags(rest.slice(1));
          if (!flags.version) fail("artifact review-decide: --version required", true);
          if (!flags.decision) fail("artifact review-decide: --decision required", true);
          const version = Number(flags.version);
          if (!Number.isFinite(version)) fail("artifact review-decide: --version must be a number", true);
          const decision = flags.decision.toUpperCase();
          if (decision !== "APPROVED" && decision !== "REJECTED") {
            fail("artifact review-decide: --decision must be APPROVED or REJECTED", true);
          }
          await reviewDecide(client, { id, version, decision });
          return;
        }
        case "review-reopen": {
          const id = rest[0];
          if (!id) fail("artifact review-reopen: missing <id>", true);
          const flags = parseFlags(rest.slice(1));
          if (!flags.version) fail("artifact review-reopen: --version required", true);
          const version = Number(flags.version);
          if (!Number.isFinite(version)) fail("artifact review-reopen: --version must be a number", true);
          await reviewReopen(client, id, version);
          return;
        }
        default: fail(`artifact: unknown subcommand "${sub}"`, true);
      }
    } else if (group === "wiki") {
      switch (sub) {
        case "get": {
          const flags = parseFlags(rest);
          if (!flags.slug && !flags.uuid) fail("wiki get: --slug or --uuid required", true);
          await wikiGet(client, { slug: flags.slug, uuid: flags.uuid });
          return;
        }
        case "save": {
          const dir = rest[0];
          if (!dir) fail("wiki save: missing <workdir>", true);
          const flags = parseFlags(rest.slice(1));
          await wikiSave(client, resolve(dir), flags.summary);
          return;
        }
        case "search": {
          const query = rest[0];
          if (!query) fail("wiki search: missing <query>", true);
          const flags = parseFlags(rest.slice(1));
          await wikiSearch(client, query, flags.space, flags.limit ? Number(flags.limit) : undefined);
          return;
        }
        case "tree": {
          const flags = parseFlags(rest);
          if (!flags.slug) fail("wiki tree: --slug required", true);
          await wikiTree(client, flags.slug);
          return;
        }
        case "create": {
          const flags = parseFlags(rest);
          if (!flags.space || !flags.title || !flags.slug) fail("wiki create: --space --title --slug required", true);
          await wikiCreate(client, { space: flags.space, title: flags.title, slug: flags.slug });
          return;
        }
        default: fail(`wiki: unknown subcommand "${sub}"`, true);
      }
    } else if (group === "upload") {
      switch (sub) {
        case "create": {
          const flags = parseFlags(rest);
          if (!flags.file) fail("upload create: --file required", true);
          await uploadCreate(client, { file: flags.file, mime: flags.mime, filename: flags.filename });
          return;
        }
        case "get": {
          const id = rest[0];
          if (!id) fail("upload get: missing <upload-uuid>", true);
          const flags = parseFlags(rest.slice(1));
          await uploadGet(client, id, flags.out);
          return;
        }
        default: fail(`upload: unknown subcommand "${sub}"`, true);
      }
    } else if (group === "rest") {
      // The committed bundle uses the inlined REST_INDEX (no openapi.yaml read
      // at runtime). In dev/source mode (REST_INDEX absent), fall back to
      // loadOpenApi reading the YAML from the repo root.
      const index = getRestIndex();
      switch (sub) {
        case "list": {
          restList(index, console);
          return;
        }
        case "describe": {
          const opId = rest[0];
          if (!opId) fail("rest describe: missing <operationId>", true);
          restDescribe(index, opId, console);
          return;
        }
        case "call": {
          const opId = rest[0];
          if (!opId) fail("rest call: missing <operationId>", true);
          const callArgs = parseCallArgs(rest.slice(1));
          const body = resolveBody(callArgs);
          // Resolve credentials lazily — only rest call needs them.
          const credentials = await resolveAuraCredentials();
          await restCall(index, credentials, {
            operationId: opId,
            params: callArgs.params,
            body,
          }, console);
          return;
        }
        case "search": {
          const query = rest[0];
          if (!query) fail("rest search: missing <query>", true);
          const flags = parseFlags(rest.slice(1));
          // Create an embed provider at runtime (null when not configured → FTS-only)
          const { createEmbedProvider, loadEmbedSettings } = await import("@pi-aura/shared/embed/provider");
          const embedSettings = loadEmbedSettings();
          const embedProvider = await createEmbedProvider(embedSettings);
          await restSearch(REST_INDEX, query, console, {
            limit: flags.limit ? Number(flags.limit) : undefined,
            embedProvider,
          });
          return;
        }
        default: fail(`rest: unknown subcommand "${sub}"`, true);
      }
    } else {
      fail(group ? `unknown group "${group}"` : "missing group", true);
    }
  } catch (e) {
    console.error("aura failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error("aura failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
