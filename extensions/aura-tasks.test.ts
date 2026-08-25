/**
 * Logic tests for the aura-tasks extension.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-tasks.test.ts
 *
 * Covers the pure logic only: the `@AURA-` token extractor, the autocomplete
 * filter, the inline expansion, and the unresolved-mention collector. The
 * extension factory (which talks to the AuraClient) is exercised by the pi
 * runtime once credentials are configured, mirroring how `@rule:` is verified.
 */

import assert from "node:assert/strict";
import auraTasks, {
  AURA_TASK_INSTRUCTION,
  collectUnresolvedMentions,
  extractAuraToken,
  expandAuraMentions,
  filterTasks,
  formatExpandedMention,
  type AuraTaskRef,
} from "./aura-tasks.ts";

// ---------------------------------------------------------------------------
// extractAuraToken (the @ deferral contract)
// ---------------------------------------------------------------------------

{
  // @AURA- token at start of line
  assert.equal(extractAuraToken("@AURA-42"), "AURA-42");
  // @AURA- token after whitespace, cursor right after the token
  assert.equal(extractAuraToken("work on @AURA-1337"), "AURA-1337");
  // Case-insensitive prefix
  assert.equal(extractAuraToken("@aura-7"), "aura-7");
  // Just the prefix, no digits yet (user still typing)
  assert.equal(extractAuraToken(" @AURA-"), "AURA-");
  // @file token (non-AURA-) -> null (defer to built-in path provider)
  assert.equal(extractAuraToken("src/@file.ts"), null);
  // @rule: token -> null (defer to the rule overlay)
  assert.equal(extractAuraToken("@rule:tracker-jira"), null);
  // @ not at token boundary (in email) -> null
  assert.equal(extractAuraToken("user@example.com"), null);
  // @AURA without the dash is NOT a token (avoid hijacking @AURAsday etc.)
  assert.equal(extractAuraToken("@AURADAY"), null);
  // Empty token after @
  assert.equal(extractAuraToken("foo @"), null);
  // Letters after the digits end the token (cursor not right after a valid
  // AURA-<digits> token), so this is NOT an @AURA- mention.
  assert.equal(extractAuraToken("@AURA-12abc"), null);
}

console.log("extractAuraToken (@ deferral): ok");

// ---------------------------------------------------------------------------
// filterTasks (autocomplete filtering)
// ---------------------------------------------------------------------------

