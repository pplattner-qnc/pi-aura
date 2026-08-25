/**
 * Aura Tasks `@AURA-<number>` Extension
 *
 * Provides a universal `@mention` overlay for Aura tasks, keyed by their
 * human-readable key (`AURA-42`). Mirrors the shape of the `@rule:` overlay in
 * `engineering-rules.ts` — one concern per extension, this file owns the
 * task `@mention` autocomplete + inline expansion; it does not touch rules or
 * the aura-skill reminder.
 *
 * Three parts:
 *
 * 1. Autocomplete (`session_start` → `ctx.ui.addAutocompleteProvider`).
 *    When the text after `@` starts with `AURA-` (case-insensitive), offer the
 *    tasks the user can see, filtered client-side by the typed number prefix.
 *    Selecting one inserts `@AURA-<number>`. The description line shows the
 *    task status + title (truncated to fit the pane width by the renderer).
 *    Defer to the built-in path provider when the token after `@` isn't an
 *    `AURA-` token (avoid clobbering pi's `@file` / `@rule:` syntaxes).
 *
 * 2. Inline expansion (`input` event → `action: "transform"`).
 *    On submit, scan the prompt for `@AURA-<number>` tokens and replace each
 *    known one inline with `<aura-task key="AURA-<number>" status="<status>"><title></aura-task>`. The text box
 *    keeps `@AURA-42` while typing; the message sent to the LLM (and stored
 *    in history) carries the expanded form. Unknown keys are left untouched
 *    so the agent can still resolve them via the `aura` skill.
 *
 * 3. System-prompt instruction (`before_agent_start`). Appends a slim per-turn
 *    block explaining the `<aura-task>` tag shape (key / status / element-text
 *    title) and directing the agent to the `aura` skill for any action beyond
 *    reading the reference. pi rebuilds the base system prompt each turn, so
 *    the append re-applies cleanly without accumulating.
 *
 * Credentials: the extension talks to Aura through the shared AuraClient
 * (`createDefaultAuraClient`, which reads `aura.baseUrl` from settings + the
 * Aura PAT from the OS keyring). When credentials are missing — the same
 * state `@rule:` is in before the rules are seeded — the extension no-ops:
 * the autocomplete provider defers to the built-in, and the `input` handler
 * passes the prompt through unchanged. Transient fetch failures are also
 * swallowed (autocomplete defers, mentions are left as the user typed them)
 * so a flaky Aura never blocks the prompt — the agent can still reach the
 * task via the `aura` skill.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Autocomplete types (minimal structural shapes — see engineering-rules.ts)
// ---------------------------------------------------------------------------
// `@earendil-works/pi-tui` exports AutocompleteItem / AutocompleteProvider /
// AutocompleteSuggestions, but this package only declares
// `@earendil-works/pi-coding-agent` as a peer dep — importing from `pi-tui`
// directly would be an undeclared transitive dep. The shapes are structurally
// typed here (matching pi-tui's interface) so the extension compiles against
// the declared peer dep only.

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
// Domain task shape (the subset we read)
// ---------------------------------------------------------------------------
// We only need `human_key`, `title`, and `status`. The shared AuraClient's
// `Task` carries these as required fields, but we type the cache entry locally
// so the pure helpers below don't import from `@pi-aura/shared/aura-client` —
// that keeps the unit-testable surface free of the dynamic-import seam (the
// AuraClient is only imported live inside the extension factory).

interface AuraTaskRef {
  human_key: string;
  title: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of tasks to pull for the autocomplete cache. Aura caps a
 * page at 100; we page up to this many so a member of many tasks still gets
 * broad coverage without an unbounded fetch. Sorted newest-first by
 * `updated_at desc` so the freshest tasks land in the cache first.
 */
const MAX_TASKS = 500;

/** Page size for `listTasks` (Aura's max is 100). */
const PAGE_SIZE = 100;

/** Maximum suggestions to render in the autocomplete pane at once. */
const MAX_SUGGESTIONS = 20;

/**
 * The `AURA-` token prefix recognized after `@`. Case-insensitive in the
 * extractor; the canonical form inserted on completion is uppercased.
 */
const AURA_TOKEN_PREFIX = "AURA-";

// ---------------------------------------------------------------------------
// System-prompt instruction (explains the <aura-task> shape to the model)
// ---------------------------------------------------------------------------

