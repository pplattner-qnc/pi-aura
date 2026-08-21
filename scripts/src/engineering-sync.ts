// engineering-sync.ts — the `engineering-sync` skill's CLI utility.
//
// Package-author-only maintenance tool that keeps the local
// `engineering-foundation` mirror (under
// `skills/engineering-workflow/resources/`) fresh against the Aura wiki,
// via a three-way reconciliation flow with a `finish` gate.
//
// The agent is the mergetool. This utility only:
//   - `fetch`: stages three-way files for edits/adds, auto-deletes removes,
//     and writes a JSON of the new sha256s;
//   - `finish`: gates (refuses on unresolved three-way files), then updates
//     the committed drift manifest under `.pi/`.
//
// Two sources of truth on the wiki:
//   1. Blueprint files — fetched via `getBlueprintFiles` (path under
//      `blueprint/`; carries `checksum` = `sha256:<hex>` + `version`).
//   2. Wiki documents — fetched via `getKnowledgeTree` +
//      `getKnowledgeNode` / `getKnowledgeNodeVersion` (keyed by node uuid;
//      carries `body_hash`, `latest_version`, `updated_at`).
//
// Usage:
//   node engineering-sync.mjs fetch                    stage three-way files + new-hashes json
//   node engineering-sync.mjs finish                    gate, then update the manifest
//   node engineering-sync.mjs status                    show drift vs manifest (read-only)
//
// Auth: createDefaultAuraClient() — same REST + keyring PAT path as `aura.ts`.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { load } from "js-yaml";
import { createDefaultAuraClient } from "@pi-aura/shared/aura-client";
import type {
  AuraClient,
  BlueprintFile,
  GetBlueprintFilesResult,
  KnowledgeNode,
  KnowledgeNodeVersion,
  KnowledgeTree,
} from "@pi-aura/shared/aura-client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Wiki space slug for the engineering-foundation canon. */
const SPACE_SLUG = "engineering-foundation";

// Repo root resolution. Under esbuild (the shipped .mjs) a banner provides
// __dirname; under tsx (tests, `node --experimental-strip-types`) __dirname
// is undefined in ESM. Resolve defensively so the module loads in both.
function resolveRepoRoot(): string {
  try {
    if (typeof __dirname !== "undefined") {
      return resolve(__dirname, "..", "..", "..", "..");
    }
  } catch { /* __dirname not defined (ESM without the esbuild banner) */ }
  // ESM fallback: derive from import.meta.url if available.
  try {
    const url = (import.meta as { url?: string }).url;
    if (url) {
      const { fileURLToPath } = require("node:url") as typeof import("node:url");
      const { dirname } = require("node:path") as typeof import("node:path");
      return resolve(dirname(fileURLToPath(url)), "..", "..", "..", "..", "..", "src").replace(/\/src$/, "");
    }
  } catch { /* fall through */ }
  // Last resort: process.cwd() (tests stub filesystem paths anyway).
  return process.cwd();
}

/** Repo root = four levels up from this script's dist location
 *  (.pi/skills/engineering-sync/dist/engineering-sync.mjs -> repo root).
 *  Tests don't depend on this being correct — they stub paths. */
const REPO_ROOT = resolveRepoRoot();

/** The local mirror root. */
const MIRROR_ROOT = join(REPO_ROOT, "skills", "engineering-workflow", "resources");

/** The drift manifest path (committed, under .pi/, invisible to skill discovery). */
const MANIFEST_PATH = join(REPO_ROOT, ".pi", "engineering-foundation.json");

/** Suffix naming for three-way + ignore files (Q15: suffix, base name
 *  leading). The suffix is inserted between the stem and the original
 *  extension, so the original extension is preserved:
 *    c.md            -> c.OLD_REMOTE.md / c.NEW_REMOTE.md / c.CURRENT.md
 *    tracker-aura.mdc -> tracker-aura.OLD_REMOTE.mdc / ...
 *    (ignore tombstone) -> tracker-aura.IGNORE (no extension) */
const OLD_REMOTE_SUFFIX = ".OLD_REMOTE";
const NEW_REMOTE_SUFFIX = ".NEW_REMOTE";
const CURRENT_SUFFIX = ".CURRENT";
/** The ignore tombstone suffix (no extension — it's not a content file). */
const IGNORE_SUFFIX = ".IGNORE";

/** The router SKILL.md is an authored file (no wiki counterpart to sha256
 *  against); the sync surfaces a diff prompt when the wiki's structure
 *  changes. Tracked in the manifest with `authored: true`. */
const AUTHORED_ROUTER_PATH = join(REPO_ROOT, "skills", "engineering-workflow", "SKILL.md");

/** Rules live under resources/rules/ as .mdc files (Q: one directory). */
// (Path derived dynamically per node; no constant needed.)

/** Blueprint files live under resources/blueprint/ (manifest.yaml + skills/). */
// (Path derived dynamically per node; no constant needed.)

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

/** One entry per mirrored item, keyed by wiki canonical identity (blueprint
 *  file path for blueprint files, knowledge-node uuid for wiki docs). */
