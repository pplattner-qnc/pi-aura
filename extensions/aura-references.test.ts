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
 * are configured, mirroring the aura-tasks engineering-rules test files.
 */

import assert from "node:assert/strict";
import {
  createInMemoryReferenceCache,
  createReferenceRegistry,
  createTaskAdapter,
  extractReferenceToken,
  filterReferenceItems,
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

console.log("\nall aura-references tests passed");
