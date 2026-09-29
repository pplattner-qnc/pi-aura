/**
 * Logic tests for the aura-references extension (shared reference engine).
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-references.test.ts
 *
 * Covers the pure seams: `#kind:` token extraction + deferral, the registry
 * (kind prefixes, adapters, the alias registration API), the in-memory
 * reference cache, autocomplete filtering/ranking, the SWR refresh, the task
 * adapter's warmup + local search + full-token resolution, the inline
 * expansion transform (`#kind:` and legacy-alias mentions, tag shapes,
 * escaping, failure modes), the per-turn instruction constant, the
 * once-per-session deprecation-warning decision, the production `@AURA-`
 * legacy alias end-to-end (recognition at boundaries, legacy-token
 * autocomplete rows, expansion routing through the task adapter, and the
 * deprecation-warning trigger), and the rule kind end-to-end (the first
 * local-only kind: name-substring search over the loaded rules, row
 * formatting, rule-ref expansion, local resolution without credentials,
 * and the body-injection coexistence with the input transform: raw
 * `#rule:` tokens and expanded `<rule-ref>` elements). The provider wiring
 * that defers to the built-in
 * provider for non-reference tokens is tested at its
 * pure wrapper seam. The extension factory (which reaches Aura through the
 * dynamic-import seam and surfaces the deprecation warning via `ctx.ui.notify`)
 * is exercised by the pi runtime once credentials are configured, mirroring
 * the `aura-tasks` and `engineering-rules` test files.
 */

import assert from "node:assert/strict";
import auraReferences, {
  createAuraTaskAlias,
  createInMemoryReferenceCache,
  createReferenceAutocompleteProvider,
  createReferenceRegistry,
  createTaskAdapter,
  expandReferenceMentions,
  extractReferenceToken,
  filterReferenceItems,
  promptHasLegacyMention,
  refreshReferenceKind,
  createDeprecationWarningDecision,
  REFERENCE_INSTRUCTION,
  RULE_KIND,
  MAX_SUGGESTIONS,
  ruleToReferenceItem,
  createRuleAdapter,
  createRuleAlias,
  filterRuleItems,
  type ReferenceItem,
} from "./aura-references.ts";
import { resolveRuleMentions, type Rule } from "./engineering-rules.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal kind adapter stub (all methods trivial) so tests can register a
 *  kind without dragging in the AuraClient. Satisfies the KindAdapter
 *  contract structurally. */
function stubAdapter(kind: string) {
  return {
    kind,
    parsePartial: (partial: string) => partial,
    searchLocal: () => [] as Array<{ value: string; label: string }>,
    searchServer: async () => [] as Array<{ kind: string; id: string; key: string; title: string }>,
    formatRow: (item: { key: string; title: string }) => ({
      value: `#${kind}:${item.key}`,
      label: `#${kind}:${item.key}`,
      description: item.title,
    }),
    formatExpansion: (item: { key: string }) => `<${kind}-ref key="${item.key}"></${kind}-ref>`,
    resolveFullToken: async () => null,
  };
}

// ---------------------------------------------------------------------------
// extractReferenceToken (the # deferral contract)
// ---------------------------------------------------------------------------

{
  const registry = createReferenceRegistry([stubAdapter("task")]);

  // `#task:` at start of line, empty partial (user still typing)
  assert.deepEqual(
    extractReferenceToken("#task:", registry),
    { kind: "task", partial: "", raw: "#task:" },
  );

  // `#task:` after whitespace, cursor right after the token
  assert.deepEqual(
    extractReferenceToken("work on #task:42", registry),
    { kind: "task", partial: "42", raw: "#task:42" },
  );

  // Case-insensitive kind prefix; the raw text keeps the typed casing
  assert.deepEqual(
    extractReferenceToken("#TASK:", registry),
    { kind: "task", partial: "", raw: "#TASK:" },
  );

  // Title-ish partial
  assert.equal(extractReferenceToken("see #task:login", registry)?.partial, "login");

  // Unicode partial passes through untouched
  assert.equal(extractReferenceToken("#task:Überprüf", registry)?.partial, "Überprüf");

  // Space between # and the kind: not a token (`# heading` style)
  assert.equal(extractReferenceToken("# task", registry), null);

  // Mid-word #: not a token boundary
  assert.equal(extractReferenceToken("foo#task:", registry), null);

  // A heading with no colon: not a reference token
  assert.equal(extractReferenceToken("#heading", registry), null);

  // A colon after a differently-cased unregistered word still defers
  assert.equal(extractReferenceToken("#Heading: something", registry), null);

  // `#rule:` defers while the rule kind is not registered (rule kind is a
  // later ticket; registering a rule adapter is all it takes)
  assert.equal(extractReferenceToken("#rule:tracker-aura", registry), null);

  // A registry with no registered alias does not recognize legacy syntax: an
  // `@` token never produces a reference token here (recognition comes from
  // registration; the production wiring registers `@AURA-` through
  // createAuraTaskAlias, covered below).
  assert.equal(extractReferenceToken("@AURA-42", registry), null);

  // A token that already ended (user typed a space after `42`) defers
  assert.equal(extractReferenceToken("#task:42 ", registry), null);

  // Cursor positions earlier in the line (no complete token at the cursor)
  assert.equal(extractReferenceToken("#task:login flow", registry), null);

  // Only the token at the cursor matches when a line holds two tokens
  assert.deepEqual(
    extractReferenceToken("a #task:x b #task:log", registry),
    { kind: "task", partial: "log", raw: "#task:log" },
  );

  // Start-of-line boundary works per line (the provider hands us one line)
  assert.deepEqual(
    extractReferenceToken("#task:log", registry),
    { kind: "task", partial: "log", raw: "#task:log" },
  );

  // Registry shape: the adapter is registered under its kind, the alias
  // table is present but dormant (empty) in this slice.
  assert.equal(registry.kinds.get("task")?.kind, "task");
  assert.deepEqual(registry.aliases, []);
}

console.log("extractReferenceToken (# deferral): ok");

// ---------------------------------------------------------------------------
// Registry-driven dispatch: a second kind is a new adapter + a registration
// ---------------------------------------------------------------------------

{
  // Only the task kind is registered: `#doc:` is not a token.
  const taskOnly = createReferenceRegistry([stubAdapter("task")]);
  assert.equal(extractReferenceToken("#doc:api", taskOnly), null);

  // Registering a second adapter extends the engine with zero engine surgery:
  // the same extractReferenceToken dispatches through the new prefix.
  const two = createReferenceRegistry([stubAdapter("task"), stubAdapter("doc")]);
  assert.deepEqual(
    extractReferenceToken("#doc:api", two),
    { kind: "doc", partial: "api", raw: "#doc:api" },
  );
  assert.deepEqual(
    extractReferenceToken("#task:x", two),
    { kind: "task", partial: "x", raw: "#task:x" },
  );
  // Case-insensitive on the new kind too.
  assert.equal(extractReferenceToken("#DOC:api", two)?.kind, "doc");
}

console.log("registry dispatch (second kind): ok");

// ---------------------------------------------------------------------------
// Legacy alias recognition hook (the generic mechanism; the production
// `@AURA-` registration is pinned further below)
// ---------------------------------------------------------------------------

{
  // A registered alias pattern teaches extractReferenceToken a legacy syntax
  // without engine surgery: same extraction shape (kind + partial + raw),
  // dispatching to the alias's kind adapter, plus the matched registration
  // itself (the autocomplete provider's legacy-row hook). The pattern (not
  // the engine) defines the group shape: this test pattern captures only the
  // digits after `AURA-`.
  const auraAlias = { pattern: /(?:^|[ \t])@AURA-([^\s]*)$/i, kind: "task" };
  const aliasRegistry = createReferenceRegistry([stubAdapter("task")], [auraAlias]);

  // `@AURA-42` at a token boundary extracts as a task reference with the
  // typed partial, the raw token (without the leading boundary), and the
  // matched alias registration.
  assert.deepEqual(
    extractReferenceToken("see @AURA-42", aliasRegistry),
    { kind: "task", partial: "42", raw: "@AURA-42", alias: auraAlias },
  );

  // A token that already ended defers, same as the engine's own `#` tokens.
  assert.equal(extractReferenceToken("@AURA-42 ", aliasRegistry), null);

  // Only registered aliases are recognized: `@rule:` (no alias registered)
  // is not a token in this registry.
  assert.equal(extractReferenceToken("@rule:name", aliasRegistry), null);
}

console.log("legacy alias recognition hook: ok");

// ---------------------------------------------------------------------------
// createInMemoryReferenceCache (the cache seam)
// ---------------------------------------------------------------------------

