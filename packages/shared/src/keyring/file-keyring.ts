import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import type { Keyring, SecretKey, StoredSecret } from "./keyring.js";

/** Internal namespace used to scope on-disk storage. */
const NAMESPACE = "aura-skills";

/** Default store path for the JSON-backed keyring. */
const DEFAULT_STORE_PATH = join(homedir(), ".cache", NAMESPACE, "store.json");

/** Known secret keys. Because `SecretKey` is a closed enum, this array is the
 *  single source of truth for `listSecrets` to probe against. Add new union
 *  members here as the enum grows. */
const KNOWN_SECRET_KEYS: readonly SecretKey[] = [
  { service: "aura", name: "pat" },
];

/** Pack a `SecretKey` into the reversible key used inside the JSON store. */
function packKey(key: SecretKey): string {
  return `${key.service}/${key.name}`;
}

/** Always-available JSON-on-disk fallback for the keyring. */
export class FileKeyring implements Keyring {
  private readonly storePath: string;

  /** Test hook: override the store path. The public `Keyring` interface takes
   *  no constructor args, so this is an internal seam. */
  constructor(storePath?: string) {
    this.storePath = storePath ?? DEFAULT_STORE_PATH;
  }

  /** Always true — the file backend is the universal fallback. */
  static isAvailable(): boolean {
    return true;
  }

  async setSecret(key: SecretKey, secret: string): Promise<void> {
    const data = await this.load();
    data[packKey(key)] = secret;
    await this.save(data);
  }

  async getSecret(key: SecretKey): Promise<string | null> {
    const data = await this.load();
    const value = data[packKey(key)];
    return typeof value === "string" ? value : null;
  }

  async deleteSecret(key: SecretKey): Promise<boolean> {
    const data = await this.load();
    const packed = packKey(key);
    if (!(packed in data)) return false;
    delete data[packed];
    await this.save(data);
    return true;
  }

  async listSecrets(): Promise<StoredSecret[]> {
    const data = await this.load();
    const out: StoredSecret[] = [];
    for (const known of KNOWN_SECRET_KEYS) {
      const packed = packKey(known);
      const secret = data[packed];
      if (typeof secret === "string") {
        out.push({ key: known, secret });
      }
    }
    return out;
  }

  /** Load the JSON store. Missing or corrupt files return an empty map. */
  private async load(): Promise<Record<string, string>> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch (e) {
      // Ignore ENOENT and JSON parse errors — behave as if the store is empty.
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        // Corrupt JSON / unreadable file: swallow and return empty map.
      }
    }
    return {};
  }

  /** Persist the JSON store, creating the parent directory and tightening
   *  permissions best-effort. */
  private async save(data: Record<string, string>): Promise<void> {
    await mkdir(join(this.storePath, ".."), { recursive: true });
    await writeFile(
      this.storePath,
      JSON.stringify(data, null, 2) + "\n",
      { mode: 0o600, encoding: "utf8" },
    );
    try {
      await chmod(this.storePath, 0o600);
    } catch {
      // Ignore chmod failures on platforms/filesystems that don't support it.
    }
  }
}
