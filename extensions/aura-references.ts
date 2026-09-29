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
// Extension factory
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    // Registered per slice; wiring lands with the provider in this slice.
    void ctx;
  });
}
