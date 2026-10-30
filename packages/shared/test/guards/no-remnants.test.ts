// The no-remnants guard: the remove-digest effort's contract with the
// future. One consolidated structural suite asserting the removal is
// total: no digest subpath exports, no digest source or test directories,
// no dashboard extension directory or registration, no aura-digest skill
// or morning agents, no digest-era settings or keyring surface, a root
// devDependency list free of the dashboard stack, and the dead
// refine-phase-transition effort archived off the task index's live list.
// The root-docs-refresh ticket appended its two doc seams to the same
// file: the five root docs' content (digest- and Atlassian-provisioning
// free, README tables matching the shipped manifest, testing doc matching
// the post-removal runner reality) and the stale Atlassian provisioning
// bug report archived with a resolution note.
// Absence assertions only (fs reads, no imports of deleted content),
// following the digest suite's no-dead-exports structural pattern.
//
// Consolidation: the four per-ticket absence suites
// (dashboard-extension-removal, digest-skill-and-agents-removal,
// digest-core-and-build-pkg-cleanup, manifest-and-infra-cleanup) are
// consolidated into this file. Their assertions carry over; the two
// relocation-bookkeeping assertions (the interim suites must exist in
// test/guards/) are superseded by this consolidation and dropped, and the
// extension-registration assertion is generalized from "no
// digest-dashboard entry" to "no digest-named entry" so the registration
// remnant class cannot reappear under a new digest name.
//
// Seams (arch spec, no-remnants-guard-and-archive):
//   1. this suite green under the shared runner, failing on any
//      reintroduced remnant
//   2. the task index no longer lists the dead effort
//   (seam 3, the registration smoke, is a manual verify step: a fresh
//   session loads the package with no errors, the secrets command
//   registers, and no digest command or tools appear; it is not an
//   assertion here)
//
// Extension seams (arch spec, root-docs-refresh):
//   1. docs content: no digest or Atlassian-provisioning mentions outside
//      task history, and no active bug report mentioning Atlassian
//      provisioning (the archived report carries the resolution note)
//   2. the README's skill and agent tables match the shipped manifest
//
// Run with: cd packages/shared && npx tsx --test test/guards/no-remnants.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// packages/shared/test/guards -> packages/shared/test -> packages/shared
const testDir = import.meta.dirname;
const sharedRoot = path.resolve(testDir, "../..");
const repoRoot = path.resolve(sharedRoot, "../..");

interface RootPackageJson {
  pi?: {
    extensions?: string[];
    skills?: string[];
    subagents?: { agents?: string[] };
  };
  devDependencies?: Record<string, string>;
}

function readRootPackageJson(): RootPackageJson {
  const raw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8");
  return JSON.parse(raw) as RootPackageJson;
}

interface ScriptsPackageJson {
  name?: string;
  description?: string;
  dependencies?: Record<string, string>;
}

function readScriptsPackageJson(): ScriptsPackageJson {
  const raw = fs.readFileSync(
    path.join(repoRoot, "scripts", "package.json"),
    "utf-8",
  );
  return JSON.parse(raw) as ScriptsPackageJson;
}

interface SharedPackageJson {
  exports?: Record<string, string>;
}

function readSharedExports(): Record<string, string> {
  const raw = fs.readFileSync(path.join(sharedRoot, "package.json"), "utf-8");
  const pkg = JSON.parse(raw) as SharedPackageJson;
  return pkg.exports ?? {};
}

function readSharedSourceLines(relative: string): string[] {
  const raw = fs.readFileSync(path.join(sharedRoot, relative), "utf-8");
  return raw.split("\n");
}

// The dead digest effort the remove-digest map archives with this landing:
// its only ticket is a digest view change with no reason to exist once the
// dashboard is gone. The task index lists it under Live today; archiving
// moves the effort directory under docs/tasks/archive/ and drops the
// entry from the live list.
const DEAD_EFFORT = "refine-phase-transition";

// The per-ticket absence suites this guard consolidates; their files must
// be gone once their assertions live here.
const CONSOLIDATED_SUITES = [
  "dashboard-extension-removal.test.ts",
  "digest-skill-and-agents-removal.test.ts",
  "digest-core-and-build-pkg-cleanup.test.ts",
  "manifest-and-infra-cleanup.test.ts",
];

