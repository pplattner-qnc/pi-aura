// MacOS keyring implementation using the `/usr/bin/security` CLI.
// Not exported from the public keyring barrel.

import type { Keyring, SecretKey, StoredSecret } from "./keyring.js";
import { KeyringLockedError } from "./keyring.js";
import { run, isFile, ExecError } from "./internal.js";

/** Internal namespace used to scope macOS keychain entries. */
const NAMESPACE = "aura-skills";

/** Fixed path to the macOS `security` binary. */
const SECURITY_BINARY = "/usr/bin/security";

/** Known secret keys. Because `SecretKey` is a closed enum, this array is the
 *  single source of truth for `listSecrets` to probe against. Add new union
 *  members here as the enum grows. */
const KNOWN_SECRET_KEYS: readonly SecretKey[] = [
  { service: "aura", name: "pat" },
  { service: "atlassian", name: "email" },
  { service: "atlassian", name: "api_token" },
];

/** Per-impl packing (Q14): the namespace is stored as the `-s` (service)
 *  attribute and the account stores `${service}/${name}`. This keeps entries
 *  scoped under `aura-skills` while still making the original `SecretKey`
 *  recoverable from a `dump-keychain` block.
 *
 *  Example: `{ service: "aura", name: "pat" }` ->
 *    `-s "aura-skills" -a "aura/pat"` */
function packKey(key: SecretKey): { service: string; account: string } {
  return { service: NAMESPACE, account: `${key.service}/${key.name}` };
}

/** Recover a known `SecretKey` from the raw macOS service/account strings.
 *  Returns `undefined` when the entry does not belong to this namespace or
 *  does not match a known key. */
function unpackKey(service: string, account: string): SecretKey | undefined {
  if (service !== NAMESPACE) return undefined;
  const known = KNOWN_SECRET_KEYS.find((k) => `${k.service}/${k.name}` === account);
  return known;
}

/** macOS `security` CLI keyring backend. */
export class MacosKeyring implements Keyring {
  /** True on macOS when `/usr/bin/security` exists. */
  static isAvailable(): boolean {
    return process.platform === "darwin" && isFile(SECURITY_BINARY);
  }

  async getSecret(key: SecretKey): Promise<string | null> {
    const { service, account } = packKey(key);
    try {
      const res = await run(
        SECURITY_BINARY,
        ["find-generic-password", "-s", service, "-a", account, "-w"],
        { ignoreExitCodes: new Set([44]) },
      );
      if (res.exitCode === 44) return null;
      return res.stdout.replace(/\r?\n$/, "");
    } catch (e) {
      throw this.mapError("getSecret", e);
    }
  }

  async setSecret(key: SecretKey, secret: string): Promise<void> {
    const { service, account } = packKey(key);
    try {
      // `security` has no upsert primitive; delete-if-exists then add.
      await run(
        SECURITY_BINARY,
        ["delete-generic-password", "-s", service, "-a", account],
        { ignoreExitCodes: new Set([44, 128]) },
      );
      await run(SECURITY_BINARY, [
        "add-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
        secret,
      ]);
    } catch (e) {
      throw this.mapError("setSecret", e);
    }
  }

  async deleteSecret(key: SecretKey): Promise<boolean> {
    const { service, account } = packKey(key);
    try {
      const res = await run(
        SECURITY_BINARY,
        ["delete-generic-password", "-s", service, "-a", account],
        { ignoreExitCodes: new Set([44, 128]) },
      );
      return res.exitCode === 0;
    } catch (e) {
      throw this.mapError("deleteSecret", e);
    }
  }

  async listSecrets(): Promise<StoredSecret[]> {
    try {
      const res = await run(SECURITY_BINARY, ["dump-keychain"], {
        ignoreExitCodes: new Set([0]),
      });
      const out: StoredSecret[] = [];
      // Each keychain entry starts with `keychain: "..."` at the beginning
      // of a line. Split on that boundary to process one block at a time.
      const blocks = res.stdout.split(/(?=^keychain: ")/m);
      for (const block of blocks) {
        const svce = block.match(/"svce"<blob>="([^"]*)"/);
        const acct = block.match(/"acct"<blob>="([^"]*)"/);
        if (!svce || !acct) continue;
        const key = unpackKey(svce[1], acct[1]);
        if (!key) continue;
        // Re-read the secret via `getSecret`; never trust the dump text
        // for the actual credential value.
        const secret = await this.getSecret(key);
        if (secret !== null) {
          out.push({ key, secret });
        }
      }
      return out;
    } catch (e) {
      throw this.mapError("listSecrets", e);
    }
  }

  /** Map low-level exec errors to domain errors where appropriate. */
  private mapError(op: string, e: unknown): unknown {
    if (e instanceof ExecError && indicatesLockedKeychain(e.stderr)) {
      return new KeyringLockedError("macos-keychain", `macOS keychain is locked during ${op}: ${e.stderr.slice(0, 200)}`);
    }
    return e;
  }
}

/** Best-effort detection of a locked keychain from `security` stderr. */
function indicatesLockedKeychain(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("user interaction is not allowed") ||
    lower.includes("the user name or passphrase you entered is not correct") ||
    lower.includes("a password is required") ||
    lower.includes("keychain is locked")
  );
}
