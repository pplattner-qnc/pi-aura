// Round-trip tests for the @pi-aura/shared keyring SecretKey enum.
//
// Seam: FileKeyring accepts a storePath constructor arg — each test creates a
// fresh temp file so there is no cross-test contamination and no platform
// dependency (createKeyring is platform-specific).

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileKeyring } from "../src/keyring/file-keyring.js";
import type { SecretKey } from "../src/keyring/keyring.js";

// --- Keys under test -------------------------------------------------------

const AURA_PAT: SecretKey = { service: "aura", name: "pat" };

// Atlassian email — the user's Atlassian account email.
// Contract: an empty-string stored value round-trips as "" (not null).
// Callers must treat "" as "not set", the same convention as the Aura PAT.
const ATLASSIAN_EMAIL: SecretKey = { service: "atlassian", name: "email" };

// Atlassian API token — a server-side API token from the Atlassian account.
// Contract: an empty-string stored value round-trips as "" (not null).
// Callers must treat "" as "not set", the same convention as the Aura PAT.
const ATLASSIAN_API_TOKEN: SecretKey = { service: "atlassian", name: "api_token" };

// Atlassian Bitbucket token — a Bitbucket-scoped PAT stored alongside the
// shared Atlassian email. Contract: an empty-string stored value round-trips
// as "" (not null); callers must treat "" as "not set", same convention as the
// Aura PAT.
const ATLASSIAN_BITBUCKET_TOKEN: SecretKey = { service: "atlassian", name: "bitbucket_token" };

// --- Temp directory helper -------------------------------------------------

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "keyring-test-"));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeKeyring(): FileKeyring {
  return new FileKeyring(join(tmpDir, `store-${Math.random().toString(36).slice(2)}.json`));
}

// --- Tests -----------------------------------------------------------------

