/**
 * Unit tests for slice "wire-bitbucket-reader" — bitbucket.ts reads the
 * Bitbucket token (bitbucket_token, not api_token) and the two dev-links
 * layers (Teamwork Graph + Bitbucket) degrade independently.
 *
 * Run via root vitest:
 *   npx vitest run test/wire-bitbucket-reader/
 *
 * Seams (per arch spec Slice 1):
 * - loadCreds(keyring, defaultWorkspace) is injectable — fake keyring holding
 *   bitbucket_token vs api_token → assert the right token is used.
 * - Per-layer independence: fake keyring with only bitbucket_token → Bitbucket
 *   resolves, Teamwork Graph skips; only api_token → TWG resolves, Bitbucket
 *   skips; both missing → both skip with their OWN /aura secrets edit warnings.
 *   Tested via the degrade wrappers in devlinks.ts (buildAtlassianClient +
 *   the Bitbucket pre-check), injecting a fake keyring through the readers.
 * - No live network call.
 */

import assert from "node:assert/strict";
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Keyring, SecretKey, StoredSecret } from "@pi-aura/shared/keyring";

import { loadCreds } from "../../scripts/src/bitbucket.js";
import {
  readAtlassianCredentials,
  readBitbucketCredentials,
  atlassianClient,
} from "../../scripts/src/clients.js";

// ---------------------------------------------------------------------------
// Fake Keyring — implements the Keyring interface for testing.
// ---------------------------------------------------------------------------

class FakeKeyring implements Keyring {
  private store = new Map<string, string>();

  constructor(
    secrets: Partial<{
      email: string | null;
      api_token: string | null;
      bitbucket_token: string | null;
    }> = {},
  ) {
    if (secrets.email !== undefined) {
      this.store.set("atlassian/email", secrets.email ?? "");
    }
    if (secrets.api_token !== undefined) {
      this.store.set("atlassian/api_token", secrets.api_token ?? "");
    }
    if (secrets.bitbucket_token !== undefined) {
      this.store.set("atlassian/bitbucket_token", secrets.bitbucket_token ?? "");
    }
  }

  async getSecret(key: SecretKey): Promise<string | null> {
    const packed = `${key.service}/${key.name}`;
    if (!this.store.has(packed)) return null;
    return this.store.get(packed) ?? null;
  }

  async setSecret(key: SecretKey, secret: string): Promise<void> {
    this.store.set(`${key.service}/${key.name}`, secret);
  }

  async deleteSecret(key: SecretKey): Promise<boolean> {
    const packed = `${key.service}/${key.name}`;
    return this.store.delete(packed);
  }

  async listSecrets(): Promise<StoredSecret[]> {
    const out: StoredSecret[] = [];
    for (const [packed, secret] of this.store) {
      const [service, name] = packed.split("/");
      out.push({ key: { service, name } as SecretKey, secret });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMcpJson(
  serverName: string,
  entry: { type?: string; url?: string },
): string {
  const dir = mkdtempSync(join(tmpdir(), "wire-bb-reader-test-"));
  const config = {
    mcpServers: {
      [serverName]: entry,
    },
  };
  const path = join(dir, "mcp.json");
  writeFileSync(path, JSON.stringify(config), "utf8");
  return path;
}

function cleanupPath(path: string): void {
  rmSync(join(path, ".."), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// loadCreds — reads bitbucket_token (not api_token)
// ---------------------------------------------------------------------------

describe("loadCreds — reads atlassian/bitbucket_token", () => {
  it("returns the bitbucket_token (not api_token) when both tokens are present", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "TWG-token-xyz",
      bitbucket_token: "BB-token-abc",
    });
    const creds = await loadCreds(keyring, "my-workspace");
    assert.equal(creds.email, "user@example.com");
    assert.equal(creds.token, "BB-token-abc", "must use the Bitbucket token, not the TWG token");
    assert.equal(creds.defaultWorkspace, "my-workspace");
  });

  it("resolves when only bitbucket_token is present (api_token absent)", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      bitbucket_token: "BB-token-abc",
    });
    const creds = await loadCreds(keyring, "my-workspace");
    assert.equal(creds.token, "BB-token-abc");
  });

