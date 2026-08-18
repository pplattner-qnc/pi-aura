// Secret Service D-Bus keyring implementation for Linux.
//
// This module statically imports dbus-next, but it is only loaded on Linux
// via the dynamic import() in createKeyring(). macOS and file-only paths
// never evaluate it.

import dbus, { Variant, type MessageBus } from "dbus-next";
import {
  getDiffieHellman,
  hkdfSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

import type { Keyring, SecretKey, StoredSecret } from "./keyring.js";
import { KeyringLockedError, KeyringDBusError } from "./keyring.js";

/** Internal namespace used to scope D-Bus item attributes. */
const NAMESPACE = "aura-skills";

/** The only Secret Service DH algorithm this implementation supports. */
const DH_ALGORITHM = "dh-ietf1024-sha256-aes128-cbc-pkcs7";

/** The IETF MODP 1024-bit group (aka Oakley Group 2 / RFC 3526 Group 2). */
const DH_GROUP = "modp2";

/** AES key length produced by the handshake's HKDF step. */
const AES_KEY_BYTES = 16;

/** IV length for AES-128-CBC. */
const AES_IV_BYTES = 16;

/** HKDF salt defaults to hash-length zeros when not supplied by caller. */
const HKDF_SALT = Buffer.alloc(32, 0);

/** HKDF info string is empty for this algorithm. */
const HKDF_INFO = Buffer.alloc(0);

/** D-Bus destination for the freedesktop Secret Service. */
const SECRETS_DESTINATION = "org.freedesktop.secrets";

/** D-Bus object path for the Secret Service root object. */
const SECRETS_PATH = "/org/freedesktop/secrets";

/** D-Bus interface for the Secret Service. */
const SERVICE_INTERFACE = "org.freedesktop.Secret.Service";

/** D-Bus interface for a Secret Service collection. */
const COLLECTION_INTERFACE = "org.freedesktop.Secret.Collection";

/** D-Bus interface for a Secret Service item. */
const ITEM_INTERFACE = "org.freedesktop.Secret.Item";

/** Known secret keys. Because `SecretKey` is a closed enum, this array is the
 *  single source of truth for `listSecrets` to probe against. Add new union
 *  members here as the enum grows. */
const KNOWN_SECRET_KEYS: readonly SecretKey[] = [
  { service: "aura", name: "pat" },
];

/** Pack a `SecretKey` into the D-Bus attribute map stored on each item.
 *
 *  Per-impl packing (Q14): we use the `xdg:schema` namespace convention plus
 *  per-key `service` and `name` attributes. This is reversible and keeps all
 *  Aura entries scoped under a single schema. */
function packAttributes(key: SecretKey): Record<string, string> {
  return {
    "xdg:schema": NAMESPACE,
    service: key.service,
    name: key.name,
  };
}

/** Pad a Diffie-Hellman shared secret to the full prime length (128 bytes).
 *  The Secret Service implementation in libsecret pads with leading zeros
 *  before feeding the shared secret into HKDF. */
function padDhSecret(secret: Buffer, length = 128): Buffer {
  if (secret.length >= length) return secret;
  return Buffer.concat([Buffer.alloc(length - secret.length, 0), secret]);
}

/** Derive the AES-128 session key from the DH shared secret.
 *  Uses HKDF-SHA256 with a 32-zero-byte salt and empty info, matching
 *  libsecret/egg-hkdf.c. */
function deriveAesKey(sharedSecret: Buffer): Buffer {
  const key = hkdfSync(
    "sha256",
    padDhSecret(sharedSecret),
    HKDF_SALT,
    HKDF_INFO,
    AES_KEY_BYTES,
  );
  return Buffer.from(key);
}

/** Build the D-Bus property map used by Collection.CreateItem. */
function buildItemProperties(
  key: SecretKey,
): Record<string, Variant<unknown>> {
  return {
    "org.freedesktop.Secret.Item.Attributes": new Variant(
      "a{ss}",
      packAttributes(key),
    ),
    "org.freedesktop.Secret.Item.Label": new Variant(
      "s",
      `${key.service}/${key.name}`,
    ),
  };
}

/** Build the Secret struct (signature `(oayays)`) for CreateItem/SetSecret. */
function buildSecret(
  sessionPath: string,
  aesKey: Buffer,
  plaintext: string,
): [string, Buffer, Buffer, string] {
  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv("aes-128-cbc", aesKey, iv);
  const value = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [sessionPath, iv, value, "text/plain"];
}

/** Decrypt a Secret struct returned by Item.GetSecret. */
function decryptSecret(secretStruct: unknown, aesKey: Buffer): string {
  const [sessionPath, iv, value, contentType] = secretStruct as [
    string,
    Buffer,
    Buffer,
    string,
  ];
  void sessionPath;
  void contentType;
  const decipher = createDecipheriv("aes-128-cbc", aesKey, iv);
  return Buffer.concat([decipher.update(value), decipher.final()]).toString("utf8");
}

/** Context passed to operations that run inside an encrypted session. */
interface SessionContext {
  bus: MessageBus;
  sessionPath: string;
  aesKey: Buffer;
  defaultCollectionPath: string;
}

/** Return true when the error indicates a locked collection/item. */
function isLockedDbusError(e: unknown): boolean {
  if (e instanceof dbus.DBusError) {
    const type = e.type.toLowerCase();
    const text = e.text.toLowerCase();
    return (
      type.includes("islocked") ||
      type.includes("locked") ||
      text.includes("locked") ||
      text.includes("not unlocked") ||
      text.includes("user interaction")
    );
  }
  if (e instanceof Error) {
    const text = e.message.toLowerCase();
    return text.includes("locked") || text.includes("not unlocked");
  }
  return false;
}

/** Wrap a low-level D-Bus error in a domain error. */
function wrapDbusError(e: unknown): Error {
  if (e instanceof KeyringLockedError || e instanceof KeyringDBusError) {
    return e;
  }
  if (isLockedDbusError(e)) {
    const message = e instanceof Error ? e.message : "Secret Service is locked";
    return new KeyringLockedError("secret-service", message);
  }
  const message = e instanceof Error ? e.message : "D-Bus keyring error";
  return new KeyringDBusError(message);
}

/** Linux Secret Service keyring backend implemented with dbus-next.
 *
 *  Establishes a DH-ietf1024-sha256-aes128-cbc-pkcs7 encrypted session for
 *  each operation, stores secrets in the default collection, and cleans
 *  up the D-Bus connection afterwards. */
export class SecretServiceKeyring implements Keyring {
  /** True on Linux when the D-Bus session bus is reachable and a Secret
   *  Service is registered. Returns a Promise because D-Bus reachability can
   *  only be determined asynchronously. */
  static async isAvailable(): Promise<boolean> {
    if (process.platform !== "linux") return false;

    // Honor DBUS_SESSION_BUS_ADDRESS if set; otherwise dbus-next falls back
    // to the default session bus socket.
    let bus: MessageBus | undefined;
    try {
      bus = dbus.sessionBus();
      const obj = await bus.getProxyObject(SECRETS_DESTINATION, SECRETS_PATH);
      const service = obj.getInterface(SERVICE_INTERFACE);
      // A lightweight probe: ReadAlias never prompts and fails fast if the
      // service is not present or the bus is unreachable.
      await service.ReadAlias("default");
      return true;
    } catch {
      return false;
    } finally {
      bus?.disconnect();
    }
  }

  /** Resolve the default collection path, falling back to the well-known
   *  login collection if the "default" alias is not set. */
  private async resolveDefaultCollectionPath(
    service: dbus.ClientInterface,
    bus: MessageBus,
  ): Promise<string> {
    const alias = (await service.ReadAlias("default")) as string;
    if (alias && alias !== "/") return alias;

    // If no default alias is configured, the login collection is the
    // conventional fallback. Verify it exists by introspecting it.
    const loginPath = "/org/freedesktop/secrets/collection/login";
    try {
      await bus.getProxyObject(SECRETS_DESTINATION, loginPath);
      return loginPath;
    } catch {
      throw new KeyringDBusError("No default Secret Service collection");
    }
  }

  /** Open a temporary encrypted session and run `fn` inside it. */
  private async withSession<T>(fn: (ctx: SessionContext) => Promise<T>): Promise<T> {
    let bus: MessageBus | undefined;
    try {
      bus = dbus.sessionBus();
      const serviceObj = await bus.getProxyObject(SECRETS_DESTINATION, SECRETS_PATH);
      const service = serviceObj.getInterface(SERVICE_INTERFACE);

      const dh = getDiffieHellman(DH_GROUP);
      dh.generateKeys();
      const clientPublic = dh.getPublicKey();

      const [serverPublicVar, sessionPath] = await service.OpenSession(
        DH_ALGORITHM,
        new Variant("ay", clientPublic),
      );
      const serverPublic = serverPublicVar.value as Buffer;
      const shared = dh.computeSecret(serverPublic);
      const aesKey = deriveAesKey(shared);

      const defaultCollectionPath = await this.resolveDefaultCollectionPath(service, bus);

      return await fn({ bus, sessionPath, aesKey, defaultCollectionPath });
    } catch (e) {
      throw wrapDbusError(e);
    } finally {
      bus?.disconnect();
    }
  }

  async getSecret(key: SecretKey): Promise<string | null> {
    return this.withSession(async (ctx) => {
      const collectionObj = await ctx.bus.getProxyObject(
        SECRETS_DESTINATION,
        ctx.defaultCollectionPath,
      );
      const collection = collectionObj.getInterface(COLLECTION_INTERFACE);

      const items = (await collection.SearchItems(packAttributes(key))) as string[];
      if (!items || items.length === 0) return null;

      const itemObj = await ctx.bus.getProxyObject(SECRETS_DESTINATION, items[0]);
      const item = itemObj.getInterface(ITEM_INTERFACE);

      const secretStruct = await item.GetSecret(ctx.sessionPath);
      return decryptSecret(secretStruct, ctx.aesKey);
    });
  }

  async setSecret(key: SecretKey, secret: string): Promise<void> {
    await this.withSession(async (ctx) => {
      const collectionObj = await ctx.bus.getProxyObject(
        SECRETS_DESTINATION,
        ctx.defaultCollectionPath,
      );
      const collection = collectionObj.getInterface(COLLECTION_INTERFACE);

      const [itemPath] = (await collection.CreateItem(
        buildItemProperties(key),
        buildSecret(ctx.sessionPath, ctx.aesKey, secret),
        true,
      )) as [string, string];

      // A non-empty prompt path means the collection is locked and needs a
      // prompt to proceed. Treat that as a locked-keyring error.
      if (!itemPath || itemPath === "/") {
        throw new KeyringLockedError(
          "secret-service",
          "Secret Service collection is locked during setSecret",
        );
      }
    });
  }

  async deleteSecret(key: SecretKey): Promise<boolean> {
    return this.withSession(async (ctx) => {
      const collectionObj = await ctx.bus.getProxyObject(
        SECRETS_DESTINATION,
        ctx.defaultCollectionPath,
      );
      const collection = collectionObj.getInterface(COLLECTION_INTERFACE);

      const before = (await collection.SearchItems(packAttributes(key))) as string[];
      if (!before || before.length === 0) return false;

      for (const itemPath of before) {
        const itemObj = await ctx.bus.getProxyObject(SECRETS_DESTINATION, itemPath);
        const item = itemObj.getInterface(ITEM_INTERFACE);
        await item.Delete();
      }

      const after = (await collection.SearchItems(packAttributes(key))) as string[];
      return (after?.length ?? 0) === 0;
    });
  }

  async listSecrets(): Promise<StoredSecret[]> {
    const out: StoredSecret[] = [];
    for (const key of KNOWN_SECRET_KEYS) {
      const secret = await this.getSecret(key);
      if (secret !== null) {
        out.push({ key, secret });
      }
    }
    return out;
  }
}