/** Slim per-turn system-prompt block that teaches the model what the
 *  `<aura-task>` tags mean and where to go to act on a task. Injected via
 *  `before_agent_start`, the same hook `aura-skill-instruction.ts` uses; pi
 *  rebuilds the base system prompt each turn, so appending here re-applies
 *  cleanly without accumulating across the session.
 *
 *  Kept deliberately short: the tag is self-describing (labelled attributes
 *  + element text), so this only names the parts and points at the `aura`
 *  skill for anything beyond reading the reference. */
export const AURA_TASK_INSTRUCTION = `
## Aura task references

User messages may contain inline Aura task references rendered as tagged elements:

  <aura-task key="AURA-42" status="OPEN">Fix the login bug</aura-task>

- \`key\` — the task's human-readable identifier (e.g. \`AURA-42\`).
- \`status\` — its current Aura workflow status (e.g. \`OPEN\`, \`IN_REVIEW\`, \`DONE\`).
- The element text is the task title.

These are references the user expanded from \`@AURA-<number>\` mentions; they carry only the key, title, and status. To read the full task, update it, or take any action on it, use the \`aura\` skill (load its SKILL.md with the \`read\` tool) and the aura-mcp-dev MCP tools — do not infer further task details from the reference alone.
`;

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

/**
 * Extract the `@AURA-<partial>` text after the cursor, or `null` when the `@`
 * token isn't an `AURA-` token. The `@` must sit at a token boundary (start of
 * line or after whitespace) so we don't hijack `@` inside emails or paths.
 * The prefix is returned lowercased for case-insensitive matching.
 */
export function extractAuraToken(textBeforeCursor: string): string | null {
  // `AURA-` optionally followed by digits (possibly empty, while the user is
  // still typing the prefix). We allow letters only in `AURA`, then `-`, then
  // digits — this is deliberately narrow so we never shadow `@file` paths or
  // the `@rule:` overlay.
  const match = textBeforeCursor.match(/(?:^|[ \t])@(AURA-\d*)$/i);
  return match ? (match[1] ?? "") : null;
}

// ---------------------------------------------------------------------------
// Autocomplete filtering (pure)
// ---------------------------------------------------------------------------

/**
 * Build the autocomplete items for a given partial number, from the cached
 * task list. The partial is the digits typed after `AURA-` (possibly empty).
 *
 * Filtering is number-prefix first (the common case — the user types the
 * number), then falls back to nothing rather than a fuzzy title search: the
 * `@AURA-` syntax is keyed by number, and a title search belongs to the
 * `aura` skill, not to this overlay.
 */
export function filterTasks(tasks: AuraTaskRef[], partialDigits: string): AutocompleteItem[] {
  if (partialDigits.length > 0) {
    const matches = tasks
      .filter((t) => taskNumber(t).startsWith(partialDigits))
      .slice(0, MAX_SUGGESTIONS);
    return matches.map(formatTaskItem);
  }
  // No digits yet: show the most recently updated tasks first (the cache is
  // already sorted newest-first, so just take the head).
  return tasks.slice(0, MAX_SUGGESTIONS).map(formatTaskItem);
}

/** Extract the numeric portion of a task's human key (`AURA-42` → `42`). */
function taskNumber(task: AuraTaskRef): string {
  const dash = task.human_key.indexOf("-");
  return dash === -1 ? task.human_key : task.human_key.slice(dash + 1);
}

function formatTaskItem(task: AuraTaskRef): AutocompleteItem {
  // The label is the `@AURA-<number>` token the user will see in the text box;
  // the description carries status + title. The TUI renderer truncates the
  // description to the pane width, so we don't hard-cap it here.
  return {
    value: `@${task.human_key}`,
    label: `@${task.human_key}`,
    description: `[${task.status}] ${task.title}`,
  };
}

// ---------------------------------------------------------------------------
// Inline expansion (pure)
// ---------------------------------------------------------------------------

/**
 * The replacement text for one `@AURA-<number>` mention, as a tagged element
 * so the model can unambiguously tell key, status, and title apart even
 * when titles contain parentheses, pipes, or colons. The title is XML-
 * escaped (it sits in element text) and the status/key are attribute values
 * (escaped for `"`). Exported for unit tests so the exact format is pinned
 * independently of the resolver.
 */
export function formatExpandedMention(task: AuraTaskRef): string {
  return `<aura-task key="${escapeAttr(task.human_key)}" status="${escapeAttr(task.status)}">${escapeText(task.title)}</aura-task>`;
}

