/**
 * Unit tests for the Basic-auth Atlassian McpClient builder + the shared
 * credential reader (slice 2 of the atlassian-keyring-auth task).
 *
 * Run via root vitest:
 *   npx vitest run test/atlassian-keyring-auth/clients.test.ts
 *
 * Seams (per arch spec Slice 2):
 * - Fake Keyring implementing @pi-aura/shared/keyring's Keyring interface.
 * - Temp mcp.json file via loadMcpConfig(path).
 * - Assert the returned McpClient's authHeader decodes to email:token.
 * No live network call is made.
 */

import assert from "node:assert/strict";
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Keyring, SecretKey, StoredSecret } from "@pi-aura/shared/keyring";

import { atlassianClient, readAtlassianCredentials } from "@pi-aura/shared/digest/clients";
import * as clientsModule from "@pi-aura/shared/digest/clients";

// ---------------------------------------------------------------------------
// Fake Keyring — implements the Keyring interface for testing.
// ---------------------------------------------------------------------------

class FakeKeyring implements Keyring {
  private store = new Map<string, string>();

  constructor(secrets: Partial<{ email: string | null; api_token: string | null }> = {}) {
    if (secrets.email !== undefined) {
      this.store.set("atlassian/email", secrets.email ?? "");
    }
    if (secrets.api_token !== undefined) {
      this.store.set("atlassian/api_token", secrets.api_token ?? "");
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
  const dir = mkdtempSync(join(tmpdir(), "atlassian-client-test-"));
  const config = {
    mcpServers: {
      [serverName]: entry,
    },
  };
  const path = join(dir, "mcp.json");
  writeFileSync(path, JSON.stringify(config), "utf8");
  return path;
}

function makeMcpJsonMissing(serverName: string): string {
  const dir = mkdtempSync(join(tmpdir(), "atlassian-client-test-"));
  const config = { mcpServers: {} };
  const path = join(dir, "mcp.json");
  writeFileSync(path, JSON.stringify(config), "utf8");
  return path;
}

function decodeBasicHeader(authHeader: string): string {
  assert.ok(authHeader.startsWith("Basic "), `expected Basic prefix, got: ${authHeader}`);
  const b64 = authHeader.slice("Basic ".length);
  return Buffer.from(b64, "base64").toString("utf8");
}

function cleanupPath(path: string): void {
  rmSync(join(path, ".."), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// readAtlassianCredentials
// ---------------------------------------------------------------------------

describe("readAtlassianCredentials", () => {
  it("returns email + token when both keys are present", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    const creds = await readAtlassianCredentials(keyring);
    assert.equal(creds.email, "user@example.com");
    assert.equal(creds.token, "ATATT3xFVkGI");
  });

  it("throws with /aura secrets edit message when email is missing", async () => {
    const keyring = new FakeKeyring({ api_token: "ATATT3xFVkGI" });
    await expect(readAtlassianCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws with /aura secrets edit message when token is missing", async () => {
    const keyring = new FakeKeyring({ email: "user@example.com" });
    await expect(readAtlassianCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws when email is empty string", async () => {
    const keyring = new FakeKeyring({ email: "", api_token: "ATATT3xFVkGI" });
    await expect(readAtlassianCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws when token is empty string", async () => {
    const keyring = new FakeKeyring({ email: "user@example.com", api_token: "" });
    await expect(readAtlassianCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("trims whitespace on both values", async () => {
    const keyring = new FakeKeyring({
      email: "  user@example.com  \n",
      api_token: "  ATATT3xFVkGI\n  ",
    });
    const creds = await readAtlassianCredentials(keyring);
    assert.equal(creds.email, "user@example.com");
    assert.equal(creds.token, "ATATT3xFVkGI");
  });
});

// ---------------------------------------------------------------------------
// atlassianClient
// ---------------------------------------------------------------------------

describe("atlassianClient", () => {
  it("returns McpClient with correct Basic auth header when both keys present", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const client = await atlassianClient("atlassian", {
        keyring,
        configPath,
      });
      const decoded = decodeBasicHeader(client.authHeader);
      assert.equal(decoded, "user@example.com:ATATT3xFVkGI");
      assert.ok(
        client.authHeader.startsWith("Basic "),
        "authHeader must start with 'Basic '",
      );
    } finally {
      cleanupPath(configPath);
    }
  });

  it("does not send Bearer auth", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const client = await atlassianClient("atlassian", {
        keyring,
        configPath,
      });
      assert.ok(
        !client.authHeader.startsWith("Bearer "),
        "authHeader must not start with 'Bearer '",
      );
    } finally {
      cleanupPath(configPath);
    }
  });

  it("trims whitespace in stored values before building the header", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com\n",
      api_token: "ATATT3xFVkGI\n",
    });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const client = await atlassianClient("atlassian", {
        keyring,
        configPath,
      });
      const decoded = decodeBasicHeader(client.authHeader);
      assert.equal(decoded, "user@example.com:ATATT3xFVkGI");
    } finally {
      cleanupPath(configPath);
    }
  });

  it("throws /aura secrets edit message when email is missing", async () => {
    const keyring = new FakeKeyring({ api_token: "ATATT3xFVkGI" });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      await expect(
        atlassianClient("atlassian", { keyring, configPath }),
      ).rejects.toThrow(/run `\/aura secrets edit`/);
    } finally {
      cleanupPath(configPath);
    }
  });

  it("throws /aura secrets edit message when token is missing", async () => {
    const keyring = new FakeKeyring({ email: "user@example.com" });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      await expect(
        atlassianClient("atlassian", { keyring, configPath }),
      ).rejects.toThrow(/run `\/aura secrets edit`/);
    } finally {
      cleanupPath(configPath);
    }
  });

