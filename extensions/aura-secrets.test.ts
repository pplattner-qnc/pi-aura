/**
 * Smoke test for the /aura command dispatch seam and secrets discovery logic.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-secrets.test.ts
 */

import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import auraSecretsExtension, {
  decideEditAction,
  discoverPat,
  DISCOVERY_SOURCES,
  getArgumentCompletions,
  handleDiscover,
  handleEdit,
  handleSecretEdit,
  parseAuraArgs,
  pickSecretKey,
  readMcpBearerToken,
  type DiscoverySource,
  type EditDecision,
} from "./aura-secrets.ts";

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

// --- discoverPat pure function ---

const fakeFoundSource: DiscoverySource = {
  name: "fake-found",
  async find() {
    return "pat-123";
  },
};

const fakeEmptySource: DiscoverySource = {
  name: "fake-empty",
  async find() {
    return null;
  },
};

assert.deepStrictEqual(await discoverPat([fakeFoundSource, fakeEmptySource]), [
  { name: "fake-found", value: "pat-123" },
]);

console.log("discoverPat pure-function test passed");

// --- DISCOVERY_SOURCES extension point ---

const envSource: DiscoverySource = {
  name: "env",
  async find() {
    return "pat-from-env";
  },
};

const extendedResults = await discoverPat([...DISCOVERY_SOURCES, envSource]);
assert.ok(
  extendedResults.some((r) => r.name === "env" && r.value === "pat-from-env"),
  "appending a source to DISCOVERY_SOURCES should include its value"
);

console.log("DISCOVERY_SOURCES extension-point test passed");

// --- mcp-json bearerToken helper ---

