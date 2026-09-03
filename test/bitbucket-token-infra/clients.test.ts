/**
 * Unit tests for the Bitbucket credential reader + shared email helper
 * (slice 1 of the bitbucket-token-infra task).
 *
 * Run via root vitest:
 *   npx vitest run test/bitbucket-token-infra/clients.test.ts
 *
 * Seams (per arch spec Slice 1):
 * - Fake Keyring implementing @pi-aura/shared/keyring's Keyring interface.
 * - readBitbucketCredentials(keyring): reads atlassian/email +
 *   atlassian/bitbucket_token, trims, throws naming /aura secrets edit when
 *   either is missing/empty/whitespace. No live network call.
 */

import assert from "node:assert/strict";
import { describe, it, expect } from "vitest";
import type { Keyring, SecretKey, StoredSecret } from "@pi-aura/shared/keyring";

import {
  readBitbucketCredentials,
  readAtlassianEmail,
} from "@pi-aura/shared/digest/clients";

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
// readAtlassianEmail
// ---------------------------------------------------------------------------

describe("readAtlassianEmail", () => {
  it("returns the trimmed email when present", async () => {
    const keyring = new FakeKeyring({ email: "  user@example.com\n  " });
    assert.equal(await readAtlassianEmail(keyring), "user@example.com");
  });

  it("returns empty string when email is missing", async () => {
    const keyring = new FakeKeyring();
    assert.equal(await readAtlassianEmail(keyring), "");
  });

  it("returns empty string when email is empty string", async () => {
    const keyring = new FakeKeyring({ email: "" });
    assert.equal(await readAtlassianEmail(keyring), "");
  });

  it("returns empty string when email is whitespace-only", async () => {
    const keyring = new FakeKeyring({ email: "   \n  " });
    assert.equal(await readAtlassianEmail(keyring), "");
  });

  it("does not throw when email is missing", async () => {
    const keyring = new FakeKeyring();
    // Must resolve, not reject.
    const result = await readAtlassianEmail(keyring);
    assert.equal(result, "");
  });
});

// ---------------------------------------------------------------------------
// readBitbucketCredentials
// ---------------------------------------------------------------------------

describe("readBitbucketCredentials", () => {
  it("returns email + token when both are present", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      bitbucket_token: "BB-token-abc",
    });
    const creds = await readBitbucketCredentials(keyring);
    assert.equal(creds.email, "user@example.com");
    assert.equal(creds.token, "BB-token-abc");
  });

  it("trims whitespace on both values", async () => {
    const keyring = new FakeKeyring({
      email: "  user@example.com  \n",
      bitbucket_token: "  BB-token-abc\n  ",
    });
    const creds = await readBitbucketCredentials(keyring);
    assert.equal(creds.email, "user@example.com");
    assert.equal(creds.token, "BB-token-abc");
  });

  it("throws /aura secrets edit when email is missing", async () => {
    const keyring = new FakeKeyring({ bitbucket_token: "BB-token-abc" });
    await expect(readBitbucketCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws /aura secrets edit when bitbucket token is missing", async () => {
    const keyring = new FakeKeyring({ email: "user@example.com" });
    await expect(readBitbucketCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws /aura secrets edit when email is empty string", async () => {
    const keyring = new FakeKeyring({ email: "", bitbucket_token: "BB-token-abc" });
    await expect(readBitbucketCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws /aura secrets edit when bitbucket token is empty string", async () => {
    const keyring = new FakeKeyring({ email: "user@example.com", bitbucket_token: "" });
    await expect(readBitbucketCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws /aura secrets edit when bitbucket token is whitespace-only", async () => {
    const keyring = new FakeKeyring({
      email: "user@example.com",
      bitbucket_token: "   \n  ",
    });
    await expect(readBitbucketCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });

  it("throws /aura secrets edit when both are missing", async () => {
    const keyring = new FakeKeyring();
    await expect(readBitbucketCredentials(keyring)).rejects.toThrow(
      /run `\/aura secrets edit`/,
    );
  });
});
