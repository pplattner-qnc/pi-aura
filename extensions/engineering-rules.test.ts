/**
 * Smoke + logic tests for the engineering-rules extension.
 *
 * Run with:
 *   node --experimental-strip-types extensions/engineering-rules.test.ts
 *
 * Covers the pure logic: frontmatter parsing (all three attach modes),
 * glob compilation + matching, the @rule: token extractor, the @rule:
 * resolver, the system-prompt section builders, and the settings-driven
 * ignore-glob loader (global + project union). The extension factory itself
 * is verified by jiti load + the pi runtime once a repo populates
 * `.cursor/rules/`.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import engineeringRules, {
  buildAlwaysOnSection,
  buildListedRulesSection,
  extractRuleToken,
  globToRegExp,
  loadIgnoreGlobs,
  loadRules,
  matchesAnyGlob,
  parseFrontmatter,
  parseYamlScalar,
  resolveRuleMentions,
  type Rule,
} from "./engineering-rules.ts";

// Helper to set up a fake "global" settings dir and return its path, so the
// test does not touch the real ~/.pi/agent/settings.json. We override the
// HOME env var per-test (loadIgnoreGlobs reads GLOBAL_SETTINGS_PATH which is
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
  const dir = mkdtempSync(join(tmpdir(), "eng-rules-test-"));
  const home = mkdtempSync(join(tmpdir(), "eng-rules-home-"));
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
  const dir = mkdtempSync(join(tmpdir(), "eng-rules-proj-"));
  const home = mkdtempSync(join(tmpdir(), "eng-rules-home2-"));
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

    // Now add a project-local ignore for general-code-quality — union skips it too.
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
  const dir = mkdtempSync(join(tmpdir(), "eng-rules-nosettings-"));
  const home = mkdtempSync(join(tmpdir(), "eng-rules-home3-"));
  try {
    const rulesDir = join(dir, ".cursor", "rules");
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, "tracker-aura.mdc"),
      "---\nalwaysApply: true\n---\nWould be loaded without an ignore glob.\n");
    // No settings at all — nothing is skipped (no hardcoded rule-name skip).
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
  const dir = mkdtempSync(join(tmpdir(), "eng-globs-"));
  const home = mkdtempSync(join(tmpdir(), "eng-globs-home-"));
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
  const home = mkdtempSync(join(tmpdir(), "eng-rules-home4-"));
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
// buildAlwaysOnSection + buildListedRulesSection
// ---------------------------------------------------------------------------

{
  const rules: Rule[] = [
    {
      name: "general-code-quality", path: "/x", relPath: "general-code-quality",
      attach: "always", globs: [], body: "Be excellent.", full: "",
    },
    {
      name: "general-markdown-format", path: "/x", relPath: "general-markdown-format",
      attach: "glob", globs: ["**/*.md"], body: "Format markdown.", full: "",
    },
    {
      name: "tracker-jira", path: "/x", relPath: "tracker-jira",
      attach: "manual", globs: [], body: "Manual rule.", full: "",
    },
  ];

  const always = buildAlwaysOnSection(rules);
  assert.ok(always.includes("Engineering Rules (always-on)"), "always-on section header");
  assert.ok(always.includes("general-code-quality"), "always-on rule name");
  assert.ok(!always.includes("tracker-jira"), "manual rule not in always-on section");

  const listed = buildListedRulesSection(rules);
  assert.ok(listed.includes("Engineering Rules (on-demand)"), "on-demand section header");
  assert.ok(listed.includes("tracker-jira"), "manual rule listed");
  assert.ok(listed.includes("general-markdown-format"), "glob rule listed");
  assert.ok(listed.includes("**/*.md"), "glob value listed");
  assert.ok(!listed.includes("general-code-quality"), "always-on rule not in on-demand list");

  // Empty rules -> empty sections.
  assert.equal(buildAlwaysOnSection([]), "");
  assert.equal(buildListedRulesSection([]), "");
}

console.log("buildAlwaysOnSection + buildListedRulesSection: ok");

// ---------------------------------------------------------------------------
// extractRuleToken (the @ deferral contract)
// ---------------------------------------------------------------------------

{
  // @rule: token at start of line
  assert.equal(extractRuleToken("@rule:track"), "rule:track");
  // @rule: token after whitespace
  assert.equal(extractRuleToken("foo @rule:tracker-jira"), "rule:tracker-jira");
  // @file token (non-rule:) -> null (defer to built-in path provider)
  assert.equal(extractRuleToken("src/@file.ts"), null);
  assert.equal(extractRuleToken("@path/to/file"), null);
  // @ not at token boundary (in email) -> null
  assert.equal(extractRuleToken("user@example.com"), null);
  // empty token after @
  assert.equal(extractRuleToken("foo @"), null);
  // @rule: with no partial
  assert.equal(extractRuleToken(" @rule:"), "rule:");
}

console.log("extractRuleToken (@ deferral): ok");

// ---------------------------------------------------------------------------
// resolveRuleMentions (before_agent_start resolver)
// ---------------------------------------------------------------------------

{
  const rules: Rule[] = [
    {
      name: "tracker-jira", path: "/x", relPath: "tracker-jira",
      attach: "manual", globs: [], body: "Use Jira for tracking.", full: "",
    },
    {
      name: "general-code-quality", path: "/x", relPath: "general-code-quality",
      attach: "always", globs: [], body: "Be excellent.", full: "",
    },
  ];

  // Single mention
  const out = resolveRuleMentions("Please @rule:tracker-jira help me", rules);
  assert.ok(out.includes("Engineering Rules (@mentioned this turn)"), "mention section header");
  assert.ok(out.includes("Use Jira for tracking."), "mentioned rule body injected");

  // No mentions -> empty string (no section added)
  assert.equal(resolveRuleMentions("just a normal prompt", rules), "");

  // Unknown rule mention -> empty (no block for unknown name)
  assert.equal(resolveRuleMentions("@rule:nonexistent", rules), "");

  // Multiple mentions deduped + each body injected
  const multi = resolveRuleMentions("@rule:tracker-jira and @rule:general-code-quality", rules);
  assert.ok(multi.includes("Use Jira for tracking."));
  assert.ok(multi.includes("Be excellent."));
  // Each mentioned once
  assert.equal((multi.match(/@rule:tracker-jira/g) || []).length, 1);
}

console.log("resolveRuleMentions: ok");

// ---------------------------------------------------------------------------
// Factory is a function (smoke)
// ---------------------------------------------------------------------------

assert.equal(typeof engineeringRules, "function", "default export is a factory function");
console.log("factory: ok");

console.log("\nall engineering-rules tests passed");
