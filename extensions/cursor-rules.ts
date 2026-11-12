/**
 * Cursor-rules loading for the reference engine's local `#rule:` kind.
 *
 * This is the loading half of the former `engineering-rules` extension,
 * which moved out of this package to the plugin repo (the sole delivery
 * vehicle for the engineering canon): the extension's system-prompt
 * dispatch and mentioned-body injection went with it, while the reference
 * engine (`aura-references.ts`) kept its local-only `#rule:`/`@rule:`
 * mention kind and still needs the repo's rules loaded. This module owns
 * that loading; nothing else in the package consumes it.
 *
 * Reads the repo's `.mdc` Cursor rule files from `<cwd>/.cursor/rules/`
 * (recursively) and classifies each by its frontmatter attach mode. The
 * plugin repo's rules dispatch consumes the same directory for system-prompt
 * injection; this package ships no rules of its own. Until a repo populates
 * `.cursor/rules/`, loading returns an empty set (no rules to mention).
 *
 * Frontmatter-driven classification (read from each `.mdc`):
 *   - `alwaysApply: true`  → `attach: "always"`.
 *   - `globs:` + `alwaysApply: false` → `attach: "glob"` (the globs ride the
 *     `Rule` for the `<rule-ref attach>` attribute).
 *   - neither (manual) → `attach: "manual"`.
 *
 * Configurable skip (`aura.cursorRules.ignore`):
 *   - An array of glob patterns matched against the rule path **relative to
 *     `.cursor/rules/`** (e.g. `"tracker-aura.mdc"`, a pattern matching any
 *     file ending in `-aura.mdc` under a `universal/` subtree).
 *   - Read from BOTH `~/.pi/agent/settings.json` (global, applies to all
 *     CWDs) and `<cwd>/.pi/settings.json` (project-local); the two lists are
 *     unioned, so a rule matching either is skipped.
 *   - Lives under the `aura` settings block (this package's namespace); the
 *     setting is repo-controlled, not package-controlled.
 *
 * Rules are resources, NOT pi skills (no `/skill:<rule>`). This file owns
 * rule loading + classification only; it does not touch the system prompt.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory holding the repo's `.mdc` Cursor rule files (relative to the
 *  project root / cwd). The repo is responsible for syncing rules here; this
 *  package ships none. Until the dir is populated the loader returns []. */
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AttachMode = "always" | "glob" | "manual";

interface Rule {
  /** Rule name (filename without `.mdc`). The canonical token key for
   *  `#rule:`/`@rule:` mentions. */
  name: string;
  /** Display title: the frontmatter `name` when present, falling back to
   *  the filename-derived name. The reference engine's `<rule-ref>`
   *  element text. */
  displayName?: string;
  /** Absolute path to the `.mdc` file. */
  path: string;
  /** Path relative to RULES_DIR (no leading sep), for glob-matching against
   *  the ignore list. */
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
 * list), and `name` (string), so a minimal parser suffices; the frontmatter
 * needs no YAML library.
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
  // Numbers stay strings here; we don't need numeric parsing for rules.
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
// Glob matching (minimal, dependency-free: supports *, **, ?)
// ---------------------------------------------------------------------------

/**
 * Compile a glob pattern into a RegExp. Supports `*` (non-separator span),
 * `**` (any span including separators), and `?` (single non-separator char).
 * Separator is the OS path separator. Patterns are matched against the rule
 * path **relative to `.cursor/rules/`** (forward-slash-joined on all platforms
 * for cross-platform settings portability).
 *
 * We implement this here instead of pulling in a glob dep so the package
 * stays dependency-free for end users (the peer dep is pi only).
 */
export function globToRegExp(pattern: string): RegExp {
  // Normalize: match on forward-slash-separated relpaths.
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // `**`: any span including separators. Consume an optional following `/`
        // so `a/**/b` matches `a/b` (zero dirs) too.
        i += 2;
        if (pattern[i] === "/") i++;
        re += "(?:.*/)?";
      } else {
        // `*`: non-separator span.
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
 *  string array. Never throws: a malformed file just contributes no globs. */
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
 *  Returns [] if the dir is absent or empty (no rules until the repo
 *  populates the directory). Rules matching any `aura.cursorRules.ignore`
 *  glob are skipped. */
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
    // Display title: the frontmatter `name` when it carries one (a
    // non-empty string), else undefined so readers fall back to the
    // filename-derived name.
    const displayName =
      typeof fm.name === "string" && fm.name.trim() !== "" ? fm.name : undefined;
    rules.push({
      name,
      displayName,
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