const tmpDir = mkdtempSync(join(tmpdir(), "aura-secrets-test-"));
try {
  const missingPath = join(tmpDir, "missing.json");
  assert.strictEqual(readMcpBearerToken(missingPath), null, "missing file returns null");

  const noServerPath = join(tmpDir, "no-server.json");
  writeFileSync(noServerPath, JSON.stringify({ mcpServers: {} }));
  assert.strictEqual(readMcpBearerToken(noServerPath), null, "no aura-mcp-dev entry returns null");

  const noTokenPath = join(tmpDir, "no-token.json");
  writeFileSync(
    noTokenPath,
    JSON.stringify({ mcpServers: { "aura-mcp-dev": { type: "http" } } })
  );
  assert.strictEqual(readMcpBearerToken(noTokenPath), null, "missing bearerToken returns null");

  const validPath = join(tmpDir, "valid.json");
  writeFileSync(
    validPath,
    JSON.stringify({ mcpServers: { "aura-mcp-dev": { bearerToken: "mcp-pat-xyz" } } })
  );
  assert.strictEqual(readMcpBearerToken(validPath), "mcp-pat-xyz", "valid bearerToken returned");

  const unparsablePath = join(tmpDir, "unparsable.json");
  writeFileSync(unparsablePath, "{ not json");
  assert.strictEqual(readMcpBearerToken(unparsablePath), null, "unparseable json returns null");
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

console.log("mcp-json helper tests passed");

// --- handleDiscover UI/keyring logic ---

interface NotifyCall {
  message: string;
  level: "info" | "warning" | "error";
}

function makeMockUi(options: {
  selectResult?: string;
  confirmResult?: boolean;
} = {}) {
  const notifies: NotifyCall[] = [];
  return {
    ui: {
      notify(message: string, level: "info" | "warning" | "error") {
        notifies.push({ message, level });
      },
      async select(_title: string, _options: string[]) {
        return options.selectResult;
      },
      async confirm(_title: string, _message: string) {
        return options.confirmResult ?? false;
      },
    },
    getNotifies() {
      return notifies;
    },
  };
}

function makeMockKeyring() {
  const stored: { key: { service: string; name: string }; secret: string }[] = [];
  return {
    keyring: {
      async getSecret(key: { service: string; name: string }) {
        const entry = stored.find(
          (s) => s.key.service === key.service && s.key.name === key.name
        );
        return entry?.secret ?? null;
      },
      async setSecret(key: { service: string; name: string }, secret: string) {
        stored.push({ key, secret });
      },
      async deleteSecret() {
        return false;
      },
      async listSecrets() {
        return stored.map((s) => ({ key: s.key, secret: s.secret }));
      },
    },
    getStored() {
      return stored;
    },
  };
}

// No PAT found
{
  const { ui, getNotifies } = makeMockUi();
  const { keyring } = makeMockKeyring();
  let factoryCalled = false;
  await handleDiscover(
    ui,
    async () => {
      factoryCalled = true;
      return keyring as unknown as import("@pi-aura/shared/keyring").Keyring;
    },
    [fakeEmptySource]
  );
  assert.strictEqual(factoryCalled, false, "keyring factory should not be called when no PAT found");
  assert.ok(
    notifiesSome(getNotifies(), (n) => n.message.includes("Discovery sources checked") && n.level === "info"),
    "summary notification shown"
  );
  assert.ok(
    notifiesSome(getNotifies(), (n) => n.message === "no PAT found in any source" && n.level === "warning"),
    "no PAT warning shown"
  );
}

// Single source found + confirm
{
  const { ui, getNotifies } = makeMockUi({ confirmResult: true });
  const { keyring, getStored } = makeMockKeyring();
  await handleDiscover(
    ui,
    async () => keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
    [fakeFoundSource]
  );
  const stored = getStored();
  assert.strictEqual(stored.length, 1);
  assert.deepStrictEqual(stored[0].key, { service: "aura", name: "pat" });
  assert.strictEqual(stored[0].secret, "pat-123");
  assert.ok(
    notifiesSome(
      getNotifies(),
      (n) => n.message === "Aura PAT imported from fake-found" && n.level === "info"
    ),
    "success notification shown"
  );
}

// Single source found + decline
{
  const { ui, getNotifies } = makeMockUi({ confirmResult: false });
  const { keyring, getStored } = makeMockKeyring();
  await handleDiscover(
    ui,
    async () => keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
    [fakeFoundSource]
  );
  assert.strictEqual(getStored().length, 0, "nothing stored on decline");
  assert.ok(
    notifiesSome(getNotifies(), (n) => n.message === "not stored" && n.level === "info"),
    "not-stored notification shown"
  );
}

// Multiple sources found + select
{
  const sourceA: DiscoverySource = {
    name: "source-a",
    async find() {
      return "pat-a";
    },
  };
  const sourceB: DiscoverySource = {
    name: "source-b",
    async find() {
      return "pat-b";
    },
  };
  const { ui, getNotifies } = makeMockUi({ selectResult: "source-b" });
  const { keyring, getStored } = makeMockKeyring();
  await handleDiscover(
    ui,
    async () => keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
    [sourceA, sourceB]
  );
  const stored = getStored();
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(stored[0].secret, "pat-b");
  assert.ok(
    notifiesSome(
      getNotifies(),
      (n) => n.message === "Aura PAT imported from source-b" && n.level === "info"
    ),
    "success notification for selected source shown"
  );
}

// Multiple sources found + cancel
{
  const sourceA: DiscoverySource = {
    name: "source-a",
    async find() {
      return "pat-a";
    },
  };
  const sourceB: DiscoverySource = {
    name: "source-b",
    async find() {
      return "pat-b";
    },
  };
  const { ui, getNotifies } = makeMockUi({ selectResult: undefined });
  const { keyring, getStored } = makeMockKeyring();
  await handleDiscover(
    ui,
    async () => keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
    [sourceA, sourceB]
  );
  assert.strictEqual(getStored().length, 0, "nothing stored on cancel");
  assert.ok(
    notifiesSome(getNotifies(), (n) => n.message === "not stored" && n.level === "info"),
    "not-stored notification shown on cancel"
  );
}

console.log("handleDiscover tests passed");

// --- handler dispatch via mock pi / ctx ---

function notifiesSome(notifies: NotifyCall[], predicate: (n: NotifyCall) => boolean): boolean {
  return notifies.some(predicate);
}

interface RegisteredConfig {
  description: string;
  handler: (args: string, ctx: unknown) => Promise<void>;
}

function makeMockPi() {
  let registered: { name: string; config: RegisteredConfig } | undefined;
  return {
    registerCommand(name: string, config: RegisteredConfig) {
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

const config = registered!.config;
assert.ok(config.description, "description should be present");

async function runHandler(args: string) {
  const ctx = makeMockCtx();
  await config.handler(args, ctx as unknown as ReturnType<typeof makeMockCtx>);
  return ctx.getNotifies();
}

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

// --- decideEditAction pure function ---

function assertDecision(actual: EditDecision, expected: EditDecision, message: string) {
  assert.deepStrictEqual(actual, expected, message);
}

assertDecision(decideEditAction("abc", undefined), { action: "cancel" }, "undefined edited -> cancel");
assertDecision(decideEditAction("abc", null), { action: "cancel" }, "null edited -> cancel");
assertDecision(decideEditAction("abc", "abc"), { action: "unchanged" }, "same as current -> unchanged");
assertDecision(decideEditAction("abc", "xyz"), { action: "save", value: "xyz" }, "different non-empty -> save");
assertDecision(
  decideEditAction(null, ""),
  { action: "confirm-empty" },
  "empty when no prior value -> confirm-empty"
);
assertDecision(
  decideEditAction("abc", ""),
  { action: "confirm-empty" },
  "empty when a prior value exists -> confirm-empty"
);
assertDecision(
  decideEditAction(null, "new-pat"),
  { action: "save", value: "new-pat" },
  "new non-empty PAT when none stored -> save"
);

console.log("decideEditAction pure-function tests passed");

// --- pickSecretKey pure function ---

// pickSecretKey is a PURE single-key lookup: the two Atlassian token labels
// map to their token keys. The standalone "Atlassian email" label is GONE —
// the email is now prompted within the combined flow, not chosen directly.
assert.deepStrictEqual(
  pickSecretKey("Aura PAT"),
  { service: "aura", name: "pat" },
  "Aura PAT -> aura/pat"
);
assert.deepStrictEqual(
  pickSecretKey("Atlassian Teamwork Graph token"),
  { service: "atlassian", name: "api_token" },
  "Atlassian Teamwork Graph token -> atlassian/api_token"
);
assert.deepStrictEqual(
  pickSecretKey("Atlassian Bitbucket token"),
  { service: "atlassian", name: "bitbucket_token" },
  "Atlassian Bitbucket token -> atlassian/bitbucket_token"
);
assert.strictEqual(pickSecretKey(undefined), null, "undefined (cancel) -> null");
assert.strictEqual(pickSecretKey(""), null, "empty string -> null");
assert.strictEqual(pickSecretKey("unknown"), null, "unknown label -> null");

console.log("pickSecretKey pure-function tests passed");

// --- handleEdit UI/keyring logic ---

function makeMockEditUi(options: {
  editorResult?: string;
  confirmResult?: boolean;
} = {}) {
  const notifies: NotifyCall[] = [];
  return {
    ui: {
      notify(message: string, level: "info" | "warning" | "error") {
        notifies.push({ message, level });
      },
      async editor(_title: string, _prefilled: string): Promise<string | undefined> {
        return options.editorResult;
      },
      async confirm(_title: string, _message: string) {
        return options.confirmResult ?? false;
      },
    },
    getNotifies() {
      return notifies;
    },
  };
}

// Cancelled editor -> no write
{
  const { ui, getNotifies } = makeMockEditUi({ editorResult: undefined });
  const { keyring, getStored } = makeMockKeyring();
  await handleEdit(
    ui,
    async () => keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
    "existing-pat"
  );
  assert.strictEqual(getStored().length, 0, "nothing stored on cancel");
  assert.ok(
    notifiesSome(getNotifies(), (n) => n.message === "no change" && n.level === "info"),
    "no-change notification shown on cancel"
  );
}

// Unchanged value -> no write
{
  const { ui, getNotifies } = makeMockEditUi({ editorResult: "existing-pat" });
  const { keyring, getStored } = makeMockKeyring();
  await handleEdit(
    ui,
    async () => keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
    "existing-pat"
  );
  assert.strictEqual(getStored().length, 0, "nothing stored when unchanged");
  assert.ok(
    notifiesSome(getNotifies(), (n) => n.message === "unchanged" && n.level === "info"),
    "unchanged notification shown"
  );
}

// Changed value -> write
{
  const { ui, getNotifies } = makeMockEditUi({ editorResult: "new-pat" });
  const { keyring, getStored } = makeMockKeyring();
  await handleEdit(
    ui,
    async () => keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
    "existing-pat"
  );
  const stored = getStored();
  assert.strictEqual(stored.length, 1);
  assert.deepStrictEqual(stored[0].key, { service: "aura", name: "pat" });
  assert.strictEqual(stored[0].secret, "new-pat");
  assert.ok(
    notifiesSome(getNotifies(), (n) => n.message === "saved" && n.level === "info"),
    "saved notification shown"
  );
}

// Empty value -> confirm -> decline -> no write
{
  const { ui, getNotifies } = makeMockEditUi({ editorResult: "", confirmResult: false });
  const { keyring, getStored } = makeMockKeyring();
  await handleEdit(
    ui,
    async () => keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
    "existing-pat"
  );
  assert.strictEqual(getStored().length, 0, "nothing stored when empty declined");
  assert.ok(
    notifiesSome(getNotifies(), (n) => n.message === "no change" && n.level === "info"),
    "no-change notification shown on empty decline"
  );
}

// Empty value -> confirm -> accept -> write empty
{
  const { ui, getNotifies } = makeMockEditUi({ editorResult: "", confirmResult: true });
  const { keyring, getStored } = makeMockKeyring();
  await handleEdit(
    ui,
    async () => keyring as unknown as import("@pi-aura/shared/keyring").Keyring,
    "existing-pat"
  );
  const stored = getStored();
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(stored[0].secret, "");
  assert.ok(
    notifiesSome(getNotifies(), (n) => n.message === "saved" && n.level === "info"),
    "saved notification shown for empty accepted"
  );
}

console.log("handleEdit tests passed");

// --- edit-handler chooser routing ---
//
// These tests cover the chooser → SecretKey → handleEdit routing. They do
// NOT re-test handleEdit/decideEditAction internals; they assert the right
// key is written and the right placeholder/label reach the editor.

function makeMockEditChooserUi(opts: {
  selectResult?: string;
  editorResult?: string;
  confirmResult?: boolean;
} = {}) {
  const notifies: NotifyCall[] = [];
  const editorCalls: { title: string; prefill: string }[] = [];
  const selectCalls: { title: string; options: string[] }[] = [];
  return {
    ui: {
      notify(message: string, level: "info" | "warning" | "error") {
        notifies.push({ message, level });
      },
      async select(title: string, selectOptions: string[]) {
        selectCalls.push({ title, options: selectOptions });
        return opts.selectResult;
      },
      async editor(title: string, prefill: string): Promise<string | undefined> {
        editorCalls.push({ title, prefill });
        return opts.editorResult;
      },
      async confirm(_title: string, _message: string) {
        return opts.confirmResult ?? false;
      },
    },
    getNotifies() {
      return notifies;
    },
    getEditorCalls() {
      return editorCalls;
    },
    getSelectCalls() {
      return selectCalls;
    },
  };
}

// Choose Aura PAT -> edits aura/pat
{
  const mock = makeMockEditChooserUi({ selectResult: "Aura PAT", editorResult: "new-aura-pat" });
  const kr = makeMockKeyring();
  await handleSecretEdit(
    mock.ui,
    async () => kr.keyring as unknown as import("@pi-aura/shared/keyring").Keyring
  );
  const stored = kr.getStored();
  assert.strictEqual(stored.length, 1, "one secret written for Aura PAT");
  assert.deepStrictEqual(stored[0].key, { service: "aura", name: "pat" }, "Aura PAT routes to aura/pat");
  assert.strictEqual(stored[0].secret, "new-aura-pat", "Aura PAT value stored");
  assert.ok(
    mock.getSelectCalls().length === 1 && mock.getSelectCalls()[0].options.includes("Aura PAT"),
    "chooser offered Aura PAT"
  );
  assert.ok(
    mock.getEditorCalls().length === 1 && mock.getEditorCalls()[0].title === "Aura PAT",
    "editor title is Aura PAT"
  );
  assert.ok(
    mock.getEditorCalls()[0].prefill === "<paste your Aura PAT here>",
    "Aura PAT placeholder prefilled"
  );
}

// Chooser labels are distinct and include all three options
{
  const mock = makeMockEditChooserUi({ selectResult: undefined });
  const kr = makeMockKeyring();
  await handleSecretEdit(
    mock.ui,
    async () => kr.keyring as unknown as import("@pi-aura/shared/keyring").Keyring
  );
  const options = mock.getSelectCalls()[0].options;
  assert.ok(options.includes("Aura PAT"), "chooser includes Aura PAT");
  assert.ok(options.includes("Atlassian Teamwork Graph token"), "chooser includes Atlassian Teamwork Graph token");
  assert.ok(options.includes("Atlassian Bitbucket token"), "chooser includes Atlassian Bitbucket token");
  assert.strictEqual(new Set(options).size, options.length, "chooser labels are all distinct");
}

// Cancel chooser (select returns undefined) -> no keyring write
{
  const mock = makeMockEditChooserUi({ selectResult: undefined });
  const kr = makeMockKeyring();
  await handleSecretEdit(
    mock.ui,
    async () => kr.keyring as unknown as import("@pi-aura/shared/keyring").Keyring
  );
  assert.strictEqual(kr.getStored().length, 0, "nothing stored on chooser cancel");
  assert.strictEqual(mock.getEditorCalls().length, 0, "editor never opened on chooser cancel");
  assert.ok(
    notifiesSome(mock.getNotifies(), (n) => n.message === "no change" && n.level === "info"),
    "no-change notification on chooser cancel"
  );
}

console.log("edit-handler chooser routing tests passed");

console.log("handler dispatch tests passed");
console.log("All tests passed");