{
  // Injectable clock: each write takes the next tick.
  const ticks = [1000, 2000, 3000];
  let tick = 0;
  const cache = createInMemoryReferenceCache(() => ticks[tick++] ?? 9999);

  // Never-written kind: empty read, null fetchedAt.
  assert.deepEqual(cache.read("task"), []);
  assert.equal(cache.fetchedAt("task"), null);

  // Write then read: items in order, entries carry fetchedAt.
  cache.write("task", [
    { kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
    { kind: "task", id: "u2", key: "AURA-7", title: "Write the docs", status: "OPEN" },
  ]);
  assert.deepEqual(cache.read("task").map((e) => e.key), ["AURA-42", "AURA-7"]);
  assert.equal(cache.read("task")[0]?.fetchedAt, 1000);
  assert.equal(cache.fetchedAt("task"), 1000);

  // Upsert by id: same id replaces in place (order preserved), stamps a new
  // fetchedAt.
  cache.write("task", [
    { kind: "task", id: "u1", key: "AURA-42", title: "Renamed login bug", status: "DONE" },
  ]);
  const after = cache.read("task");
  assert.equal(after.length, 2, "upsert merges, does not append");
  assert.equal(after[0]?.title, "Renamed login bug");
  assert.equal(after[0]?.status, "DONE");
  assert.equal(after[0]?.key, "AURA-42");
  assert.equal(after[0]?.fetchedAt, 2000);
  assert.equal(after[1]?.key, "AURA-7", "second entry keeps its position");
  assert.equal(after[1]?.fetchedAt, 1000, "untouched entry keeps its stamp");

  // Kind isolation: entries of one kind never leak into another.
  cache.write("doc", [{ kind: "doc", id: "d1", key: "api", title: "API doc" }]);
  assert.equal(cache.read("task").length, 2);
  assert.deepEqual(cache.read("doc").map((e) => e.key), ["api"]);
  assert.equal(cache.fetchedAt("doc"), 3000);

  // Unknown kind reads empty.
  assert.deepEqual(cache.read("nope"), []);

  // An empty write still counts as a fetch (TTL awareness for the SWR
  // decision: "fetched, nothing there" differs from "never fetched").
  const empty = createInMemoryReferenceCache(() => 555);
  empty.write("task", []);
  assert.deepEqual(empty.read("task"), []);
  assert.equal(empty.fetchedAt("task"), 555);
}

console.log("createInMemoryReferenceCache: ok");

// ---------------------------------------------------------------------------
// filterReferenceItems (autocomplete filtering + ranking)
// ---------------------------------------------------------------------------

{
  const items: ReferenceItem[] = [
    { kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
    { kind: "task", id: "u2", key: "AURA-1337", title: "Ship the dashboard", status: "IN_REVIEW" },
    { kind: "task", id: "u3", key: "AURA-424", title: "Refactor the renderer", status: "DONE" },
    { kind: "task", id: "u4", key: "AURA-7", title: "Write the docs", status: "OPEN" },
  ];

  // Empty partial: the head of the cache (cached order preserved).
  assert.deepEqual(
    filterReferenceItems(items, "", 20).map((i) => i.key),
    ["AURA-42", "AURA-1337", "AURA-424", "AURA-7"],
  );

  // Full-key prefix, case-insensitive (user typed the project part).
  assert.deepEqual(
    filterReferenceItems(items, "AUR", 20).map((i) => i.key),
    ["AURA-42", "AURA-1337", "AURA-424", "AURA-7"],
  );
  assert.deepEqual(
    filterReferenceItems(items, "aura-13", 20).map((i) => i.key),
    ["AURA-1337"],
  );

  // Title substring, case-insensitive.
  assert.deepEqual(
    filterReferenceItems(items, "LOGIN", 20).map((i) => i.key),
    ["AURA-42"],
  );
  assert.deepEqual(
    filterReferenceItems(items, "the", 20).map((i) => i.key),
    ["AURA-42", "AURA-1337", "AURA-424", "AURA-7"],
    "title substring hits every title containing 'the' (cache order)",
  );
  assert.deepEqual(
    filterReferenceItems(items, "docs", 20).map((i) => i.key),
    ["AURA-7"],
  );

  // Ranking: key-prefix matches come before title-substring matches.
  // "4" key-matches AURA-42 + AURA-424 (via the number hook below) and
  // title-matches nothing here; with a title hit added it must rank last.
  const withTitleHit: ReferenceItem[] = [
    { kind: "task", id: "u9", key: "AURA-9", title: "The 4 rules of refactoring", status: "OPEN" },
    ...items,
  ];
  const numberHook = (item: ReferenceItem, query: string): boolean => {
    const dash = item.key.indexOf("-");
    const number = dash === -1 ? item.key : item.key.slice(dash + 1);
    return number.toLowerCase().startsWith(query);
  };
  assert.deepEqual(
    filterReferenceItems(withTitleHit, "4", 20, numberHook).map((i) => i.key),
    ["AURA-42", "AURA-424", "AURA-9"],
  );

  // Cap: at most `max` suggestions, key matches first.
  assert.deepEqual(
    filterReferenceItems(items, "", 2).map((i) => i.key),
    ["AURA-42", "AURA-1337"],
  );
  assert.deepEqual(filterReferenceItems(items, "zzz", 20), []);

  // Edge: an item with an empty title still matches by key prefix and shows
  // up in the empty-partial head (a title substring never matches it).
  const emptyTitle: ReferenceItem[] = [
    { kind: "task", id: "u5", key: "AURA-8", title: "", status: "OPEN" },
  ];
  assert.deepEqual(filterReferenceItems(emptyTitle, "AURA-8", 20).map((i) => i.key), ["AURA-8"]);
  assert.deepEqual(filterReferenceItems(emptyTitle, "", 20).map((i) => i.key), ["AURA-8"]);
  assert.deepEqual(filterReferenceItems(emptyTitle, "docs", 20), []);

  // Edge: unicode title substring matching.
  const unicode: ReferenceItem[] = [
    { kind: "task", id: "u6", key: "AURA-5", title: "Überprüfung der Anmeldung", status: "OPEN" },
  ];
  assert.deepEqual(filterReferenceItems(unicode, "überprüf", 20).map((i) => i.key), ["AURA-5"]);
  assert.deepEqual(filterReferenceItems(unicode, "ÜBERPRÜF", 20).map((i) => i.key), ["AURA-5"]);

  // Edge: a cache entry whose key has nonstandard casing still matches
  // case-insensitively (matching is case-insensitive; the item keeps its
  // stored casing so selection inserts the canonical form).
  const oddCasing: ReferenceItem[] = [
    { kind: "task", id: "u7", key: "aura-42", title: "Odd casing entry", status: "OPEN" },
  ];
  assert.deepEqual(filterReferenceItems(oddCasing, "AURA-4", 20).map((i) => i.key), ["aura-42"]);
  assert.deepEqual(filterReferenceItems(oddCasing, "aura-4", 20).map((i) => i.key), ["aura-42"]);
}

console.log("filterReferenceItems: ok");

// ---------------------------------------------------------------------------
// createTaskAdapter: parsePartial, formatRow, searchLocal
// ---------------------------------------------------------------------------

{
  const adapter = createTaskAdapter({
    createClient: async () => {
      throw new Error("no credentials in this test");
    },
  });

  assert.equal(adapter.kind, "task");

  // The task partial is free-form (any non-space run after `#task:`).
  assert.equal(adapter.parsePartial("AUR"), "AUR");
  assert.equal(adapter.parsePartial(""), "");
  assert.equal(adapter.parsePartial("42"), "42");

  // Row shape: the inserted value is `#task:<canonical key>`; the description
  // carries status + title (trimmed when the title is empty).
  const row = adapter.formatRow({ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" });
  assert.equal(row.value, "#task:AURA-42");
  assert.equal(row.label, "#task:AURA-42");
  assert.equal(row.description, "[OPEN] Fix the login bug");
  const emptyTitleRow = adapter.formatRow({ kind: "task", id: "u2", key: "AURA-8", title: "", status: "OPEN" });
  assert.equal(emptyTitleRow.description, "[OPEN]");

  // Local search: full-key prefix and key number prefix rank first, title
  // substring after, capped at MAX_SUGGESTIONS.
  const items: ReferenceItem[] = [
    { kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
    { kind: "task", id: "u3", key: "AURA-424", title: "Refactor the renderer", status: "DONE" },
    { kind: "task", id: "u9", key: "AURA-9", title: "The 4 agreements", status: "OPEN" },
  ];

  // `#task:42` matches by number prefix (42 and 424), not by title.
  assert.deepEqual(
    adapter.searchLocal(items, "42").map((i) => i.value),
    ["#task:AURA-42", "#task:AURA-424"],
  );

  // `#task:AUR` matches the key prefix.
  assert.deepEqual(
    adapter.searchLocal(items, "AUR").map((i) => i.value),
    ["#task:AURA-42", "#task:AURA-424", "#task:AURA-9"],
  );

  // `#task:login` matches the title substring.
  assert.deepEqual(
    adapter.searchLocal(items, "login").map((i) => i.value),
    ["#task:AURA-42"],
  );

  // Canonical key casing on selection: a lowercase partial inserts the
  // server-cased key, and a nonstandard-cased cache entry is matched
  // case-insensitively and inserted with its stored (canonical) casing.
  assert.equal(adapter.searchLocal(items, "aura-4")[0]?.value, "#task:AURA-42");
  const oddCasing: ReferenceItem[] = [
    { kind: "task", id: "u7", key: "aura-42", title: "Odd casing entry", status: "OPEN" },
  ];
  assert.equal(adapter.searchLocal(oddCasing, "AURA")[0]?.value, "#task:aura-42");

  // Cap applies to the merged (key + title) result set.
  const many: ReferenceItem[] = Array.from({ length: 30 }, (_, i) => ({
    kind: "task",
    id: `u${i}`,
    key: `AURA-${i + 1}`,
    title: `Number ${i + 1} task`,
    status: "OPEN",
  }));
  assert.equal(adapter.searchLocal(many, "").length, MAX_SUGGESTIONS);

  // Empty cache: no rows (the provider defers on this).
  assert.deepEqual(adapter.searchLocal([], ""), []);
}

console.log("createTaskAdapter searchLocal + formatRow: ok");

// ---------------------------------------------------------------------------
// createTaskAdapter: warmup (listTasks pagination into the cache)
// ---------------------------------------------------------------------------

interface FakeTask {
  id: string;
  human_key: string;
  title: string;
  status: string;
}

function fakeTasks(count: number, offset = 0): FakeTask[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `uuid-${offset + i + 1}`,
    human_key: `AURA-${offset + i + 1}`,
    title: `Task ${offset + i + 1}`,
    status: "OPEN",
  }));
}

/** Fake AuraClient: one array of pages; options to fail or abort on a page. */
function fakeClient(pages: FakeTask[][], behavior?: {
  failOnPage?: number;
  abortOnPage?: (signal: AbortSignal) => void;
}) {
  const pageCalls: number[] = [];
  const searches: string[] = [];
  return {
    client: {
      listTasks: async (query?: { page?: number; search?: string }) => {
        const page = query?.page ?? 1;
        pageCalls.push(page);
        if (query?.search !== undefined) searches.push(query.search);
        if (behavior?.failOnPage === page) throw new Error("network down");
        behavior?.abortOnPage?.(new AbortController().signal);
        return { items: pages[page - 1] ?? [], pagination: {} };
      },
      getTaskByHumanKey: async () => {
        throw new Error("not used here");
      },
    },
    pageCalls,
    searches,
  };
}

{
  // Multi-page pagination: page 1 full (100 items), page 2 partial. Writes
  // land page by page so partial progress stays cached.
  const { client, pageCalls } = fakeClient([fakeTasks(100), fakeTasks(3, 100)]);
  const adapter = createTaskAdapter({ createClient: async () => client });
  const cache = createInMemoryReferenceCache();
  await adapter.warmup(cache);
  assert.equal(cache.read("task").length, 103);
  assert.deepEqual(pageCalls, [1, 2], "stops after a partial page");
  assert.equal(cache.fetchedAt("task") !== null, true);

  // Cap: at most MAX_TASKS tasks are pulled (5 full pages of 100 reach the
  // 500 cap, so a 6th page is never requested). The cache keeps the head.
  const big = fakeClient([fakeTasks(100, 0), fakeTasks(100, 100), fakeTasks(100, 200), fakeTasks(100, 300), fakeTasks(100, 400), fakeTasks(100, 500), fakeTasks(100, 600)]);
  const capped = createTaskAdapter({ createClient: async () => big.client });
  const cappedCache = createInMemoryReferenceCache();
  await capped.warmup(cappedCache);
  assert.equal(cappedCache.read("task").length, 500);
  assert.deepEqual(big.pageCalls, [1, 2, 3, 4, 5], "stops at the cap without a surplus page");

  // Missing credentials: createDefaultAuraClient throws. Warmup no-ops
  // (resolves, empty cache, nothing thrown into the session).
  const noCreds = createTaskAdapter({
    createClient: async () => {
      throw new Error("missing PAT");
    },
  });
  const emptyCache = createInMemoryReferenceCache();
  await noCreds.warmup(emptyCache);
  assert.deepEqual(emptyCache.read("task"), []);

  // Warmup aborted mid-flight: the abort takes effect between pages (an
  // in-flight page's already-received data still lands), so pagination stops
  // and nothing throws into the session.
  const controller = new AbortController();
  const abortPageCalls: number[] = [];
  const aborting = {
    listTasks: async (query?: { page?: number }) => {
      const page = query?.page ?? 1;
      abortPageCalls.push(page);
      if (page >= 2) controller.abort();
      return { items: fakeTasks(100, (page - 1) * 100), pagination: {} };
    },
    getTaskByHumanKey: async () => {
      throw new Error("not used here");
    },
  };
  const abortAdapter = createTaskAdapter({ createClient: async () => aborting });
  const abortCache = createInMemoryReferenceCache();
  await abortAdapter.warmup(abortCache, { signal: controller.signal });
  assert.deepEqual(abortPageCalls, [1, 2], "pagination stops after the abort");
  assert.equal(abortCache.read("task").length, 200, "landed pages stay cached");

  // A page fetch that rejects: warmup resolves (no throw), earlier pages stay.
  const failing = fakeClient([fakeTasks(100), fakeTasks(100, 100)], { failOnPage: 2 });
  const failAdapter = createTaskAdapter({ createClient: async () => failing.client });
  const failCache = createInMemoryReferenceCache();
  await failAdapter.warmup(failCache);
  assert.equal(failCache.read("task").length, 100, "page 1 survived the page 2 failure");

  // A warmup into an already-populated cache merges (upsert) rather than
  // replacing: a re-warmup keeps ids stable.
  const { client: single } = fakeClient([fakeTasks(2)]);
  const mergeAdapter = createTaskAdapter({ createClient: async () => single });
  const mergeCache = createInMemoryReferenceCache();
  await mergeAdapter.warmup(mergeCache);
  await mergeAdapter.warmup(mergeCache);
  assert.equal(mergeCache.read("task").length, 2);
}

console.log("createTaskAdapter warmup: ok");

// ---------------------------------------------------------------------------
// refreshReferenceKind (SWR orchestration: injected fetch + cache)
// ---------------------------------------------------------------------------

/** A promise with its resolve/reject exposed, so tests decide when (and how)
 *  the server answers. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What one `listTasks` search eventually answers with. */
type SearchReply = { items: FakeTask[]; pagination: unknown };
type SearchCall = ReturnType<typeof deferred<SearchReply>> & { search: string | undefined };

/** A controllable AuraClient for the SWR seam: every `listTasks` search is a
 *  deferred promise the test resolves, rejects, or leaves hanging. Each call
 *  is recorded with its query (the typed partial lands in `search`). */
function controllableSearchClient() {
  const calls: SearchCall[] = [];
  return {
    client: {
      listTasks: (query?: { search?: string }) => {
        const d = deferred<SearchReply>();
        calls.push({ ...d, search: query?.search });
        return d.promise;
      },
      getTaskByHumanKey: async () => {
        throw new Error("not used here");
      },
    },
    calls,
  };
}

{
  // A completed refresh writes through to the cache (the next query sees fresh
  // data): a cached item with a stale title plus a server result carrying the
  // corrected title. The server result replaces its cached twin in place
  // (dedupe by id) and stamps a fresh fetchedAt.
  let ts = 0;
  const { client, calls } = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => client });
  const cache = createInMemoryReferenceCache(() => {
    ts += 1000;
    return ts;
  });
  cache.write("task", [{ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }]);

  const refresh = refreshReferenceKind(cache, adapter, "42");
  // One microtask hop: the refresh starts its search asynchronously (the
  // adapter awaits its client factory), so the call record exists only after
  // the hop. Deterministic: the search start was queued before this await.
  await Promise.resolve();
  assert.equal(calls.length, 1, "the refresh fired exactly one server search");
  assert.equal(calls[0]?.search, "42", "the typed partial is the listTasks search");
  calls[0]!.resolve({
    items: [{ id: "u1", human_key: "AURA-42", title: "Fix the renamed login bug", status: "OPEN" }],
    pagination: {},
  });
  await refresh;

  const after = cache.read("task");
  assert.equal(after.length, 1, "the server result replaced the cached twin, not appended");
  assert.equal(after[0]?.title, "Fix the renamed login bug");
  assert.equal(after[0]?.fetchedAt, 2000, "the write-through stamped the fresh fetch");
  assert.equal(cache.fetchedAt("task"), 2000);

  // The refreshed entry is also what the next local search ranks.
  assert.equal(adapter.searchLocal(cache.read("task"), "renamed").length, 1);
}

