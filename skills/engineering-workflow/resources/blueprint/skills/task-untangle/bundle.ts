//
// Shared model of a task-untangle bundle: reads the Markdown nodes, resolves
// the relations between them and collects every breach of the front-matter and
// body contract. Validator (`check-bundle.ts`) and server (`serve-plans.ts`)
// both run this, so a contract breach cannot be visible in one and invisible in
// the other.
//
// Module only — no entry point of its own.

import { parse as parseYaml } from "jsr:@std/yaml@1";
import { basename, join } from "jsr:@std/path@1";

export const NODE_TYPES = ["idea", "question", "task", "fact", "decision"] as const;

export const PREDICATES = [
  "raises",
  "answered_by",
  "blocked_by",
  "superseded_by",
  "conflicts_with",
  "constrained_by",
] as const;

/** The main flow the graph draws; the remaining predicates stay in the front matter. */
export const DRAWN_PREDICATES = ["raises", "answered_by"] as const;

/** Drawn too, but behind a switch — cross-edges destroy the layering. */
export const OVERLAY_PREDICATE = "conflicts_with";

/**
 * Mandatory body sections per node type, addressed by the language-free key in
 * the heading (`## Nicht gewählt [not-chosen]`). Question and idea have none,
 * because the skill prescribes no fixed sections for them. `limits` covers both
 * headings the skill names for that one task section.
 */
export const SECTION_KEYS: Record<string, readonly string[]> = {
  decision: ["decided", "rationale", "not-chosen", "follows", "invalid-if"],
  task: ["brief", "result", "limits"],
  fact: ["state", "reach", "outdated-if"],
};

/** A node the run still sits on: only these may appear in `current`. */
const UNCLOSED: Record<string, readonly string[]> = {
  question: ["open", "drafted"],
  task: ["open", "running"],
};

