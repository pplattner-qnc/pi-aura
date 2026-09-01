import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_fn } from 'node:path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_fn(__filename);
const require = __createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../packages/shared/src/keyring/file-keyring.ts
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
function packKey(key) {
  return `${key.service}/${key.name}`;
}
var NAMESPACE, DEFAULT_STORE_PATH, KNOWN_SECRET_KEYS, FileKeyring;
var init_file_keyring = __esm({
  "../packages/shared/src/keyring/file-keyring.ts"() {
    "use strict";
    NAMESPACE = "aura-skills";
    DEFAULT_STORE_PATH = join(homedir(), ".cache", NAMESPACE, "store.json");
    KNOWN_SECRET_KEYS = [
      { service: "aura", name: "pat" },
      { service: "atlassian", name: "email" },
      { service: "atlassian", name: "api_token" },
      { service: "atlassian", name: "bitbucket_token" }
    ];
    FileKeyring = class {
      storePath;
      /** Test hook: override the store path. The public `Keyring` interface takes
       *  no constructor args, so this is an internal seam. */
      constructor(storePath) {
        this.storePath = storePath ?? DEFAULT_STORE_PATH;
      }
      /** Always true — the file backend is the universal fallback. */
      static isAvailable() {
        return true;
      }
      async setSecret(key, secret) {
        const data = await this.load();
        data[packKey(key)] = secret;
        await this.save(data);
      }
      async getSecret(key) {
        const data = await this.load();
        const value = data[packKey(key)];
        return typeof value === "string" ? value : null;
      }
      async deleteSecret(key) {
        const data = await this.load();
        const packed = packKey(key);
        if (!(packed in data)) return false;
        delete data[packed];
        await this.save(data);
        return true;
      }
      async listSecrets() {
        const data = await this.load();
        const out = [];
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
      async load() {
        try {
          const raw = await readFile(this.storePath, "utf8");
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
        }
        return {};
      }
      /** Persist the JSON store, creating the parent directory and tightening
       *  permissions best-effort. */
      async save(data) {
        await mkdir(dirname(this.storePath), { recursive: true });
        await writeFile(
          this.storePath,
          JSON.stringify(data, null, 2) + "\n",
          { mode: 384, encoding: "utf8" }
        );
        try {
          await chmod(this.storePath, 384);
        } catch {
        }
      }
    };
  }
});

// ../packages/shared/src/keyring/internal.ts
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
function run(file, args, opts = {}) {
  return new Promise((resolve2, reject) => {
    const child = spawn(file, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => stdout += d.toString("utf8"));
    child.stderr.on("data", (d) => stderr += d.toString("utf8"));
    child.on("error", (e) => {
      if (e.code === "ENOENT" || e.code === "EACCES") {
        reject(new ToolMissingError(file, e.message ?? e.code ?? "spawn error"));
      } else {
        reject(e);
      }
    });
    child.on("close", (exitCode) => {
      const code = exitCode ?? 1;
      if (opts.ignoreExitCodes?.has(code)) {
        resolve2({ stdout, stderr, exitCode: code });
        return;
      }
      if (code === 0) {
        resolve2({ stdout, stderr, exitCode: 0 });
        return;
      }
      reject(new ExecError(file, args, code, stderr, stdout));
    });
    if (opts.input !== void 0) {
      child.stdin.on("error", () => {
      });
      child.stdin.end(opts.input, "utf8");
    } else {
      child.stdin.end();
    }
  });
}
function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
var ToolMissingError, ExecError;
var init_internal = __esm({
  "../packages/shared/src/keyring/internal.ts"() {
    "use strict";
    ToolMissingError = class extends Error {
      code = "TOOL_MISSING";
      tool;
      constructor(tool, message) {
        super(message);
        this.name = "ToolMissingError";
        this.tool = tool;
      }
    };
    ExecError = class extends Error {
      exitCode;
      cmd;
      stderr;
      stdout;
      constructor(file, args, exitCode, stderr, stdout) {
        super(`${file} ${args.join(" ")} exited ${exitCode}: ${stderr.slice(0, 500)}`);
        this.name = "ExecError";
        this.exitCode = exitCode;
        this.cmd = `${file} ${args.join(" ")}`;
        this.stderr = stderr;
        this.stdout = stdout;
      }
    };
  }
});

// ../packages/shared/src/keyring/macos-keyring.ts
function packKey2(key) {
  return { service: NAMESPACE2, account: `${key.service}/${key.name}` };
}
function unpackKey(service, account) {
  if (service !== NAMESPACE2) return void 0;
  const known = KNOWN_SECRET_KEYS2.find((k) => `${k.service}/${k.name}` === account);
  return known;
}
function indicatesLockedKeychain(stderr) {
  const lower = stderr.toLowerCase();
  return lower.includes("user interaction is not allowed") || lower.includes("the user name or passphrase you entered is not correct") || lower.includes("a password is required") || lower.includes("keychain is locked");
}
var NAMESPACE2, SECURITY_BINARY, KNOWN_SECRET_KEYS2, MacosKeyring;
var init_macos_keyring = __esm({
  "../packages/shared/src/keyring/macos-keyring.ts"() {
    "use strict";
    init_keyring();
    init_internal();
    NAMESPACE2 = "aura-skills";
    SECURITY_BINARY = "/usr/bin/security";
    KNOWN_SECRET_KEYS2 = [
      { service: "aura", name: "pat" },
      { service: "atlassian", name: "email" },
      { service: "atlassian", name: "api_token" },
      { service: "atlassian", name: "bitbucket_token" }
    ];
    MacosKeyring = class {
      /** True on macOS when `/usr/bin/security` exists. */
      static isAvailable() {
        return process.platform === "darwin" && isFile(SECURITY_BINARY);
      }
      async getSecret(key) {
        const { service, account } = packKey2(key);
        try {
          const res = await run(
            SECURITY_BINARY,
            ["find-generic-password", "-s", service, "-a", account, "-w"],
            { ignoreExitCodes: /* @__PURE__ */ new Set([44]) }
          );
          if (res.exitCode === 44) return null;
          return res.stdout.replace(/\r?\n$/, "");
        } catch (e) {
          throw this.mapError("getSecret", e);
        }
      }
      async setSecret(key, secret) {
        const { service, account } = packKey2(key);
        try {
          await run(
            SECURITY_BINARY,
            ["delete-generic-password", "-s", service, "-a", account],
            { ignoreExitCodes: /* @__PURE__ */ new Set([44, 128]) }
          );
          await run(SECURITY_BINARY, [
            "add-generic-password",
            "-s",
            service,
            "-a",
            account,
            "-w",
            secret
          ]);
        } catch (e) {
          throw this.mapError("setSecret", e);
        }
      }
      async deleteSecret(key) {
        const { service, account } = packKey2(key);
        try {
          const res = await run(
            SECURITY_BINARY,
            ["delete-generic-password", "-s", service, "-a", account],
            { ignoreExitCodes: /* @__PURE__ */ new Set([44, 128]) }
          );
          return res.exitCode === 0;
        } catch (e) {
          throw this.mapError("deleteSecret", e);
        }
      }
      async listSecrets() {
        try {
          const res = await run(SECURITY_BINARY, ["dump-keychain"], {
            ignoreExitCodes: /* @__PURE__ */ new Set([0])
          });
          const out = [];
          const blocks = res.stdout.split(/(?=^keychain: ")/m);
          for (const block of blocks) {
            const svce = block.match(/"svce"<blob>="([^"]*)"/);
            const acct = block.match(/"acct"<blob>="([^"]*)"/);
            if (!svce || !acct) continue;
            const key = unpackKey(svce[1], acct[1]);
            if (!key) continue;
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
      mapError(op, e) {
        if (e instanceof ExecError && indicatesLockedKeychain(e.stderr)) {
          return new KeyringLockedError("macos-keychain", `macOS keychain is locked during ${op}: ${e.stderr.slice(0, 200)}`);
        }
        return e;
      }
    };
  }
});

// ../packages/shared/src/keyring/secret-service-keyring.ts
var secret_service_keyring_exports = {};
__export(secret_service_keyring_exports, {
  SecretServiceKeyring: () => SecretServiceKeyring
});
import dbus, { Variant } from "dbus-next";
import {
  getDiffieHellman,
  hkdfSync,
  randomBytes,
  createCipheriv,
  createDecipheriv
} from "node:crypto";
function packAttributes(key) {
  return {
    "xdg:schema": NAMESPACE3,
    service: key.service,
    name: key.name
  };
}
function padDhSecret(secret, length = 128) {
  if (secret.length >= length) return secret;
  return Buffer.concat([Buffer.alloc(length - secret.length, 0), secret]);
}
function deriveAesKey(sharedSecret) {
  const key = hkdfSync(
    "sha256",
    padDhSecret(sharedSecret),
    HKDF_SALT,
    HKDF_INFO,
    AES_KEY_BYTES
  );
  return Buffer.from(key);
}
function buildItemProperties(key) {
  return {
    "org.freedesktop.Secret.Item.Attributes": new Variant(
      "a{ss}",
      packAttributes(key)
    ),
    "org.freedesktop.Secret.Item.Label": new Variant(
      "s",
      `${key.service}/${key.name}`
    )
  };
}
function buildSecret(sessionPath, aesKey, plaintext) {
  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv("aes-128-cbc", aesKey, iv);
  const value = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [sessionPath, iv, value, "text/plain"];
}
function decryptSecret(secretStruct, aesKey) {
  const [sessionPath, iv, value, contentType] = secretStruct;
  const decipher = createDecipheriv("aes-128-cbc", aesKey, iv);
  return Buffer.concat([decipher.update(value), decipher.final()]).toString("utf8");
}
function isLockedDbusError(e) {
  if (e instanceof dbus.DBusError) {
    const type2 = e.type.toLowerCase();
    const text = e.text.toLowerCase();
    return type2.includes("islocked") || type2.includes("locked") || text.includes("locked") || text.includes("not unlocked") || text.includes("user interaction");
  }
  if (e instanceof Error) {
    const text = e.message.toLowerCase();
    return text.includes("locked") || text.includes("not unlocked");
  }
  return false;
}
function wrapDbusError(e) {
  if (e instanceof KeyringLockedError || e instanceof KeyringDBusError) {
    return e;
  }
  if (isLockedDbusError(e)) {
    const message2 = e instanceof Error ? e.message : "Secret Service is locked";
    return new KeyringLockedError("secret-service", message2);
  }
  const message = e instanceof Error ? e.message : "D-Bus keyring error";
  return new KeyringDBusError(message);
}
var NAMESPACE3, DH_ALGORITHM, DH_GROUP, AES_KEY_BYTES, AES_IV_BYTES, HKDF_SALT, HKDF_INFO, SECRETS_DESTINATION, SECRETS_PATH, SERVICE_INTERFACE, COLLECTION_INTERFACE, ITEM_INTERFACE, KNOWN_SECRET_KEYS3, SecretServiceKeyring;
var init_secret_service_keyring = __esm({
  "../packages/shared/src/keyring/secret-service-keyring.ts"() {
    "use strict";
    init_keyring();
    NAMESPACE3 = "aura-skills";
    DH_ALGORITHM = "dh-ietf1024-sha256-aes128-cbc-pkcs7";
    DH_GROUP = "modp2";
    AES_KEY_BYTES = 16;
    AES_IV_BYTES = 16;
    HKDF_SALT = Buffer.alloc(32, 0);
    HKDF_INFO = Buffer.alloc(0);
    SECRETS_DESTINATION = "org.freedesktop.secrets";
    SECRETS_PATH = "/org/freedesktop/secrets";
    SERVICE_INTERFACE = "org.freedesktop.Secret.Service";
    COLLECTION_INTERFACE = "org.freedesktop.Secret.Collection";
    ITEM_INTERFACE = "org.freedesktop.Secret.Item";
    KNOWN_SECRET_KEYS3 = [
      { service: "aura", name: "pat" },
      { service: "atlassian", name: "email" },
      { service: "atlassian", name: "api_token" },
      { service: "atlassian", name: "bitbucket_token" }
    ];
    SecretServiceKeyring = class {
      /** True on Linux when the D-Bus session bus is reachable and a Secret
       *  Service is registered. Returns a Promise because D-Bus reachability can
       *  only be determined asynchronously. */
      static async isAvailable() {
        if (process.platform !== "linux") return false;
        let bus;
        try {
          bus = dbus.sessionBus();
          bus.on("error", () => {
          });
          const available = await Promise.race([
            bus.getProxyObject(SECRETS_DESTINATION, SECRETS_PATH).then((obj) => obj.getInterface(SERVICE_INTERFACE)).then((service) => service.ReadAlias("default")).then(() => true),
            new Promise((resolve2) => setTimeout(() => resolve2(false), 3e3))
          ]);
          return available;
        } catch {
          return false;
        } finally {
          bus?.disconnect();
        }
      }
      /** Resolve the default collection path.
       *
       *  1. Use the alias "default" if it is set.
       *  2. Fall back to the well-known login collection.
       *  3. If neither exists, create a new collection aliased as "default".
       *
       *  Collection creation may return a prompt object path on a locked or
       *  prompting keyring; in that case we surface a domain error. */
      async resolveDefaultCollectionPath(service, bus) {
        const alias = await service.ReadAlias("default");
        if (alias && alias !== "/") return alias;
        const loginPath = "/org/freedesktop/secrets/collection/login";
        try {
          await bus.getProxyObject(SECRETS_DESTINATION, loginPath);
          return loginPath;
        } catch {
        }
        const [collectionPath, promptPath] = await service.CreateCollection(
          {
            "org.freedesktop.Secret.Collection.Label": new Variant("s", "Default")
          },
          "default"
        );
        if (promptPath && promptPath !== "/") {
          throw new KeyringLockedError(
            "secret-service",
            "Secret Service requires a prompt to create the default collection"
          );
        }
        if (!collectionPath || collectionPath === "/") {
          throw new KeyringDBusError("Could not create default Secret Service collection");
        }
        return collectionPath;
      }
      /** Open a temporary encrypted session and run `fn` inside it. */
      async withSession(fn) {
        let bus;
        try {
          bus = dbus.sessionBus();
          bus.on("error", () => {
          });
          const serviceObj = await bus.getProxyObject(SECRETS_DESTINATION, SECRETS_PATH);
          const service = serviceObj.getInterface(SERVICE_INTERFACE);
          const dh = getDiffieHellman(DH_GROUP);
          dh.generateKeys();
          const clientPublic = dh.getPublicKey();
          const [serverPublicVar, sessionPath] = await service.OpenSession(
            DH_ALGORITHM,
            new Variant("ay", clientPublic)
          );
          const serverPublic = serverPublicVar.value;
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
      async getSecret(key) {
        return this.withSession(async (ctx) => {
          const collectionObj = await ctx.bus.getProxyObject(
            SECRETS_DESTINATION,
            ctx.defaultCollectionPath
          );
          const collection = collectionObj.getInterface(COLLECTION_INTERFACE);
          const items = await collection.SearchItems(packAttributes(key));
          if (!items || items.length === 0) return null;
          const itemObj = await ctx.bus.getProxyObject(SECRETS_DESTINATION, items[0]);
          const item = itemObj.getInterface(ITEM_INTERFACE);
          const secretStruct = await item.GetSecret(ctx.sessionPath);
          return decryptSecret(secretStruct, ctx.aesKey);
        });
      }
      async setSecret(key, secret) {
        await this.withSession(async (ctx) => {
          const collectionObj = await ctx.bus.getProxyObject(
            SECRETS_DESTINATION,
            ctx.defaultCollectionPath
          );
          const collection = collectionObj.getInterface(COLLECTION_INTERFACE);
          const [itemPath] = await collection.CreateItem(
            buildItemProperties(key),
            buildSecret(ctx.sessionPath, ctx.aesKey, secret),
            true
          );
          if (!itemPath || itemPath === "/") {
            throw new KeyringLockedError(
              "secret-service",
              "Secret Service collection is locked during setSecret"
            );
          }
        });
      }
      async deleteSecret(key) {
        return this.withSession(async (ctx) => {
          const collectionObj = await ctx.bus.getProxyObject(
            SECRETS_DESTINATION,
            ctx.defaultCollectionPath
          );
          const collection = collectionObj.getInterface(COLLECTION_INTERFACE);
          const before = await collection.SearchItems(packAttributes(key));
          if (!before || before.length === 0) return false;
          for (const itemPath of before) {
            const itemObj = await ctx.bus.getProxyObject(SECRETS_DESTINATION, itemPath);
            const item = itemObj.getInterface(ITEM_INTERFACE);
            await item.Delete();
          }
          const after = await collection.SearchItems(packAttributes(key));
          return (after?.length ?? 0) === 0;
        });
      }
      async listSecrets() {
        const out = [];
        for (const key of KNOWN_SECRET_KEYS3) {
          const secret = await this.getSecret(key);
          if (secret !== null) {
            out.push({ key, secret });
          }
        }
        return out;
      }
    };
  }
});

// ../packages/shared/src/keyring/keyring.ts
async function createKeyring() {
  switch (process.platform) {
    case "darwin": {
      if (await MacosKeyring.isAvailable()) {
        return new MacosKeyring();
      }
      if (await FileKeyring.isAvailable()) {
        return new FileKeyring();
      }
      throw new KeyringUnavailableError(["MacosKeyring", "FileKeyring"]);
    }
    case "linux": {
      const { SecretServiceKeyring: SecretServiceKeyring2 } = await Promise.resolve().then(() => (init_secret_service_keyring(), secret_service_keyring_exports));
      if (await SecretServiceKeyring2.isAvailable()) {
        return new SecretServiceKeyring2();
      }
      if (await FileKeyring.isAvailable()) {
        return new FileKeyring();
      }
      throw new KeyringUnavailableError([
        "SecretServiceKeyring",
        "FileKeyring"
      ]);
    }
    default: {
      if (await FileKeyring.isAvailable()) {
        return new FileKeyring();
      }
      throw new KeyringUnavailableError(["FileKeyring"]);
    }
  }
}
var KeyringUnavailableError, KeyringLockedError, KeyringDBusError;
var init_keyring = __esm({
  "../packages/shared/src/keyring/keyring.ts"() {
    "use strict";
    init_file_keyring();
    init_macos_keyring();
    KeyringUnavailableError = class extends Error {
      code = "KEYRING_UNAVAILABLE";
      tried;
      constructor(tried, message) {
        super(message ?? `No keyring backend available. Tried: ${tried.join(", ")}`);
        this.name = "KeyringUnavailableError";
        this.tried = tried;
      }
    };
    KeyringLockedError = class extends Error {
      code = "KEYRING_LOCKED";
      backendId;
      constructor(backendId, message) {
        super(message);
        this.name = "KeyringLockedError";
        this.backendId = backendId;
      }
    };
    KeyringDBusError = class extends Error {
      code = "KEYRING_DBUS_ERROR";
      constructor(message) {
        super(message ?? "D-Bus keyring error");
        this.name = "KeyringDBusError";
      }
    };
  }
});

// src/aura.ts
import { mkdirSync, writeFileSync, readFileSync as readFileSync3, rmSync, existsSync as existsSync3, readdirSync, statSync as statSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join3, resolve } from "node:path";
import { randomBytes as randomBytes2 } from "node:crypto";

// ../packages/shared/src/generated/core/serverSentEvents.gen.ts
function createSseClient({
  onRequest,
  onSseError,
  onSseEvent,
  responseTransformer,
  responseValidator,
  sseDefaultRetryDelay,
  sseMaxRetryAttempts,
  sseMaxRetryDelay,
  sseSleepFn,
  url,
  ...options
}) {
  let lastEventId;
  const sleep = sseSleepFn ?? ((ms) => new Promise((resolve2) => setTimeout(resolve2, ms)));
  const createStream = async function* () {
    let retryDelay = sseDefaultRetryDelay ?? 3e3;
    let attempt = 0;
    const signal = options.signal ?? new AbortController().signal;
    while (true) {
      if (signal.aborted) break;
      attempt++;
      const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers);
      if (lastEventId !== void 0) {
        headers.set("Last-Event-ID", lastEventId);
      }
      try {
        const requestInit = {
          redirect: "follow",
          ...options,
          body: options.serializedBody,
          headers,
          signal
        };
        let request = new Request(url, requestInit);
        if (onRequest) {
          request = await onRequest(url, requestInit);
        }
        const _fetch = options.fetch ?? globalThis.fetch;
        const response = await _fetch(request);
        if (!response.ok) throw new Error(`SSE failed: ${response.status} ${response.statusText}`);
        if (!response.body) throw new Error("No body in SSE response");
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        const abortHandler = () => {
          try {
            reader.cancel();
          } catch {
          }
        };
        signal.addEventListener("abort", abortHandler);
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;
            buffer = buffer.replace(/\r\n?/g, "\n");
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const lines = chunk.split("\n");
              const dataLines = [];
              let eventName;
              for (const line of lines) {
                if (line.startsWith("data:")) {
                  dataLines.push(line.replace(/^data:\s*/, ""));
                } else if (line.startsWith("event:")) {
                  eventName = line.replace(/^event:\s*/, "");
                } else if (line.startsWith("id:")) {
                  lastEventId = line.replace(/^id:\s*/, "");
                } else if (line.startsWith("retry:")) {
                  const parsed = Number.parseInt(line.replace(/^retry:\s*/, ""), 10);
                  if (!Number.isNaN(parsed)) {
                    retryDelay = parsed;
                  }
                }
              }
              let data;
              let parsedJson = false;
              if (dataLines.length) {
                const rawData = dataLines.join("\n");
                try {
                  data = JSON.parse(rawData);
                  parsedJson = true;
                } catch {
                  data = rawData;
                }
              }
              if (parsedJson) {
                if (responseValidator) {
                  await responseValidator(data);
                }
                if (responseTransformer) {
                  data = await responseTransformer(data);
                }
              }
              onSseEvent?.({
                data,
                event: eventName,
                id: lastEventId,
                retry: retryDelay
              });
              if (dataLines.length) {
                yield data;
              }
            }
          }
        } finally {
          signal.removeEventListener("abort", abortHandler);
          reader.releaseLock();
        }
        break;
      } catch (error) {
        onSseError?.(error);
        if (sseMaxRetryAttempts !== void 0 && attempt >= sseMaxRetryAttempts) {
          break;
        }
        const backoff = Math.min(retryDelay * 2 ** (attempt - 1), sseMaxRetryDelay ?? 3e4);
        await sleep(backoff);
      }
    }
  };
  const stream = createStream();
  return { stream };
}

// ../packages/shared/src/generated/core/pathSerializer.gen.ts
var separatorArrayExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
var separatorArrayNoExplode = (style) => {
  switch (style) {
    case "form":
      return ",";
    case "pipeDelimited":
      return "|";
    case "spaceDelimited":
      return "%20";
    default:
      return ",";
  }
};
var separatorObjectExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
var serializeArrayParam = ({
  allowReserved,
  explode,
  name,
  style,
  value
}) => {
  if (!explode) {
    const joinedValues2 = (allowReserved ? value : value.map((v) => encodeURIComponent(v))).join(separatorArrayNoExplode(style));
    switch (style) {
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      case "simple":
        return joinedValues2;
      default:
        return `${name}=${joinedValues2}`;
    }
  }
  const separator = separatorArrayExplode(style);
  const joinedValues = value.map((v) => {
    if (style === "label" || style === "simple") {
      return allowReserved ? v : encodeURIComponent(v);
    }
    return serializePrimitiveParam({
      allowReserved,
      name,
      value: v
    });
  }).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};
var serializePrimitiveParam = ({
  allowReserved,
  name,
  value
}) => {
  if (value === void 0 || value === null) {
    return "";
  }
  if (typeof value === "object") {
    throw new Error(
      "Deeply-nested arrays/objects aren\u2019t supported. Provide your own `querySerializer()` to handle these."
    );
  }
  return `${name}=${allowReserved ? value : encodeURIComponent(value)}`;
};
var serializeObjectParam = ({
  allowReserved,
  explode,
  name,
  style,
  value,
  valueOnly
}) => {
  if (value instanceof Date) {
    return valueOnly ? value.toISOString() : `${name}=${value.toISOString()}`;
  }
  if (style !== "deepObject" && !explode) {
    let values = [];
    Object.entries(value).forEach(([key, v]) => {
      values = [...values, key, allowReserved ? v : encodeURIComponent(v)];
    });
    const joinedValues2 = values.join(",");
    switch (style) {
      case "form":
        return `${name}=${joinedValues2}`;
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      default:
        return joinedValues2;
    }
  }
  const separator = separatorObjectExplode(style);
  const joinedValues = Object.entries(value).map(
    ([key, v]) => serializePrimitiveParam({
      allowReserved,
      name: style === "deepObject" ? `${name}[${key}]` : key,
      value: v
    })
  ).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};

// ../packages/shared/src/generated/core/utils.gen.ts
var PATH_PARAM_RE = /\{[^{}]+\}/g;
var defaultPathSerializer = ({ path, url: _url }) => {
  let url = _url;
  const matches = _url.match(PATH_PARAM_RE);
  if (matches) {
    for (const match of matches) {
      let explode = false;
      let name = match.substring(1, match.length - 1);
      let style = "simple";
      if (name.endsWith("*")) {
        explode = true;
        name = name.substring(0, name.length - 1);
      }
      if (name.startsWith(".")) {
        name = name.substring(1);
        style = "label";
      } else if (name.startsWith(";")) {
        name = name.substring(1);
        style = "matrix";
      }
      const value = path[name];
      if (value === void 0 || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        url = url.replace(match, serializeArrayParam({ explode, name, style, value }));
        continue;
      }
      if (typeof value === "object") {
        url = url.replace(
          match,
          serializeObjectParam({
            explode,
            name,
            style,
            value,
            valueOnly: true
          })
        );
        continue;
      }
      if (style === "matrix") {
        url = url.replace(
          match,
          `;${serializePrimitiveParam({
            name,
            value
          })}`
        );
        continue;
      }
      const replaceValue = encodeURIComponent(
        style === "label" ? `.${value}` : value
      );
      url = url.replace(match, replaceValue);
    }
  }
  return url;
};
var getUrl = ({
  baseUrl,
  path,
  query,
  querySerializer,
  url: _url
}) => {
  const pathUrl = _url.startsWith("/") ? _url : `/${_url}`;
  let url = (baseUrl ?? "") + pathUrl;
  if (path) {
    url = defaultPathSerializer({ path, url });
  }
  let search = query ? querySerializer(query) : "";
  if (search.startsWith("?")) {
    search = search.substring(1);
  }
  if (search) {
    url += `?${search}`;
  }
  return url;
};
function getValidRequestBody(options) {
  const hasBody = options.body !== void 0;
  const isSerializedBody = hasBody && options.bodySerializer;
  if (isSerializedBody) {
    if ("serializedBody" in options) {
      const hasSerializedBody = options.serializedBody !== void 0 && options.serializedBody !== "";
      return hasSerializedBody ? options.serializedBody : null;
    }
    return options.body !== "" ? options.body : null;
  }
  if (hasBody) {
    return options.body;
  }
  return void 0;
}

// ../packages/shared/src/generated/core/auth.gen.ts
var getAuthToken = async (auth, callback) => {
  const token = typeof callback === "function" ? await callback(auth) : callback;
  if (!token) {
    return;
  }
  if (auth.scheme === "bearer") {
    return `Bearer ${token}`;
  }
  if (auth.scheme === "basic") {
    return `Basic ${btoa(token)}`;
  }
  return token;
};

// ../packages/shared/src/generated/core/bodySerializer.gen.ts
var jsonBodySerializer = {
  bodySerializer: (body) => JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value)
};

// ../packages/shared/src/generated/client/utils.gen.ts
var createQuerySerializer = ({
  parameters = {},
  ...args
} = {}) => {
  const querySerializer = (queryParams) => {
    const search = [];
    if (queryParams && typeof queryParams === "object") {
      for (const name in queryParams) {
        const value = queryParams[name];
        if (value === void 0 || value === null) {
          continue;
        }
        const options = parameters[name] || args;
        if (Array.isArray(value)) {
          const serializedArray = serializeArrayParam({
            allowReserved: options.allowReserved,
            explode: true,
            name,
            style: "form",
            value,
            ...options.array
          });
          if (serializedArray) search.push(serializedArray);
        } else if (typeof value === "object") {
          const serializedObject = serializeObjectParam({
            allowReserved: options.allowReserved,
            explode: true,
            name,
            style: "deepObject",
            value,
            ...options.object
          });
          if (serializedObject) search.push(serializedObject);
        } else {
          const serializedPrimitive = serializePrimitiveParam({
            allowReserved: options.allowReserved,
            name,
            value
          });
          if (serializedPrimitive) search.push(serializedPrimitive);
        }
      }
    }
    return search.join("&");
  };
  return querySerializer;
};
var getParseAs = (contentType) => {
  if (!contentType) {
    return "stream";
  }
  const cleanContent = contentType.split(";")[0]?.trim();
  if (!cleanContent) {
    return;
  }
  if (cleanContent.startsWith("application/json") || cleanContent.endsWith("+json")) {
    return "json";
  }
  if (cleanContent === "multipart/form-data") {
    return "formData";
  }
  if (["application/", "audio/", "image/", "video/"].some((type2) => cleanContent.startsWith(type2))) {
    return "blob";
  }
  if (cleanContent.startsWith("text/")) {
    return "text";
  }
  return;
};
var checkForExistence = (options, name) => {
  if (!name) {
    return false;
  }
  if (options.headers.has(name) || options.query?.[name] || options.headers.get("Cookie")?.includes(`${name}=`)) {
    return true;
  }
  return false;
};
async function setAuthParams(options) {
  for (const auth of options.security ?? []) {
    if (checkForExistence(options, auth.name)) {
      continue;
    }
    const token = await getAuthToken(auth, options.auth);
    if (!token) {
      continue;
    }
    const name = auth.name ?? "Authorization";
    switch (auth.in) {
      case "query":
        if (!options.query) {
          options.query = {};
        }
        options.query[name] = token;
        break;
      case "cookie":
        options.headers.append("Cookie", `${name}=${token}`);
        break;
      case "header":
      default:
        options.headers.set(name, token);
        break;
    }
  }
}
var buildUrl = (options) => getUrl({
  baseUrl: options.baseUrl,
  path: options.path,
  query: options.query,
  querySerializer: typeof options.querySerializer === "function" ? options.querySerializer : createQuerySerializer(options.querySerializer),
  url: options.url
});
var mergeConfigs = (a, b) => {
  const config = { ...a, ...b };
  if (config.baseUrl?.endsWith("/")) {
    config.baseUrl = config.baseUrl.substring(0, config.baseUrl.length - 1);
  }
  config.headers = mergeHeaders(a.headers, b.headers);
  return config;
};
var headersEntries = (headers) => {
  const entries = [];
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries;
};
var mergeHeaders = (...headers) => {
  const mergedHeaders = new Headers();
  for (const header of headers) {
    if (!header) {
      continue;
    }
    const iterator = header instanceof Headers ? headersEntries(header) : Object.entries(header);
    for (const [key, value] of iterator) {
      if (value === null) {
        mergedHeaders.delete(key);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          mergedHeaders.append(key, v);
        }
      } else if (value !== void 0) {
        mergedHeaders.set(
          key,
          typeof value === "object" ? JSON.stringify(value) : value
        );
      }
    }
  }
  return mergedHeaders;
};
var Interceptors = class {
  fns = [];
  clear() {
    this.fns = [];
  }
  eject(id) {
    const index = this.getInterceptorIndex(id);
    if (this.fns[index]) {
      this.fns[index] = null;
    }
  }
  exists(id) {
    const index = this.getInterceptorIndex(id);
    return Boolean(this.fns[index]);
  }
  getInterceptorIndex(id) {
    if (typeof id === "number") {
      return this.fns[id] ? id : -1;
    }
    return this.fns.indexOf(id);
  }
  update(id, fn) {
    const index = this.getInterceptorIndex(id);
    if (this.fns[index]) {
      this.fns[index] = fn;
      return id;
    }
    return false;
  }
  use(fn) {
    this.fns.push(fn);
    return this.fns.length - 1;
  }
};
var createInterceptors = () => ({
  error: new Interceptors(),
  request: new Interceptors(),
  response: new Interceptors()
});
var defaultQuerySerializer = createQuerySerializer({
  allowReserved: false,
  array: {
    explode: true,
    style: "form"
  },
  object: {
    explode: true,
    style: "deepObject"
  }
});
var defaultHeaders = {
  "Content-Type": "application/json"
};
var createConfig = (override = {}) => ({
  ...jsonBodySerializer,
  headers: defaultHeaders,
  parseAs: "auto",
  querySerializer: defaultQuerySerializer,
  ...override
});

