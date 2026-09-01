/**
 * Engineering Rules Extension
 *
 * Reads the repo's `.mdc` Cursor rule files from `<cwd>/.cursor/rules/`
 * (recursively) and dispatches each by its frontmatter attach mode, provides
 * a universal `@mention` overlay for all loaded rules, and lists the
 * non-auto-loaded rules in the system prompt every turn.
 *
 * Syncing the `.mdc` files into a repo's `.cursor/rules/` is a per-repo
 * concern — this package ships no rules of its own. The extension reads
 * whatever the repo (its cwd) has deposited there. Until a repo populates
 * `.cursor/rules/`, the extension no-ops (no rules are injected).
 *
 * Frontmatter-driven dispatch (read from each `.mdc`):
 *   - `alwaysApply: true`  → append the rule body to the system prompt every turn.
 *   - `globs:` + `alwaysApply: false` → list (path + globs) in the system
 *     prompt every turn; the agent `read`s the rule on demand.
 *   - neither (manual) → list in the system prompt + `@mention`-able.
 *
 * Universal `@mention` overlay (all loaded rules):
 *   - `ctx.ui.addAutocompleteProvider` with `triggerCharacters: ["@", ...]`.
 *   - When the text after `@` starts with `rule:`, offer the loaded rules;
 *     selecting one inserts `@rule:<name>`.
 *   - Defer to the built-in path provider when the token after `@` doesn't
 *     start with `rule:` (avoid clobbering pi's `@file` path syntax).
 *
 * `before_agent_start` `@rule:` resolver — scans the user's prompt for
 * `@rule:<name>` tokens and appends the corresponding rule body to the
 * system prompt for that turn.
 *
 * Configurable skip (`aura.cursorRules.ignore`):
 *   - An array of glob patterns matched against the rule path **relative to
 *     `.cursor/rules/`** (e.g. `"tracker-aura.mdc"`, a pattern matching any
 *     file ending in `-aura.mdc` under a `universal/` subtree).
 *   - Read from BOTH `~/.pi/agent/settings.json` (global, applies to all
 *     CWDs) and `<cwd>/.pi/settings.json` (project-local); the two lists are
 *     unioned, so a rule matching either is skipped.
 *   - Lives under the `aura` settings block (this package's namespace); the
 *     setting is repo-controlled, not package-controlled — there is no
 *     package-wide ignore list and no drift manifest.
 *
 * Rules are resources, NOT pi skills (no `/skill:<rule>`). One concern per
 * extension — this file owns rule dispatch + `@mention`; it does not touch
 * the aura-skill reminder (that's `aura-skill-instruction.ts`).
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { homedir } from "node:os";
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

/** Directory holding the repo's `.mdc` Cursor rule files (relative to the
 *  project root / cwd). The repo is responsible for syncing rules here; this
 *  package ships none. Until the dir is populated the extension no-ops. */
const RULES_DIR = ".cursor/rules";

/** Global settings file (pi agent settings). Computed lazily from homedir()
 *  so tests can override HOME before calling loadIgnoreGlobs. */
function globalSettingsPath(): string {
  return join(homedir(), ".pi", "agent", "settings.json");
}

/** Project-local settings file, relative to cwd (pi's CONFIG_DIR_NAME = ".pi"). */
const PROJECT_SETTINGS_REL = join(".pi", "settings.json");

/** Settings key path for the configurable skip list. Lives under the `aura`
 *  block: `aura.cursorRules.ignore`. Globs are relative to `.cursor/rules/`. */
const SETTINGS_BLOCK = "aura";
const SETTINGS_KEY = "cursorRules";
const IGNORE_FIELD = "ignore";

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
  /** Path relative to RULES_DIR (no leading sep), for the system-prompt listing
   *  and for glob-matching against the ignore list. */
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
// Glob matching (minimal, dependency-free — supports *, **, ?)
// ---------------------------------------------------------------------------

/**
 * Compile a glob pattern into a RegExp. Supports `*` (non-separator span),
 * `**` (any span including separators), and `?` (single non-separator char).
 * Separator is the OS path separator. Patterns are matched against the rule
 * path **relative to `.cursor/rules/`** (forward-slash-joined on all platforms
 * for cross-platform settings portability).
 *
 * We implement this here instead of pulling in a glob dep so the extension
 * stays dependency-free for end users of the package (the peer dep is pi only).
 */
