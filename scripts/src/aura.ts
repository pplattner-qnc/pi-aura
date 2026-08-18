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
// Auth: reuses bearerClient("aura-mcp-dev") (HTTP + bearer from mcp.json),
// configurable via settings.aura.mcpServers.aura. The MCP SDK is bundled at
// build time; only @napi-rs/keyring is external (and this script doesn't use it).

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { bearerClient } from "./clients.js";
import { loadSettings } from "./settings.js";
import type { McpClient } from "./mcp-client.js";

const USAGE = `Usage:
  node aura.mjs artifact get <artifact-uuid>              fetch body+meta into a workdir
  node aura.mjs artifact update <workdir> [--summary S]   upload from workdir, then remove it
  node aura.mjs artifact create --title T --kind K [--body-file F] [--summary S]
  node aura.mjs artifact section <id> --heading H --body B --summary S
  node aura.mjs artifact cleanup <workdir> | --stale
  node aura.mjs wiki get --slug "eng/auth" | --uuid <node-uuid>   fetch body+meta into a workdir
  node aura.mjs wiki save <workdir> [--summary S]                upload, then remove workdir
  node aura.mjs wiki search "<query>" [--space <slug>] [--limit N]
  node aura.mjs wiki tree --slug "<space>"
  node aura.mjs wiki create --space <slug> --title T --slug S    prints new node uuid
  node aura.mjs upload create --file <path> [--mime <type>] [--filename <name>]
  node aura.mjs upload get <upload-uuid> [--out <path>]          parsed text to file (or stdout if small)`;

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
// Aura API response shapes (subset)
// ---------------------------------------------------------------------------

