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
// pinned here in the existing guard style; the full per-claim mapping of
// the drift table lives in the ticket's result document. A retired claim
// reappearing in the skill file fails the suite.
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
