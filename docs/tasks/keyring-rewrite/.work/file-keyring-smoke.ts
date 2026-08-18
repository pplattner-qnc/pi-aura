import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileKeyring } from "../../../../packages/shared/src/keyring/file-keyring.js";
import type { SecretKey } from "../../../../packages/shared/src/keyring/keyring.js";

const secretKey: SecretKey = { service: "aura", name: "pat" };
const storeDir = join(tmpdir(), `file-keyring-smoke-${Date.now()}`);
mkdirSync(storeDir, { recursive: true });
const storePath = join(storeDir, "store.json");

async function main() {
  // Static availability
  assert.equal(FileKeyring.isAvailable(), true, "isAvailable should always be true");

  const keyring = new FileKeyring(storePath);

  // CRUD round-trip
  await keyring.setSecret(secretKey, "my-token");
  const got = await keyring.getSecret(secretKey);
  assert.equal(got, "my-token", "getSecret should return the stored secret");

  const listed = await keyring.listSecrets();
  assert.deepEqual(listed, [{ key: secretKey, secret: "my-token" }], "listSecrets should return the stored secret");

  const deleted = await keyring.deleteSecret(secretKey);
  assert.equal(deleted, true, "deleteSecret should return true when secret existed");

  const afterDelete = await keyring.getSecret(secretKey);
  assert.equal(afterDelete, null, "getSecret should return null after deletion");

  const deletedAgain = await keyring.deleteSecret(secretKey);
  assert.equal(deletedAgain, false, "deleteSecret should return false when secret did not exist");

  // Distinct keys should not collide (inject a different map key directly)
  await keyring.setSecret(secretKey, "pat-secret");
  writeFileSync(
    storePath,
    JSON.stringify({
      "aura/pat": "pat-secret",
      "aura/other": "other-secret",
      "other/service": "other-service-secret",
    }, null, 2) + "\n",
    "utf8",
  );
  const distinctListed = await keyring.listSecrets();
  assert.equal(distinctListed.length, 1, "listSecrets should only return known SecretKey entries");
  assert.deepEqual(distinctListed[0], { key: secretKey, secret: "pat-secret" });
  assert.equal(await keyring.getSecret(secretKey), "pat-secret");

  // Corrupt JSON -> getSecret returns null, listSecrets returns empty
  writeFileSync(storePath, "this is not json", "utf8");
  assert.equal(await keyring.getSecret(secretKey), null, "corrupt JSON should yield null from getSecret");
  assert.deepEqual(await keyring.listSecrets(), [], "corrupt JSON should yield empty listSecrets");

  // Unknown map entries are ignored
  writeFileSync(
    storePath,
    JSON.stringify({ "foo/bar": "baz" }, null, 2) + "\n",
    "utf8",
  );
  assert.deepEqual(await keyring.listSecrets(), [], "unknown entries should be ignored by listSecrets");

  // Cleanup
  rmSync(storeDir, { recursive: true, force: true });
  console.log("file-keyring smoke passed");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