// dashboard-extension-removal: the digest-dashboard extension is gone end
// to end (registration, gitignore exceptions, extension and suite trees).
describe("no-remnants guard: dashboard extension", () => {
  it("registers no digest extension in the package manifest", () => {
    const pkg = readRootPackageJson();
    const extensions = pkg.pi?.extensions ?? [];
    const offending = extensions.filter((entry) =>
      entry.toLowerCase().includes("digest"),
    );
    assert.deepEqual(
      offending,
      [],
      `package.json should not register a digest extension (the digest-dashboard entry was removed), found: ${offending.join(", ") || "none"}`,
    );
  });

  it("carries no digest-dashboard exception lines in .gitignore", () => {
    const gitignore = fs.readFileSync(
      path.join(repoRoot, ".gitignore"),
      "utf-8",
    );
    const offending = gitignore
      .split("\n")
      .filter((line) => line.includes("digest-dashboard"));
    assert.deepEqual(
      offending,
      [],
      ".gitignore should not carry digest-dashboard exception lines",
    );
  });

  it("has no digest-dashboard extension package directory", () => {
    const dir = path.join(repoRoot, ".pi", "extensions", "digest-dashboard");
    assert.equal(
      fs.existsSync(dir),
      false,
      ".pi/extensions/digest-dashboard should be deleted",
    );
  });

  it("has no digest-dashboard vitest suite directory", () => {
    const dir = path.join(repoRoot, "test", "digest-dashboard");
    assert.equal(
      fs.existsSync(dir),
      false,
      "test/digest-dashboard should be deleted with the extension",
    );
  });
});

// digest-skill-and-agents-removal: the aura-digest skill and the two
// morning agents are gone (tree and manifest registration).
describe("no-remnants guard: skill and agents", () => {
  it("leaves only the aura and engineering-foundation skills in the scan", () => {
    const skillsDir = path.join(repoRoot, "skills", "core");
    const entries = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(
      entries,
      ["aura", "engineering-foundation"],
      `skills/core should contain only the two surviving core skills, found: ${entries.join(", ")}`,
    );
  });

  it("keeps the package manifest's skills scan unchanged", () => {
    const pkg = readRootPackageJson();
    assert.deepEqual(
      pkg.pi?.skills,
      ["./skills"],
      "package.json should keep scanning ./skills for skills",
    );
  });

  it("has no agents directory in the tracked tree", () => {
    const agentsDir = path.join(repoRoot, "agents");
    assert.equal(
      fs.existsSync(agentsDir),
      false,
      "agents/ should be deleted with both morning agents",
    );
  });

  it("registers no subagents in the package manifest", () => {
    const pkg = readRootPackageJson();
    assert.equal(
      pkg.pi?.subagents,
      undefined,
      "package.json should carry no subagents block",
    );
  });
});

// digest-core-and-build-pkg-cleanup: the shared digest data core is gone
// (subpath exports, source and test directories).
describe("no-remnants guard: shared digest core", () => {
  it("carries no digest subpath exports", () => {
    const exports = readSharedExports();
    const offenders = Object.keys(exports).filter((key) =>
      key.includes("digest"),
    );
    assert.deepEqual(
      offenders,
      [],
      `package.json should export no digest subpaths, found: ${offenders.join(", ")}`,
    );
  });

  it("keeps the surviving subpath exports", () => {
    const exports = readSharedExports();
    for (const key of [".", "./keyring", "./aura-client", "./*"]) {
      assert.ok(
        key in exports,
        `package.json should keep the ${key} export (guard against over-deletion)`,
      );
    }
  });

  it("has no src/digest directory", () => {
    const dir = path.join(sharedRoot, "src", "digest");
    assert.equal(
      fs.existsSync(dir),
      false,
      "packages/shared/src/digest should be deleted (fetch core, action builder, devlinks, clients, bitbucket, mcp-client, scheduler, types, settings loader)",
    );
  });

  it("has no test/digest directory", () => {
    const dir = path.join(sharedRoot, "test", "digest");
    assert.equal(
      fs.existsSync(dir),
      false,
      "packages/shared/test/digest should stay deleted (the digest unit tests went with the core; the per-ticket absence suites that once awaited consolidation live in this guard)",
    );
  });
});

