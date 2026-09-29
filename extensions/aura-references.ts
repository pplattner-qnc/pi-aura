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
 *    store of the reference-cache-sqlite ticket is the production backing
 *    and implements the same interface).
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
 * Slice 3 adds inline expansion, the per-turn instruction, and the alias
 * registry API:
 *
 * 6. On submit (`input`), every typed `#kind:` mention (and every registered
 *    legacy-alias mention) resolves cache-first through its kind adapter
 *    (`resolveFullToken`, then the targeted `getTaskByHumanKey` fallback)
 *    and expands in place to the uniform tag. Unresolvable references stay
 *    exactly as typed so the agent can resolve them via the `aura` skill.
 *    Without Aura credentials no targeted fetch is attempted at all.
 * 7. The system prompt gains a slim per-turn instruction block
 *    (REFERENCE_INSTRUCTION; task-ref shape then, task-ref + rule-ref
 *    shapes since the rule-kind ticket) pointing at the `aura` skill,
 *    appended via `before_agent_start` (pi
 *    rebuilds the base prompt each turn, so the append never accumulates).
 * 8. The alias registry API: `registerAlias` maps a legacy token
 *    pattern to a kind adapter and `createDeprecationWarningDecision`
 *    arms the once-per-session deprecation warning (surfaced via
 *    `ctx.ui.notify`, user-only, never in the prompt).
 *
 * The task-alias ticket (reference-task-alias) made `@AURA-` the first
 * production alias: registered at factory setup through
 * `createAuraTaskAlias`, it offers the same task suggestions while typing
 * `@AURA-<partial>` but inserts the legacy `@AURA-<number>` token on
 * selection (the user stays in the syntax they typed; the warning teaches
 * the new one), expands through the task adapter to the same `<task-ref>`
 * tag as `#task:`, and fires the once-per-session deprecation warning on
 * the first submitted legacy mention. `aura-tasks.ts` shrank to its
 * reachability probe in the same landing (atomicity: no state where two
 * code paths transform the same mention), so this engine's instruction
 * block is the only task-reference block in the system prompt.
 *
 * The reference-cache-sqlite ticket swaps the production cache backing to
 * the persistent sqlite store (see `createSessionCache` below): `node:sqlite`
 * (`DatabaseSync`) in WAL journal mode at `~/.pi/agent/aura-reference-cache.db`,
 * one table keyed by (base_url, kind, id), shared by all pi sessions as a
 * plain file. Autocomplete behavior is unchanged except that it persists
 * across sessions; the in-memory implementation remains the unit-test fake
 * and the silent fallback for a database that cannot be opened.
 *
 * The reference-rule-kind task made `#rule:` the second kind and the
 * first local-only one: the rule adapter reuses rule loading from
 * `engineering-rules.ts` (`loadRules` + the `Rule` type; no frontmatter
 * parsing is reimplemented), searches the loaded rules by name substring,
 * expands to `<rule-ref name attach>display-title</rule-ref>`, and marks
 * itself `local` so the factory's expansion gate exempts it (rules resolve
 * in a credential-less session; they never touch the cache or Aura).
 * Because rules are cwd-local they ride engine memory, not the persistent
 * cache: the factory loads them per session and hands them to the adapter
 * through an accessor. The engineering-rules `before_agent_start` resolver
 * still injects mentioned rule bodies, matching raw `#rule:` tokens AND the
 * expanded `<rule-ref>` elements this engine's input transform leaves in
 * the prompt (the transform runs before `before_agent_start`). The legacy
 * `@rule:` autocomplete stays in `engineering-rules.ts` until the second
 * slice registers `@rule:` as the second production alias and deletes the
 * old provider in the same atomic landing.
 *
 * Credentials: the task adapter talks to Aura through the shared AuraClient
 * (`createDefaultAuraClient`, which reads `aura.baseUrl` from settings plus
 * the Aura PAT from the OS keyring). When credentials are missing, warmup
 * no-ops and the provider defers; nothing ever throws into the session.
 * Rule references never need credentials (local kind).
 *
 * Tests: the pure seams are unit-tested in
 * `extensions/aura-references.test.ts`. Run with:
 *
 *   node --experimental-strip-types extensions/aura-references.test.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadRules, type Rule } from "./engineering-rules.ts";