console.log("refreshReferenceKind write-through: ok");

{
  // A server-only match (a task outside the local cache window) is added to
  // the cache, so the next query can find it by title substring.
  const { client, calls } = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => client });
  const cache = createInMemoryReferenceCache();
  cache.write("task", [{ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }]);

  const refresh = refreshReferenceKind(cache, adapter, "obscure");
  await Promise.resolve(); // let the async search start reach listTasks
  calls[0]!.resolve({
    items: [{ id: "u2", human_key: "AURA-999", title: "The obscure story point spike", status: "OPEN" }],
    pagination: {},
  });
  await refresh;

  assert.deepEqual(
    cache.read("task").map((e) => e.key),
    ["AURA-42", "AURA-999"],
    "server-only match added after the cached item",
  );
}

console.log("refreshReferenceKind server-only match: ok");

{
  // Merge semantics: a server page carrying one corrected twin and one new
  // task merges over the cache (upsert by id; cached order preserved for the
  // kept entries).
  const { client, calls } = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => client });
  const cache = createInMemoryReferenceCache();
  cache.write("task", [
    { kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
    { kind: "task", id: "u2", key: "AURA-7", title: "Write the docs", status: "OPEN" },
  ]);

  const refresh = refreshReferenceKind(cache, adapter, "42");
  await Promise.resolve(); // let the async search start reach listTasks
  calls[0]!.resolve({
    items: [
      { id: "u1", human_key: "AURA-42", title: "Fix the renamed login bug", status: "DONE" },
      { id: "u3", human_key: "AURA-1337", title: "Ship the dashboard", status: "IN_REVIEW" },
    ],
    pagination: {},
  });
  await refresh;

  const after = cache.read("task");
  assert.deepEqual(
    after.map((e) => e.key),
    ["AURA-42", "AURA-7", "AURA-1337"],
  );
  assert.equal(after[0]?.title, "Fix the renamed login bug");
  assert.equal(after[1]?.title, "Write the docs");
  assert.equal(after[2]?.title, "Ship the dashboard");
}

console.log("refreshReferenceKind merge over local: ok");

{
  // Abort guards. A hung fetch that resolves after the request was aborted
  // must not write (no write after abort), and an already-aborted request
  // fires no fetch at all: aborted queries stop their work.
  const { client, calls } = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => client });
  const cache = createInMemoryReferenceCache();
  cache.write("task", [{ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }]);
  const stampBefore = cache.fetchedAt("task");

  // Already aborted before the refresh starts: no server search is fired.
  const preAborted = new AbortController();
  preAborted.abort();
  await refreshReferenceKind(cache, adapter, "42", { signal: preAborted.signal });
  assert.equal(calls.length, 0, "an already-aborted query fires no fetch");

  // Hung fetch, then abort, then a late resolution: the late results are
  // dropped, the cache stays exactly as it was.
  const controller = new AbortController();
  const hung = refreshReferenceKind(cache, adapter, "42", { signal: controller.signal });
  await Promise.resolve(); // let the async search start reach listTasks
  assert.equal(calls.length, 1);
  controller.abort(); // pi-tui superseded this request mid-flight
  calls[0]!.resolve({
    items: [{ id: "u1", human_key: "AURA-42", title: "Fix the late renamed title", status: "OPEN" }],
    pagination: {},
  });
  await hung; // resolves (never throws) without writing
  const after = cache.read("task");
  assert.equal(after.length, 1, "no write after abort");
  assert.equal(after[0]?.title, "Fix the login bug");
  assert.equal(cache.fetchedAt("task"), stampBefore, "the aborted query left no fresh stamp either");
}

console.log("refreshReferenceKind abort guards: ok");

{
  // Rapid successive queries: pi-tui aborts the earlier request when the
  // later starts, so only the later query's results may land.
  const { client, calls } = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => client });
  const cache = createInMemoryReferenceCache();

  const earlier = new AbortController();
  const later = new AbortController();
  const first = refreshReferenceKind(cache, adapter, "42", { signal: earlier.signal });
  const second = refreshReferenceKind(cache, adapter, "42", { signal: later.signal });
  await Promise.resolve(); // let both async searches reach listTasks
  assert.equal(calls.length, 2, "each query fired its own search");

  earlier.abort(); // the later request superseded the earlier one
  calls[0]!.resolve({ items: [{ id: "ua", human_key: "AURA-11", title: "Earlier query result", status: "OPEN" }], pagination: {} });
  calls[1]!.resolve({ items: [{ id: "ub", human_key: "AURA-22", title: "Later query result", status: "OPEN" }], pagination: {} });
  await Promise.all([first, second]);

  assert.deepEqual(
    cache.read("task").map((e) => e.key),
    ["AURA-22"],
    "only the surviving (later) query wrote through",
  );
}

console.log("refreshReferenceKind rapid queries (later aborts earlier): ok");

{
  // Transient failures are swallowed: the search rejects (a connection reset
  // mid-search) and the refresh resolves without throwing, leaving the cache
  // exactly as it was (items and stamp). Cached suggestions still return.
  let ts = 0;
  const { client, calls } = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => client });
  const cache = createInMemoryReferenceCache(() => {
    ts += 1000;
    return ts;
  });
  cache.write("task", [{ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }]);

  const refresh = refreshReferenceKind(cache, adapter, "42");
  await Promise.resolve(); // let the async search start reach listTasks
  calls[0]!.reject(new Error("connection reset mid-search"));
  await refresh; // resolves, never throws into the session
  const after = cache.read("task");
  assert.equal(after.length, 1);
  assert.equal(after[0]?.title, "Fix the login bug");
  assert.equal(cache.fetchedAt("task"), 1000, "the failure left no stamp");
}

console.log("refreshReferenceKind swallowed search failure: ok");

{
  // The never-throws contract holds for any adapter: when the injected search
  // itself rejects (not every kind adapter swallows internally), the refresh
  // resolves without throwing and leaves the cache as it was.
  const rejectingAdapter = {
    ...stubAdapter("task"),
    searchServer: async () => {
      throw new Error("the injected fetch exploded");
    },
  };
  const cache = createInMemoryReferenceCache(() => 3000);
  cache.write("task", [{ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }]);
  await refreshReferenceKind(cache, rejectingAdapter, "42"); // must resolve, not reject
  assert.deepEqual(cache.read("task").map((e) => e.key), ["AURA-42"]);
  assert.equal(cache.fetchedAt("task"), 3000);
}

console.log("refreshReferenceKind never rejects: ok");

{
  // The server answers with an empty result: local items are kept (and the
  // cache keeps its stamp, since nothing new was fetched to write).
  const { client, calls } = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => client });
  const cache = createInMemoryReferenceCache(() => 7000);
  cache.write("task", [{ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }]);

  const refresh = refreshReferenceKind(cache, adapter, "zzz-nothing-matches");
  await Promise.resolve(); // let the async search start reach listTasks
  calls[0]!.resolve({ items: [], pagination: {} });
  await refresh;
  const after = cache.read("task");
  assert.deepEqual(after.map((e) => e.key), ["AURA-42"], "local items kept on an empty server result");
  assert.equal(cache.fetchedAt("task"), 7000, "an empty result wrote nothing (and stamped nothing)");
}

console.log("refreshReferenceKind empty server result: ok");

{
  // Edge: server results with unknown extra fields. The adapter maps a task
  // to its reference fields; extra fields never reach the cache entries.
  const { client, calls } = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => client });
  const cache = createInMemoryReferenceCache(() => 9000);

  const refresh = refreshReferenceKind(cache, adapter, "42");
  await Promise.resolve(); // let the async search start reach listTasks
  calls[0]!.resolve({
    items: [
      {
        id: "u1",
        human_key: "AURA-42",
        title: "Fix the login bug",
        status: "OPEN",
        assignee: "someone@example.com",
        priority: "P1",
        updated_at: "2026-01-01T00:00:00Z",
        secret_internal_field: { nested: true },
      },
    ],
    pagination: {},
  });
  await refresh;
  assert.deepEqual(cache.read("task"), [
    { kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN", fetchedAt: 9000 },
  ]);
}

console.log("refreshReferenceKind unknown extra fields: ok");

// ---------------------------------------------------------------------------
// Provider + SWR wiring: instant cached answers, background refresh per query
// ---------------------------------------------------------------------------

/** A provider wired over a controllable-search task adapter: exposes the
 *  search-call recorder so tests observe the background refreshes. */
function swrProvider(cache: ReturnType<typeof createInMemoryReferenceCache>) {
  const { client, calls } = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => client });
  const registry = createReferenceRegistry([adapter]);
  const current = fakeCurrent();
  const provider = createReferenceAutocompleteProvider(current.provider, registry, () => cache);
  return { provider, calls, current };
}

{
  // Criterion: getSuggestions resolves from the cache without awaiting any
  // Aura fetch. The injected fetch here hangs forever; the query still
  // answers from the cache while the refresh is only started in the
  // background.
  const cache = createInMemoryReferenceCache();
  cache.write("task", taskItems());
  const { provider, calls } = swrProvider(cache);

  const suggestions = await suggestAt(provider, "#task:42", 8);
  assert.deepEqual(suggestions?.items.map((i) => i.value), ["#task:AURA-42", "#task:AURA-424"]);
  assert.equal(suggestions?.prefix, "#task:42");
  await Promise.resolve(); // one hop: the background refresh reaches listTasks
  assert.equal(calls.length, 1, "the same query fired the background refresh");
  // The fetch is left hanging forever: the provider never awaited it.
}

console.log("provider SWR: instant cache answer, background refresh fired: ok");

{
  // Criterion: every query fires the background refresh carrying the typed
  // partial, including zero-match partials whose rows defer to the built-in
  // provider (that is how a task outside the cache window becomes findable).
  const cache = createInMemoryReferenceCache();
  cache.write("task", taskItems());
  const { provider, calls, current } = swrProvider(cache);

  await suggestAt(provider, "#task:", 6); // empty partial: the cache head
  await suggestAt(provider, "#task:42", 8); // key partial
  await suggestAt(provider, "#task:login", 11); // title partial
  const deferBase = current.calls.suggestions;
  await suggestAt(provider, "#task:zzz", 9); // zero-match: defers, still refreshes
  await Promise.resolve(); // let the last refresh reach listTasks
  assert.deepEqual(calls.map((c) => c.search), ["", "42", "login", "zzz"]);
  assert.equal(current.calls.suggestions, deferBase + 1, "zero-match still defers to the built-in provider");

  // A non-reference token (deferred from the start) fires no refresh.
  const beforeHeading = calls.length;
  await suggestAt(provider, "# Heading", 9);
  assert.equal(calls.length, beforeHeading, "non-reference tokens fire no refresh");
}

console.log("provider SWR: every reference query refreshes with its partial: ok");

{
  // The request's own abort signal guards the background write: pi-tui
  // aborts superseded requests, and a late server answer must never land.
  const cache = createInMemoryReferenceCache();
  cache.write("task", taskItems());
  const { provider, calls } = swrProvider(cache);
  const controller = new AbortController();

  const suggestions = await provider.getSuggestions(["#task:login"], 0, 11, { signal: controller.signal });
  assert.equal(suggestions?.items[0]?.value, "#task:AURA-42", "the cache answered instantly");
  await Promise.resolve(); // the refresh is now in flight
  assert.equal(calls.length, 1);
  controller.abort(); // pi-tui superseded this request
  calls[0]!.resolve({
    items: [{ id: "late", human_key: "AURA-555", title: "Late server answer", status: "OPEN" }],
    pagination: {},
  });
  await new Promise((resolve) => setImmediate(resolve)); // let the dropped answer settle
  assert.deepEqual(
    cache.read("task").map((e) => e.key),
    ["AURA-42", "AURA-424", "AURA-1337"],
    "the aborted request's late answer never landed",
  );
}

console.log("provider SWR: the request abort signal guards the write: ok");

{
  // Criterion: without credentials no refresh is fired at all. The factory
  // latches the no-credentials state (createDefaultAuraClient() throws) and
  // passes it as the provider's `canRefresh` gate; with the gate off, queries
  // still answer from the cache but fire no server search.
  const cache = createInMemoryReferenceCache();
  cache.write("task", taskItems());
  const gated = controllableSearchClient();
  const adapter = createTaskAdapter({ createClient: async () => gated.client });
  const registry = createReferenceRegistry([adapter]);
  const current = fakeCurrent();
  const provider = createReferenceAutocompleteProvider(current.provider, registry, () => cache, {
    canRefresh: () => false,
  });

  await suggestAt(provider, "#task:42", 8);
  await suggestAt(provider, "#task:", 6);
  await suggestAt(provider, "#task:zzz", 9); // zero-match: defers, and no refresh either
  await Promise.resolve(); // a fired refresh would have reached listTasks by now
  assert.equal(gated.calls.length, 0, "no refresh fired without credentials");
  // The cached answers still come out.
  const suggestions = await suggestAt(provider, "#task:42", 8);
  assert.deepEqual(suggestions?.items.map((i) => i.value), ["#task:AURA-42", "#task:AURA-424"]);
}