// ../packages/shared/src/generated/client/client.gen.ts
var createClient = (config = {}) => {
  let _config = mergeConfigs(createConfig(), config);
  const getConfig = () => ({ ..._config });
  const setConfig = (config2) => {
    _config = mergeConfigs(_config, config2);
    return getConfig();
  };
  const interceptors = createInterceptors();
  const beforeRequest = async (options) => {
    const opts = {
      ..._config,
      ...options,
      fetch: options.fetch ?? _config.fetch ?? globalThis.fetch,
      headers: mergeHeaders(_config.headers, options.headers),
      serializedBody: void 0
    };
    if (opts.security) {
      await setAuthParams(opts);
    }
    if (opts.requestValidator) {
      await opts.requestValidator(opts);
    }
    if (opts.body !== void 0 && opts.bodySerializer) {
      opts.serializedBody = opts.bodySerializer(opts.body);
    }
    if (opts.body === void 0 || opts.serializedBody === "") {
      opts.headers.delete("Content-Type");
    }
    const resolvedOpts = opts;
    const url = buildUrl(resolvedOpts);
    return { opts: resolvedOpts, url };
  };
  const request = async (options) => {
    const throwOnError = options.throwOnError ?? _config.throwOnError;
    const responseStyle = options.responseStyle ?? _config.responseStyle;
    let request2;
    let response;
    try {
      const { opts, url } = await beforeRequest(options);
      const requestInit = {
        redirect: "follow",
        ...opts,
        body: getValidRequestBody(opts)
      };
      request2 = new Request(url, requestInit);
      for (const fn of interceptors.request.fns) {
        if (fn) {
          request2 = await fn(request2, opts);
        }
      }
      const _fetch = opts.fetch;
      response = await _fetch(request2);
      for (const fn of interceptors.response.fns) {
        if (fn) {
          response = await fn(response, request2, opts);
        }
      }
      const result = {
        request: request2,
        response
      };
      if (response.ok) {
        const parseAs = (opts.parseAs === "auto" ? getParseAs(response.headers.get("Content-Type")) : opts.parseAs) ?? "json";
        if (response.status === 204 || response.headers.get("Content-Length") === "0") {
          let emptyData;
          switch (parseAs) {
            case "arrayBuffer":
            case "blob":
            case "text":
              emptyData = await response[parseAs]();
              break;
            case "formData":
              emptyData = new FormData();
              break;
            case "stream":
              emptyData = response.body;
              break;
            case "json":
            default:
              emptyData = {};
              break;
          }
          return opts.responseStyle === "data" ? emptyData : {
            data: emptyData,
            ...result
          };
        }
        let data;
        switch (parseAs) {
          case "arrayBuffer":
          case "blob":
          case "formData":
          case "text":
            data = await response[parseAs]();
            break;
          case "json": {
            const text = await response.text();
            data = text ? JSON.parse(text) : {};
            break;
          }
          case "stream":
            return opts.responseStyle === "data" ? response.body : {
              data: response.body,
              ...result
            };
        }
        if (parseAs === "json") {
          if (opts.responseValidator) {
            await opts.responseValidator(data);
          }
          if (opts.responseTransformer) {
            data = await opts.responseTransformer(data);
          }
        }
        return opts.responseStyle === "data" ? data : {
          data,
          ...result
        };
      }
      const textError = await response.text();
      let jsonError;
      try {
        jsonError = JSON.parse(textError);
      } catch {
      }
      throw jsonError ?? textError;
    } catch (error) {
      let finalError = error;
      for (const fn of interceptors.error.fns) {
        if (fn) {
          finalError = await fn(finalError, response, request2, options);
        }
      }
      finalError = finalError || {};
      if (throwOnError) {
        throw finalError;
      }
      return responseStyle === "data" ? void 0 : {
        error: finalError,
        request: request2,
        response
      };
    }
  };
  const makeMethodFn = (method) => (options) => request({ ...options, method });
  const makeSseFn = (method) => async (options) => {
    const { opts, url } = await beforeRequest(options);
    return createSseClient({
      ...opts,
      body: opts.body,
      method,
      onRequest: async (url2, init) => {
        let request2 = new Request(url2, init);
        for (const fn of interceptors.request.fns) {
          if (fn) {
            request2 = await fn(request2, opts);
          }
        }
        return request2;
      },
      serializedBody: getValidRequestBody(opts),
      url
    });
  };
  const _buildUrl = (options) => buildUrl({ ..._config, ...options });
  return {
    buildUrl: _buildUrl,
    connect: makeMethodFn("CONNECT"),
    delete: makeMethodFn("DELETE"),
    get: makeMethodFn("GET"),
    getConfig,
    head: makeMethodFn("HEAD"),
    interceptors,
    options: makeMethodFn("OPTIONS"),
    patch: makeMethodFn("PATCH"),
    post: makeMethodFn("POST"),
    put: makeMethodFn("PUT"),
    request,
    setConfig,
    sse: {
      connect: makeSseFn("CONNECT"),
      delete: makeSseFn("DELETE"),
      get: makeSseFn("GET"),
      head: makeSseFn("HEAD"),
      options: makeSseFn("OPTIONS"),
      patch: makeSseFn("PATCH"),
      post: makeSseFn("POST"),
      put: makeSseFn("PUT"),
      trace: makeSseFn("TRACE")
    },
    trace: makeMethodFn("TRACE")
  };
};