export function globToRegExp(pattern: string): RegExp {
  // Normalize: match on forward-slash-separated relpaths.
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // `**` — any span including separators. Consume an optional following `/`
        // so `a/**/b` matches `a/b` (zero dirs) too.
        i += 2;
        if (pattern[i] === "/") i++;
        re += "(?:.*/)?";
      } else {
        // `*` — non-separator span.
        re += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      re += "[^/]";
      i++;
    } else if (".+^$(){}|[]\\".includes(ch)) {
      re += "\\" + ch;
      i++;
    } else if (ch === "/") {
      re += "/";
      i++;
    } else {
      re += ch;
      i++;
    }
  }
  re += "$";
  return new RegExp(re);
}

/** Match a rule's relPath (forward-slash-joined, relative to `.cursor/rules/`)
 *  against a list of glob patterns. True if any pattern matches. */
export function matchesAnyGlob(relPath: string, patterns: string[]): boolean {
  // Normalize relPath to forward slashes (relPath is built with OS sep).
  const norm = relPath.split(sep).join("/");
  for (const p of patterns) {
    if (globToRegExp(p).test(norm)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Settings: read `aura.cursorRules.ignore` from global + project, union
// ---------------------------------------------------------------------------

/** Read the `aura.cursorRules.ignore` array from a single settings file.
 *  Returns [] when the file or the key is absent, or the value isn't a
 *  string array. Never throws — a malformed file just contributes no globs. */
function readIgnoreGlobs(settingsPath: string): string[] {
  if (!existsSync(settingsPath)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const block = (parsed as Record<string, unknown>)[SETTINGS_BLOCK];
  if (typeof block !== "object" || block === null) return [];
  const key = (block as Record<string, unknown>)[SETTINGS_KEY];
  if (typeof key !== "object" || key === null) return [];
  const ignore = (key as Record<string, unknown>)[IGNORE_FIELD];
  if (!Array.isArray(ignore)) return [];
  return ignore.filter((g): g is string => typeof g === "string");
}

/** Load the union of `aura.cursorRules.ignore` globs from global settings
 *  (`~/.pi/agent/settings.json`, applies to all CWDs) and project-local
 *  settings (`<cwd>/.pi/settings.json`). Globs are relative to `.cursor/rules/`. */
export function loadIgnoreGlobs(cwd: string): string[] {
  const globalGlobs = readIgnoreGlobs(globalSettingsPath());
  const projectGlobs = readIgnoreGlobs(join(cwd, PROJECT_SETTINGS_REL));
  // Union (dedupe).
  return Array.from(new Set([...globalGlobs, ...projectGlobs]));
}

// ---------------------------------------------------------------------------
// Rule loading
// ---------------------------------------------------------------------------

/** Recursively collect all `.mdc` file paths under `dir`. Returns absolute
 *  paths. Empty if `dir` is absent. */
function collectMdcFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectMdcFiles(full, acc);
    } else if (entry.endsWith(".mdc")) {
      acc.push(full);
    }
  }
  return acc;
}

/** Load all non-ignored `.mdc` rules from `<cwd>/.cursor/rules/` recursively.
 *  Returns [] if the dir is absent or empty (the extension no-ops until the
 *  repo populates it). Rules matching any `aura.cursorRules.ignore` glob are
 *  skipped. */
export function loadRules(cwd: string): Rule[] {
  const dir = join(cwd, RULES_DIR);
  if (!existsSync(dir)) return [];
  const ignoreGlobs = loadIgnoreGlobs(cwd);
  const rules: Rule[] = [];
  for (const path of collectMdcFiles(dir)) {
    // relPath keeps the ".mdc" extension and is forward-slash-joined, relative
    // to RULES_DIR. It is what glob patterns (e.g. "tracker-aura.mdc",
    // "universal/**/*-aura.mdc") match against.
    const relWithExt = path.slice(dir.length + 1).split(sep).join("/");
    if (ignoreGlobs.length > 0 && matchesAnyGlob(relWithExt, ignoreGlobs)) continue;
    const full = readFileSync(path, "utf8");
    const { fm, body } = parseFrontmatter(full);
    const alwaysApply = fm.alwaysApply === true;
    const globs = Array.isArray(fm.globs) ? (fm.globs as string[]) : [];
    const attach: AttachMode = alwaysApply
      ? "always"
      : globs.length > 0
        ? "glob"
        : "manual";
    // name = filename without ".mdc" (last path segment, extension stripped).
    const lastSeg = relWithExt.split("/").pop() ?? relWithExt;
    const name = lastSeg.endsWith(".mdc") ? lastSeg.slice(0, -4) : lastSeg;
    rules.push({
      name,
      path,
      relPath: relWithExt,
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
    return `- ${RULES_DIR}/${r.relPath}${globsStr}`;
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
      // No rules in <cwd>/.cursor/rules/ — the extension no-ops. Do not
      // notify: this is the expected state until the repo syncs its rules.
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