interface ManifestEntry {
  /** Wiki canonical identity: blueprint path (e.g. `blueprint/skills/ai-setup/skill.md`)
   *  or knowledge-node uuid. */
  wikiPathOrUuid: string;
  /** Local repo path, relative to repo root. */
  localPath: string;
  /** sha256 of the verbatim source bytes as last recorded (the wiki's content),
   *  prefixed `sha256:<hex>`. */
  sourceSha256: string;
  /** Aura's checksum (blueprint `checksum`) or version (wiki `latest_version`),
   *  whichever the source provides. */
  auraChecksumOrVersion: string;
  /** Aura `updated_at` (wiki docs) or provenance commit sha (blueprint). */
  auraUpdatedAt: string;
  /** sha256 of the local adapted file, if the file is adapted (not verbatim).
   *  Absent for verbatim copies. */
  adaptedSha256?: string;
  /** True if this item is reconciled-as-not-belonging (e.g. tracker-aura). */
  ignored?: boolean;
  /** Mandatory when `ignored` is true. */
  ignoreReason?: string;
  /** True for authored files with no wiki counterpart (e.g. the
   *  engineering-workflow router SKILL.md). */
  authored?: boolean;
  /** Wiki node kind, for wiki docs (`DOCUMENT` | `FILE`); absent for blueprint. */
  kind?: string;
  /** Slug path of the wiki node (for wiki docs). */
  slug?: string;
}

interface Manifest {
  /** Schema version of the manifest format. */
  version: number;
  /** Slug of the wiki space this manifest tracks. */
  space: string;
  /** Keyed by wikiPathOrUuid. */
  entries: Record<string, ManifestEntry>;
}

// ---------------------------------------------------------------------------
// Logging + exit
// ---------------------------------------------------------------------------

function fail(msg: string, code = 2): never {
  console.error(`engineering-sync: error: ${msg}`);
  process.exit(code);
}

function info(msg: string): void {
  console.error(`engineering-sync: ${msg}`);
}

// ---------------------------------------------------------------------------
// Manifest I/O
// ---------------------------------------------------------------------------