// ../packages/shared/src/keyring/index.ts
init_keyring();

// ../packages/shared/src/settings.ts
import { readFileSync, existsSync as existsSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
var SETTINGS_PATH = join2(homedir2(), ".pi", "agent", "settings.json");
function loadAuraClientSettings(settingsPath = SETTINGS_PATH) {
  if (!existsSync2(settingsPath)) return {};
  try {
    const raw = readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw);
    const aura = settings.aura;
    if (!aura) return {};
    return { baseUrl: aura.baseUrl };
  } catch {
    return {};
  }
}

// ../packages/shared/src/generated/core/params.gen.ts
var extraPrefixesMap = {
  $body_: "body",
  $headers_: "headers",
  $path_: "path",
  $query_: "query"
};
var extraPrefixes = Object.entries(extraPrefixesMap);

// ../packages/shared/src/generated/client.gen.ts
var client = createClient(createConfig({ baseUrl: "http://localhost:3000/api" }));

// ../packages/shared/src/generated/sdk.gen.ts
var getBlueprintFiles = (options) => (options.client ?? client).get({
  security: [{ scheme: "bearer", type: "http" }],
  url: "/mcp/blueprint/files",
  ...options
});
var mcpCreateArtifact = (options) => (options.client ?? client).post({
  security: [{ scheme: "bearer", type: "http" }],
  url: "/mcp/artifacts",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var mcpUpdateArtifact = (options) => (options.client ?? client).patch({
  security: [{ scheme: "bearer", type: "http" }],
  url: "/mcp/artifacts/{id}",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var mcpCreateUploadDocument = (options) => (options.client ?? client).post({
  security: [{ scheme: "bearer", type: "http" }],
  url: "/mcp/upload-documents",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var mcpGetUploadDocument = (options) => (options.client ?? client).get({
  security: [{ scheme: "bearer", type: "http" }],
  url: "/mcp/upload-documents/{id}",
  ...options
});
var mcpWikiSearch = (options) => (options.client ?? client).get({
  security: [{ scheme: "bearer", type: "http" }],
  url: "/mcp/wiki-search",
  ...options
});
var listTasks = (options) => (options?.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/tasks",
  ...options
});
var getMyPriorityQueue = (options) => (options?.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/tasks/my-priority",
  ...options
});
var getTaskByHumanKey = (options) => (options.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/tasks/by-key/{key}",
  ...options
});
var getMyCapacity = (options) => (options?.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/capacity/me",
  ...options
});
var createFeedback = (options) => (options.client ?? client).post({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/feedback",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var listArtifacts = (options) => (options?.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/artifacts",
  ...options
});
var getArtifact = (options) => (options.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/artifacts/{id}",
  ...options
});
var requestArtifactReview = (options) => (options.client ?? client).post({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/artifacts/{id}/review-request",
  ...options
});
var submitArtifactDecision = (options) => (options.client ?? client).post({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/artifacts/{id}/decisions",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var getArtifactApprovals = (options) => (options.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/artifacts/{id}/approvals",
  ...options
});
var startArtifactReview = (options) => (options.client ?? client).post({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/artifacts/{id}/review-start",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var reopenArtifactReview = (options) => (options.client ?? client).post({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/artifacts/{id}/review-reopen",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var getArtifactReview = (options) => (options.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/artifacts/{id}/review",
  ...options
});
var getKnowledgeTree = (options) => (options.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }],
  url: "/knowledge/spaces/{slug}/nodes",
  ...options
});
var createKnowledgeNode = (options) => (options.client ?? client).post({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }],
  url: "/knowledge/spaces/{slug}/nodes",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var getKnowledgeNodeByPath = (options) => (options.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }],
  url: "/knowledge/spaces/{slug}/nodes/by-path",
  ...options
});
var getKnowledgeNode = (options) => (options.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }],
  url: "/knowledge/nodes/{uuid}",
  ...options
});
var saveKnowledgeNodeBody = (options) => (options.client ?? client).put({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }],
  url: "/knowledge/nodes/{uuid}/body",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var getKnowledgeNodeVersion = (options) => (options.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }],
  url: "/knowledge/nodes/{uuid}/versions/{version}",
  ...options
});
var getBoardSummary = (options) => (options?.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/boards",
  ...options
});
var getBoardBriefing = (options) => (options?.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/boards/briefing",
  ...options
});
var listNotifications = (options) => (options?.client ?? client).get({
  security: [{
    in: "cookie",
    name: "aura-session",
    type: "apiKey"
  }, { scheme: "bearer", type: "http" }],
  url: "/notifications",
  ...options
});

