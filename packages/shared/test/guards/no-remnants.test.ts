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
  workspaces?: string[];
  devDependencies?: Record<string, string>;
}

function readRootPackageJson(): RootPackageJson {
  const raw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8");
  return JSON.parse(raw) as RootPackageJson;
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
  it("leaves only the aura skill in the scan", () => {
    const skillsDir = path.join(repoRoot, "skills", "core");
    const entries = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(
      entries,
      ["aura"],
      `skills/core should contain only the aura skill (engineering-foundation moved out), found: ${entries.join(", ")}`,
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

// engineering-surfaces-move-out: the engineering-foundation skill and the
// engineering-rules extension left this package for the plugin repo, which
// becomes the sole delivery vehicle for the engineering canon. The package
// manifest lists exactly the six surviving extensions, both trees carry no
// moved-out surface, and the README and the project instructions file make
// no claim about them. Re-introducing either name fails the suite.
const SURVIVING_EXTENSIONS = [
  "./extensions/aura-skill-instruction.ts",
  "./extensions/aura-secrets.ts",
  "./extensions/aura-tasks.ts",
  "./extensions/aura-feedback.ts",
  "./extensions/aura-references.ts",
  "./extensions/aura-mcp-server.ts",
];

describe("no-remnants guard: engineering surfaces move-out", () => {
  it("registers exactly the six surviving extensions in the package manifest", () => {
    const pkg = readRootPackageJson();
    assert.deepEqual(
      [...(pkg.pi?.extensions ?? [])].sort(),
      [...SURVIVING_EXTENSIONS].sort(),
      "package.json should list exactly the six surviving extensions (engineering-rules moved out)",
    );
  });

  it("has no engineering-foundation skill directory", () => {
    const dir = path.join(repoRoot, "skills", "core", "engineering-foundation");
    assert.equal(
      fs.existsSync(dir),
      false,
      "skills/core/engineering-foundation should be deleted (the router skill moved to the plugin repo)",
    );
  });

  it("has no engineering-rules extension or its test", () => {
    for (const file of [
      "extensions/engineering-rules.ts",
      "extensions/engineering-rules.test.ts",
    ]) {
      assert.equal(
        fs.existsSync(path.join(repoRoot, file)),
        false,
        `${file} should be deleted (the extension moved to the plugin repo)`,
      );
    }
  });

  it("carries no claim about the removed surfaces in the README and the project instructions file", () => {
    const offenders: string[] = [];
    for (const doc of ["README.md", "AGENTS.md"]) {
      const lines = fs.readFileSync(path.join(repoRoot, doc), "utf-8").split("\n");
      for (const [index, line] of lines.entries()) {
        if (/engineering-foundation|engineering-rules/i.test(line)) {
          offenders.push(`${doc}:${index + 1}: ${line.trim()}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "README.md and AGENTS.md should not name the moved-out engineering surfaces",
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
    for (const key of [".", "./keyring", "./*"]) {
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

// digest-core-and-build-pkg-cleanup, then remove-cli-rest-surface: the
// scripts workspace carried the digest-era CLI first and the aura skill's
// CLI bundle afterwards; the remove-cli-rest-surface effort retired the
// bundled CLI and its build surface, leaving only the two shell scripts
// that serve the shared package (spec sync, release). The workspace
// itself is gone: no package.json/tsconfig/esbuild config, no src/ tree.
// The former per-file assertions on the deleted package manifest
// (digest-free name, description, no MCP SDK dependency) are superseded
// by the absence assertions below.
describe("no-remnants guard: scripts workspace removal", () => {
  it("has no scripts npm workspace manifests or build config", () => {
    const gone = [
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "esbuild.config.mjs",
    ];
    const offenders = gone.filter((file) =>
      fs.existsSync(path.join(repoRoot, "scripts", file)),
    );
    assert.deepEqual(
      offenders,
      [],
      `scripts/ should carry no npm workspace or build config after the CLI removal, still found: ${offenders.join(", ") || "none"}`,
    );
  });

  it("has no scripts/src CLI source or test tree", () => {
    const dir = path.join(repoRoot, "scripts", "src");
    assert.equal(
      fs.existsSync(dir),
      false,
      "scripts/src should be deleted with the bundled CLI (aura.ts, the rest-* command modules, gen-rest-*, their suites and the generated index)",
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

// remove-cli-rest-surface, then rest-library-consumer-rule: the agent-facing
// CLI and REST access surface is removed unconditionally (the operator's
// settled retirement), and the internal REST library followed the consumer
// rule (zero production consumers after the MCP migrations; the two
// type-only fixture imports inlined test-side). The bundle, its serving
// scripts, and the generated REST reference resource are gone; the build
// surface carries no target that produces them; the root manifest no longer
// lists the scripts workspace; and the shared package's spec sync and
// codegen targets went with the library.
describe("no-remnants guard: CLI and REST reference removal", () => {
  it("has no CLI bundle in the aura skill directory", () => {
    const dir = path.join(repoRoot, "skills", "core", "aura", "dist");
    assert.equal(
      fs.existsSync(dir),
      false,
      "skills/core/aura/dist should be deleted (the bundled aura.mjs CLI)",
    );
  });

  it("has no generated REST reference resource in the skill directory", () => {
    const file = path.join(
      repoRoot,
      "skills",
      "core",
      "aura",
      "resources",
      "rest-api.md",
    );
    assert.equal(
      fs.existsSync(file),
      false,
      "skills/core/aura/resources/rest-api.md should be deleted (the generated REST reference)",
    );
  });

  it("lists no scripts workspace in the root manifest", () => {
    const pkg = readRootPackageJson();
    assert.deepEqual(
      pkg.workspaces,
      ["packages/shared"],
      "package.json workspaces should list only packages/shared (the scripts workspace is deleted)",
    );
  });

  it("carries no CLI-bundle or REST-reference target in the Taskfile", () => {
    const taskfile = fs
      .readFileSync(path.join(repoRoot, "Taskfile.yml"), "utf-8")
      .split("\n");
    const banned = [
      "gen-rest-doc",
      "gen-rest-index",
      "esbuild",
      "aura.mjs",
      "AURA_DIST",
      "ENTRY_OUTS",
      "SCRIPTS_DIR",
    ];
    const offenders: string[] = [];
    for (const [index, line] of taskfile.entries()) {
      for (const needle of banned) {
        if (line.includes(needle)) {
          offenders.push(`Taskfile.yml:${index + 1}: ${line.trim()}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "Taskfile.yml should carry no target that builds or regenerates the CLI bundle or the REST reference",
    );
  });

  it("keeps the Taskfile target the package still needs", () => {
    const taskfile = fs.readFileSync(path.join(repoRoot, "Taskfile.yml"), "utf-8");
    assert.ok(
      taskfile.includes("typecheck"),
      "Taskfile.yml should keep the typecheck target (guard against over-deletion)",
    );
  });
});

// rest-library-consumer-rule: the internal REST library followed the
// consumer rule. The count after the MCP migrations and the CLI removal:
// zero production consumers; the only remaining import sites were two
// type-only fixture imports in extensions/aura-feedback.test.ts
// (CreateFeedbackInput, FeedbackDetail), inlined as local fixture types.
// Removed: the generated client (src/generated/), its wrapper
// (aura-client.ts, hey-api-aura-client.ts), the REST credential path
// (aura-credentials.ts), the spec loader and the generic-invoker helpers
// (src/openapi/, src/rest/), the spec source (openapi/openapi.yaml), the
// sync and codegen targets (the Taskfile targets, scripts/openapi-sync.sh,
// openapi-ts.config.ts, tsconfig.codegen.json, the codegen devDependency),
// and the library's tests. The embedding provider (src/embed/) is not the
// REST library and survives the removal.
const REST_LIBRARY_FILES_GONE = [
  "packages/shared/src/aura-client.ts",
  "packages/shared/src/hey-api-aura-client.ts",
  "packages/shared/src/aura-credentials.ts",
  "packages/shared/openapi-ts.config.ts",
  "packages/shared/tsconfig.codegen.json",
  "scripts/openapi-sync.sh",
  "packages/shared/test/hey-api-aura-client.test.ts",
  "packages/shared/test/blueprint-version-verbs.test.ts",
  "packages/shared/test/review-verbs.test.ts",
  "packages/shared/test/aura-credentials.test.ts",
  "packages/shared/test/openapi-loader.test.ts",
];

const REST_LIBRARY_DIRS_GONE = [
  "packages/shared/src/generated",
  "packages/shared/src/openapi",
  "packages/shared/src/rest",
  "packages/shared/openapi",
  "packages/shared/test/rest",
  "packages/shared/test/openapi-fixtures",
];

describe("no-remnants guard: REST library removal", () => {
  it("has no REST library source, spec, or test files", () => {
    const offenders = REST_LIBRARY_FILES_GONE.filter((file) =>
      fs.existsSync(path.join(repoRoot, file)),
    );
    assert.deepEqual(
      offenders,
      [],
      `the REST library files should be deleted (zero production consumers; the consumer rule removes the library), still found: ${offenders.join(", ") || "none"}`,
    );
  });

  it("has no generated client, spec, invoker, or fixture directories", () => {
    const offenders = REST_LIBRARY_DIRS_GONE.filter((dir) =>
      fs.existsSync(path.join(repoRoot, dir)),
    );
    assert.deepEqual(
      offenders,
      [],
      `the REST library directories should be deleted with the library, still found: ${offenders.join(", ") || "none"}`,
    );
  });

  it("registers no aura-client subpath export and no codegen tooling in the shared package", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(sharedRoot, "package.json"), "utf-8"),
    ) as {
      exports?: Record<string, string>;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.equal(
      "./aura-client" in (pkg.exports ?? {}),
      false,
      "package.json should not export the removed ./aura-client subpath",
    );
    assert.equal(
      "codegen" in (pkg.scripts ?? {}),
      false,
      "package.json should carry no codegen script (the generated client is removed)",
    );
    assert.equal(
      "@hey-api/openapi-ts" in (pkg.devDependencies ?? {}),
      false,
      "package.json should carry no @hey-api/openapi-ts devDependency (the codegen target is removed)",
    );
  });

  it("carries no sync or codegen target in the Taskfile", () => {
    const taskfile = fs.readFileSync(path.join(repoRoot, "Taskfile.yml"), "utf-8");
    const banned = /^  (codegen|gen|openapi-sync|openapi-sync-and-codegen):$/m;
    const offenders = taskfile
      .split("\n")
      .filter((line) => banned.test(line));
    assert.deepEqual(
      offenders,
      [],
      `Taskfile.yml should carry no sync or codegen target (the REST library is removed), still found: ${offenders.join(" | ") || "none"}`,
    );
  });

  it("keeps the surviving shared package surface and the remaining seam suite", () => {
    for (const kept of [
      "packages/shared/src/embed",
      "packages/shared/src/settings.ts",
      "packages/shared/src/keyring",
      "packages/shared/test/embed/local-provider.test.ts",
      "extensions/aura-mcp-client.test.ts",
    ]) {
      assert.equal(
        fs.existsSync(path.join(repoRoot, kept)),
        true,
        `${kept} should survive the REST library removal (guard against over-deletion)`,
      );
    }
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

// aura-skill-rewrite: the skill file teaches the live 120-tool server
// (build 2026-10-12, commit 4aa37833) per the mcp-inventory report's
// outline (that report's section 9). The audit's load-bearing facts are
// pinned here in the existing guard style; the per-claim mapping of the
// drift table is recorded in the ticket's workflow records. A retired
// claim reappearing in the skill file fails the suite.
const SKILL_FILE = "skills/core/aura/SKILL.md";

function readSkillFile(): string {
  return fs.readFileSync(path.join(repoRoot, SKILL_FILE), "utf-8");
}

describe("no-remnants guard: aura skill rewrite", () => {
  it("teaches the live 120-tool server with the build identity cited once", () => {
    const skill = readSkillFile();
    assert.match(
      skill,
      /\b120 tools\b/,
      "the skill should state the live 120-tool count",
    );
    assert.match(skill, /2026-10-12/, "the skill should cite the build date");
    assert.equal(
      (skill.match(/4aa37833/g) ?? []).length,
      1,
      "the build commit should be cited exactly once (the drift-detection anchor)",
    );
    assert.doesNotMatch(
      skill,
      /\b90 tools\b|\b90-tool\b/,
      "the stale 90-tool count should be gone",
    );
  });
  it("keeps the ten mcp* tools with the corrected one-liners and the live kind list", () => {
    const skill = readSkillFile();
    for (const tool of [
      "mcpAnswerQuestion",
      "mcpCreateArtifact",
      "mcpCreateUploadDocument",
      "mcpGetKnowledgeDocument",
      "mcpGetQuestion",
      "mcpGetRepoDocument",
      "mcpGetUploadDocument",
      "mcpLinkUploadToTask",
      "mcpListCodeRepositories",
      "mcpUpdateArtifact",
    ]) {
      assert.ok(
        skill.includes(tool),
        `the mcp* list should keep ${tool}`,
      );
    }
    // mcpCreateArtifact: the OPINION kind replaced review; TEMPORARY stays chat-only.
    assert.match(
      skill,
      /PLAN, OPINION, or GENERIC/,
      "mcpCreateArtifact's one-liner should name the live kind list",
    );
    assert.doesNotMatch(
      skill,
      /plan, review, generic doc/,
      "the retired review kind should not be listed",
    );
    assert.match(
      skill,
      /chat-only TEMPORARY/i,
      "the chat-only TEMPORARY kind should stay qualified",
    );
    // mcpCreateUploadDocument: base64 ingest with the size limit.
    assert.match(
      skill,
      /ingest a file from base64 content/i,
      "the upload one-liner should describe base64 ingest",
    );
    assert.match(skill, /\b10 MB\b/, "the upload limit should be stated");
    // mcpUpdateArtifact: whole mode with the limits and the expected-version contract.
    assert.match(
      skill,
      /`section` or `whole` mode/,
      "the update one-liner should name whole mode (full is gone)",
    );
    assert.doesNotMatch(
      skill,
      /full or section mode/,
      "the retired full mode wording should be gone",
    );
    assert.match(skill, /200,000/, "the whole-body limit should be stated");
    assert.match(skill, /50,000/, "the section limit should be stated");
    assert.match(
      skill,
      /expected_version/,
      "the expected-version merge-base contract should be stated",
    );
  });
  it("replaces the left-MCP paragraph with the per-capability scorecard", () => {
    const skill = readSkillFile();
    assert.doesNotMatch(
      skill,
      /left MCP entirely/,
      "the retired left-MCP paragraph should be gone",
    );
    assert.match(skill, /Back on MCP/, "the scorecard's back tier should exist");
    assert.match(skill, /Half back/, "the scorecard's half-back tier should exist");
    assert.match(skill, /Still absent/, "the scorecard's absent tier should exist");
    // Back: the three capacity tools, board summary, owner and crew search.
    for (const tool of [
      "readCapacity",
      "updateTaskMemberCapacity",
      "updateTaskMemberParticipation",
      "getBoardSummary",
      "searchUsers",
      "listUsers",
    ]) {
      assert.ok(skill.includes(tool), `the back tier should name ${tool}`);
    }
    // Half back: Jira and Asana reads, wiki file reads, memory browse plus ingest.
    for (const tool of [
      "getTaskByJiraKey",
      "getAsanaTask",
      "listKnowledgeFiles",
      "listMemoryEntities",
      "acceptArtifactMemory",
    ]) {
      assert.ok(skill.includes(tool), `the half-back tier should name ${tool}`);
    }
    // Still absent: the opinion flow's only trace is its listing filter; no
    // notification tool exists; skills import and wiki upload stay UI-side.
    assert.match(
      skill,
      /opinion_requested/,
      "the opinion flow's listing filter should be named",
    );
    assert.match(
      skill,
      /no notification tool/i,
      "the notification absence should be stated",
    );
    assert.match(
      skill,
      /Aura UI/,
      "REST-only capabilities should carry a UI pointer",
    );
  });
  it("documents the response-format contract", () => {
    const skill = readSkillFile();
    assert.match(
      skill,
      /response_format/,
      "the response_format parameter should be named",
    );
    assert.match(
      skill,
      /default[^\n]*compact|compact[^\n]*default/i,
      "compact should be documented as the default tier",
    );
    assert.match(skill, /"detail"/, "the detail tier should be documented");
    assert.match(skill, /"full"/, "the full tier should be documented");
    assert.match(
      skill,
      /getTask[^\n]*getTaskByHumanKey|getTaskByHumanKey[^\n]*getTask/,
      "the full tier should be scoped to the two task reads",
    );
    assert.match(
      skill,
      /MCP-only/i,
      "the tiering should be marked MCP-only",
    );
    assert.match(
      skill,
      /not part of the HTTP API/,
      "the tiering should be marked outside the HTTP API",
    );
    assert.match(
      skill,
      /permission\s+apparatus/i,
      "the permission-apparatus exclusion should be documented",
    );
    assert.match(
      skill,
      /same PAT[^.]*through REST/,
      "the same-PAT-through-REST note should be present",
    );
  });
  it("carries no unaddressed drift row: flat comments, current bullets, fixed naming", () => {
    const skill = readSkillFile();
    // Comments: flat per the live listComments description.
    assert.match(skill, /flat comments/i, "comments should be taught as flat");
    assert.doesNotMatch(skill, /threaded/i, "the threaded wording should be gone");
    // The stale feedback tool-name token is fixed to the current pi naming.
    assert.match(
      skill,
      /mcp__aura_mcp_dev__createFeedback/,
      "the feedback tool to avoid should carry its current pi name",
    );
    assert.doesNotMatch(
      skill,
      /aura-mcp-dev_createFeedback/,
      "the stale feedback tool-name token should be gone",
    );
    // The tool-name prefix is the current pi rendering, not the old one.
    assert.match(skill, /mcp__aura_mcp_dev__/);
    assert.doesNotMatch(skill, /aura_2d_mcp_2d_dev_/);
    // The What-Aura-can-do bullets carry the live truth.
    assert.doesNotMatch(
      skill,
      /assets, plugins, and import\/export/,
      "the stale skills bullet (assets, import/export) should be gone",
    );
    assert.doesNotMatch(
      skill,
      /plans, reviews, generic docs/,
      "the stale artifact kind wording should be gone",
    );
    assert.doesNotMatch(
      skill,
      /review workflows, approval gates/,
      "the stale review-flow wording should be gone",
    );
  });
  it("teaches the codemode file workflow, not the CLI", () => {
    const skill = readSkillFile();
    assert.match(
      skill,
      /codemode/i,
      "the file workflow should be taught as the codemode pattern",
    );
    assert.match(
      skill,
      /`write` tool/,
      "the write tool should be named as the disk half of the pattern",
    );
    assert.match(
      skill,
      /no CLI/i,
      "the pattern should state that no CLI is involved",
    );
    // Downloading an artifact is reading it through MCP, then writing it to disk.
    assert.match(
      skill,
      /`getArtifact`/,
      "the MCP read half of the download pattern should name getArtifact",
    );
  });
  it("mentions neither expected-dead tool", () => {
    const skill = readSkillFile();
    assert.doesNotMatch(
      skill,
      /\baiSetup\b/,
      "aiSetup is expected to be dropped by Aura and must not be documented",
    );
    assert.doesNotMatch(
      skill,
      /\bgetBlueprintFiles\b/,
      "getBlueprintFiles is expected to be dropped by Aura and must not be documented",
    );
  });
  it("carries no em-dash in its own prose", () => {
    const skill = readSkillFile();
    const offenders = skill
      .split("\n")
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes("\u2014"))
      .map(({ index, line }) => `${SKILL_FILE}:${index + 1}: ${line.trim()}`);
    assert.deepEqual(
      offenders,
      [],
      "SKILL.md should carry no em-dash (the repo's prose rule)",
    );
  });
});

// usecase-resources-current: the twelve usecase resource files teach the
// live 120-tool server per the usecase-resources-drift report's per-file
// worklist and the confirmed placement map. The audit's load-bearing
// corrections are pinned here in the existing guard style; a retired claim
// reappearing in a usecase file fails the suite.
const USECASES_DIR = "skills/core/aura/resources/usecases";

function readUsecase(file: string): string {
  return fs.readFileSync(path.join(repoRoot, USECASES_DIR, file), "utf-8");
}

describe("no-remnants guard: usecase resources current (capacity)", () => {
  it("documents readCapacity's four scopes with their access semantics", () => {
    const file = readUsecase("capacity-planning.md");
    for (const scope of ["me", "person", "group", "company"]) {
      assert.ok(
        file.includes(`"${scope}"`),
        `the capacity file should document the ${scope} scope`,
      );
    }
    assert.match(
      file,
      /VIEW_CAPACITY_OVERVIEW/,
      "the foreign-person capability gate should be named",
    );
    assert.match(
      file,
      /LEAD of a common group/,
      "the foreign-person lead gate should be named",
    );
    assert.match(
      file,
      /my team|every group where/i,
      "the group scope's omit-group_id behavior should be documented",
    );
    assert.match(
      file,
      /paginated/i,
      "the company scope's pagination should be documented",
    );
  });

  it("teaches the leadership overview as live on MCP, not UI-only", () => {
    const file = readUsecase("capacity-planning.md");
    const section = file.split("### Leadership overview")[1]?.split("\n### ")[0] ?? "";
    assert.notEqual(section, "", "the leadership overview section should exist");
    assert.match(
      section,
      /readCapacity[^\n]*"company"|"company"[^\n]*readCapacity/,
      "the leadership overview section should point at readCapacity scope company",
    );
    assert.match(
      section,
      /Leadership\/Admin/,
      "the leadership overview should carry its capability gate",
    );
    assert.doesNotMatch(
      file,
      /Leadership overview \(admin\/leadership only, UI-only\)/,
      "the stale UI-only leadership claim should be gone (readCapacity scope company is live)",
    );
  });

  it("carries the two write tools' contracts and their consent warnings", () => {
    const file = readUsecase("capacity-planning.md");
    assert.match(
      file,
      /10% steps/,
      "updateTaskMemberCapacity's step semantics should be stated",
    );
    assert.match(
      file,
      /null to clear|`capacity_percent: null`/,
      "clearing a commitment should be documented",
    );
    for (const status of ["ACTIVE", "WAITING", "OBSERVING"]) {
      assert.ok(file.includes(status), `participation statuses should include ${status}`);
    }
    assert.match(
      file,
      /at least one of note or status is required/i,
      "the participation tool's either-or requirement should be stated",
    );
    assert.match(
      file,
      /explicitly asks/i,
      "the participation consent warning should be carried over",
    );
    assert.match(
      file,
      /Waiting on me/,
      "the ACTIVE-plus-note board-directive warning should be carried over",
    );
  });

  it("keeps the REST-only capabilities as UI pointers with no blanket claims", () => {
    const file = readUsecase("capacity-planning.md");
    assert.match(
      file,
      /capacity settings/,
      "company capacity settings should keep their UI pointer",
    );
    assert.match(
      file,
      /Aura UI/,
      "REST-only capabilities should carry a UI pointer",
    );
    assert.doesNotMatch(
      file,
      /All capacity\s+capabilities are REST-ONLY|every capacity tool is gone|195 → 90/,
      "the false blanket REST-only claims and the stale tool count should be gone",
    );
    assert.doesNotMatch(
      file,
      /\bGET \//,
      "no REST call should be taught in the capacity file",
    );
  });
});

describe("no-remnants guard: usecase resources current (signals)", () => {
  it("addresses all three signal tools by id, not uuid", () => {
    const file = readUsecase("signals.md");
    assert.match(file, /getSignal\(\{ id:/, "getSignal should be called with id");
    assert.match(
      file,
      /reviewSignal\(\{[\s\S]*?id:/,
      "reviewSignal should be called with id",
    );
    assert.match(
      file,
      /createTaskFromSignal\(\{ id:/,
      "createTaskFromSignal should be called with id",
    );
    assert.doesNotMatch(
      file,
      /uuid:/,
      "no signal tool takes a uuid parameter anymore",
    );
  });

  it("states when reason_code is required on a review", () => {
    const file = readUsecase("signals.md");
    assert.match(
      file,
      /reason_code[\s\S]{0,200}(required when|only when|Required when)[\s\S]{0,80}DISMISS/i,
      "reason_code should be documented as required when action is DISMISS",
    );
    assert.match(
      file,
      /reason_text/,
      "the optional free-text reason should be named",
    );
  });
});

describe("no-remnants guard: usecase resources current (wiki)", () => {
  it("addresses every knowledge write tool by id, not uuid", () => {
    const file = readUsecase("wiki-knowledge.md");
    for (const tool of [
      "saveKnowledgeNodeBody",
      "saveKnowledgeNodeFrontmatter",
      "updateKnowledgeNode",
      "restoreKnowledgeNodeVersion",
    ]) {
      assert.ok(file.includes(tool), `the wiki file should document ${tool}`);
    }
    assert.doesNotMatch(
      file,
      /uuid:/,
      "no knowledge tool takes a uuid parameter anymore",
    );
  });

  it("documents the frontmatter save contract (identifier plus raw YAML or null)", () => {
    const file = readUsecase("wiki-knowledge.md");
    const section = file.split("### Update frontmatter")[1]?.split("\n### ")[0] ?? "";
    assert.notEqual(section, "", "the frontmatter section should exist");
    assert.match(
      section,
      /saveKnowledgeNodeFrontmatter\(\{[\s\S]*?id:/,
      "the frontmatter save should be keyed by id",
    );
    assert.match(
      section,
      /raw:/,
      "the frontmatter save should take the raw parameter",
    );
    assert.match(
      section,
      /YAML/,
      "the raw parameter should be described as a raw YAML string",
    );
    assert.match(
      section,
      /null`?\s*to clear/i,
      "clearing the frontmatter with null should be documented",
    );
    assert.doesNotMatch(
      section,
      /frontmatter:\s*\{/, 
      "the nonexistent frontmatter-object parameter should be gone",
    );
  });

  it("documents the version numbering shape and the file-asset version history", () => {
    const file = readUsecase("wiki-knowledge.md");
    assert.match(
      file,
      /version: "2"/,
      "restore should pass the version as a decimal string",
    );
    assert.match(
      file,
      /decimal string/i,
      "the version shape should be called out as a decimal string",
    );
    assert.match(
      file,
      /listKnowledgeFileVersions/,
      "the file-asset version history should be documented",
    );
    assert.match(
      file,
      /checksum/,
      "the per-version checksum and provenance should be mentioned",
    );
  });

  it("documents the tree bounds and the node-update extras", () => {
    const file = readUsecase("wiki-knowledge.md");
    assert.match(
      file,
      /max_nodes/,
      "the tree answer's node bound should be documented",
    );
    assert.match(
      file,
      /depth/,
      "the tree answer's depth bound should be documented",
    );
    const update = file.split("### Rename, move, or reorder")[1]?.split("\n### ")[0] ?? "";
    assert.notEqual(update, "", "the rename/move section should exist");
    assert.match(
      update,
      /updateKnowledgeNode\(\{[\s\S]*?id:/,
      "node updates should be keyed by id",
    );
    assert.match(
      update,
      /slug/,
      "the slug parameter should be documented (rejected for FILE nodes)",
    );
    assert.match(
      update,
      /tags/,
      "the tag replacement parameter should be documented",
    );
  });
});

describe("no-remnants guard: usecase resources current (skills)", () => {
  it("keys the skill write tools by id and shows the visibility value", () => {
    const file = readUsecase("skills-management.md");
    assert.doesNotMatch(file, /uuid:/, "no skill tool takes a uuid parameter anymore");
    assert.match(
      file,
      /saveSkillBody\(\{[\s\S]*?id:/,
      "saveSkillBody should be called with id",
    );
    assert.match(
      file,
      /updateSkill\(\{[\s\S]*?id:/,
      "updateSkill should be called with id",
    );
    assert.match(
      file,
      /setSkillVisibility\(\{[\s\S]*?visibility: "(PERSONAL|PUBLIC)"/,
      "setSkillVisibility should show its one required value",
    );
    assert.match(
      file,
      /PERSONAL.*\|.*PUBLIC|PERSONAL.*PUBLIC/s,
      "the visibility value set should be named",
    );
  });

  it("documents createSkill's required slug", () => {
    const file = readUsecase("skills-management.md");
    assert.match(
      file,
      /createSkill\(\{[\s\S]*?slug:/,
      "createSkill should show the required slug",
    );
    assert.match(
      file,
      /lowercase\s+alphanumeric/i,
      "the slug format should be stated",
    );
  });

  it("mentions the read-side filters and the response tiers", () => {
    const file = readUsecase("skills-management.md");
    assert.match(
      file,
      /plugin_id/,
      "listSkills's plugin filter should be mentioned",
    );
    assert.match(
      file,
      /response_format/,
      "getSkill's response_format tiers should be mentioned",
    );
  });
});

describe("no-remnants guard: usecase resources current (unified search)", () => {
  it("lists FEEDBACK in the source_types enum", () => {
    const file = readUsecase("unified-search.md");
    const enumLine = file.split("source_types` (array, required)")[1]?.split("\n- ")[0] ?? "";
    assert.match(enumLine, /FEEDBACK/, "the enum should include FEEDBACK");
    for (const kind of ["TASK", "ARTIFACT", "GLOSSARY", "TOOL"]) {
      assert.ok(enumLine.includes(kind), `the enum should keep ${kind}`);
    }
  });

  it("documents the per-source-type limit semantics", () => {
    const file = readUsecase("unified-search.md");
    assert.match(
      file,
      /per source type/i,
      "the limit should be documented as per source type",
    );
    assert.match(
      file,
      /1.{0,3}20|1 to 20/,
      "the limit bounds (1 to 20) should be stated",
    );
    assert.match(file, /default 5/, "the limit default (5) should be stated");
  });

  it("resolves search hits with id-keyed get tools", () => {
    const file = readUsecase("unified-search.md");
    assert.match(
      file,
      /getTask\(\{ id:/,
      "getTask should be called with id in the example workflow",
    );
    assert.doesNotMatch(file, /getTask\(\{ uuid:/, "getTask takes no uuid");
  });

  it("documents the mention-candidate tool with its required keys", () => {
    const file = readUsecase("unified-search.md");
    assert.match(
      file,
      /listMentionCandidates/,
      "the mention-candidate tool should be documented",
    );
    assert.match(
      file,
      /entity_type[\s\S]{0,120}ARTIFACT[\s\S]{0,10}TASK|ARTIFACT[\s\S]{0,10}\|[\s\S]{0,10}TASK/,
      "the candidate tool's entity types should be named",
    );
    assert.match(
      file,
      /has_access/,
      "the candidate flag should be named",
    );
  });

  it("carries a find-feedback scenario", () => {
    const file = readUsecase("unified-search.md");
    assert.match(
      file,
      /FEEDBACK.*\|/,
      "the scenario table should include a FEEDBACK row",
    );
  });
});

describe("no-remnants guard: usecase resources current (code search)", () => {
  it("teaches no ref parameter", () => {
    const file = readUsecase("code-search.md");
    assert.doesNotMatch(
      file,
      /`ref`/,
      "the nonexistent ref parameter should be gone",
    );
    assert.doesNotMatch(
      file,
      /search a specific branch/,
      "ref-scoped search should not be taught",
    );
  });

  it("documents the repository-slug format for repo documents", () => {
    const file = readUsecase("code-search.md");
    assert.match(
      file,
      /source\/workspace\/slug/,
      "the mcpGetRepoDocument slug format should be documented",
    );
    assert.match(
      file,
      /bitbucket\/anwaltde\/aura/,
      "a concrete live-format example should be shown",
    );
  });

  it("states the top_k default", () => {
    const file = readUsecase("code-search.md");
    assert.match(
      file,
      /top_k[^\n]*default 5|default 5[^\n]*top_k/i,
      "the top_k default should be stated",
    );
  });
});

describe("no-remnants guard: usecase resources current (artifacts)", () => {
  it("lists the live listArtifacts filters", () => {
    const file = readUsecase("artifact-management.md");
    assert.doesNotMatch(
      file,
      /pending_review/,
      "the nonexistent pending_review filter should be gone",
    );
    assert.match(
      file,
      /opinion_requested/,
      "the live opinion_requested filter should be documented",
    );
    assert.match(
      file,
      /broad_shared/,
      "the ownership scopes should include broad_shared",
    );
  });

  it("documents listArtifactTasks for task discovery from an artifact", () => {
    const file = readUsecase("artifact-management.md");
    assert.match(
      file,
      /listArtifactTasks/,
      "the linked-tasks listing should be documented",
    );
    assert.match(
      file,
      /non-paginated|updated_at DESC/i,
      "the linked-tasks listing's shape should be stated",
    );
  });

  it("documents the whole-mode replace contract with expected-version", () => {
    const file = readUsecase("artifact-management.md");
    assert.match(
      file,
      /expected_version/,
      "the expected_version merge-base parameter should be documented",
    );
    assert.match(
      file,
      /merge base/i,
      "expected_version's merge-base meaning should be stated",
    );
    assert.match(
      file,
      /BASE_VERSION_REQUIRED/,
      "the dirty-draft whole-mode requirement should be named",
    );
    assert.match(
      file,
      /confirm_full_replace/,
      "the destructive-replace confirmation should be documented",
    );
    assert.match(
      file,
      /DESTRUCTIVE_WHOLE_REPLACE/,
      "the rejection that demands confirmation should be named",
    );
  });
});

describe("no-remnants guard: usecase resources current (memory graph)", () => {
  it("documents the aura-native memory ingest", () => {
    const file = readUsecase("memory-graph.md");
    assert.match(
      file,
      /acceptArtifactMemory/,
      "the ingest facility should be documented in the memory-graph file",
    );
    assert.match(
      file,
      /idempotent/i,
      "the ingest's idempotence should be stated",
    );
  });

  it("describes the entity source as a navigable route, not provenance", () => {
    const file = readUsecase("memory-graph.md");
    const section = file.split("### `getMemoryEntitySource`")[1]?.split("\n### ")[0] ?? "";
    assert.notEqual(section, "", "the entity-source section should exist");
    assert.match(
      section,
      /route|URL/i,
      "the entity source should be described as a navigable route or URL",
    );
    assert.match(
      section,
      /jump|open|navigate/i,
      "the route's purpose (jumping to the source) should be stated",
    );
    assert.doesNotMatch(
      section,
      /provenance/i,
      "the provenance phrasing should be gone",
    );
  });

  it("corrects the question-report contract (no reason parameter)", () => {
    const file = readUsecase("memory-graph.md");
    const section = file.split("## Reporting issues")[1] ?? "";
    assert.notEqual(section, "", "the reporting-issues section should exist");
    assert.doesNotMatch(
      section,
      /reason:/,
      "the nonexistent reason parameter should be gone",
    );
    assert.match(
      section,
      /open question/i,
      "the tool's open-question mechanism should be described",
    );
    assert.match(
      section,
      /does not modify/i,
      "the no-edge-modification behavior should be stated",
    );
  });

  it("covers the fuller facet vocabulary of the entity list", () => {
    const file = readUsecase("memory-graph.md");
    for (const facet of [
      "confidence_min",
      "fact_layer",
      "sensitivity",
      "predicate",
    ]) {
      assert.ok(
        file.includes(facet),
        `the entity list should document the ${facet} facet`,
      );
    }
  });
});

describe("no-remnants guard: usecase resources current (feedback)", () => {
  it("names the createFeedback tool with its current pi prefix", () => {
    const file = readUsecase("feedback-submission.md");
    assert.match(
      file,
      /mcp__aura_mcp_dev__createFeedback/,
      "the MCP tool to avoid should carry its current pi name",
    );
    assert.doesNotMatch(
      file,
      /aura-mcp-dev_createFeedback/,
      "the stale tool-name token should be gone",
    );
  });

  it("states the live createFeedback source values and the aura_feedback pin", () => {
    const file = readUsecase("feedback-submission.md");
    assert.match(
      file,
      /UI.*AGENT.*MCP|AGENT.*MCP/s,
      "the server tool's source values should be named",
    );
    assert.match(
      file,
      /source: "MCP"|`source`.*MCP/s,
      "aura_feedback's MCP pin should be stated",
    );
  });

  it("documents the read and triage family", () => {
    const file = readUsecase("feedback-submission.md");
    for (const tool of [
      "getFeedback",
      "listFeedback",
      "changeFeedbackStatus",
      "linkFeedbackTask",
      "linkRelatedFeedback",
    ]) {
      assert.ok(file.includes(tool), `the triage family should include ${tool}`);
    }
    assert.match(
      file,
      /discard_reason/i,
      "the DISCARDED discard-reason requirement should be stated",
    );
    assert.match(
      file,
      /VIEW_FEEDBACK/,
      "the triage capability gate should be named",
    );
  });
});

describe("no-remnants guard: usecase resources current (task management)", () => {
  it("carries the placement-map families", () => {
    const file = readUsecase("task-management.md");
    for (const tool of [
      "addTaskMember",
      "setTaskMemberRoles",
      "updateTaskBlocked",
      "estimateTaskStoryPoints",
      "acceptTaskStoryPointEstimate",
      "setTaskStoryPoints",
      "listTaskStoryPointEstimates",
      "getMyPriorityQueue",
      "listMyProgress",
      "listTaskActivity",
      "getUserGroup",
      "listUserGroups",
      "createUserGroup",
      "addUserGroupMember",
      "updateUserGroup",
      "updateUserGroupMemberRole",
      "linkRepositoryToTask",
    ]) {
      assert.ok(file.includes(tool), `the task file should document ${tool}`);
    }
    assert.match(
      file,
      /workflow_variant/,
      "the workflow variant should be documented as a create field",
    );
  });

  it("drops the false no-member-management claim", () => {
    const file = readUsecase("task-management.md");
    assert.doesNotMatch(
      file,
      /not available via MCP after the overhaul\. Use the\s+Aura UI\.$/m,
      "the blanket owner/crew absence claim should be gone",
    );
    const section = file.split("## Owner and crew management")[1]?.split("\n## ")[0] ?? "";
    assert.notEqual(section, "", "the owner/crew section should exist");
    assert.match(
      section,
      /addTaskMember/,
      "the owner/crew section should teach the MCP member tools",
    );
  });

  it("keeps the create fields aligned with the live schema", () => {
    const file = readUsecase("task-management.md");
    assert.doesNotMatch(
      file,
      /repository_uuids/,
      "the nonexistent repository_uuids field should be gone",
    );
    assert.match(
      file,
      /Up to three tags|up to three/i,
      "the three-tag cap should be stated",
    );
  });

  it("calls recordTaskProgress with id", () => {
    const file = readUsecase("task-management.md");
    assert.match(
      file,
      /recordTaskProgress\(\{[\s\S]*?id:/,
      "recordTaskProgress should be called with id",
    );
    assert.doesNotMatch(
      file,
      /uuid: "<task-uuid>"\s*,\s*\n\s*note:/,
      "the stale uuid-keyed progress example should be gone",
    );
  });

  it("keeps the verified planning-hub phrasing for getTask", () => {
    const file = readUsecase("task-management.md");
    const row = file.split("| By UUID |")[1]?.split("\n")[0] ?? "";
    assert.match(
      row,
      /planning hub/i,
      "the planning-hub phrasing should stay (verified against a live full payload)",
    );
    assert.match(
      row,
      /artifacts/i,
      "the planning-hub row should name linked artifacts",
    );
  });

  it("documents the relation duplicate policy", () => {
    const file = readUsecase("task-management.md");
    assert.match(
      file,
      /on_duplicate/,
      "createTaskRelation's on_duplicate should be documented",
    );
  });
});

describe("no-remnants guard: usecase resources current (questions and uploads)", () => {
  it("cross-references the question-reporting tool from the questions file", () => {
    const file = readUsecase("questions-workflow.md");
    assert.match(
      file,
      /reportMemoryEntityQuestion/,
      "the question-reporting tool should be cross-referenced",
    );
    assert.match(
      file,
      /memory-graph\.md/,
      "the cross-reference should point at the memory-graph use case",
    );
  });

  it("keeps the re-verified upload baseline pinned", () => {
    const file = readUsecase("upload-documents.md");
    assert.match(
      file,
      /mcpCreateUploadDocument/,
      "the upload tool should stay documented",
    );
    assert.match(
      file,
      /10 MB/,
      "the upload size limit should stay stated",
    );
    assert.match(
      file,
      /base64/i,
      "the base64 ingest shape should stay stated",
    );
    assert.match(
      file,
      /mcpGetUploadDocument/,
      "the retrieval tool should stay documented",
    );
    assert.match(
      file,
      /mcpLinkUploadToTask/,
      "the linking tool should stay documented",
    );
  });
});

// usecase-resources-current: no em-dash anywhere in the twelve usecase
// resource files (the repo's prose rule; every file is touched by this
// ticket's corrections).
const USECASE_FILES = [
  "artifact-management.md",
  "capacity-planning.md",
  "code-search.md",
  "feedback-submission.md",
  "memory-graph.md",
  "questions-workflow.md",
  "signals.md",
  "skills-management.md",
  "task-management.md",
  "unified-search.md",
  "upload-documents.md",
  "wiki-knowledge.md",
];

describe("no-remnants guard: usecase resources current (prose)", () => {
  it("carries no em-dash in any usecase file", () => {
    const offenders: string[] = [];
    for (const file of USECASE_FILES) {
      const content = readUsecase(file);
      content
        .split("\n")
        .forEach((line, index) => {
          if (line.includes("\u2014")) {
            offenders.push(`${USECASES_DIR}/${file}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    assert.deepEqual(
      offenders,
      [],
      "the usecase files should carry no em-dash (the repo's prose rule)",
    );
  });
});

// process-resources-current: the seven process resource files repoint to
// the way-of-working 1.x pages that replaced the archived single article
// (process-resources-source report, part a) and teach the live process
// canon. The audit's load-bearing corrections are pinned here in the
// existing guard style; a retired claim reappearing in a process file
// fails the suite.
const PROCESS_DIR = "skills/core/aura/resources/process";

function readProcess(file: string): string {
  return fs.readFileSync(path.join(repoRoot, PROCESS_DIR, file), "utf-8");
}

// The dead citation and the archived article node (the pre-2026-09-23
// canon); no process file may cite either, and the June repository mirror
// is never citable as current.
const DEAD_PROCESS_PATH = "prozesse/how-we-work-in-aura-a-practical-guide";
const ARCHIVED_GUIDE_NODE = "2a6d4f32";
const JUNE_REPO_MIRROR = "bitbucket-anwaltde-aura";

// process file -> its replacement page under way-of-working-and-structures
// (the report's 1:1 mapping, live-probed 2026-10-29).
const PROCESS_CANONICAL: Record<string, string> = {
  "INDEX.md": "way-of-working-and-structures/1-how-we-work-together-purpose-principles",
  "roles.md": "way-of-working-and-structures/1-1-roles",
  "workflow-phases.md": "way-of-working-and-structures/1-2-workflow-phases",
  "capacity.md": "way-of-working-and-structures/1-3-capacity-resourcing",
  "review-modes.md": "way-of-working-and-structures/1-4-alignment-review-escalation",
  "escalation.md": "way-of-working-and-structures/1-4-alignment-review-escalation",
  "integrations.md": "way-of-working-and-structures/1-5-tooling-aura-jira-asana",
};

describe("no-remnants guard: process resources current (canonical references)", () => {
  it("cites the replacement 1.x page in every process file, never the dead path", () => {
    for (const [file, page] of Object.entries(PROCESS_CANONICAL)) {
      const content = readProcess(file);
      assert.ok(
        content.includes(page),
        `${file} should cite its replacement page ${page}`,
      );
      assert.ok(
        content.includes("getKnowledgeNodeByPath"),
        `${file}'s canonical reference should be the fetch call for its page`,
      );
      assert.ok(
        !content.includes(DEAD_PROCESS_PATH),
        `${file} still cites the dead pre-archival path ${DEAD_PROCESS_PATH}`,
      );
      assert.ok(
        !content.includes(ARCHIVED_GUIDE_NODE),
        `${file} still cites the archived guide node ${ARCHIVED_GUIDE_NODE}`,
      );
    }
  });

  it("never cites the June repository mirror as current", () => {
    for (const file of Object.keys(PROCESS_CANONICAL)) {
      const content = readProcess(file);
      assert.ok(
        !content.includes(JUNE_REPO_MIRROR),
        `${file} cites the June repo mirror, which is a staleness trap (pre-v14)`,
      );
    }
  });
});

describe("no-remnants guard: process resources current (workflow phases)", () => {
  it("teaches the three series resolved by level and workflow variant", () => {
    const file = readProcess("workflow-phases.md");
    assert.match(
      file,
      /workflow variant|workflowVariant/i,
      "the series resolution should name the workflow variant",
    );
    assert.match(
      file,
      /STANDARD/,
      "the STANDARD variant should be named",
    );
    assert.match(
      file,
      /DISCOVERY/,
      "the DISCOVERY variant should be named",
    );
    assert.match(
      file,
      /set at creation[\s\S]{0,80}immutable|immutable[\s\S]{0,80}set at creation/i,
      "the variant should be documented as immutable and set at creation",
    );
    assert.match(
      file,
      /LEAN|lean series/i,
      "the lean series for sagas and subtasks should be named",
    );
  });

  it("shows the standard series without the two retired waiting statuses", () => {
    const file = readProcess("workflow-phases.md");
    for (const status of [
      "OPEN",
      "READY_FOR_REFINEMENT",
      "IN_REFINEMENT",
      "IN_ALIGNMENT",
      "READY_FOR_DEVELOPMENT",
      "IN_DEVELOPMENT",
      "IN_REVIEW",
      "READY_FOR_DEPLOYMENT",
      "IN_DEPLOYMENT",
      "DONE",
    ]) {
      assert.ok(
        file.includes(status),
        `the standard series should include ${status}`,
      );
    }
    assert.doesNotMatch(
      file,
      /READY_FOR_ALIGNMENT\s*→\s*IN_ALIGNMENT[\s\S]{0,200}READY_FOR_REVIEW/,
      "the retired flat series (waiting statuses before both gates) should be gone",
    );
  });

  it("documents the lean series and the discovery series' alignment ending", () => {
    const file = readProcess("workflow-phases.md");
    assert.match(
      file,
      /READY_FOR_DEVELOPMENT[\s\S]{0,40}IN_DEVELOPMENT[\s\S]{0,40}READY_FOR_REVIEW/,
      "the lean series (sagas and subtasks) should start at READY_FOR_DEVELOPMENT",
    );
    assert.match(
      file,
      /IN_ALIGNMENT\s*→?\s*DONE|IN_ALIGNMENT[\s\S]{0,120}DONE/,
      "the discovery series should end after alignment",
    );
  });

  it("documents the quality gates with verdicts and the rejected-gate reason rule", () => {
    const file = readProcess("workflow-phases.md");
    assert.match(
      file,
      /Alignment Gate|ALIGNMENT gate/i,
      "the Alignment Gate should be named",
    );
    assert.match(
      file,
      /Review Gate|REVIEW gate/i,
      "the Review Gate should be named",
    );
    assert.match(
      file,
      /disciplines?/i,
      "the discipline sign-offs should be described",
    );
    assert.match(file, /APPROVED/, "the approved verdict should be named");
    assert.match(file, /REJECTED/, "the rejected verdict should be named");
    assert.match(
      file,
      /status_change_reason[\s\S]{0,120}rejected( quality)? gate|rejected( quality)? gate[\s\S]{0,120}status_change_reason/,
      "leaving a rejected gate should require a status_change_reason",
    );
  });

  it("carries the live status-change contract (id, not uuid; one-step walk)", () => {
    const file = readProcess("workflow-phases.md");
    assert.match(
      file,
      /updateTask\(\{\s*id:/,
      "updateTask should be keyed by id (the live parameter)",
    );
    assert.doesNotMatch(
      file,
      /updateTask\(\{\s*uuid:/,
      "updateTask must not be keyed by uuid (retired parameter name)",
    );
    assert.match(
      file,
      /one (task )?status at a time|one-step walk|one status at a time/i,
      "the one-step walk discipline (tracker-aura) should be carried",
    );
    assert.match(
      file,
      /override a disallowed status jump|disallowed status jump/,
      "the status_change_reason contract should follow the live description",
    );
  });

  it("carries the v19 contributor phase starts and the live discard and reopen contracts", () => {
    const file = readProcess("workflow-phases.md");
    assert.match(
      file,
      /contributor[\s\S]{0,120}start[\s\S]{0,120}phase|start the next phase/i,
      "contributors starting the next phase themselves (v19) should be documented",
    );
    assert.match(
      file,
      /deploy[\s\S]{0,120}not|not[\s\S]{0,80}deployment/i,
      "the deployment exception should be stated",
    );
    assert.match(
      file,
      /discardTask[\s\S]{0,120}owner-only|owner-only[\s\S]{0,120}discardTask/i,
      "discardTask's owner-only rule should be documented",
    );
    assert.match(
      file,
      /reopenTask/,
      "reopenTask should be documented",
    );
  });

  it("keeps the overview's gate principle matching the live gate mechanics", () => {
    const index = readProcess("INDEX.md");
    assert.doesNotMatch(
      index,
      /Do not move a task past Alignment without stakeholder approval/,
      "the retired gate principle wording should be gone (gates are sign-offs with verdicts)",
    );
    assert.match(
      index,
      /gate|verdict/i,
      "the overview should teach the gate mechanics",
    );
  });
});

describe("no-remnants guard: process resources current (review modes)", () => {
  it("teaches opinions as the successor flow with the graded scale", () => {
    const file = readProcess("review-modes.md");
    assert.match(
      file,
      /opinion/i,
      "the opinions flow should be taught as the successor of artifact reviews",
    );
    assert.match(
      file,
      /Looks good/,
      "the graded scale's positive end should be named",
    );
    assert.match(
      file,
      /Rethink the approach/,
      "the graded scale's critical end should be named",
    );
    assert.match(
      file,
      /Neutral/,
      "the neutral option should be named",
    );
  });

  it("teaches the opinions flow's shape: no locks, no rounds, edit after submit", () => {
    const file = readProcess("review-modes.md");
    assert.match(
      file,
      /nothing is locked|no locks|not locked/i,
      "the no-locks property should be stated",
    );
    assert.match(
      file,
      /no rounds|there are no rounds|no approval rounds/i,
      "the no-rounds property should be stated",
    );
    assert.match(
      file,
      /edit[^\n]{0,60}submit|submitted opinion[^\n]{0,60}edit|edit a submitted opinion/i,
      "the edit-after-submit capability (v19) should be stated",
    );
  });

  it("names the MCP visibility of opinions and the UI pointer", () => {
    const file = readProcess("review-modes.md");
    assert.match(
      file,
      /opinion_requested/,
      "the listing filter should be named as the flow's MCP trace",
    );
    assert.match(
      file,
      /listArtifacts/,
      "the filter's tool should be named",
    );
    assert.match(
      file,
      /Aura UI/,
      "opinion management should carry a UI pointer",
    );
  });

  it("carries no CLI review command and no dead review tool names", () => {
    const file = readProcess("review-modes.md");
    assert.doesNotMatch(
      file,
      /aura\.mjs/,
      "no CLI command should appear",
    );
    for (const dead of [
      "requestArtifactReview",
      "getArtifactReview",
      "submitArtifactDecision",
      "startArtifactReview",
      "reopenArtifactReview",
      "getArtifactApprovals",
      "review-request",
    ]) {
      assert.ok(
        !file.includes(dead),
        `the dead review surface ${dead} should be gone`,
      );
    }
  });

  it("keeps the three modes with the async-solo default and the AI flag", () => {
    const file = readProcess("review-modes.md");
    assert.match(file, /Mode 1/, "mode 1 should stay");
    assert.match(file, /Mode 2/, "mode 2 should stay");
    assert.match(file, /Mode 3/, "mode 3 should stay");
    assert.match(
      file,
      /Default to Mode 1/,
      "the async-solo default should stay",
    );
    assert.match(
      file,
      /is_ai_generated: true/,
      "the AI-comment flag should stay",
    );
  });
});

describe("no-remnants guard: process resources current (capacity)", () => {
  it("teaches the placeholder epic for non-task work", () => {
    const file = readProcess("capacity.md");
    assert.match(
      file,
      /AURA-1686/,
      "the placeholder epic should be named",
    );
    assert.match(
      file,
      /Non Core-Team activities|placeholder epic/i,
      "the epic's role should be described",
    );
    assert.match(
      file,
      /meetings[\s\S]{0,200}AURA-1686|AURA-1686[\s\S]{0,200}(meetings|reviews|absence|education)/i,
      "the non-task categories should be listed against the epic",
    );
  });

  it("teaches rough steps, the 5% soft floor, and the honest 100% landing", () => {
    const file = readProcess("capacity.md");
    assert.match(
      file,
      /10\/20\/30|rough(ly)? (10%|10 percent) steps|10% steps/,
      "the rough-step guidance should be stated",
    );
    assert.match(
      file,
      /not 17%|no 17%/i,
      "the not-17% example should anchor the rough-step rule",
    );
    assert.match(
      file,
      /5% soft floor|soft floor/,
      "the soft floor should be stated",
    );
    assert.match(
      file,
      /100%/,
      "the honest full landing should be stated",
    );
  });

  it("carries the daily rhythm and the 04:00 reset", () => {
    const file = readProcess("capacity.md");
    assert.match(
      file,
      /04:00/,
      "the daily reset time should be stated",
    );
    assert.match(
      file,
      /0% every morning|reset to 0%|resets? to 0%/i,
      "the reset semantics should be stated",
    );
    assert.match(
      file,
      /09:00/,
      "the morning set-by time should be stated",
    );
    assert.match(
      file,
      /09:30/,
      "the clean-picture time should be stated",
    );
  });

  it("keeps finished work counted and drops the structural reserve", () => {
    const file = readProcess("capacity.md");
    assert.match(
      file,
      /finished[\s\S]{0,120}(still|no longer lowers)|no longer lowers[\s\S]{0,80}utilization/i,
      "finished work should still count toward the day (v19)",
    );
    assert.doesNotMatch(
      file,
      /80% task capacity|structural reserve/i,
      "the retired 80/20 structural-reserve model should be gone",
    );
    assert.doesNotMatch(
      file,
      /accounts for vacation and public holidays automatically/,
      "the unverifiable holiday-automation claim should be gone",
    );
  });

  it("teaches the MCP tools as the access path with the corrected scopes", () => {
    const file = readProcess("capacity.md");
    for (const tool of [
      "readCapacity",
      "updateTaskMemberCapacity",
      "updateTaskMemberParticipation",
    ]) {
      assert.ok(file.includes(tool), `the capacity file should name ${tool}`);
    }
    assert.match(
      file,
      /readCapacity[\s\S]{0,160}company|company[\s\S]{0,160}readCapacity/,
      "the leadership overview should be reachable via readCapacity scope company",
    );
    assert.match(
      file,
      /capacity settings/,
      "company capacity settings should keep their UI pointer",
    );
    assert.doesNotMatch(
      file,
      /leadership overview[\s\S]{0,120}not on MCP|all capacity tools are gone/i,
      "the false blanket absence claims should be gone",
    );
    assert.match(
      file,
      /usecases\/capacity-planning\.md/,
      "the usecase pointer should stay",
    );
  });

  it("keeps the consent warning and the escalation routing", () => {
    const file = readProcess("capacity.md");
    assert.match(
      file,
      /Only adjust your own capacity/,
      "the own-capacity-only warning should stay",
    );
    assert.match(
      file,
      /Owner agreement|Owner's agreement/i,
      "shifting capacity should require owner agreement",
    );
    assert.match(
      file,
      /direct manager[\s\S]{0,40}MAK|MAK/,
      "the disagreement escalation path should stay",
    );
  });
});

describe("no-remnants guard: process resources current (integrations)", () => {
  it("teaches Asana create-from-Aura with auto-link and the manual reverse link", () => {
    const file = readProcess("integrations.md");
    assert.match(
      file,
      /create[n]? an Asana task (directly )?from (an|the) Aura task|created from the Aura task/i,
      "the Asana create-from-Aura flow should be taught",
    );
    assert.match(
      file,
      /linked automatically at creation|auto-?linked/i,
      "the auto-link at creation should be stated",
    );
    assert.match(
      file,
      /reverse[\s\S]{0,120}manually|manually[\s\S]{0,120}description|link added manually/i,
      "the reverse direction's manual link should be stated",
    );
  });

  it("teaches the Asana level split (sagas, epics, milestones; selected stories; no subtasks)", () => {
    const file = readProcess("integrations.md");
    assert.match(
      file,
      /Saga[\s\S]{0,80}Epic[\s\S]{0,80}milestone/i,
      "the portfolio-level split should be stated",
    );
    assert.match(
      file,
      /selected Stories/i,
      "the selected-Stories rule should be stated",
    );
    assert.match(
      file,
      /Sub-?Tasks?[^\n]{0,80}not/i,
      "the no-Sub-Tasks rule should be stated",
    );
  });

  it("teaches the deliberate Jira creation and drops the blanket no-create rule", () => {
    const file = readProcess("integrations.md");
    assert.doesNotMatch(
      file,
      /Do not create tasks in JIRA or Asana directly/,
      "the blanket no-create rule should be gone (Jira creation is deliberate)",
    );
    assert.match(
      file,
      /Create JIRA tasks when you need|deliberate/i,
      "the deliberate Jira creation should be taught",
    );
    assert.match(
      file,
      /source of truth/,
      "Aura-stays-the-source-of-truth should stay",
    );
  });

  it("carries the every-task-needs-a-parent rule", () => {
    const file = readProcess("integrations.md");
    assert.match(
      file,
      /Every task needs a parent/i,
      "the parenting rule should be taught",
    );
    assert.match(
      file,
      /5 operational[\s\S]{0,60}11 goal-oriented|11 goal-oriented/,
      "the saga split (5 operational, 11 goal-oriented) should be stated",
    );
  });

  it("keeps the live mirror-read tools", () => {
    const file = readProcess("integrations.md");
    for (const tool of ["getTaskByJiraKey", "listAsanaTasks", "getAsanaTask"]) {
      assert.ok(file.includes(tool), `the integrations file should keep ${tool}`);
    }
  });
});

describe("no-remnants guard: process resources current (roles)", () => {
  it("teaches the live membership tools and drops the false MCP absence claim", () => {
    const file = readProcess("roles.md");
    for (const tool of [
      "addTaskMember",
      "setTaskMemberRoles",
      "updateTaskMemberCapacity",
      "updateTaskMemberParticipation",
    ]) {
      assert.ok(file.includes(tool), `roles.md should name ${tool}`);
    }
    assert.doesNotMatch(
      file,
      /assignment is not available via MCP|not available via MCP after the overhaul/,
      "the false blanket MCP-absence claim should be gone",
    );
    assert.match(
      file,
      /Aura UI/,
      "the owner/crew search flows should carry a UI pointer",
    );
  });

  it("teaches the handover handshake and the Leadership veto", () => {
    const file = readProcess("roles.md");
    assert.match(
      file,
      /handshake|a status field changing who's assigned is not enough/i,
      "the handover handshake should be taught",
    );
    assert.match(
      file,
      /veto/i,
      "the Leadership veto on unsuitable owner pairings should be taught",
    );
    assert.match(
      file,
      /mutual confirmation/i,
      "the mutual-confirmation rule should stay",
    );
  });

  it("points assignment content at the capacity page (its wiki home is 1.3)", () => {
    const file = readProcess("roles.md");
    assert.match(
      file,
      /capacity\.md/,
      "the assignment-and-boards content should cross-reference capacity.md",
    );
  });
});

describe("no-remnants guard: process resources current (escalation)", () => {
  it("teaches the state-not-person starting point and the de-escalation sequence", () => {
    const file = readProcess("escalation.md");
    assert.match(
      file,
      /state of the task[^\n]{0,80}not a judgment of a person/i,
      "the starting point principle should be carried",
    );
    assert.match(
      file,
      /coaching|support[\s\S]{0,120}reassign/i,
      "the de-escalation sequence (talk, support, reassign, transparent transition) should be carried",
    );
    assert.match(
      file,
      /transparent transition/i,
      "the transparent transition step should be carried",
    );
  });

  it("carries the leadership review of overdue tasks and the handshake rule", () => {
    const file = readProcess("escalation.md");
    assert.match(
      file,
      /overdue[\s\S]{0,120}Leadership|Leadership[\s\S]{0,120}overdue/i,
      "the overdue-task Leadership review should be carried",
    );
    assert.match(
      file,
      /handshake/i,
      "the active-handshake rule for handovers should be carried",
    );
  });
});

describe("no-remnants guard: process resources current (prose)", () => {
  it("carries no em-dash in any process file", () => {
    const offenders: string[] = [];
    for (const file of Object.keys(PROCESS_CANONICAL)) {
      const content = readProcess(file);
      content
        .split("\n")
        .forEach((line, index) => {
          if (line.includes("\u2014")) {
            offenders.push(`${PROCESS_DIR}/${file}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    assert.deepEqual(
      offenders,
      [],
      "the process files should carry no em-dash (the repo's prose rule)",
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

  it("keeps the FakeKeyring seam suite on disk after the REST library removal", () => {
    const testing = fs.readFileSync(path.join(repoRoot, "docs", "testing.md"), "utf-8");
    assert.ok(
      testing.includes("FakeKeyring"),
      "the keyring mock convention should name the FakeKeyring seam",
    );
    assert.equal(
      fs.existsSync(
        path.join(repoRoot, "packages", "shared", "test", "hey-api-aura-client.test.ts"),
      ),
      false,
      "the hey-api-aura-client suite should be deleted with the REST library",
    );
    assert.equal(
      fs.existsSync(path.join(repoRoot, "extensions", "aura-mcp-client.test.ts")),
      true,
      "the remaining FakeKeyring seam suite (extensions/aura-mcp-client.test.ts) should exist on disk",
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

function readRootDoc(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), "utf-8");
}

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

// root-docs-refresh: the stale Atlassian provisioning bug report (the bug
// this effort fixed by deleting the guided-walkthrough path) is archived
// with a resolution note, and no active bug report mentions the flow.
// Seam 1's bug-report half (arch spec, root-docs-refresh).
const ATLASSIAN_PROVISION_BUG = "atlassian-provision-test-broken-import";

describe("no-remnants guard: bug archive", () => {
  it("archives the stale Atlassian provisioning bug report with a resolution note", () => {
    const active = path.join(repoRoot, "docs", "bugs", `${ATLASSIAN_PROVISION_BUG}.md`);
    const archived = path.join(
      repoRoot,
      "docs",
      "bugs",
      "archive",
      `${ATLASSIAN_PROVISION_BUG}.md`,
    );
    assert.equal(
      fs.existsSync(archived),
      true,
      `docs/bugs/archive/${ATLASSIAN_PROVISION_BUG}.md should carry the archived report`,
    );
    assert.equal(
      fs.existsSync(active),
      false,
      "no active copy of the report should remain under docs/bugs/",
    );
    const content = fs.readFileSync(archived, "utf-8");
    assert.match(
      content,
      /^status:\s*(fixed|resolved)$/m,
      "the archived report's frontmatter should carry a resolved status",
    );
    assert.match(
      content,
      /^## Resolution$/m,
      "the archived report should carry a resolution note (the bug was fixed by deletion)",
    );
  });

  it("keeps no active bug report mentioning Atlassian provisioning", () => {
    const bugsDir = path.join(repoRoot, "docs", "bugs");
    const active = fs
      .readdirSync(bugsDir)
      .filter((entry) => entry.endsWith(".md"));
    const offenders = active.filter((report) =>
      /atlassian-provision/i.test(fs.readFileSync(path.join(bugsDir, report), "utf-8")),
    );
    assert.deepEqual(
      offenders,
      [],
      "no active bug report should mention the Atlassian provisioning flow (deleted with secrets-aura-pat-only)",
    );
  });
});

// remove-cli-rest-surface: no shipped file teaches reaching Aura through
// the CLI or REST. The bundled CLI and the generated REST reference are
// deleted, and the docs teach MCP-first access with UI pointers for the
// REST-only capabilities, so the retired names, the removed command
// surface, and the REST-teaching patterns fail the suite if they reappear.
// Scanned: every file under skills/ (the shipped skill tree) and the five
// root docs. Labels like "REST-only" and a non-teaching note that the REST
// API exists stay legal; the patterns pin instructions that reach Aura
// through REST or the removed CLI, and descriptive API-shape mentions that
// name no access path (e.g. the feedback tool's wrapped POST /feedback
// endpoint) are out of scope.
const CLI_REST_TEACHING_PATTERNS: Array<[RegExp, string]> = [
  [/aura\.mjs/, "the removed CLI bundle's name"],
  [/rest-api\.md/, "a reference to the removed REST reference resource"],
  [/openapi-new\.yaml/, "the stale REST-teaching spec pointer"],
  [/\buse (the )?REST\b/i, "REST-access teaching (use REST)"],
  [/\bvia (the |a )?REST\b/i, "REST-access teaching (via REST)"],
  [/\bREST endpoint/, "REST-access teaching (REST endpoints)"],
  [/\(REST\)/, "REST-access teaching (REST method tag)"],
  [/UI \/ REST/, "REST-access teaching (UI / REST pointer)"],
  [/REST \(?`(GET|POST|PATCH|PUT|DELETE)\b/, "REST-access teaching (REST plus HTTP verb)"],
  [/review-(get|approvals|request|start|decide|reopen)/, "a removed artifact review subcommand"],
  [/\brest (list|describe|call|search)\b/, "a removed rest CLI subcommand"],
];

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(entryPath));
    else out.push(entryPath);
  }
  return out;
}

describe("no-remnants guard: no CLI or REST access teaching", () => {
  it("carries no CLI or REST access teaching in the shipped skills and root docs", () => {
    const offenders: string[] = [];
    const scanned = [
      ...walkFiles(path.join(repoRoot, "skills")),
      ...ROOT_DOCS.map((doc) => path.join(repoRoot, doc)),
    ];
    for (const absPath of scanned) {
      const lines = fs.readFileSync(absPath, "utf-8").split("\n");
      for (const [index, line] of lines.entries()) {
        for (const [pattern, reason] of CLI_REST_TEACHING_PATTERNS) {
          if (pattern.test(line)) {
            offenders.push(
              `${path.relative(repoRoot, absPath)}:${index + 1} (${reason}): ${line.trim()}`,
            );
          }
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "no shipped file should teach reaching Aura through the CLI or REST (MCP-first access, UI pointers for REST-only capabilities)",
    );
  });
});

// root-docs-current: the five root documents describe the final package per
// the root-docs-drift report's claim list against the settled post-teardown
// tree: the six surviving extensions, the package's own aura-mcp-dev server
// registration with a user's entry as the optional override, the released
// install pin, the current credential story, and no removed surface named
// as current. The report's stale rows are pinned gone here in the existing
// guard style; a retired claim reappearing in a root doc fails the suite.
describe("no-remnants guard: root docs current (README)", () => {
  it("corrects the false no-commands claim to the shipped command and tool surface", () => {
    const readme = readRootDoc("README.md");
    assert.doesNotMatch(
      readme,
      /No user-facing commands/,
      "the false no-commands claim should be gone",
    );
    assert.ok(
      readme.includes("/aura secrets discover"),
      "the secrets command should be named",
    );
    assert.ok(
      readme.includes("/aura secrets edit"),
      "the secrets edit subcommand should be named",
    );
    assert.ok(
      readme.includes("aura_feedback"),
      "the feedback tool should be named",
    );
  });

  it("drops the unused pi-subagents and pi-mcp-adapter prerequisites", () => {
    const readme = readRootDoc("README.md");
    assert.doesNotMatch(
      readme,
      /pi-subagents|pi-mcp-adapter/i,
      "the unused add-on prerequisites should be gone (pi's MCP support is built in)",
    );
  });

  it("teaches the package's own registration as the default and a user entry as the optional override", () => {
    const readme = readRootDoc("README.md");
    assert.match(
      readme,
      /MCP configuration \(optional/i,
      "the MCP section should be framed as an optional override",
    );
    assert.match(
      readme,
      /registers the `aura-mcp-dev` MCP server/i,
      "the package's own registration should be stated",
    );
    assert.match(
      readme,
      /No manual MCP setup is required/i,
      "manual setup should be explicitly not required",
    );
    assert.match(
      readme,
      /your own `aura-mcp-dev` entry/i,
      "the user's own entry should be the override mechanism",
    );
    assert.match(
      readme,
      /wins over the package's registration/i,
      "the user entry's precedence should be stated",
    );
    assert.doesNotMatch(
      readme,
      /bearerToken|"auth":\s*"bearer"/,
      "the retired mcp.json config shape should be gone",
    );
    assert.match(
      readme,
      /"headers"/,
      "the pi-native config shape (url plus headers) should be shown",
    );
  });

  it("pins the install example to the current released version", () => {
    const readme = readRootDoc("README.md");
    assert.match(
      readme,
      /pi install git:github\.com\/pplattner-qnc\/pi-aura@v0\.8\.0/,
      "the install pin should name the current released version",
    );
    assert.doesNotMatch(readme, /@v0\.1\.0/, "the stale v0.1.0 pin should be gone");
  });

  it("lists exactly the manifest's six extensions in the extensions table", () => {
    const readme = readRootDoc("README.md");
    const extensionsPart = readme.split("## Extensions")[1] ?? "";
    assert.notEqual(extensionsPart, "", "the README should carry an ## Extensions section");
    const tableExtensions = extensionsPart
      .split("\n")
      .filter((line) => line.startsWith("| `"))
      .map((line) => line.match(/^\| `([^`]+)`/)?.[1])
      .filter((name) => name !== undefined)
      .sort();
    const pkg = readRootPackageJson();
    const manifestExtensions = (pkg.pi?.extensions ?? [])
      .map((entry) => entry.replace("./extensions/", "").replace(".ts", ""))
      .sort();
    assert.deepEqual(
      tableExtensions,
      manifestExtensions,
      "the README extensions table should list exactly the manifest's six extensions",
    );
  });

  it("describes the cursor-rules library module and the companion-plugin assumption", () => {
    const readme = readRootDoc("README.md");
    assert.ok(
      readme.includes("extensions/cursor-rules.ts"),
      "the non-manifest rules-loading library module should be named",
    );
    assert.match(
      readme,
      /plugin repo/i,
      "the companion plugin's ownership of rules dispatch should be stated",
    );
    assert.match(
      readme,
      /nothing injects the rule body/i,
      "the with-pi-aura-alone behavior (mentions expand, no body injection) should be stated",
    );
  });

  it("references no removed file, workspace, or target", () => {
    const readme = readRootDoc("README.md");
    assert.doesNotMatch(
      readme,
      /scripts\/|aura\.mjs|skills\/core\/aura\/dist|HeyApiAuraClient|AuraClient|@pi-aura\/shared\/aura-client|codegen|openapi/i,
      "the README should name no removed surface",
    );
  });
});

describe("no-remnants guard: root docs current (glossary)", () => {
  it("describes the PAT as keyring-stored with the mcp config file as the import source only", () => {
    const context = readRootDoc("CONTEXT.md");
    assert.match(
      context,
      /OS keyring/,
      "the PAT entry should state the keyring as where the PAT lives",
    );
    assert.match(
      context,
      /import source/,
      "the mcp.json file should be described as the import source only",
    );
    assert.doesNotMatch(
      context,
      /read from `~\/\.config\/mcp\/mcp\.json`/,
      "the stale read-from-mcp.json PAT story should be gone",
    );
  });

  it("carries the live tool count in the mcp* entry", () => {
    const context = readRootDoc("CONTEXT.md");
    assert.doesNotMatch(context, /\b90\b/, "the stale 90-tool count should be gone");
    assert.match(context, /\b120\b/, "the live 120-tool count should be stated");
  });

  it("replaces the removed REST access-client entries with the shipped typed interface", () => {
    const context = readRootDoc("CONTEXT.md");
    assert.doesNotMatch(
      context,
      /AuraClient|HeyApiAuraClient|@pi-aura\/shared\/aura-client|@hey-api|openapi-ts/i,
      "the removed REST library entries should be gone (taught by absence, not negation)",
    );
    assert.match(
      context,
      /aura-mcp-client\.ts/,
      "the shipped typed interface module should be named",
    );
    assert.match(
      context,
      /createAuraMcpInterface/,
      "the typed interface's constructor should be named",
    );
  });

  it("describes the keyring as it ships", () => {
    const context = readRootDoc("CONTEXT.md");
    assert.doesNotMatch(
      context,
      /@napi-rs\/keyring/,
      "the dead @napi-rs/keyring attribution should be gone",
    );
    assert.match(
      context,
      /Secret Service/,
      "the Linux D-Bus Secret Service backend should be named",
    );
    assert.match(context, /FakeKeyring/, "the FakeKeyring test seam should be named");
    assert.match(
      context,
      /FileKeyring/,
      "the file backend backing the automated keyring suite should be named",
    );
  });
});

describe("no-remnants guard: root docs current (project instructions)", () => {
  it("states the state.yaml pointer keys the file actually holds", () => {
    const agents = readRootDoc("AGENTS.md");
    assert.match(
      agents,
      /`map`\/`task` pointers/,
      "the pointer claim should name the map/task keys state.yaml holds",
    );
    assert.doesNotMatch(
      agents,
      /`task`\/`slice` pointers/,
      "the stale task/slice pointer claim should be gone",
    );
  });
});

describe("no-remnants guard: root docs current (testing doc)", () => {
  it("carries no removed build, codegen, or REST-library surface", () => {
    const testing = readRootDoc("docs/testing.md");
    assert.doesNotMatch(
      testing,
      /codegen|openapi|hey-api|HeyApiAuraClient|tsConfigPath|src\/generated|task gen\b|task build\b/i,
      "the testing doc should name no removed codegen, spec-sync, or REST-library surface",
    );
  });

  it("names the shipped seams and the always set", () => {
    const testing = readRootDoc("docs/testing.md");
    for (const needle of [
      "cd packages/shared && npm test",
      "task typecheck",
      "extensions/*.test.ts",
      "createAuraMcpInterface",
      "loadCredentials",
      "createInterface",
      "FakeKeyring",
      "extensions/aura-mcp-client.test.ts",
    ]) {
      assert.ok(
        testing.includes(needle),
        `docs/testing.md should carry the shipped seam or gate: ${needle}`,
      );
    }
  });

  it("keeps the run-if-asked list to what still exists", () => {
    const testing = readRootDoc("docs/testing.md");
    assert.ok(
      testing.includes("extensions/aura-reference-cache.test.ts"),
      "the cross-process concurrency driver should stay the run-if-asked item",
    );
    assert.doesNotMatch(
      testing,
      /git diff --exit-code|byte-stability/,
      "the codegen byte-stability check should be gone with the codegen target",
    );
  });
});

describe("no-remnants guard: root docs current (dev-env doc)", () => {
  it("describes the root-install flow with no removed build targets", () => {
    const devenv = readRootDoc("docs/dev-env.md");
    assert.match(
      devenv,
      /npm install/,
      "the root-workspace install should be the setup step",
    );
    assert.doesNotMatch(
      devenv,
      /codegen|openapi|scripts\/|dist\/|KeyringBackend|GNOME|aura-access-rewrite/i,
      "the dev-env doc should name no removed build target or retired surface",
    );
  });

  it("carries the current credential story", () => {
    const devenv = readRootDoc("docs/dev-env.md");
    assert.match(
      devenv,
      /aura\.baseUrl/,
      "the settings-derived base URL should be the configuration step",
    );
    assert.match(
      devenv,
      /\/aura secrets discover/,
      "the PAT import path should be named",
    );
    assert.match(
      devenv,
      /\/aura secrets edit/,
      "the PAT edit path should be named",
    );
    assert.doesNotMatch(
      devenv,
      /read from\s+`~\/\.config\/mcp\/mcp\.json`/,
      "the stale mcp.json credential story should be gone",
    );
  });

  it("names the shipped keyring test seams", () => {
    const devenv = readRootDoc("docs/dev-env.md");
    assert.match(devenv, /FakeKeyring/, "the fake keyring seam should be named");
    assert.match(
      devenv,
      /FileKeyring/,
      "the file backend backing the automated keyring suite should be named",
    );
    assert.doesNotMatch(
      devenv,
      /live OS keyring/i,
      "the nonexistent live-keyring smoke test should not be described",
    );
  });
});