// digest-core-and-build-pkg-cleanup: the scripts workspace is digest-free
// (manifest shape, digest-era files, the e2e families the digest clients
// had).
describe("no-remnants guard: scripts workspace", () => {
  it("carries no digest-era package name", () => {
    const pkg = readScriptsPackageJson();
    assert.ok(
      pkg.name !== undefined && !pkg.name.includes("digest"),
      `scripts package name should not mention digest, found: ${pkg.name ?? "none"}`,
    );
  });

  it("carries no digest-era description", () => {
    const pkg = readScriptsPackageJson();
    assert.ok(
      pkg.description !== undefined &&
        !pkg.description.toLowerCase().includes("digest"),
      `scripts package description should not mention digest, found: ${pkg.description ?? "none"}`,
    );
  });

  it("carries no MCP SDK dependency", () => {
    const pkg = readScriptsPackageJson();
    const deps = Object.keys(pkg.dependencies ?? {});
    const offenders = deps.filter((dep) => dep.includes("modelcontextprotocol"));
    assert.deepEqual(
      offenders,
      [],
      `scripts dependencies should not include the MCP SDK, found: ${offenders.join(", ")}`,
    );
  });

  it("has no legacy morning-fetch script", () => {
    const file = path.join(repoRoot, "scripts", "morning-fetch.js");
    assert.equal(
      fs.existsSync(file),
      false,
      "scripts/morning-fetch.js should be deleted",
    );
  });

  it("has no followup unit test", () => {
    const file = path.join(
      repoRoot,
      "scripts",
      "src",
      "followup-working-on.test.ts",
    );
    assert.equal(
      fs.existsSync(file),
      false,
      "scripts/src/followup-working-on.test.ts should be deleted",
    );
  });

  it("has no atlassian-keyring-auth e2e family", () => {
    const dir = path.join(repoRoot, "test", "atlassian-keyring-auth");
    assert.equal(
      fs.existsSync(dir),
      false,
      "test/atlassian-keyring-auth should be deleted with the digest clients it tests",
    );
  });

  it("has no bitbucket-token-infra e2e family", () => {
    const dir = path.join(repoRoot, "test", "bitbucket-token-infra");
    assert.equal(
      fs.existsSync(dir),
      false,
      "test/bitbucket-token-infra should be deleted with the digest clients it tests",
    );
  });

  it("has no wire-bitbucket-reader e2e family", () => {
    const dir = path.join(repoRoot, "test", "wire-bitbucket-reader");
    assert.equal(
      fs.existsSync(dir),
      false,
      "test/wire-bitbucket-reader should be deleted with the digest clients it tests",
    );
  });
});

// manifest-and-infra-cleanup: the shared settings and keyring surfaces
// carry the post-removal shape (no digest namespace, no Atlassian members).
describe("no-remnants guard: settings and keyring shape", () => {
  it("carries no digest namespace in the shared settings type", () => {
    const lines = readSharedSourceLines(path.join("src", "settings.ts"));
    const offending = lines.filter((line) =>
      line.toLowerCase().includes("digest"),
    );
    assert.deepEqual(
      offending,
      [],
      "the shared settings type should not mention the digest namespace (its consumers are gone)",
    );
  });

  it("carries no Atlassian members in the keyring secret-key union", () => {
    const lines = readSharedSourceLines(
      path.join("src", "keyring", "keyring.ts"),
    );
    const offending = lines.filter((line) =>
      line.toLowerCase().includes("atlassian"),
    );
    assert.deepEqual(
      offending,
      [],
      "the keyring secret-key union should not carry Atlassian members (dead surface after the provisioning removal)",
    );
  });

  it("keeps the Aura PAT member in the keyring secret-key union", () => {
    const source = fs.readFileSync(
      path.join(sharedRoot, "src", "keyring", "keyring.ts"),
      "utf-8",
    );
    assert.ok(
      source.includes('{ service: "aura"; name: "pat" }'),
      "the secret-key union should keep the aura/pat member (guard against over-deletion)",
    );
  });

  it("carries no Atlassian entries in the keyring backends' known-key lists", () => {
    const backends = [
      "file-keyring.ts",
      "macos-keyring.ts",
      "secret-service-keyring.ts",
    ];
    for (const backend of backends) {
      const lines = readSharedSourceLines(
        path.join("src", "keyring", backend),
      );
      const offending = lines.filter((line) =>
        line.toLowerCase().includes("atlassian"),
      );
      assert.deepEqual(
        offending,
        [],
        `${backend}'s known-key list should not carry Atlassian entries`,
      );
    }
  });
});

