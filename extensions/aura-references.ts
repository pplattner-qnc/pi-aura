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
 *  pattern) whose capture group 1 is the partial the kind adapter searches. */
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

/** The registry: kind prefixes, adapters, and the dormant alias table are
 *  data that extraction, filtering, and the provider dispatch through. */
export interface ReferenceRegistry {
  /** kind prefix -> adapter. */
  readonly kinds: ReadonlyMap<string, KindAdapter>;
  /** Legacy aliases, dormant (empty) until the alias tickets register them. */
  readonly aliases: readonly LegacyAlias[];
  /** Compiled token pattern over all registered kind prefixes: `#` at a token
   *  boundary, kind (case-insensitive), colon, partial (no whitespace), and
   *  the cursor at the end of the token. Group 1 = kind, group 2 = partial. */
  readonly tokenPattern: RegExp;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a registry from adapters (+ optional legacy aliases). */
export function createReferenceRegistry(
  adapters: KindAdapter[],
  aliases: LegacyAlias[] = [],
): ReferenceRegistry {
  const kinds = new Map<string, KindAdapter>();
  for (const adapter of adapters) kinds.set(adapter.kind, adapter);
  const prefixes = Array.from(kinds.keys()).map(escapeRegExp).join("|");
  // `#` must sit at a token boundary (start of line or after whitespace) so
  // headings and mid-word `#`s never match; the partial runs to the cursor
  // with no whitespace inside the token.
  const tokenPattern = prefixes === ""
    ? new RegExp("(?!)") // no adapters registered: the pattern never matches
    : new RegExp(`(?:^|[ \\t])#(${prefixes}):([^\\s]*)$`, "i");
  return { kinds, aliases, tokenPattern };
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
        // Missing credentials or a failed search: the SWR merge (next slice)
        // just gets nothing fresh; the session is never disturbed.
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
): AutocompleteProvider {
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
  const registry = createReferenceRegistry([taskAdapter]);
  // The session cache lives from session_start on. It starts empty (the
  // provider defers on an empty cache) and is populated by the fire-and-forget
  // warmup. A /reload re-emits session_start and swaps in a fresh cache.
  let sessionCache: ReferenceCache | null = null;

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) =>
      createReferenceAutocompleteProvider(current, registry, () => sessionCache),
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
}
