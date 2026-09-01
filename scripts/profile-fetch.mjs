#!/usr/bin/env node
// profile-fetch.mjs — one-off profiler for the aura-digest fetch.
//
// Runs the *committed* `skills/core/aura-digest/dist/aura-digest.mjs fetch`
// bundle (the exact code path the `digest-fetch` pi tool spawns) under a
// profiler, then writes a machine-readable report + an agent-friendly
// markdown summary to ./profiles/<stamp>/.
//
// Why lanterna: the fetch is I/O-bound (~54s wall, ~11s CPU) with long async
// waits. clinic.js was the obvious tool (bubbleprof visualizes async I/O
// waterfalls) but clinic 13 is broken on Node 24 — it exits instantly and
// produces no report. lanterna is purpose-built for an agent consumer: it
// emits a structured LanternaReport JSON (findings[] with confidence +
// proofLevel, topOperations with waitMs/runMs/latencyCause) and an
// `--format agent` markdown I can read directly. It captures CPU + async in
// one run. 0x (flamegraph HTML) and Node's built-in --cpu-prof are kept as
// fallbacks for environments where lanterna can't attach.
//
// Usage:
//   node scripts/profile-fetch.mjs                 # lanterna cpu,async → report.json + report.agent.md
//   node scripts/profile-fetch.mjs --open          # (0x mode only) open the flamegraph
//   node scripts/profile-fetch.mjs --0x            # force 0x flamegraph instead of lanterna
//   node scripts/profile-fetch.mjs --cpu-prof     # force Node built-in only (no extra deps)
//   node scripts/profile-fetch.mjs --kind cpu,memory,async   # extra lanterna kinds
//   node scripts/profile-fetch.mjs --lanterna-args="--async-stack-depth 64"  # pass-through to lanterna
//
// The Aura fetch script and its `fetch` argument are always appended after
// the profiler's own `--` separator.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const bundlePath = resolve(repoRoot, "skills/core/aura-digest/dist/aura-digest.mjs");
const lanternaBin = resolve(repoRoot, "node_modules/.bin/lanterna");
const zeroxBin = resolve(repoRoot, "node_modules/.bin/0x");

function fail(msg) {
  console.error(`profile-fetch: ${msg}`);
  process.exit(2);
}

if (!existsSync(bundlePath)) {
  fail(`aura-digest bundle not found at ${bundlePath}. Run \`task build\` first.`);
}

const userArgs = process.argv.slice(2);
const force0x = userArgs.includes("--0x");
const forceCpuProf = userArgs.includes("--cpu-prof");
if (force0x && forceCpuProf) fail("pass --0x or --cpu-prof, not both.");

// Reports go to a timestamped dir so re-runs don't clobber each other.
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = resolve(repoRoot, "profiles", stamp);
mkdirSync(outDir, { recursive: true });

const bundleCmd = [process.execPath, bundlePath, "fetch"];

function runProfiler(bin, args, label) {
  console.error(`profile-fetch: ${label} -> ${outDir}`);
  console.error(`profile-fetch: running ${bundleCmd.join(" ")} (this hits Aura and takes ~1 min)…\n`);
  const child = spawn(bin, args, { stdio: "inherit" });
  child.on("error", (err) => fail(`failed to spawn ${label}: ${err.message}`));
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code));
  });
}

// --- lanterna (default) -------------------------------------------------
// Emits report.json (structured) + report.agent.md (I read this directly).
async function runLanterna() {
  if (!existsSync(lanternaBin)) {
    fail(`lanterna not found at ${lanternaBin}. Run \`npm install\` (@lanterna-profiler/cli is a devDependency), or use --cpu-prof / --0x.`);
  }
  const reportJson = join(outDir, "report.json");
  const lanternaArgs = [
    "run",
    "--kind", "cpu,async",
    "--output", reportJson,
    "--pretty",
  ];
  // Pass-through for advanced lanterna flags (e.g. --async-stack-depth 64).
  const passIdx = userArgs.indexOf("--lanterna-args");
  if (passIdx >= 0) {
    const spec = userArgs[passIdx + 1];
    if (spec) lanternaArgs.push(...spec.split(/\s+/));
  }
  // Honor an explicit --kind override.
  const kindIdx = userArgs.indexOf("--kind");
  if (kindIdx >= 0 && userArgs[kindIdx + 1]) {
    lanternaArgs[2] = userArgs[kindIdx + 1];
  }
  lanternaArgs.push("--", ...bundleCmd);
  const code = await runProfiler(lanternaBin, lanternaArgs, "lanterna cpu,async");
  if (code !== 0) fail(`lanterna exited with code ${code}`);
  // Render the agent markdown from the captured JSON so I can read the
  // findings without re-parsing. Non-fatal if it fails (the JSON is the
  // source of truth).
  const agentMd = join(outDir, "report.agent.md");
  try {
    await new Promise((res, rej) => {
      const r = spawn(lanternaBin, ["report", reportJson, "--format", "agent", "--output", agentMd], { stdio: "inherit" });
      r.on("close", (c) => (c === 0 ? res() : rej(new Error(`lanterna report exited ${c}`))));
      r.on("error", rej);
    });
  } catch (e) {
    console.error(`profile-fetch: warning: could not render agent markdown (${e.message}); JSON report is still available.`);
  }
  console.log(`\nprofile-fetch: done.`);
  console.log(`  report json: ${reportJson}`);
  if (existsSync(agentMd)) console.log(`  agent md:    ${agentMd}`);
}

// --- 0x fallback (flamegraph HTML) --------------------------------------
async function run0x() {
  if (!existsSync(zeroxBin)) {
    fail(`0x not found at ${zeroxBin}. Run \`npm install\`, or use --cpu-prof.`);
  }
  const zeroxFlags = ["--tree-debug", "--output-dir", outDir, "--open=false", ...userArgs.filter((a) => !["--0x", "--open", "--cpu-prof", "--kind"].includes(a) && !a.startsWith("--lanterna"))];
  if (userArgs.includes("--open")) zeroxFlags.push("--open");
  const zeroxArgs = [...zeroxFlags, "--", ...bundleCmd];
  const code = await runProfiler(zeroxBin, zeroxArgs, "0x");
  if (code !== 0) fail(`0x exited with code ${code}`);
  console.log(`\nprofile-fetch: done. Flamegraph: ${join(outDir, "flamegraph.html")}`);
  console.log(`  (run with no flags to use lanterna for a machine-readable report)`);
}

// --- Node built-in --cpu-prof (zero extra deps) ------------------------
async function runCpuProf() {
  const args = ["--cpu-prof", "--cpu-prof-dir=" + outDir, ...bundleCmd];
  const code = await runProfiler(process.execPath, args, "node --cpu-prof");
  if (code !== 0) fail(`node --cpu-prof exited with code ${code}`);
  console.log(`\nprofile-fetch: done. cpuprofile written under ${outDir}`);
  console.log(`  (run with no flags to use lanterna for CPU + async findings)`);
}

if (forceCpuProf) await runCpuProf();
else if (force0x) await run0x();
else await runLanterna();