function emptyManifest(): Manifest {
  return { version: 1, space: SPACE_SLUG, entries: {} };
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return emptyManifest();
  try {
    const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
    if (typeof raw !== "object" || raw === null || typeof raw.entries !== "object") {
      fail(`manifest at ${MANIFEST_PATH} is not a valid manifest object`);
    }
    return raw;
  } catch (e) {
    fail(`failed to read manifest at ${MANIFEST_PATH}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function saveManifest(m: Manifest): void {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n", "utf8");
  info(`updated ${relative(REPO_ROOT, MANIFEST_PATH)} (${Object.keys(m.entries).length} entries)`);
}

// ---------------------------------------------------------------------------
// sha256 helper
// ---------------------------------------------------------------------------

function sha256(data: string | Buffer): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Blueprint manifest parsing
// ---------------------------------------------------------------------------

/** Shape of `blueprint/manifest.yaml` — a list of building blocks each with a
 *  `path` (under blueprint/) and a `checksum` (`sha256:<hex>`). We are
 *  intentionally loose: only read what we need to enumerate the file list. */
interface BlueprintManifestEntry {
  path: string;
  checksum?: string;
  version?: number;
  [k: string]: unknown;
}
interface BlueprintManifest {
  files?: BlueprintManifestEntry[];
  blocks?: BlueprintManifestEntry[];
  [k: string]: unknown;
}

function parseBlueprintManifest(content: string): BlueprintManifestEntry[] {
  const parsed = load(content) as BlueprintManifest;
  // The manifest uses either `files:` or `blocks:`; accept both and also a
  // bare top-level list. Be defensive — the exact shape is wiki-defined.
  const list = (parsed.files ?? parsed.blocks ?? []) as BlueprintManifestEntry[];
  if (!Array.isArray(list)) return [];
  return list.filter((e) => e && typeof e.path === "string");
}

// ---------------------------------------------------------------------------
// Enumerate the wiki: blueprint files + wiki document nodes
// ---------------------------------------------------------------------------

/** A unified view of a mirrored item, regardless of source. */
export interface MirroredItem {
  /** Wiki canonical identity (blueprint path or node uuid). */
  key: string;
  /** Source: 'blueprint' | 'wiki-doc' | 'wiki-file'. */
  source: "blueprint" | "wiki-doc";
  /** Local repo path (relative to repo root). */
  localPath: string;
  /** Current sha256 of the verbatim source bytes (from the wiki), if known. */
  remoteSha256?: string;
  /** Aura checksum or version string. */
  auraChecksumOrVersion?: string;
  /** Aura updated_at or provenance commit sha. */
  auraUpdatedAt?: string;
  /** Wiki node kind (for wiki docs). */
  kind?: string;
  /** Wiki slug path (for wiki docs). */
  slug?: string;
  /** True if the manifest marks this item ignored. */
  ignored?: boolean;
}

/** Fetch the blueprint manifest + every blueprint file it lists. Returns the
 *  unified items plus the raw BlueprintFile payloads (for content writes). */
async function fetchBlueprintItems(client: AuraClient): Promise<{ items: MirroredItem[]; files: Map<string, BlueprintFile> }> {
  const items: MirroredItem[] = [];
  const files = new Map<string, BlueprintFile>();

  // 1. Fetch the manifest itself.
  const manifestRes = await client.getBlueprintFiles({ path: "manifest.yaml" });
  const manifestFile = manifestRes.files.find((f) => f.path === "blueprint/manifest.yaml" || f.filename === "manifest.yaml");
  if (manifestFile) {
    files.set(manifestFile.path, manifestFile);
    items.push({
      key: manifestFile.path,
      source: "blueprint",
      localPath: join("skills/engineering-workflow/resources/blueprint/manifest.yaml"),
      remoteSha256: manifestFile.checksum,
      auraChecksumOrVersion: manifestFile.checksum,
      auraUpdatedAt: manifestFile.provenance.source_commit_sha ?? "",
    });
  }

  // 2. Parse the manifest to enumerate every blueprint file path.
  if (!manifestFile) {
    info("warning: blueprint/manifest.yaml not found on wiki; skipping blueprint file enumeration");
    return { items, files };
  }
  const manifestEntries = parseBlueprintManifest(manifestFile.content);
  for (const entry of manifestEntries) {
    const bpPath = entry.path.startsWith("blueprint/") ? entry.path : `blueprint/${entry.path}`;
    // Fetch the file (current version).
    let res: GetBlueprintFilesResult;
    try {
      res = await client.getBlueprintFiles({ path: bpPath });
    } catch (e) {
      info(`warning: getBlueprintFiles(${bpPath}) failed: ${e instanceof Error ? e.message : String(e)} — skipping`);
      continue;
    }
    for (const f of res.files) {
      if (files.has(f.path)) continue;
      files.set(f.path, f);
      items.push({
        key: f.path,
        source: "blueprint",
        localPath: blueprintPathToLocal(f.path, f.filename),
        remoteSha256: f.checksum,
        auraChecksumOrVersion: f.checksum,
        auraUpdatedAt: f.provenance.source_commit_sha ?? "",
      });
    }
  }

  return { items, files };
}

/** Map a blueprint canonical path + filename to a local repo path (relative
 *  to repo root). Blueprint paths are lowercased slugs like
 *  `blueprint/skills/ai-setup/skill.md`; the verbatim filename is `SKILL.md`.
 *  We write the verbatim filename in the local tree. */
function blueprintPathToLocal(bpPath: string, filename: string): string {
  // Strip the leading `blueprint/`; the local tree mirrors under
  // resources/blueprint/.
  const under = bpPath.replace(/^blueprint\//, "");
  const dir = dirname(under);
  const localName = filename || basename(under);
  return join("skills/engineering-workflow/resources/blueprint", dir, localName);
}

/** Fetch the wiki tree and return a unified item per DOCUMENT/FILE node we
 *  mirror. The tree's body is omitted; we fetch bodies on demand in `fetch`. */
async function fetchWikiItems(client: AuraClient, manifest: Manifest): Promise<MirroredItem[]> {
  const tree: KnowledgeTree = await client.getKnowledgeTree(SPACE_SLUG);
  const items: MirroredItem[] = [];
  for (const node of tree.nodes) {
    // Skip folders — they carry no content.
    if (node.kind === "FOLDER") continue;
    // Map the node to a local path; skip nodes we don't mirror (e.g. nodes
    // outside the canon we track). We include every DOCUMENT/FILE node and
    // let the manifest's `ignored` flag exclude items (e.g. tracker-aura).
    const localPath = wikiNodeToLocalPath(node);
    if (!localPath) continue;
    const existing = manifest.entries[node.id];
    const ignored = existing?.ignored === true;
    items.push({
      key: node.id,
      source: "wiki-doc",
      localPath,
      kind: node.kind,
      slug: node.slug,
      ignored,
    });
  }
  return items;
}

/** Map a wiki node to its local repo path (relative to repo root), or
 *  `undefined` if the node is outside the mirror. The mirror layout (from the
 *  engineering-workflow SKILL.md):
 *    INDEX.md, Log.md, guides/*.md, workflow/*.md, rules/*.mdc
 *  Blueprint files come via getBlueprintFiles (not the wiki tree), so any
 *  node under a `blueprint/` path on the wiki is skipped here to avoid double
 *  counting. */
function wikiNodeToLocalPath(node: KnowledgeNode): string | undefined {
  // We key wiki docs by node uuid, but the local path is derived from the
  // node's slug/path. The wiki tree doesn't expose a full path directly;
  // the `source_path` field (bundle-relative, e.g. "daten/order.md") is the
  // most reliable join key when present. Fall back to slug. Both are surfaced
  // via the index signature on the mapped domain type.
  const n = node as KnowledgeNode & { source_path?: string };
  const base = n.source_path ?? node.slug;
  if (!base) return undefined;
  // Strip a leading space slug if present.
  let p = base.replace(new RegExp(`^${SPACE_SLUG}/?`), "");
  // Blueprint content is fetched via getBlueprintFiles, not the wiki tree —
  // skip nodes that live under blueprint/ on the wiki to avoid duplicates.
  if (p.startsWith("blueprint/")) return undefined;
  // The engineering-foundation canon maps to resources/ with a few renames:
  //   top-level INDEX.md / Log.md -> resources/INDEX.md / resources/Log.md
  //   guides/<x>.md              -> resources/guides/<x>.md
  //   workflow/<x>.md            -> resources/workflow/<x>.md
  //   rules/<x>.mdc              -> resources/rules/<x>.mdc
  // Anything else: mirror under resources/ preserving the path.
  const segs = p.split("/");
  const top = segs[0];
  const rest = segs.slice(1).join("/");
  if (top === "INDEX.md" || top === "Log.md") {
    return join("skills/engineering-workflow/resources", top);
  }
  if (top === "guides" || top === "workflow" || top === "rules") {
    return join("skills/engineering-workflow/resources", top, rest);
  }
  // Unknown structure: mirror under resources/ preserving the path so the
  // author sees it and can decide during reconciliation.
  return join("skills/engineering-workflow/resources", p);
}

// ---------------------------------------------------------------------------
// Three-way file helpers
// ---------------------------------------------------------------------------

/** Result of consuming an `.IGNORE` tombstone: the matched report item + the
 *  ignore reason read from the tombstone. The caller records the manifest
 *  entry and deletes the tombstone + paired NEW_REMOTE file. */
interface ConsumedTombstone {
  tombstonePath: string;
  item: MirroredItem & { remoteSha256?: string; auraChecksumOrVersion?: string; auraUpdatedAt?: string };
  reason: string;
}

/** Pure helper: match `.IGNORE` tombstones to their staged report items by
 *  stem (the tombstone `<stem>.IGNORE` pairs with a `NEW_REMOTE` for the
 *  same stem). Reads the tombstone reason text from disk. Returns the
 *  consumed list; tombstones with no matching staged item are skipped (the
 *  caller warns about them). Exported for unit testing. */
export function consumeIgnoreTombstones(
  tombstonePaths: string[],
  items: Array<MirroredItem & { remoteSha256?: string; auraChecksumOrVersion?: string; auraUpdatedAt?: string }>,
  _repoRoot: string,
): ConsumedTombstone[] {
  const consumed: ConsumedTombstone[] = [];
  for (const tombstone of tombstonePaths) {
    const reason = readFileSync(tombstone, "utf8").trim() || "ignored during reconciliation";
    const stem = basename(tombstone).slice(0, -IGNORE_SUFFIX.length);
    const matchingItem = items.find((it) => {
      const b = basename(it.localPath);
      const dot = b.lastIndexOf(".");
      return (dot > 0 ? b.slice(0, dot) : b) === stem;
    });
    if (!matchingItem) continue;
    consumed.push({ tombstonePath: tombstone, item: matchingItem, reason });
  }
  return consumed;
}

/** Suffix variants for a local file path. The suffix is inserted between
 *  the stem and the original extension, preserving the extension (Q15).
 *    c.md            -> c.OLD_REMOTE.md / c.NEW_REMOTE.md / c.CURRENT.md
 *    tracker-aura.mdc -> tracker-aura.OLD_REMOTE.mdc / ...
 *  The `.IGNORE` tombstone has no extension (see IGNORE_SUFFIX). */
export function suffixed(localAbs: string, suffix: string): string {
  const dir = dirname(localAbs);
  const base = basename(localAbs);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  return join(dir, stem + suffix + ext);
}

export function hasSuffix(localAbs: string): "OLD_REMOTE" | "NEW_REMOTE" | "CURRENT" | "IGNORE" | null {
  const b = basename(localAbs);
  // The marker sits between the stem and the extension: <stem>.<MARKER>[.ext]
  // For the IGNORE tombstone there is no extension: <stem>.IGNORE
  if (b.includes(".OLD_REMOTE")) return "OLD_REMOTE";
  if (b.includes(".NEW_REMOTE")) return "NEW_REMOTE";
  if (b.includes(".CURRENT")) return "CURRENT";
  if (b.endsWith(IGNORE_SUFFIX)) return "IGNORE";
  return null;
}

// ---------------------------------------------------------------------------
// fetch subcommand
// ---------------------------------------------------------------------------

interface FetchReport {
  added: string[];
  edited: string[];
  deleted: string[];
  unchanged: string[];
  ignored: string[];
  newHashes: Record<string, string>;
}

async function fetchCmd(): Promise<void> {
  const client = await createDefaultAuraClient();
  const manifest = loadManifest();

  info(`mirror root: ${relative(REPO_ROOT, MIRROR_ROOT)}`);
  info(`manifest: ${existsSync(MANIFEST_PATH) ? relative(REPO_ROOT, MANIFEST_PATH) : "(absent — initial seeding)"}`);

  // Enumerate remote state.
  const { items: bpItems, files: bpFiles } = await fetchBlueprintItems(client);
  const wikiItems = await fetchWikiItems(client, manifest);
  const remoteItems = new Map<string, MirroredItem>();
  for (const it of [...bpItems, ...wikiItems]) remoteItems.set(it.key, it);

  const report: FetchReport = {
    added: [],
    edited: [],
    deleted: [],
    unchanged: [],
    ignored: [],
    newHashes: {},
  };

  // --- Pass 1: remote items (add / edit / unchanged) ---
  for (const item of remoteItems.values()) {
    if (item.ignored) {
      report.ignored.push(item.key);
      continue;
    }
    const localAbs = join(REPO_ROOT, item.localPath);
    const existing = manifest.entries[item.key];
    const remoteSha = item.remoteSha256;

    // For wiki docs, fetch the body now to get the current sha256 (the tree
    // omits bodies). For blueprint files, the sha256 is already in remoteSha.
    let remoteBody: string | undefined;
    let remoteShaResolved = remoteSha;
    let auraUpdatedAt = item.auraUpdatedAt ?? "";
    let auraVer = item.auraChecksumOrVersion ?? "";

    if (item.source === "wiki-doc") {
      const node = await client.getKnowledgeNode(item.key);
      remoteBody = node.body ?? "";
      remoteShaResolved = (node as KnowledgeNode & { body_hash?: string }).body_hash
        ? "sha256:" + (node as KnowledgeNode & { body_hash?: string }).body_hash
        : sha256(remoteBody);
      auraVer = String(node.latest_version ?? 0);
      const updated = (node as KnowledgeNode & { updated_at?: string }).updated_at;
      if (updated) auraUpdatedAt = updated;
    }

    if (remoteShaResolved) report.newHashes[item.key] = remoteShaResolved;

    const localExists = existsSync(localAbs);
    const recordedSha = existing?.sourceSha256;

    if (!localExists && !existing) {
      // --- ADD (Q13): write only NEW_REMOTE; agent creates c.md from it ---
      mkdirSync(dirname(localAbs), { recursive: true });
      writeSuffixed(localAbs, NEW_REMOTE_SUFFIX, remoteBody ?? readBlueprintContent(bpFiles, item.key));
      report.added.push(item.localPath);
      info(`ADD  ${item.localPath}  -> ${basename(suffixed(localAbs, NEW_REMOTE_SUFFIX))}`);
    } else if (localExists) {
      // Compare the recorded remote sha to the new remote sha to decide edit
      // vs unchanged. On the first run (no manifest), every file is "new" per
      // Q12 — but the local file exists (the skeleton's .gitkeep's are not
      // .md), so treat existing local .md as CURRENT and stage a three-way.
      const isUnchanged = recordedSha && remoteShaResolved && recordedSha === remoteShaResolved;
      if (isUnchanged && !existing?.adaptedSha256) {
        // Also confirm the local file hasn't drifted from the adapted sha.
        report.unchanged.push(item.localPath);
        continue;
      }
      // --- EDIT: three-way (Q9/Q15/Q16) ---
      // 1. rename c.md -> c.CURRENT.md
      const currentPath = suffixed(localAbs, CURRENT_SUFFIX);
      if (!existsSync(currentPath)) {
        // Avoid clobbering an existing CURRENT from a prior un-finished run.
        renameSyncSafe(localAbs, currentPath);
      } else {
        // If CURRENT already exists, the local c.md was already moved in a
        // prior fetch that wasn't finished; leave it.
        rmSync(localAbs, { force: true });
      }
      // 2. write c.OLD_REMOTE.md (prior remote version, if recorded)
      if (existing?.sourceSha256) {
        const oldBody = await fetchOldRemote(client, item, existing);
        writeSuffixed(localAbs, OLD_REMOTE_SUFFIX, oldBody ?? "");
      }
      // 3. write c.NEW_REMOTE.md (new remote version)
      writeSuffixed(localAbs, NEW_REMOTE_SUFFIX, remoteBody ?? readBlueprintContent(bpFiles, item.key));
      report.edited.push(item.localPath);
      info(`EDIT ${item.localPath}  -> ${basename(suffixed(localAbs, NEW_REMOTE_SUFFIX))}`);
    } else {
      // localExists false but existing manifest entry — local file was
      // removed out of band; treat as add (re-create from NEW_REMOTE).
      mkdirSync(dirname(localAbs), { recursive: true });
      writeSuffixed(localAbs, NEW_REMOTE_SUFFIX, remoteBody ?? readBlueprintContent(bpFiles, item.key));
      report.added.push(item.localPath);
      info(`ADD  ${item.localPath} (local missing, manifest had entry) -> ${basename(suffixed(localAbs, NEW_REMOTE_SUFFIX))}`);
    }

    // Stash the resolved remote metadata on the item for the manifest update
    // (finish re-reads the report JSON to apply these).
    (item as MirroredItem & { remoteSha256?: string; auraChecksumOrVersion?: string; auraUpdatedAt?: string }).remoteSha256 = remoteShaResolved;
    (item as MirroredItem & { remoteSha256?: string; auraChecksumOrVersion?: string; auraUpdatedAt?: string }).auraChecksumOrVersion = auraVer;
    (item as MirroredItem & { remoteSha256?: string; auraChecksumOrVersion?: string; auraUpdatedAt?: string }).auraUpdatedAt = auraUpdatedAt;
  }

  // --- Pass 2: deletions (Q14: auto-delete + mark manifest; skip three-way) ---
  for (const [key, entry] of Object.entries(manifest.entries)) {
    if (entry.ignored) continue;
    if (entry.authored) continue; // authored files have no wiki counterpart
    if (!remoteItems.has(key)) {
      const localAbs = join(REPO_ROOT, entry.localPath);
      if (existsSync(localAbs)) {
        rmSync(localAbs, { force: true });
        info(`DELETE ${entry.localPath} (removed on wiki; git history preserves)`);
      }
      // Clean up any stray three-way files for the deleted item.
      for (const suffix of [OLD_REMOTE_SUFFIX, NEW_REMOTE_SUFFIX, CURRENT_SUFFIX]) {
        const p = suffixed(localAbs, suffix);
        if (existsSync(p)) rmSync(p, { force: true });
      }
      report.deleted.push(entry.localPath);
    }
  }

  // --- Authored files: surface a diff prompt when the wiki's structure changes ---
  await surfaceAuthoredDiff(client, manifest, report);

  // --- Write the new-hashes JSON (for the agent + finish) ---
  const reportPath = join(REPO_ROOT, ".pi", "engineering-sync-fetch-report.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  // Include the resolved remote metadata so `finish` can update the manifest
  // without re-fetching.
  const enrichedReport = {
    ...report,
    items: Array.from(remoteItems.values()).map((it) => ({
      key: it.key,
      source: it.source,
      localPath: it.localPath,
      remoteSha256: (it as MirroredItem & { remoteSha256?: string }).remoteSha256,
      auraChecksumOrVersion: (it as MirroredItem & { auraChecksumOrVersion?: string }).auraChecksumOrVersion,
      auraUpdatedAt: (it as MirroredItem & { auraUpdatedAt?: string }).auraUpdatedAt,
      kind: it.kind,
      slug: it.slug,
    })),
  };
  writeFileSync(reportPath, JSON.stringify(enrichedReport, null, 2) + "\n", "utf8");
  info(`wrote ${relative(REPO_ROOT, reportPath)}`);

  // --- Summary ---
  info("");
  info("summary:");
  info(`  added:    ${report.added.length}`);
  info(`  edited:   ${report.edited.length}`);
  info(`  deleted:   ${report.deleted.length}`);
  info(`  unchanged: ${report.unchanged.length}`);
  info(`  ignored:   ${report.ignored.length}`);
  if (report.added.length + report.edited.length > 0) {
    info("");
    info("next: reconcile the three-way clusters (OLD_REMOTE + NEW_REMOTE + CURRENT),");
    info("      then run `finish`.");
  } else if (report.deleted.length > 0) {
    info("");
    info("next: commit the deletions, then run `finish`.");
  } else {
    info("");
    info("nothing to reconcile; run `finish` to confirm (or stop here).");
  }
}

/** Fetch the OLD_REMOTE body for a wiki doc or blueprint file. */
async function fetchOldRemote(client: AuraClient, item: MirroredItem, entry: ManifestEntry): Promise<string | undefined> {
  if (item.source === "wiki-doc") {
    // Reconstruct the prior version via getKnowledgeNodeVersion. The manifest
    // recorded `auraChecksumOrVersion` as the prior `latest_version` (string);
    // the prior version is one less than the current, but we recorded the
    // version we last saw, so fetch that exact version.
    const ver = Number(entry.auraChecksumOrVersion);
    if (!Number.isFinite(ver) || ver <= 0) return undefined;
    try {
      const v: KnowledgeNodeVersion = await client.getKnowledgeNodeVersion(item.key, ver);
      return v.body;
    } catch {
      return undefined;
    }
  }
  // Blueprint: pin by the recorded checksum/version.
  try {
    const res = await client.getBlueprintFiles({ path: item.key, version: entry.sourceSha256 });
    return res.files.find((f) => f.path === item.key)?.content;
  } catch {
    return undefined;
  }
}

/** Get the content for a blueprint file from the fetched map. */
function readBlueprintContent(files: Map<string, BlueprintFile>, key: string): string {
  return files.get(key)?.content ?? "";
}

/** Authored files (e.g. the engineering-workflow router SKILL.md) have no wiki
 *  counterpart to sha256 against. When the wiki's *structure* for the topic
 *  changes (a guide added/removed/renamed), surface a diff prompt: write a
 *  NEW_REMOTE snapshot of the changed wiki node + a CURRENT snapshot of the
 *  router, so the agent reconciles the routing table. */
async function surfaceAuthoredDiff(client: AuraClient, manifest: Manifest, report: FetchReport): Promise<void> {
  if (!existsSync(AUTHORED_ROUTER_PATH)) return;
  const routerEntry = Object.values(manifest.entries).find((e) => e.authored && e.localPath === relative(REPO_ROOT, AUTHORED_ROUTER_PATH));
  // The router's "structure signature" is the set of wiki node slugs under
  // the space (guides/workflow/INDEX/Log). Compare to what we recorded.
  // On the first run (no manifest), there's nothing to diff against.
  if (!routerEntry) return;
  const tree = await client.getKnowledgeTree(SPACE_SLUG);
  const structureSlugs = tree.nodes
    .filter((n) => n.kind !== "FOLDER")
    .map((n) => n.slug)
    .sort()
    .join("\n");
  const structureSha = sha256(structureSlugs);
  if (routerEntry.sourceSha256 === structureSha) return; // no structural drift
  // Structural drift: write CURRENT snapshot of the router + a NEW_REMOTE
  // "structure digest" describing the new wiki structure.
  const routerAbs = AUTHORED_ROUTER_PATH;
  const currentPath = suffixed(routerAbs, CURRENT_SUFFIX);
  if (!existsSync(currentPath)) renameSyncSafe(routerAbs, currentPath);
  const digest = `# engineering-foundation wiki structure (NEW_REMOTE)\n\n` +
    `The wiki's structure has changed since the router was last reconciled.\n` +
    `Reconcile the routing table in the router SKILL.md against the structure below.\n\n` +
    `## Structural signature\n\n${structureSha}\n\n## Nodes (slug | kind | title)\n\n` +
    tree.nodes
      .filter((n) => n.kind !== "FOLDER")
      .map((n) => `- ${n.slug} | ${n.kind} | ${n.title}`)
      .join("\n") + "\n";
  writeSuffixed(routerAbs, NEW_REMOTE_SUFFIX, digest);
  report.edited.push(relative(REPO_ROOT, routerAbs));
  info(`EDIT (authored) ${relative(REPO_ROOT, routerAbs)} -> router reconciliation needed`);
  // Stash the new structure sha for finish.
  (routerEntry as ManifestEntry & { _newStructureSha?: string })._newStructureSha = structureSha;
}

// ---------------------------------------------------------------------------
// finish subcommand
// ---------------------------------------------------------------------------

/** Recursively scan a directory for three-way files. */
function scanThreeWay(dir: string): string[] {
  const found: string[] = [];
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...scanThreeWay(p));
    } else if (entry.isFile() && hasSuffix(p)) {
      found.push(p);
    }
  }
  return found;
}

