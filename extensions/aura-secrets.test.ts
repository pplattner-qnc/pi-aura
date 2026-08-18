/**
 * Smoke test for the /aura command dispatch seam.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-secrets.test.ts
 */

import assert from "node:assert";
import auraSecretsExtension, { getArgumentCompletions, parseAuraArgs } from "./aura-secrets.ts";

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

// --- handler dispatch via mock pi / ctx ---

interface NotifyCall {
  message: string;
  level: "info" | "warning" | "error";
}

function makeMockPi() {
  let registered: { name: string; config: unknown } | undefined;
  return {
    registerCommand(name: string, config: unknown) {
      registered = { name, config };
    },
    getRegistered() {
      return registered;
    },
  };
}

function makeMockCtx() {
  const notifies: NotifyCall[] = [];
  return {
    ui: {
      notify(message: string, level: "info" | "warning" | "error") {
        notifies.push({ message, level });
      },
    },
    getNotifies() {
      return notifies;
    },
  };
}

const mockPi = makeMockPi();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
auraSecretsExtension(mockPi as any);
const registered = mockPi.getRegistered();
assert.ok(registered, "command should be registered");
assert.strictEqual(registered!.name, "aura");

const config = registered!.config as {
  description: string;
  handler: (args: string, ctx: ReturnType<typeof makeMockCtx>) => Promise<void>;
};
assert.ok(config.description, "description should be present");

async function runHandler(args: string) {
  const ctx = makeMockCtx();
  await config.handler(args, ctx as unknown as ReturnType<typeof makeMockCtx>);
  return ctx.getNotifies();
}

// Stubs
assert.deepStrictEqual(await runHandler("secrets discover"), [
  { message: "not implemented", level: "info" },
]);
assert.deepStrictEqual(await runHandler("secrets edit"), [
  { message: "not implemented", level: "info" },
]);

// Unknown / empty -> usage warning
assert.deepStrictEqual(await runHandler(""), [
  { message: "Usage: /aura secrets {discover|edit}", level: "warning" },
]);
assert.deepStrictEqual(await runHandler("foo"), [
  { message: "Usage: /aura secrets {discover|edit}", level: "warning" },
]);
assert.deepStrictEqual(await runHandler("secrets"), [
  { message: "Usage: /aura secrets {discover|edit}", level: "warning" },
]);
assert.deepStrictEqual(await runHandler("secrets foo"), [
  { message: "Usage: /aura secrets {discover|edit}", level: "warning" },
]);

console.log("handler dispatch tests passed");