interface ArtifactDetail {
  id: string;
  title: string;
  current_version: number;
  kind: string;
  [k: string]: unknown;
}
interface WikiNodeDetail {
  uuid?: string;
  slug?: string;
  title?: string;
  version?: number;
  body?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// artifact subcommands
// ---------------------------------------------------------------------------

async function artifactGet(client: McpClient, id: string): Promise<void> {
  // getArtifact returns { id, title, latest_version, body, kind, ... } directly
  // (the McpClient already unwraps the MCP content block + parses the JSON).
  const detail = await client.callTool<ArtifactDetail & { body?: string; latest_version?: number }>("getArtifact", { id });
  const body = detail.body ?? "";
  const dir = freshWorkdir("aura-artifact");
  writeWorkdir(dir, {
    kind: "artifact",
    artifact_id: id,
    version: detail.current_version ?? detail.latest_version ?? 0,
    title: detail.title ?? "",
    artifact_kind: detail.kind ?? "GENERIC",
  }, body);
  // stdout: the workdir path + a one-line summary. Body never on stdout.
  console.log(`workdir: ${dir}/`);
  console.error(`  ${detail.title ?? "(untitled)"}  v${detail.current_version ?? 0}  (${body.length} bytes)`);
  await client.close();
}

async function artifactUpdate(client: McpClient, dir: string, summary?: string): Promise<void> {
  const meta = readWorkdirMeta(dir);
  if (meta.kind !== "artifact") fail(`workdir ${dir} is not an artifact workdir`);
  const bodyPath = join(dir, "body.md");
  if (!existsSync(bodyPath)) fail(`workdir ${dir} has no body.md`);
  const body = readFileSync(bodyPath, "utf8");
  await client.callTool("mcpUpdateArtifact", {
    id: meta.artifact_id,
    mode: "whole",
    body,
    summary: summary ?? `Updated via aura.mjs (v${meta.version} → next)`,
    confirm_full_replace: true,
  });
  removeWorkdir(dir);
  console.error(`updated ${meta.artifact_id}; cleaned up ${dir}/`);
  await client.close();
}

async function artifactCreate(client: McpClient, opts: { title: string; kind: string; bodyFile?: string; summary?: string }): Promise<void> {
  let body = "";
  if (opts.bodyFile) {
    body = readFileSync(opts.bodyFile, "utf8");
    if (body.length < LARGE_BODY_THRESHOLD) console.error(`note: body is ${body.length} bytes (≤ ${LARGE_BODY_THRESHOLD}); a direct mcpCreateArtifact call would also be fine.`);
  }
  const created = await client.callTool<{ id?: string; current_version?: number }>("mcpCreateArtifact", {
    title: opts.title,
    kind: opts.kind,
    body,
    summary: opts.summary ?? "Initial version",
  });
  if (opts.bodyFile) rmSync(opts.bodyFile, { force: true });
  console.log(`created ${created.id ?? "?"} (v${created.current_version ?? 1})`);
  await client.close();
}

async function artifactSection(client: McpClient, id: string, heading: string, body: string, summary: string): Promise<void> {
  await client.callTool("mcpUpdateArtifact", {
    id,
    mode: "section",
    target_heading: heading,
    body,
    summary,
  });
  console.error(`updated section ${heading} of ${id}`);
  await client.close();
}

// ---------------------------------------------------------------------------
// wiki subcommands
// ---------------------------------------------------------------------------

async function wikiGet(client: McpClient, opts: { slug?: string; uuid?: string }): Promise<void> {
  let node: WikiNodeDetail;
  if (opts.uuid) {
    node = await client.callTool<WikiNodeDetail>("getKnowledgeNode", { uuid: opts.uuid, include_body: true });
  } else if (opts.slug) {
    node = await client.callTool<WikiNodeDetail>("getKnowledgeNodeByPath", { slug: opts.slug, include_body: true });
  } else {
    fail("wiki get requires --slug or --uuid", true);
  }
  const body = node.body ?? "";
  const dir = freshWorkdir("aura-wiki");
  writeWorkdir(dir, {
    kind: "wiki",
    node_uuid: node.uuid ?? "",
    slug: node.slug ?? opts.slug ?? "",
    title: node.title ?? "",
    version: node.version ?? 0,
  }, body);
  console.log(`workdir: ${dir}/`);
  console.error(`  ${node.title ?? "(untitled)"}  ${node.slug ?? ""}  (v${node.version ?? 0}, ${body.length} bytes)`);
  await client.close();
}

async function wikiSave(client: McpClient, dir: string, summary?: string): Promise<void> {
  const meta = readWorkdirMeta(dir);
  if (meta.kind !== "wiki") fail(`workdir ${dir} is not a wiki workdir`);
  const bodyPath = join(dir, "body.md");
  if (!existsSync(bodyPath)) fail(`workdir ${dir} has no body.md`);
  const body = readFileSync(bodyPath, "utf8");
  await client.callTool("saveKnowledgeNodeBody", {
    uuid: meta.node_uuid,
    body,
    summary: summary ?? `Updated via aura.mjs`,
  });
  removeWorkdir(dir);
  console.error(`saved ${meta.slug}; cleaned up ${dir}/`);
  await client.close();
}

async function wikiSearch(client: McpClient, query: string, spaceSlug?: string, limit?: number): Promise<void> {
  const res = await client.callTool<{ items?: Array<{ slug?: string; title?: string; score?: number }> }>("mcpWikiSearch", {
    query,
    space_slug: spaceSlug,
    limit: limit ?? 10,
  });
  for (const it of res.items ?? []) {
    console.log(`- ${it.title ?? "(untitled)"}  [${it.slug ?? ""}]${it.score !== undefined ? ` (${it.score.toFixed(3)})` : ""}`);
  }
  await client.close();
}

async function wikiTree(client: McpClient, slug: string): Promise<void> {
  const res = await client.callTool<unknown>("getKnowledgeTree", { slug });
  console.log(JSON.stringify(res, null, 2));
  await client.close();
}

async function wikiCreate(client: McpClient, opts: { space: string; title: string; slug: string }): Promise<void> {
  const res = await client.callTool<{ uuid?: string }>("createKnowledgeNode", {
    space_slug: opts.space,
    kind: "DOCUMENT",
    title: opts.title,
    slug: opts.slug,
  });
  console.log(res.uuid ?? "(created, no uuid returned)");
  await client.close();
}

// ---------------------------------------------------------------------------
// upload subcommands (file-based: base64 stays on disk, out of LLM context)
// ---------------------------------------------------------------------------

async function uploadCreate(client: McpClient, opts: { file: string; mime?: string; filename?: string }): Promise<void> {
  const buf = readFileSync(opts.file);
  const contentBase64 = buf.toString("base64");
  const filename = opts.filename ?? opts.file.split("/").pop() ?? "upload";
  const res = await client.callTool<{ id?: string }>("mcpCreateUploadDocument", {
    filename,
    content_base64: contentBase64,
    mime_type: opts.mime ?? "application/octet-stream",
  });
  console.log(res.id ?? "(created, no id returned)");
  await client.close();
}

interface UploadDocumentDetail {
  id?: string;
  filename?: string;
  mime_type?: string;
  byte_size?: number;
  page_count?: number;
  ingest_status?: string;
  summary?: string;
  pages?: Array<{ text?: string }>;
  [k: string]: unknown;
}

async function uploadGet(client: McpClient, id: string, outPath?: string): Promise<void> {
  const doc = await client.callTool<UploadDocumentDetail>("mcpGetUploadDocument", { id });
  const text = (doc.pages ?? []).map((p) => p.text ?? "").join("\n\n---\n\n");
  const summary = `# ${doc.filename ?? id}\n\n- mime: ${doc.mime_type ?? "?"}\n- size: ${doc.byte_size ?? "?"} bytes\n- pages: ${doc.page_count ?? "?"}\n- ingest: ${doc.ingest_status ?? "?"}\n- summary: ${doc.summary ?? ""}\n\n## Extracted text\n\n${text}\n`;
  if (outPath) {
    writeFileSync(outPath, summary, "utf8");
    console.log(`wrote ${outPath} (${summary.length} bytes)`);
  } else if (summary.length <= LARGE_BODY_THRESHOLD * 4) {
    process.stdout.write(summary);
  } else {
    const dir = freshWorkdir("aura-upload");
    writeFileSync(join(dir, "parsed.md"), summary, "utf8");
    console.log(`workdir: ${dir}/`);
    console.error(`  ${doc.filename ?? id}  (${summary.length} bytes) — parsed text in parsed.md`);
  }
  await client.close();
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

async function main(): Promise<void> {
  const group = process.argv[2];
  const sub = process.argv[3];
  const rest = process.argv.slice(4);
  const settings = loadSettings();
  const client = bearerClient(settings.mcpServers.aura);
  await client.connect();

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
