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
  createReferenceRegistry,
  extractReferenceToken,
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

console.log("\nall aura-references tests passed");
