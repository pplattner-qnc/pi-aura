// Round-trip tests for the @pi-aura/shared keyring SecretKey enum.
//
// Seam: FileKeyring accepts a storePath constructor arg, so each test creates
// a fresh temp file and there is no cross-test contamination and no platform
// dependency (createKeyring is platform-specific).
//
// The enum carries a single member since the Atlassian provisioning removal:
// the union is pinned to the Aura PAT only.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileKeyring } from "../src/keyring/file-keyring.js";
import type { SecretKey } from "../src/keyring/keyring.js";

// --- Keys under test -------------------------------------------------------

const AURA_PAT: SecretKey = { service: "aura", name: "pat" };

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

describe("FileKeyring SecretKey enum", () => {
  describe("aura/pat", () => {
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

  // listSecrets: only reports keys that are actually set.
  describe("listSecrets", () => {
    it("returns empty when no keys are set", async () => {
      const kr = makeKeyring();
      assert.deepEqual(await kr.listSecrets(), []);
    });

    it("lists the set key", async () => {
      const kr = makeKeyring();
      await kr.setSecret(AURA_PAT, "aura-pat");
      const secrets = await kr.listSecrets();
      assert.equal(secrets.length, 1);
      assert.deepEqual(secrets[0].key, AURA_PAT);
      assert.equal(secrets[0].secret, "aura-pat");
    });

    it("does not list deleted keys", async () => {
      const kr = makeKeyring();
      await kr.setSecret(AURA_PAT, "pat");
      await kr.deleteSecret(AURA_PAT);
      const secrets = await kr.listSecrets();
      assert.equal(secrets.length, 0);
    });

    it("lists empty-string values (a set empty string is a string)", async () => {
      // Empty string is stored but listSecrets only includes keys where the
      // value is a string ("" is a string, so it IS listed). This documents
      // that behavior: a set "" value appears in listSecrets.
      const kr = makeKeyring();
      await kr.setSecret(AURA_PAT, "");
      const secrets = await kr.listSecrets();
      assert.equal(secrets.length, 1);
      assert.equal(secrets[0].secret, "");
    });
  });
});