// ---------------------------------------------------------------------------
// Autocomplete types (minimal structural shapes, see engineering-rules.ts)
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
 * implementation below is the unit-test fake; the persistent sqlite store
 * (`aura-reference-cache.ts`) is the production cache and implements the
 * same interface, silently falling back to this in-memory implementation
 * when its database cannot be opened.
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
 * the fetchedAt stamps. The unit-test fake for the engine, and the
 * session-scoped fallback when the sqlite store cannot be built.
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

/** One legacy alias: a registered legacy token pattern mapped to a kind
 *  adapter (`@AURA-<digits>` is the first production alias, registered via
 *  createAuraTaskAlias; `@rule:<name>` arrives with the rule ticket). The
 *  pattern is the full boundary-anchored token pattern (same shape as the
 *  engine's own token pattern) whose capture group 1 is the token text
 *  handed to the kind adapter: the partial the adapter searches while
 *  completing, and the full key it resolves on submit. Alias patterns
 *  therefore capture the full key minus the trigger char (the production
 *  `@AURA-` pattern `(?:^|[ \t])@(AURA-\d+)\b$` captures `AURA-42` for
 *  `@AURA-42`), so one group serves both uses. */
export interface LegacyAlias {
  pattern: RegExp;
  /** The kind adapter the alias maps to. */
  kind: string;
  /** Rank + format cached items as legacy-syntax autocomplete rows; each
   *  row's value is the legacy token inserted on selection (e.g.
   *  `@AURA-42`), so the user stays in the syntax they typed while the
   *  deprecation warning teaches the new one. Falls back to the kind
   *  adapter's searchLocal (new-syntax rows) when omitted. */
  searchLocal?: (items: ReferenceItem[], partial: string) => AutocompleteItem[];
}

/** The common adapter interface every kind implements (arch spec contract for
 *  the dependent tickets). */