// ../packages/shared/src/hey-api-aura-client.ts
var AuraApiError = class extends Error {
  status;
  constructor(status, message) {
    super(`Aura API error ${status}: ${message}`);
    this.name = "AuraApiError";
    this.status = status;
  }
};
async function unwrap(res, mapper) {
  if (res.error !== void 0) {
    const status = res.response?.status ?? 0;
    let msg = "unknown error";
    if (res.error && typeof res.error === "object" && "detail" in res.error) {
      msg = String(res.error.detail);
    } else if (typeof res.error === "string") {
      msg = res.error;
    } else {
      msg = JSON.stringify(res.error);
    }
    throw new AuraApiError(status, msg);
  }
  if (res.data === void 0 || res.data === null) {
    throw new AuraApiError(res.response?.status ?? 0, "empty response");
  }
  return mapper(res.data);
}
function sdkErrorMessage(error) {
  if (error && typeof error === "object" && "detail" in error) {
    return String(error.detail);
  }
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}
async function unwrapVoid(res) {
  if (res.error !== void 0) {
    const status = res.response?.status ?? 0;
    throw new AuraApiError(status, sdkErrorMessage(res.error));
  }
}
var HeyApiAuraClient = class {
  keyring;
  client;
  pat;
  constructor(opts) {
    this.keyring = opts.keyring;
    this.client = createClient({ baseUrl: opts.baseUrl });
    this.pat = opts.pat ?? null;
    this.client.interceptors.request.use(async (req) => {
      const pat = await this.ensurePat();
      req.headers.set("Authorization", `Bearer ${pat}`);
      return req;
    });
    this.client.interceptors.error.use((err) => {
      throw err;
    });
  }
  /** Lazily read the PAT from the keyring on first request, cache it. */
  async ensurePat() {
    if (this.pat !== null) return this.pat;
    const pat = await this.keyring.getSecret({ service: "aura", name: "pat" });
    if (pat === null) {
      throw new Error(
        'No Aura PAT found in the OS keyring. Run `/aura secrets discover` to store one (service: "aura", name: "pat").'
      );
    }
    this.pat = pat;
    return pat;
  }
  // -------------------------------------------------------------------------
  // Artifacts
  // -------------------------------------------------------------------------
  async getArtifact(id) {
    const res = await getArtifact({ client: this.client, path: { id } });
    return unwrap(res, mapArtifact);
  }
  async mcpCreateArtifact(input) {
    const res = await mcpCreateArtifact({
      client: this.client,
      body: {
        title: input.title,
        body: input.body,
        summary: input.summary,
        kind: input.kind
      }
    });
    return unwrap(res, mapArtifact);
  }
  async mcpUpdateArtifact(input) {
    const res = await mcpUpdateArtifact({
      client: this.client,
      path: { id: input.id },
      body: {
        mode: input.mode,
        body: input.body,
        summary: input.summary,
        target_heading: input.target_heading,
        expected_version: input.expected_version,
        confirm_full_replace: input.confirm_full_replace
      }
    });
    return unwrap(res, (d) => {
      const g = d;
      return {
        status: g.status,
        id: g.id,
        title: g.title,
        version: g.version,
        mode: g.mode,
        affected_heading: g.affected_heading
      };
    });
  }
  async listArtifacts(opts) {
    const res = await listArtifacts({ client: this.client, query: opts });
    return unwrap(res, mapArtifactList);
  }
  // -------------------------------------------------------------------------
  // Knowledge / wiki
  // -------------------------------------------------------------------------
  async getKnowledgeNode(uuid, _opts) {
    const res = await getKnowledgeNode({
      client: this.client,
      path: { uuid }
    });
    return unwrap(res, mapKnowledgeNode);
  }
  async getKnowledgeNodeByPath(spaceSlug, path, _opts) {
    const res = await getKnowledgeNodeByPath({
      client: this.client,
      path: { slug: spaceSlug },
      query: { path }
    });
    return unwrap(res, mapKnowledgeNode);
  }
  async saveKnowledgeNodeBody(input) {
    const res = await saveKnowledgeNodeBody({
      client: this.client,
      path: { uuid: input.uuid },
      body: { body: input.body, summary: input.summary }
    });
    return unwrap(res, mapKnowledgeNode);
  }
  async mcpWikiSearch(input) {
    const res = await mcpWikiSearch({
      client: this.client,
      query: { query: input.query, space_slug: input.space_slug, limit: input.limit }
    });
    return unwrap(res, (d) => {
      const g = d;
      return {
        items: g.items.map((h) => ({
          id: h.id,
          space_slug: h.space_slug,
          space_kind: h.space_kind,
          title: h.title,
          url: h.url,
          heading_path: h.heading_path,
          excerpt: h.excerpt,
          match_source: h.match_source
        }))
      };
    });
  }
  async getKnowledgeTree(spaceSlug) {
    const res = await getKnowledgeTree({
      client: this.client,
      path: { slug: spaceSlug }
    });
    return unwrap(res, (d) => {
      const g = d;
      return {
        space_id: g.space_id,
        nodes: g.nodes.map(mapKnowledgeNode)
      };
    });
  }
  async createKnowledgeNode(input) {
    const res = await createKnowledgeNode({
      client: this.client,
      path: { slug: input.space_slug },
      body: {
        kind: input.kind,
        title: input.title,
        slug: input.slug,
        parent_id: input.parent_id,
        order: input.order
      }
    });
    return unwrap(res, mapKnowledgeNode);
  }
  async getBlueprintFiles(input) {
    const res = await getBlueprintFiles({
      client: this.client,
      query: { path: input.path, version: input.version }
    });
    if (res.error !== void 0) {
      const status = res.response?.status ?? 0;
      throw new AuraApiError(status, sdkErrorMessage(res.error));
    }
    const g = res.data ?? {};
    if (g.ok === false && g.error) {
      throw new AuraApiError(0, `${g.error.code}: ${g.error.detail}`);
    }
    const files = (g.files ?? []).map((f) => ({
      path: f.path,
      filename: f.filename,
      encoding: f.encoding,
      content: f.content,
      checksum: f.checksum,
      version: f.version,
      provenance: {
        created_by_user_id: f.provenance.created_by_user_id,
        source_commit_sha: f.provenance.source_commit_sha
      }
    }));
    return {
      ok: g.ok ?? true,
      files,
      error: g.error
    };
  }
  async getKnowledgeNodeVersion(uuid, version) {
    const res = await getKnowledgeNodeVersion({
      client: this.client,
      path: { uuid, version }
    });
    return unwrap(res, (d) => {
      const g = d;
      return {
        id: g.id,
        node_id: g.node_id,
        version: g.version,
        body: g.body,
        summary: g.summary ?? null,
        created_by_user_id: g.created_by_user_id,
        created_at: g.created_at
      };
    });
  }
  // -------------------------------------------------------------------------
  // Upload documents
  // -------------------------------------------------------------------------
  async mcpCreateUploadDocument(input) {
    const res = await mcpCreateUploadDocument({
      client: this.client,
      body: {
        filename: input.filename,
        content_base64: input.content_base64,
        mime_type: input.mime_type
      }
    });
    return unwrap(res, mapUploadDocument);
  }
  async mcpGetUploadDocument(id) {
    const res = await mcpGetUploadDocument({ client: this.client, path: { id } });
    return unwrap(res, mapUploadDocument);
  }
  // -------------------------------------------------------------------------
  // Boards
  // -------------------------------------------------------------------------
  async getBoardBriefing(opts) {
    const res = await getBoardBriefing({
      client: this.client,
      query: opts
    });
    return unwrap(res, (d) => {
      const g = d;
      return {
        text: g.text,
        generated_at: g.generated_at
      };
    });
  }
  async getBoardSummary() {
    const res = await getBoardSummary({ client: this.client });
    return unwrap(res, mapBoardSummary);
  }
  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  async listNotifications(opts) {
    const res = await listNotifications({ client: this.client, query: opts });
    return unwrap(res, mapNotificationList);
  }
  // -------------------------------------------------------------------------
  // My board
  // -------------------------------------------------------------------------
  async getMyPriorityQueue() {
    const res = await getMyPriorityQueue({ client: this.client });
    return unwrap(res, mapPriorityQueue);
  }
  async getMyCapacity() {
    const res = await getMyCapacity({ client: this.client });
    return unwrap(res, mapCapacity);
  }
  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------
  async listTasks(opts) {
    const res = await listTasks({ client: this.client, query: opts });
    return unwrap(res, mapTaskList);
  }
  // -------------------------------------------------------------------------
  // Feedback
  // -------------------------------------------------------------------------
  /** Submit a feedback entry via the generated `POST /feedback` SDK function.
   *  `source` is forced to `"MCP"` by the caller (the `aura_feedback` tool) so
   *  the row records its true origin; the API stores whatever is passed. */
  async createFeedback(input) {
    const res = await createFeedback({
      client: this.client,
      body: {
        title: input.title,
        body: input.body,
        is_anonymous: input.is_anonymous,
        source: input.source,
        notify_author: input.notify_author
      }
    });
    return unwrap(res, (d) => d);
  }
  // -------------------------------------------------------------------------
  // Reviews / approvals
  // -------------------------------------------------------------------------
  async getArtifactApprovals(id, opts) {
    const res = await getArtifactApprovals({
      client: this.client,
      path: { id },
      query: opts?.version !== void 0 ? { version: opts.version } : void 0
    });
    return unwrap(res, mapArtifactApprovals);
  }
  async getTaskByHumanKey(key) {
    const res = await getTaskByHumanKey({ client: this.client, path: { key } });
    return unwrap(res, mapTask);
  }
  async getArtifactReview(id) {
    const res = await getArtifactReview({ client: this.client, path: { id } });
    return unwrap(res, mapArtifactReview);
  }
  async requestArtifactReview(id) {
    const res = await requestArtifactReview({ client: this.client, path: { id } });
    return unwrapVoid(res);
  }
  async startArtifactReview(input) {
    const res = await startArtifactReview({
      client: this.client,
      path: { id: input.id },
      body: {
        version: input.version,
        roles: input.roles,
        userIds: input.user_ids,
        deadline: input.deadline
      }
    });
    return unwrapVoid(res);
  }
  async submitArtifactDecision(input) {
    const res = await submitArtifactDecision({
      client: this.client,
      path: { id: input.id },
      body: {
        version: input.version,
        decision: input.decision
      }
    });
    return unwrapVoid(res);
  }
  async reopenArtifactReview(id, version) {
    const res = await reopenArtifactReview({
      client: this.client,
      path: { id },
      body: { version }
    });
    return unwrapVoid(res);
  }
};
function mapPagination(p) {
  const d = p;
  return { page: d.page, limit: d.limit, total: d.total, total_pages: d.total_pages };
}
function mapArtifact(d) {
  const g = d;
  return {
    id: g.id,
    title: g.title,
    latest_version: g.latest_version,
    version: g.version,
    body: g.body,
    summary: g.summary,
    kind: g.kind,
    created_at: g.created_at,
    updated_at: g.updated_at
  };
}
function mapArtifactListItem(d) {
  const g = d;
  return {
    id: g.id,
    title: g.title,
    latest_version: g.latest_version,
    created_at: g.created_at,
    updated_at: g.updated_at,
    kind: g.kind,
    pending_for_me: g.pending_for_me
  };
}
function mapArtifactList(d) {
  const g = d;
  return {
    items: g.items.map(mapArtifactListItem),
    pagination: mapPagination(g.pagination)
  };
}
function mapKnowledgeNode(d) {
  const g = d;
  return {
    id: g.id,
    space_id: g.space_id,
    space_slug: g.space_slug,
    kind: g.kind,
    title: g.title,
    slug: g.slug,
    latest_version: g.latest_version,
    body: g.body,
    // Surface the provenance Aura carries on every node; kept off the
    // named interface via the index signature so callers opt in explicitly.
    updated_at: g.updated_at,
    body_hash: g.body_hash,
    // Preserve the nested `children` the REST tree carries (the wiki tree is
    // recursive: folders contain documents/other folders). The named
    // KnowledgeNode interface hides this behind its index signature so callers
    // opt in explicitly (tree-walking callers recurse it; pretty-printers
    // ignore it). Without this the nested docs (guides/*, workflow/*) are
    // invisible.
    children: (g.children ?? []).map(mapKnowledgeNode)
  };
}
function mapUploadDocument(d) {
  const g = d;
  return {
    id: g.id,
    filename: g.filename,
    mime_type: g.mime_type,
    byte_size: g.byte_size,
    summary: g.summary,
    page_count: g.page_count,
    ingest_status: g.ingest_status,
    portal_url: g.portal_url,
    pages: g.pages
  };
}
function mapBoardBucketItem(d) {
  return {
    kind: d.kind,
    task: d.task,
    title: d.title,
    since: d.since,
    waiting_days: d.waiting_days,
    link: d.link,
    approvals_pending: d.approvals_pending
  };
}
function mapBoardSummary(d) {
  const g = d;
  return {
    overdue: g.overdue ? { count: g.overdue.count, items: g.overdue.items.map((i) => ({
      // BoardOverdueItem has task + deadline + days, not kind/title/since.
      kind: void 0,
      task: i.task ? { uuid: i.task.uuid, human_key: i.task.human_key, title: i.task.title, status: i.task.status, status_type: i.task.status_type } : void 0,
      title: i.task?.title ?? "",
      since: void 0,
      waiting_days: i.days !== void 0 ? Math.abs(i.days) : void 0,
      link: void 0,
      approvals_pending: void 0
    })) } : void 0,
    waiting_on_me: g.waiting_on_me ? { count: g.waiting_on_me.count, items: g.waiting_on_me.items.map(mapBoardBucketItem) } : void 0,
    waiting_on_others: g.waiting_on_others ? { count: g.waiting_on_others.count, items: g.waiting_on_others.items.map(mapBoardBucketItem) } : void 0
  };
}
function mapNotification(d) {
  const g = d;
  return {
    id: g.id,
    type: g.type,
    read: g.read,
    created_at: g.created_at
  };
}
function mapNotificationList(d) {
  const g = d;
  return {
    items: g.items.map(mapNotification),
    pagination: mapPagination(g.pagination)
  };
}
function mapHumanKeyRef(d) {
  const g = d;
  return { id: g.id, title: g.title, level: g.level ?? "" };
}
function mapPriorityQueueItem(d) {
  const g = d;
  return {
    id: g.id,
    human_key: g.human_key,
    title: g.title,
    status: g.status,
    status_type: g.status_type,
    level: g.level,
    block: g.block,
    rank: g.rank,
    asap: g.asap,
    blocked_by: g.blocked_by.map((b) => b.human_key),
    context_path: g.context_path.map((c) => mapHumanKeyRef(c)),
    governing_date: g.governing_date,
    capacity_percent: g.capacity_percent
  };
}
function mapPriorityQueue(d) {
  const g = d;
  return {
    items: g.items.map(mapPriorityQueueItem),
    total: g.total,
    unordered_count: g.unordered_count
  };
}
function mapCapacityTask(d) {
  const g = d;
  return {
    task_id: g.task_id,
    human_key: g.human_key,
    task_title: g.task_title,
    task_status: g.task_status,
    roles: g.roles,
    capacity_percent: g.capacity_percent,
    task_level: g.task_level,
    hierarchy_path: g.hierarchy_path.map(mapHumanKeyRef)
  };
}
function mapCapacity(d) {
  const g = d;
  return {
    base_percent: g.base_percent,
    committed_percent: g.committed_percent,
    free_percent: g.free_percent,
    utilization_percent: g.utilization_percent,
    over: g.over,
    base_capacity_note: g.base_capacity_note,
    tasks: g.tasks.map(mapCapacityTask)
  };
}
function mapTask(d) {
  const g = d;
  const jira = "jira_issues" in g ? g.jira_issues ?? [] : [];
  const children = "children" in g ? g.children ?? [] : [];
  const repositories = "repositories" in g ? g.repositories ?? [] : [];
  const inherited = "inherited_repositories" in g ? g.inherited_repositories ?? [] : [];
  const mapRepo = (r) => ({
    id: r.id,
    display_name: r.display_name,
    source: r.source,
    workspace: r.workspace,
    slug: r.slug,
    branch: r.branch ?? null,
    browse_url: r.browse_url ?? null
  });
  return {
    id: g.id,
    human_key: g.human_key,
    title: g.title,
    description: g.description,
    status: g.status,
    status_type: g.status_type,
    level: g.level,
    jira_issues: jira.map((j) => ({ issue_key: j.issue_key, summary: j.summary })),
    children: children.map((c) => ({ human_key: c.human_key, title: c.title })),
    repositories: repositories.map(mapRepo),
    inherited_repositories: inherited.map(mapRepo),
    suggested_branch: "suggested_branch" in g ? g.suggested_branch ?? null : null
  };
}
function mapTaskList(d) {
  const g = d;
  return {
    items: g.items.map((t) => mapTask(t)),
    pagination: mapPagination(g.pagination)
  };
}
function mapArtifactApprovals(d) {
  const g = d;
  return {
    version: g.version,
    latest_version: g.latest_version,
    decided_count: g.decided_count,
    total_required: g.total_required,
    open_reviews: g.open_reviews.map((r) => ({
      user_id: r.user_id ?? "",
      user_name: r.user_name ?? "",
      decided: r.decided
    })),
    decisions: g.decisions.map((dec) => ({
      user_name: dec.user_name,
      decision: dec.decision,
      decided: true
    }))
  };
}
function mapArtifactReview(d) {
  const g = d;
  return {
    version: g.version,
    review_state: g.review_state,
    reviewers: g.reviewers.map((r) => ({
      user_id: r.user_id,
      user_name: r.user_name,
      status: r.status
    })),
    review_artifacts: g.review_artifacts.map((a) => ({ title: a.title })),
    initiator: g.initiator ? { user_id: g.initiator.user_id, user_name: g.initiator.user_name } : null,
    review_started_at: g.review_started_at,
    review_deadline_at: g.review_deadline_at,
    is_initiator: g.is_initiator
  };
}
async function createDefaultAuraClient() {
  const settings = loadAuraClientSettings();
  if (!settings.baseUrl) {
    throw new Error(
      'Missing `aura.baseUrl` in ~/.pi/agent/settings.json. Add the Aura REST API base URL (e.g. "https://aura.dev-anwalt.de/api") to the `aura` block.'
    );
  }
  const keyring = await createKeyring();
  const pat = await keyring.getSecret({ service: "aura", name: "pat" });
  if (pat === null) {
    throw new Error(
      'No Aura PAT found in the OS keyring. Run `/aura secrets discover` to store one (service: "aura", name: "pat").'
    );
  }
  return new HeyApiAuraClient({ keyring, baseUrl: settings.baseUrl, pat });
}