  it("throws /aura secrets edit when bitbucket_token is missing (even if api_token is present)", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "TWG-token-xyz",
    });
    await expect(loadCreds(keyring, "my-workspace")).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws /aura secrets edit when email is missing (bitbucket_token present)", async () => {
    const keyring = new FakeKeyring({ bitbucket_token: "BB-token-abc" });
    await expect(loadCreds(keyring, "my-workspace")).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws /aura secrets edit when both tokens are missing", async () => {
    const keyring = new FakeKeyring({ email: "user@example.com" });
    await expect(loadCreds(keyring, "my-workspace")).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("trims whitespace from keyring values", async () => {
    const keyring = new FakeKeyring({
      email: "  user@example.com\n  ",
      bitbucket_token: "  BB-token-abc\n",
    });
    const creds = await loadCreds(keyring, "my-workspace");
    assert.equal(creds.email, "user@example.com");
    assert.equal(creds.token, "BB-token-abc");
  });

  it("throws a workspace-specific warning when defaultWorkspace is empty", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      bitbucket_token: "BB-token-abc",
    });
    await expect(loadCreds(keyring, "")).rejects.toThrow(/workspace/i);
  });
});

// ---------------------------------------------------------------------------
// Per-layer independence — the KEY behavioral change
// ---------------------------------------------------------------------------

