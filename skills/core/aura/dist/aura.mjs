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
    const type = e.type.toLowerCase();
    const text = e.text.toLowerCase();
    return type.includes("islocked") || type.includes("locked") || text.includes("locked") || text.includes("not unlocked") || text.includes("user interaction");
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
import { mkdirSync, writeFileSync, readFileSync as readFileSync2, rmSync, existsSync as existsSync3, readdirSync, statSync as statSync2 } from "node:fs";
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
  if (["application/", "audio/", "image/", "video/"].some((type) => cleanContent.startsWith(type))) {
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
  node aura.mjs upload get <upload-uuid> [--out <path>]          parsed text to file (or stdout if small)`;
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
  return JSON.parse(readFileSync2(p, "utf8"));
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
  const body = readFileSync2(bodyPath, "utf8");
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
    body = readFileSync2(opts.bodyFile, "utf8");
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
  const body = readFileSync2(bodyPath, "utf8");
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
  const buf = readFileSync2(opts.file);
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
  const client2 = await createDefaultAuraClient();
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