// ../packages/shared/src/openapi/loader.ts
import { readFileSync as readFileSync2 } from "node:fs";

// ../node_modules/js-yaml/dist/js-yaml.mjs
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var jsYaml = {};
var loader = {};
var common = {};
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon) return common;
  hasRequiredCommon = 1;
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result = "";
    for (let cycle = 0; cycle < count; cycle += 1) {
      result += string;
    }
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  common.isNothing = isNothing;
  common.isObject = isObject;
  common.toArray = toArray;
  common.repeat = repeat;
  common.isNegativeZero = isNegativeZero;
  common.extend = extend;
  return common;
}
var exception;
var hasRequiredException;
function requireException() {
  if (hasRequiredException) return exception;
  hasRequiredException = 1;
  function formatError(exception2, compact) {
    let where = "";
    const message = exception2.reason || "(unknown reason)";
    if (!exception2.mark) return message;
    if (exception2.mark.name) {
      where += 'in "' + exception2.mark.name + '" ';
    }
    where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
    if (!compact && exception2.mark.snippet) {
      where += "\n\n" + exception2.mark.snippet;
    }
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack || "";
    }
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  exception = YAMLException2;
  return exception;
}
var snippet;
var hasRequiredSnippet;
function requireSnippet() {
  if (hasRequiredSnippet) return snippet;
  hasRequiredSnippet = 1;
  const common2 = requireCommon();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
      // relative position
    };
  }
  function padStart(string, max) {
    return common2.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match;
    let foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) {
        foundLineNo = lineStarts.length - 2;
      }
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo - i],
        lineEnds[foundLineNo - i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
        maxLineLength
      );
      result = common2.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common2.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common2.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo + i],
        lineEnds[foundLineNo + i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
        maxLineLength
      );
      result += common2.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  snippet = makeSnippet;
  return snippet;
}
var type;
var hasRequiredType;
function requireType() {
  if (hasRequiredType) return type;
  hasRequiredType = 1;
  const YAMLException2 = requireException();
  const TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  const YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map2) {
    const result = {};
    if (map2 !== null) {
      Object.keys(map2).forEach(function(style) {
        map2[style].forEach(function(alias) {
          result[String(alias)] = style;
        });
      });
    }
    return result;
  }
  function Type2(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
        throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
      }
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
      throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
  }
  type = Type2;
  return type;
}
var schema;
var hasRequiredSchema;
function requireSchema() {
  if (hasRequiredSchema) return schema;
  hasRequiredSchema = 1;
  const YAMLException2 = requireException();
  const Type2 = requireType();
  function compileList(schema2, name) {
    const result = [];
    schema2[name].forEach(function(currentType) {
      let newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
          newIndex = previousIndex;
        }
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    const result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    };
    function collectType(type2) {
      if (type2.multi) {
        result.multi[type2.kind].push(type2);
        result.multi["fallback"].push(type2);
      } else {
        result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
      }
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) {
      arguments[index].forEach(collectType);
    }
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type2) {
      explicit.push(definition);
    } else if (Array.isArray(definition)) {
      explicit = explicit.concat(definition);
    } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else {
      throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    }
    implicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
      if (type2.loadKind && type2.loadKind !== "scalar") {
        throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      }
      if (type2.multi) {
        throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
      }
    });
    explicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  schema = Schema2;
  return schema;
}
var str;
var hasRequiredStr;
function requireStr() {
  if (hasRequiredStr) return str;
  hasRequiredStr = 1;
  const Type2 = requireType();
  str = new Type2("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  return str;
}
var seq;
var hasRequiredSeq;
function requireSeq() {
  if (hasRequiredSeq) return seq;
  hasRequiredSeq = 1;
  const Type2 = requireType();
  seq = new Type2("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  return seq;
}
var map;
var hasRequiredMap;
function requireMap() {
  if (hasRequiredMap) return map;
  hasRequiredMap = 1;
  const Type2 = requireType();
  map = new Type2("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
  return map;
}
var failsafe;
var hasRequiredFailsafe;
function requireFailsafe() {
  if (hasRequiredFailsafe) return failsafe;
  hasRequiredFailsafe = 1;
  const Schema2 = requireSchema();
  failsafe = new Schema2({
    explicit: [
      requireStr(),
      requireSeq(),
      requireMap()
    ]
  });
  return failsafe;
}
var _null;
var hasRequired_null;
function require_null() {
  if (hasRequired_null) return _null;
  hasRequired_null = 1;
  const Type2 = requireType();
  function resolveYamlNull(data) {
    if (data === null) return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  _null = new Type2("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
  return _null;
}
var bool;
var hasRequiredBool;
function requireBool() {
  if (hasRequiredBool) return bool;
  hasRequiredBool = 1;
  const Type2 = requireType();
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  bool = new Type2("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
  return bool;
}
var int;
var hasRequiredInt;
function requireInt() {
  if (hasRequiredInt) return int;
  hasRequiredInt = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max) return false;
    let ch = data[index];
    if (ch === "-" || ch === "+") {
      ch = data[++index];
    }
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) {
        return false;
      }
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign = 1;
    let ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common2.isNegativeZero(object));
  }
  int = new Type2("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
  return int;
}
var float;
var hasRequiredFloat;
function requireFloat() {
  if (hasRequiredFloat) return float;
  hasRequiredFloat = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  const YAML_FLOAT_PATTERN = new RegExp(
    // 2.5e4, 2.5 and integers
    "^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  const YAML_FLOAT_SPECIAL_PATTERN = new RegExp(
    "^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) {
      return false;
    }
    if (isFinite(parseFloat(data, 10))) {
      return true;
    }
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) {
      value = value.slice(1);
    }
    if (value === ".inf") {
      return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    } else if (value === ".nan") {
      return NaN;
    }
    return sign * parseFloat(value, 10);
  }
  const SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) {
      switch (style) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    } else if (Number.POSITIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    } else if (Number.NEGATIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    } else if (common2.isNegativeZero(object)) {
      return "-0.0";
    }
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common2.isNegativeZero(object));
  }
  float = new Type2("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
  return float;
}
var json;
var hasRequiredJson;
function requireJson() {
  if (hasRequiredJson) return json;
  hasRequiredJson = 1;
  json = requireFailsafe().extend({
    implicit: [
      require_null(),
      requireBool(),
      requireInt(),
      requireFloat()
    ]
  });
  return json;
}
var core;
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  core = requireJson();
  return core;
}
var timestamp;
var hasRequiredTimestamp;
function requireTimestamp() {
  if (hasRequiredTimestamp) return timestamp;
  hasRequiredTimestamp = 1;
  const Type2 = requireType();
  const YAML_DATE_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  );
  const YAML_TIMESTAMP_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  );
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    const year = +match[1];
    const month = +match[2] - 1;
    const day = +match[3];
    if (!match[4]) {
      return new Date(Date.UTC(year, month, day));
    }
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) {
        fraction += "0";
      }
      fraction = +fraction;
    }
    if (match[9]) {
      const tzHour = +match[10];
      const tzMinute = +(match[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  timestamp = new Type2("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
  return timestamp;
}
var merge;
var hasRequiredMerge;
function requireMerge() {
  if (hasRequiredMerge) return merge;
  hasRequiredMerge = 1;
  const Type2 = requireType();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  merge = new Type2("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
  return merge;
}
var binary;
var hasRequiredBinary;
function requireBinary() {
  if (hasRequiredBinary) return binary;
  hasRequiredBinary = 1;
  const Type2 = requireType();
  const BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map2.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map2 = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map2.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) {
      result.push(bits >> 4 & 255);
    }
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    let result = "";
    let bits = 0;
    const max = object.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    } else if (tail === 2) {
      result += map2[bits >> 10 & 63];
      result += map2[bits >> 4 & 63];
      result += map2[bits << 2 & 63];
      result += map2[64];
    } else if (tail === 1) {
      result += map2[bits >> 2 & 63];
      result += map2[bits << 4 & 63];
      result += map2[64];
      result += map2[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  binary = new Type2("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
  return binary;
}
var omap;
var hasRequiredOmap;
function requireOmap() {
  if (hasRequiredOmap) return omap;
  hasRequiredOmap = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = {};
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) {
        if (_hasOwnProperty.call(pair, pairKey)) {
          if (!pairHasKey) pairHasKey = true;
          else return false;
        }
      }
      if (!pairHasKey) return false;
      if (_hasOwnProperty.call(objectKeys, pairKey)) return false;
      Object.defineProperty(objectKeys, pairKey, { value: true });
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  omap = new Type2("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
  return omap;
}
var pairs;
var hasRequiredPairs;
function requirePairs() {
  if (hasRequiredPairs) return pairs;
  hasRequiredPairs = 1;
  const Type2 = requireType();
  const _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      const keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  pairs = new Type2("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
  return pairs;
}
var set;
var hasRequiredSet;
function requireSet() {
  if (hasRequiredSet) return set;
  hasRequiredSet = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) {
      if (_hasOwnProperty.call(object, key)) {
        if (object[key] !== null) return false;
      }
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  set = new Type2("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
  return set;
}
var _default;
var hasRequired_default;
function require_default() {
  if (hasRequired_default) return _default;
  hasRequired_default = 1;
  _default = requireCore().extend({
    implicit: [
      requireTimestamp(),
      requireMerge()
    ],
    explicit: [
      requireBinary(),
      requireOmap(),
      requirePairs(),
      requireSet()
    ]
  });
  return _default;
}
var hasRequiredLoader;
function requireLoader() {
  if (hasRequiredLoader) return loader;
  hasRequiredLoader = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const makeSnippet = requireSnippet();
  const DEFAULT_SCHEMA2 = require_default();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CONTEXT_FLOW_IN = 1;
  const CONTEXT_FLOW_OUT = 2;
  const CONTEXT_BLOCK_IN = 3;
  const CONTEXT_BLOCK_OUT = 4;
  const CHOMPING_CLIP = 1;
  const CHOMPING_STRIP = 2;
  const CHOMPING_KEEP = 3;
  const PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  const PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  const PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  const PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  const PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) {
      return lc - 97 + 10;
    }
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) {
      return 2;
    }
    if (c === 117) {
      return 4;
    }
    if (c === 85) {
      return 8;
    }
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\0";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "	";
      case 9:
        return "	";
      case 110:
        return "\n";
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "\x85";
      case 95:
        return "\xA0";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
  }
  function charFromCodepoint(c) {
    if (c <= 65535) {
      return String.fromCharCode(c);
    }
    return String.fromCharCode(
      (c - 65536 >> 10) + 55296,
      (c - 65536 & 1023) + 56320
    );
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      object[key] = value;
    }
  }
  const simpleEscapeCheck = new Array(256);
  const simpleEscapeMap = new Array(256);
  for (let i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxTotalMergeKeys = typeof options["maxTotalMergeKeys"] === "number" ? options["maxTotalMergeKeys"] : 1e4;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.totalMergeKeys = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      // omit trailing \0
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) {
      state.onWarning.call(null, generateError(state, message));
    }
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) {
        transaction[name] = {
          existed: _hasOwnProperty.call(state.anchorMap, name),
          value: state.anchorMap[name]
        };
      }
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0) return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length; index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) {
        parent[name] = transaction[name];
      }
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) {
        state.anchorMap[names[index]] = entry.value;
      } else {
        delete state.anchorMap[names[index]];
      }
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  const directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) {
        throwError(state, "duplication of %YAML directive");
      }
      if (args.length !== 1) {
        throwError(state, "YAML directive accepts exactly one argument");
      }
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) {
        throwError(state, "ill-formed argument of the YAML directive");
      }
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major !== 1) {
        throwError(state, "unacceptable YAML version of the document");
      }
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) {
        throwWarning(state, "unsupported YAML version of the document");
      }
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) {
        throwError(state, "TAG directive accepts exactly two arguments");
      }
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) {
        throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      }
      if (_hasOwnProperty.call(state.tagMap, handle)) {
        throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      }
      if (!PATTERN_TAG_URI.test(prefix)) {
        throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      }
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) {
        for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
          const _character = _result.charCodeAt(_position);
          if (!(_character === 9 || _character >= 32 && _character <= 1114111)) {
            throwError(state, "expected valid JSON character");
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(_result)) {
        throwError(state, "the stream contains non-printable characters");
      }
      state.result += _result;
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common2.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      if (state.maxTotalMergeKeys !== -1 && ++state.totalMergeKeys > state.maxTotalMergeKeys) {
        throwError(state, "merge keys exceeded maxTotalMergeKeys (" + state.maxTotalMergeKeys + ")");
      }
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) {
          throwError(state, "nested arrays are not supported inside keys");
        }
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
          keyNode[index] = "[object Object]";
        }
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
      keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (_result === null) {
      _result = {};
    }
    if (keyTag === "tag:yaml.org,2002:merge") {
      if (Array.isArray(valueNode)) {
        for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
          mergeMappings(state, _result, valueNode[index], overridableKeys);
        }
      } else {
        mergeMappings(state, _result, valueNode, overridableKeys);
      }
    } else {
      if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 10) {
      state.position++;
    } else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) {
        state.position++;
      }
    } else {
      throwError(state, "a line break is expected");
    }
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) {
          state.firstTabInLine = state.position;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 10 && ch !== 13 && ch !== 0);
      }
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else {
        break;
      }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
      throwWarning(state, "deficient indentation");
    }
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) {
        return true;
      }
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += common2.repeat("\n", count - 1);
    }
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
      return false;
    }
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
        return false;
      }
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
          break;
        }
      } else if (ch === 35) {
        const preceding = state.input.charCodeAt(state.position - 1);
        if (isWsOrEol(preceding)) {
          break;
        }
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) {
        break;
      } else if (isEol(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) {
        captureEnd = state.position + 1;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
      return true;
    }
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 39) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (ch === 39) {
          captureStart = state.position;
          state.position++;
          captureEnd = state.position;
        } else {
          return true;
        }
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a single quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 34) {
        captureSegment(state, captureStart, state.position, true);
        state.position++;
        return true;
      } else if (ch === 92) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (isEol(ch)) {
          skipSeparationSpace(state, false, nodeIndent);
        } else if (ch < 256 && simpleEscapeCheck[ch]) {
          state.result += simpleEscapeMap[ch];
          state.position++;
        } else if ((tmp = escapedHexLen(ch)) > 0) {
          let hexLength = tmp;
          let hexResult = 0;
          for (; hexLength > 0; hexLength--) {
            ch = state.input.charCodeAt(++state.position);
            if ((tmp = fromHexCode(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              throwError(state, "expected hexadecimal character");
            }
          }
          state.result += charFromCodepoint(hexResult);
          state.position++;
        } else {
          throwError(state, "unknown escape sequence");
        }
        captureStart = captureEnd = state.position;
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a double quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else {
      return false;
    }
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) {
        throwError(state, "missed comma between flow collection entries");
      } else if (ch === 44) {
        throwError(state, "expected the node content, but found ','");
      }
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following)) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      } else if (isPair) {
        _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      } else {
        _result.push(keyNode);
      }
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else {
        readNext = false;
      }
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 124) {
      folding = false;
    } else if (ch === 62) {
      folding = true;
    } else {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) {
        if (CHOMPING_CLIP === chomping) {
          chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
        } else {
          throwError(state, "repeat of a chomping mode identifier");
        }
      } else if ((tmp = fromDecimalCode(ch)) >= 0) {
        if (tmp === 0) {
          throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
        } else if (!detectedIndent) {
          textIndent = nodeIndent + tmp - 1;
          detectedIndent = true;
        } else {
          throwError(state, "repeat of an indentation width identifier");
        }
      } else {
        break;
      }
    }
    if (isWhiteSpace(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (isWhiteSpace(ch));
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!isEol(ch) && ch !== 0);
      }
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) {
        textIndent = state.lineIndent;
      }
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) {
        throwError(state, "missing indentation for block scalar");
      }
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            state.result += "\n";
          }
        }
        break;
      }
      if (folding) {
        if (isWhiteSpace(ch)) {
          atMoreIndented = true;
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += common2.repeat("\n", emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            state.result += " ";
          }
        } else {
          state.result += common2.repeat("\n", emptyLines);
        }
      } else {
        state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) {
        break;
      }
      const following = state.input.charCodeAt(state.position + 1);
      if (!isWsOrEol(following)) {
        break;
      }
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      const _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a sequence entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else {
          throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        }
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
          break;
        }
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) {
              throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            }
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) {
            throwError(state, "can not read an implicit mapping pair; a colon is missed");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) {
          throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
          if (atExplicitKey) {
            keyNode = state.result;
          } else {
            valueNode = state.result;
          }
        }
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a mapping entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (atExplicitKey) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) {
      throwError(state, "duplication of a tag property");
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else {
      tagHandle = "!";
    }
    let _position = state.position;
    if (isVerbatim) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else {
        throwError(state, "unexpected end of the stream within a verbatim tag");
      }
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) {
          if (!isNamed) {
            tagHandle = state.input.slice(_position - 1, state.position + 1);
            if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
              throwError(state, "named tag handle cannot contain such characters");
            }
            isNamed = true;
            _position = state.position + 1;
          } else {
            throwError(state, "tag suffix cannot contain exclamation marks");
          }
        }
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) {
        throwError(state, "tag suffix cannot contain flow indicator characters");
      }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
      throwError(state, "tag name cannot contain such characters: " + tagName);
    }
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) {
      state.tag = tagName;
    } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
      state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
      state.tag = "!" + tagName;
    } else if (tagHandle === "!!") {
      state.tag = "tag:yaml.org,2002:" + tagName;
    } else {
      throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    }
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) {
      throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an alias node must contain at least one character");
    }
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) {
      throwError(state, 'unidentified alias "' + alias + '"');
    }
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type2;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) {
      throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    }
    state.depth += 1;
    if (state.listener !== null) {
      state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }
    if (indentStatus === 1) {
      while (true) {
        const ch = state.input.charCodeAt(state.position);
        const propertyState = snapshotState(state);
        if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) {
          break;
        }
        if (!readTagProperty(state) && !readAnchorProperty(state)) {
          break;
        }
        if (propertyStart === null) {
          propertyStart = propertyState;
        }
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }
    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
        flowIndent = parentIndent;
      } else {
        flowIndent = parentIndent + 1;
      }
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) {
        if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
          hasContent = true;
        } else {
          const ch = state.input.charCodeAt(state.position);
          if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(
            state,
            propertyStart,
            propertyStart.position - propertyStart.lineStart,
            flowIndent
          )) {
            hasContent = true;
          } else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
            hasContent = true;
          } else if (readAlias(state)) {
            hasContent = true;
            if (state.tag !== null || state.anchor !== null) {
              throwError(state, "alias node should not have any properties");
            }
          } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
            hasContent = true;
            if (state.tag === null) {
              state.tag = "?";
            }
          }
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
      }
    }
    if (state.tag === null) {
      if (state.anchor !== null) {
        storeAnchor(state, state.anchor, state.result);
      }
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") {
        throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      }
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type2 = state.implicitTypes[typeIndex];
        if (type2.resolve(state.result)) {
          state.result = type2.construct(state.result);
          state.tag = type2.tag;
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
        type2 = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        type2 = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
            type2 = typeList[typeIndex];
            break;
          }
        }
      }
      if (!type2) {
        throwError(state, "unknown tag !<" + state.tag + ">");
      }
      if (state.result !== null && type2.kind !== state.kind) {
        throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
      }
      if (!type2.resolve(state.result, state.tag)) {
        throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      } else {
        state.result = type2.construct(state.result, state.tag);
        if (state.anchor !== null) {
          storeAnchor(state, state.anchor, state.result);
        }
      }
    }
    if (state.listener !== null) {
      state.listener("close", state);
    }
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) {
        break;
      }
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) {
        throwError(state, "directive name must not be less than one character in length");
      }
      while (ch !== 0) {
        while (isWhiteSpace(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
        directiveHandlers[directiveName](state, directiveName, directiveArgs);
      } else {
        throwWarning(state, 'unknown document directive "' + directiveName + '"');
      }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
      throwError(state, "directives end mark is expected");
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
      throwWarning(state, "non-ASCII line breaks are interpreted as content");
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) {
      throwError(state, "end of the stream or a document separator is expected");
    }
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
        input += "\n";
      }
      if (input.charCodeAt(0) === 65279) {
        input = input.slice(1);
      }
    }
    const state = new State(input, options);
    const nullpos = input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) {
      readDocument(state);
    }
    return state.documents;
  }
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") {
      return documents;
    }
    for (let index = 0, length = documents.length; index < length; index += 1) {
      iterator(documents[index]);
    }
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) {
      return void 0;
    } else if (documents.length === 1) {
      return documents[0];
    }
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  loader.loadAll = loadAll2;
  loader.load = load2;
  return loader;
}
var dumper = {};
var hasRequiredDumper;
function requireDumper() {
  if (hasRequiredDumper) return dumper;
  hasRequiredDumper = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const DEFAULT_SCHEMA2 = require_default();
  const _toString = Object.prototype.toString;
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CHAR_BOM = 65279;
  const CHAR_TAB = 9;
  const CHAR_LINE_FEED = 10;
  const CHAR_CARRIAGE_RETURN = 13;
  const CHAR_SPACE = 32;
  const CHAR_EXCLAMATION = 33;
  const CHAR_DOUBLE_QUOTE = 34;
  const CHAR_SHARP = 35;
  const CHAR_PERCENT = 37;
  const CHAR_AMPERSAND = 38;
  const CHAR_SINGLE_QUOTE = 39;
  const CHAR_ASTERISK = 42;
  const CHAR_COMMA = 44;
  const CHAR_MINUS = 45;
  const CHAR_COLON = 58;
  const CHAR_EQUALS = 61;
  const CHAR_GREATER_THAN = 62;
  const CHAR_QUESTION = 63;
  const CHAR_COMMERCIAL_AT = 64;
  const CHAR_LEFT_SQUARE_BRACKET = 91;
  const CHAR_RIGHT_SQUARE_BRACKET = 93;
  const CHAR_GRAVE_ACCENT = 96;
  const CHAR_LEFT_CURLY_BRACKET = 123;
  const CHAR_VERTICAL_LINE = 124;
  const CHAR_RIGHT_CURLY_BRACKET = 125;
  const ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  const DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  const DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema2, map2) {
    if (map2 === null) return {};
    const result = {};
    const keys = Object.keys(map2);
    for (let index = 0, length = keys.length; index < length; index += 1) {
      let tag = keys[index];
      let style = String(map2[tag]);
      if (tag.slice(0, 2) === "!!") {
        tag = "tag:yaml.org,2002:" + tag.slice(2);
      }
      const type2 = schema2.compiledTypeMap["fallback"][tag];
      if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
        style = type2.styleAliases[style];
      }
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else {
      throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    }
    return "\\" + handle + common2.repeat("0", length - string.length) + string;
  }
  const QUOTING_TYPE_SINGLE = 1;
  const QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common2.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    const ind = common2.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return "\n" + common2.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str2) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) {
      const type2 = state.implicitTypes[index];
      if (type2.resolve(str2)) {
        return true;
      }
    }
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && // - b-char
    c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (
      // ns-plain-safe
      (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && // - c-flow-indicator
      c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && // ns-plain-char
      c !== CHAR_SHARP && // false on '#'
      !(prev === CHAR_COLON && !cIsNsChar) || // false on ': '
      isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || // change to true on '[^ ]#'
      prev === CHAR_COLON && cIsNsChar
    );
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && // - s-white
    // - (c-indicator ::=
    // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
    c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
    c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && // | “%” | “@” | “`”)
    c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string) {
    const leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
  }
  const STYLE_PLAIN = 1;
  const STYLE_SINGLE = 2;
  const STYLE_LITERAL = 3;
  const STYLE_FOLDED = 4;
  const STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
    } else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
            i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) {
        return STYLE_PLAIN;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
      return STYLE_DOUBLE;
    }
    if (!forceQuotes) {
      return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = function() {
      if (string.length === 0) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      }
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
        }
      }
      const indent = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      const singleLineOnly = iskey || // No block styles in flow mode.
      state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(
        string,
        singleLineOnly,
        state.indent,
        lineWidth,
        testAmbiguity,
        state.quotingType,
        state.forceQuotes && !iskey,
        inblock
      )) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    }();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === "\n";
    const keep = clip && (string[string.length - 2] === "\n" || string === "\n");
    const chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = function() {
      let nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    }();
    let prevMoreIndented = string[0] === "\n" || string[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string)) {
      const prefix = match[1];
      const line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    const breakRe = / [^ ]/g;
    let match;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += "\n";
    if (line.length - start > width && curr > start) {
      result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    } else {
      result += line.slice(start);
    }
    return result.slice(1);
  }
  function escapeString(string) {
    let result = "";
    let char = 0;
    for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536) result += string[i + 1];
      } else {
        result += escapeSeq || encodeHex(char);
      }
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") {
          _result += generateNextLine(state, level);
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          _result += "-";
        } else {
          _result += "- ";
        }
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level, objectKey, false, false)) {
        continue;
      }
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) {
        continue;
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) {
      objectKeyList.sort();
    } else if (typeof state.sortKeys === "function") {
      objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
      throw new YAMLException2("sortKeys must be a boolean or a function");
    }
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") {
        pairBuffer += generateNextLine(state, level);
      }
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level + 1, objectKey, true, true, true)) {
        continue;
      }
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) {
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += "?";
        } else {
          pairBuffer += "? ";
        }
      }
      pairBuffer += state.dump;
      if (explicitPair) {
        pairBuffer += generateNextLine(state, level);
      }
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
        continue;
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += ":";
      } else {
        pairBuffer += ": ";
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type2 = typeList[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object);
          } else {
            state.tag = type2.tag;
          }
        } else {
          state.tag = "?";
        }
        if (type2.represent) {
          const style = state.styleMap[type2.tag] || type2.defaultStyle;
          let _result;
          if (_toString.call(type2.represent) === "[object Function]") {
            _result = type2.represent(object, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object, style);
          } else {
            throw new YAMLException2("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
          }
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) {
      detectType(state, object, true);
    }
    const type2 = _toString.call(state.dump);
    const inblock = block;
    if (block) {
      block = state.flowLevel < 0 || state.flowLevel > level;
    }
    const objectOrArray = type2 === "[object Object]" || type2 === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
      compact = false;
    }
    if (duplicate && state.usedDuplicates[duplicateIndex]) {
      state.dump = "*ref_" + duplicateIndex;
    } else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
        state.usedDuplicates[duplicateIndex] = true;
      }
      if (type2 === "[object Object]") {
        if (block && Object.keys(state.dump).length !== 0) {
          writeBlockMapping(state, level, state.dump, compact);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowMapping(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object Array]") {
        if (block && state.dump.length !== 0) {
          if (state.noArrayIndent && !isblockseq && level > 0) {
            writeBlockSequence(state, level - 1, state.dump, compact);
          } else {
            writeBlockSequence(state, level, state.dump, compact);
          }
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowSequence(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object String]") {
        if (state.tag !== "?") {
          writeScalar(state, state.dump, level, iskey, inblock);
        }
      } else if (type2 === "[object Undefined]") {
        return false;
      } else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type2);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(
          state.tag[0] === "!" ? state.tag.slice(1) : state.tag
        ).replace(/!/g, "%21");
        if (state.tag[0] === "!") {
          tagStr = "!" + tagStr;
        } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
          tagStr = "!!" + tagStr.slice(18);
        } else {
          tagStr = "!<" + tagStr + ">";
        }
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object);
        if (Array.isArray(object)) {
          for (let i = 0, length = object.length; i < length; i += 1) {
            inspectNode(object[i], objects, duplicatesIndexes);
          }
        } else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) {
            inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
          }
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) {
      value = state.replacer.call({ "": value }, "", value);
    }
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  dumper.dump = dump2;
  return dumper;
}
var hasRequiredJsYaml;
function requireJsYaml() {
  if (hasRequiredJsYaml) return jsYaml;
  hasRequiredJsYaml = 1;
  const loader2 = requireLoader();
  const dumper2 = requireDumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  jsYaml.Type = requireType();
  jsYaml.Schema = requireSchema();
  jsYaml.FAILSAFE_SCHEMA = requireFailsafe();
  jsYaml.JSON_SCHEMA = requireJson();
  jsYaml.CORE_SCHEMA = requireCore();
  jsYaml.DEFAULT_SCHEMA = require_default();
  jsYaml.load = loader2.load;
  jsYaml.loadAll = loader2.loadAll;
  jsYaml.dump = dumper2.dump;
  jsYaml.YAMLException = requireException();
  jsYaml.types = {
    binary: requireBinary(),
    float: requireFloat(),
    map: requireMap(),
    null: require_null(),
    pairs: requirePairs(),
    set: requireSet(),
    timestamp: requireTimestamp(),
    bool: requireBool(),
    int: requireInt(),
    merge: requireMerge(),
    omap: requireOmap(),
    seq: requireSeq(),
    str: requireStr()
  };
  jsYaml.safeLoad = renamed("safeLoad", "load");
  jsYaml.safeLoadAll = renamed("safeLoadAll", "loadAll");
  jsYaml.safeDump = renamed("safeDump", "dump");
  return jsYaml;
}
var jsYamlExports = requireJsYaml();
var yaml = /* @__PURE__ */ getDefaultExportFromCjs(jsYamlExports);
var {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
} = yaml;