  it("throws /aura secrets edit message when email is empty string", async () => {
    const keyring = new FakeKeyring({ email: "", api_token: "ATATT3xFVkGI" });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      await expect(
        atlassianClient("atlassian", { keyring, configPath }),
      ).rejects.toThrow(/run `\/aura secrets edit`/);
    } finally {
      cleanupPath(configPath);
    }
  });

  it("throws 'not found' message when server is missing from mcp.json", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    const configPath = makeMcpJsonMissing("atlassian");
    try {
      await expect(
        atlassianClient("atlassian", { keyring, configPath }),
      ).rejects.toThrow(/not found or not http/);
    } finally {
      cleanupPath(configPath);
    }
  });

  it("throws 'not found' message when server type is not http", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    const configPath = makeMcpJson("atlassian", {
      type: "stdio",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      await expect(
        atlassianClient("atlassian", { keyring, configPath }),
      ).rejects.toThrow(/not found or not http/);
    } finally {
      cleanupPath(configPath);
    }
  });

  it("throws 'not found' message when server has no url", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    const configPath = makeMcpJson("atlassian", { type: "http" });
    try {
      await expect(
        atlassianClient("atlassian", { keyring, configPath }),
      ).rejects.toThrow(/not found or not http/);
    } finally {
      cleanupPath(configPath);
    }
  });

  it("uses default server name 'atlassian' when not specified", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const client = await atlassianClient(undefined, {
        keyring,
        configPath,
      });
      const decoded = decodeBasicHeader(client.authHeader);
      assert.equal(decoded, "user@example.com:ATATT3xFVkGI");
    } finally {
      cleanupPath(configPath);
    }
  });
});

// ---------------------------------------------------------------------------
// Slice 4 — digest-script-own-credential
// Verifies the dead OAuth read path is deleted and the missing-credential
// warning points at /aura secrets edit (not invalid_token).
// ---------------------------------------------------------------------------

describe("slice 4: digest-script-own-credential — dead OAuth path removed", () => {
  it("does not export readOAuthTokenFromKeyring", () => {
    assert.equal(
      (clientsModule as Record<string, unknown>).readOAuthTokenFromKeyring,
      undefined,
      "readOAuthTokenFromKeyring must be deleted from clients.ts",
    );
  });
});

describe("slice 4: missing-credential warning path", () => {
  // Replicate buildAtlassianClient's try/catch shape (devlinks.ts:330).
  // buildAtlassianClient does not accept an injectable keyring, so we test
  // the exact wrapping behavior: catch the thrown atlassianClient error and
  // format it as { client: null, warning: "Teamwork Graph dev-links layer skipped: <reason>" }.
  async function wrapLikeBuildAtlassianClient(
    fn: () => Promise<unknown>,
  ): Promise<{ client: null; warning: string }> {
    try {
      await fn();
      throw new Error("expected fn to throw");
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      return {
        client: null,
        warning: `Teamwork Graph dev-links layer skipped: ${reason}`,
      };
    }
  }

  it("atlassianClient throws /aura secrets edit when keyring is empty", async () => {
    const keyring = new FakeKeyring();
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      await expect(
        atlassianClient("atlassian", { keyring, configPath }),
      ).rejects.toThrow(/\/aura secrets edit/);
    } finally {
      cleanupPath(configPath);
    }
  });

  it("wrapping the thrown error yields a warning with 'Teamwork Graph dev-links layer skipped' and '/aura secrets edit'", async () => {
    const keyring = new FakeKeyring();
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const result = await wrapLikeBuildAtlassianClient(() =>
        atlassianClient("atlassian", { keyring, configPath }),
      );
      assert.equal(result.client, null);
      assert.ok(
        result.warning.includes("Teamwork Graph dev-links layer skipped"),
        `warning must contain 'Teamwork Graph dev-links layer skipped', got: ${result.warning}`,
      );
      assert.ok(
        result.warning.includes("/aura secrets edit"),
        `warning must contain '/aura secrets edit', got: ${result.warning}`,
      );
    } finally {
      cleanupPath(configPath);
    }
  });

  it("the warning does NOT contain 'invalid_token'", async () => {
    const keyring = new FakeKeyring();
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const result = await wrapLikeBuildAtlassianClient(() =>
        atlassianClient("atlassian", { keyring, configPath }),
      );
      assert.ok(
        !result.warning.includes("invalid_token"),
        `warning must NOT contain 'invalid_token', got: ${result.warning}`,
      );
    } finally {
      cleanupPath(configPath);
    }
  });

  it("the warning matches the exact expected format", async () => {
    const keyring = new FakeKeyring();
    const configPath = makeMcpJson("atlassian", {
      type: "http",
      url: "https://rovo.atlassian.com/mcp",
    });
    try {
      const result = await wrapLikeBuildAtlassianClient(() =>
        atlassianClient("atlassian", { keyring, configPath }),
      );
      assert.equal(
        result.warning,
        "Teamwork Graph dev-links layer skipped: no Atlassian credential in keyring (run `/aura secrets edit`)",
      );
    } finally {
      cleanupPath(configPath);
    }
  });
});
