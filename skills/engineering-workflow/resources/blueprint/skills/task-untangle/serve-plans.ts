#!/usr/bin/env -S deno run --allow-net --allow-read --allow-run
//
// Server for the task folder: a landing page over every bundle, rendered
// Markdown, a live graph per bundle, and everything else served statically so
// HTML prototypes built during a task-untangle run keep working unchanged.
// Serves the whole `docs/tasks/` tree of its own checkout — one process covers
// every bundle, so nothing has to be started per prototype.
//
// Owned by the task-untangle skill; `task plans:serve` is the human entry point.

import { serveDir } from "jsr:@std/http@1/file-server";
import { join, relative, resolve } from "jsr:@std/path@1";
import { parseBundle, stripSectionKeys } from "./bundle.ts";
import { type Prototype, renderGraphPage, renderIndexPage, renderMarkdownPage, type TaskEntry } from "./views.ts";

const PORT_BASE = 8000;
const SERVED_SUBDIR = "docs/tasks";
const AREAS = [{ area: "active", label: "Aktiv" }, { area: "archive", label: "Archiv" }];
/** Both names: the two bundles that predate the rename keep theirs. */
const BUNDLE_DIRS = ["untangle", "idea-refine"];

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes).trim();

const html = (body: string) =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

async function run(cmd: string, args: string[]): Promise<string> {
  const command = new Deno.Command(cmd, { args });
  const { success, stdout, stderr } = await command.output();
  if (!success) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${decode(stderr)}`);
  }
  return decode(stdout);
}

// Each worktree gets its own port, because several checkouts have identical
// paths under `docs/tasks/` — a shared port would silently serve a prototype
// from the wrong branch. The stack token already identifies the worktree, so
// the port is derived from it rather than tracked anywhere.
function portForToken(token: string): number {
  const digits = token.match(/\d+/)?.[0];
  if (digits) return PORT_BASE + (Number(digits) % 1000);

  let hash = 0;
  for (const char of token) hash = (hash * 31 + char.charCodeAt(0)) % 1000;
  return PORT_BASE + hash;
}

const repoRoot = await run("git", ["rev-parse", "--show-toplevel"]);
const token = await run("bash", [`${repoRoot}/scripts/dev/stack-token.sh`, "token"]);
const port = portForToken(token);
const fsRoot = `${repoRoot}/${SERVED_SUBDIR}`;

/** Keeps a URL-derived path inside the served tree. */
function insideRoot(urlPath: string): string | null {
  const target = resolve(fsRoot, `.${decodeURIComponent(urlPath)}`);
  return target === fsRoot || target.startsWith(`${fsRoot}/`) ? target : null;
}

async function subdirectories(dir: string): Promise<string[]> {
  const found: string[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isDirectory) found.push(entry.name);
    }
  } catch {
    // An area without a directory is simply empty.
  }
  return found.sort();
}

async function firstMatch(dir: string, matches: (name: string) => boolean): Promise<string | null> {
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && matches(entry.name)) return entry.name;
    }
  } catch {
    // Nothing there.
  }
  return null;
}

/** `<owner>/prototypes/<slug>/index.html`, whether the owner is the task or its bundle. */
async function prototypesIn(owner: string, urlPrefix: string): Promise<Prototype[]> {
  const found: Prototype[] = [];
  for (const slug of await subdirectories(join(owner, "prototypes"))) {
    try {
      await Deno.stat(join(owner, "prototypes", slug, "index.html"));
      found.push({ label: slug, href: `${urlPrefix}/prototypes/${slug}/index.html` });
    } catch {
      // A folder without an index.html is not offered.
    }
  }
  return found;
}

/**
 * Only tasks that actually carry a bundle or a prototype — a list of all 400-odd
 * task folders would bury exactly what this page exists for.
 */
async function collectTasks(area: string): Promise<TaskEntry[]> {
  const tasks: TaskEntry[] = [];

  for (const key of await subdirectories(join(fsRoot, area))) {
    const taskDir = join(fsRoot, area, key);
    const taskUrl = `/${area}/${key}`;

    const bundles = [];
    const prototypes = await prototypesIn(taskDir, taskUrl);
    for (const name of BUNDLE_DIRS) {
      const bundleDir = join(taskDir, name);
      try {
        await Deno.stat(join(bundleDir, "index.md"));
      } catch {
        continue;
      }
      const bundle = await parseBundle(bundleDir);
      bundles.push({
        path: `${area}/${key}/${name}`,
        nodes: bundle.nodes.length,
        findings: bundle.findings.length,
      });
      prototypes.push(...await prototypesIn(bundleDir, `${taskUrl}/${name}`));
    }

    if (bundles.length === 0 && prototypes.length === 0) continue;

    const plan = await firstMatch(taskDir, (name) => name.startsWith("task-") && name.endsWith(".md"));
    const heading = plan
      ? (await Deno.readTextFile(join(taskDir, plan))).match(/^#\s+(.+)$/m)?.[1] ?? key
      : key;

    tasks.push({
      key,
      title: heading,
      area,
      plan: plan ? `${taskUrl}/${plan}` : null,
      bundles,
      prototypes,
    });
  }

  return tasks;
}

async function indexResponse(): Promise<Response> {
  const groups = [];
  for (const { area, label } of AREAS) {
    groups.push({ area, label, tasks: await collectTasks(area) });
  }
  return html(renderIndexPage(groups));
}

async function graphResponse(bundlePath: string): Promise<Response> {
  const dir = insideRoot(`/${bundlePath}`);
  if (!dir) return new Response("not found", { status: 404 });

  const bundle = await parseBundle(dir);
  // Same parse, same checks as the CLI — so a breach is visible here too, even
  // if nobody ever runs the validator.
  const nodes = bundle.nodes.map((node) => ({
    ...node,
    body: stripSectionKeys(node.body),
    href: `/${relative(fsRoot, node.file)}`,
  }));
  const findings = bundle.findings.map((finding) => ({
    ...finding,
    file: relative(dir, finding.file),
  }));

  return html(renderGraphPage(bundlePath.replace(/\/$/, ""), nodes, bundle.edges, bundle.current, findings));
}

async function markdownResponse(urlPath: string): Promise<Response | null> {
  const path = insideRoot(urlPath);
  if (!path) return null;
  try {
    const raw = await Deno.readTextFile(path);
    return html(renderMarkdownPage(urlPath.replace(/^\//, ""), stripSectionKeys(raw)));
  } catch {
    return null;
  }
}

console.log(`Serving ${fsRoot}`);
console.log(`Worktree token: ${token}`);
console.log(`Open: http://localhost:${port}/`);

Deno.serve({ port }, async (request) => {
  const { pathname } = new URL(request.url);

  if (pathname === "/") return await indexResponse();
  if (pathname.startsWith("/graph/")) return await graphResponse(pathname.slice("/graph/".length));
  if (pathname.endsWith(".md")) {
    const rendered = await markdownResponse(pathname);
    if (rendered) return rendered;
  }

  return serveDir(request, { fsRoot, showDirListing: true, quiet: true });
});