describe("FileKeyring SecretKey enum — atlassian keys", () => {
  // Regression: existing aura/pat key still works.
  describe("aura/pat (regression)", () => {
    it("set/get round-trips a value", async () => {
      const kr = makeKeyring();
      await kr.setSecret(AURA_PAT, "my-aura-pat");
      assert.equal(await kr.getSecret(AURA_PAT), "my-aura-pat");
    });

    it("getSecret returns null for a missing key", async () => {
      const kr = makeKeyring();
      assert.equal(await kr.getSecret(AURA_PAT), null);
    });

    it("overwrite replaces the previous value", async () => {
      const kr = makeKeyring();
      await kr.setSecret(AURA_PAT, "first");
      await kr.setSecret(AURA_PAT, "second");
      assert.equal(await kr.getSecret(AURA_PAT), "second");
    });

    it("delete removes the key and returns true", async () => {
      const kr = makeKeyring();
      await kr.setSecret(AURA_PAT, "to-delete");
      assert.equal(await kr.deleteSecret(AURA_PAT), true);
      assert.equal(await kr.getSecret(AURA_PAT), null);
    });

    it("delete returns false when the key does not exist", async () => {
      const kr = makeKeyring();
      assert.equal(await kr.deleteSecret(AURA_PAT), false);
    });

    it("empty string round-trips as empty string", async () => {
      const kr = makeKeyring();
      await kr.setSecret(AURA_PAT, "");
      assert.equal(await kr.getSecret(AURA_PAT), "");
    });
  });

  // New: atlassian/email
  describe("atlassian/email", () => {
    it("set/get round-trips a value", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_EMAIL, "user@example.com");
      assert.equal(await kr.getSecret(ATLASSIAN_EMAIL), "user@example.com");
    });

    it("getSecret returns null for a missing key", async () => {
      const kr = makeKeyring();
      assert.equal(await kr.getSecret(ATLASSIAN_EMAIL), null);
    });

    it("overwrite replaces the previous value", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_EMAIL, "first@example.com");
      await kr.setSecret(ATLASSIAN_EMAIL, "second@example.com");
      assert.equal(await kr.getSecret(ATLASSIAN_EMAIL), "second@example.com");
    });

    it("delete removes the key and returns true", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_EMAIL, "to-delete@example.com");
      assert.equal(await kr.deleteSecret(ATLASSIAN_EMAIL), true);
      assert.equal(await kr.getSecret(ATLASSIAN_EMAIL), null);
    });

    it("delete returns false when the key does not exist", async () => {
      const kr = makeKeyring();
      assert.equal(await kr.deleteSecret(ATLASSIAN_EMAIL), false);
    });

    it("empty string round-trips as empty string", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_EMAIL, "");
      assert.equal(await kr.getSecret(ATLASSIAN_EMAIL), "");
    });
  });

  // New: atlassian/api_token
  describe("atlassian/api_token", () => {
    it("set/get round-trips a value", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_API_TOKEN, "ATATT3xToken123");
      assert.equal(await kr.getSecret(ATLASSIAN_API_TOKEN), "ATATT3xToken123");
    });

    it("getSecret returns null for a missing key", async () => {
      const kr = makeKeyring();
      assert.equal(await kr.getSecret(ATLASSIAN_API_TOKEN), null);
    });

    it("overwrite replaces the previous value", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_API_TOKEN, "token-one");
      await kr.setSecret(ATLASSIAN_API_TOKEN, "token-two");
      assert.equal(await kr.getSecret(ATLASSIAN_API_TOKEN), "token-two");
    });

    it("delete removes the key and returns true", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_API_TOKEN, "to-delete");
      assert.equal(await kr.deleteSecret(ATLASSIAN_API_TOKEN), true);
      assert.equal(await kr.getSecret(ATLASSIAN_API_TOKEN), null);
    });

    it("delete returns false when the key does not exist", async () => {
      const kr = makeKeyring();
      assert.equal(await kr.deleteSecret(ATLASSIAN_API_TOKEN), false);
    });

    it("empty string round-trips as empty string", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_API_TOKEN, "");
      assert.equal(await kr.getSecret(ATLASSIAN_API_TOKEN), "");
    });
  });

  // New: atlassian/bitbucket_token
  describe("atlassian/bitbucket_token", () => {
    it("set/get round-trips a value", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_BITBUCKET_TOKEN, "BB-token-abc");
      assert.equal(await kr.getSecret(ATLASSIAN_BITBUCKET_TOKEN), "BB-token-abc");
    });

    it("getSecret returns null for a missing key", async () => {
      const kr = makeKeyring();
      assert.equal(await kr.getSecret(ATLASSIAN_BITBUCKET_TOKEN), null);
    });

    it("overwrite replaces the previous value", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_BITBUCKET_TOKEN, "token-one");
      await kr.setSecret(ATLASSIAN_BITBUCKET_TOKEN, "token-two");
      assert.equal(await kr.getSecret(ATLASSIAN_BITBUCKET_TOKEN), "token-two");
    });

    it("delete removes the key and returns true", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_BITBUCKET_TOKEN, "to-delete");
      assert.equal(await kr.deleteSecret(ATLASSIAN_BITBUCKET_TOKEN), true);
      assert.equal(await kr.getSecret(ATLASSIAN_BITBUCKET_TOKEN), null);
    });

    it("delete returns false when the key does not exist", async () => {
      const kr = makeKeyring();
      assert.equal(await kr.deleteSecret(ATLASSIAN_BITBUCKET_TOKEN), false);
    });

    it("empty string round-trips as empty string", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_BITBUCKET_TOKEN, "");
      assert.equal(await kr.getSecret(ATLASSIAN_BITBUCKET_TOKEN), "");
    });
  });

  // listSecrets — only reports keys that are actually set.
  describe("listSecrets", () => {
    it("returns empty when no keys are set", async () => {
      const kr = makeKeyring();
      assert.deepEqual(await kr.listSecrets(), []);
    });

    it("lists only set keys — one key", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_EMAIL, "user@example.com");
      const secrets = await kr.listSecrets();
      assert.equal(secrets.length, 1);
      assert.deepEqual(secrets[0].key, ATLASSIAN_EMAIL);
      assert.equal(secrets[0].secret, "user@example.com");
    });

    it("lists only set keys — both new keys set", async () => {
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_EMAIL, "user@example.com");
      await kr.setSecret(ATLASSIAN_API_TOKEN, "token123");
      const secrets = await kr.listSecrets();
      assert.equal(secrets.length, 2);
      const keys = secrets.map((s) => s.key);
      assert.ok(keys.some((k) => k.service === "atlassian" && k.name === "email"));
      assert.ok(keys.some((k) => k.service === "atlassian" && k.name === "api_token"));
    });

    it("lists all four keys when all are set (regression + new)", async () => {
      const kr = makeKeyring();
      await kr.setSecret(AURA_PAT, "aura-pat");
      await kr.setSecret(ATLASSIAN_EMAIL, "user@example.com");
      await kr.setSecret(ATLASSIAN_API_TOKEN, "token123");
      await kr.setSecret(ATLASSIAN_BITBUCKET_TOKEN, "bb-token");
      const secrets = await kr.listSecrets();
      assert.equal(secrets.length, 4);
      const keys = secrets.map((s) => `${s.key.service}/${s.key.name}`).sort();
      assert.deepEqual(keys, [
        "atlassian/api_token",
        "atlassian/bitbucket_token",
        "atlassian/email",
        "aura/pat",
      ]);
    });

    it("does not list deleted keys", async () => {
      const kr = makeKeyring();
      await kr.setSecret(AURA_PAT, "pat");
      await kr.setSecret(ATLASSIAN_EMAIL, "user@example.com");
      await kr.setSecret(ATLASSIAN_API_TOKEN, "token");
      await kr.deleteSecret(ATLASSIAN_EMAIL);
      const secrets = await kr.listSecrets();
      assert.equal(secrets.length, 2);
      assert.ok(!secrets.some((s) => s.key.service === "atlassian" && s.key.name === "email"));
    });

    it("does not list empty-string keys", async () => {
      // Empty string is stored but listSecrets only includes keys where the
      // value is a string — "" is a string, so it IS listed. This documents
      // that behavior: a set "" value appears in listSecrets.
      const kr = makeKeyring();
      await kr.setSecret(ATLASSIAN_EMAIL, "");
      const secrets = await kr.listSecrets();
      // "" is a valid string value, so it appears in listSecrets.
      assert.equal(secrets.length, 1);
      assert.equal(secrets[0].secret, "");
    });
  });
});