async function finishCmd(): Promise<void> {
  // 1. Gate: refuse if any three-way files remain. `.IGNORE` tombstones are
  //    NOT three-way files — they're consumed below (they pair with a
  //    NEW_REMOTE file the agent chose not to reconcile).
  const mirrorThreeWay = scanThreeWay(MIRROR_ROOT).filter(
    (p) => hasSuffix(p) !== "IGNORE",
  );
  const routerThreeWay = scanThreeWay(dirname(AUTHORED_ROUTER_PATH)).filter((p) =>
    hasSuffix(p) && p.startsWith(dirname(AUTHORED_ROUTER_PATH)) && hasSuffix(p) !== "IGNORE",
  );
  // Dedupe.
  const allThreeWay = Array.from(new Set([...mirrorThreeWay, ...routerThreeWay]))
    .filter((p) => {
      const s = hasSuffix(p);
      return s === "OLD_REMOTE" || s === "NEW_REMOTE" || s === "CURRENT";
    });
  if (allThreeWay.length > 0) {
    info("refusing: incomplete reconciliation — unresolved three-way files remain:");
    for (const p of allThreeWay) info(`  ${relative(REPO_ROOT, p)}`);
    fail("run `fetch` again after reconciling all OLD_REMOTE/NEW_REMOTE/CURRENT clusters", 1);
  }

  // 2. Consume `.IGNORE` tombstones: the agent wrote `<stem>.IGNORE` next to a
  //    `NEW_REMOTE` file to mark an item as ignored (e.g. tracker-aura). For
  //    each tombstone, record `ignored: true` + the tombstone content as the
  //    `ignoreReason`, delete both files, and skip the normal manifest update.
  const manifest = loadManifest();
  const reportPath = join(REPO_ROOT, ".pi", "engineering-sync-fetch-report.json");
  let report: FetchReport & { items?: Array<MirroredItem & { remoteSha256?: string; auraChecksumOrVersion?: string; auraUpdatedAt?: string }> };
  if (existsSync(reportPath)) {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } else {
    info("no fetch report found; nothing to apply (manifest unchanged)");
    return;
  }
  const tombstones = scanThreeWay(MIRROR_ROOT).filter((p) => hasSuffix(p) === "IGNORE");
  const ignoredKeys = new Set<string>();
  const consumed = consumeIgnoreTombstones(tombstones, report.items ?? [], REPO_ROOT);
  for (const c of consumed) {
    const entry: ManifestEntry = {
      wikiPathOrUuid: c.item.key,
      localPath: c.item.localPath,
      sourceSha256: c.item.remoteSha256 ?? "",
      auraChecksumOrVersion: c.item.auraChecksumOrVersion ?? "",
      auraUpdatedAt: c.item.auraUpdatedAt ?? "",
      kind: c.item.kind,
      slug: c.item.slug,
      ignored: true,
      ignoreReason: c.reason,
    };
    manifest.entries[c.item.key] = entry;
    ignoredKeys.add(c.item.key);
    // Clean up the tombstone + its paired NEW_REMOTE file.
    rmSync(c.tombstonePath, { force: true });
    const newRemote = suffixed(join(REPO_ROOT, c.item.localPath), NEW_REMOTE_SUFFIX);
    if (existsSync(newRemote)) rmSync(newRemote, { force: true });
    info(`manifest: marked ${c.item.key} ignored (${c.item.localPath})`);
  }
  // Warn about tombstones with no matching staged item (left in place).
  for (const t of tombstones) {
    if (!consumed.some((c) => c.tombstonePath === t)) {
      info(`warning: ${relative(REPO_ROOT, t)} has no matching staged item — leaving it`);
    }
  }

  // Apply deletions.
  if (report.deleted) {
    for (const localPath of report.deleted) {
      const key = findKeyByLocalPath(manifest, localPath);
      if (key) {
        delete manifest.entries[key];
        info(`manifest: removed ${key} (${localPath})`);
      }
    }
  }

  // Apply adds/edits: compute the adapted sha256 from the now-reconciled local
  // file and record the new remote metadata.
  if (report.items) {
    for (const it of report.items) {
      if (it.ignored) continue;
      if (ignoredKeys.has(it.key)) continue; // consumed via .IGNORE tombstone above
      const localAbs = join(REPO_ROOT, it.localPath);
      if (!existsSync(localAbs)) {
        info(`manifest: skip ${it.key} — local file ${it.localPath} missing after reconciliation`);
        continue;
      }
      const body = readFileSync(localAbs, "utf8");
      const adapted = sha256(body);
      const existing = manifest.entries[it.key];
      const entry: ManifestEntry = {
        wikiPathOrUuid: it.key,
        localPath: it.localPath,
        sourceSha256: it.remoteSha256 ?? existing?.sourceSha256 ?? "",
        auraChecksumOrVersion: it.auraChecksumOrVersion ?? existing?.auraChecksumOrVersion ?? "",
        auraUpdatedAt: it.auraUpdatedAt ?? existing?.auraUpdatedAt ?? "",
        kind: it.kind,
        slug: it.slug,
      };
      // Mark adapted only if the local file differs from the verbatim remote.
      // For verbatim copies, adaptedSha256 is omitted (Q8). We detect
      // "verbatim" by comparing the local body's sha to the recorded remote
      // sha — if equal, the file is an un-adapted copy.
      if (adapted !== entry.sourceSha256) {
        entry.adaptedSha256 = adapted;
      }
      // Preserve authored/ignored flags from the existing entry.
      if (existing?.authored) entry.authored = true;
      manifest.entries[it.key] = entry;
    }
  }

  // Re-sync authored router's structure signature if it was reconciled.
  if (existsSync(AUTHORED_ROUTER_PATH)) {
    const routerKey = Object.keys(manifest.entries).find(
      (k) => manifest.entries[k].authored && manifest.entries[k].localPath === relative(REPO_ROOT, AUTHORED_ROUTER_PATH),
    );
    if (routerKey) {
      // Recompute the structure signature from the current wiki tree (cheap;
      // one call). If the router file was reconciled, update its signature.
      try {
        const client = await createDefaultAuraClient();
        const tree = await client.getKnowledgeTree(SPACE_SLUG);
        const structureSlugs = tree.nodes
          .filter((n) => n.kind !== "FOLDER")
          .map((n) => n.slug)
          .sort()
          .join("\n");
        manifest.entries[routerKey].sourceSha256 = sha256(structureSlugs);
        manifest.entries[routerKey].auraUpdatedAt = new Date().toISOString();
      } catch {
        info("warning: could not refresh authored router structure signature");
      }
    }
  }

  saveManifest(manifest);
  // Clean up the fetch report.
  rmSync(reportPath, { force: true });
  info("finish: manifest updated; three-way files cleared.");
}