// manifest-and-infra-cleanup: the root manifest and infra carry the
// post-removal shape (devDependencies, runners, build manifest).
describe("no-remnants guard: root manifest and infra", () => {
  it("carries no dashboard-stack, profiling, or root-runner devDependencies", () => {
    const deps = readRootPackageJson().devDependencies ?? {};
    const dropped = [
      "@fontsource/bricolage-grotesque",
      "@lanterna-profiler/cli",
      "@sveltejs/vite-plugin-svelte",
      "@tailwindcss/vite",
      "@types/node",
      "0x",
      "daisyui",
      "happy-dom",
      "svelte",
      "tailwindcss",
      "typescript",
      "vite",
      "vitest",
    ];
    const offenders = dropped.filter((dep) => dep in deps);
    assert.deepEqual(
      offenders,
      [],
      `root devDependencies should be pruned to what remaining files and flows use, found: ${offenders.join(", ")}`,
    );
  });

  it("keeps the devDependency the extension suites still resolve", () => {
    const deps = readRootPackageJson().devDependencies ?? {};
    assert.ok(
      "@earendil-works/pi-tui" in deps,
      "root devDependencies should keep @earendil-works/pi-tui (aura-feedback imports it; the strip-types extension suites resolve it from the root install)",
    );
  });

  it("has no root vitest configuration", () => {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "vitest.config.ts")),
      false,
      "the root vitest config should be deleted with the last root test tree (the interim passWithNoTests flag goes with it)",
    );
  });

  it("has no root test tree", () => {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "test")),
      false,
      "the root test tree should be deleted (the per-package runner convention stands)",
    );
  });

  it("carries no digest-era comment in the build manifest", () => {
    const taskfile = fs.readFileSync(
      path.join(repoRoot, "Taskfile.yml"),
      "utf-8",
    );
    const offending = taskfile
      .split("\n")
      .filter((line) => line.toLowerCase().includes("digest"));
    assert.deepEqual(
      offending,
      [],
      "Taskfile.yml should not carry the digest-era bundle note (targets unchanged)",
    );
  });
});

// no-remnants-guard-and-archive: the dead digest effort is archived and
// off the task index's live list.
describe("no-remnants guard: task-tree archive seam", () => {
  it("has no live refine-phase-transition effort directory", () => {
    const dir = path.join(repoRoot, "docs", "tasks", DEAD_EFFORT);
    assert.equal(
      fs.existsSync(dir),
      false,
      `docs/tasks/${DEAD_EFFORT} should be archived out of the live task tree`,
    );
  });

  it("has the dead effort in the task archive", () => {
    const dir = path.join(repoRoot, "docs", "tasks", "archive", DEAD_EFFORT);
    assert.equal(
      fs.existsSync(dir),
      true,
      `docs/tasks/archive/${DEAD_EFFORT} should carry the archived effort`,
    );
  });

  it("drops the dead effort from the task index's live list", () => {
    const index = fs.readFileSync(
      path.join(repoRoot, "docs", "tasks", "index.md"),
      "utf-8",
    );
    const liveSection = index.split("## Archived")[0];
    assert.ok(
      liveSection.includes("## Live"),
      "docs/tasks/index.md should keep its Live section (sanity against a reformatted index)",
    );
    const offending = liveSection
      .split("\n")
      .filter((line) => line.trim() === `- ${DEAD_EFFORT}`);
    assert.deepEqual(
      offending,
      [],
      `docs/tasks/index.md should not list ${DEAD_EFFORT} as live`,
    );
  });
});

// no-remnants-guard-and-archive: this file is the single guard. The four
// per-ticket absence suites are consolidated here, not kept alongside it;
// re-adding one forks the guard.
describe("no-remnants guard: consolidation seam", () => {
  it("keeps no per-ticket absence suite alongside the consolidated guard", () => {
    const offenders = CONSOLIDATED_SUITES.filter((suite) =>
      fs.existsSync(path.join(sharedRoot, "test", "guards", suite)),
    );
    assert.deepEqual(
      offenders,
      [],
      `the per-ticket absence suites are consolidated into no-remnants.test.ts, still found: ${offenders.join(", ")}`,
    );
  });
});