// ../packages/shared/src/openapi/loader.ts
var SUPPORTED_REF_PREFIXES = [
  "#/components/schemas/",
  "#/components/parameters/",
  "#/components/responses/"
];
function assertSupportedRef(ref) {
  if (!SUPPORTED_REF_PREFIXES.some((p) => ref.startsWith(p))) {
    throw new Error(
      `Unsupported $ref: "${ref}". Only #/components/schemas/..., #/components/parameters/..., and #/components/responses/... are supported.`
    );
  }
}
function refName(ref) {
  return ref.split("/").pop();
}
var PATH_PARAM_RE2 = /\{([^}]+)\}/g;
function extractPathParamNames(path) {
  const names = [];
  let m;
  while ((m = PATH_PARAM_RE2.exec(path)) !== null) {
    names.push(m[1]);
  }
  return names;
}
function parseSchema(raw) {
  const result = {};
  if (raw.type) result.type = raw.type;
  if (raw.format) result.format = raw.format;
  if (raw.items) result.items = parseSchema(raw.items);
  if (raw.enum !== void 0) result.enum = raw.enum;
  if (raw.default !== void 0) result.default = raw.default;
  if (raw.minimum !== void 0) result.minimum = raw.minimum;
  if (raw.maximum !== void 0) result.maximum = raw.maximum;
  if (raw.nullable !== void 0) result.nullable = raw.nullable;
  return result;
}
function parseParam(raw, components) {
  let resolved = raw;
  if (raw.$ref) {
    assertSupportedRef(raw.$ref);
    const name = refName(raw.$ref);
    resolved = components?.parameters?.[name] ?? {};
  }
  return {
    name: resolved.name ?? "",
    required: resolved.required ?? false,
    schema: parseSchema(resolved.schema ?? {}),
    style: resolved.style,
    explode: resolved.explode,
    description: resolved.description
  };
}
function parseBody(raw) {
  if (!raw) return void 0;
  const content = raw.content ?? {};
  const contentType = "application/json" in content ? "application/json" : Object.keys(content)[0] ?? "application/json";
  const entry = content[contentType];
  const schema2 = entry?.schema;
  let schemaRef;
  let schemaInline;
  if (schema2) {
    if (schema2.$ref) {
      assertSupportedRef(schema2.$ref);
      schemaRef = refName(schema2.$ref);
    } else {
      schemaInline = schema2;
    }
  }
  return {
    contentType,
    schemaRef,
    schemaInline,
    required: raw.required ?? false
  };
}
function parseResponse(code, raw, components) {
  let resolved = raw;
  if (raw.$ref) {
    assertSupportedRef(raw.$ref);
    const name = refName(raw.$ref);
    resolved = components?.responses?.[name] ?? {};
  }
  let schemaRef;
  const content = resolved.content ?? {};
  const jsonEntry = content["application/json"] ?? content["application/problem+json"];
  if (jsonEntry?.schema?.$ref) {
    assertSupportedRef(jsonEntry.schema.$ref);
    schemaRef = refName(jsonEntry.schema.$ref);
  }
  return {
    code,
    description: resolved.description ?? "",
    schemaRef
  };
}
var HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
function parseOperation(method, path, raw, components) {
  if (!raw.operationId) {
    console.warn(
      `[openapi-loader] WARNING: skipping operation with no operationId: ${method.toUpperCase()} ${path}`
    );
    return null;
  }
  const pathParamNames = extractPathParamNames(path);
  const allParams = (raw.parameters ?? []).map((p) => parseParam(p, components));
  const pathParams = [];
  const queryParams = [];
  for (const p of allParams) {
    const inLocation = findParamIn(p, raw.parameters ?? [], components);
    if (inLocation === "path") {
      pathParams.push(p);
    } else if (inLocation === "query") {
      queryParams.push(p);
    }
  }
  const pathParamNamesFromParams = pathParams.map((p) => p.name);
  for (const name of pathParamNames) {
    if (!pathParamNamesFromParams.includes(name)) {
      pathParams.push({
        name,
        required: true,
        schema: {}
      });
    }
  }
  const responses = [];
  for (const [code, respRaw] of Object.entries(raw.responses ?? {})) {
    responses.push(parseResponse(code, respRaw, components));
  }
  return {
    operationId: raw.operationId,
    method,
    path,
    pathParams,
    queryParams,
    body: parseBody(raw.requestBody),
    tags: raw.tags ?? [],
    summary: raw.summary,
    description: raw.description,
    responses
  };
}
function findParamIn(param, rawParams, components) {
  for (const rp of rawParams) {
    let name;
    let inLoc;
    if (rp.$ref) {
      assertSupportedRef(rp.$ref);
      const refN = refName(rp.$ref);
      const resolved = components?.parameters?.[refN];
      name = resolved?.name;
      inLoc = resolved?.in;
    } else {
      name = rp.name;
      inLoc = rp.in;
    }
    if (name === param.name) return inLoc;
  }
  return void 0;
}
var cache = /* @__PURE__ */ new Map();
function loadOpenApi(path) {
  const cached = cache.get(path);
  if (cached) return cached;
  const raw = readFileSync2(path, "utf8");
  const spec = load(raw);
  const components = spec.components;
  const index = {};
  for (const [path2, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const rawOp = methods[method];
      if (!rawOp) continue;
      const op = parseOperation(method, path2, rawOp, components);
      if (!op) continue;
      if (index[op.operationId]) {
        const existing = index[op.operationId];
        throw new Error(
          `Duplicate operationId "${op.operationId}": first at ${existing.method.toUpperCase()} ${existing.path}, second at ${op.method.toUpperCase()} ${op.path}`
        );
      }
      index[op.operationId] = op;
    }
  }
  cache.set(path, index);
  return index;
}