console.log("provider SWR: no refresh without credentials (canRefresh gate): ok");

{
  // End-to-end demo, first half: rename a task title in Aura and keep typing.
  // Query 1 answers from the cache with the stale row (instant) while the
  // background refresh writes the corrected title through; query 2 (the next
  // keystroke) sees the fresh title.
  const cache = createInMemoryReferenceCache();
  cache.write("task", [{ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }]);
  const { provider, calls } = swrProvider(cache);

  const stale = await suggestAt(provider, "#task:login", 11);
  assert.equal(stale?.items[0]?.description, "[OPEN] Fix the login bug", "query 1: the stale cached row");
  await Promise.resolve(); // the refresh is in flight
  calls[0]!.resolve({
    items: [{ id: "u1", human_key: "AURA-42", title: "Fix the renamed login bug", status: "OPEN" }],
    pagination: {},
  });
  await new Promise((resolve) => setImmediate(resolve)); // the write-through lands

  const fresh = await suggestAt(provider, "#task:login", 11);
  assert.equal(fresh?.items[0]?.description, "[OPEN] Fix the renamed login bug", "query 2: the corrected title");
}

console.log("provider SWR end-to-end: renamed title visible one keystroke later: ok");

{
  // End-to-end demo, second half: a task outside the local cache window is
  // findable by title substring. Query 1 zero-matches (defers to the built-in
  // provider) while the server search finds the task and writes it through;
  // query 2 offers it as a reference row.
  const cache = createInMemoryReferenceCache();
  cache.write("task", [{ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }]);
  const { provider, calls, current } = swrProvider(cache);

  const deferredFirst = await suggestAt(provider, "#task:unpronounceable", 21);
  assert.equal(deferredFirst?.items[0]?.value, "file.txt", "query 1: no local match, deferred");
  await Promise.resolve(); // the refresh is in flight
  assert.equal(calls[0]?.search, "unpronounceable");
  calls[0]!.resolve({
    items: [{ id: "u2", human_key: "AURA-888", title: "The unpronounceable wiki slug", status: "OPEN" }],
    pagination: {},
  });
  await new Promise((resolve) => setImmediate(resolve)); // the write-through lands

  const found = await suggestAt(provider, "#task:unpronounceable", 21);
  assert.deepEqual(found?.items.map((i) => i.value), ["#task:AURA-888"], "query 2: the server-only match");
  assert.equal(found?.prefix, "#task:unpronounceable");
  // And the non-deferral path was taken this time (the row is a reference).
  assert.equal(current.calls.suggestions, 1, "query 2 answered by the engine, not the built-in provider");
}

console.log("provider SWR end-to-end: out-of-window task findable by title: ok");

// ---------------------------------------------------------------------------
// expandReferenceMentions (the expansion seam: prompt in, expanded prompt out)
// ---------------------------------------------------------------------------

/** A lookup over fixed items standing in for the adapter's resolution
 *  (cache-first + targeted fetch): resolves a task token case-insensitively
 *  by key, null when unknown. Records every call so tests can assert how
 *  often each mention was resolved. */
function lookupOver(items: ReferenceItem[]): {
  lookup: (kind: string, token: string) => Promise<ReferenceItem | null>;
  calls: Array<{ kind: string; token: string }>;
} {
  const byKey = new Map(items.map((item) => [item.key.toLowerCase(), item]));
  const calls: Array<{ kind: string; token: string }> = [];
  return {
    async lookup(kind, token) {
      calls.push({ kind, token });
      return byKey.get(token.toLowerCase()) ?? null;
    },
    calls,
  };
}

/** The production-shaped registry (task kind only); the injected client
 *  factory throws so a test can never reach Aura through it. */
function expansionRegistry() {
  return createReferenceRegistry([
    createTaskAdapter({
      createClient: async () => {
        throw new Error("no credentials in this test");
      },
    }),
  ]);
}

{
  const { lookup, calls } = lookupOver(taskItems());
  const registry = expansionRegistry();
  const expansion = '<task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>';

  // Single mention, middle of the prompt: the token is replaced by the kind
  // adapter's expansion, everything around it is untouched.
  assert.equal(
    await expandReferenceMentions("work on #task:AURA-42 today", registry, lookup),
    `work on ${expansion} today`,
  );

  // Mention at the start of the prompt.
  assert.equal(
    await expandReferenceMentions("#task:AURA-42 is ready", registry, lookup),
    `${expansion} is ready`,
  );

  // Mention at the end of the prompt.
  assert.equal(
    await expandReferenceMentions("please fix #task:AURA-42", registry, lookup),
    `please fix ${expansion}`,
  );

  // Mention at the start of a later line (a submitted prompt is multiline).
  assert.equal(
    await expandReferenceMentions("two things:\nfix #task:AURA-42", registry, lookup),
    `two things:\nfix ${expansion}`,
  );

  // Fast path: a prompt without references passes through unchanged (the
  // same string) and resolves nothing.
  const fresh = lookupOver(taskItems());
  const plain = "no references in here, just # headings and text";
  assert.equal(await expandReferenceMentions(plain, registry, fresh.lookup), plain);
  assert.equal(fresh.calls.length, 0, "the fast path resolved nothing");
}

console.log("expandReferenceMentions: single mention + fast path: ok");

{
  const { lookup } = lookupOver(taskItems());
  const registry = expansionRegistry();
  const expansion = '<task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>';

  // Mixed known and unknown mentions: the known one expands, the unknown one
  // stays exactly as typed (the agent resolves it via the `aura` skill).
  assert.equal(
    await expandReferenceMentions("compare #task:AURA-42 with #task:AURA-999", registry, lookup),
    `compare ${expansion} with #task:AURA-999`,
  );

  // An all-unknown prompt is left exactly as typed.
  const unknown = "what is #task:AURA-999 about?";
  assert.equal(await expandReferenceMentions(unknown, registry, lookup), unknown);

  // An empty partial (`#task:` with nothing typed yet) resolves nothing and
  // stays as typed.
  const empty = "open #task: for me";
  assert.equal(await expandReferenceMentions(empty, registry, lookup), empty);

  // A targeted fetch that throws leaves the prompt unchanged (never throws
  // into the session): the lookup rejects, the mention stays as typed.
  const rejecting = async () => {
    throw new Error("connection reset");
  };
  assert.equal(
    await expandReferenceMentions("fix #task:AURA-42", registry, rejecting),
    "fix #task:AURA-42",
  );

  // No credentials: the input handler passes null as the lookup (no targeted
  // fetch may be attempted at all). Every mention stays as typed and no
  // lookup is consulted.
  const gated = lookupOver(taskItems());
  assert.equal(
    await expandReferenceMentions("fix #task:AURA-42", registry, null),
    "fix #task:AURA-42",
  );
  assert.equal(gated.calls.length, 0, "a null lookup is never called");
}

console.log("expandReferenceMentions: unresolvable + failure modes: ok");

{
  const registry = expansionRegistry();
  const a42 = '<task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>';
  const a1337 = '<task-ref key="AURA-1337" status="IN_REVIEW">Ship the dashboard</task-ref>';

  // Multiple distinct mentions: each expands in place.
  const distinct = lookupOver(taskItems());
  assert.equal(
    await expandReferenceMentions("#task:AURA-42 and #task:AURA-1337", registry, distinct.lookup),
    `${a42} and ${a1337}`,
  );
  assert.equal(distinct.calls.length, 2, "one resolution per distinct mention");

  // Duplicate mentions: the same token twice resolves ONCE and both
  // occurrences expand.
  const dup = lookupOver(taskItems());
  assert.equal(
    await expandReferenceMentions("#task:AURA-42 again #task:AURA-42", registry, dup.lookup),
    `${a42} again ${a42}`,
  );
  assert.equal(dup.calls.length, 1, "a duplicate mention resolves once");

  // Case-insensitive duplicates too: same key, different typed casing, still
  // one resolution.
  const mixedCase = lookupOver(taskItems());
  assert.equal(
    await expandReferenceMentions("#task:AURA-42 and #task:aura-42", registry, mixedCase.lookup),
    `${a42} and ${a42}`,
  );
  assert.equal(mixedCase.calls.length, 1, "casing does not multiply resolutions");

  // Case-insensitive token matching with canonical key output: a lowercase
  // typed key resolves and the expansion carries the server-cased key.
  const lower = lookupOver(taskItems());
  assert.equal(await expandReferenceMentions("see #task:aura-42", registry, lower.lookup), `see ${a42}`);
  assert.deepEqual(lower.calls, [{ kind: "task", token: "aura-42" }]);
}

console.log("expandReferenceMentions: multiple + duplicate + case-insensitive: ok");

// ---------------------------------------------------------------------------
// Expansion format (criterion 1): <task-ref key status>title</task-ref>,
// title XML-escaped, attribute values escaped for "", &, <
// ---------------------------------------------------------------------------

{
  const adapter = createTaskAdapter({
    createClient: async () => {
      throw new Error("no credentials in this test");
    },
  });

  // The format: key and status as attributes, title as element text.
  assert.equal(
    adapter.formatExpansion({ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }),
    '<task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>',
  );

  // A title containing &, < and " is XML-escaped in element text (& and <
  // escaped; " and > need no escaping there) and never truncated.
  assert.equal(
    adapter.formatExpansion({ kind: "task", id: "u2", key: "AURA-7", title: 'Q&A <review> "draft"', status: "OPEN" }),
    '<task-ref key="AURA-7" status="OPEN">Q&amp;A &lt;review> "draft"</task-ref>',
  );

  // Key and status attribute values are escaped for ", & and < (> needs no
  // escaping in an attribute value either).
  assert.equal(
    adapter.formatExpansion({ kind: "task", id: "u3", key: 'A"K&<S>', title: "t", status: 'O"S&<T>' }),
    '<task-ref key="A&quot;K&amp;&lt;S>" status="O&quot;S&amp;&lt;T>">t</task-ref>',
  );

  // A missing status expands with an empty attribute rather than undefined.
  assert.equal(
    adapter.formatExpansion({ kind: "task", id: "u4", key: "AURA-9", title: "t" }),
    '<task-ref key="AURA-9" status="">t</task-ref>',
  );
}

console.log("expansion format + escaping (task-ref tag): ok");

