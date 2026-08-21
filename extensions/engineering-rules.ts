/**
 * Engineering Rules Extension
 *
 * Reads the 15 included `.mdc` Cursor rule files from
 * `skills/engineering-workflow/resources/rules/` and dispatches each by its
 * frontmatter attach mode, provides a universal `@mention` overlay for all
 * 15, and lists the non-auto-loaded rules in the system prompt every turn.
 *
 * Frontmatter-driven dispatch (read from each `.mdc`):
 *   - `alwaysApply: true`  → append the rule body to the system prompt every turn.
 *   - `globs:` + `alwaysApply: false` → list (path + globs) in the system
 *     prompt every turn; the agent `read`s the rule on demand.
 *   - neither (manual) → list in the system prompt + `@mention`-able.
 *
 * Universal `@mention` overlay (all 15 rules):
 *   - `ctx.ui.addAutocompleteProvider` with `triggerCharacters: ["@", ...]`.
 *   - When the text after `@` starts with `rule:`, offer the 15 rules;
 *     selecting one inserts `@rule:<name>`.
 *   - Defer to the built-in path provider when the token after `@` doesn't
 *     start with `rule:` (avoid clobbering pi's `@file` path syntax).
 *
 * `before_agent_start` `@rule:` resolver — scans the user's prompt for
 * `@rule:<name>` tokens and appends the corresponding rule body to the
 * system prompt for that turn.
 *
 * `tracker-aura` is skipped via the drift manifest's `ignored: true` flag
 *  (`.pi/engineering-foundation.json`), which the sync utility writes. The
 *  extension reads that manifest to build the ignored-rule set — no hardcoded
 *  rule names. If the manifest is absent (before the seeding run), no rules
 *  are skipped.
 *
 * Rules are resources, NOT pi skills (no `/skill:<rule>`). One concern per
 * extension — this file owns rule dispatch + `@mention`; it does not touch
 * the aura-skill reminder (that's `aura-skill-instruction.ts`).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Autocomplete types (minimal structural shapes)
// ---------------------------------------------------------------------------
// `@earendil-works/pi-tui` exports AutocompleteItem / AutocompleteProvider /
// AutocompleteSuggestions, but this package only declares
// `@earendil-works/pi-coding-agent` as a peer dep — importing from `pi-tui`
// directly would be an undeclared transitive dep. The shapes are structurally
// typed here (matching pi-tui's interface) so the extension compiles against
// the declared peer dep only. `addAutocompleteProvider` is structurally typed
// by `ExtensionAPI`, so a compatible provider shape is accepted.

interface AutocompleteItem {
  value: string;
  label: string;
  description?: string;
}

interface AutocompleteSuggestions {
  items: AutocompleteItem[];
  prefix: string;
}

interface GetSuggestionsOptions {
  signal: AbortSignal;
  force?: boolean;
}

interface AutocompleteProvider {
  /** Characters that should naturally trigger this provider at token boundaries. */
  triggerCharacters?: string[];
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: GetSuggestionsOptions,
  ): Promise<AutocompleteSuggestions | null>;
  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number };
  shouldTriggerFileCompletion?(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory holding the 15 included `.mdc` rule files (relative to the
 *  project root). The rules are deposited by the `engineering-sync` skill's
 *  seeding run; until then the dir is empty/absent and the extension no-ops. */
const RULES_DIR = "skills/engineering-workflow/resources/rules";

/** Path to the drift manifest (relative to the project root), which carries
 *  the `ignored: true` flags the sync utility writes for rules like
 *  `tracker-aura`. */
const MANIFEST_PATH = ".pi/engineering-foundation.json";

/** The `@mention` token prefix. */
const RULE_TOKEN_PREFIX = "rule:";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AttachMode = "always" | "glob" | "manual";

interface Rule {
  /** Rule name (filename without `.mdc`). */
  name: string;
  /** Absolute path to the `.mdc` file. */
  path: string;
  /** Path relative to the project root, for the system-prompt listing. */
  relPath: string;
  /** Frontmatter attach mode. */
  attach: AttachMode;
  /** The `globs:` frontmatter value (string or list of strings), for glob rules. */
  globs: string[];
  /** The rule body (content after the frontmatter). */
  body: string;
  /** The full file content (frontmatter + body), for `@rule:` injection. */
  full: string;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing (minimal, dependency-free)
// ---------------------------------------------------------------------------

/**
 * Parse the YAML frontmatter from a `.mdc` file. Returns `{ fm, body }` where
 * `fm` is a loose record of the parsed keys and `body` is the content after
 * the closing `---`. We only need `alwaysApply` (bool), `globs` (string or
 * list), `name` (string), and `description` (string), so a minimal parser
 * suffices and avoids a runtime dep on js-yaml for end users of the package.
 */
export function parseFrontmatter(content: string): { fm: Record<string, unknown>; body: string } {
  const fm: Record<string, unknown> = {};
  // Frontmatter is delimited by leading `---` lines.
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fm, body: content };
  const yamlBlock = match[1] ?? "";
  const body = match[2] ?? "";
  for (const line of yamlBlock.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();
    // `globs:` can be a YAML list across following lines OR an inline value.
    if (key === "globs") {
      if (rawVal === "") {
        // Multi-line list: collect following `  - <item>` lines.
        // (Handled in the list-aware pass below.)
        fm[key] = [];
      } else {
        // Inline: could be `[a, b]` or a bare string.
        fm[key] = parseYamlScalarList(rawVal);
      }
    } else {
      fm[key] = parseYamlScalar(rawVal);
    }
  }
  // Second pass for multi-line `globs:` list.
  if (Array.isArray(fm.globs) && fm.globs.length === 0) {
    fm.globs = parseYamlListBlock(yamlBlock, "globs");
  }
  return { fm, body };
}

function parseYamlScalar(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  // Strip surrounding quotes.
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  // Numbers stay strings here — we don't need numeric parsing for rules.
  return raw;
}

function parseYamlScalarList(raw: string): string[] {
  // `[a, b]` inline list.
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  // A bare string (single glob).
  return raw ? [raw.replace(/^["']|["']$/g, "")] : [];
}

function parseYamlListBlock(yamlBlock: string, key: string): string[] {
  const lines = yamlBlock.split(/\r?\n/);
  const items: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith(`${key}:`)) {
      inList = true;
      continue;
    }
    if (inList) {
      // List items are `  - <value>` (indented dash).
      const m = line.match(/^\s+-\s+(.*)$/);
      if (m) {
        items.push((m[1] ?? "").trim().replace(/^["']|["']$/g, ""));
      } else if (line.trim() === "") {
        continue;
      } else {
        // Non-list line ends the list.
        break;
      }
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Rule loading
// ---------------------------------------------------------------------------

/** Read the `ignored: true` rule names from the drift manifest. Returns a
 *  Set of rule names (filename without `.mdc`) to skip. Empty if the manifest
 *  is absent or has no ignored entries.
 *
 *  The manifest is keyed by wiki canonical identity (blueprint path or
 *  knowledge-node uuid), and each rule entry carries a `localPath` pointing
 *  into `resources/rules/<name>.mdc`. We derive the rule name from the
 *  `localPath` basename so the match is by file, not by key shape. */
function loadIgnoredRuleNames(cwd: string): Set<string> {
  const manifestPath = join(cwd, MANIFEST_PATH);
  if (!existsSync(manifestPath)) return new Set();
  let manifest: { entries?: Record<string, { ignored?: boolean; localPath?: string }> };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    // Malformed manifest — don't crash the extension; just skip nothing.
    return new Set();
  }
  const ignored = new Set<string>();
  for (const entry of Object.values(manifest.entries ?? {})) {
    if (entry.ignored !== true) continue;
    const lp = entry.localPath ?? "";
    // localPath is repo-relative, e.g.
    // `skills/engineering-workflow/resources/rules/tracker-aura.mdc`.
    const filename = lp.split("/").pop() ?? "";
    if (filename.endsWith(".mdc")) {
      ignored.add(filename.slice(0, -4));
    }
  }
  return ignored;
}

/** Load all non-ignored `.mdc` rules from the rules dir. Returns [] if the
 *  dir is absent or empty (the extension no-ops until the seeding runs).
 *  Rules marked `ignored: true` in the drift manifest are skipped. */
export function loadRules(cwd: string): Rule[] {
  const dir = join(cwd, RULES_DIR);
  if (!existsSync(dir)) return [];
  const ignored = loadIgnoredRuleNames(cwd);
  const rules: Rule[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".mdc")) continue;
    const base = name.slice(0, -4);
    if (ignored.has(base)) continue;
    const path = join(dir, name);
    const full = readFileSync(path, "utf8");
    const { fm, body } = parseFrontmatter(full);
    const alwaysApply = fm.alwaysApply === true;
    const globs = Array.isArray(fm.globs) ? (fm.globs as string[]) : [];
    const attach: AttachMode = alwaysApply
      ? "always"
      : globs.length > 0
        ? "glob"
        : "manual";
    rules.push({
      name: base,
      path,
      relPath: `${RULES_DIR}/${name}`,
      attach,
      globs,
      body,
      full,
    });
  }
  return rules;
}

export type { AttachMode, Rule };
export { parseYamlScalar, parseYamlScalarList, parseYamlListBlock };

// ---------------------------------------------------------------------------
// System-prompt builders
// ---------------------------------------------------------------------------

export function buildAlwaysOnSection(rules: Rule[]): string {
  const alwaysOn = rules.filter((r) => r.attach === "always");
  if (alwaysOn.length === 0) return "";
  const blocks = alwaysOn
    .map((r) => `### Rule: ${r.name}\n\n${r.body.trim()}`)
    .join("\n\n");
  return `\n\n## Engineering Rules (always-on)\n\nThe following house rules are always active. Honor them on every turn.\n\n${blocks}\n`;
}

export function buildListedRulesSection(rules: Rule[]): string {
  // List the non-always-on rules (glob + manual = 7) so the agent knows they
  // exist and can `read` or `@mention` them. (Always-on rules are already
  // injected as bodies; listing them too would be redundant.)
  const listed = rules.filter((r) => r.attach !== "always");
  if (listed.length === 0) return "";
  const lines = listed.map((r) => {
    const globsStr = r.globs.length > 0 ? ` (globs: ${r.globs.join(", ")})` : "";
    return `- ${r.relPath}${globsStr}`;
  }).join("\n");
  return `\n\n## Engineering Rules (on-demand)\n\nThe following house rules are available but not auto-loaded. Use the \`read\` tool to load a rule when its topic is relevant, or mention it with \`@rule:<name>\` to inject its body for this turn.\n\n${lines}\n`;
}

// ---------------------------------------------------------------------------
// Autocomplete provider (universal `@mention` overlay)
// ---------------------------------------------------------------------------

/** Extract the `@rule:<token>` text after the cursor, or `null` if the `@`
 *  token isn't a `rule:` token (so we defer to the built-in path provider). */
export function extractRuleToken(textBeforeCursor: string): string | null {
  // Match `@rule:<chars>` where the token starts with `rule:`. We require the
  // `@` to be at a token boundary (start or after whitespace) so we don't
  // hijack `@` inside emails/paths.
  const match = textBeforeCursor.match(/(?:^|[ \t])@(rule:[^\s@]*)$/);
  return match ? (match[1] ?? "") : null;
}

function formatRuleItem(rule: Rule): AutocompleteItem {
  return {
    value: `@${RULE_TOKEN_PREFIX}${rule.name}`,
    label: `@rule:${rule.name}`,
    description: rule.globs.length > 0
      ? `(glob: ${rule.globs.join(", ")})`
      : "(manual)",
  };
}

function createRuleAutocompleteProvider(
  current: AutocompleteProvider,
  getRules: () => Rule[],
): AutocompleteProvider {
  return {
    triggerCharacters: ["@"],
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const token = extractRuleToken(beforeCursor);
      if (token === null) {
        // Not a `@rule:` token — defer to the built-in path provider (don't
        // clobber pi's `@file` path syntax).
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      const rules = getRules();
      if (rules.length === 0) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      // token is `rule:<partial-name>`; the prefix we replace is `@rule:<partial>`.
      const afterAt = token; // e.g. "rule:track"
      const partial = afterAt.slice(RULE_TOKEN_PREFIX.length); // e.g. "track"
      const matches = partial
        ? rules.filter((r) => r.name.toLowerCase().includes(partial.toLowerCase()))
        : rules;
      if (matches.length === 0) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      return {
        items: matches.map(formatRuleItem),
        prefix: `@${afterAt}`,
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      // Defer to the built-in provider's decision unless we're actively
      // completing a `@rule:` token.
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      if (extractRuleToken(beforeCursor) !== null) return false;
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

// ---------------------------------------------------------------------------
// `@rule:` resolver (before_agent_start)
// ---------------------------------------------------------------------------

/** Scan the prompt for `@rule:<name>` tokens and append the corresponding
 *  rule bodies to the system prompt for that turn. Returns the text to append
 *  (or empty string if no `@rule:` tokens are present). */
export function resolveRuleMentions(prompt: string, rules: Rule[]): string {
  const mentioned = new Set<string>();
  const re = /@(?:rule:)([a-z0-9-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    mentioned.add((m[1] ?? "").toLowerCase());
  }
  if (mentioned.size === 0) return "";
  const byName = new Map(rules.map((r) => [r.name.toLowerCase(), r]));
  const blocks: string[] = [];
  for (const name of mentioned) {
    const rule = byName.get(name);
    if (rule) {
      blocks.push(`### Rule: ${rule.name} (@rule:${name})\n\n${rule.body.trim()}`);
    }
  }
  if (blocks.length === 0) return "";
  return `\n\n## Engineering Rules (@mentioned this turn)\n\n${blocks.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  // Rules are loaded once at session start (the files don't change during a
  // session) and reloaded on /reload (which re-emits session_start).
  let rules: Rule[] = [];

  pi.on("session_start", async (_event, ctx) => {
    rules = loadRules(ctx.cwd);
    if (rules.length === 0) {
      // No rules deposited yet (the seeding hasn't run). The extension no-ops;
      // do not notify — this is the expected state until the mirror is seeded.
      return;
    }
    // Register the universal `@mention` overlay for all rules.
    ctx.ui.addAutocompleteProvider((current) =>
      createRuleAutocompleteProvider(current, () => rules),
    );
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (rules.length === 0) return;
    const alwaysOn = buildAlwaysOnSection(rules);
    const listed = buildListedRulesSection(rules);
    const mentions = resolveRuleMentions(event.prompt ?? "", rules);
    const addition = alwaysOn + listed + mentions;
    if (addition.length === 0) return;
    return {
      systemPrompt: event.systemPrompt + addition,
    };
  });
}