// src/rest-list-describe.ts
var OTHER_TAG = "Other";
function restList(index, out) {
  const byTag = /* @__PURE__ */ new Map();
  for (const op of Object.values(index)) {
    const tags = op.tags.length > 0 ? op.tags : [OTHER_TAG];
    for (const tag of tags) {
      let group = byTag.get(tag);
      if (!group) {
        group = [];
        byTag.set(tag, group);
      }
      group.push(op);
    }
  }
  const sortedTags = [...byTag.keys()].sort((a, b) => {
    if (a === OTHER_TAG) return 1;
    if (b === OTHER_TAG) return -1;
    return a.localeCompare(b);
  });
  for (const tag of sortedTags) {
    const ops = byTag.get(tag);
    ops.sort((a, b) => a.operationId.localeCompare(b.operationId));
    out.log(`## ${tag}`);
    for (const op of ops) {
      const method = op.method.toUpperCase().padEnd(6);
      out.log(`  ${op.operationId}  ${method}  ${op.path}  \u2014 ${op.summary ?? ""}`);
    }
    out.log("");
  }
}
function closestMatches(ids, query, max = 5) {
  const lower = query.toLowerCase();
  const substrMatches = ids.filter((id) => id.toLowerCase().includes(lower));
  if (substrMatches.length > 0) return substrMatches.slice(0, max);
  const scored = ids.map((id) => ({ id, dist: levenshtein(id.toLowerCase(), lower) }));
  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, max).map((s) => s.id);
}
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function restDescribe(index, opId, out) {
  const op = index[opId];
  if (!op) {
    const ids = Object.keys(index);
    const matches = closestMatches(ids, opId);
    out.error(`Error: unknown operationId "${opId}".`);
    if (matches.length > 0) {
      out.error(`Closest matches:`);
      for (const m of matches) out.error(`  ${m}`);
    }
    process.exit(2);
  }
  out.log(`${op.method.toUpperCase()}  ${op.path}`);
  out.log(`operationId: ${op.operationId}`);
  if (op.summary) out.log(`summary: ${op.summary}`);
  if (op.description) out.log(`description: ${op.description}`);
  if (op.tags.length > 0) out.log(`tags: ${op.tags.join(", ")}`);
  if (op.pathParams.length > 0) {
    out.log("");
    out.log("Path parameters:");
    for (const p of op.pathParams) {
      const typeStr = p.schema.format ? `${p.schema.type}/${p.schema.format}` : p.schema.type ?? "string";
      out.log(`  ${p.name}  (${typeStr})${p.required ? " [required]" : ""}`);
      if (p.description) out.log(`    ${p.description}`);
    }
  }
  if (op.queryParams.length > 0) {
    out.log("");
    out.log("Query parameters:");
    for (const p of op.queryParams) {
      const typeStr = p.schema.format ? `${p.schema.type}/${p.schema.format}` : p.schema.type ?? "string";
      const explodeStr = p.explode !== void 0 ? `, explode=${p.explode}` : "";
      const styleStr = p.style !== void 0 ? `, style=${p.style}` : "";
      out.log(`  ${p.name}  (${typeStr}${styleStr}${explodeStr})${p.required ? " [required]" : ""}`);
      if (p.description) out.log(`    ${p.description}`);
    }
  }
  if (op.body) {
    out.log("");
    out.log("Request body:");
    out.log(`  Content-Type: ${op.body.contentType}`);
    out.log(`  Required: ${op.body.required}`);
    if (op.body.schemaRef) {
      out.log(`  Schema: ${op.body.schemaRef}`);
    } else if (op.body.schemaInline) {
      out.log(`  Schema (inline): ${JSON.stringify(op.body.schemaInline)}`);
    }
  }
  if (op.responses.length > 0) {
    out.log("");
    out.log("Responses:");
    for (const r of op.responses) {
      const refStr = r.schemaRef ? ` \u2192 ${r.schemaRef}` : "";
      out.log(`  ${r.code}  ${r.description}${refStr}`);
    }
  }
}

// src/aura.ts
var USAGE = `Usage:
  node aura.mjs artifact get <artifact-uuid>              fetch body+meta into a workdir
  node aura.mjs artifact update <workdir> [--summary S]   upload from workdir, then remove it
  node aura.mjs artifact create --title T --kind K [--body-file F] [--summary S]
  node aura.mjs artifact section <id> --heading H --body B --summary S
  node aura.mjs artifact cleanup <workdir> | --stale
  node aura.mjs artifact review-get <id>                  compact review state
  node aura.mjs artifact review-approvals <id>            decisions + decided/total
  node aura.mjs artifact review-request <id>             request a review
  node aura.mjs artifact review-start <id> --version V --roles R[,R] --user-ids U[,U] [--deadline D]
  node aura.mjs artifact review-decide <id> --version V --decision APPROVED|REJECTED
  node aura.mjs artifact review-reopen <id> --version V  reopen an approved review
  node aura.mjs wiki get --slug "eng/auth" | --uuid <node-uuid>   fetch body+meta into a workdir
  node aura.mjs wiki save <workdir> [--summary S]                upload, then remove workdir
  node aura.mjs wiki search "<query>" [--space <slug>] [--limit N]
  node aura.mjs wiki tree --slug "<space>"
  node aura.mjs wiki create --space <slug> --title T --slug S    prints new node uuid
  node aura.mjs upload create --file <path> [--mime <type>] [--filename <name>]
  node aura.mjs upload get <upload-uuid> [--out <path>]          parsed text to file (or stdout if small)
  node aura.mjs rest list                                    list all REST operations grouped by tag
  node aura.mjs rest describe <operationId>                  print the full shape of one REST operation`;
