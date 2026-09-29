/**
 * Aura References Extension (shared reference engine)
 *
 * One syntax family for referencing resources in a pi prompt: `#task:AURA-42`
 * today, with `#rule:`, `#artifact:`, and `#wiki:` joining later via new kind
 * adapters. The engine level (token extraction, autocomplete provider, cache,
 * registry) is kind-agnostic: kinds are small adapters behind a common
 * interface, and the registry is data (kind prefixes, adapters, and the
 * dormant legacy-alias table), so adding a kind is a new adapter plus a
 * registration, never engine surgery.
 *
 * Slice 1 of the reference-engine-core task ships:
 *
 * 1. Token extraction (`#` at a token boundary, then a registered kind
 *    prefix, then the partial). Anything else defers to the built-in
 *    provider: a `#` heading, a mid-word `#`, code, or an unregistered kind
 *    never hijacks completion.
 * 2. The session-scoped in-memory reference cache behind a small cache
 *    interface (it doubles as the unit-test fake; the persistent sqlite
 *    store is a later ticket implementing the same interface).
 * 3. The task kind adapter: warmup (fire-and-forget `listTasks` pagination at
 *    `session_start`) plus local search (key prefix, key number prefix, and
 *    title substring, case-insensitive).
 * 4. The autocomplete provider wiring: registered on `#` at `session_start`,
 *    serving suggestions instantly from the warmed cache, and deferring to
 *    the built-in provider for every non-reference token (including
 *    zero-match partials and the no-credentials state).
 *
 * Slice 2 adds the stale-while-revalidate refresh:
 *
 * 5. Every reference query (`getSuggestions`) returns the cached view
 *    instantly, never awaiting an Aura fetch, and fires a background refresh
 *    (`refreshReferenceKind`) that runs the adapter's server-side search
 *    (`listTasks` with `search` for the typed partial) guarded by the
 *    request's abort signal and writes the fresh results through to the
 *    cache, so they surface on the next keystroke (pi-tui re-queries per
 *    keystroke and drops late results itself). A task outside the local
 *    cache window becomes findable by title substring one keystroke later.
 *    Transient failures are swallowed and without Aura credentials the
 *    refresh gate is off: no refresh is fired at all.
 *
 * The legacy `@AURA-` behavior is untouched: `aura-tasks.ts` still owns it in
 * parallel on its own trigger character. The alias table below is dormant
 * until the alias tickets register legacy syntaxes through it.
 *
 * Credentials: the task adapter talks to Aura through the shared AuraClient
 * (`createDefaultAuraClient`, which reads `aura.baseUrl` from settings plus
 * the Aura PAT from the OS keyring). When credentials are missing, warmup
 * no-ops and the provider defers; nothing ever throws into the session.
 *
 * Tests: the pure seams are unit-tested in
 * `extensions/aura-references.test.ts`. Run with:
 *
 *   node --experimental-strip-types extensions/aura-references.test.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Autocomplete types (minimal structural shapes, see aura-tasks.ts)
// ---------------------------------------------------------------------------
// `@earendil-works/pi-tui` exports AutocompleteItem / AutocompleteProvider /
// AutocompleteSuggestions, but this package only declares
// `@earendil-works/pi-coding-agent` as a peer dep: importing from pi-tui
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
// Reference items and the cache interface
// ---------------------------------------------------------------------------
// One cached entry per referenceable resource, keyed by (kind, id). `key` is
// the canonical token key the user inserts (a task's human key, e.g.
// "AURA-42", with the server's casing); `id` is the stable resource id the
// cache dedupes on. The persistent sqlite ticket stores these rows with a
// fetched_at timestamp behind this same interface.

/** A referenceable resource as the engine and adapters see it. */
export interface ReferenceItem {
  /** Registered kind this item belongs to (e.g. "task"). */
  kind: string;
  /** Stable resource id (cache dedupe key; a task's uuid). */
  id: string;
  /** Canonical token key inserted on selection (a task's human key). */
  key: string;
  /** Human-readable title (element text on expansion; searched by substring). */
  title: string;
  /** Workflow status, when the kind has one (shown in the row description). */
  status?: string;
}

/** A cache entry: the item plus when it was fetched (TTL awareness). */
export interface CacheEntry extends ReferenceItem {
  /** Epoch ms when this entry was written by the last cache write. */
  fetchedAt: number;
}

/**
 * The small cache interface the engine depends on. The in-memory
 * implementation below is this ticket's production cache and the unit-test
 * fake; the sqlite store is a later ticket implementing the same interface.
 *
 * Reads are by kind; query filtering lives in the engine's
 * `filterReferenceItems` (matching semantics are per-kind adapter knowledge,
 * not cache knowledge). Reads never drop stale entries:
 * stale-while-revalidate serves them and refreshes in the background.
 */
