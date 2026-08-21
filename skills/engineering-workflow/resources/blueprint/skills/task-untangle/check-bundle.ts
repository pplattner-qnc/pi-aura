#!/usr/bin/env -S deno run --allow-read
//
// Validator for task-untangle bundles. Silent on success, names file and target
// on failure, exit code 1 when anything was found.
//
// Usage:
//   deno run --allow-read check-bundle.ts <bundle-dir> [--digest]
//   deno run --allow-read check-bundle.ts            (sweep over all bundles)
//
// The skill calls it with its own bundle as the argument, every time a question
// closes. The argument-less sweep is maintenance: a gate that can turn red on a
// foreign, long-archived bundle stops being invoked after the second time.

import { expandGlob } from "jsr:@std/fs@1/expand-glob";
import { relative } from "jsr:@std/path@1";
import { type Bundle, parseBundle } from "./bundle.ts";

/** Both names, because the two existing bundles keep the one they were created with. */
const SWEEP_GLOB = "docs/tasks/*/*/{untangle,idea-refine}";

const GROUP_ORDER = ["idea", "question", "task", "decision", "fact"];
const UNCLOSED = ["open", "drafted", "running"];

async function findBundles(): Promise<string[]> {
  const found: string[] = [];
  for await (const entry of expandGlob(SWEEP_GLOB, { includeDirs: true })) {
    if (entry.isDirectory) found.push(relative(Deno.cwd(), entry.path));
  }
  return found.sort();
}

function report(bundle: Bundle): void {
  console.error(`${bundle.dir} — ${bundle.findings.length} finding(s)`);
  for (const finding of bundle.findings) {
    console.error(`  ${finding.kind}: ${relative(bundle.dir, finding.file)} — ${finding.detail}`);
  }
}

/** Text view of the bundle for whoever has no browser: an agent, a PR reader. */
function digest(bundle: Bundle): void {
  console.log(`${bundle.dir} — ${bundle.nodes.length} nodes, ${bundle.edges.length} drawn edges`);
  if (bundle.current.length > 0) console.log(`current: ${bundle.current.join(", ")}`);

  for (const type of GROUP_ORDER) {
    const group = bundle.nodes.filter((node) => node.type === type);
    if (group.length === 0) continue;
    // Unclosed first — that is where a run is picked up.
    group.sort((left, right) =>
      Number(UNCLOSED.includes(right.status ?? "")) - Number(UNCLOSED.includes(left.status ?? "")) ||
      left.id.localeCompare(right.id)
    );
    console.log(`\n${type} (${group.length})`);
    for (const node of group) {
      console.log(`  ${node.id.padEnd(6)} ${(node.status ?? "—").padEnd(11)} ${node.title}`);
    }
  }

  if (bundle.findings.length > 0) console.log(`\n${bundle.findings.length} finding(s) — run without --digest`);
}

const args = Deno.args.filter((arg) => arg !== "--digest");
const wantsDigest = Deno.args.includes("--digest");

const targets = args.length > 0 ? args : await findBundles();
if (targets.length === 0) {
  console.error(`no bundle found under ${SWEEP_GLOB}`);
  Deno.exit(2);
}

let findings = 0;
for (const dir of targets) {
  let bundle: Bundle;
  try {
    bundle = await parseBundle(dir);
  } catch (error) {
    console.error(`${dir} — cannot be read: ${error instanceof Error ? error.message : error}`);
    Deno.exit(2);
  }

  if (wantsDigest) {
    digest(bundle);
    continue;
  }
  if (bundle.findings.length > 0) {
    report(bundle);
    findings += bundle.findings.length;
  }
}

Deno.exit(wantsDigest || findings === 0 ? 0 : 1);