const NODE_DIRS = ["questions", "decisions", "facts", "tasks"];
const ID_PATTERN = /^(idea|[qdft]-\d+)/;
const SECTION_HEADING = /^(#{2,6})\s+(.*?)\s*\[([a-z0-9-]+)\]\s*$/gm;

export type Node = {
  id: string;
  type: string;
  status: string | null;
  scope: string | null;
  title: string;
  body: string;
  /** Path as handed in, so a caller can build its own link from it. */
  file: string;
  /** Relation targets, normalised to bare ids. */
  relations: Record<string, string[]>;
};

export type Edge = { source: string; target: string; predicate: string };

export type Finding = { file: string; kind: string; detail: string };

export type Bundle = {
  dir: string;
  nodes: Node[];
  edges: Edge[];
  current: string[];
  findings: Finding[];
};

/** Splits `---\n<yaml>\n---\n<body>`; a node without front matter is a finding, not a crash. */
function splitFrontMatter(raw: string): { frontMatter: string; body: string } | null {
  if (!raw.startsWith("---\n")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  return {
    frontMatter: raw.slice(4, end),
    body: raw.slice(raw.indexOf("\n", end + 1) + 1),
  };
}

/**
 * Removes the section key so `## Entschieden [decided]` reads as "Entschieden".
 * Both places that render Markdown call this; in the file the key stays, or the
 * body check would have nothing to hold on to.
 */
export function stripSectionKeys(markdown: string): string {
  return markdown.replace(SECTION_HEADING, (_match, hashes, heading) => `${hashes} ${heading}`);
}

/** Tolerates the legacy path notation so a half-migrated bundle stays readable. */
function normalizeTarget(target: string): string | null {
  const leaf = basename(String(target)).replace(/\.md$/, "");
  return leaf.match(ID_PATTERN)?.[1] ?? null;
}

const isBareId = (target: string) => ID_PATTERN.test(target) && !target.includes("/");

function titleOf(body: string, id: string): string {
  const heading = body.match(/^#\s+(.+)$/m)?.[1] ?? id;
  // Headings read `# d-008 — Für den Ausführenden …`; the id is shown separately.
  return heading.replace(/^(idea|[qdft]-\d+)\s*[—–-]\s*/i, "").trim();
}

function asList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

/** Every section key present in the body, with whether anything stands below it. */
function sectionsOf(body: string): Map<string, boolean> {
  const found = new Map<string, boolean>();
  const matches = [...body.matchAll(SECTION_HEADING)];
  for (const [index, match] of matches.entries()) {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    found.set(match[3], body.slice(start, end).trim().length > 0);
  }
  return found;
}

async function readNode(path: string, findings: Finding[]): Promise<Node | null> {
  const split = splitFrontMatter(await Deno.readTextFile(path));
  if (!split) {
    findings.push({ file: path, kind: "no-front-matter", detail: "file does not start with ---" });
    return null;
  }

  const meta = (parseYaml(split.frontMatter) ?? {}) as Record<string, unknown>;
  const fromFilename = basename(path).replace(/\.md$/, "").match(ID_PATTERN)?.[1];
  const declared = meta.id ? String(meta.id) : null;

  const id = declared ?? fromFilename;
  if (!id) {
    findings.push({ file: path, kind: "no-id", detail: "neither front matter nor filename yields an id" });
    return null;
  }
  if (!declared) {
    findings.push({ file: path, kind: "missing-id-field", detail: `id derived from filename as ${id}` });
  } else if (fromFilename && declared !== fromFilename) {
    findings.push({ file: path, kind: "id-mismatch", detail: `front matter ${declared} vs filename ${fromFilename}` });
  }

  const type = String(meta.type ?? "unknown");
  if (!NODE_TYPES.includes(type as typeof NODE_TYPES[number])) {
    findings.push({ file: path, kind: "unknown-type", detail: type });
  }

  const relations: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!PREDICATES.includes(key as typeof PREDICATES[number])) {
      if (!["id", "type", "status", "scope", "owner", "surveyed"].includes(key)) {
        findings.push({ file: path, kind: "unknown-predicate", detail: key });
      }
      continue;
    }
    const targets: string[] = [];
    for (const rawTarget of asList(value)) {
      if (!isBareId(rawTarget)) {
        findings.push({ file: path, kind: "target-not-bare-id", detail: `${key} → ${rawTarget}` });
      }
      const target = normalizeTarget(rawTarget);
      if (!target) {
        findings.push({ file: path, kind: "dangling-target", detail: `${key} → ${rawTarget}` });
        continue;
      }
      targets.push(target);
    }
    relations[key] = targets;
  }

  const expected = SECTION_KEYS[type] ?? [];
  const sections = sectionsOf(split.body);
  // A node carrying no key at all predates the contract and is left alone —
  // that is what keeps the finished AURA-930 run out of the report.
  if (expected.length > 0 && sections.size > 0) {
    for (const key of expected) {
      if (!sections.has(key)) findings.push({ file: path, kind: "section-missing", detail: key });
      else if (!sections.get(key)) findings.push({ file: path, kind: "section-empty", detail: key });
    }
  }

  return {
    id,
    type,
    status: meta.status ? String(meta.status) : null,
    scope: meta.scope ? String(meta.scope) : null,
    title: titleOf(split.body, id),
    body: split.body,
    file: path,
    relations,
  };
}

async function collectFiles(bundleDir: string): Promise<string[]> {
  const files: string[] = [];
  const ideaPath = join(bundleDir, "idea.md");
  try {
    await Deno.stat(ideaPath);
    files.push(ideaPath);
  } catch {
    // A bundle without an idea is legal input; the graph then has no root.
  }
  for (const dir of NODE_DIRS) {
    try {
      for await (const entry of Deno.readDir(join(bundleDir, dir))) {
        if (entry.isFile && entry.name.endsWith(".md")) files.push(join(bundleDir, dir, entry.name));
      }
    } catch {
      // Older bundles have no facts/ or tasks/ directory at all.
    }
  }
  return files.sort();
}

/**
 * `index.md` is read but never held to the node contract — it has no id and no
 * type, and a bundle must not fail on its own table of contents. What is read
 * is `current`: the nodes the run sits on, a list because research tasks run in
 * parallel.
 */
async function readCurrent(bundleDir: string): Promise<string[]> {
  try {
    const split = splitFrontMatter(await Deno.readTextFile(join(bundleDir, "index.md")));
    if (!split) return [];
    const meta = (parseYaml(split.frontMatter) ?? {}) as Record<string, unknown>;
    return asList(meta.current).map((target) => normalizeTarget(target) ?? target);
  } catch {
    return [];
  }
}

export async function parseBundle(bundleDir: string): Promise<Bundle> {
  const findings: Finding[] = [];
  const nodes: Node[] = [];

  for (const path of await collectFiles(bundleDir)) {
    const node = await readNode(path, findings);
    if (node) nodes.push(node);
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: Edge[] = [];
  const answeredByCount = new Map<string, number>();

  for (const node of nodes) {
    for (const [predicate, targets] of Object.entries(node.relations)) {
      for (const target of targets) {
        if (!byId.has(target)) {
          findings.push({ file: node.file, kind: "dangling-target", detail: `${predicate} → ${target}` });
          continue;
        }
        if (predicate === "answered_by") {
          answeredByCount.set(target, (answeredByCount.get(target) ?? 0) + 1);
        }
        const drawn: readonly string[] = [...DRAWN_PREDICATES, OVERLAY_PREDICATE];
        if (drawn.includes(predicate)) edges.push({ source: node.id, target, predicate });
      }
    }
  }

  // Cardinality on the answer side has no field of its own: a decision does not
  // name the question it answers, so the only way to see it is to count how
  // often the questions cite it. The question side is deliberately unchecked.
  for (const [id, count] of answeredByCount) {
    if (count > 1) {
      const node = byId.get(id);
      findings.push({
        file: node?.file ?? id,
        kind: "answers-several-questions",
        detail: `cited by ${count} questions in answered_by`,
      });
    }
  }

  const current = await readCurrent(bundleDir);
  const indexPath = join(bundleDir, "index.md");
  for (const id of current) {
    const node = byId.get(id);
    if (!node) {
      findings.push({ file: indexPath, kind: "current-unknown", detail: id });
      continue;
    }
    if (!(UNCLOSED[node.type] ?? []).includes(node.status ?? "")) {
      findings.push({
        file: indexPath,
        kind: "current-closed",
        detail: `${id} is ${node.type}/${node.status ?? "without status"}`,
      });
    }
  }

  return { dir: bundleDir, nodes, edges, current, findings };
}