export interface ReferenceCache {
  /** All cached items for a kind, in write order. */
  read(kind: string): CacheEntry[];
  /** Upsert items for a kind (merge by item id), stamping fetchedAt. */
  write(kind: string, items: ReferenceItem[]): void;
  /** When the kind was last written (even an empty write), or null if never. */
  fetchedAt(kind: string): number | null;
}

/**
 * In-memory ReferenceCache: per-kind Maps keyed by item id, so writes merge
 * (upsert) and read order stays stable. `now` is injectable so tests control
 * the fetchedAt stamps.
 */
export function createInMemoryReferenceCache(now: () => number = Date.now): ReferenceCache {
  const buckets = new Map<string, Map<string, CacheEntry>>();
  const lastWrite = new Map<string, number>();
  return {
    read(kind) {
      const bucket = buckets.get(kind);
      return bucket ? Array.from(bucket.values()) : [];
    },
    write(kind, items) {
      let bucket = buckets.get(kind);
      if (!bucket) {
        bucket = new Map<string, CacheEntry>();
        buckets.set(kind, bucket);
      }
      const ts = now();
      lastWrite.set(kind, ts);
      for (const item of items) {
        // The bucket kind wins so an entry always agrees with its bucket.
        bucket.set(item.id, { ...item, kind, fetchedAt: ts });
      }
    },
    fetchedAt(kind) {
      return lastWrite.get(kind) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Kind adapters and the registry
// ---------------------------------------------------------------------------
// A kind adapter teaches the engine one resource kind: how to read a partial
// token, where to search locally and server-side, and how to render rows and
// expansions. The registry holds the adapters (kind prefix -> adapter) plus
// the dormant legacy-alias table, and compiles the `#` token pattern from the
// registered kind prefixes: registering a kind is data, not engine surgery.

/** One legacy alias: a dormant table entry. Legacy syntax registration
 *  (`@AURA-<n>`, `@rule:<name>`) arrives with the alias tickets; the table is
 *  empty in production wiring until then. The pattern is the full
 *  boundary-anchored token pattern (same shape as the engine's own token
 *  pattern) whose capture group 1 is the token text handed to the kind
 *  adapter: the partial the adapter searches while completing, and the full
 *  token it resolves on submit. Alias patterns therefore capture the full
 *  key minus the trigger char (e.g. `@(AURA-[^\\s]*)` for `@AURA-42`), so
 *  one group serves both uses. */
export interface LegacyAlias {
  pattern: RegExp;
  /** The kind adapter the alias maps to. */
  kind: string;
}

/** The common adapter interface every kind implements (arch spec contract for
 *  the dependent tickets). */
export interface KindAdapter {
  /** Registry key: the kind prefix typed after `#` (e.g. "task"). */
  readonly kind: string;
  /** Interpret the partial typed after `#kind:`. Return null to decline so
   *  the provider defers (kinds with restricted token shapes use this). */
  parsePartial(partial: string): string | null;
  /** Rank + format cached items for the autocomplete pane. */
  searchLocal(items: ReferenceItem[], partial: string): AutocompleteItem[];
  /** Server-side search for fresh items (the SWR slice merges these over
   *  local results). Silent on failure: returns []. */
  searchServer(
    partial: string,
    options?: { signal?: AbortSignal; limit?: number },
  ): Promise<ReferenceItem[]>;
  /** Render one item as an autocomplete row; `value` is the inserted token. */
  formatRow(item: ReferenceItem): AutocompleteItem;
  /** Render the inline expansion for a resolved item (the expansion slice
   *  wires this into the input handler). */
  formatExpansion(item: ReferenceItem): string;
  /** Resolve a fully typed token (e.g. "AURA-42") to an item: cache first,
   *  then a targeted server lookup. Null when unresolvable (left as typed). */
  resolveFullToken(token: string, cache: ReferenceCache): Promise<ReferenceItem | null>;
  /** Best-effort initial cache population at `session_start` (fire-and-
   *  forget; never rejects). Kinds without a server skip it. */
  warmup?(cache: ReferenceCache, options?: { signal?: AbortSignal }): Promise<void>;
}

/** The registry: kind prefixes, adapters, and the legacy alias table are
 *  data that extraction, filtering, and the provider dispatch through. */
export interface ReferenceRegistry {
  /** kind prefix -> adapter. */
  readonly kinds: ReadonlyMap<string, KindAdapter>;
  /** Legacy aliases, dormant (empty) until the alias tickets register them. */
  readonly aliases: readonly LegacyAlias[];
  /** Register a legacy token pattern mapped to a kind adapter (the arch-spec
   *  alias-registration contract the task-alias and rule tickets call). Once
   *  registered, the alias is recognized at the cursor and its mentions
   *  expand through the kind adapter, and the factory wiring arms the
   *  once-per-session deprecation warning (via `ctx.ui.notify`, never in the
   *  prompt). No alias is registered in production wiring in this ticket. */
  registerAlias(alias: LegacyAlias): void;
  /** Compiled token pattern over all registered kind prefixes: `#` at a token
   *  boundary, kind (case-insensitive), colon, partial (no whitespace), and
   *  the cursor at the end of the token. Group 1 = kind, group 2 = partial. */
  readonly tokenPattern: RegExp;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a registry from adapters (+ optional legacy aliases). The alias
 *  table stays mutable through `registerAlias` so legacy syntaxes can be
 *  registered after construction (the alias tickets' entry point). */
export function createReferenceRegistry(
  adapters: KindAdapter[],
  aliases: LegacyAlias[] = [],
): ReferenceRegistry {
  const kinds = new Map<string, KindAdapter>();
  for (const adapter of adapters) kinds.set(adapter.kind, adapter);
  const aliasTable: LegacyAlias[] = [...aliases];
  const prefixes = Array.from(kinds.keys()).map(escapeRegExp).join("|");
  // `#` must sit at a token boundary (start of line or after whitespace) so
  // headings and mid-word `#`s never match; the partial runs to the cursor
  // with no whitespace inside the token.
  const tokenPattern = prefixes === ""
    ? new RegExp("(?!)") // no adapters registered: the pattern never matches
    : new RegExp(`(?:^|[ \\t])#(${prefixes}):([^\\s]*)$`, "i");
  return {
    kinds,
    aliases: aliasTable,
    registerAlias(alias) {
      aliasTable.push(alias);
    },
    tokenPattern,
  };
}

/** A token extracted at the cursor: the registered kind, the partial after
 *  `#kind:`, and the raw typed text (without the leading boundary) used as
 *  the completion prefix. */
export interface ExtractedReferenceToken {
  kind: string;
  partial: string;
  raw: string;
}

/**
 * Extract the reference token ending at the cursor, or null when the text
 * before the cursor is not a reference token (so the caller defers to the
 * built-in provider). Dispatches through the registry: the compiled kind
 * pattern first, then the (dormant) legacy alias table.
 */
export function extractReferenceToken(
  textBeforeCursor: string,
  registry: ReferenceRegistry,
): ExtractedReferenceToken | null {
  const match = textBeforeCursor.match(registry.tokenPattern);
  if (match) {
    return {
      kind: (match[1] ?? "").toLowerCase(),
      partial: match[2] ?? "",
      raw: (match[0] ?? "").replace(/^[ \t]/, ""),
    };
  }
  // Legacy alias recognition hook. No alias is registered in this slice, so
  // this loop is dormant; the alias tickets register `@AURA-`/`@rule:` here
  // (plus the once-per-session deprecation warning) without engine surgery.
  // Group 1 is the token text handed to the kind adapter (see LegacyAlias):
  // the autocomplete partial here, the same full key on submit.
  for (const alias of registry.aliases) {
    const aliasMatch = textBeforeCursor.match(alias.pattern);
    if (aliasMatch) {
      return {
        kind: alias.kind,
        partial: aliasMatch[1] ?? "",
        raw: (aliasMatch[0] ?? "").replace(/^[ \t]/, ""),
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filtering / ranking (pure)
// ---------------------------------------------------------------------------

/** Maximum suggestions to render in the autocomplete pane at once. */
export const MAX_SUGGESTIONS = 20;

/**
 * Rank cached items against the typed partial: key-prefix matches first (the
 * common case: the user types part of the key), then title-substring matches,
 * capped at `max` suggestions. Matching is case-insensitive. An empty partial
 * yields the head of the cached order (the warmup writes tasks newest-first).
 *
 * `keyMatch` is the per-kind hook for resource-specific key forms: a task's
 * human key is matched both as a whole (`AUR`, `AURA-4`) and by its numeric
 * suffix (`42` finds `AURA-42`), while a wiki path or uuid key will match by
 * its own rule later. Returning true ranks the item with key-prefix matches.
 */
export function filterReferenceItems(
  items: ReferenceItem[],
  partial: string,
  max: number,
  keyMatch?: (item: ReferenceItem, query: string) => boolean,
): ReferenceItem[] {
  const query = partial.toLowerCase();
  if (query === "") return items.slice(0, max);
  const keyPrefixHit = (item: ReferenceItem): boolean =>
    (keyMatch ? keyMatch(item, query) : false) || item.key.toLowerCase().startsWith(query);
  const titleHit = (item: ReferenceItem): boolean => item.title !== "" && item.title.toLowerCase().includes(query);
  const keyMatches: ReferenceItem[] = [];
  const titleMatches: ReferenceItem[] = [];
  for (const item of items) {
    if (keyPrefixHit(item)) keyMatches.push(item);
    else if (titleHit(item)) titleMatches.push(item);
  }
  return keyMatches.concat(titleMatches).slice(0, max);
}

// ---------------------------------------------------------------------------
// Stale-while-revalidate refresh (pure)
// ---------------------------------------------------------------------------

/**
 * One background refresh for a query: the adapter's server-side search runs
 * for the typed partial and the results write through to the cache (upsert by
 * item id, so a server result replaces its cached twin and a server-only
 * match is added; the next query filters the merged cache). The caller never
 * awaits this: the provider returns the cached view first and the refresh
 * lands afterwards, so fresh results surface on the next keystroke.
 *
 * Pure in the arch-spec sense: the Aura access is the injected fetch (the
 * adapter's `searchServer`, whose `createClient` the caller controls) and the
 * cache is the injected cache; nothing else is touched. The refresh resolves
 * rather than rejects: a failed or empty server search (and an aborted
 * request) leaves the cache, items and stamps, exactly as it was, and nothing
 * ever throws into the session.
 */
export async function refreshReferenceKind(
  cache: ReferenceCache,
  adapter: KindAdapter,
  partial: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const signal = options.signal;
  // The request was already superseded (aborted) before the refresh started:
  // no fetch is fired at all.
  if (signal?.aborted) return;
  try {
    const results = await adapter.searchServer(partial, { signal });
    // The request was aborted while the fetch was in flight: the late results
    // are dropped, nothing is written after the abort.
    if (signal?.aborted) return;
    // Nothing fresh came back: a failed search returns [] (the adapter
    // swallows its own errors) or an empty server result. Either way the
    // cache stays as it is: no write, no fresh stamp.
    if (results.length === 0) return;
    cache.write(adapter.kind, results);
  } catch {
    // Transient failure (adapter search or cache write): the cached view
    // stays, and nothing throws into the session.
  }
}

// ---------------------------------------------------------------------------
// Inline expansion (pure): the prompt transform
// ---------------------------------------------------------------------------

/** Resolve one typed reference mention to an item, or null to leave it as
 *  typed. Production wiring passes the kind adapter's `resolveFullToken`
 *  (cache first, then the targeted server lookup), or null when resolution is
 *  unavailable for the whole session: without Aura credentials no targeted
 *  fetch may be attempted at all, so the input handler passes null and every
 *  mention stays as typed without any lookup call. */
export type ReferenceResolver = (
  kind: string,
  token: string,
) => Promise<ReferenceItem | null>;

/** One mention occurrence found in a submitted prompt: the registry kind it
 *  routes to, the typed token, and its [start, end) span in the prompt (the
 *  token only: the boundary whitespace before it is not part of the span). */
interface MentionOccurrence {
  kind: string;
  token: string;
  start: number;
  end: number;
}

/** Recompile an end-anchored token pattern (the registry's `tokenPattern` or
 *  a registered alias pattern: both match the token ending at the cursor) for
 *  whole-prompt scanning: the same source without its trailing `$` anchor,
 *  plus the global and multiline flags, so a mention anywhere in a multiline
 *  submitted prompt matches. */
function globalScanPattern(pattern: RegExp): RegExp {
  const anchored = pattern.source.endsWith("$") && !pattern.source.endsWith("\\$");
  const source = anchored ? pattern.source.slice(0, -1) : pattern.source;
  const flags = Array.from(new Set((pattern.flags + "gm").split(""))).join("");
  return new RegExp(source, flags);
}

/** Every mention occurrence in the prompt, in prompt order: `#kind:` tokens
 *  via the registry's compiled kind pattern, then legacy alias tokens via the
 *  registered alias patterns (whose capture group 1 is the token the kind
 *  adapter resolves; see LegacyAlias for the group contract). The boundary
 *  before a token (line start or one space/tab) is matched but not part of
 *  the token span; alias token shapes never start with whitespace (same
 *  contract as the engine's own tokens). */
function collectMentionOccurrences(
  prompt: string,
  registry: ReferenceRegistry,
): MentionOccurrence[] {
  const occurrences: MentionOccurrence[] = [];
  const scan = (pattern: RegExp, kindOf: (m: RegExpExecArray) => string, tokenOf: (m: RegExpExecArray) => string) => {
    for (const m of prompt.matchAll(globalScanPattern(pattern))) {
      const full = m[0];
      // The leading boundary alternative (`^`, which consumes nothing, or one
      // space/tab) is matched but is not part of the token.
      const boundaryLength = full.startsWith(" ") || full.startsWith("\t") ? 1 : 0;
      const start = (m.index ?? 0) + boundaryLength;
      occurrences.push({ kind: kindOf(m), token: tokenOf(m), start, end: start + full.length - boundaryLength });
    }
  };
  scan(registry.tokenPattern, (m) => (m[1] ?? "").toLowerCase(), (m) => m[2] ?? "");
  for (const alias of registry.aliases) {
    scan(alias.pattern, () => alias.kind, (m) => m[1] ?? "");
  }
  return occurrences.sort((a, b) => a.start - b.start);
}

/**
 * Expand every typed reference mention in a submitted prompt to its uniform
 * XML tag: each `#kind:` token (and each registered legacy alias token) is
 * resolved through the injected lookup and rendered by its kind adapter's
 * `formatExpansion`. Each unique mention (kind + token, case-insensitive) is
 * resolved exactly once and every occurrence of it expands. Unresolvable
 * references (unknown key, unregistered kind, null lookup result) are left
 * exactly as typed so the agent can resolve them via the `aura` skill. A
 * prompt without any mention passes through unchanged (the same string,
 * nothing resolved).
 *
 * Pure: the prompt, the registry, and the injected lookup are the only
 * inputs; the Aura access lives entirely inside the lookup.
 */
export async function expandReferenceMentions(
  prompt: string,
  registry: ReferenceRegistry,
  lookup: ReferenceResolver | null,
): Promise<string> {
  const occurrences = collectMentionOccurrences(prompt, registry);
  if (occurrences.length === 0 || lookup === null) return prompt;

  // One resolution per unique (kind, token); duplicate mentions share it.
  const expansions = new Map<string, string | null>();
  const seen = new Set<string>();
  for (const o of occurrences) {
    const dedupeKey = mentionKey(o);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    expansions.set(dedupeKey, await resolveMention(o, registry, lookup));
  }

  let out = "";
  let pos = 0;
  for (const o of occurrences) {
    if (o.start < pos) continue; // overlapping match: the earlier one wins
    out += prompt.slice(pos, o.start);
    out += expansions.get(mentionKey(o)) ?? prompt.slice(o.start, o.end);
    pos = o.end;
  }
  out += prompt.slice(pos);
  return out;
}

/** Case-insensitive identity of a mention within one prompt (the same token
 *  typed twice, in any casing, is one resolution). */
function mentionKey(o: MentionOccurrence): string {
  return o.kind + "\u0000" + o.token.toLowerCase();
}

/** Resolve one mention to its expansion text, or null to leave it as typed:
 *  an unregistered kind, an unresolvable token, or a lookup that rejects (a
 *  failed targeted fetch never throws into the session). */
async function resolveMention(
  o: MentionOccurrence,
  registry: ReferenceRegistry,
  lookup: ReferenceResolver,
): Promise<string | null> {
  const adapter = registry.kinds.get(o.kind);
  if (!adapter) return null;
  try {
    const item = await lookup(o.kind, o.token);
    return item === null ? null : adapter.formatExpansion(item);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-turn system-prompt instruction (the <task-ref> block)
// ---------------------------------------------------------------------------

/** Slim per-turn system-prompt block that teaches the model what the
 *  `<task-ref>` tags mean and where to go to act on a referenced task.
 *  Injected via `before_agent_start` (the same hook `aura-tasks.ts` and
 *  `aura-skill-instruction.ts` use); pi rebuilds the base system prompt each
 *  turn, so appending here re-applies cleanly without accumulating across
 *  the session.
 *
 *  Kept deliberately short: the tag is self-describing (labelled attributes
 *  + element text), so this only names the parts and points at the `aura`
 *  skill for anything beyond reading the reference. `aura-tasks.ts` keeps
 *  its own `<aura-task>` block until the task-alias ticket removes it; the
 *  interim double instruction block is accepted. */
export const TASK_REF_INSTRUCTION = `
## Aura task references

User messages may contain inline Aura task references rendered as tagged elements:

  <task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>

- \`key\` is the task's human-readable identifier (e.g. \`AURA-42\`).
- \`status\` is its current Aura workflow status (e.g. \`OPEN\`, \`IN_REVIEW\`, \`DONE\`).
- The element text is the task title.

These references carry only the key, status, and title, never the task body. To read the full task, update it, or take any action on it, use the \`aura\` skill (load its SKILL.md with the \`read\` tool) and the aura-mcp-dev MCP tools; do not infer further task details from the reference alone.
`;

// ---------------------------------------------------------------------------
// Task kind adapter (the first kind)
// ---------------------------------------------------------------------------

/** The task kind prefix typed after `#` (`#task:AURA-42`). */
export const TASK_KIND = "task";

/**
 * Maximum number of tasks pulled for the autocomplete cache. Aura caps a page
 * at 100; we page up to this many so a member of many tasks still gets broad
 * coverage without an unbounded fetch. Newest-first by `updated_at desc` so
 * the freshest tasks land in the cache head.
 */
export const MAX_TASKS = 500;

/** Page size for `listTasks` (Aura's max is 100). */
export const PAGE_SIZE = 100;

/** The subset of a task the engine reads (mirrors the shared client's Task
 *  without importing it). */
export interface TaskSummary {
  id: string;
  human_key: string;
  title: string;
  status: string;
}

/** Query options for the structural listTasks (mirrors the shared client's
 *  ListTasksInput loosely; the real client satisfies this structurally). */
export interface TaskListQuery {
  status?: string;
  /** The API takes "false"|"true"|"all"; the shared ListTasksInput still types
   *  `archived` as boolean, so this structural copy types it unknown (the same
   *  interface-widening cast aura-tasks.ts makes, without the cast). */
  archived?: unknown;
  limit?: number;
  page?: number;
  sort_by?: string;
  sort_dir?: string;
  search?: string;
  [k: string]: unknown;
}

/**
 * The structural subset of the shared AuraClient the task adapter needs.
 * Deliberately structural (no import of `@pi-aura/shared/aura-client`): the
 * client is only imported live inside the extension factory via the
 * dynamic-import seam, which keeps `node --experimental-strip-types` runnable.
 */
export interface TaskAuraClient {
  listTasks(opts?: TaskListQuery): Promise<{ items: TaskSummary[]; pagination: unknown }>;
  getTaskByHumanKey(key: string): Promise<TaskSummary>;
}

/** Escape a string for use as an XML attribute value: `"` -> `&quot;`,
 *  `&` -> `&amp;`, `<` -> `&lt;`. (The entities are spelled via
 *  concatenation so no tooling in the chain can unescape them.) */
function escapeAttr(value: string): string {
  const AMP = "&";
  return value
    .replace(/&/g, AMP + "amp;")
    .replace(/</g, AMP + "lt;")
    .replace(/"/g, AMP + "quot;");
}

/** Escape a string for use as XML element text: `&` -> `&amp;`,
 *  `<` -> `&lt;`. */
function escapeText(value: string): string {
  const AMP = "&";
  return value
    .replace(/&/g, AMP + "amp;")
    .replace(/</g, AMP + "lt;");
}

/** The numeric suffix of a task key (`AURA-42` -> `42`), so `42` and `424`
 *  both find AURA-42-family keys (partial numbers work; user story 9). */
function taskKeyNumber(key: string): string {
  const dash = key.indexOf("-");
  return dash === -1 ? key : key.slice(dash + 1);
}

/**
 * The task kind adapter: warmup (`listTasks` pagination into the cache) plus
 * local search (key prefix, key number prefix, and title substring,
 * case-insensitive). Aura access goes through the injectable `createClient`
 * factory: production wiring passes the dynamic-imported
 * `createDefaultAuraClient`, tests pass fakes.
 */
export function createTaskAdapter(options: {
  createClient: () => Promise<TaskAuraClient>;
}): KindAdapter {
  const { createClient } = options;

  const toReferenceItem = (task: TaskSummary): ReferenceItem => ({
    kind: TASK_KIND,
    id: task.id,
    key: task.human_key,
    title: task.title,
    status: task.status,
  });

  const formatRow = (item: ReferenceItem): AutocompleteItem => ({
    // The value doubles as the inserted token: `#task:` plus the canonical
    // (server-cased) human key, so selection inserts `#task:AURA-42` however
    // the user typed the partial.
    value: `#${TASK_KIND}:${item.key}`,
    label: `#${TASK_KIND}:${item.key}`,
    description: (item.status ? `[${item.status}] ${item.title}` : item.title).trim(),
  });

  return {
    kind: TASK_KIND,

    // Tasks accept any non-space partial after `#task:`.
    parsePartial(partial) {
      return partial;
    },

    searchLocal(items, partial) {
      return filterReferenceItems(
        items,
        partial,
        MAX_SUGGESTIONS,
        (item, query) => taskKeyNumber(item.key).toLowerCase().startsWith(query),
      ).map(formatRow);
    },

    async searchServer(partial, searchOptions = {}) {
      try {
        const client = await createClient();
        const res = await client.listTasks({
          search: partial,
          status: "ALL",
          archived: "all",
          limit: searchOptions.limit ?? MAX_SUGGESTIONS,
          sort_by: "updated_at",
          sort_dir: "desc",
        });
        if (searchOptions.signal?.aborted) return [];
        return res.items.map(toReferenceItem);
      } catch {
        // Missing credentials or a failed search: the SWR merge gets nothing
        // fresh and skips the write; the session is never disturbed.
        return [];
      }
    },

    formatRow,

    formatExpansion(item) {
      return `<task-ref key="${escapeAttr(item.key)}" status="${escapeAttr(item.status ?? "")}">${escapeText(item.title)}</task-ref>`;
    },

    async resolveFullToken(token, cache) {
      // Resolve cache-first...
      const lower = token.toLowerCase();
      const hit = cache.read(TASK_KIND).find((item) => item.key.toLowerCase() === lower);
      if (hit) return hit;
      // ...then via the targeted by-key lookup (matches case-insensitively).
      try {
        const client = await createClient();
        return toReferenceItem(await client.getTaskByHumanKey(token));
      } catch {
        // Missing credentials, 404/403, or network: leave the reference as
        // typed so the agent can resolve it via the `aura` skill.
        return null;
      }
    },

    async warmup(cache, warmupOptions = {}) {
      try {
        const client = await createClient();
        let page = 1;
        let collected = 0;
        while (collected < MAX_TASKS) {
          if (warmupOptions.signal?.aborted) return;
          // `status: "ALL"` spans open + archived statuses; `archived: "all"`
          // also surfaces archived tasks (see TaskListQuery on the typing).
          const res = await client.listTasks({
            status: "ALL",
            archived: "all",
            limit: PAGE_SIZE,
            page,
            sort_by: "updated_at",
            sort_dir: "desc",
          });
          const mapped = res.items.map(toReferenceItem);
          // Write page by page so partial progress (later page failure or an
          // abort mid-flight) still lands.
          cache.write(TASK_KIND, mapped);
          collected += mapped.length;
          if (res.items.length < PAGE_SIZE) return;
          page += 1;
        }
      } catch {
        // Missing credentials (createDefaultAuraClient throws) or a failed
        // page: warmup is best-effort. Whatever pages landed stay cached; the
        // session is never disturbed and the provider keeps deferring until
        // data exists. Credentials appearing later in the session do not
        // retry: warmup is one-shot at session_start (this slice's contract).
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Autocomplete provider wiring (the `#` overlay)
// ---------------------------------------------------------------------------

/**
 * Wrap the built-in provider with the reference engine: a `#` token at a
 * token boundary whose kind is registered serves suggestions instantly from
 * the cache (no Aura fetch is ever awaited here); every non-reference token
 * (headings, mid-word `#`, unregistered kinds, zero-match partials, and the
 * no-credentials or empty-cache state) defers to the built-in provider so
 * file completion and other overlays are never clobbered.
 */
export function createReferenceAutocompleteProvider(
  current: AutocompleteProvider,
  registry: ReferenceRegistry,
  getCache: () => ReferenceCache | null,
  refreshOptions: { canRefresh?: () => boolean } = {},
): AutocompleteProvider {
  // The background-refresh gate. Production wiring latches the no-credentials
  // state (createDefaultAuraClient() throws) and passes a gate that is off for
  // the whole session, so a credential-less session fires no refresh at all.
  const canRefresh = refreshOptions.canRefresh ?? (() => true);
  return {
    triggerCharacters: ["#"],
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const token = extractReferenceToken(beforeCursor, registry);
      if (token === null) {
        // Not a reference token: defer (don't clobber pi's built-in syntaxes).
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      const adapter = registry.kinds.get(token.kind);
      if (!adapter) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      const cache = getCache();
      if (cache === null) {
        // Missing credentials state: defer for the whole session.
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      const partial = adapter.parsePartial(token.partial);
      if (partial === null) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      // Stale-while-revalidate: the cached rows below go out instantly, and
      // this same query fires the background refresh (never awaited here)
      // that writes the fresh server results through to the cache, so they
      // surface on the next keystroke. The refresh is guarded by this
      // request's abort signal (pi-tui aborts superseded requests), so an
      // aborted query stops its work and writes nothing. Without Aura
      // credentials the gate is off and no refresh is fired at all.
      if (canRefresh()) {
        void refreshReferenceKind(cache, adapter, partial, { signal: options.signal });
      }
      const rows = adapter.searchLocal(cache.read(adapter.kind), partial);
      if (rows.length === 0) {
        // Zero-match partial: defer to the built-in provider.
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      return { items: rows, prefix: token.raw };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      // Defer to the built-in provider's decision unless we're actively
      // completing a reference token.
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      if (extractReferenceToken(beforeCursor, registry) !== null) return false;
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

// ---------------------------------------------------------------------------
// Dynamic-import seam (same pattern as aura-tasks.ts loadTasks)
// ---------------------------------------------------------------------------

/**
 * Create the shared Aura client. Dynamic import: `@pi-aura/shared/aura-client`
 * uses .js extension specifiers internally, which Node's experimental
 * strip-types loader cannot resolve. Pi's extension runtime handles static
 * imports, so we dynamic-import the client factory here to keep the
 * unit-test entry point runnable with `node --experimental-strip-types`.
 */
async function createDefaultClient(): Promise<TaskAuraClient> {
  const { createDefaultAuraClient } = await import("@pi-aura/shared/aura-client");
  return createDefaultAuraClient();
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  const taskAdapter = createTaskAdapter({ createClient: createDefaultClient });
  // No legacy alias is registered in production wiring: the alias table is
  // empty until the task-alias and rule tickets register `@AURA-` / `@rule:`
  // through the registry's alias API.
  const registry = createReferenceRegistry([taskAdapter]);
  // The session cache lives from session_start on. It starts empty (the
  // provider defers on an empty cache) and is populated by the fire-and-forget
  // warmup. A /reload re-emits session_start and swaps in a fresh cache.
  let sessionCache: ReferenceCache | null = null;
  // Latched once per session by the probe below (credentials appearing later
  // do not re-arm until /reload): without Aura credentials no targeted
  // expansion fetch may be attempted at all.
  let clientAvailable = false;

  pi.on("session_start", async (_event, ctx) => {
    // The SWR refresh gate: off until one client build succeeds in this
    // session. Detection is the same createDefaultAuraClient() throw the
    // warmup relies on, probed once here: without credentials (no baseUrl or
    // no PAT in the keyring) no refresh is fired at all. Like the warmup,
    // this is one-shot: credentials appearing later in the session do not
    // re-arm the gate until a /reload re-emits session_start. The same
    // success latches `clientAvailable` for the expansion lookup.
    let refreshAllowed = false;
    void createDefaultClient()
      .then(() => {
        refreshAllowed = true;
        clientAvailable = true;
      })
      .catch(() => {
        // No credentials: the gate stays off for the whole session; the
        // provider defers on the empty cache exactly as in slice 1.
      });

    ctx.ui.addAutocompleteProvider((current) =>
      createReferenceAutocompleteProvider(current, registry, () => sessionCache, {
        canRefresh: () => refreshAllowed,
      }),
    );

    const cache = createInMemoryReferenceCache();
    sessionCache = cache;

    // Fire-and-forget warmup for every registered kind that has one. Missing
    // credentials and fetch failures are swallowed inside the adapter: the
    // cache stays empty and the provider keeps deferring (no crash, no
    // retry) for the rest of the session.
    for (const adapter of registry.kinds.values()) {
      void Promise.resolve()
        .then(() => adapter.warmup?.(cache))
        .catch(() => {
          // warmup already swallows its own failures; this guard keeps a
          // session-start handler from ever rejecting into the session.
        });
    }
  });

  // Inline expansion on submit: every typed `#kind:` mention resolves
  // cache-first via its kind adapter (`resolveFullToken`, then the targeted
  // getTaskByHumanKey fallback) and expands to the uniform tag. Unresolvable
  // references stay exactly as typed. Without Aura credentials (or before
  // the one-shot probe resolves) no targeted fetch may be attempted at all:
  // null is passed as the lookup and the transform leaves every mention as
  // typed without resolving anything.
  pi.on("input", async (event) => {
    const cache = sessionCache;
    if (cache === null) return;
    const text = await expandReferenceMentions(
      event.text,
      registry,
      clientAvailable
        ? (kind, token) => {
            const adapter = registry.kinds.get(kind);
            return adapter ? adapter.resolveFullToken(token, cache) : Promise.resolve(null);
          }
        : null,
    );
    if (text === event.text) return; // unchanged: pass through
    return { action: "transform", text };
  });

  // Teach the model what the `<task-ref>` tags mean and that it must reach
  // for the `aura` skill to act on a referenced task. Appended every turn
  // (pi rebuilds the base system prompt each turn, so this never accumulates).
  pi.on("before_agent_start", async (event, _ctx) => {
    return { systemPrompt: event.systemPrompt + "\n" + TASK_REF_INSTRUCTION };
  });
}
