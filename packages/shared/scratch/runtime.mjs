// Runtime smoke test: createKeyring() must throw "not implemented".
import { createKeyring } from "@pi-aura/shared/keyring";

try {
  await createKeyring();
  console.error("FAIL: createKeyring() did not throw");
  process.exit(1);
} catch (e) {
  if (!(e instanceof Error)) {
    console.error("FAIL: thrown value is not an Error", e);
    process.exit(1);
  }
  if (e.message !== "not implemented") {
    console.error("FAIL: unexpected error message:", e.message);
    process.exit(1);
  }
  console.log("PASS: createKeyring() throws Error(\"not implemented\")");
}