export interface KindAdapter {
  /** Registry key: the kind prefix typed after `#` (e.g. "task"). */
  readonly kind: string;
  /** Local-only kind (the rule kind is the first): search, resolution, and
   *  warmup never touch a server or credentials, so the factory's expansion
   *  gate exempts local kinds (rule mentions resolve in a credential-less
   *  session) and their items never ride the persistent cache (rule loading
   *  is cwd-local; persisting rows would cross-contaminate repos). */
  readonly local?: boolean;
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
  /** Registered legacy aliases (`@AURA-<digits>` today; `@rule:` arrives
   *  with the rule ticket). */
  readonly aliases: readonly LegacyAlias[];
  /** Register a legacy token pattern mapped to a kind adapter (the arch-spec
   *  alias-registration contract the rule ticket calls for `@rule:`). Once
   *  registered, the alias is recognized at the cursor and its mentions
   *  expand through the kind adapter, and the factory wiring arms the
   *  once-per-session deprecation warning (via `ctx.ui.notify`, never in the
   *  prompt). The production wiring registers `@AURA-` through
   *  `createAuraTaskAlias`. */
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

/**
 * The once-per-session deprecation-warning decision (the arch-spec alias
 * contract's second half): a latched decision the factory consults when a
 * submitted prompt contains a legacy-alias mention. The first call says
 * "warn now"; every later call in the same session says no, so the user sees
 * the deprecation warning exactly once per session. The factory builds a
 * fresh decision per `session_start`, which is what resets the flag per
 * session (a `/reload` re-emits `session_start` and re-arms it).
 *
 * The warning itself is user-only: the wiring surfaces it via `ctx.ui.notify`
 * and nothing is ever added to the prompt sent to the model.
 */
export function createDeprecationWarningDecision(): () => boolean {
  let warned = false;
  return () => {
    if (warned) return false;
    warned = true;
    return true;
  };
}

/** A token extracted at the cursor: the registered kind, the partial after
 *  `#kind:` (or the alias group 1 token text for a legacy-alias mention),
 *  the raw typed text (without the leading boundary) used as the
 *  completion prefix, and the matched alias registration when the token
 *  came from an alias pattern (the autocomplete provider uses its
 *  searchLocal hook to insert the legacy token on selection). */
export interface ExtractedReferenceToken {
  kind: string;
  partial: string;
  raw: string;
  alias?: LegacyAlias;
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
  // Legacy alias recognition: each registered alias pattern gets the same
  // cursor-anchored treatment as the compiled kind pattern. Group 1 is the
  // token text handed to the kind adapter (see LegacyAlias): the
  // autocomplete partial here, the same full key on submit. The matched
  // registration rides along so the provider can format legacy rows.
  for (const alias of registry.aliases) {
    const aliasMatch = textBeforeCursor.match(alias.pattern);
    if (aliasMatch) {
      return {
        kind: alias.kind,
        partial: aliasMatch[1] ?? "",
        raw: (aliasMatch[0] ?? "").replace(/^[ \t]/, ""),
        alias,
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

/** Does the prompt contain a legacy-alias mention? The deprecation-warning
 *  trigger: the input handler consults this (plus the once-per-session
 *  decision) on every submitted prompt and notifies through `ctx.ui.notify`
 *  only when both say yes. Pure: the prompt and the registry's alias table
 *  (the mention's resolvability is irrelevant; an unknown `@AURA-999` warns
 *  too). */
export function promptHasLegacyMention(prompt: string, registry: ReferenceRegistry): boolean {
  return registry.aliases.some((alias) => globalScanPattern(alias.pattern).test(prompt));
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
// Per-turn system-prompt instruction (the <task-ref> + <rule-ref> block)
// ---------------------------------------------------------------------------

/** Slim per-turn system-prompt block that teaches the model what the
 *  reference tags mean and where to go to act on a referenced resource.
 *  Injected via `before_agent_start` (the same hook
 *  `aura-skill-instruction.ts` uses); pi rebuilds the base system prompt
 *  each turn, so appending here re-applies cleanly without accumulating
 *  across the session.
 *
 *  Kept deliberately short: the tags are self-describing (labelled attributes
 *  + element text), so this only names the parts and points at the `aura`
 *  skill for anything beyond reading a task reference. This is the only
 *  reference instruction block: the old extension's `<aura-task>` block
 *  was deleted together with its `@AURA-` handling (task-alias ticket),
 *  and rule references carry their body in the system prompt already
 *  (the engineering-rules mention injection). */
export const REFERENCE_INSTRUCTION = `
## Inline references

User messages may contain inline references rendered as tagged elements:

  <task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>
  <rule-ref name="tracker-aura" attach="manual">Tracker Aura</rule-ref>

Task references carry only the key, status, and title, never the task body. \`key\` is the task's human-readable identifier (e.g. \`AURA-42\`), \`status\` its current Aura workflow status (e.g. \`OPEN\`, \`IN_REVIEW\`, \`DONE\`), and the element text is the task title. To read the full task, update it, or take any action on it, use the \`aura\` skill (load its SKILL.md with the \`read\` tool) and the aura-mcp-dev MCP tools; do not infer further task details from the reference alone.

Rule references carry the rule's \`name\`, how it attaches (\`attach\`: \`manual\`, \`always\`, or \`glob\` with its patterns), and the rule's display title as the element text. The referenced rule's body is injected into the system prompt for this turn; honor it without further action.
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
   *  `archived` as boolean, so this structural copy types it unknown (the
   *  same interface-widening the deleted `@AURA-` handling in aura-tasks.ts
   *  made with an index-signature cast, without the cast). */
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
// Rule kind adapter (the first local-only kind)
// ---------------------------------------------------------------------------

/** The rule kind prefix typed after `#` (`#rule:<name>`). */
export const RULE_KIND = "rule";

/** Map one loaded `Rule` to the engine's reference item. `id` is the
 *  relPath (stable and unique across subdirectories), `key` the rule name
 *  (the token key: `#rule:<name>` resolves by it), `title` the display
 *  title (frontmatter name falling back to the rule name; the element text
 *  on expansion), and `status` the attach summary (the row description's
 *  source and the `attach` attribute on expansion). */
export function ruleToReferenceItem(rule: Rule): ReferenceItem {
  return {
    kind: RULE_KIND,
    id: rule.relPath,
    key: rule.name,
    title: rule.displayName ?? rule.name,
    status: rule.globs.length > 0 ? `glob: ${rule.globs.join(", ")}` : rule.attach,
  };
}

/** Filter rule items by rule-name substring (case-insensitive), in loaded
 *  order, capped at `max`. Rules are matched by name, never by display
 *  title (the spec's "matching by name substring"), so `#rule:track` finds
 *  `tracker-aura` while a display-title-only hit does not. */
export function filterRuleItems(
  items: ReferenceItem[],
  partial: string,
  max: number = MAX_SUGGESTIONS,
): ReferenceItem[] {
  const query = partial.toLowerCase();
  if (query === "") return items.slice(0, max);
  return items.filter((item) => item.key.toLowerCase().includes(query)).slice(0, max);
}

/** The rule kind adapter: local-only. Search filters the session's loaded
 *  rules by name substring; resolution matches by name; expansion emits the
 *  prototype-pinned `<rule-ref name attach>display-title</rule-ref>` tag.
 *
 *  Rules ride engine memory, not the reference cache: they are loaded from
 *  the session's cwd (`<cwd>/.cursor/rules/`) and persisting rows would
 *  cross-contaminate repos, so the factory loads them per session (the
 *  cheap local equivalent of warmup) and hands them over through the
 *  injected `getRules` accessor. `searchLocal` and `resolveFullToken`
 *  therefore ignore the cache items they are handed; `searchServer` has
 *  nothing to ask (returns []) and there is no warmup. */
export function createRuleAdapter(options: { getRules: () => Rule[] }): KindAdapter {
  const { getRules } = options;

  const formatRow = (item: ReferenceItem): AutocompleteItem => ({
    // The value doubles as the inserted token: `#rule:` plus the canonical
    // rule name, so selection inserts `#rule:<name>` however the user typed
    // the partial. The description carries the attach mode (with the glob
    // patterns for glob rules), matching the information the legacy
    // `@rule:` rows carry.
    value: `#${RULE_KIND}:${item.key}`,
    label: `#${RULE_KIND}:${item.key}`,
    description: `(${item.status ?? "manual"})`,
  });

  return {
    kind: RULE_KIND,
    local: true,

    // Rules accept any non-space partial after `#rule:`.
    parsePartial(partial) {
      return partial;
    },

    searchLocal(_items, partial) {
      return filterRuleItems(getRules().map(ruleToReferenceItem), partial).map(formatRow);
    },

    async searchServer() {
      // Rules are local-only: there is no server to search (the SWR
      // refresh no-ops on the empty result and writes nothing).
      return [];
    },

    formatRow,

    formatExpansion(item) {
      return `<rule-ref name="${escapeAttr(item.key)}" attach="${escapeAttr(item.status ?? "")}">${escapeText(item.title)}</rule-ref>`;
    },

    async resolveFullToken(token) {
      // Local name match, case-insensitive; the passed cache is never
      // consulted (rules are cwd-local, no cache rows). Null when the name
      // resolves to nothing, so the mention stays as typed upstream.
      const lower = token.toLowerCase();
      const rule = getRules().find((r) => r.name.toLowerCase() === lower);
      return rule ? ruleToReferenceItem(rule) : null;
    },
  };
}

// ---------------------------------------------------------------------------
// The `@AURA-<digits>` legacy alias (the first production alias)
// ---------------------------------------------------------------------------

/** Build the `@AURA-<digits>` legacy alias registration: the syntax the old
 *  aura-tasks extension owned keeps working through the engine, mapped to
 *  the task kind. Capture group 1 is the full key minus the trigger char
 *  (`AURA-42`), per the alias capture-group contract, so one group serves
 *  autocomplete (the partial while typing) and submit (the full key to
 *  resolve). Autocomplete ranks through the engine's filterReferenceItems:
 *  the alias partial is the full key shape (`AURA-4` while typing
 *  `@AURA-4`), which plain key-prefix matching ranks, so no per-kind keyMatch
 *  adaptation is needed (digits-only partials never arise through the
 *  alias). Rows reuse the task adapter's formatRow description (status +
 *  title) with the legacy token as value/label, so selection inserts
 *  `@AURA-42` (the user stays in the syntax they typed; the deprecation
 *  warning teaches the new one). */
export function createAuraTaskAlias(taskAdapter: KindAdapter): LegacyAlias {
  return {
    // `@AURA-` at a token boundary (start of line or after whitespace)
    // followed by at least one digit, cursor at the end of the token. The
    // boundary keeps a mid-word `@` out; the required digit makes a bare
    // `@AURA-` a non-mention (no suggestions, no warning); the trailing
    // word boundary keeps glued letters (`@AURA-42abc`) out, matching the
    // legacy grammar the old extension pinned; `i` keeps `@aura-42`
    // working. Scanning (submit) drops the `$` anchor via globalScanPattern.
    pattern: /(?:^|[ \t])@(AURA-\d+)\b$/i,
    kind: TASK_KIND,
    searchLocal: (items, partial) =>
      filterReferenceItems(items, partial, MAX_SUGGESTIONS).map((item) => {
        const token = `@${item.key}`;
        // The row keeps the adapter's description (status + title); only
        // the inserted token switches to the legacy form.
        return { ...taskAdapter.formatRow(item), value: token, label: token };
      }),
  };
}

// ---------------------------------------------------------------------------
// Autocomplete provider wiring (the `#` overlay)
// ---------------------------------------------------------------------------

/**
 * Wrap the built-in provider with the reference engine: a `#kind:` token at a
 * token boundary whose kind is registered (or a registered legacy-alias token,
 * e.g. `@AURA-42`) serves suggestions instantly from the cache (no Aura fetch
 * is ever awaited here); every non-reference token (headings, mid-word `#` or
 * `@`, unregistered kinds, zero-match partials, and the no-credentials or
 * empty-cache state) defers to the built-in provider so file completion and
 * other overlays are never clobbered.
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
    // `#` for the engine's own `#kind:` tokens; `@` for the registered legacy
    // aliases (`@AURA-` today, `@rule:` with the rule ticket). Every `@` token
    // that is not a registered alias defers to the wrapped provider below, so
    // claiming the trigger character never clobbers pi's own `@` syntaxes
    // (mentions, files). (`@` is also one of pi-tui's default trigger
    // characters, so this declaration documents ownership as much as it
    // changes behavior.)
    triggerCharacters: ["#", "@"],
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
      // A legacy-alias token formats its rows through the alias's searchLocal
      // hook so selection inserts the legacy token (the user stays in the
      // syntax they typed); `#kind:` tokens and aliases without the hook use
      // the kind adapter's rows.
      const search = token.alias?.searchLocal ?? adapter.searchLocal;
      const rows = search(cache.read(adapter.kind), partial);
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
// Dynamic-import seam (the package's standard seam for @pi-aura/shared:
// Node's strip-types loader cannot resolve its .js extension specifiers)
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

/**
 * Build the session's reference cache plus its warmup decision: the
 * persistent sqlite store at `~/.pi/agent/aura-reference-cache.db` (WAL
 * journal mode, one table keyed by base URL + kind + id, shared by all pi
 * sessions), so autocomplete is instant in every session, not just warm
 * ones. The base URL for the keying comes from the same settings the
 * AuraClient reads (`aura.baseUrl`), so multi-instance setups never
 * cross-contaminate.
 *
 * The returned `shouldSkipWarmup(kind)` implements the TTL gating of the
 * session-start warmup: while the persisted cache is within TTL
 * (`aura.references.cacheTtlMs`, global settings with a project override,
 * default 6 hours) and non-empty, the warmup fetch is skipped entirely
 * (instant session start, far fewer Aura calls); expired or empty caches
 * fetch. Reads always serve entries instantly regardless of expiry
 * (stale-while-revalidate), and the per-query background refresh stays
 * always-on and untouched.
 *
 * Dynamic imports on both seams (the settings reader and the store
 * module): the unit-test entry point stays runnable with
 * `node --experimental-strip-types`, and a session whose Node build cannot
 * load the sqlite module degrades to the in-memory cache instead of failing
 * the extension load. Any failure here falls back to the session-scoped
 * in-memory cache (which is also the unit-test fake) with an always-fetch
 * warmup, exactly the pre-gate behavior; nothing ever throws into the
 * session.
 */
async function createSessionCache(): Promise<{
  cache: ReferenceCache;
  shouldSkipWarmup: (kind: string) => boolean;
}> {
  try {
    const [{ loadAuraClientSettings }, cacheModule] = await Promise.all([
      import("@pi-aura/shared/settings"),
      import("./aura-reference-cache.ts"),
    ]);
    const baseUrl = loadAuraClientSettings().baseUrl ?? "";
    const cache = cacheModule.createSqliteReferenceCache({
      dbPath: cacheModule.defaultReferenceCacheDbPath(),
      baseUrl,
    });
    const ttlMs = cacheModule.loadReferenceCacheTtlMs();
    return {
      cache,
      shouldSkipWarmup: (kind: string) =>
        cacheModule.shouldSkipReferenceWarmup({
          items: cache.read(kind),
          fetchedAt: cache.fetchedAt(kind),
          ttlMs,
          now: Date.now(),
        }),
    };
  } catch {
    return {
      cache: createInMemoryReferenceCache(),
      shouldSkipWarmup: () => false,
    };
  }
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  const taskAdapter = createTaskAdapter({ createClient: createDefaultClient });
  // The rule kind (local-only): the rules ride engine memory, never the
  // reference cache (they are cwd-local; persisting rows would
  // cross-contaminate repos). The factory loads them per session and hands
  // them to the adapter through this accessor (a /reload re-emits
  // session_start and swaps in the fresh set).
  let sessionRules: Rule[] = [];
  const ruleAdapter = createRuleAdapter({ getRules: () => sessionRules });
  const registry = createReferenceRegistry([taskAdapter, ruleAdapter]);
  // The first production alias: `@AURA-<digits>` keeps working through the
  // engine (legacy-token autocomplete insertion, expansion to the same
  // <task-ref> tag as #task:, once-per-session user-only deprecation
  // warning). The old extension's parallel `@AURA-` handling was deleted in
  // the same landing (atomicity): while this alias is registered, no second
  // code path may transform the same mention.
  registry.registerAlias(createAuraTaskAlias(taskAdapter));
  // The session cache lives from session_start on. It starts empty (the
  // provider defers on an empty cache) and is populated by the fire-and-forget
  // warmup. A /reload re-emits session_start and swaps in a fresh cache.
  let sessionCache: ReferenceCache | null = null;
  // The once-per-session deprecation-warning decision, built fresh per
  // session_start (a /reload re-arms it). Null before the first session_start:
  // no warning is surfaced without a session.
  let warnLegacySyntax: (() => boolean) | null = null;
  // Latched once per session by the probe below (credentials appearing later
  // do not re-arm until /reload): without Aura credentials no targeted
  // expansion fetch may be attempted at all.
  let clientAvailable = false;

  pi.on("session_start", async (_event, ctx) => {
    // Re-arm the expansion gate for this session: a /reload into a
    // credential-less state must not keep the previous session's latch, or
    // every mention would attempt a doomed (swallowed) targeted fetch.
    clientAvailable = false;
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

    // The session's rules: loaded from the session cwd (the cheap local
    // equivalent of the task warmup; a repo without `.cursor/rules/` loads
    // an empty set and the rule kind offers nothing). Synchronous and
    // local, so it cannot disturb the session.
    sessionRules = loadRules(ctx.cwd);

    // Null first: a /reload re-entering session_start must not keep serving
    // the previous session's cache while the new one is being built (the
    // provider defers on a null cache, exactly like before the first
    // session_start).
    sessionCache = null;
    // The production cache is the persistent sqlite store (WAL, shared by
    // all pi sessions; see createSessionCache); the in-memory cache is the
    // unit-test fake and the silent fallback when the store cannot be
    // built. A /reload re-emits session_start and swaps in a fresh session
    // cache backed by the same file.
    const { cache, shouldSkipWarmup } = await createSessionCache();
    sessionCache = cache;
    warnLegacySyntax = createDeprecationWarningDecision();

    // Fire-and-forget warmup for every registered kind that has one, now
    // gated by the TTL: while the persisted cache is within TTL and
    // non-empty, the warmup fetch is skipped entirely (instant session
    // start); expired or empty caches fetch. Missing credentials and fetch
    // failures are swallowed inside the adapter: the cache stays empty and
    // the provider keeps deferring (no crash, no retry) for the rest of the
    // session. The per-query background refresh (slice 2 of
    // reference-engine-core) is always-on and untouched by this gate.
    for (const adapter of registry.kinds.values()) {
      if (shouldSkipWarmup(adapter.kind)) continue;
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
  // references stay exactly as typed. The resolution gate is per kind:
  // server kinds (tasks) resolve only with Aura credentials (without them,
  // or before the one-shot probe resolves, no targeted fetch may be attempted
  // at all, so the mention stays as typed without any lookup), while local
  // kinds (rules) resolve always: rule mentions expand offline.
  pi.on("input", async (event, ctx) => {
    const cache = sessionCache;
    if (cache === null) return;
    // Legacy alias deprecation warning: user-only (ctx.ui.notify), at most
    // once per session, never added to the prompt. Fires on the first
    // submitted prompt containing a legacy mention; the trigger is the
    // pattern, not resolution (an unknown `@AURA-999` warns too).
    if (
      warnLegacySyntax !== null &&
      promptHasLegacyMention(event.text, registry) &&
      warnLegacySyntax()
    ) {
      ctx.ui.notify(
        "Legacy reference syntax is deprecated and will be removed in a future version: use the #<kind>:<key> tokens instead.",
        "warning",
      );
    }
    const text = await expandReferenceMentions(
      event.text,
      registry,
      (kind, token) => {
        const adapter = registry.kinds.get(kind);
        if (adapter === undefined) return Promise.resolve(null);
        // The per-kind gate: local kinds resolve without credentials; server
        // kinds only once the session's client probe succeeded.
        if (!adapter.local && !clientAvailable) return Promise.resolve(null);
        return adapter.resolveFullToken(token, cache);
      },
    );
    if (text === event.text) return; // unchanged: pass through
    return { action: "transform", text };
  });

  // Teach the model what the reference tags mean (and that it must reach
  // for the `aura` skill to act on a referenced task; rule bodies arrive in
  // the system prompt already). Appended every turn (pi rebuilds the base
  // system prompt each turn, so this never accumulates).
  pi.on("before_agent_start", async (event, _ctx) => {
    return { systemPrompt: event.systemPrompt + "\n" + REFERENCE_INSTRUCTION };
  });
}