/** Escape a string for use as an XML attribute value (the only char that
 *  matters for `key`/`status` is `"`, but we escape `&` and `<` too for
 *  safety since both would break the surrounding tag). */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/** Escape a string for use as XML element text (title). `>` needn't be
 *  escaped, but we escape `&` and `<` so a title containing either is still
 *  well-formed and recoverable. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
}

/**
 * Scan the prompt for `@AURA-<number>` tokens and replace each one that is
 * found in the cache with its expanded form. Unknown keys are left in place
 * (the agent can resolve them via the `aura` skill). Matching is
 * case-insensitive on the `AURA-` prefix; the expansion uses the task's
 * canonical (server-cased) human key + status.
 *
 * `lookup` maps a lowercased human key (`aura-42`) to the cached task, and
 * is called for every mention. A `null` return means "leave as-is".
 */
export function expandAuraMentions(
  prompt: string,
  lookup: (lowerKey: string) => AuraTaskRef | null,
): string {
  // `@AURA-<digits>` at a token boundary. Capture the full key (e.g. `AURA-42`)
  // so we can look it up case-insensitively.
  return prompt.replace(/(?:^|[ \t])@(AURA-\d+)\b/gi, (full, key: string) => {
    const task = lookup(key.toLowerCase());
    if (!task) return full;
    // Preserve the leading boundary (space/tab or start) so the expansion
    // doesn't glue onto the preceding word.
    const boundary = full.startsWith(" ") ? " " : full.startsWith("\t") ? "\t" : "";
    return boundary + formatExpandedMention(task);
  });
}

// ---------------------------------------------------------------------------
// Autocomplete provider factory
// ---------------------------------------------------------------------------

