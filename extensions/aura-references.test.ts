/**
 * Logic tests for the aura-references extension (shared reference engine).
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-references.test.ts
 *
 * Covers the pure seams: `#kind:` token extraction + deferral, the registry
 * (kind prefixes, adapters, dormant alias table), the in-memory reference
 * cache, autocomplete filtering/ranking, the task adapter's warmup + local
 * search, and the provider wiring that defers to the built-in provider for
 * non-reference tokens. The extension factory (which reaches Aura through
 * the dynamic-import seam) is exercised by the pi runtime once credentials
 * are configured, mirroring the `aura-tasks` and `engineering-rules` test
 * files.
 */

import assert from "node:assert/strict";
import auraReferences, {
  createInMemoryReferenceCache,
  createReferenceAutocompleteProvider,
  createReferenceRegistry,
  createTaskAdapter,
  expandReferenceMentions,
  extractReferenceToken,
  filterReferenceItems,
  refreshReferenceKind,
  MAX_SUGGESTIONS,
  type ReferenceItem,
} from "./aura-references.ts";

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

  // Legacy `@AURA-` syntax is untouched by the new engine: the alias table is
  // dormant (empty), so an `@` token never produces a reference token here
  // (aura-tasks.ts still owns `@` on its own trigger character).
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
// Legacy alias recognition hook (dormant in production wiring; the alias
// tickets register `@AURA-` / `@rule:` through it)
// ---------------------------------------------------------------------------

{
  // A registered alias pattern teaches extractReferenceToken a legacy syntax
  // without engine surgery: same extraction shape (kind + partial + raw),
  // dispatching to the alias's kind adapter. No alias is registered in this
  // slice's production wiring, so the hook is dormant there (the `#`-token
  // block above asserts the dormant side: `@AURA-42` extracts to null).
  const aliasRegistry = createReferenceRegistry([stubAdapter("task")], [
    { pattern: /(?:^|[ \t])@AURA-([^\s]*)$/i, kind: "task" },
  ]);

  // `@AURA-42` at a token boundary extracts as a task reference with the
  // typed partial and the raw token (without the leading boundary).
  assert.deepEqual(
    extractReferenceToken("see @AURA-42", aliasRegistry),
    { kind: "task", partial: "42", raw: "@AURA-42" },
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
// Factory is a function (smoke; the factory itself is pi-runtime verified)
// ---------------------------------------------------------------------------

assert.equal(typeof auraReferences, "function", "default export is a factory function");
console.log("factory: ok");

console.log("\nall aura-references tests passed");
