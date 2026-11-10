/**
 * Logic tests for the aura-mcp-dev registration extension.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-mcp-server.test.ts
 *
 * Covers the pure decision (PAT present + base URL present registers the
 * model-facing server; anything missing silently skips) and the factory
 * wiring over a fake pi (registered during extension load, so pi reads it
 * on session_start and connects it next to the configured servers). The
 * dependency-contract guard pins the pi-level precedence this design relies
 * on: a user's own mcp.json entry for the same server overrides the
 * package's registration inside pi's MCP extension, which the package
 * deliberately does not reimplement.
 */

import assert from "node:assert/strict";
import {
  decideAuraMcpRegistration,
  default as registerAuraMcpExtension,
} from "./aura-mcp-server.ts";
import { AURA_MCP_SERVER_NAME } from "./aura-mcp-contract.ts";

// ---------------------------------------------------------------------------
// Fake-pi helper
// ---------------------------------------------------------------------------

interface FakePi {
  registered: Array<{ name: string; config: Record<string, unknown> }>;
  registerMcpServer(name: string, config: Record<string, unknown>): void;
  getMcpServers(): Array<{ name: string; config: unknown }>;
}

function fakePi(): FakePi {
  const registered: FakePi["registered"] = [];
  return {
    registered,
    registerMcpServer(name, config) {
      registered.push({ name, config });
    },
    getMcpServers() {
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// decideAuraMcpRegistration
// ---------------------------------------------------------------------------

{
  const decision = decideAuraMcpRegistration({ baseUrl: "https://aura.dev-anwalt.de/api", pat: "pat-123" });
  assert.equal(decision.action, "register");
  if (decision.action === "register") {
    assert.equal(decision.config.type, "http");
    assert.equal(decision.config.url, "https://aura.dev-anwalt.de/mcp");
    assert.deepEqual(decision.config.headers, { Authorization: "Bearer pat-123" });
  }
  console.log("decision: register with derived endpoint and bearer header: ok");
}

{
  // No PAT: nothing is registered (the package loads cleanly and stays
  // silent).
  const decision = decideAuraMcpRegistration({ baseUrl: "https://aura.dev-anwalt.de/api", pat: null });
  assert.deepEqual(decision, { action: "skip", reason: "no-pat" });
  console.log("decision: no PAT skips silently: ok");
}

{
  // A PAT without a settings base URL cannot build the endpoint: skip.
  const decision = decideAuraMcpRegistration({ pat: "pat-123" });
  assert.deepEqual(decision, { action: "skip", reason: "no-base-url" });
  console.log("decision: no base URL skips silently: ok");
}

// ---------------------------------------------------------------------------
// Factory wiring over a fake pi
// ---------------------------------------------------------------------------

{
  const pi = fakePi();
  await registerAuraMcpExtension(pi as never, {
    loadCredentials: async () => ({ baseUrl: "https://aura.dev-anwalt.de/api", pat: "pat-abc" }),
  });
  assert.equal(pi.registered.length, 1, "the extension registers exactly one server");
  assert.equal(pi.registered[0].name, AURA_MCP_SERVER_NAME);
  assert.equal(pi.registered[0].config.type, "http");
  assert.equal(pi.registered[0].config.url, "https://aura.dev-anwalt.de/mcp");
  assert.deepEqual(pi.registered[0].config.headers, { Authorization: "Bearer pat-abc" });
  console.log("factory: registers the model-facing server during load: ok");
}

{
  // Without a PAT the factory registers nothing, stays silent, and the
  // package still loads cleanly (no throw).
  const pi = fakePi();
  await registerAuraMcpExtension(pi as never, {
    loadCredentials: async () => ({ pat: null }),
  });
  assert.equal(pi.registered.length, 0);
  console.log("factory: no PAT means no registration and a clean load: ok");
}

{
  // A throwing credential read (broken settings/keyring seam) must not
  // break the package load: silent skip.
  const pi = fakePi();
  await registerAuraMcpExtension(pi as never, {
    loadCredentials: async () => {
      throw new Error("keyring unavailable");
    },
  });
  assert.equal(pi.registered.length, 0);
  console.log("factory: credential-read failure is a silent skip: ok");
}

// ---------------------------------------------------------------------------
// Guard: the pi-level precedence contract (criterion 3)
// ---------------------------------------------------------------------------

{
  // The package registers unconditionally when credentials exist and
  // deliberately does NOT reimplement the user-config-wins rule: pi's MCP
  // extension skips extension registrations whose namespace a configured
  // mcp.json entry already defines. That behavior is this design's
  // foundation, so the guard pins it against the installed library (this
  // repo is the installed package). If pi changes its precedence, this
  // guard fails and forces a deliberate re-check.
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  // The package's exports map only exposes "." for ESM import; resolve the
  // main entry and walk to the MCP extension module relatively.
  const mainPath = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const mcpExtensionPath = join(dirname(mainPath), "extensions", "mcp", "index.js");
  const source = readFileSync(mcpExtensionPath, "utf8");
  assert.match(
    source,
    /mcpNamespace\(entry\.name\)\s*===\s*mcpNamespace\(name\)/,
    "pi's MCP extension must still skip extension-registered servers whose namespace an mcp.json entry defines",
  );
  assert.match(
    source,
    /which take precedence/,
    "the precedence documentation in pi's MCP extension must still be present",
  );
  console.log("guard: pi-level user-config precedence contract intact: ok");
}

// ---------------------------------------------------------------------------
// Manifest: the extension is registered in the package
// ---------------------------------------------------------------------------

{
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8")) as {
    pi?: { extensions?: string[] };
  };
  assert.ok(
    (manifest.pi?.extensions ?? []).includes("./extensions/aura-mcp-server.ts"),
    "the package manifest must register the aura-mcp-server extension",
  );
  console.log("manifest: extension registered: ok");
}

console.log("\nall aura-mcp-server tests passed");