{
  const registry = expansionRegistry();
  const { lookup } = lookupOver([
    { kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
  ]);
  const expansion = '<task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>';

  // A mention adjacent to punctuation keeps the engine token grammar (the
  // token is the run of non-whitespace after `#kind:`): a trailing comma is
  // part of the typed token, so it does not resolve and stays exactly as
  // typed; a `#` after `(` is not a token boundary, so the mention is not a
  // token at all. (The grammar is kind-agnostic: stripping trailing
  // punctuation here would mangle future kinds' keys, e.g. wiki paths.)
  assert.equal(
    await expandReferenceMentions("fix #task:AURA-42, please", registry, lookup),
    "fix #task:AURA-42, please",
  );
  assert.equal(
    await expandReferenceMentions("(#task:AURA-42)", registry, lookup),
    "(#task:AURA-42)",
  );

  // An expansion that makes the prompt longer than before is used in full:
  // no truncation (the exact expanded text, longer than the input).
  const typed = "fix #task:AURA-42";
  const expanded = await expandReferenceMentions(typed, registry, lookup);
  assert.equal(expanded, `fix ${expansion}`);
  assert.ok(expanded.length > typed.length, "the expansion grew the prompt and survived in full");
}

console.log("expandReferenceMentions: punctuation + no-truncation edges: ok");

// ---------------------------------------------------------------------------
// createReferenceAutocompleteProvider (the deferral wiring over the registry)
// ---------------------------------------------------------------------------

/** A fake built-in provider with call counters, always returning a fixed
 *  suggestion so deferral is observable. */
function fakeCurrent(suggestions = { items: [{ value: "file.txt", label: "file.txt" }], prefix: "f" }) {
  const calls = { suggestions: 0, fileCompletion: 0, applyCompletion: 0 };
  return {
    calls,
    provider: {
      triggerCharacters: ["@"],
      getSuggestions: async () => {
        calls.suggestions += 1;
        return suggestions;
      },
      applyCompletion: (lines: string[], cursorLine: number, cursorCol: number) => {
        calls.applyCompletion += 1;
        return { lines, cursorLine, cursorCol };
      },
      shouldTriggerFileCompletion: () => {
        calls.fileCompletion += 1;
        return true;
      },
    },
  };
}

const noopClient = async () => {
  throw new Error("no credentials");
};

function taskItems(): ReferenceItem[] {
  return [
    { kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
    { kind: "task", id: "u3", key: "AURA-424", title: "Refactor the renderer", status: "DONE" },
    { kind: "task", id: "u2", key: "AURA-1337", title: "Ship the dashboard", status: "IN_REVIEW" },
  ];
}

function wiredProvider(cache: ReturnType<typeof createInMemoryReferenceCache> | null) {
  const current = fakeCurrent();
  const adapter = createTaskAdapter({ createClient: noopClient });
  const registry = createReferenceRegistry([adapter]);
  const provider = createReferenceAutocompleteProvider(current.provider, registry, () => cache);
  return { current, provider, registry };
}

async function suggestAt(provider: ReturnType<typeof createReferenceAutocompleteProvider>["provider"], line: string, col: number) {
  return provider.getSuggestions([line], 0, col, { signal: new AbortController().signal });
}

{
  const cache = createInMemoryReferenceCache();
  cache.write("task", taskItems());
  const { current, provider } = wiredProvider(cache);
  const defer = current.calls.suggestions;

  // Non-reference tokens defer: a heading, a mid-word #, an unregistered
  // kind, a token that already ended.
  assert.deepEqual(await suggestAt(provider, "# Heading", 9), { items: [{ value: "file.txt", label: "file.txt" }], prefix: "f" });
  assert.equal(current.calls.suggestions, defer + 1);
  await suggestAt(provider, "foo#task:", 9);
  await suggestAt(provider, "#rule:tracker-aura", 18);
  await suggestAt(provider, "#task:42 ", 9);
  assert.equal(current.calls.suggestions, defer + 4, "every non-reference token deferred");

  // Zero-match partial defers to the built-in provider.
  await suggestAt(provider, "#task:zzz", 9);
  assert.equal(current.calls.suggestions, defer + 5);

  // `#task:` with an empty partial shows the head of the cache.
  const head = await suggestAt(provider, "#task:", 6);
  assert.deepEqual(head?.items.map((i) => i.value), ["#task:AURA-42", "#task:AURA-424", "#task:AURA-1337"]);
  assert.equal(head?.prefix, "#task:");

  // `#task:42` matches by number prefix; `#task:login` by title substring;
  // `#TASK:` matches case-insensitively and the completion prefix keeps the
  // typed casing (only the typed token is replaced).
  assert.deepEqual((await suggestAt(provider, "#task:42", 8))?.items.map((i) => i.value), ["#task:AURA-42", "#task:AURA-424"]);
  assert.deepEqual((await suggestAt(provider, "#task:login", 11))?.items.map((i) => i.value), ["#task:AURA-42"]);
  const upper = await suggestAt(provider, "#TASK:", 6);
  assert.deepEqual(upper?.items.map((i) => i.value), ["#task:AURA-42", "#task:AURA-424", "#task:AURA-1337"]);
  assert.equal(upper?.prefix, "#TASK:");

  // Canonical key casing on selection: a lowercase partial still inserts the
  // server-cased key.
  assert.equal((await suggestAt(provider, "#task:aura", 9))?.items[0]?.value, "#task:AURA-42");

  // Only the token's kind is searched: `dashboard` title-matches
  // "Ship the dashboard"; items of other kinds never leak into task rows
  // (kind isolation is asserted at the cache seam).
  assert.deepEqual((await suggestAt(provider, "#task:dashboard", 15))?.items.map((i) => i.value), ["#task:AURA-1337"]);

  // applyCompletion delegates to the built-in provider (pi owns insertion).
  provider.applyCompletion(["#task:"], 0, 6, { value: "#task:AURA-42", label: "#task:AURA-42" }, "#task:");
  assert.equal(current.calls.applyCompletion, 1);

  // shouldTriggerFileCompletion: we own reference tokens (no file completion),
  // otherwise the built-in decision applies.
  assert.equal(provider.shouldTriggerFileCompletion?.(["#task:"], 0, 6), false);
  assert.equal(current.calls.fileCompletion, 0, "no deferral on a reference token");
  assert.equal(provider.shouldTriggerFileCompletion?.(["plain text"], 0, 10), true);
  assert.equal(current.calls.fileCompletion, 1, "deferred to the built-in decision");

  // A line-based check: a token at the start of a later line works (the
  // provider is handed one line at a time).
  const multi = await provider.getSuggestions(["hello", "#task:log"], 1, 9, { signal: new AbortController().signal });
  assert.deepEqual(multi?.items.map((i) => i.value), ["#task:AURA-42"]);
}

console.log("provider suggestions + deferral: ok");

// ---------------------------------------------------------------------------
// Failure modes: no credentials, empty cache, current without hooks
// ---------------------------------------------------------------------------

{
  // No credentials (null cache): the provider defers, nothing throws.
  const missing = wiredProvider(null);
  const deferred = await suggestAt(missing.provider, "#task:", 6);
  assert.deepEqual(deferred?.items[0]?.value, "file.txt");
  assert.equal(missing.current.calls.suggestions, 1);

  // Empty cache (credentials ok, warmup returned nothing yet): defers too.
  const empty = wiredProvider(createInMemoryReferenceCache());
  assert.deepEqual((await suggestAt(empty.provider, "#task:", 6))?.items[0]?.value, "file.txt");

  // A built-in provider without shouldTriggerFileCompletion: our hook falls
  // back to true (do not block file completion on non-reference tokens).
  const bare = fakeCurrent();
  const bareProvider = { ...bare.provider } as Record<string, unknown>;
  delete bareProvider.shouldTriggerFileCompletion;
  const adapter = createTaskAdapter({ createClient: noopClient });
  const registry = createReferenceRegistry([adapter]);
  const overlay = createReferenceAutocompleteProvider(
    bareProvider as unknown as Parameters<typeof createReferenceAutocompleteProvider>[0],
    registry,
    () => createInMemoryReferenceCache(),
  );
  assert.equal(overlay.shouldTriggerFileCompletion?.(["plain"], 0, 5), true);
  assert.equal(overlay.shouldTriggerFileCompletion?.(["#task:"], 0, 6), false);
}

console.log("provider failure modes (defer, no throw): ok");

// ---------------------------------------------------------------------------
// parsePartial decline deferral (the wiki uuid-vs-path discrimination hook)
// ---------------------------------------------------------------------------

{
  // parsePartial returning null is the per-kind decline hook the wiki kind
  // (later ticket) will use to discriminate uuid vs path partials. A declined
  // partial is not a reference token, so the provider defers to the built-in
  // provider. The stub's searchLocal returns a row on purpose: the deferral
  // must come from the decline, not from an empty local search.
  const current = fakeCurrent();
  const declining = {
    ...stubAdapter("wiki"),
    parsePartial: () => null,
    searchLocal: () => [{ value: "#wiki:row", label: "#wiki:row" }],
  };
  const registry = createReferenceRegistry([
    createTaskAdapter({ createClient: noopClient }),
    declining,
  ]);
  const provider = createReferenceAutocompleteProvider(current.provider, registry, () =>
    createInMemoryReferenceCache(),
  );
  assert.deepEqual(await suggestAt(provider, "#wiki:abc/def", 13), {
    items: [{ value: "file.txt", label: "file.txt" }],
    prefix: "f",
  });
  assert.equal(current.calls.suggestions, 1, "declined partial deferred to the built-in provider");
}

console.log("parsePartial decline deferral: ok");

// ---------------------------------------------------------------------------
// Alias registry API (criterion: register a legacy token pattern to a kind
// adapter) + recognition comes from registration
// ---------------------------------------------------------------------------

{
  // A registry before any alias registration (a fresh engine, or a
  // credential-less test wiring): legacy syntax is not recognized until
  // something calls registerAlias. The production wiring registers `@AURA-`
  // via createAuraTaskAlias (the blocks below pin that registration).
  const bare = expansionRegistry();
  assert.equal(bare.aliases.length, 0, "a registry without registrations has an empty alias table");
  assert.equal(extractReferenceToken("see @AURA-42", bare), null, "legacy syntax is unrecognized without a registered alias");

  // The registration API: a legacy token pattern mapped to a kind adapter,
  // registered on the built registry (the same call the production wiring
  // makes for `@AURA-`, and the one the rule ticket will make for `@rule:`).
  // Capture group 1 is the token text the kind adapter sees in both uses: the
  // autocomplete partial while typing and the full key on submit, so the
  // pattern captures the full key minus the trigger char (`@AURA-42` ->
  // "AURA-42").
  const registry = expansionRegistry();
  const auraAlias = { pattern: /(?:^|[ \t])@(AURA-[^\s]*)$/i, kind: "task" };
  registry.registerAlias(auraAlias);
  assert.equal(registry.aliases.length, 1, "registerAlias adds to the alias table");

  // Recognition: the registered alias extracts like any reference token
  // (kind + partial + raw + the matched registration) and dispatches to the
  // alias's kind adapter.
  assert.deepEqual(
    extractReferenceToken("see @AURA-42", registry),
    { kind: "task", partial: "AURA-42", raw: "@AURA-42", alias: auraAlias },
  );

  // Expansion routing: the alias mention resolves through the injected lookup
  // and renders through the task adapter's formatExpansion (the uniform tag).
  const { lookup } = lookupOver(taskItems());
  const expansion = '<task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>';
  assert.equal(await expandReferenceMentions("see @AURA-42", registry, lookup), `see ${expansion}`);

  // Alias mentions and `#kind:` mentions mix freely in one prompt.
  const a1337 = '<task-ref key="AURA-1337" status="IN_REVIEW">Ship the dashboard</task-ref>';
  assert.equal(
    await expandReferenceMentions("@AURA-42 and #task:AURA-1337", registry, lookup),
    `${expansion} and ${a1337}`,
  );

  // An unresolvable alias mention stays exactly as typed.
  assert.equal(await expandReferenceMentions("see @AURA-999", registry, lookup), "see @AURA-999");

  // An alias registered to a kind with no adapter: recognized as a mention,
  // but expansion has no adapter to route to, so it stays as typed.
  const wikiAlias = { pattern: /(?:^|[ \t])@wiki:([^\s]*)$/i, kind: "wiki" };
  registry.registerAlias(wikiAlias);
  assert.deepEqual(
    extractReferenceToken("see @wiki:home", registry),
    { kind: "wiki", partial: "home", raw: "@wiki:home", alias: wikiAlias },
  );
  assert.equal(await expandReferenceMentions("see @wiki:home", registry, lookup), "see @wiki:home");

  // The warning is user-only: nothing deprecation-shaped is ever added to
  // the prompt (the factory wiring surfaces it via ctx.ui.notify instead).
  const expanded = await expandReferenceMentions("see @AURA-42", registry, lookup);
  assert.ok(!/deprecat/i.test(expanded), "no deprecation warning lands in the prompt");
}

console.log("alias registry registration + expansion routing: ok");

// ---------------------------------------------------------------------------
// The production `@AURA-` alias (createAuraTaskAlias): recognition at
// boundaries, legacy-token autocomplete rows, expansion routing, and the
// warning trigger, all through the real registration
// ---------------------------------------------------------------------------

/** The production-shaped registry: the task adapter plus its `@AURA-`
 *  legacy alias, exactly as the extension factory registers them. The
 *  adapter's client factory always throws, so a test can never reach Aura
 *  through it. */
function auraAliasRegistry() {
  const adapter = createTaskAdapter({ createClient: noopClient });
  const registry = createReferenceRegistry([adapter]);
  registry.registerAlias(createAuraTaskAlias(adapter));
  return registry;
}

{
  // Recognition through the real pattern: `@AURA-` at a token boundary
  // followed by digits, group 1 = the full key minus the trigger char.
  const registry = auraAliasRegistry();
  assert.equal(registry.aliases.length, 1, "the production wiring registers exactly one alias");
  assert.equal(registry.aliases[0]?.kind, "task", "the alias maps to the task kind");

  // At the start of the line, cursor at the end of the token.
  assert.deepEqual(
    extractReferenceToken("@AURA-42", registry),
    { kind: "task", partial: "AURA-42", raw: "@AURA-42", alias: registry.aliases[0] },
  );
  // After whitespace; case-insensitive trigger keeps working.
  assert.deepEqual(
    extractReferenceToken("work on @aura-1337", registry),
    { kind: "task", partial: "aura-1337", raw: "@aura-1337", alias: registry.aliases[0] },
  );
  // The user is still typing digits: the partial is the full key so far.
  assert.equal(extractReferenceToken("@AURA-4", registry)?.partial, "AURA-4");

  // `@AURA-` with no digits yet: no match (suggestions start at the first
  // digit; a bare `@AURA-` never triggers the warning either).
  assert.equal(extractReferenceToken("@AURA-", registry), null);
  assert.equal(extractReferenceToken("@AURA", registry), null);
  // Letters glued after the digits end the token (the legacy grammar).
  assert.equal(extractReferenceToken("@AURA-12abc", registry), null);
  // A mid-word `@` is not a token boundary (emails, paths).
  assert.equal(extractReferenceToken("email@AURA-42", registry), null);
  // A token that already ended (whitespace after the digits) defers.
  assert.equal(extractReferenceToken("@AURA-42 ", registry), null);
}

console.log("production @AURA- alias recognition: ok");

{
  // Autocomplete through the real registration: the same task suggestions
  // as `#task:`, but selection inserts the LEGACY token (the user stays in
  // the syntax they typed; the warning teaches the new one).
  const registry = auraAliasRegistry();
  const cache = createInMemoryReferenceCache();
  cache.write("task", taskItems());
  const current = fakeCurrent();
  const provider = createReferenceAutocompleteProvider(current.provider, registry, () => cache);

  // The engine declares both trigger characters it serves: `#kind:` tokens
  // and the `@`-triggered legacy aliases.
  assert.deepEqual(provider.triggerCharacters, ["#", "@"]);

  // Typing `@AURA-4` offers the same rows `#task:4` would, with the legacy
  // token as value/label and the adapter's description.
  const s4 = await suggestAt(provider, "@AURA-4", 7);
  assert.deepEqual(s4?.items.map((i) => i.value), ["@AURA-42", "@AURA-424"]);
  assert.equal(s4?.prefix, "@AURA-4", "the typed legacy token is the replaced prefix");
  assert.equal(s4?.items[0]?.label, "@AURA-42");
  assert.equal(s4?.items[0]?.description, "[OPEN] Fix the login bug", "the row keeps the adapter's description");

  // Case-insensitive typing, and the same digit-prefix set the old number
  // filter produced (42 matches AURA-42 and AURA-424).
  assert.deepEqual((await suggestAt(provider, "@aura-4", 7))?.items.map((i) => i.value), ["@AURA-42", "@AURA-424"]);
  assert.deepEqual((await suggestAt(provider, "@AURA-42", 8))?.items.map((i) => i.value), ["@AURA-42", "@AURA-424"]);

  // The engine owns the alias token: no file completion while completing it.
  assert.equal(provider.shouldTriggerFileCompletion?.(["@AURA-4"], 0, 7), false);

  // Deferral: a bare `@AURA-` (no digits), a zero-match number, and a
  // mid-word `@` all defer to the built-in provider.
  const defer = current.calls.suggestions;
  await suggestAt(provider, "@AURA-", 6);
  await suggestAt(provider, "@AURA-999", 9);
  await suggestAt(provider, "email@AURA-42", 13);
  assert.equal(current.calls.suggestions, defer + 3, "every non-alias `@` token deferred");

  // Without credentials (the session cache gate is null): the alias
  // autocomplete silently defers; nothing throws into the session.
  const gated = fakeCurrent();
  const gatedProvider = createReferenceAutocompleteProvider(gated.provider, registry, () => null);
  const deferred = await suggestAt(gatedProvider, "@AURA-42", 8);
  assert.deepEqual(deferred?.items[0]?.value, "file.txt");
  assert.equal(gated.calls.suggestions, 1);
}

console.log("production @AURA- alias autocomplete: ok");

{
  // Expansion routing: the alias mention resolves through the task adapter's
  // resolveFullToken (cache-first, then the targeted getTaskByHumanKey
  // fallback) and renders the same <task-ref> tag as `#task:`. AURA-42 is
  // cached; AURA-1337 must come from the targeted fallback; AURA-999 is
  // unknown everywhere.
  const keyLookups: string[] = [];
  const adapter = createTaskAdapter({
    createClient: async () => ({
      listTasks: async () => ({ items: [], pagination: {} }),
      getTaskByHumanKey: async (key: string) => {
        keyLookups.push(key);
        if (key.toLowerCase() === "aura-1337") {
          return { id: "u2", human_key: "AURA-1337", title: "Ship the dashboard", status: "IN_REVIEW" };
        }
        throw new Error("404 not found");
      },
    }),
  });
  const registry = createReferenceRegistry([adapter]);
  registry.registerAlias(createAuraTaskAlias(adapter));
  const cache = createInMemoryReferenceCache();
  cache.write("task", [
    { kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
  ]);
  // The factory's lookup wiring, verbatim: the kind adapter's resolveFullToken
  // over the session cache.
  const lookup = (kind: string, token: string) => {
    const a = registry.kinds.get(kind);
    return a ? a.resolveFullToken(token, cache) : Promise.resolve(null);
  };

  const a42 = '<task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>';
  const a1337 = '<task-ref key="AURA-1337" status="IN_REVIEW">Ship the dashboard</task-ref>';

  // A cached alias mention expands to exactly the tag `#task:AURA-42`
  // expands to (one expansion format regardless of how the reference was
  // typed), with no targeted fetch at all.
  assert.equal(await expandReferenceMentions("work on @AURA-42 today", registry, lookup), `work on ${a42} today`);
  assert.deepEqual(keyLookups, [], "a cached alias mention attempts no targeted fetch");

  // A cache miss resolves through the targeted fallback; a lowercase typed
  // key expands with the canonical (server-cased) key.
  assert.equal(await expandReferenceMentions("see @aura-1337", registry, lookup), `see ${a1337}`);
  assert.deepEqual(keyLookups, ["aura-1337"], "the alias mention routed through the task adapter's fallback");

  // Legacy and new syntax side by side: both expand through the same adapter
  // to the same tag shape; two legacy mentions in one prompt both expand.
  const sideBySide = await expandReferenceMentions("@AURA-42 and #task:AURA-1337", registry, lookup);
  assert.equal(sideBySide, `${a42} and ${a1337}`);
  assert.ok(sideBySide.includes("<task-ref"), "the uniform tag is emitted");
  assert.ok(!sideBySide.includes("<aura-task"), "<aura-task> is never emitted");
  assert.equal(
    await expandReferenceMentions("@AURA-42 plus @aura-1337", registry, lookup),
    `${a42} plus ${a1337}`,
  );

  // An unknown key is looked up once, then left exactly as typed so the
  // agent can resolve it via the `aura` skill.
  const before = keyLookups.length;
  assert.equal(await expandReferenceMentions("what is @AURA-999 about?", registry, lookup), "what is @AURA-999 about?");
  assert.deepEqual(keyLookups.slice(before), ["AURA-999"], "the unknown key was looked up before giving up");

  // Without credentials the input handler passes null as the lookup: no
  // targeted fetch is attempted at all, the mention stays as typed.
  assert.equal(await expandReferenceMentions("fix @AURA-42", registry, null), "fix @AURA-42");
}

console.log("production @AURA- alias expansion routing: ok");

{
  // promptHasLegacyMention: the deprecation-warning trigger (pure). Fires on
  // the submitted prompt, whatever the mention's resolvability.
  const registry = auraAliasRegistry();

  assert.equal(promptHasLegacyMention("fix @AURA-42 today", registry), true);
  assert.equal(promptHasLegacyMention("@aura-7", registry), true);
  // Start of a later line in a multiline prompt.
  assert.equal(promptHasLegacyMention("two things:\n@AURA-42 and done", registry), true);
  // Two mentions in one prompt: one trigger (the once-latch lives in the
  // decision, not here).
  assert.equal(promptHasLegacyMention("@AURA-42 and @AURA-1337", registry), true);

  // `@AURA-` with no digits: no mention, no warning.
  assert.equal(promptHasLegacyMention("bare @AURA- alone", registry), false);
  // Letters glued after the digits: not a mention.
  assert.equal(promptHasLegacyMention("@AURA-42abc", registry), false);
  // A mid-word `@` is not at a boundary.
  assert.equal(promptHasLegacyMention("email@AURA-42.com", registry), false);
  // The new syntax never warns, nor does an alias-less registry.
  assert.equal(promptHasLegacyMention("#task:AURA-42 is the new syntax", registry), false);
  assert.equal(promptHasLegacyMention("plain prompt", registry), false);
  assert.equal(promptHasLegacyMention("fix @AURA-42", expansionRegistry()), false);
}

console.log("promptHasLegacyMention (warning trigger): ok");

{
  // The factory's composition: the warning fires iff the prompt contains a
  // legacy mention AND the once-per-session decision fires, in that order (a
  // new-syntax prompt never consumes the latch).
  const registry = auraAliasRegistry();
  const warn = createDeprecationWarningDecision();
  const shouldWarn = (prompt: string) => promptHasLegacyMention(prompt, registry) && warn();
  assert.equal(shouldWarn("@AURA-42 hi"), true, "the first submitted legacy mention warns");
  assert.equal(shouldWarn("#task:AURA-42 is new"), false, "new syntax never warns");
  assert.equal(shouldWarn("@AURA-42 again"), false, "exactly once per session");
  assert.equal(shouldWarn("@aura-1337 later"), false);

  // A new session (a fresh decision, as session_start builds one per
  // session) re-arms the warning.
  const next = createDeprecationWarningDecision();
  const shouldWarnNext = (prompt: string) => promptHasLegacyMention(prompt, registry) && next();
  assert.equal(shouldWarnNext("@AURA-42"), true, "a new session re-arms the warning");
}

console.log("deprecation-warning composition (once per session): ok");

// ---------------------------------------------------------------------------
// Once-per-session deprecation-warning decision (user-only: surfaces via
// ctx.ui.notify in the factory wiring, never in the prompt)
// ---------------------------------------------------------------------------

{
  // First call in a session: warn now. Every later call in the same session:
  // no. Exactly one warning per session no matter how often the decision is
  // consulted.
  const warn = createDeprecationWarningDecision();
  assert.equal(warn(), true, "the first alias mention in a session warns");
  assert.equal(warn(), false);
  assert.equal(warn(), false, "exactly once per session");

  // The flag resets per session: a fresh session (a fresh decision, as the
  // factory builds one per session_start) warns again, once.
  const nextSession = createDeprecationWarningDecision();
  assert.equal(nextSession(), true, "a new session re-arms the warning");
  assert.equal(nextSession(), false);
}

console.log("once-per-session deprecation-warning decision: ok");

// ---------------------------------------------------------------------------
// resolveFullToken (the input handler's resolution flow at the adapter
// interface): cache-first, then the targeted getTaskByHumanKey fallback;
// unresolvable is null (the mention stays as typed upstream)
// ---------------------------------------------------------------------------

{
  // A counting client factory: a cache hit must build no client at all (no
  // targeted fetch); only the fallback reaches Aura.
  let clientBuilds = 0;
  const adapter = createTaskAdapter({
    createClient: async () => {
      clientBuilds += 1;
      return {
        listTasks: async () => ({ items: [], pagination: {} }),
        getTaskByHumanKey: async (key: string) => {
          if (key.toUpperCase() === "AURA-1337") {
            return { id: "u2", human_key: "AURA-1337", title: "Ship the dashboard", status: "IN_REVIEW" };
          }
          throw new Error("404 not found");
        },
      };
    },
  });
  const cache = createInMemoryReferenceCache(() => 5000);
  cache.write("task", [{ kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN" }]);

  // Cache hit (case-insensitive): resolved from the cache, no client built,
  // no targeted fetch.
  assert.deepEqual(
    await adapter.resolveFullToken("aura-42", cache),
    { kind: "task", id: "u1", key: "AURA-42", title: "Fix the login bug", status: "OPEN", fetchedAt: 5000 },
  );
  assert.equal(clientBuilds, 0, "a cache hit builds no client");

  // Cache miss: the targeted getTaskByHumanKey fallback resolves (typed
  // casing differs; the expansion carries the canonical server key).
  assert.deepEqual(
    await adapter.resolveFullToken("aura-1337", cache),
    { kind: "task", id: "u2", key: "AURA-1337", title: "Ship the dashboard", status: "IN_REVIEW" },
  );
  assert.equal(clientBuilds, 1, "the fallback built exactly one client");

  // Targeted fetch miss (unknown key): null, so the mention stays as typed.
  assert.equal(await adapter.resolveFullToken("AURA-999", cache), null);

  // Targeted fetch throws (network failure, missing credentials): null, and
  // nothing throws into the session.
  assert.equal(await adapter.resolveFullToken("AURA-404", cache), null);
  assert.equal(clientBuilds, 3, "each fallback attempt built one client");
}

console.log("resolveFullToken cache-first + targeted fallback: ok");

// ---------------------------------------------------------------------------
// REFERENCE_INSTRUCTION (the per-turn system-prompt block: task-ref + rule-ref)
// ---------------------------------------------------------------------------

{
  assert.ok(REFERENCE_INSTRUCTION.includes("<task-ref"), "shows the task-ref tag shape");
  assert.ok(REFERENCE_INSTRUCTION.includes("<rule-ref"), "shows the rule-ref tag shape");
  assert.ok(REFERENCE_INSTRUCTION.includes("key="), "names the task key attribute");
  assert.ok(REFERENCE_INSTRUCTION.includes("status="), "names the task status attribute");
  assert.ok(REFERENCE_INSTRUCTION.includes("name="), "names the rule name attribute");
  assert.ok(REFERENCE_INSTRUCTION.includes("attach="), "names the rule attach attribute");
  assert.ok(/element text is the task title/.test(REFERENCE_INSTRUCTION), "names the task title part");
  assert.ok(/display title as the element text/.test(REFERENCE_INSTRUCTION), "names the rule display title part");
  assert.ok(REFERENCE_INSTRUCTION.includes("aura"), "points at the aura skill for task references");
  assert.ok(/SKILL\.md/.test(REFERENCE_INSTRUCTION), "tells the agent how to load the skill");
  assert.ok(
    /body is injected into the system prompt for this turn/.test(REFERENCE_INSTRUCTION),
    "documents the rule body injection",
  );
  assert.ok(REFERENCE_INSTRUCTION.startsWith("\n## "), "starts with a markdown heading");
}

console.log("REFERENCE_INSTRUCTION: ok");

// ---------------------------------------------------------------------------
// The rule kind (the first local-only kind): ruleToReferenceItem +
// filterRuleItems (name-substring search over the loaded rules)
// ---------------------------------------------------------------------------

/** Rule fixtures: manual, glob, and always attach modes, a frontmatter
 *  display name differing from the filename (tracker-aura), hyphens and
 *  digits (api-v2-logging), and a title that no name substring reaches. */
function testRules(): Rule[] {
  return [
    { name: "tracker-aura", displayName: "Tracker Aura", path: "/x", relPath: "tracker-aura.mdc", attach: "manual", globs: [], body: "Use the Aura tracker.", full: "" },
    { name: "tracker-jira", path: "/x", relPath: "tracker-jira.mdc", attach: "manual", globs: [], body: "Use Jira.", full: "" },
    { name: "general-markdown-format", displayName: "Markdown Format", path: "/x", relPath: "general-markdown-format.mdc", attach: "glob", globs: ["**/*.md"], body: "Format markdown.", full: "" },
    { name: "general-code-quality", path: "/x", relPath: "general-code-quality.mdc", attach: "always", globs: [], body: "Be excellent.", full: "" },
    { name: "api-v2-logging", path: "/x", relPath: "api-v2-logging.mdc", attach: "manual", globs: [], body: "Log v2 APIs.", full: "" },
  ];
}

{
  // The mapping: kind rule, id = the relPath (stable and unique across
  // subdirectories), key = the rule name (the token key), title = the
  // display title (frontmatter name falling back to the rule name),
  // status = the attach summary (the row description source).
  const items = testRules().map(ruleToReferenceItem);
  assert.deepEqual(
    items[0],
    { kind: "rule", id: "tracker-aura.mdc", key: "tracker-aura", title: "Tracker Aura", status: "manual" },
  );
  assert.deepEqual(
    items[1],
    { kind: "rule", id: "tracker-jira.mdc", key: "tracker-jira", title: "tracker-jira", status: "manual" },
    "no frontmatter name: the display title falls back to the rule name",
  );
  assert.equal(items[2]?.status, "glob: **/*.md", "glob rules carry their patterns");
  assert.equal(items[2]?.title, "Markdown Format");
  assert.equal(items[3]?.status, "always");
  assert.equal(items[4]?.key, "api-v2-logging", "names with hyphens and digits map through");

  // Filtering: rule-name substring, case-insensitive, loaded order, capped.
  const keys = (partial: string, max?: number) =>
    filterRuleItems(items, partial, max).map((i) => i.key);
  assert.deepEqual(
    keys(""),
    ["tracker-aura", "tracker-jira", "general-markdown-format", "general-code-quality", "api-v2-logging"],
    "an empty partial lists all loaded rules",
  );
  assert.deepEqual(keys("track"), ["tracker-aura", "tracker-jira"], "name substring");
  assert.deepEqual(keys("TRACK"), ["tracker-aura", "tracker-jira"], "case-insensitive");
  assert.deepEqual(keys("v2"), ["api-v2-logging"], "digits");
  assert.deepEqual(keys("jira"), ["tracker-jira"]);
  assert.deepEqual(keys("zzz"), []);
  assert.deepEqual(keys("", 2), ["tracker-aura", "tracker-jira"], "the cap applies");

  // Display titles are never searched (name substring only): a title hit
  // with no name hit yields nothing.
  const exotic: ReferenceItem[] = [
    { kind: "rule", id: "z.mdc", key: "z-rule", title: "Exotic Zebra", status: "manual" },
  ];
  assert.deepEqual(filterRuleItems(exotic, "zebra"), []);
  assert.deepEqual(filterRuleItems(exotic, "z-rul"), exotic);

  // Duplicate names across subdirectories: both match (distinct ids).
  const dupRules: Rule[] = [
    { name: "tracker-aura", path: "/a", relPath: "a/tracker-aura.mdc", attach: "manual", globs: [], body: "A body.", full: "" },
    { name: "tracker-aura", path: "/b", relPath: "b/tracker-aura.mdc", attach: "glob", globs: ["**/*.ts"], body: "B body.", full: "" },
  ];
  assert.deepEqual(
    filterRuleItems(dupRules.map(ruleToReferenceItem), "tracker").map((i) => i.id),
    ["a/tracker-aura.mdc", "b/tracker-aura.mdc"],
    "both duplicates match",
  );
}

console.log("ruleToReferenceItem + filterRuleItems: ok");

// ---------------------------------------------------------------------------
// createRuleAdapter: rows, expansion (all local, no cache rows)
// ---------------------------------------------------------------------------

{
  const adapter = createRuleAdapter({ getRules: () => testRules() });
  assert.equal(adapter.kind, "rule");
  assert.equal(RULE_KIND, "rule");
  assert.equal(adapter.local, true, "the rule kind is the local-only kind");
  assert.equal(adapter.parsePartial("track"), "track");

  // Rows: `#rule:<name>` with the attach mode as the description, matching
  // the information the legacy `@rule:` rows carry.
  assert.deepEqual(
    adapter.formatRow({ kind: "rule", id: "x", key: "tracker-aura", title: "Tracker Aura", status: "manual" }),
    { value: "#rule:tracker-aura", label: "#rule:tracker-aura", description: "(manual)" },
  );
  assert.equal(
    adapter.formatRow({ kind: "rule", id: "x", key: "general-markdown-format", title: "Markdown Format", status: "glob: **/*.md" }).description,
    "(glob: **/*.md)",
  );
  assert.equal(
    adapter.formatRow({ kind: "rule", id: "x", key: "k", title: "t", status: "always" }).description,
    "(always)",
  );
  assert.equal(
    adapter.formatRow({ kind: "rule", id: "x", key: "k", title: "t" }).description,
    "(manual)",
    "a statusless item falls back to manual",
  );

  // Local search over the loaded rules; the cache items are never consulted.
  assert.deepEqual(
    adapter.searchLocal([{ kind: "task", id: "u1", key: "AURA-42", title: "cache rows are ignored", status: "OPEN" }], "track").map((r) => r.value),
    ["#rule:tracker-aura", "#rule:tracker-jira"],
  );
  const all = adapter.searchLocal([], "");
  assert.deepEqual(
    all.map((r) => r.value),
    ["#rule:tracker-aura", "#rule:tracker-jira", "#rule:general-markdown-format", "#rule:general-code-quality", "#rule:api-v2-logging"],
  );
  assert.equal(all[0]?.description, "(manual)");
  assert.equal(all[2]?.description, "(glob: **/*.md)");
  assert.deepEqual(adapter.searchLocal([], "zzz"), [], "a zero-match partial offers nothing (the provider defers)");

  // No rules loaded (the no-`.cursor/rules` failure mode): nothing offered.
  const empty = createRuleAdapter({ getRules: () => [] });
  assert.deepEqual(empty.searchLocal([], ""), []);

  // Expansion: the prototype-pinned rule-ref shape, display title as the
  // element text.
  assert.equal(
    adapter.formatExpansion({ kind: "rule", id: "x", key: "tracker-aura", title: "Tracker Aura", status: "manual" }),
    '<rule-ref name="tracker-aura" attach="manual">Tracker Aura</rule-ref>',
  );
  assert.equal(
    adapter.formatExpansion({ kind: "rule", id: "x", key: "general-markdown-format", title: "Markdown Format", status: "glob: **/*.md" }),
    '<rule-ref name="general-markdown-format" attach="glob: **/*.md">Markdown Format</rule-ref>',
  );
  // Attribute values and element text are XML-escaped.
  assert.equal(
    adapter.formatExpansion({ kind: "rule", id: "x", key: 'q&<r>"', title: 'Q&A <r> "t"', status: "manual" }),
    '<rule-ref name="q&amp;&lt;r>&quot;" attach="manual">Q&amp;A &lt;r> "t"</rule-ref>',
  );
  // A statusless item expands with an empty attach attribute.
  assert.equal(
    adapter.formatExpansion({ kind: "rule", id: "x", key: "k", title: "t" }),
    '<rule-ref name="k" attach="">t</rule-ref>',
  );
}

console.log("createRuleAdapter rows + expansion: ok");

// ---------------------------------------------------------------------------
// createRuleAdapter: resolveFullToken (local name match; the cache is never
// consulted; unresolvable is null so the mention stays as typed)
// ---------------------------------------------------------------------------

{
  const adapter = createRuleAdapter({ getRules: () => testRules() });
  const cache = createInMemoryReferenceCache();

  assert.deepEqual(
    await adapter.resolveFullToken("tracker-aura", cache),
    { kind: "rule", id: "tracker-aura.mdc", key: "tracker-aura", title: "Tracker Aura", status: "manual" },
  );
  assert.equal(
    (await adapter.resolveFullToken("TRACKER-AURA", cache))?.key,
    "tracker-aura",
    "case-insensitive match, canonical name out",
  );
  assert.equal(await adapter.resolveFullToken("nope", cache), null, "unknown names are unresolvable (left as typed)");
  assert.equal(await adapter.resolveFullToken("", cache), null);

  // Duplicate names: the first loaded rule wins.
  const dupAdapter = createRuleAdapter({
    getRules: () => [
      { name: "tracker-aura", path: "/a", relPath: "a/tracker-aura.mdc", attach: "manual", globs: [], body: "A body.", full: "" },
      { name: "tracker-aura", path: "/b", relPath: "b/tracker-aura.mdc", attach: "manual", globs: [], body: "B body.", full: "" },
    ],
  });
  assert.equal((await dupAdapter.resolveFullToken("tracker-aura", cache))?.id, "a/tracker-aura.mdc");

  // A rule deleted between loading and submit: unresolvable.
  const rules = [...testRules()];
  const shrinking = createRuleAdapter({ getRules: () => rules });
  rules.length = 0;
  assert.equal(await shrinking.resolveFullToken("tracker-aura", cache), null);

  // Cache rows never answer rule resolution: a rule-shaped item sitting in
  // the cache is not returned (rules are local-only; no cache reads).
  const poisoned = createInMemoryReferenceCache();
  poisoned.write("rule", [{ kind: "rule", id: "ghost.mdc", key: "ghost-rule", title: "Ghost", status: "manual" }]);
  const local = createRuleAdapter({ getRules: () => [] });
  assert.equal(await local.resolveFullToken("ghost-rule", poisoned), null);
}

console.log("createRuleAdapter resolveFullToken: ok");

// ---------------------------------------------------------------------------
// Provider wiring for the rule kind: `#rule:` suggestions through the real
// registry, deferral when there is nothing to offer
// ---------------------------------------------------------------------------

{
  const current = fakeCurrent();
  const registry = createReferenceRegistry([
    createTaskAdapter({ createClient: noopClient }),
    createRuleAdapter({ getRules: () => testRules() }),
  ]);
  const provider = createReferenceAutocompleteProvider(current.provider, registry, () => createInMemoryReferenceCache());

  // Empty partial: all loaded rules, canonical tokens, in loaded order.
  const all = await suggestAt(provider, "#rule:", 6);
  assert.deepEqual(
    all?.items.map((r) => r.value),
    ["#rule:tracker-aura", "#rule:tracker-jira", "#rule:general-markdown-format", "#rule:general-code-quality", "#rule:api-v2-logging"],
  );
  assert.equal(all?.prefix, "#rule:");
  // Substring matching + a case-insensitive kind prefix (canonical insertion).
  assert.deepEqual(
    (await suggestAt(provider, "#rule:track", 11))?.items.map((r) => r.value),
    ["#rule:tracker-aura", "#rule:tracker-jira"],
  );
  assert.deepEqual(
    (await suggestAt(provider, "#RULE:track", 11))?.items.map((r) => r.value),
    ["#rule:tracker-aura", "#rule:tracker-jira"],
  );
  // The engine owns the token: no file completion while completing it.
  assert.equal(provider.shouldTriggerFileCompletion?.(["#rule:track"], 0, 11), false);
  // A zero-match partial defers to the built-in provider.
  const defer = current.calls.suggestions;
  await suggestAt(provider, "#rule:zzz", 10);
  assert.equal(current.calls.suggestions, defer + 1);
  // No rules loaded: defers too.
  const none = createReferenceAutocompleteProvider(
    current.provider,
    createReferenceRegistry([createRuleAdapter({ getRules: () => [] })]),
    () => createInMemoryReferenceCache(),
  );
  await suggestAt(none, "#rule:track", 11);
  assert.equal(current.calls.suggestions, defer + 2);
}

console.log("provider rule suggestions + deferral: ok");

// ---------------------------------------------------------------------------
// Rule expansion end-to-end + the input-transform coexistence wrinkle: the
// engineering-rules resolver must match raw #rule: tokens AND the expanded
// <rule-ref> elements (the engine rewrites mentions before before_agent_start)
// ---------------------------------------------------------------------------

{
  const ruleAdapter = createRuleAdapter({ getRules: () => testRules() });
  const registry = createReferenceRegistry([
    createTaskAdapter({ createClient: noopClient }),
    ruleAdapter,
  ]);
  // The factory's per-kind lookup wiring, verbatim: local kinds resolve
  // without credentials; server kinds only when the client probe succeeded
  // (false here: a credential-less session).
  const clientAvailable = false;
  const lookup = (kind: string, token: string) => {
    const adapter = registry.kinds.get(kind);
    if (!adapter || (!adapter.local && !clientAvailable)) return Promise.resolve(null);
    return adapter.resolveFullToken(token, createInMemoryReferenceCache());
  };

  const expansion = '<rule-ref name="tracker-aura" attach="manual">Tracker Aura</rule-ref>';

  // A resolvable mention expands in place: start, middle, and end of the prompt.
  assert.equal(await expandReferenceMentions("#rule:tracker-aura today", registry, lookup), `${expansion} today`);
  assert.equal(await expandReferenceMentions("work on #rule:tracker-aura today", registry, lookup), `work on ${expansion} today`);
  assert.equal(await expandReferenceMentions("work on #rule:tracker-aura", registry, lookup), `work on ${expansion}`);
  // An uppercase typed name: case-insensitive resolution, canonical output.
  assert.equal(await expandReferenceMentions("see #rule:TRACKER-AURA", registry, lookup), `see ${expansion}`);
  // Unknown names stay exactly as typed.
  assert.equal(await expandReferenceMentions("see #rule:ghost", registry, lookup), "see #rule:ghost");
  // An empty partial stays as typed.
  assert.equal(await expandReferenceMentions("open #rule: for me", registry, lookup), "open #rule: for me");
  // Duplicate mentions: one resolution, every occurrence expands.
  assert.equal(
    await expandReferenceMentions("#rule:tracker-aura twice #rule:tracker-aura", registry, lookup),
    `${expansion} twice ${expansion}`,
  );
  // The rule kind resolves in a credential-less session (local-only), while
  // a task mention in the same session stays as typed (the server gate).
  assert.equal(
    await expandReferenceMentions("#rule:tracker-aura and #task:AURA-42", registry, lookup),
    `${expansion} and #task:AURA-42`,
  );

  // THE WRINKLE: the expanded prompt carries <rule-ref> elements by the
  // time before_agent_start runs, so the engineering-rules resolver must
  // inject the rule body from the element form...
  const expanded = await expandReferenceMentions("work on #rule:tracker-aura today", registry, lookup);
  assert.ok(
    resolveRuleMentions(expanded, testRules()).includes("Use the Aura tracker."),
    "the body injects from the expanded element",
  );
  // ...and from the raw token when the mention was left as typed.
  assert.ok(resolveRuleMentions("work on #rule:tracker-aura today", testRules()).includes("Use the Aura tracker."));
  // Two different rules: both bodies injected once each.
  const two = resolveRuleMentions("#rule:tracker-aura and #rule:tracker-jira", testRules());
  assert.ok(two.includes("Use the Aura tracker."));
  assert.ok(two.includes("Use Jira."));
}

console.log("rule expansion + resolver dual matching (the wrinkle): ok");

// ---------------------------------------------------------------------------
// The production `@rule:` alias (createRuleAlias): recognition at
// boundaries, legacy-token autocomplete rows, expansion routing, and the
// warning latch shared with `@AURA-`, all through the real registration
// ---------------------------------------------------------------------------

/** The production-shaped registry for the rule alias: the task + rule
 *  adapters and both production aliases (`@AURA-`, `@rule:`), exactly as the
 *  extension factory registers them. */
function ruleAliasRegistry(rules: Rule[] = testRules()) {
  const taskAdapter = createTaskAdapter({ createClient: noopClient });
  const ruleAdapter = createRuleAdapter({ getRules: () => rules });
  const registry = createReferenceRegistry([taskAdapter, ruleAdapter]);
  registry.registerAlias(createAuraTaskAlias(taskAdapter));
  registry.registerAlias(createRuleAlias(ruleAdapter, () => rules));
  return registry;
}

{
  // Recognition through the real pattern: `@rule:` at a token boundary,
  // group 1 = the rule name (the alias capture contract: the autocomplete
  // partial while typing, the full key on submit).
  const registry = ruleAliasRegistry();
  assert.equal(registry.aliases.length, 2, "the production wiring registers both aliases");
  assert.equal(registry.aliases[1]?.kind, "rule", "the rule alias maps to the rule kind");

  // Start of the line, after whitespace, cursor at the end of the token.
  assert.deepEqual(
    extractReferenceToken("@rule:tracker-aura", registry),
    { kind: "rule", partial: "tracker-aura", raw: "@rule:tracker-aura", alias: registry.aliases[1] },
  );
  assert.equal(
    extractReferenceToken("work on @rule:tracker-aura", registry)?.partial,
    "tracker-aura",
  );
  // Uppercase is recognized (the `i` flag); the typed casing rides along.
  assert.equal(extractReferenceToken("@RULE:Tracker-Aura", registry)?.partial, "Tracker-Aura");
  // The user is still typing: the partial is the name so far.
  assert.equal(extractReferenceToken("@rule:track", registry)?.partial, "track");
  // An empty name: no match (no suggestions, no warning).
  assert.equal(extractReferenceToken("@rule:", registry), null);
  // A mid-word `@` is not a token boundary (emails, paths).
  assert.equal(extractReferenceToken("email@rule:tracker-aura", registry), null);
  // A token that already ended (whitespace after the name) defers.
  assert.equal(extractReferenceToken("@rule:tracker-aura ", registry), null);
  // Trailing punctuation ends the cursor token (the submit scan still
  // matches the name; see the expansion section).
  assert.equal(extractReferenceToken("@rule:tracker-aura.", registry), null);
}

console.log("production @rule: alias recognition: ok");

{
  // Autocomplete through the real registration: the same rule rows `#rule:`
  // offers, but selection inserts the LEGACY @rule:<name> token (the user
  // stays in the syntax they typed; the warning teaches the new one).
  const registry = ruleAliasRegistry();
  const current = fakeCurrent();
  const provider = createReferenceAutocompleteProvider(current.provider, registry, () => createInMemoryReferenceCache());

  // Typing @rule:track offers the loaded rules as @rule:<name> rows with
  // the attach mode as the description.
  const s = await suggestAt(provider, "@rule:track", 11);
  assert.deepEqual(s?.items.map((r) => r.value), ["@rule:tracker-aura", "@rule:tracker-jira"]);
  assert.equal(s?.prefix, "@rule:track", "the typed legacy token is the replaced prefix");
  assert.equal(s?.items[0]?.label, "@rule:tracker-aura");
  assert.equal(s?.items[0]?.description, "(manual)", "the row keeps the attach description");
  // Glob rules keep their patterns in the description.
  const globs = await suggestAt(provider, "@rule:general", 13);
  assert.deepEqual(
    globs?.items.map((r) => r.value),
    ["@rule:general-markdown-format", "@rule:general-code-quality"],
  );
  assert.equal(globs?.items[0]?.description, "(glob: **/*.md)");
  // Case-insensitive typing offers canonical tokens.
  assert.deepEqual(
    (await suggestAt(provider, "@RULE:track", 11))?.items.map((r) => r.value),
    ["@rule:tracker-aura", "@rule:tracker-jira"],
  );
  // The engine owns the alias token: no file completion while completing it.
  assert.equal(provider.shouldTriggerFileCompletion?.(["@rule:track"], 0, 11), false);

  // Deferral: a bare @rule: (empty name), a zero-match name, and a mid-word
  // `@` all defer to the built-in provider.
  const defer = current.calls.suggestions;
  await suggestAt(provider, "@rule:", 6);
  await suggestAt(provider, "@rule:zzz", 9);
  await suggestAt(provider, "email@rule:tracker-aura", 21);
  assert.equal(current.calls.suggestions, defer + 3, "every non-alias @rule: token deferred");

  // No rules loaded: the alias silently defers; nothing throws.
  const none = ruleAliasRegistry([]);
  const noneProvider = createReferenceAutocompleteProvider(current.provider, none, () => createInMemoryReferenceCache());
  await suggestAt(noneProvider, "@rule:track", 11);
  assert.equal(current.calls.suggestions, defer + 4);
}

console.log("production @rule: alias autocomplete: ok");

{
  // Expansion routing: the alias mention resolves through the rule adapter
  // (local name match) and renders the same <rule-ref> tag as `#rule:`.
  const registry = ruleAliasRegistry();
  const lookup = (kind: string, token: string) => {
    const adapter = registry.kinds.get(kind);
    if (!adapter) return Promise.resolve(null);
    return adapter.resolveFullToken(token, createInMemoryReferenceCache());
  };
  const expansion = '<rule-ref name="tracker-aura" attach="manual">Tracker Aura</rule-ref>';
  const jira = '<rule-ref name="tracker-jira" attach="manual">tracker-jira</rule-ref>';

  // Start, middle, and end of the prompt (the submit scan drops the
  // cursor anchor, so mentions anywhere in a submitted prompt expand).
  assert.equal(await expandReferenceMentions("@rule:tracker-aura today", registry, lookup), `${expansion} today`);
  assert.equal(await expandReferenceMentions("work on @rule:tracker-aura today", registry, lookup), `work on ${expansion} today`);
  assert.equal(await expandReferenceMentions("work on @rule:tracker-aura", registry, lookup), `work on ${expansion}`);
  // Start of a later line in a multiline prompt.
  assert.equal(
    await expandReferenceMentions("two things:\n@rule:tracker-aura and done", registry, lookup),
    `two things:\n${expansion} and done`,
  );
  // Trailing punctuation: the legacy grammar matches the name up to it.
  assert.equal(await expandReferenceMentions("see @rule:tracker-aura.", registry, lookup), `see ${expansion}.`);
  // Uppercase typed name: case-insensitive resolution, canonical output.
  assert.equal(await expandReferenceMentions("see @RULE:TRACKER-AURA", registry, lookup), `see ${expansion}`);
  // Both syntaxes side by side expand to the same tag shape; the rule
  // bodies still inject from both forms (the dual matching).
  const both = await expandReferenceMentions("@rule:tracker-aura and #rule:tracker-jira", registry, lookup);
  assert.equal(both, `${expansion} and ${jira}`);
  const injected = resolveRuleMentions(both, testRules());
  assert.ok(injected.includes("Use the Aura tracker."));
  assert.ok(injected.includes("Use Jira."));
  // Unknown names stay exactly as typed (left for the agent to resolve).
  assert.equal(await expandReferenceMentions("see @rule:ghost", registry, lookup), "see @rule:ghost");
  // An empty name is not a mention.
  assert.equal(await expandReferenceMentions("bare @rule: alone", registry, lookup), "bare @rule: alone");
}

console.log("production @rule: alias expansion routing: ok");

{
  // The shared deprecation-warning latch: promptHasLegacyMention fires on
  // either alias syntax; the once-per-session decision fires exactly once
  // for the first legacy token of either syntax.
  const registry = ruleAliasRegistry();
  assert.equal(promptHasLegacyMention("fix @rule:tracker-aura today", registry), true);
  assert.equal(promptHasLegacyMention("@RULE:tracker-aura", registry), true);
  assert.equal(promptHasLegacyMention("@AURA-42", registry), true);
  assert.equal(promptHasLegacyMention("two things:\n@rule:tracker-aura", registry), true);
  // Neither new syntax warns, nor does a bare @rule:.
  assert.equal(promptHasLegacyMention("#rule:tracker-aura is the new syntax", registry), false);
  assert.equal(promptHasLegacyMention("#task:AURA-42", registry), false);
  assert.equal(promptHasLegacyMention("bare @rule: alone", registry), false);
  assert.equal(promptHasLegacyMention("plain prompt", registry), false);

  // The composition: whichever legacy syntax comes first fires the
  // warning exactly once per session; the other syntax never fires it
  // again (the latch is shared across aliases).
  const warn = createDeprecationWarningDecision();
  const shouldWarn = (prompt: string) => promptHasLegacyMention(prompt, registry) && warn();
  assert.equal(shouldWarn("@AURA-42 first"), true, "the first @AURA- mention warns");
  assert.equal(shouldWarn("@rule:tracker-aura second"), false, "the shared latch is consumed");
  const warn2 = createDeprecationWarningDecision();
  const shouldWarn2 = (prompt: string) => promptHasLegacyMention(prompt, registry) && warn2();
  assert.equal(shouldWarn2("@rule:tracker-aura first"), true, "the first @rule: mention warns too");
  assert.equal(shouldWarn2("@AURA-42 second"), false);
  // A new-syntax prompt never consumes the latch.
  const warn3 = createDeprecationWarningDecision();
  const shouldWarn3 = (prompt: string) => promptHasLegacyMention(prompt, registry) && warn3();
  assert.equal(shouldWarn3("#rule:tracker-aura is new"), false);
  assert.equal(shouldWarn3("@AURA-42 later"), true);
}

console.log("production @rule: alias warning latch (shared with @AURA-): ok");

// ---------------------------------------------------------------------------
// Factory is a function (smoke; the factory itself is pi-runtime verified)
// ---------------------------------------------------------------------------

assert.equal(typeof auraReferences, "function", "default export is a factory function");
console.log("factory: ok");

console.log("\nall aura-references tests passed");