function createAuraAutocompleteProvider(
  current: AutocompleteProvider,
  getTasks: () => Promise<AuraTaskRef[] | null>,
): AutocompleteProvider {
  return {
    triggerCharacters: ["@"],
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const token = extractAuraToken(beforeCursor);
      if (token === null) {
        // Not an `@AURA-` token — defer to the built-in path provider (don't
        // clobber pi's `@file` / `@rule:` syntaxes).
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      const tasks = await getTasks();
      if (options.signal.aborted || tasks === null || tasks.length === 0) {
        // No credentials / not loaded yet / aborted — defer.
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      // token is `AURA-<partial-digits>`; the prefix we replace is `@<token>`.
      const partialDigits = token.slice(AURA_TOKEN_PREFIX.length);
      const suggestions = filterTasks(tasks, partialDigits);
      if (suggestions.length === 0) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      return {
        items: suggestions,
        prefix: `@${token}`,
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      // Defer to the built-in provider's decision unless we're actively
      // completing an `@AURA-` token.
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      if (extractAuraToken(beforeCursor) !== null) return false;
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  // Lazily-built cache of all visible tasks, populated on first autocomplete
  // query (or on first submit with an `@AURA-` mention). Held for the session
  // and rebuilt on `/reload` (which re-emits `session_start`).
  let tasksCache: AuraTaskRef[] | null = null;
  // In-flight promise so concurrent callers share one fetch.
  let tasksPromise: Promise<AuraTaskRef[] | null> | undefined;

  /** Load all visible tasks, paginating up to `MAX_TASKS`.
   *  Returns `null` when credentials are missing (the expected no-op state);
   *  throws on a genuine fetch failure after credentials are present. */
  async function loadTasks(): Promise<AuraTaskRef[] | null> {
    tasksPromise ||= (async () => {
      // Dynamic import: @pi-aura/shared/aura-client uses .js extension
      // specifiers internally, which Node's experimental strip-types loader
      // cannot resolve. Pi's extension runtime handles static imports, so we
      // dynamic-import the client factory here to keep the unit-test entry
      // point runnable with `node --experimental-strip-types` (same seam as
      // aura-secrets.ts importing the keyring).
      const { createDefaultAuraClient } = await import("@pi-aura/shared/aura-client");
      let client;
      try {
        client = await createDefaultAuraClient();
      } catch {
        // Missing baseUrl or PAT — the expected pre-credentials state. No-op.
        return null;
      }
      const collected: AuraTaskRef[] = [];
      let page = 1;
      // Page until we hit the cap or run out of results.
      while (collected.length < MAX_TASKS) {
        // `status: "ALL"` spans open + archived statuses; `archived: "all"`
        // is orthogonal and also surfaces archived tasks (the API takes the
        // string enum "false"|"true"|"all", but the shared ListTasksInput
        // domain interface still types `archived` as boolean — cast through
        // the index signature until that interface is widened).
        const opts = {
          status: "ALL",
          archived: "all",
          limit: PAGE_SIZE,
          page,
          sort_by: "updated_at",
          sort_dir: "desc",
        } as Record<string, unknown>;
        const res = await client.listTasks(opts);
        for (const t of res.items) {
          collected.push({ human_key: t.human_key, title: t.title, status: t.status });
        }
        if (res.items.length < PAGE_SIZE) break; // last page
        page += 1;
      }
      return collected.slice(0, MAX_TASKS);
    })();
    try {
      return await tasksPromise;
    } catch (err) {
      // A real fetch failed — reset so the next call can retry, and rethrow
      // so the caller can notify (or no-op for autocomplete).
      tasksPromise = undefined;
      throw err;
    }
  }

  /** Shared getter used by both the autocomplete provider and the `input`
   *  handler: returns the cache, fetching on first use. Swallows errors as
   *  `null` so the autocomplete pane silently defers on a transient failure. */
  function getTasks(): Promise<AuraTaskRef[] | null> {
    return loadTasks().catch(() => null);
  }

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) =>
      createAuraAutocompleteProvider(current, getTasks),
    );
  });

  pi.on("input", async (event) => {
    // Fast path: no `@AURA-` mention → pass through unchanged.
    if (!/@AURA-\d+/i.test(event.text)) return;

    let tasks = tasksCache;
    if (tasks === null) {
      tasks = await getTasks();
      tasksCache = tasks;
    }
    // `lookup` must be non-null for `expandAuraMentions` to call.
    const lookup = (lowerKey: string): AuraTaskRef | null => {
      if (!tasks) return null;
      return tasks.find((t) => t.human_key.toLowerCase() === lowerKey) ?? null;
    };

    const firstPass = expandAuraMentions(event.text, lookup);

    // Resolve `@AURA-<number>` mentions the cache didn't cover (e.g. an old
    // archived task outside the cached window) via the by-key endpoint. This
    // also covers the case where the cache is empty (no credentials) but the
    // user still typed a mention — we try the by-key lookup directly.
    const unresolved = collectUnresolvedMentions(firstPass, lookup);
    if (unresolved.length === 0) {
      // Everything resolvable was resolved (or there was nothing to resolve).
      if (firstPass === event.text) return; // unchanged
      return { action: "transform", text: firstPass };
    }

    const fetched = await resolveUnknownKeys(unresolved);
    if (fetched.size === 0) {
      // No unknown could be resolved — return the first pass if it changed
      // anything, otherwise leave the prompt untouched.
      if (firstPass === event.text) return;
      return { action: "transform", text: firstPass };
    }

    const lookup2 = (lowerKey: string): AuraTaskRef | null =>
      lookup(lowerKey) ?? fetched.get(lowerKey) ?? null;
    const finalText = expandAuraMentions(event.text, lookup2);
    if (finalText === event.text) return; // nothing expanded in the end
    return { action: "transform", text: finalText };
  });

  // Teach the model what the `<aura-task>` tags mean and that it must reach
  // for the `aura` skill to act on a referenced task. Appended every turn
  // (pi rebuilds the base system prompt each turn, so this never accumulates).
  pi.on("before_agent_start", async (event, _ctx) => {
    return { systemPrompt: event.systemPrompt + "\n" + AURA_TASK_INSTRUCTION };
  });

  /** Resolve `@AURA-<number>` keys absent from the cache via the by-key
   *  endpoint. Returns a map keyed by lowercased human key. */
  async function resolveUnknownKeys(keys: string[]): Promise<Map<string, AuraTaskRef>> {
    const out = new Map<string, AuraTaskRef>();
    const { createDefaultAuraClient } = await import("@pi-aura/shared/aura-client");
    let client;
    try {
      client = await createDefaultAuraClient();
    } catch {
      return out; // missing credentials — nothing to resolve
    }
    await Promise.all(
      keys.map(async (key) => {
        try {
          const t = await client.getTaskByHumanKey(key);
          out.set(key.toLowerCase(), { human_key: t.human_key, title: t.title, status: t.status });
        } catch {
          // 404/403 or network — leave it unresolved; the agent can retry
          // via the `aura` skill.
        }
      }),
    );
    return out;
  }
}

/** Collect every `@AURA-<number>` mention in the prompt that `lookup`
 *  cannot resolve. Returns the canonical-cased keys (e.g. `AURA-42`) so
 *  they can be passed straight to `getTaskByHumanKey`. */
export function collectUnresolvedMentions(
  prompt: string,
  lookup: (lowerKey: string) => AuraTaskRef | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /(?:^|[ \t])@(AURA-\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const key = m[1] ?? "";
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (lookup(lower) === null) out.push(key);
  }
  return out;
}