{
  const tasks: AuraTaskRef[] = [
    { human_key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
    { human_key: "AURA-1337", title: "Ship the dashboard", status: "IN_REVIEW" },
    { human_key: "AURA-424", title: "Refactor the renderer", status: "DONE" },
    { human_key: "AURA-7", title: "Write the docs", status: "IN_DEVELOPMENT" },
  ];

  // No digits -> head of the (newest-first) cache.
  const empty = filterTasks(tasks, "");
  assert.equal(empty.length, 4, "no prefix returns all up to MAX_SUGGESTIONS");

  // Number-prefix match.
  const digits4 = filterTasks(tasks, "4");
  assert.deepEqual(
    digits4.map((i) => i.value),
    ["@AURA-42", "@AURA-424"],
    "prefix 4 matches AURA-42 and AURA-424",
  );

  // Exact-ish prefix.
  const digits42 = filterTasks(tasks, "42");
  assert.deepEqual(
    digits42.map((i) => i.value),
    ["@AURA-42", "@AURA-424"],
    "prefix 42 matches both",
  );

  const digits1337 = filterTasks(tasks, "1337");
  assert.deepEqual(
    digits1337.map((i) => i.value),
    ["@AURA-1337"],
    "prefix 1337 matches only one",
  );

  // No match.
  assert.deepEqual(filterTasks(tasks, "999"), []);

  // Item shape: label is the @token, description is `[status] title`.
  const item = filterTasks(tasks, "7")[0]!;
  assert.equal(item.value, "@AURA-7");
  assert.equal(item.label, "@AURA-7");
  assert.equal(item.description, "[IN_DEVELOPMENT] Write the docs");
}

console.log("filterTasks: ok");

// ---------------------------------------------------------------------------
// formatExpandedMention
// ---------------------------------------------------------------------------

{
  assert.equal(
    formatExpandedMention({ human_key: "AURA-42", title: "Fix the login bug", status: "OPEN" }),
    '<aura-task key="AURA-42" status="OPEN">Fix the login bug</aura-task>',
  );

  // Title containing parentheses, a colon, and a pipe is safe — it sits in
  // element text, so none of those delimiters need escaping.
  assert.equal(
    formatExpandedMention({ human_key: "AURA-7", title: "Fix login (SSO): edge | case", status: "IN_REVIEW" }),
    '<aura-task key="AURA-7" status="IN_REVIEW">Fix login (SSO): edge | case</aura-task>',
  );

  // Title with `<` and `&` is XML-escaped so the tag stays well-formed.
  assert.equal(
    formatExpandedMention({ human_key: "AURA-9", title: "a < b & c", status: "DONE" }),
    '<aura-task key="AURA-9" status="DONE">a &lt; b &amp; c</aura-task>',
  );
}

console.log("formatExpandedMention: ok");

// ---------------------------------------------------------------------------
// expandAuraMentions (inline expansion)
// ---------------------------------------------------------------------------

{
  const tasks: AuraTaskRef[] = [
    { human_key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
    { human_key: "AURA-1337", title: "Ship the dashboard", status: "IN_REVIEW" },
  ];
  const lookup = (lowerKey: string): AuraTaskRef | null =>
    tasks.find((t) => t.human_key.toLowerCase() === lowerKey) ?? null;

  // Single mention, mid-prompt.
  assert.equal(
    expandAuraMentions("Please work on @AURA-42 today", lookup),
    'Please work on <aura-task key="AURA-42" status="OPEN">Fix the login bug</aura-task> today',
  );

  // Mention at start of line (no leading boundary char).
  assert.equal(
    expandAuraMentions("@AURA-42 is the task", lookup),
    '<aura-task key="AURA-42" status="OPEN">Fix the login bug</aura-task> is the task',
  );

  // Multiple mentions, case-insensitive prefix.
  assert.equal(
    expandAuraMentions("@aura-42 and @AURA-1337", lookup),
    '<aura-task key="AURA-42" status="OPEN">Fix the login bug</aura-task> and <aura-task key="AURA-1337" status="IN_REVIEW">Ship the dashboard</aura-task>',
  );

  // Unknown key left as-is.
  assert.equal(
    expandAuraMentions("Check @AURA-999 too", lookup),
    "Check @AURA-999 too",
  );

  // No mentions -> unchanged.
  assert.equal(
    expandAuraMentions("just a normal prompt", lookup),
    "just a normal prompt",
  );

  // Boundary preserved: mention glued after a word char is NOT matched
  // (we require whitespace/start before @), so it stays untouched.
  assert.equal(
    expandAuraMentions("email@AURA-42.com", lookup),
    "email@AURA-42.com",
  );

  // Status uses the server-cased value verbatim (in the status attribute).
  const tasks2: AuraTaskRef[] = [
    { human_key: "AURA-9", title: "Review the PR", status: "READY_FOR_REVIEW" },
  ];
  const lookup2 = (k: string) => tasks2.find((t) => t.human_key.toLowerCase() === k) ?? null;
  assert.equal(
    expandAuraMentions("@AURA-9 now", lookup2),
    '<aura-task key="AURA-9" status="READY_FOR_REVIEW">Review the PR</aura-task> now',
  );
}

console.log("expandAuraMentions: ok");

// ---------------------------------------------------------------------------
// collectUnresolvedMentions (used by the input handler to fall back to
// getTaskByHumanKey for mentions outside the cached window)
// ---------------------------------------------------------------------------

{
  const tasks: AuraTaskRef[] = [
    { human_key: "AURA-42", title: "Fix the login bug", status: "OPEN" },
  ];
  const lookup = (k: string) => tasks.find((t) => t.human_key.toLowerCase() === k) ?? null;

  // Unknown mention collected.
  assert.deepEqual(collectUnresolvedMentions("@AURA-999 help", lookup), ["AURA-999"]);

  // Known mention NOT collected.
  assert.deepEqual(collectUnresolvedMentions("@AURA-42 help", lookup), []);

  // Mixed: only the unknown one is collected, deduped.
  assert.deepEqual(
    collectUnresolvedMentions("@AURA-42 and @AURA-999 and @AURA-999", lookup),
    ["AURA-999"],
  );

  // Case-insensitive match; the key is returned as-typed (the by-key
  // endpoint matches case-insensitively, so we don't force canonical case).
  assert.deepEqual(collectUnresolvedMentions("@aura-7", lookup), ["aura-7"]);

  // No mentions at all.
  assert.deepEqual(collectUnresolvedMentions("nothing here", lookup), []);

  // collectUnresolvedMentions runs on the *post-expansion* text in the
  // handler, so already-expanded `<aura-task ...>` tokens must NOT be
  // recollected (they no longer match @AURA-<digits>).
  const expanded = expandAuraMentions("@AURA-42 and @AURA-999", lookup);
  assert.equal(expanded, '<aura-task key="AURA-42" status="OPEN">Fix the login bug</aura-task> and @AURA-999');
  assert.deepEqual(collectUnresolvedMentions(expanded, lookup), ["AURA-999"]);
}

console.log("collectUnresolvedMentions: ok");

// ---------------------------------------------------------------------------
// AURA_TASK_INSTRUCTION (system-prompt block)
// ---------------------------------------------------------------------------

{
  // Names the tag, its three parts, and points at the aura skill for action.
  assert.ok(AURA_TASK_INSTRUCTION.includes("<aura-task"), "shows the tag shape");
  assert.ok(AURA_TASK_INSTRUCTION.includes("key="), "names the key attribute");
  assert.ok(AURA_TASK_INSTRUCTION.includes("status="), "names the status attribute");
  assert.ok(/element text is the task title/.test(AURA_TASK_INSTRUCTION), "names the title part");
  assert.ok(AURA_TASK_INSTRUCTION.includes("aura"), "points at the aura skill");
  assert.ok(/read/.test(AURA_TASK_INSTRUCTION), "tells the agent to read the skill");
  // Rendered as a system-prompt section heading, not bare prose.
  assert.ok(AURA_TASK_INSTRUCTION.startsWith("\n## "), "starts with a markdown heading");
}

console.log("AURA_TASK_INSTRUCTION: ok");

// ---------------------------------------------------------------------------
// Factory is a function (smoke)
// ---------------------------------------------------------------------------

assert.equal(typeof auraTasks, "function", "default export is a factory function");
console.log("factory: ok");

console.log("\nall aura-tasks tests passed");
