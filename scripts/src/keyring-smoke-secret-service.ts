import { SecretServiceKeyring } from "@pi-aura/shared/keyring/secret-service-keyring";
import type { SecretKey } from "@pi-aura/shared/keyring";

const TEST_KEY: SecretKey = { service: "aura", name: "pat" };
const TEST_SECRET = "aura-pat-smoke-secret-" + Date.now();

async function main(): Promise<void> {
  console.log("platform:", process.platform);
  console.log("available:", await SecretServiceKeyring.isAvailable());

  const keyring = new SecretServiceKeyring();

  // Clean up any leftover from a previous run.
  await keyring.deleteSecret(TEST_KEY);

  // set
  await keyring.setSecret(TEST_KEY, TEST_SECRET);
  console.log("set: OK");

  // get matches
  const got = await keyring.getSecret(TEST_KEY);
  if (got !== TEST_SECRET) {
    throw new Error(`get mismatch: expected ${TEST_SECRET}, got ${got}`);
  }
  console.log("get: OK");

  // list finds it
  const listed = await keyring.listSecrets();
  const found = listed.find((s) => s.key.service === TEST_KEY.service && s.key.name === TEST_KEY.name);
  if (!found || found.secret !== TEST_SECRET) {
    throw new Error(`list did not find secret: ${JSON.stringify(listed)}`);
  }
  console.log("list: OK");

  // delete returns true and removes it
  const deleted = await keyring.deleteSecret(TEST_KEY);
  if (!deleted) {
    throw new Error("delete returned false");
  }
  console.log("delete: OK");

  // get-after-delete returns null
  const after = await keyring.getSecret(TEST_KEY);
  if (after !== null) {
    throw new Error(`get-after-delete returned ${after}`);
  }
  console.log("get-after-delete: OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