describe("per-layer independence — Bitbucket + Teamwork Graph degrade independently", () => {
  // The Bitbucket layer's degrade wrapper: mirrors the pre-check in
  // devlinks.ts Layer 3 (which calls readBitbucketCredentials then checks ws).
  async function bitbucketLayerDegrade(
    keyring: Keyring,
    ws: string,
  ): Promise<{ resolved: boolean; warning: string | null }> {
    try {
      const { email, token } = await readBitbucketCredentials(keyring);
      if (!ws) {
        throw new Error(
          "Bitbucket workspace not set in settings (configure settings.aura.digest.bitbucket.workspace)",
        );
      }
      // If we got here, creds resolve (no network call in the test).
      void email;
      void token;
      return { resolved: true, warning: null };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      return {
        resolved: false,
        warning: `Bitbucket dev-links layer skipped: ${reason}`,
      };
    }
  }

  // The Teamwork Graph layer's degrade wrapper: mirrors buildAtlassianClient
  // in devlinks.ts (which calls atlassianClient, which calls
  // readAtlassianCredentials). We use the real atlassianClient with a fake
  // keyring + temp mcp.json so the reader throw is caught.
  async function twgLayerDegrade(
    keyring: Keyring,
    configPath: string,
  ): Promise<{ resolved: boolean; warning: string | null }> {
    try {
      await atlassianClient("atlassian", { keyring, configPath });
      // If we got here, the client built (no connect in the test — the reader
      // throw is what we test; a successful build means creds resolved).
      return { resolved: true, warning: null };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      return {
        resolved: false,
        warning: `Teamwork Graph dev-links layer skipped: ${reason}`,
      };
    }
  }

  it("both tokens present → both layers resolve", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "TWG-token-xyz",
      bitbucket_token: "BB-token-abc",
    });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const bb = await bitbucketLayerDegrade(keyring, "my-workspace");
      const twg = await twgLayerDegrade(keyring, configPath);
      assert.equal(bb.resolved, true, "Bitbucket should resolve");
      assert.equal(bb.warning, null);
      assert.equal(twg.resolved, true, "Teamwork Graph should resolve");
      assert.equal(twg.warning, null);
    } finally {
      cleanupPath(configPath);
    }
  });

  it("only bitbucket_token → Bitbucket resolves, Teamwork Graph skips", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      bitbucket_token: "BB-token-abc",
    });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const bb = await bitbucketLayerDegrade(keyring, "my-workspace");
      const twg = await twgLayerDegrade(keyring, configPath);
      assert.equal(bb.resolved, true, "Bitbucket should resolve");
      assert.equal(bb.warning, null);
      assert.equal(twg.resolved, false, "Teamwork Graph should skip");
      assert.ok(
        twg.warning && twg.warning.includes("Teamwork Graph dev-links layer skipped"),
        `TWG warning must say 'Teamwork Graph dev-links layer skipped', got: ${twg.warning}`,
      );
      assert.ok(
        twg.warning && twg.warning.includes("/aura secrets edit"),
        `TWG warning must contain '/aura secrets edit', got: ${twg.warning}`,
      );
    } finally {
      cleanupPath(configPath);
    }
  });

  it("only api_token → TWG resolves, Bitbucket skips", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "TWG-token-xyz",
    });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const bb = await bitbucketLayerDegrade(keyring, "my-workspace");
      const twg = await twgLayerDegrade(keyring, configPath);
      assert.equal(bb.resolved, false, "Bitbucket should skip");
      assert.ok(
        bb.warning && bb.warning.includes("Bitbucket dev-links layer skipped"),
        `Bitbucket warning must say 'Bitbucket dev-links layer skipped', got: ${bb.warning}`,
      );
      assert.ok(
        bb.warning && bb.warning.includes("/aura secrets edit"),
        `Bitbucket warning must contain '/aura secrets edit', got: ${bb.warning}`,
      );
      assert.equal(twg.resolved, true, "Teamwork Graph should resolve");
      assert.equal(twg.warning, null);
    } finally {
      cleanupPath(configPath);
    }
  });

  it("both missing → both skip with their OWN /aura secrets edit warnings", async () => {
    const keyring = new FakeKeyring();
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const bb = await bitbucketLayerDegrade(keyring, "my-workspace");
      const twg = await twgLayerDegrade(keyring, configPath);
      assert.equal(bb.resolved, false, "Bitbucket should skip");
      assert.equal(twg.resolved, false, "Teamwork Graph should skip");

      // Each layer has its OWN warning — not a shared message.
      assert.ok(
        bb.warning && bb.warning.includes("Bitbucket dev-links layer skipped"),
        `Bitbucket warning must say 'Bitbucket dev-links layer skipped', got: ${bb.warning}`,
      );
      assert.ok(
        bb.warning && bb.warning.includes("/aura secrets edit"),
        `Bitbucket warning must contain '/aura secrets edit', got: ${bb.warning}`,
      );
      assert.ok(
        twg.warning && twg.warning.includes("Teamwork Graph dev-links layer skipped"),
        `TWG warning must say 'Teamwork Graph dev-links layer skipped', got: ${twg.warning}`,
      );
      assert.ok(
        twg.warning && twg.warning.includes("/aura secrets edit"),
        `TWG warning must contain '/aura secrets edit', got: ${twg.warning}`,
      );
      // The warnings are distinguishable — one says "Bitbucket", the other "Teamwork Graph".
      assert.notEqual(bb.warning, twg.warning, "warnings must be distinguishable");
      assert.ok(
        !bb.warning!.includes("Teamwork Graph"),
        "Bitbucket warning must NOT mention 'Teamwork Graph'",
      );
      assert.ok(
        !twg.warning!.includes("Bitbucket"),
        "TWG warning must NOT mention 'Bitbucket'",
      );
    } finally {
      cleanupPath(configPath);
    }
  });

  it("email missing but both tokens present → both skip (email is shared)", async () => {
    const keyring = new FakeKeyring({
      api_token: "TWG-token-xyz",
      bitbucket_token: "BB-token-abc",
    });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const bb = await bitbucketLayerDegrade(keyring, "my-workspace");
      const twg = await twgLayerDegrade(keyring, configPath);
      assert.equal(bb.resolved, false, "Bitbucket should skip (no email)");
      assert.equal(twg.resolved, false, "Teamwork Graph should skip (no email)");
      assert.ok(
        bb.warning && bb.warning.includes("/aura secrets edit"),
        `Bitbucket warning must contain '/aura secrets edit', got: ${bb.warning}`,
      );
      assert.ok(
        twg.warning && twg.warning.includes("/aura secrets edit"),
        `TWG warning must contain '/aura secrets edit', got: ${twg.warning}`,
      );
    } finally {
      cleanupPath(configPath);
    }
  });
});
