/**
 * Smoke test for the /aura command dispatch seam.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-secrets.test.ts
 */

import assert from "node:assert";
import { parseAuraArgs } from "./aura-secrets.ts";

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
