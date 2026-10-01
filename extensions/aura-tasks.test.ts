/**
 * Module-surface smoke test for the shrunk aura-tasks extension.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-tasks.test.ts
 *
 * The extension keeps only the session-start reachability probe: the legacy
 * `@AURA-` autocomplete, expansion, and instruction handling moved to the
 * shared reference engine (extensions/aura-references.ts) as its first
 * registered alias, and their tests live in
 * extensions/aura-references.test.ts. The probe's pure logic
 * (checkAuraReachable, formatUnreachableWarning) is covered by
 * extensions/aura-health.test.ts. This file pins that the module still loads
 * under the strip-types entry point, that its runtime export surface is
 * exactly the probe (nothing regrows into it), and that the default export
 * is the extension factory.
 */

import assert from "node:assert/strict";
import auraTasks from "./aura-tasks.ts";

// The module's runtime export surface: the probe pair plus the factory.
// (AuraReachabilityResult is a type-only export and does not appear here.)
// If this pin fails, something was added back to (or removed from) the
// module; the extension should stay the reachability probe only.
const exports = Object.keys(await import("./aura-tasks.ts")).sort();
assert.deepEqual(
  exports,
  ["checkAuraReachable", "default", "formatUnreachableWarning"],
  "the module exports only the reachability probe and the factory",
);

// Factory is a function (smoke; the pi-runtime wiring is verified live).
assert.equal(typeof auraTasks, "function", "default export is a factory function");
console.log("factory: ok");

console.log("\nall aura-tasks tests passed");
