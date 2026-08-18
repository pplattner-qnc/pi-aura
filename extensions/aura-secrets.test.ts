/**
 * Smoke test for the /aura command dispatch seam.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-secrets.test.ts
 */

import assert from "node:assert";
import { getArgumentCompletions, parseAuraArgs } from "./aura-secrets.ts";

// Empty/unknown -> usage
assert.deepStrictEqual(parseAuraArgs(""), { command: "usage", rest: "" });
assert.deepStrictEqual(parseAuraArgs("   "), { command: "usage", rest: "" });
assert.deepStrictEqual(parseAuraArgs("foo"), { command: "usage", rest: "foo" });

// First token must be "secrets"
assert.deepStrictEqual(parseAuraArgs("secrets"), { command: "usage", rest: "secrets" });

// Valid subcommands
assert.deepStrictEqual(parseAuraArgs("secrets discover"), { command: "secrets-discover", rest: "" });
assert.deepStrictEqual(parseAuraArgs("secrets edit"), { command: "secrets-edit", rest: "" });

// Extra whitespace in the middle and around
assert.deepStrictEqual(parseAuraArgs("secrets  discover"), { command: "secrets-discover", rest: "" });
assert.deepStrictEqual(parseAuraArgs("  secrets   edit  "), { command: "secrets-edit", rest: "" });

// Unknown subcommand -> usage, preserving the attempted command for diagnostics
assert.deepStrictEqual(parseAuraArgs("secrets foo"), { command: "usage", rest: "secrets foo" });

console.log("parseAuraArgs tests passed");

// --- getArgumentCompletions ---

assert.deepStrictEqual(getArgumentCompletions(""), [{ value: "secrets", label: "secrets" }]);
assert.deepStrictEqual(getArgumentCompletions("s"), [{ value: "secrets", label: "secrets" }]);
assert.deepStrictEqual(getArgumentCompletions("se"), [{ value: "secrets", label: "secrets" }]);
assert.strictEqual(getArgumentCompletions("x"), null);

// After the full "secrets" token, offer subcommands.
assert.deepStrictEqual(getArgumentCompletions("secrets"), [
  { value: "discover", label: "discover" },
  { value: "edit", label: "edit" },
]);
assert.deepStrictEqual(getArgumentCompletions("secrets "), [
  { value: "discover", label: "discover" },
  { value: "edit", label: "edit" },
]);

// Filter subcommands by prefix.
assert.deepStrictEqual(getArgumentCompletions("secrets d"), [{ value: "discover", label: "discover" }]);
assert.deepStrictEqual(getArgumentCompletions("secrets e"), [{ value: "edit", label: "edit" }]);
assert.strictEqual(getArgumentCompletions("secrets x"), null);

console.log("getArgumentCompletions tests passed");
