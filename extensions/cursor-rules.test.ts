/**
 * Tests for the cursor-rules loading module (the rule loader the reference
 * engine's local `#rule:` kind consumes).
 *
 * Run with:
 *   node --experimental-strip-types extensions/cursor-rules.test.ts
 *
 * Covers the pure loading logic: frontmatter parsing (all three attach
 * modes), glob compilation + matching, the recursive loader with the
 * settings-driven ignore globs (global + project union), the display-title
 * loading (frontmatter name falling back to the rule name), and the module
 * surface pin (loading only: the dispatch half of the former engineering-
 * rules extension moved to the plugin repo, so no system-prompt section
 * builder or body-injection resolver regrows here).
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  globToRegExp,
  loadIgnoreGlobs,
  loadRules,
  matchesAnyGlob,
  parseFrontmatter,
  parseYamlScalar,
} from "./cursor-rules.ts";

// Helper to set up a fake "global" settings dir and return its path, so the
// test does not touch the real ~/.pi/agent/settings.json. We override the
// HOME env var per-test (loadIgnoreGlobs reads the global path, which is
// built from homedir()).
function withFakeHome<T>(home: string, fn: () => T): T {
  const oldHome = process.env.HOME;
  process.env.HOME = home;
  try {
    return fn();
  } finally {
    process.env.HOME = oldHome;
  }
}

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

{
  // alwaysApply: true (always-on)
  const { fm, body } = parseFrontmatter("---\nalwaysApply: true\n---\nbody text\n");
  assert.equal(fm.alwaysApply, true);
  assert.equal(body, "body text\n");

  // alwaysApply: false + inline globs (glob mode)
  const g = parseFrontmatter("---\nalwaysApply: false\nglobs: \"**/*.ts\"\n---\nb\n");
  assert.equal(g.fm.alwaysApply, false);
  assert.deepEqual(g.fm.globs, ["**/*.ts"]);

  // alwaysApply: false + multi-line globs list
  const g2 = parseFrontmatter("---\nalwaysApply: false\nglobs:\n  - \"**/*.ts\"\n  - \"**/*.tsx\"\n---\nb\n");
  assert.equal(g2.fm.alwaysApply, false);
  assert.deepEqual(g2.fm.globs, ["**/*.ts", "**/*.tsx"]);

  // alwaysApply: false + inline list
  const g3 = parseFrontmatter("---\nalwaysApply: false\nglobs: [\"a\", \"b\"]\n---\nb\n");
  assert.deepEqual(g3.fm.globs, ["a", "b"]);

  // neither (manual)
  const m = parseFrontmatter("---\nalwaysApply: false\n---\nmanual body\n");
  assert.equal(m.fm.alwaysApply, false);
  assert.equal(m.fm.globs, undefined);

  // no frontmatter
  const none = parseFrontmatter("just body\n");
  assert.deepEqual(none.fm, {});
  assert.equal(none.body, "just body\n");

  // quoted strings, booleans, null
  assert.equal(parseYamlScalar('"quoted"'), "quoted");
  assert.equal(parseYamlScalar("'single'"), "single");
  assert.equal(parseYamlScalar("true"), true);
  assert.equal(parseYamlScalar("false"), false);
  assert.equal(parseYamlScalar("null"), null);
  assert.equal(parseYamlScalar("plain"), "plain");
}

console.log("parseFrontmatter: ok");

// ---------------------------------------------------------------------------
// globToRegExp + matchesAnyGlob
// ---------------------------------------------------------------------------

{
  // Bare filename
  assert.ok(globToRegExp("tracker-aura.mdc").test("tracker-aura.mdc"));
  assert.ok(!globToRegExp("tracker-aura.mdc").test("tracker-jira.mdc"));

  // * (non-separator span)
  assert.ok(globToRegExp("*-aura.mdc").test("tracker-aura.mdc"));
  assert.ok(!globToRegExp("*-aura.mdc").test("universal/tracker-aura.mdc"), "* must not cross /");

  // ** with path segments
  assert.ok(globToRegExp("universal/**/*-aura.mdc").test("universal/tracker-aura.mdc"));
  assert.ok(globToRegExp("universal/**/*-aura.mdc").test("universal/nested/deep/tracker-aura.mdc"));
  // **/ matches zero dirs too (a/**/b matches a/b)
  assert.ok(globToRegExp("a/**/b").test("a/b"));

  // matchesAnyGlob helper (forward-slash normalized)
  assert.ok(matchesAnyGlob("tracker-aura.mdc", ["tracker-aura.mdc"]));
  assert.ok(matchesAnyGlob("universal/tracker-aura.mdc", ["universal/**/*-aura.mdc"]));
  assert.ok(matchesAnyGlob("universal/nested/x-aura.mdc", ["**/*-aura.mdc"]));
  assert.ok(!matchesAnyGlob("tracker-jira.mdc", ["*-aura.mdc"]));
  assert.ok(!matchesAnyGlob("tracker-aura.mdc", []), "no globs -> no match");
}

