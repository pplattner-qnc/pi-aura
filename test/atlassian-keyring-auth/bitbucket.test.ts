/**
 * Unit tests for the Bitbucket credential loader refactored to read from the
 * shared Atlassian keyring (slice 5 of the atlassian-keyring-auth task).
 *
 * Run via root vitest:
 *   npx vitest run test/atlassian-keyring-auth/bitbucket.test.ts
 *
 * Seams (per arch spec Slice 5):
 * - Fake Keyring implementing @pi-aura/shared/keyring's Keyring interface.
 * - loadCreds (refactored, injectable Keyring + defaultWorkspace): with
 *   keyring populated + workspace set → returns {email, token, defaultWorkspace};
 *   keyring empty → degrade signal / warning naming /aura secrets edit (no
 *   throw out of the layer); workspace missing → degrade with a workspace-
 *   specific warning.
 * - No mcp.json read in the test. No live Bitbucket API call.
 */

import assert from "node:assert/strict";
import { describe, it, expect } from "vitest";
import type { Keyring, SecretKey, StoredSecret } from "@pi-aura/shared/keyring";

import { loadCreds } from "../../scripts/src/bitbucket.js";

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
// loadCreds — happy path
// ---------------------------------------------------------------------------

describe("loadCreds", () => {
  it("returns {email, token, defaultWorkspace} when keyring populated + workspace set", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    const creds = await loadCreds(keyring, "my-workspace");
    assert.equal(creds.email, "user@example.com");
    assert.equal(creds.token, "ATATT3xFVkGI");
    assert.equal(creds.defaultWorkspace, "my-workspace");
  });

  it("trims whitespace from keyring values", async () => {
    const keyring = new FakeKeyring({
      email: "  user@example.com\n  ",
      api_token: "  ATATT3xFVkGI\n",
    });
    const creds = await loadCreds(keyring, "my-workspace");
    assert.equal(creds.email, "user@example.com");
    assert.equal(creds.token, "ATATT3xFVkGI");
  });
});

// ---------------------------------------------------------------------------
// loadCreds — keyring empty → degrade signal naming /aura secrets edit
// ---------------------------------------------------------------------------

describe("loadCreds — keyring empty", () => {
  it("throws with /aura secrets edit message when email is missing", async () => {
    const keyring = new FakeKeyring({ api_token: "ATATT3xFVkGI" });
    await expect(loadCreds(keyring, "my-workspace")).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws with /aura secrets edit message when token is missing", async () => {
    const keyring = new FakeKeyring({ email: "user@example.com" });
    await expect(loadCreds(keyring, "my-workspace")).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws with /aura secrets edit message when both are missing", async () => {
    const keyring = new FakeKeyring();
    await expect(loadCreds(keyring, "my-workspace")).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws with /aura secrets edit message when email is empty string", async () => {
    const keyring = new FakeKeyring({ email: "", api_token: "ATATT3xFVkGI" });
    await expect(loadCreds(keyring, "my-workspace")).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("wrapping the thrown error yields a layer-skip warning (no throw out of the layer)", async () => {
    const keyring = new FakeKeyring();
    // Mirror how the caller wraps loadCreds into a layer-skip warning.
    let warning: string | null = null;
    let creds: { email: string; token: string; defaultWorkspace: string } | null = null;
    try {
      creds = await loadCreds(keyring, "my-workspace");
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      warning = `Bitbucket dev-links layer skipped: ${reason}`;
    }
    assert.equal(creds, null);
    assert.ok(
      warning !== null && warning.includes("/aura secrets edit"),
      `warning must contain '/aura secrets edit', got: ${warning}`,
    );
    assert.ok(
      warning !== null && warning.includes("Bitbucket dev-links layer skipped"),
      `warning must contain 'Bitbucket dev-links layer skipped', got: ${warning}`,
    );
  });
});

// ---------------------------------------------------------------------------
// loadCreds — workspace missing → workspace-specific degrade
// ---------------------------------------------------------------------------

describe("loadCreds — workspace missing", () => {
  it("throws a workspace-specific warning when defaultWorkspace is empty", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    await expect(loadCreds(keyring, "")).rejects.toThrow(/workspace/i);
  });

  it("wrapping the thrown error yields a layer-skip warning naming the workspace", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      api_token: "ATATT3xFVkGI",
    });
    let warning: string | null = null;
    let creds: { email: string; token: string; defaultWorkspace: string } | null = null;
    try {
      creds = await loadCreds(keyring, "");
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      warning = `Bitbucket dev-links layer skipped: ${reason}`;
    }
    assert.equal(creds, null);
    assert.ok(
      warning !== null && /workspace/i.test(warning),
      `warning must mention 'workspace', got: ${warning}`,
    );
    assert.ok(
      warning !== null && warning.includes("Bitbucket dev-links layer skipped"),
      `warning must contain 'Bitbucket dev-links layer skipped', got: ${warning}`,
    );
    // The workspace-missing warning should NOT mention /aura secrets edit.
    assert.ok(
      warning !== null && !warning.includes("/aura secrets edit"),
      `workspace-missing warning should NOT mention '/aura secrets edit', got: ${warning}`,
    );
  });
});
