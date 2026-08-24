/**
 * Smoke + logic tests for the engineering-rules extension.
 *
 * Run with:
 *   node --experimental-strip-types extensions/engineering-rules.test.ts
 *
 * Covers the pure logic: frontmatter parsing (all three attach modes),
 * the @rule: token extractor, the @rule: resolver, and the system-prompt
 * section builders. The extension factory itself is verified by jiti load
 * (see engineering-sync build) + the pi runtime once the rules are seeded.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import engineeringRules, {
  buildAlwaysOnSection,
  buildListedRulesSection,
  extractRuleToken,
  loadRules,
  parseFrontmatter,
  parseYamlScalar,
  resolveRuleMentions,
  type Rule,
} from "./engineering-rules.ts";

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
// loadRules + attach classification + tracker-aura skip (manifest-driven)
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "eng-rules-test-"));
  try {
    const rulesDir = join(dir, "skills", "core", "engineering-foundation", "resources", "rules");
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, "general-code-quality.mdc"),
      "---\nalwaysApply: true\n---\nBe excellent.\n");
    writeFileSync(join(rulesDir, "general-markdown-format.mdc"),
      "---\nalwaysApply: false\nglobs: \"**/*.md\"\n---\nFormat markdown.\n");
    writeFileSync(join(rulesDir, "tracker-jira.mdc"),
      "---\nalwaysApply: false\n---\nManual rule.\n");
    writeFileSync(join(rulesDir, "tracker-aura.mdc"),
      "---\nalwaysApply: true\n---\nShould be ignored.\n");
    // Manifest marks tracker-aura as ignored via its localPath.
    mkdirSync(join(dir, ".pi"), { recursive: true });
    writeFileSync(join(dir, ".pi", "engineering-foundation.json"), JSON.stringify({
      version: 1,
      space: "engineering-foundation",
      entries: {
        "<tracker-aura-uuid>": {
          wikiPathOrUuid: "<tracker-aura-uuid>",
          localPath: "skills/core/engineering-foundation/resources/rules/tracker-aura.mdc",
          sourceSha256: "sha256:x",
          auraChecksumOrVersion: "1",
          auraUpdatedAt: "",
          ignored: true,
          ignoreReason: "this repo talks to Aura via the aura skill / REST client",
        },
      },
    }) + "\n");

    const rules = loadRules(dir);
    assert.equal(rules.length, 3, "tracker-aura must be skipped (3 of 4 loaded)");

    const byName = new Map(rules.map((r) => [r.name, r]));
    assert.equal(byName.get("general-code-quality")?.attach, "always");
    assert.equal(byName.get("general-markdown-format")?.attach, "glob");
    assert.deepEqual(byName.get("general-markdown-format")?.globs, ["**/*.md"]);
    assert.equal(byName.get("tracker-jira")?.attach, "manual");
    assert.equal(byName.get("tracker-aura"), undefined, "tracker-aura must not be loaded");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("loadRules + tracker-aura skip (manifest-driven): ok");

// ---------------------------------------------------------------------------
// loadRules loads ALL rules when no manifest exists (no hardcoded skip)
// ---------------------------------------------------------------------------

{
  const dir = mkdtempSync(join(tmpdir(), "eng-rules-test-nomanifest-"));
  try {
    const rulesDir = join(dir, "skills", "core", "engineering-foundation", "resources", "rules");
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, "tracker-aura.mdc"),
      "---\nalwaysApply: true\n---\nWould be loaded without a manifest.\n");
    // No .pi/engineering-foundation.json — nothing is skipped.
    const rules = loadRules(dir);
    assert.equal(rules.length, 1, "without a manifest, tracker-aura IS loaded (no hardcoded skip)");
    assert.equal(rules[0].name, "tracker-aura");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("loadRules without manifest loads all (no hardcoding): ok");

// ---------------------------------------------------------------------------
// loadRules on absent dir no-ops
// ---------------------------------------------------------------------------

{
  const rules = loadRules(join(tmpdir(), "does-not-exist-xyz"));
  assert.deepEqual(rules, []);
}

console.log("loadRules absent dir: ok");

// ---------------------------------------------------------------------------
// buildAlwaysOnSection + buildListedRulesSection
// ---------------------------------------------------------------------------

{
  const rules: Rule[] = [
    {
      name: "general-code-quality", path: "/x", relPath: "skills/core/engineering-foundation/resources/rules/general-code-quality.mdc",
      attach: "always", globs: [], body: "Be excellent.", full: "",
    },
    {
      name: "general-markdown-format", path: "/x", relPath: "skills/core/engineering-foundation/resources/rules/general-markdown-format.mdc",
      attach: "glob", globs: ["**/*.md"], body: "Format markdown.", full: "",
    },
    {
      name: "tracker-jira", path: "/x", relPath: "skills/core/engineering-foundation/resources/rules/tracker-jira.mdc",
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
      name: "tracker-jira", path: "/x", relPath: "skills/core/engineering-foundation/resources/rules/tracker-jira.mdc",
      attach: "manual", globs: [], body: "Use Jira for tracking.", full: "",
    },
    {
      name: "general-code-quality", path: "/x", relPath: "skills/core/engineering-foundation/resources/rules/general-code-quality.mdc",
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