console.log("globToRegExp + matchesAnyGlob: ok");

// ---------------------------------------------------------------------------
// loadRules + attach classification + settings-driven ignore
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "cursor-rules-test-"));
  const home = mkdtempSync(join(tmpdir(), "cursor-rules-home-"));
  try {
    // Repo: .cursor/rules/ with nested subdirs (recursive read).
    const rulesDir = join(dir, ".cursor", "rules");
    mkdirSync(join(rulesDir, "universal"), { recursive: true });
    writeFileSync(join(rulesDir, "general-code-quality.mdc"),
      "---\nalwaysApply: true\n---\nBe excellent.\n");
    writeFileSync(join(rulesDir, "general-markdown-format.mdc"),
      "---\nalwaysApply: false\nglobs: \"**/*.md\"\n---\nFormat markdown.\n");
    writeFileSync(join(rulesDir, "tracker-jira.mdc"),
      "---\nalwaysApply: false\n---\nManual rule.\n");
    writeFileSync(join(rulesDir, "universal", "tracker-aura.mdc"),
      "---\nalwaysApply: true\n---\nShould be ignored.\n");

    // Global settings ignore tracker-aura via a **/*-aura.mdc glob.
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({
      aura: {
        cursorRules: {
          ignore: ["universal/**/*-aura.mdc"],
        },
      },
    }) + "\n");

    withFakeHome(home, () => {
      const rules = loadRules(dir);
      assert.equal(rules.length, 3, "tracker-aura must be skipped (3 of 4 loaded)");

      const byName = new Map(rules.map((r) => [r.name, r]));
      assert.equal(byName.get("general-code-quality")?.attach, "always");
      assert.equal(byName.get("general-markdown-format")?.attach, "glob");
      assert.deepEqual(byName.get("general-markdown-format")?.globs, ["**/*.md"]);
      assert.equal(byName.get("tracker-jira")?.attach, "manual");
      assert.equal(byName.get("tracker-aura"), undefined, "tracker-aura must not be loaded");
      // relPath is forward-slash-joined, relative to .cursor/rules/.
      assert.equal(byName.get("tracker-jira")?.relPath, "tracker-jira.mdc");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

console.log("loadRules + settings-driven ignore (recursive): ok");

// ---------------------------------------------------------------------------
// loadRules: project-local settings add to the union
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "cursor-rules-proj-"));
  const home = mkdtempSync(join(tmpdir(), "cursor-rules-home2-"));
  try {
    const rulesDir = join(dir, ".cursor", "rules");
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, "tracker-aura.mdc"),
      "---\nalwaysApply: true\n---\nIgnored by global glob.\n");
    writeFileSync(join(rulesDir, "general-code-quality.mdc"),
      "---\nalwaysApply: true\n---\nKept.\n");

    // Global ignores *-aura.mdc; project does NOT override it away.
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({
      aura: { cursorRules: { ignore: ["*-aura.mdc"] } },
    }) + "\n");

    withFakeHome(home, () => {
      const rules = loadRules(dir);
      assert.equal(rules.length, 1, "global ignore applies");
      assert.equal(rules[0].name, "general-code-quality");
    });

    // Now add a project-local ignore for general-code-quality; the union skips it too.
    mkdirSync(join(dir, ".pi"), { recursive: true });
    writeFileSync(join(dir, ".pi", "settings.json"), JSON.stringify({
      aura: { cursorRules: { ignore: ["general-code-quality.mdc"] } },
    }) + "\n");
    withFakeHome(home, () => {
      const rules = loadRules(dir);
      assert.equal(rules.length, 0, "global + project ignore union skips both rules");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

console.log("loadRules project-local union: ok");

// ---------------------------------------------------------------------------
// loadRules loads ALL rules when no settings ignore exists (no hardcoding)
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "cursor-rules-nosettings-"));
  const home = mkdtempSync(join(tmpdir(), "cursor-rules-home3-"));
  try {
    const rulesDir = join(dir, ".cursor", "rules");
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, "tracker-aura.mdc"),
      "---\nalwaysApply: true\n---\nWould be loaded without an ignore glob.\n");
    // No settings at all: nothing is skipped (no hardcoded rule-name skip).
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    withFakeHome(home, () => {
      const rules = loadRules(dir);
      assert.equal(rules.length, 1, "without ignore globs, tracker-aura IS loaded");
      assert.equal(rules[0].name, "tracker-aura");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

console.log("loadRules without ignore globs loads all (no hardcoding): ok");

// ---------------------------------------------------------------------------
// loadIgnoreGlobs: union of global + project, dedup
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "cursor-globs-"));
  const home = mkdtempSync(join(tmpdir(), "cursor-globs-home-"));
  try {
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({
      aura: { cursorRules: { ignore: ["a.mdc", "b.mdc"] } },
    }) + "\n");
    mkdirSync(join(dir, ".pi"), { recursive: true });
    writeFileSync(join(dir, ".pi", "settings.json"), JSON.stringify({
      aura: { cursorRules: { ignore: ["b.mdc", "c.mdc"] } },
    }) + "\n");
    withFakeHome(home, () => {
      const globs = loadIgnoreGlobs(dir);
      // Union + dedup.
      assert.deepEqual(globs.sort(), ["a.mdc", "b.mdc", "c.mdc"]);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

console.log("loadIgnoreGlobs union (global + project, dedup): ok");

// ---------------------------------------------------------------------------
// loadRules on absent dir no-ops
// ---------------------------------------------------------------------------

{
  const home = mkdtempSync(join(tmpdir(), "cursor-rules-home4-"));
  mkdirSync(join(home, ".pi", "agent"), { recursive: true });
  try {
    withFakeHome(home, () => {
      const rules = loadRules(join(tmpdir(), "does-not-exist-xyz"));
      assert.deepEqual(rules, []);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

console.log("loadRules absent dir: ok");

// ---------------------------------------------------------------------------
// loadRules: the display title (frontmatter name falling back to the rule
// name), carried for the reference engine's rule-ref element text
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "cursor-rules-display-"));
  const home = mkdtempSync(join(tmpdir(), "cursor-rules-home5-"));
  try {
    const rulesDir = join(dir, ".cursor", "rules");
    mkdirSync(rulesDir, { recursive: true });
    // A frontmatter name differing from the filename: the display title wins.
    writeFileSync(join(rulesDir, "tracker-aura.mdc"),
      "---\nname: Tracker Aura\nalwaysApply: false\n---\nUse the Aura tracker.\n");
    // No frontmatter name: the display title falls back to the rule name.
    writeFileSync(join(rulesDir, "tracker-jira.mdc"),
      "---\nalwaysApply: false\n---\nUse Jira.\n");
    // A quoted frontmatter name is unquoted by the scalar parser.
    writeFileSync(join(rulesDir, "quoted.mdc"),
      '---\nname: "Quoted Display"\nalwaysApply: false\n---\nBody.\n');

    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    withFakeHome(home, () => {
      const rules = loadRules(dir);
      const byName = new Map(rules.map((r) => [r.name, r]));
      assert.equal(byName.get("tracker-aura")?.displayName, "Tracker Aura");
      assert.equal(byName.get("tracker-jira")?.displayName, undefined);
      assert.equal(byName.get("quoted")?.displayName, "Quoted Display");
      // The rule name stays the filename-derived name (the token key).
      assert.equal(byName.get("tracker-aura")?.name, "tracker-aura");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

console.log("loadRules display title (frontmatter name): ok");

// ---------------------------------------------------------------------------
// Module surface after the move-out (loading only, no dispatch regrowth)
// ---------------------------------------------------------------------------

// The module's runtime export surface: rule loading, frontmatter parsing,
// glob + settings helpers. The former engineering-rules dispatch (system-
// prompt section builders, the body-injection resolver, the extension
// factory) moved to the plugin repo and must not regrow here. If this pin
// fails, something was added to (or removed from) the module.
{
  const exports = Object.keys(await import("./cursor-rules.ts")).sort();
  assert.deepEqual(
    exports,
    [
      "globToRegExp",
      "loadIgnoreGlobs",
      "loadRules",
      "matchesAnyGlob",
      "parseFrontmatter",
      "parseYamlListBlock",
      "parseYamlScalar",
      "parseYamlScalarList",
    ],
    "the module exports only rule loading, frontmatter parsing, and glob + settings helpers",
  );
}

console.log("module surface (loading only): ok");

console.log("\nall cursor-rules tests passed");