function findKeyByLocalPath(manifest: Manifest, localPath: string): string | undefined {
  for (const [k, e] of Object.entries(manifest.entries)) {
    if (e.localPath === localPath) return k;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// status subcommand (read-only)
// ---------------------------------------------------------------------------

async function statusCmd(): Promise<void> {
  const manifest = loadManifest();
  if (Object.keys(manifest.entries).length === 0) {
    info("manifest is empty or absent (initial seeding not yet run).");
    return;
  }
  // Check for stray three-way files.
  const stray = scanThreeWay(MIRROR_ROOT);
  if (stray.length > 0) {
    info(`warning: ${stray.length} unresolved three-way file(s) in mirror — run \`fetch\` then reconcile, then \`finish\`.`);
    for (const p of stray.slice(0, 10)) info(`  ${relative(REPO_ROOT, p)}`);
  } else {
    info("no unresolved three-way files in mirror.");
  }
  // Count by disposition.
  const counts = { verbatim: 0, adapted: 0, ignored: 0, authored: 0 };
  for (const e of Object.values(manifest.entries)) {
    if (e.ignored) counts.ignored++;
    else if (e.authored) counts.authored++;
    else if (e.adaptedSha256) counts.adapted++;
    else counts.verbatim++;
  }
  info(`manifest: ${Object.keys(manifest.entries).length} entries ` +
    `(verbatim ${counts.verbatim}, adapted ${counts.adapted}, authored ${counts.authored}, ignored ${counts.ignored})`);
}

// ---------------------------------------------------------------------------
// Small fs helpers
// ---------------------------------------------------------------------------

function writeSuffixed(localAbs: string, suffix: string, content: string): void {
  const p = suffixed(localAbs, suffix);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, "utf8");
}

function renameSyncSafe(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  rmSync(to, { force: true });
  renameSync(from, to);
}

// ---------------------------------------------------------------------------
// arg parsing + dispatch
// ---------------------------------------------------------------------------

const USAGE = `Usage:
  node engineering-sync.mjs fetch     stage three-way files + new-hashes report
  node engineering-sync.mjs finish     gate (refuse on unresolved), then update manifest
  node engineering-sync.mjs status     read-only drift summary`;

async function main(): Promise<void> {
  const sub = process.argv[2];
  try {
    switch (sub) {
      case "fetch": await fetchCmd(); return;
      case "finish": await finishCmd(); return;
      case "status": await statusCmd(); return;
      default:
      console.error(USAGE);
      fail(sub ? `unknown subcommand "${sub}"` : "missing subcommand", 2);
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e), 1);
  }
}

// Run only when this module is the entry point (not when imported by a test).
// Under esbuild (shipped .mjs) and tsx, `import.meta.url` is defined; compare
// against `process.argv[1]` resolved to a file URL.
function isMainEntry(): boolean {
  try {
    const url = (import.meta as { url?: string }).url;
    if (!url) return false;
    const { pathToFileURL } = require("node:url") as typeof import("node:url");
    const entry = pathToFileURL(process.argv[1] ?? "").href;
    return url === entry;
  } catch {
    return false;
  }
}

if (isMainEntry()) {
  main().catch((e: unknown) => {
    console.error("engineering-sync failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