// root-docs-refresh: the README describes the package as it now is. The
// skill table lists exactly the skills shipped under skills/core (the
// manifest scans ./skills), and no agents table remains (the package
// registers no subagents). Table content parsed structurally, not by
// position, so formatting drift cannot hide a row.
describe("no-remnants guard: README surface tables", () => {
  it("lists exactly the shipped skills in the README skill table", () => {
    const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8");
    const bounded = readme.split("## Prerequisites")[0];
    const skillsPart = bounded.split("### Skills")[1] ?? "";
    const tableSkills = skillsPart
      .split("\n")
      .filter((line) => line.startsWith("| `"))
      .map((line) => line.match(/^\| `([^`]+)`/)?.[1])
      .filter((name) => name !== undefined)
      .sort();
    const shipped = fs
      .readdirSync(path.join(repoRoot, "skills", "core"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(
      tableSkills,
      shipped,
      "the README skill table should list exactly the skills shipped under skills/core",
    );
  });

  it("carries no agents table", () => {
    const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8");
    assert.ok(
      !readme.includes("### Agents"),
      "the README should carry no agents table (the package ships no agents)",
    );
  });
});

// root-docs-refresh: the testing doc's runner and mock-convention
// descriptions match the post-removal reality (no root vitest, remaining
// suites only). Seam 1 applied to docs/testing.md.
describe("no-remnants guard: testing doc", () => {
  it("describes no deleted runners or test trees", () => {
    const lines = fs
      .readFileSync(path.join(repoRoot, "docs", "testing.md"), "utf-8")
      .split("\n");
    const offenders = lines
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line }) =>
          /vitest/i.test(line) ||
          line.includes("test/digest-dashboard") ||
          line.includes("test/atlassian-keyring-auth") ||
          line.includes("test/bitbucket-token-infra") ||
          line.includes("test/wire-bitbucket-reader") ||
          /atlassian-provision/i.test(line) ||
          line.includes("test/digest"),
      )
      .map(({ index, line }) => `docs/testing.md:${index + 1}: ${line.trim()}`);
    assert.deepEqual(
      offenders,
      [],
      "docs/testing.md should describe only the post-removal runners and remaining suites",
    );
  });

  it("re-points the FakeKeyring seam at the remaining hey-api-aura-client suite", () => {
    const testing = fs.readFileSync(path.join(repoRoot, "docs", "testing.md"), "utf-8");
    assert.ok(
      testing.includes("packages/shared/test/hey-api-aura-client.test.ts"),
      "the keyring mock convention should reference the remaining hey-api-aura-client suite",
    );
    assert.ok(
      testing.includes("FakeKeyring"),
      "the keyring mock convention should name the FakeKeyring seam",
    );
    assert.equal(
      fs.existsSync(
        path.join(repoRoot, "packages", "shared", "test", "hey-api-aura-client.test.ts"),
      ),
      true,
      "the re-pointed seam suite should exist on disk",
    );
  });
});

// root-docs-refresh: the five root docs describe the package as it now is.
// Seam 1 (arch spec, root-docs-refresh): no digest or
// Atlassian-provisioning mentions outside the task tree's history. The
// task tree (docs/tasks/**) is history-adjacent and out of scope here; the
// archived bug reports under docs/bugs/archive/ are history too.
const ROOT_DOCS = [
  "README.md",
  "CONTEXT.md",
  "AGENTS.md",
  "docs/testing.md",
  "docs/dev-env.md",
];

describe("no-remnants guard: root docs content", () => {
  it("carries no digest or Atlassian-provisioning mentions in the five root docs", () => {
    const offenders: string[] = [];
    for (const doc of ROOT_DOCS) {
      const lines = fs.readFileSync(path.join(repoRoot, doc), "utf-8").split("\n");
      for (const [index, line] of lines.entries()) {
        if (/digest|atlassian/i.test(line)) {
          offenders.push(`${doc}:${index + 1}: ${line.trim()}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "the five root docs should not mention the digest or Atlassian provisioning (the task tree's history owns those mentions)",
    );
  });
});