function fail(msg, usage = false, code = 2) {
  console.error(msg);
  if (usage) console.error(USAGE);
  process.exit(code);
}
var LARGE_BODY_THRESHOLD = 500;
function freshWorkdir(prefix) {
  const dir = join3(tmpdir(), `${prefix}-${randomBytes2(6).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function writeWorkdir(dir, meta, body) {
  writeFileSync(join3(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
  writeFileSync(join3(dir, "body.md"), body, "utf8");
}
function readWorkdirMeta(dir) {
  const p = join3(dir, "meta.json");
  if (!existsSync3(p)) fail(`workdir ${dir} has no meta.json`);
  return JSON.parse(readFileSync3(p, "utf8"));
}
function removeWorkdir(dir) {
  rmSync(dir, { recursive: true, force: true });
}
function cleanupStale() {
  const cutoff = Date.now() - 60 * 60 * 1e3;
  const tmp = tmpdir();
  let count = 0;
  for (const name of readdirSync(tmp)) {
    if (!/^aura-(artifact|wiki|upload)-[0-9a-f]+$/.test(name)) continue;
    const p = join3(tmp, name);
    try {
      if (statSync2(p).mtimeMs < cutoff) {
        rmSync(p, { recursive: true, force: true });
        count++;
      }
    } catch {
    }
  }
  console.error(`removed ${count} stale workdir(s)`);
}
async function artifactGet(client2, id) {
  const detail = await client2.getArtifact(id);
  const body = detail.body ?? "";
  const dir = freshWorkdir("aura-artifact");
  writeWorkdir(dir, {
    kind: "artifact",
    artifact_id: id,
    version: detail.latest_version ?? 0,
    title: detail.title ?? "",
    artifact_kind: detail.kind ?? "GENERIC"
  }, body);
  console.log(`workdir: ${dir}/`);
  console.error(`  ${detail.title ?? "(untitled)"}  v${detail.latest_version ?? 0}  (${body.length} bytes)`);
}
async function artifactUpdate(client2, dir, summary) {
  const meta = readWorkdirMeta(dir);
  if (meta.kind !== "artifact") fail(`workdir ${dir} is not an artifact workdir`);
  const bodyPath = join3(dir, "body.md");
  if (!existsSync3(bodyPath)) fail(`workdir ${dir} has no body.md`);
  const body = readFileSync3(bodyPath, "utf8");
  await client2.mcpUpdateArtifact({
    id: meta.artifact_id,
    mode: "whole",
    body,
    summary: summary ?? `Updated via aura.mjs (v${meta.version} \u2192 next)`,
    confirm_full_replace: true
  });
  removeWorkdir(dir);
  console.error(`updated ${meta.artifact_id}; cleaned up ${dir}/`);
}
async function artifactCreate(client2, opts) {
  let body = "";
  if (opts.bodyFile) {
    body = readFileSync3(opts.bodyFile, "utf8");
    if (body.length < LARGE_BODY_THRESHOLD) console.error(`note: body is ${body.length} bytes (\u2264 ${LARGE_BODY_THRESHOLD}); a direct mcpCreateArtifact call would also be fine.`);
  }
  const created = await client2.mcpCreateArtifact({
    title: opts.title,
    kind: opts.kind,
    body,
    summary: opts.summary ?? "Initial version"
  });
  if (opts.bodyFile) rmSync(opts.bodyFile, { force: true });
  console.log(`created ${created.id} (v${created.latest_version ?? 1})`);
}
async function artifactSection(client2, id, heading, body, summary) {
  await client2.mcpUpdateArtifact({
    id,
    mode: "section",
    target_heading: heading,
    body,
    summary
  });
  console.error(`updated section ${heading} of ${id}`);
}
function parseCsv(value) {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
async function reviewGet(client2, id) {
  const review = await client2.getArtifactReview(id);
  console.log(`artifact ${id}  v${review.version}  state: ${review.review_state}`);
  if (review.reviewers.length > 0) {
    console.log("  reviewers:");
    for (const r of review.reviewers) {
      console.log(`    ${r.user_name} (${r.user_id})  ${r.status}`);
    }
  } else {
    console.log("  reviewers: (none)");
  }
  if (review.review_deadline_at) console.log(`  deadline: ${review.review_deadline_at}`);
  const init = review.initiator;
  console.log(`  initiator: ${init ? `${init.user_name} (${init.user_id})` : "(none)"}`);
}
async function reviewApprovals(client2, id) {
  const ap = await client2.getArtifactApprovals(id);
  console.log(`artifact ${id}  v${ap.version} (latest ${ap.latest_version})  ${ap.decided_count}/${ap.total_required} decided`);
  for (const d of ap.decisions) {
    console.log(`  ${d.user_name}: ${d.decision}`);
  }
  if (ap.open_reviews.length > 0) {
    console.log("  pending:");
    for (const o of ap.open_reviews) {
      const tag = o.decided ? "decided" : "open";
      console.log(`    ${o.user_name} (${o.user_id})  ${tag}`);
    }
  }
}
async function reviewRequest(client2, id) {
  await client2.requestArtifactReview(id);
  console.log(`review requested for ${id}`);
}
async function reviewStart(client2, opts) {
  await client2.startArtifactReview({
    id: opts.id,
    version: opts.version,
    roles: opts.roles,
    user_ids: opts.userIds,
    deadline: opts.deadline
  });
  console.log(`review started for ${opts.id} v${opts.version} (roles: ${opts.roles.join(",") || "(none)"}, reviewers: ${opts.userIds.join(",") || "(none)"}${opts.deadline ? `, deadline: ${opts.deadline}` : ""})`);
}
async function reviewDecide(client2, opts) {
  await client2.submitArtifactDecision({
    id: opts.id,
    version: opts.version,
    decision: opts.decision
  });
  console.log(`${opts.decision} recorded for ${opts.id} v${opts.version}`);
}
async function reviewReopen(client2, id, version) {
  await client2.reopenArtifactReview(id, version);
  console.log(`review reopened for ${id} v${version}`);
}
async function wikiGet(client2, opts) {
  let node;
  if (opts.uuid) {
    node = await client2.getKnowledgeNode(opts.uuid, { includeBody: true });
  } else if (opts.slug) {
    const slashIdx = opts.slug.indexOf("/");
    const spaceSlug = slashIdx === -1 ? opts.slug : opts.slug.slice(0, slashIdx);
    const path = slashIdx === -1 ? "" : opts.slug.slice(slashIdx + 1);
    node = await client2.getKnowledgeNodeByPath(spaceSlug, path, { includeBody: true });
  } else {
    fail("wiki get requires --slug or --uuid", true);
  }
  const body = node.body ?? "";
  const dir = freshWorkdir("aura-wiki");
  writeWorkdir(dir, {
    kind: "wiki",
    node_uuid: node.id,
    slug: node.slug ?? opts.slug ?? "",
    title: node.title ?? "",
    version: node.latest_version ?? 0
  }, body);
  console.log(`workdir: ${dir}/`);
  console.error(`  ${node.title ?? "(untitled)"}  ${node.slug ?? ""}  (v${node.latest_version ?? 0}, ${body.length} bytes)`);
}
async function wikiSave(client2, dir, summary) {
  const meta = readWorkdirMeta(dir);
  if (meta.kind !== "wiki") fail(`workdir ${dir} is not a wiki workdir`);
  const bodyPath = join3(dir, "body.md");
  if (!existsSync3(bodyPath)) fail(`workdir ${dir} has no body.md`);
  const body = readFileSync3(bodyPath, "utf8");
  await client2.saveKnowledgeNodeBody({
    uuid: meta.node_uuid,
    body,
    summary: summary ?? `Updated via aura.mjs`
  });
  removeWorkdir(dir);
  console.error(`saved ${meta.slug}; cleaned up ${dir}/`);
}
async function wikiSearch(client2, query, spaceSlug, limit) {
  const res = await client2.mcpWikiSearch({
    query,
    space_slug: spaceSlug,
    limit: limit ?? 10
  });
  for (const it of res.items) {
    console.log(`- ${it.title}  [${it.space_slug}]  (${it.url})`);
  }
}
async function wikiTree(client2, slug) {
  const res = await client2.getKnowledgeTree(slug);
  console.log(JSON.stringify(res, null, 2));
}
async function wikiCreate(client2, opts) {
  const res = await client2.createKnowledgeNode({
    space_slug: opts.space,
    kind: "DOCUMENT",
    title: opts.title,
    slug: opts.slug
  });
  console.log(res.id);
}
async function uploadCreate(client2, opts) {
  const buf = readFileSync3(opts.file);
  const contentBase64 = buf.toString("base64");
  const filename = opts.filename ?? opts.file.split("/").pop() ?? "upload";
  const res = await client2.mcpCreateUploadDocument({
    filename,
    content_base64: contentBase64,
    mime_type: opts.mime ?? "application/octet-stream"
  });
  console.log(res.id);
}
async function uploadGet(client2, id, outPath) {
  const doc = await client2.mcpGetUploadDocument(id);
  const text = doc.pages.map((p) => p.content ?? "").join("\n\n---\n\n");
  const summary = `# ${doc.filename}

- mime: ${doc.mime_type}
- size: ${doc.byte_size ?? "?"} bytes
- pages: ${doc.page_count ?? "?"}
- ingest: ${doc.ingest_status ?? "?"}
- summary: ${doc.summary ?? ""}

## Extracted text

${text}
`;
  if (outPath) {
    writeFileSync(outPath, summary, "utf8");
    console.log(`wrote ${outPath} (${summary.length} bytes)`);
  } else if (summary.length <= LARGE_BODY_THRESHOLD * 4) {
    process.stdout.write(summary);
  } else {
    const dir = freshWorkdir("aura-upload");
    writeFileSync(join3(dir, "parsed.md"), summary, "utf8");
    console.log(`workdir: ${dir}/`);
    console.error(`  ${doc.filename}  (${summary.length} bytes) \u2014 parsed text in parsed.md`);
  }
}
function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== void 0 && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}
async function main() {
  const group = process.argv[2];
  const sub = process.argv[3];
  const rest = process.argv.slice(4);
  const needsClient = group !== "rest";
  const client2 = needsClient ? await createDefaultAuraClient() : null;
  try {
    if (group === "artifact") {
      switch (sub) {
        case "get": {
          const id = rest[0];
          if (!id) fail("artifact get: missing <artifact-uuid>", true);
          await artifactGet(client2, id);
          return;
        }
        case "update": {
          const dir = rest[0];
          if (!dir) fail("artifact update: missing <workdir>", true);
          const flags = parseFlags(rest.slice(1));
          await artifactUpdate(client2, resolve(dir), flags.summary);
          return;
        }
        case "create": {
          const flags = parseFlags(rest);
          if (!flags.title || !flags.kind) fail("artifact create: --title and --kind required", true);
          await artifactCreate(client2, {
            title: flags.title,
            kind: flags.kind,
            bodyFile: flags["body-file"],
            summary: flags.summary
          });
          return;
        }
        case "section": {
          const id = rest[0];
          const flags = parseFlags(rest.slice(1));
          if (!id || !flags.heading || !flags.body || !flags.summary) {
            fail("artifact section: <id> --heading H --body B --summary S required", true);
          }
          await artifactSection(client2, id, flags.heading, flags.body, flags.summary);
          return;
        }
        case "cleanup": {
          if (rest[0] === "--stale") {
            cleanupStale();
            return;
          }
          const dir = rest[0];
          if (!dir) fail("artifact cleanup: <workdir> or --stale required", true);
          removeWorkdir(resolve(dir));
          console.error(`cleaned up ${dir}`);
          return;
        }
        case "review-get": {
          const id = rest[0];
          if (!id) fail("artifact review-get: missing <id>", true);
          await reviewGet(client2, id);
          return;
        }
        case "review-approvals": {
          const id = rest[0];
          if (!id) fail("artifact review-approvals: missing <id>", true);
          await reviewApprovals(client2, id);
          return;
        }
        case "review-request": {
          const id = rest[0];
          if (!id) fail("artifact review-request: missing <id>", true);
          await reviewRequest(client2, id);
          return;
        }
        case "review-start": {
          const id = rest[0];
          if (!id) fail("artifact review-start: missing <id>", true);
          const flags = parseFlags(rest.slice(1));
          if (!flags.version) fail("artifact review-start: --version required", true);
          if (!flags.roles) fail("artifact review-start: --roles required", true);
          if (!flags["user-ids"]) fail("artifact review-start: --user-ids required", true);
          const version = Number(flags.version);
          if (!Number.isFinite(version)) fail("artifact review-start: --version must be a number", true);
          const roles = parseCsv(flags.roles);
          const userIds = parseCsv(flags["user-ids"]);
          await reviewStart(client2, { id, version, roles, userIds, deadline: flags.deadline });
          return;
        }
        case "review-decide": {
          const id = rest[0];
          if (!id) fail("artifact review-decide: missing <id>", true);
          const flags = parseFlags(rest.slice(1));
          if (!flags.version) fail("artifact review-decide: --version required", true);
          if (!flags.decision) fail("artifact review-decide: --decision required", true);
          const version = Number(flags.version);
          if (!Number.isFinite(version)) fail("artifact review-decide: --version must be a number", true);
          const decision = flags.decision.toUpperCase();
          if (decision !== "APPROVED" && decision !== "REJECTED") {
            fail("artifact review-decide: --decision must be APPROVED or REJECTED", true);
          }
          await reviewDecide(client2, { id, version, decision });
          return;
        }
        case "review-reopen": {
          const id = rest[0];
          if (!id) fail("artifact review-reopen: missing <id>", true);
          const flags = parseFlags(rest.slice(1));
          if (!flags.version) fail("artifact review-reopen: --version required", true);
          const version = Number(flags.version);
          if (!Number.isFinite(version)) fail("artifact review-reopen: --version must be a number", true);
          await reviewReopen(client2, id, version);
          return;
        }
        default:
          fail(`artifact: unknown subcommand "${sub}"`, true);
      }
    } else if (group === "wiki") {
      switch (sub) {
        case "get": {
          const flags = parseFlags(rest);
          if (!flags.slug && !flags.uuid) fail("wiki get: --slug or --uuid required", true);
          await wikiGet(client2, { slug: flags.slug, uuid: flags.uuid });
          return;
        }
        case "save": {
          const dir = rest[0];
          if (!dir) fail("wiki save: missing <workdir>", true);
          const flags = parseFlags(rest.slice(1));
          await wikiSave(client2, resolve(dir), flags.summary);
          return;
        }
        case "search": {
          const query = rest[0];
          if (!query) fail("wiki search: missing <query>", true);
          const flags = parseFlags(rest.slice(1));
          await wikiSearch(client2, query, flags.space, flags.limit ? Number(flags.limit) : void 0);
          return;
        }
        case "tree": {
          const flags = parseFlags(rest);
          if (!flags.slug) fail("wiki tree: --slug required", true);
          await wikiTree(client2, flags.slug);
          return;
        }
        case "create": {
          const flags = parseFlags(rest);
          if (!flags.space || !flags.title || !flags.slug) fail("wiki create: --space --title --slug required", true);
          await wikiCreate(client2, { space: flags.space, title: flags.title, slug: flags.slug });
          return;
        }
        default:
          fail(`wiki: unknown subcommand "${sub}"`, true);
      }
    } else if (group === "upload") {
      switch (sub) {
        case "create": {
          const flags = parseFlags(rest);
          if (!flags.file) fail("upload create: --file required", true);
          await uploadCreate(client2, { file: flags.file, mime: flags.mime, filename: flags.filename });
          return;
        }
        case "get": {
          const id = rest[0];
          if (!id) fail("upload get: missing <upload-uuid>", true);
          const flags = parseFlags(rest.slice(1));
          await uploadGet(client2, id, flags.out);
          return;
        }
        default:
          fail(`upload: unknown subcommand "${sub}"`, true);
      }
    } else if (group === "rest") {
      const openApiPath = resolve(process.cwd(), "packages", "shared", "openapi", "openapi.yaml");
      const index = loadOpenApi(openApiPath);
      switch (sub) {
        case "list": {
          restList(index, console);
          return;
        }
        case "describe": {
          const opId = rest[0];
          if (!opId) fail("rest describe: missing <operationId>", true);
          restDescribe(index, opId, console);
          return;
        }
        default:
          fail(`rest: unknown subcommand "${sub}"`, true);
      }
    } else {
      fail(group ? `unknown group "${group}"` : "missing group", true);
    }
  } catch (e) {
    console.error("aura failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
main().catch((e) => {
  console.error("aura failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
