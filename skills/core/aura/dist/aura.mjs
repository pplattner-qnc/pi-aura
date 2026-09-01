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

// ../packages/shared/src/embed/provider.ts
var provider_exports = {};
__export(provider_exports, {
  createEmbedProvider: () => createEmbedProvider,
  loadEmbedSettings: () => loadEmbedSettings
});
import { readFileSync as readFileSync4, existsSync as existsSync3 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join3 } from "node:path";
function loadEmbedSettings(settingsPath = SETTINGS_PATH2) {
  let settings = {};
  try {
    if (existsSync3(settingsPath)) {
      const raw = readFileSync4(settingsPath, "utf8");
      settings = JSON.parse(raw);
    }
  } catch {
  }
  const embed = settings.aura?.embed ?? {};
  return {
    provider: process.env.AURA_EMBED_PROVIDER || embed.provider || void 0,
    model: process.env.AURA_EMBED_MODEL || embed.model || void 0,
    apiKey: process.env.AURA_EMBED_API_KEY || embed.apiKey || void 0,
    baseURL: process.env.AURA_EMBED_BASE_URL || embed.baseURL || void 0
  };
}
async function createEmbedProvider(config, opts = {}) {
  const { provider, model, apiKey, baseURL } = config;
  if (!provider || !model || !apiKey) {
    return null;
  }
  if (provider !== "openai") {
    return null;
  }
  if (!baseURL) {
    return null;
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    modelId: model,
    async embed(texts) {
      const url = `${baseURL}/embeddings`;
      const resp = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, input: texts })
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(
          `embed: HTTP ${resp.status} from ${url}` + (body ? ` \u2014 ${body.slice(0, 200)}` : "")
        );
      }
      const json2 = await resp.json();
      return json2.data.map((d) => new Float32Array(d.embedding));
    }
  };
}
var SETTINGS_PATH2;
var init_provider = __esm({
  "../packages/shared/src/embed/provider.ts"() {
    "use strict";
    SETTINGS_PATH2 = join3(homedir3(), ".pi", "agent", "settings.json");
  }
});

// src/aura.ts
import { mkdirSync, writeFileSync, readFileSync as readFileSync5, rmSync, existsSync as existsSync4, readdirSync, statSync as statSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join4, resolve } from "node:path";
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

// ../packages/shared/src/aura-credentials.ts
async function resolveAuraCredentials(opts = {}) {
  const settings = loadAuraClientSettings(opts.settingsPath);
  if (!settings.baseUrl) {
    throw new Error(
      'Missing `aura.baseUrl` in ~/.pi/agent/settings.json. Add the Aura REST API base URL (e.g. "https://aura.dev-anwalt.de/api") to the `aura` block.'
    );
  }
  const keyring = opts.keyring ?? await createKeyring();
  const pat = await keyring.getSecret({ service: "aura", name: "pat" });
  if (pat === null) {
    throw new Error(
      'No Aura PAT found in the OS keyring. Run `/aura secrets discover` to store one (service: "aura", name: "pat").'
    );
  }
  return { baseUrl: settings.baseUrl, pat };
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
  const { baseUrl, pat } = await resolveAuraCredentials();
  const keyring = await createKeyring();
  return new HeyApiAuraClient({ keyring, baseUrl, pat });
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

// ../packages/shared/src/rest/fts.ts
function tokenize(text) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}
var K1 = 1.5;
var B = 0.75;
function bm25Search(index, query, k) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || index.docCount === 0) return [];
  const hits = [];
  for (const doc of index.docs) {
    let score = 0;
    const matched = [];
    for (const term of queryTerms) {
      const tf = doc.terms[term] ?? 0;
      if (tf === 0) continue;
      const df = index.docFreq[term] ?? 0;
      const idf = Math.log(
        (index.docCount - df + 0.5) / (df + 0.5) + 1
      );
      const tfNorm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * (doc.length / index.avgDocLength)));
      score += idf * tfNorm;
      matched.push(term);
    }
    if (matched.length > 0) {
      hits.push({ operationId: doc.operationId, score, terms: matched });
    }
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.operationId.localeCompare(b.operationId);
  });
  if (k !== void 0) return hits.slice(0, k);
  return hits;
}
function rrfMerge(rankings, k = 60) {
  const scores = /* @__PURE__ */ new Map();
  for (const ranking of rankings) {
    for (let i = 0; i < ranking.length; i++) {
      const id = ranking[i];
      const rank = i + 1;
      const rrfScore = 1 / (k + rank);
      scores.set(id, (scores.get(id) ?? 0) + rrfScore);
    }
  }
  return scores;
}

// src/closest-match.ts
function closestMatches(fts, ids, query, max = 5) {
  if (fts) {
    const hits = bm25Search(fts, query, max);
    if (hits.length > 0) {
      return hits.map((h) => h.operationId);
    }
  }
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
function restDescribe(index, opId, out, fts) {
  const op = index[opId];
  if (!op) {
    const ids = Object.keys(index);
    const matches = closestMatches(fts, ids, opId);
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

// src/rest-call.ts
import { readFileSync as readFileSync3 } from "node:fs";

// ../packages/shared/src/rest/build-request.ts
function buildRequest(op, params, body) {
  let urlPath = op.path;
  const templateNames = extractPathParamNames(op.path);
  const providedPathKeys = /* @__PURE__ */ new Set();
  for (const name of templateNames) {
    const val = params[name];
    if (val === void 0) {
      throw new Error(
        `Missing required path param "${name}" for operation "${op.operationId}".`
      );
    }
    if (Array.isArray(val)) {
      throw new Error(
        `Path param "${name}" for operation "${op.operationId}" must be a single value, got an array.`
      );
    }
    urlPath = urlPath.replace(`{${name}}`, encodeURIComponent(val));
    providedPathKeys.add(name);
  }
  const queryParamNames = new Set(op.queryParams.map((p) => p.name));
  for (const key of Object.keys(params)) {
    if (!templateNames.includes(key) && !queryParamNames.has(key)) {
      throw new Error(
        `Extra param "${key}" is not a path or query param of operation "${op.operationId}".`
      );
    }
    if (templateNames.includes(key)) {
      providedPathKeys.add(key);
    }
  }
  const queryParts = [];
  for (const qp of op.queryParams) {
    const val = params[qp.name];
    if (val === void 0) continue;
    queryParts.push(serializeQueryParam(qp, val));
  }
  const query = queryParts.length > 0 ? "?" + queryParts.join("&") : "";
  const headers = {};
  let bodyStr;
  if (body !== void 0) {
    if (!op.body) {
      throw new Error(
        `Operation "${op.operationId}" does not declare a request body; remove the body argument.`
      );
    }
    bodyStr = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  } else {
    if (op.body?.required) {
      throw new Error(
        `Operation "${op.operationId}" requires a request body; provide one via --body-file or --body.`
      );
    }
  }
  return {
    method: op.method.toUpperCase(),
    urlPath,
    query,
    headers,
    body: bodyStr
  };
}
var SUPPORTED_QUERY_STYLES = /* @__PURE__ */ new Set(["form", void 0]);
function serializeQueryParam(param, val) {
  if (!Array.isArray(val)) {
    return `${encodeURIComponent(param.name)}=${encodeURIComponent(val)}`;
  }
  const style = param.style ?? "form";
  if (!SUPPORTED_QUERY_STYLES.has(style)) {
    throw new Error(
      `Unsupported query style "${style}" for param "${param.name}" in operation. Only "form" is supported.`
    );
  }
  if (param.explode === true) {
    return val.map((v) => `${encodeURIComponent(param.name)}=${encodeURIComponent(v)}`).join("&");
  }
  return `${encodeURIComponent(param.name)}=${val.map(encodeURIComponent).join(",")}`;
}

// src/rest-call.ts
function parseCallArgs(args) {
  const params = {};
  let bodyFile;
  let body;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--param") {
      const val = args[i + 1];
      if (val === void 0 || val.startsWith("--")) {
        throw new Error("rest call: --param requires a name=value argument");
      }
      const eqIdx = val.indexOf("=");
      if (eqIdx === -1) {
        throw new Error(`rest call: --param "${val}" must be in name=value format`);
      }
      const name = val.slice(0, eqIdx);
      const value = val.slice(eqIdx + 1);
      if (!params[name]) params[name] = [];
      params[name].push(value);
      i++;
    } else if (a === "--body-file") {
      const val = args[i + 1];
      if (val === void 0 || val.startsWith("--")) {
        throw new Error("rest call: --body-file requires a file path argument");
      }
      if (body !== void 0) {
        throw new Error("rest call: --body and --body-file are mutually exclusive");
      }
      bodyFile = val;
      i++;
    } else if (a === "--body") {
      const val = args[i + 1];
      if (val === void 0 || val.startsWith("--")) {
        throw new Error("rest call: --body requires a JSON string argument");
      }
      if (bodyFile !== void 0) {
        throw new Error("rest call: --body and --body-file are mutually exclusive");
      }
      body = val;
      i++;
    }
  }
  return { params, bodyFile, body };
}
var PRETTY_PRINT_THRESHOLD = 5e3;
async function restCall(index, credentials, args, out, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const op = index[args.operationId];
  if (!op) {
    const ids = Object.keys(index);
    const matches = closestMatches(opts.fts, ids, args.operationId);
    out.error(`Error: unknown operationId "${args.operationId}".`);
    if (matches.length > 0) {
      out.error(`Closest matches:`);
      for (const m of matches) out.error(`  ${m}`);
    }
    process.exit(2);
  }
  let body;
  if (args.body !== void 0) {
    body = args.body;
  }
  const buildParams = {};
  for (const [key, values] of Object.entries(args.params)) {
    buildParams[key] = values.length === 1 ? values[0] : values;
  }
  const request = buildRequest(op, buildParams, body);
  const url = `${credentials.baseUrl}${request.urlPath}${request.query}`;
  const headers = {
    Authorization: `Bearer ${credentials.pat}`,
    ...request.headers
  };
  const response = await fetchImpl(url, {
    method: request.method,
    headers,
    body: request.body
  });
  const responseText = await response.text();
  if (!response.ok) {
    out.error(`HTTP ${response.status}: ${responseText}`);
    process.exit(1);
  }
  let output;
  if (responseText.length <= PRETTY_PRINT_THRESHOLD) {
    try {
      const parsed = JSON.parse(responseText);
      output = JSON.stringify(parsed, null, 2);
    } catch {
      output = responseText;
    }
  } else {
    output = responseText;
  }
  out.log(output);
}
function resolveBody(args) {
  if (args.bodyFile) {
    const raw = readFileSync3(args.bodyFile, "utf8");
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`rest call: --body-file "${args.bodyFile}" is not valid JSON: ${e.message}`);
    }
  }
  if (args.body !== void 0) {
    try {
      return JSON.parse(args.body);
    } catch (e) {
      throw new Error(`rest call: --body is not valid JSON: ${e.message}`);
    }
  }
  return void 0;
}

// ../packages/shared/src/embed/cosine.ts
function quantizeToInt8(vec) {
  let maxAbs = 0;
  for (let i = 0; i < vec.length; i++) {
    const a = Math.abs(vec[i]);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs === 0) return new Int8Array(vec.length);
  const scale = 127 / maxAbs;
  const result = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    result[i] = Math.max(-128, Math.min(127, Math.round(vec[i] * scale)));
  }
  return result;
}
function cosineSim(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}
function cosineRank(queryVec, opVecs, dtype) {
  let q = queryVec;
  if (dtype === "i8" && queryVec instanceof Float32Array) {
    q = quantizeToInt8(queryVec);
  }
  const hits = [];
  for (const op of opVecs) {
    const score = cosineSim(q, op.vec);
    hits.push({ operationId: op.operationId, score });
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.operationId.localeCompare(b.operationId);
  });
  return hits;
}

// src/rest-search.ts
async function restSearch(index, query, out, opts = {}) {
  const limit = opts.limit ?? 10;
  const ftsHits = bm25Search(index.fts, query, limit);
  const ftsRanking = ftsHits.map((h) => h.operationId);
  const ftsHitMap = new Map(ftsHits.map((h) => [h.operationId, h]));
  let semanticRanking = [];
  let semanticActive = false;
  const provider = opts.embedProvider ?? null;
  if (!provider) {
    out.error("semantic leg skipped (no embedding provider) \u2014 FTS-only results");
  } else if (!index.embedModelId || !index.vectors) {
    out.error(
      `semantic leg skipped (index has no vectors, embedModelId is null) \u2014 FTS-only results`
    );
  } else if (provider.modelId !== index.embedModelId) {
    out.error(
      `semantic leg skipped: index built with "${index.embedModelId}", runtime provider is "${provider.modelId}" \u2014 FTS-only results`
    );
  } else {
    try {
      const queryVec = await provider.embed([query]);
      const dtype = index.dtype ?? "f32";
      const opVecs = index.vectors.map((v) => ({
        operationId: v.operationId,
        vec: v.vec
      }));
      const cosineHits = cosineRank(queryVec[0], opVecs, dtype);
      semanticRanking = cosineHits.slice(0, limit).map((h) => h.operationId);
      semanticActive = true;
    } catch (err) {
      out.error(
        `semantic leg skipped (embed error: ${err instanceof Error ? err.message : String(err)}) \u2014 FTS-only results`
      );
    }
  }
  const rankings = [];
  if (semanticActive && semanticRanking.length > 0) {
    rankings.push(semanticRanking);
  }
  rankings.push(ftsRanking);
  const merged = rrfMerge(rankings);
  if (merged.size === 0) {
    out.log("No results found.");
    return;
  }
  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit);
  for (let i = 0; i < top.length; i++) {
    const [opId, fusedScore] = top[i];
    const ftsHit = ftsHitMap.get(opId);
    const inSemantic = semanticActive && semanticRanking.includes(opId);
    const inFts = ftsHit !== void 0;
    let leg;
    if (inSemantic && inFts) {
      leg = "both";
    } else if (inSemantic) {
      leg = "semantic";
    } else {
      leg = "FTS";
    }
    const termsStr = ftsHit ? ftsHit.terms.join(", ") : "";
    const termsPart = termsStr ? `, terms: ${termsStr}` : "";
    out.log(
      `${i + 1}. ${opId}  (leg: ${leg}, fused: ${fusedScore.toFixed(6)}${termsPart})`
    );
  }
}

// src/generated/rest-index.ts
var REST_INDEX = { "version": 1, "metadata": [{ "operationId": "abortOwnerSearch", "method": "post", "path": "/tasks/{uuid}/owner-search/abort", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "OwnerSearchAssign", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Abort owner search", "responses": [{ "code": "200", "description": "Owner search aborted; owner set", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is not in owner search, or has no owner to resume with.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "acceptArtifactMemory", "method": "post", "path": "/artifacts/{id}/accept-memory", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: Accept into memory", "responses": [{ "code": "200", "description": "Content unchanged \u2014 ingest skipped", "schemaRef": "AcceptArtifactMemoryResponse" }, { "code": "202", "description": "Memory ingest enqueued", "schemaRef": "AcceptArtifactMemoryResponse" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "acceptTaskStoryPointEstimate", "method": "post", "path": "/tasks/{uuid}/story-points/accept", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID (must match the proposal)" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "StoryPointAcceptInput", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Accept a chat-proposed story-point estimate", "responses": [{ "code": "200", "description": "Task detail after the estimate was accepted", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "addArtifactReviewer", "method": "post", "path": "/artifacts/{id}/review-reviewers", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ArtifactReviewAddReviewerRequest", "required": true }, "tags": ["Artifacts"], "summary": "Artifacts: Add reviewer mid-run", "responses": [{ "code": "201", "description": "Created \u2014 reviewer added" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Reviewer already assigned for this version" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "addTaskMember", "method": "post", "path": "/tasks/{uuid}/members", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskMemberRef", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Add member", "responses": [{ "code": "200", "description": "Member added; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "addUserGroupMember", "method": "post", "path": "/user-groups/{uuid}/members", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "UserGroupMemberAddInput", "required": true }, "tags": ["UserGroups"], "summary": "UserGroups: Add member", "responses": [{ "code": "200", "description": "The updated user group with its members", "schemaRef": "UserGroupDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "aiSetup", "method": "get", "path": "/mcp/blueprint/setup", "pathParams": [], "queryParams": [], "tags": ["MCP"], "summary": "Bootstrap an empty house repository from the wiki blueprint", "responses": [{ "code": "200", "description": "Current ai-setup skill, inline manifest, and fetch instruction", "schemaRef": "AiSetupResponse" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "applyAsCrew", "method": "post", "path": "/tasks/{uuid}/crew-search/apply", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskCrewRequestCreate", "required": false }, "tags": ["Tasks"], "summary": "Tasks: Apply as crew", "responses": [{ "code": "200", "description": "Crew application recorded", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is not looking for crew.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "applyForOwner", "method": "post", "path": "/tasks/{uuid}/owner-search/applications", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskOwnerApplicationCreate", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Apply as owner", "responses": [{ "code": "200", "description": "Application recorded", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is not looking for an owner.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "approveGlossaryEntry", "method": "post", "path": "/glossary/{uuid}/approve", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Glossary"], "summary": "Glossary: Approve a pending proposal (admin-only)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "GlossaryEntry" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "approveOntologyProposal", "method": "post", "path": "/ontology-proposals/{uuid}/approve", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["OntologyProposals"], "summary": "Ontology: Approve proposal (admin)", "responses": [{ "code": "200", "description": "Approval accepted", "schemaRef": "OntologyProposalApproveResult" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "assignOwnerFromSearch", "method": "post", "path": "/tasks/{uuid}/owner-search/owner", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "OwnerSearchAssign", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Assign owner during owner search", "responses": [{ "code": "200", "description": "Owner assigned", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is not in owner search.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "assignTaskToProject", "method": "post", "path": "/projects/{uuid}/tasks", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Project UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ProjectTaskAssign", "required": true }, "tags": ["Projects"], "summary": "Projects: Assign task", "responses": [{ "code": "200", "description": "Assignment result", "schemaRef": "ProjectTaskAssignResult" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "attachTagToTask", "method": "post", "path": "/tasks/{uuid}/tags", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskTagAttach", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Attach a tag", "responses": [{ "code": "200", "description": "Tag attached; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "batchUpsertTaskPhaseGoals", "method": "put", "path": "/tasks/{uuid}/phase-goals", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskPhaseGoalBatchUpsert", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Batch-save phase goals (deadline + text) for intermediate goals", "responses": [{ "code": "200", "description": "Phase goals saved; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "cancelArtifactReview", "method": "post", "path": "/artifacts/{id}/review-cancel", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ArtifactReviewVersionRequest", "required": true }, "tags": ["Artifacts"], "summary": "Artifacts: Cancel review", "responses": [{ "code": "204", "description": "No Content" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "cancelRun", "method": "post", "path": "/runs/{uuid}/cancel", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Runs"], "summary": "Runs: Cancel a running run (admin)", "responses": [{ "code": "200", "description": "Cancel accepted (status CANCELLING) or already CANCELLING (idempotent)", "schemaRef": "CancelRunResult" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Run is already in a terminal state (SUCCEEDED, FAILED, or CANCELLED)", "schemaRef": "ProblemDetail" }] }, { "operationId": "changeFeedbackStatus", "method": "patch", "path": "/feedback/{uuid}/status", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Feedback UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "FeedbackStatusChange", "required": true }, "tags": ["Feedback"], "summary": "Feedback: Change status", "responses": [{ "code": "200", "description": "Updated", "schemaRef": "FeedbackDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "clearTaskAsap", "method": "delete", "path": "/tasks/{uuid}/asap", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Clear ASAP", "responses": [{ "code": "200", "description": "ASAP cleared", "schemaRef": "TaskAsapState" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "confirmAsanaLink", "method": "post", "path": "/integrations/asana/link", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaInline": { "type": "object", "required": ["toolCallId"], "properties": { "toolCallId": { "type": "string", "format": "uuid", "description": "UUID of the ChatToolCall record created by asana_propose_link" } } }, "required": true }, "tags": ["Asana"], "summary": "Asana: Confirm a proposed link", "responses": [{ "code": "200", "description": "Link confirmed (or already confirmed for this toolCallId)", "schemaRef": "AsanaLinkResult" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "The Asana object is already linked to a different task", "schemaRef": "AsanaLinkConflict" }] }, { "operationId": "confirmCrewRemoval", "method": "post", "path": "/tasks/{uuid}/crew-search/removal/confirm", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskCrewRemovalAction", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Confirm crew removal", "responses": [{ "code": "200", "description": "Crew removal confirmed", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "No pending crew removal exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "confirmFeedback", "method": "post", "path": "/feedback/confirm", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "FeedbackConfirm", "required": true }, "tags": ["Feedback"], "summary": "Feedback: Confirm a chat proposal", "responses": [{ "code": "200", "description": "Already created for this toolCallId", "schemaRef": "FeedbackConfirmResult" }, { "code": "201", "description": "Created", "schemaRef": "FeedbackConfirmResult" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "confirmSkillImport", "method": "post", "path": "/skills/import/confirm", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "SkillImportConfirmRequest", "required": true }, "tags": ["Skills"], "summary": "Confirm import of selected skills and start background indexing", "responses": [{ "code": "202", "description": "Import accepted; indexing started in background", "schemaRef": "SkillImportRun" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "import_token not found or expired" }] }, { "operationId": "createAsanaTaskForTask", "method": "post", "path": "/tasks/{uuid}/asana-tasks/create", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Create the Asana counterpart", "responses": [{ "code": "200", "description": "Asana object created and linked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Asana not connected, token invalid, or task already linked", "schemaRef": "AsanaTaskCreateProblemDetail" }, { "code": "422", "description": "No Asana target could be derived from the task's ancestors", "schemaRef": "AsanaTaskCreateProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }, { "code": "502", "description": "Upstream Asana error", "schemaRef": "AsanaTaskCreateProblemDetail" }] }, { "operationId": "createComment", "method": "post", "path": "/comments", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "CreateCommentRequest", "required": true }, "tags": ["Comments"], "summary": "Comments: Create", "responses": [{ "code": "201", "description": "Comment created", "schemaRef": "Comment" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createFeedback", "method": "post", "path": "/feedback", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "FeedbackCreate", "required": true }, "tags": ["Feedback"], "summary": "Feedback: Create", "responses": [{ "code": "201", "description": "Created", "schemaRef": "FeedbackDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createGlossaryEntry", "method": "post", "path": "/glossary", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "GlossaryEntryCreate", "required": true }, "tags": ["Glossary"], "summary": "Glossary: Create", "responses": [{ "code": "201", "description": "Created", "schemaRef": "GlossaryEntry" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Term already exists", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createKnowledgeNode", "method": "post", "path": "/knowledge/spaces/{slug}/nodes", "pathParams": [{ "name": "slug", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "KnowledgeNodeCreate", "required": true }, "tags": ["knowledge"], "summary": "Create a folder or document node", "responses": [{ "code": "201", "description": "Created node", "schemaRef": "KnowledgeNode" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createKnowledgeSpace", "method": "post", "path": "/knowledge/spaces", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "KnowledgeSpaceCreate", "required": true }, "tags": ["knowledge"], "summary": "Create a knowledge space", "responses": [{ "code": "201", "description": "Created knowledge space", "schemaRef": "KnowledgeSpace" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createMcpAccessToken", "method": "post", "path": "/me/mcp-tokens", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "CreateMcpAccessTokenRequest", "required": true }, "tags": ["MCP"], "summary": "Me: Create MCP access token", "responses": [{ "code": "201", "description": "Created", "schemaRef": "CreateMcpAccessTokenResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createProject", "method": "post", "path": "/projects", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ProjectCreate", "required": true }, "tags": ["Projects"], "summary": "Projects: Create", "responses": [{ "code": "201", "description": "Created", "schemaRef": "ProjectDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createRepository", "method": "post", "path": "/repositories", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "RepositoryCreate", "required": true }, "tags": ["Repositories"], "summary": "Repositories: Create", "responses": [{ "code": "201", "description": "Created", "schemaRef": "Repository" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createSkill", "method": "post", "path": "/skills", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "SkillCreate", "required": true }, "tags": ["Skills"], "summary": "Create a skill", "responses": [{ "code": "201", "description": "Created skill", "schemaRef": "Skill" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createTask", "method": "post", "path": "/tasks", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskCreate", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Create", "responses": [{ "code": "201", "description": "Task created", "schemaRef": "TaskListItem" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "422", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createTaskFromSignal", "method": "post", "path": "/signals/{uuid}/create-task", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["Signals"], "summary": "Signals: Create task from signal", "responses": [{ "code": "200", "description": "OK (existing link) or created", "schemaRef": "SignalCreateTaskResponse" }, { "code": "201", "description": "Task created", "schemaRef": "SignalCreateTaskResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createTaskJiraIssue", "method": "post", "path": "/tasks/{uuid}/jira-issues/create", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskJiraIssueCreateRequest", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Create and link a Jira issue", "responses": [{ "code": "200", "description": "Task was already linked by a concurrent request; no new issue was created", "schemaRef": "TaskJiraIssueCreateResult" }, { "code": "201", "description": "Jira issue created and linked", "schemaRef": "TaskJiraIssueCreateResult" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Jira is not connected for this user", "schemaRef": "TaskJiraIssueCreateProblemDetail" }, { "code": "422", "description": "Task is a saga, or the upstream Jira creation failed", "schemaRef": "TaskJiraIssueCreateProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createTaskRelation", "method": "post", "path": "/tasks/{uuid}/relations", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID (source of the relation)" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskRelationCreate", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Create a relation", "responses": [{ "code": "200", "description": "Relation created; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Relation already exists (duplicate)", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "createUserGroup", "method": "post", "path": "/user-groups", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "UserGroupCreateInput", "required": true }, "tags": ["UserGroups"], "summary": "UserGroups: Create", "responses": [{ "code": "200", "description": "The created user group", "schemaRef": "UserGroupDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "debugTriggerTaskActivity", "method": "post", "path": "/tasks/{uuid}/activity/debug", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: DEBUG \u2014 fire sample activity event", "responses": [{ "code": "200", "description": "Activity event created" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "declineCrewRemoval", "method": "post", "path": "/tasks/{uuid}/crew-search/removal/decline", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskCrewRemovalAction", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Decline crew removal", "responses": [{ "code": "200", "description": "Crew removal declined", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "No pending crew removal exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteArtifact", "method": "delete", "path": "/artifacts/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: Delete (soft-delete, owner-only)", "responses": [{ "code": "204", "description": "Artifact soft-deleted" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteComment", "method": "delete", "path": "/comments/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["Comments"], "summary": "Comments: Delete", "responses": [{ "code": "204", "description": "Deleted" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteGlossaryEntry", "method": "delete", "path": "/glossary/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["Glossary"], "summary": "Glossary: Delete", "responses": [{ "code": "204", "description": "Deleted" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteKnowledgeNode", "method": "delete", "path": "/knowledge/nodes/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["knowledge"], "summary": "Delete a node (cascades to children, versions and file assets)", "responses": [{ "code": "204", "description": "Deleted" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteKnowledgeSpace", "method": "delete", "path": "/knowledge/spaces/{slug}", "pathParams": [{ "name": "slug", "required": true, "schema": {} }], "queryParams": [], "tags": ["knowledge"], "summary": "Delete a knowledge space (cascades to all nodes)", "responses": [{ "code": "204", "description": "Deleted" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteProject", "method": "delete", "path": "/projects/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["Projects"], "summary": "Projects: Hard delete", "responses": [{ "code": "204", "description": "Deleted" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteRepository", "method": "delete", "path": "/repositories/{source}/{workspace}/{slug}", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: Delete", "responses": [{ "code": "204", "description": "No Content" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteSkill", "method": "delete", "path": "/skills/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Skills"], "summary": "Delete a skill (owner only)", "responses": [{ "code": "204", "description": "Deleted" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteSkillAsset", "method": "delete", "path": "/skills/{uuid}/assets/{assetId}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }, { "name": "assetId", "required": true, "schema": {} }], "queryParams": [], "tags": ["Skills"], "summary": "Delete a skill asset (owner only)", "responses": [{ "code": "204", "description": "Deleted" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteSkillPlugin", "method": "delete", "path": "/skills/plugins/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Skills"], "summary": "Delete a skill plugin (admin only)", "responses": [{ "code": "200", "description": "Deleted", "schemaRef": "SkillPluginDeleteResult" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteTaskRelation", "method": "delete", "path": "/tasks/{uuid}/relations/{id}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID (source of the relation)" }, { "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Relation UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Delete a relation", "responses": [{ "code": "200", "description": "Relation deleted; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "deleteUserGroup", "method": "delete", "path": "/user-groups/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["UserGroups"], "summary": "UserGroups: Delete", "responses": [{ "code": "204", "description": "Deleted" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "detachTagFromTask", "method": "delete", "path": "/tasks/{uuid}/tags/{slug}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Tag slug" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Detach a tag", "responses": [{ "code": "200", "description": "Tag detached; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "disableRepositoryCodeSearch", "method": "delete", "path": "/repositories/{source}/{workspace}/{slug}/code-search", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: Disable code search", "responses": [{ "code": "204", "description": "Code search disabled" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "discardTask", "method": "post", "path": "/tasks/{uuid}/discard", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskDiscard", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Discard", "responses": [{ "code": "200", "description": "Task discarded", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is already in a terminal status.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "downloadKnowledgeFile", "method": "get", "path": "/knowledge/nodes/{uuid}/file", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [{ "name": "inline", "required": false, "schema": { "type": "boolean", "default": false }, "description": "Serve with Content-Disposition inline (for previews) instead of attachment." }, { "name": "version", "required": false, "schema": { "type": "integer" }, "description": "Fetch a specific past version by its number instead of the current one (AURA-1644)." }], "tags": ["knowledge"], "summary": "Download the bytes of a FILE node", "responses": [{ "code": "200", "description": "File bytes" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "downloadSkillAsset", "method": "get", "path": "/skills/{uuid}/assets/{assetId}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }, { "name": "assetId", "required": true, "schema": {} }], "queryParams": [], "tags": ["Skills"], "summary": "Download a skill asset", "responses": [{ "code": "200", "description": "Asset binary content" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "draftTaskRankReason", "method": "post", "path": "/tasks/{uuid}/rank-reason/draft", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Draft an ordering rationale", "responses": [{ "code": "200", "description": "Draft generated", "schemaRef": "TaskRankReasonDraft" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }, { "code": "502", "description": "The draft could not be generated.", "schemaRef": "ProblemDetail" }] }, { "operationId": "enableRepositoryCodeSearch", "method": "post", "path": "/repositories/{source}/{workspace}/{slug}/code-search", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: Enable code search", "responses": [{ "code": "200", "description": "Code search enabled" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "endCrewSearch", "method": "post", "path": "/tasks/{uuid}/crew-search/end", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: End crew search", "responses": [{ "code": "200", "description": "Crew search ended", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is not in crew search.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "estimateTaskStoryPoints", "method": "post", "path": "/tasks/{uuid}/story-points/estimate", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Run the AI story-point estimator", "responses": [{ "code": "200", "description": "Task detail after the estimate was written", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }, { "code": "502", "description": "The estimate could not be generated.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getActiveSkillImportRun", "method": "get", "path": "/skills/import/runs/active", "pathParams": [], "queryParams": [], "tags": ["Skills"], "summary": "Get the active skill import run for the current user", "responses": [{ "code": "200", "description": "Active run or null", "schemaRef": "ActiveSkillImportRun" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getArtifact", "method": "get", "path": "/artifacts/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: Get detail", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactDetail" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getArtifactAccessOverview", "method": "get", "path": "/artifacts/{id}/access-overview", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: Access overview (flat)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactAccessOverview" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getArtifactApprovals", "method": "get", "path": "/artifacts/{id}/approvals", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [{ "name": "version", "required": false, "schema": { "type": "integer", "minimum": 1 }, "description": "Version to query; defaults to latest" }], "tags": ["Artifacts"], "summary": "Artifacts: Get approval status", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactApprovalsResponse" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getArtifactReview", "method": "get", "path": "/artifacts/{id}/review", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: Get review overview", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactReviewOverview" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getArtifactReviewPreview", "method": "get", "path": "/artifacts/{id}/review-preview", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [{ "name": "roles", "required": false, "schema": { "type": "string" }, "description": 'Comma-separated list of TaskRole enum values to resolve reviewers from (e.g. "OWNER,CONTRIBUTOR")' }, { "name": "user_ids", "required": false, "schema": { "type": "string" }, "description": "Comma-separated list of user UUIDs to include as explicit reviewers" }], "tags": ["Artifacts"], "summary": "Artifacts: Preview review recipients", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactReviewPreview" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getArtifactReviseContext", "method": "get", "path": "/artifacts/{id}/review/revise-context", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: Get ReviseBot context", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactReviseContext" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getArtifactVersion", "method": "get", "path": "/artifacts/{id}/versions/{n}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }, { "name": "n", "required": true, "schema": { "type": "integer", "minimum": 1 }, "description": "Version number" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: Get version detail", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactVersionDetail" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getAsanaCreateTargetForTask", "method": "get", "path": "/tasks/{uuid}/asana-tasks/create-target", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Resolve where the Asana counterpart would be created", "responses": [{ "code": "200", "description": "Resolved Asana target", "schemaRef": "AsanaCreateTarget" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "The task already has an Asana counterpart", "schemaRef": "AsanaTaskCreateProblemDetail" }, { "code": "422", "description": "No Asana target could be derived from the task's ancestors", "schemaRef": "AsanaTaskCreateProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getAsanaStatus", "method": "get", "path": "/integrations/asana/status", "pathParams": [], "queryParams": [], "tags": ["Asana"], "summary": "Asana: Connection status", "responses": [{ "code": "200", "description": "Asana connection status", "schemaRef": "AsanaStatus" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getAsanaTask", "method": "get", "path": "/asana-tasks/{gid}", "pathParams": [{ "name": "gid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Asana"], "summary": "Asana Tasks: Get locally mirrored detail", "responses": [{ "code": "200", "description": "Asana task detail", "schemaRef": "AsanaTaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getBlueprintFiles", "method": "get", "path": "/mcp/blueprint/files", "pathParams": [], "queryParams": [{ "name": "path", "required": true, "schema": { "type": "string" }, "description": "Slash-separated path under blueprint/ (file or skill directory)." }, { "name": "version", "required": false, "schema": { "type": "string" }, "description": "Optional version pointer \u2014 sha256:<hex> checksum or integer latest_version." }], "tags": ["MCP"], "summary": "Fetch house-blueprint files by path", "responses": [{ "code": "200", "description": "JSON-safe file payloads with checksum and provenance", "schemaRef": "GetBlueprintFilesResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getBoardBriefing", "method": "get", "path": "/boards/briefing", "pathParams": [], "queryParams": [{ "name": "locale", "required": false, "schema": { "type": "string", "default": "de" }, "description": "Locale code for the generated text (e.g. 'de', 'en')." }, { "name": "refresh", "required": false, "schema": { "type": "boolean", "default": false }, "description": "When true, bypass the signature/TTL cache and regenerate the briefing via a fresh LLM call.\n" }], "tags": ["Boards"], "summary": "Boards: AI-generated personal briefing", "responses": [{ "code": "200", "description": "OK", "schemaRef": "BoardBriefing" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getBoardSummary", "method": "get", "path": "/boards", "pathParams": [], "queryParams": [], "tags": ["Boards"], "summary": "Boards: Personal attention summary", "responses": [{ "code": "200", "description": "OK", "schemaRef": "BoardSummary" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getCapacitySettings", "method": "get", "path": "/capacity/settings", "pathParams": [], "queryParams": [], "tags": ["Capacity"], "summary": "Capacity: Get company base capacity setting", "responses": [{ "code": "200", "description": "Company capacity settings", "schemaRef": "CapacitySettings" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getCommentImage", "method": "get", "path": "/comments/images/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["Comments"], "summary": "Comments: Get image", "responses": [{ "code": "200", "description": "Image binary" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getFeedback", "method": "get", "path": "/feedback/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Feedback UUID" }], "queryParams": [], "tags": ["Feedback"], "summary": "Feedback: Get detail", "responses": [{ "code": "200", "description": "OK", "schemaRef": "FeedbackDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getGlossaryEntry", "method": "get", "path": "/glossary/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["Glossary"], "summary": "Glossary: Get detail", "responses": [{ "code": "200", "description": "OK", "schemaRef": "GlossaryEntry" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getHealth", "method": "get", "path": "/health", "pathParams": [], "queryParams": [], "tags": ["Health"], "summary": "Health: Status check", "responses": [{ "code": "200", "description": "OK" }] }, { "operationId": "getJiraIssue", "method": "get", "path": "/jira-issues/{cloudId}/{issueKey}", "pathParams": [{ "name": "cloudId", "required": true, "schema": {} }, { "name": "issueKey", "required": true, "schema": {} }], "queryParams": [], "tags": ["JiraIssues"], "summary": "Jira Issues: Get locally mirrored detail (admin)", "responses": [{ "code": "200", "description": "Jira issue detail", "schemaRef": "JiraIssueDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getKnowledgeNode", "method": "get", "path": "/knowledge/nodes/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["knowledge"], "summary": "Get a single node (includes body for documents)", "responses": [{ "code": "200", "description": "Knowledge node", "schemaRef": "KnowledgeNode" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getKnowledgeNodeByPath", "method": "get", "path": "/knowledge/spaces/{slug}/nodes/by-path", "pathParams": [{ "name": "slug", "required": true, "schema": {} }], "queryParams": [], "tags": ["knowledge"], "summary": "Get a knowledge node by its slug path within a space", "responses": [{ "code": "200", "description": "The resolved node", "schemaRef": "KnowledgeNode" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getKnowledgeNodeImage", "method": "get", "path": "/knowledge/nodes/{uuid}/images/{imageId}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }, { "name": "imageId", "required": true, "schema": { "type": "string" } }], "queryParams": [], "tags": ["knowledge"], "summary": "Serve an image for a knowledge node", "responses": [{ "code": "200", "description": "Image binary" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getKnowledgeNodeVersion", "method": "get", "path": "/knowledge/nodes/{uuid}/versions/{version}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }, { "name": "version", "required": true, "schema": {} }], "queryParams": [], "tags": ["knowledge"], "summary": "Get a specific version of a document node", "responses": [{ "code": "200", "description": "Version detail", "schemaRef": "KnowledgeVersion" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getKnowledgeSpace", "method": "get", "path": "/knowledge/spaces/{slug}", "pathParams": [{ "name": "slug", "required": true, "schema": {} }], "queryParams": [], "tags": ["knowledge"], "summary": "Get a knowledge space by slug", "responses": [{ "code": "200", "description": "Knowledge space", "schemaRef": "KnowledgeSpace" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getKnowledgeTree", "method": "get", "path": "/knowledge/spaces/{slug}/nodes", "pathParams": [{ "name": "slug", "required": true, "schema": {} }], "queryParams": [{ "name": "depth", "required": false, "schema": { "type": "integer", "minimum": 0, "maximum": 2 }, "description": "Maximum tree depth below the roots. Omitted returns every level." }, { "name": "max_nodes", "required": false, "schema": { "type": "integer", "minimum": 1, "maximum": 200 }, "description": "Maximum number of nodes in the answer. Omitted returns all of them." }], "tags": ["knowledge"], "summary": "Get the full node tree for a space", "responses": [{ "code": "200", "description": "Node tree", "schemaRef": "KnowledgeTree" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getLlmTurnPayload", "method": "get", "path": "/llm-turns/{uuid}/payload", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["llm-turns"], "summary": "LLM Turns: Get payload", "responses": [{ "code": "200", "description": "OK", "schemaRef": "LlmTurnPayload" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getMemoryEntitySource", "method": "get", "path": "/memory/entities/{stable_id}/source", "pathParams": [{ "name": "stable_id", "required": true, "schema": { "type": "string" }, "description": 'Entity stable ID (e.g. "task:{uuid}" or "jira:anw-1234")' }], "queryParams": [], "tags": ["Memory"], "summary": "Memory: Resolve navigable source for an entity", "responses": [{ "code": "200", "description": "OK", "schemaRef": "MemoryEntitySource" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getMemoryGraph", "method": "get", "path": "/memory/graph", "pathParams": [], "queryParams": [{ "name": "anchor", "required": true, "schema": { "type": "string" }, "description": 'Entity stable ID to expand from (e.g. "service:plai-api")' }, { "name": "depth", "required": false, "schema": { "type": "integer", "default": 2, "minimum": 1, "maximum": 2 }, "description": "Traversal depth (1 = direct neighbours, 2 = two hops)" }, { "name": "include_candidates", "required": false, "schema": { "type": "boolean", "default": false }, "description": "When true, include candidate (inferred) edges in addition to confirmed" }, { "name": "include_superseded", "required": false, "schema": { "type": "boolean", "default": false }, "description": "When true, include superseded edges in addition to current edges" }, { "name": "entity_type", "required": false, "schema": {}, "description": "Filter to entities or nodes of this wiki-graph type" }, { "name": "edge_origin", "required": false, "schema": {}, "description": "Filter edges by provenance origin (knowledge graph vs mirrored operational links)" }, { "name": "fact_layer", "required": false, "schema": {}, "description": "Filter edges by fact layer" }, { "name": "confidence_min", "required": false, "schema": {}, "description": "Minimum confidence threshold for edges" }, { "name": "status", "required": false, "schema": {}, "description": "Filter edges by trust status" }, { "name": "sensitivity", "required": false, "schema": {}, "description": "Filter edges or entities by memory sensitivity label" }, { "name": "predicate", "required": false, "schema": { "type": "string" }, "description": "Filter edges to this predicate name" }], "tags": ["Memory"], "summary": "Memory: Graph expansion from anchor", "responses": [{ "code": "200", "description": "OK", "schemaRef": "MemoryGraph" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getMemoryMap", "method": "get", "path": "/memory/map", "pathParams": [], "queryParams": [{ "name": "level", "required": false, "schema": {}, "description": "Map detail level \u2014 overview (default) or drill into a cluster" }, { "name": "cluster_id", "required": false, "schema": { "type": "string" }, "description": 'Cluster identifier for drill-level requests (e.g. "cc:7")' }, { "name": "include_candidates", "required": false, "schema": { "type": "boolean", "default": false }, "description": "When true, include candidate (inferred) edges in addition to confirmed" }, { "name": "include_superseded", "required": false, "schema": { "type": "boolean", "default": false }, "description": "When true, include superseded edges in addition to current edges" }, { "name": "entity_type", "required": false, "schema": {}, "description": "Filter to entities or nodes of this wiki-graph type" }, { "name": "edge_origin", "required": false, "schema": {}, "description": "Filter edges by provenance origin (knowledge graph vs mirrored operational links)" }, { "name": "fact_layer", "required": false, "schema": {}, "description": "Filter edges by fact layer" }, { "name": "confidence_min", "required": false, "schema": {}, "description": "Minimum confidence threshold for edges" }, { "name": "status", "required": false, "schema": {}, "description": "Filter edges by trust status" }, { "name": "sensitivity", "required": false, "schema": {}, "description": "Filter edges or entities by memory sensitivity label" }, { "name": "predicate", "required": false, "schema": { "type": "string" }, "description": "Filter edges to this predicate name" }], "tags": ["Memory"], "summary": "Memory: Cluster map overview", "responses": [{ "code": "200", "description": "OK", "schemaRef": "MemoryMap" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getMyCapacity", "method": "get", "path": "/capacity/me", "pathParams": [], "queryParams": [], "tags": ["Capacity"], "summary": "Capacity: My own capacity", "responses": [{ "code": "200", "description": "The user's own capacity summary", "schemaRef": "CapacityPersonal" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getMyPriorityQueue", "method": "get", "path": "/tasks/my-priority", "pathParams": [], "queryParams": [{ "name": "limit", "required": false, "schema": { "type": "integer", "minimum": 1, "maximum": 100 }, "description": "Maximum number of queue entries. Omitted returns the whole queue; `total` and `unordered_count` always describe the whole queue, so a bounded answer says how much it left out." }], "tags": ["Tasks"], "summary": "Tasks: My derived priority order", "responses": [{ "code": "200", "description": "The caller's derived priority order", "schemaRef": "MyPriorityQueue" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getNotificationPreferences", "method": "get", "path": "/notifications/preferences", "pathParams": [], "queryParams": [], "tags": ["Notifications"], "summary": "Notifications: Get preference matrix", "responses": [{ "code": "200", "description": "OK", "schemaRef": "NotificationPreferencesMatrix" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getPersonPriorityQueue", "method": "get", "path": "/tasks/members/{userIdOrUuid}/priority", "pathParams": [{ "name": "userIdOrUuid", "required": true, "schema": { "type": "string" }, "description": "User integer ID or UUID of the target person." }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: A person's derived priority order, filtered to the caller's access", "responses": [{ "code": "200", "description": "The target person's derived priority order, as the caller may read it", "schemaRef": "PersonPriorityQueue" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getProject", "method": "get", "path": "/projects/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Project UUID" }], "queryParams": [], "tags": ["Projects"], "summary": "Projects: Get detail", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ProjectDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getProjectTaskTree", "method": "get", "path": "/projects/{uuid}/tasks", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["Projects"], "summary": "Projects: Task tree", "responses": [{ "code": "200", "description": "Nested task tree", "schemaRef": "ProjectTaskTree" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getRepository", "method": "get", "path": "/repositories/{source}/{workspace}/{slug}", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: Get detail", "responses": [{ "code": "200", "description": "OK", "schemaRef": "RepositoryDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getRepositoryRunStatus", "method": "get", "path": "/repositories/{source}/{workspace}/{slug}/run-status", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: Get current run status", "responses": [{ "code": "200", "description": "OK", "schemaRef": "RepositoryRunStatus" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getRepositorySyncHistory", "method": "get", "path": "/repositories/{source}/{workspace}/{slug}/sync-history", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: Get recent sync runs", "responses": [{ "code": "200", "description": "OK", "schemaRef": "RepositorySyncHistory" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getRun", "method": "get", "path": "/runs/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Runs"], "summary": "Runs: Get run detail (admin)", "responses": [{ "code": "200", "description": "Run detail", "schemaRef": "RunDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getSignal", "method": "get", "path": "/signals/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["Signals"], "summary": "Signals: Get detail", "responses": [{ "code": "200", "description": "OK", "schemaRef": "SignalDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getSkill", "method": "get", "path": "/skills/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Skills"], "summary": "Get a skill", "responses": [{ "code": "200", "description": "Skill detail including body", "schemaRef": "Skill" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getSkillImportRun", "method": "get", "path": "/skills/import/runs/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Skills"], "summary": "Poll the status of a skill import run", "responses": [{ "code": "200", "description": "Run status", "schemaRef": "SkillImportRun" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTask", "method": "get", "path": "/tasks/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Get detail", "responses": [{ "code": "200", "description": "OK", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskBoard", "method": "get", "path": "/tasks/board", "pathParams": [], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Board diagram data (unpaginated)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "TaskBoard" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskByHumanKey", "method": "get", "path": "/tasks/by-key/{key}", "pathParams": [{ "name": "key", "required": true, "schema": { "type": "string" }, "description": 'Human-readable task identifier, e.g. "AURA-42"' }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Get by human-readable key", "responses": [{ "code": "200", "description": "OK", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskByJiraKey", "method": "get", "path": "/tasks/by-jira-key/{key}", "pathParams": [{ "name": "key", "required": true, "schema": { "type": "string" }, "description": 'Jira issue key, e.g. "ANW-7577"' }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Get by Jira key", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpTaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskCycleTimes", "method": "get", "path": "/tasks/{uuid}/cycle-times", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Cycle times (stays on one task)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "TaskCycleTimes" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskGraph", "method": "get", "path": "/tasks/graph", "pathParams": [], "queryParams": [{ "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "tags", "required": false, "schema": { "type": "string" }, "description": "Comma-separated tag slugs to filter by" }, { "name": "tag_match", "required": false, "schema": { "type": "string", "enum": ["all", "any"], "default": "all" }, "description": "Whether all (AND) or any (OR) of the given tag slugs must match (default all)" }], "tags": ["Tasks"], "summary": "Tasks: Graph (nodes + edges, owner-scoped)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "TaskGraph" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskHierarchyGraph", "method": "get", "path": "/tasks/hierarchy-graph", "pathParams": [], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Hierarchy Graph (directed tree, owner-scoped)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "TaskGraph" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskJiraIssueDraft", "method": "get", "path": "/tasks/{uuid}/jira-issues/draft", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Preview the Jira issue a task would create", "responses": [{ "code": "200", "description": "Draft issue fields", "schemaRef": "TaskJiraIssueDraft" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task already has a linked Jira issue", "schemaRef": "TaskJiraIssueDraftProblemDetail" }, { "code": "422", "description": "Task is a saga (no Jira equivalent)", "schemaRef": "TaskJiraIssueDraftProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskMemberCapacity", "method": "get", "path": "/tasks/{uuid}/members/{userIdOrUuid}/capacity", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "userIdOrUuid", "required": true, "schema": { "type": "string" }, "description": "User integer ID or UUID" }], "queryParams": [], "tags": ["Capacity"], "summary": "Tasks: Get member capacity (cross-task)", "responses": [{ "code": "200", "description": "Person capacity for the target member", "schemaRef": "CapacityPersonal" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskNeighborhood", "method": "get", "path": "/tasks/{uuid}/neighborhood", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [{ "name": "depth", "required": false, "schema": { "type": "integer", "minimum": 0, "maximum": 2 }, "description": "Ancestor hops to include. Omitted returns the chain to the root." }], "tags": ["Tasks"], "summary": "Tasks: Hierarchy neighbourhood (scoped for the detail-view mini-map)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "TaskNeighborhoodGraph" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getTaskRankContext", "method": "get", "path": "/tasks/{uuid}/rank-context", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [{ "name": "scope", "required": false, "schema": { "type": "string", "enum": ["siblings", "children"], "default": "siblings" }, "description": "Which priority-ordering context to address (AURA-930). `siblings` (default) is the context the named task itself sits in; `children` is the context of its direct children (`task:<this>`).\n" }], "tags": ["Tasks"], "summary": "Tasks: Read the priority-ordering context", "responses": [{ "code": "200", "description": "Ordering context", "schemaRef": "TaskRankContext" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "getUserGroup", "method": "get", "path": "/user-groups/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["UserGroups"], "summary": "UserGroups: Get detail (with members)", "responses": [{ "code": "200", "description": "The user group with its members", "schemaRef": "UserGroupDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "grantArtifactAccess", "method": "post", "path": "/artifacts/{id}/grants", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ArtifactGrantRequest", "required": true }, "tags": ["Artifacts"], "summary": "Artifacts: Grant or update access", "responses": [{ "code": "200", "description": "OK \u2014 updated access overview", "schemaRef": "ArtifactAccessOverview" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "422", "description": "Unprocessable Entity \u2014 request is well-formed but semantically invalid.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "inviteCrew", "method": "post", "path": "/tasks/{uuid}/crew-search/invite", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskCrewInvite", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Invite crew", "responses": [{ "code": "200", "description": "Crew invitation recorded", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is not looking for crew.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "linkArtifactToTask", "method": "post", "path": "/tasks/{uuid}/artifacts", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskArtifactAttach", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Link an artifact", "responses": [{ "code": "200", "description": "Artifact linked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "linkAsanaTaskToTask", "method": "post", "path": "/tasks/{uuid}/asana-tasks", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskAsanaTaskAttach", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Link an Asana object", "responses": [{ "code": "200", "description": "Asana object linked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Asana object not found", "schemaRef": "AsanaTaskLinkProblemDetail" }, { "code": "409", "description": "Asana not connected, token invalid, or already linked", "schemaRef": "AsanaTaskLinkProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }, { "code": "502", "description": "Upstream Asana error", "schemaRef": "AsanaTaskLinkProblemDetail" }] }, { "operationId": "linkChatToTask", "method": "post", "path": "/tasks/{uuid}/chats", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskChatAttach", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Link a chat", "responses": [{ "code": "200", "description": "Chat linked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "linkFeedbackTask", "method": "post", "path": "/feedback/{uuid}/tasks", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Feedback UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "FeedbackTaskLink", "required": true }, "tags": ["Feedback"], "summary": "Feedback: Link a task", "responses": [{ "code": "200", "description": "Linked", "schemaRef": "FeedbackDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "linkJiraIssueToTask", "method": "post", "path": "/tasks/{uuid}/jira-issues", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskJiraIssueAttach", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Link a Jira issue", "responses": [{ "code": "200", "description": "Jira issue linked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Jira issue not found", "schemaRef": "JiraIssueLinkProblemDetail" }, { "code": "409", "description": "Jira not connected, token invalid, or already linked", "schemaRef": "JiraIssueLinkProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }, { "code": "502", "description": "Upstream Jira error", "schemaRef": "JiraIssueLinkProblemDetail" }] }, { "operationId": "linkRelatedFeedback", "method": "post", "path": "/feedback/{uuid}/related", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Feedback UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "FeedbackRelatedLink", "required": true }, "tags": ["Feedback"], "summary": "Feedback: Link a related entry", "responses": [{ "code": "200", "description": "Linked", "schemaRef": "FeedbackDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "linkRepositoryToProject", "method": "post", "path": "/projects/{uuid}/repositories", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ProjectRepositoryLink", "required": true }, "tags": ["Projects"], "summary": "Projects: Link repository", "responses": [{ "code": "200", "description": "Project detail after link", "schemaRef": "ProjectDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "linkRepositoryToTask", "method": "post", "path": "/tasks/{uuid}/repositories", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskRepositoryAttach", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Link a repository", "responses": [{ "code": "200", "description": "Repository linked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listAgentRunEvents", "method": "get", "path": "/runs/{uuid}/events", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Runs"], "summary": "Runs: List structured events for a run", "responses": [{ "code": "200", "description": "List of agent run events", "schemaRef": "AgentRunEventList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listArtifacts", "method": "get", "path": "/artifacts", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "shared", "required": false, "schema": { "type": "boolean" }, "description": "When true, returns only artifacts shared via task cascade (not directly owned)" }, { "name": "owned", "required": false, "schema": { "type": "boolean" }, "description": "When true, returns only artifacts directly owned by the current user (no task cascade)" }, { "name": "broad_shared", "required": false, "schema": { "type": "boolean" }, "description": "When true, returns only artifacts of a task carrying a direct company-wide or user access grant (excludes owned, direct-membership, and ancestor-membership artifacts, which surface in the default list instead)" }, { "name": "pending_review", "required": false, "schema": { "type": "boolean" }, "description": "When true, returns only artifacts where the current user has an open review obligation for the current version" }], "tags": ["Artifacts"], "summary": "Artifacts: List all (paginated)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listArtifactTasks", "method": "get", "path": "/artifacts/{id}/tasks", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: List linked tasks", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactTaskList" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listArtifactVersions", "method": "get", "path": "/artifacts/{id}/versions", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: List versions", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactVersionList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listAsanaMirrorProjects", "method": "get", "path": "/asana-tasks/projects", "pathParams": [], "queryParams": [], "tags": ["Asana"], "summary": "Asana: List mirrored projects (filter source)", "responses": [{ "code": "200", "description": "Distinct mirrored projects" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listAsanaProjects", "method": "get", "path": "/asana-tasks/asana-projects", "pathParams": [], "queryParams": [], "tags": ["Asana"], "summary": "Asana: List own projects (sync trigger selection, admin)", "responses": [{ "code": "200", "description": "Project selection, or an explanation why none is available", "schemaRef": "AsanaProjectSelection" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listAsanaTasks", "method": "get", "path": "/asana-tasks", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "project_gid", "required": false, "schema": { "type": "string" }, "description": "Filter by Asana project gid" }, { "name": "completed", "required": false, "schema": { "type": "boolean" }, "description": "When false (the default), only tasks not yet completed are returned. Pass true to include completed tasks as well." }, { "name": "gid", "required": false, "schema": { "type": "string" }, "description": "Exact Asana task gid match, used to resolve a deep-link. Distinct from `q`, which searches with `contains` across name and gid." }, { "name": "level", "required": false, "schema": { "type": "array", "items": {} }, "style": "form", "explode": true, "description": "Filter by derived Aura level, repeatable." }], "tags": ["Asana"], "summary": "Asana Tasks: List locally mirrored", "responses": [{ "code": "200", "description": "Paginated list of mirrored Asana tasks", "schemaRef": "AsanaTaskList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listChatArtifacts", "method": "get", "path": "/chats/{id}/artifacts", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Chat UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Chats: List artifacts", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ChatArtifactList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listChats", "method": "get", "path": "/chats", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "status", "required": false, "schema": {}, "description": "Filter by chat status" }, { "name": "shared", "required": false, "schema": { "type": "boolean" }, "description": "When true, returns only chats shared via task cascade (not directly owned)" }], "tags": ["Chats"], "summary": "Chats: List all", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ChatList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listComments", "method": "get", "path": "/comments", "pathParams": [], "queryParams": [{ "name": "entity_type", "required": true, "schema": {}, "description": "The entity type to filter by" }, { "name": "entity_id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "The public UUID of the entity" }, { "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }], "tags": ["Comments"], "summary": "Comments: List for an entity", "responses": [{ "code": "200", "description": "OK", "schemaRef": "CommentList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listDocRunModels", "method": "get", "path": "/repositories/doc-run-models", "pathParams": [], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: List doc-run models", "responses": [{ "code": "200", "description": "OK", "schemaRef": "DocRunModelList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listFeedback", "method": "get", "path": "/feedback", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "status", "required": false, "schema": {}, "description": "Exact status filter. When omitted, discarded entries are hidden." }, { "name": "source", "required": false, "schema": {}, "description": "Filter by how the entry arrived" }, { "name": "tags", "required": false, "schema": { "type": "string" }, "description": "Comma-separated tag slugs to filter by." }, { "name": "tag_match", "required": false, "schema": { "type": "string", "enum": ["all", "any"] }, "description": "Whether all (AND) or any (OR) of the given tag slugs must match. Default all." }], "tags": ["Feedback"], "summary": "Feedback: List (paginated)", "responses": [{ "code": "200", "description": "Paginated feedback list", "schemaRef": "FeedbackList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listGlossaryEntries", "method": "get", "path": "/glossary", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "category", "required": false, "schema": {}, "description": "Filter by category" }], "tags": ["Glossary"], "summary": "Glossary: List (paginated)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "GlossaryList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listJiraIssues", "method": "get", "path": "/jira-issues", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "team_id", "required": false, "schema": { "type": "string" }, "description": "Filter by team UUID (from JiraTeam / customfield_10001)" }, { "name": "status_category", "required": false, "schema": { "type": "string" }, "description": 'Comma-separated status category keys to filter by (e.g. "new,indeterminate"). No server-side default \u2014 omitting this parameter returns all categories.' }, { "name": "issue_key", "required": false, "schema": { "type": "string" }, "description": 'Exact issue key match (e.g. "ANW-7896"), used to resolve the ?issue=<key> deep-link. Distinct from `q`, which searches with `contains` across issueKey, summary, and status \u2014 a prefix would otherwise match unrelated tickets.' }], "tags": ["JiraIssues"], "summary": "Jira Issues: List locally mirrored (admin)", "responses": [{ "code": "200", "description": "Paginated list of Jira issues", "schemaRef": "JiraIssueList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listKnowledgeFiles", "method": "get", "path": "/knowledge/spaces/{slug}/files", "pathParams": [{ "name": "slug", "required": true, "schema": { "type": "string" } }], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Sort field" }, { "name": "parent_id", "required": false, "schema": { "type": "string", "format": "uuid" }, "description": "Only list files directly inside this folder node." }], "tags": ["knowledge"], "summary": "List the file nodes of a space", "responses": [{ "code": "200", "description": "List of files", "schemaRef": "KnowledgeFileList" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listKnowledgeFileVersions", "method": "get", "path": "/knowledge/nodes/{uuid}/file/versions", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["knowledge"], "summary": "List all versions of a FILE node's asset", "responses": [{ "code": "200", "description": "Version list", "schemaRef": "KnowledgeFileVersionList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listKnowledgeNodeVersions", "method": "get", "path": "/knowledge/nodes/{uuid}/versions", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["knowledge"], "summary": "List all versions of a document node", "responses": [{ "code": "200", "description": "Version list", "schemaRef": "KnowledgeVersionList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listKnowledgeSpaces", "method": "get", "path": "/knowledge/spaces", "pathParams": [], "queryParams": [], "tags": ["knowledge"], "summary": "List knowledge spaces", "responses": [{ "code": "200", "description": "List of knowledge spaces", "schemaRef": "KnowledgeSpaceList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listLeadershipCapacity", "method": "get", "path": "/capacity/leadership", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 200, "minimum": 1, "maximum": 200 }, "description": "Number of items per page (default 200 \u2014 company roster typically fits on one page)" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by (default utilization)" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }], "tags": ["Capacity"], "summary": "Capacity: Leadership overview (paginated, person-centric)", "responses": [{ "code": "200", "description": "Person-centric capacity overview", "schemaRef": "CapacityLeadershipList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listLlmTurns", "method": "get", "path": "/llm-turns", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "message_id", "required": false, "schema": { "type": "string", "format": "uuid" }, "description": "Filter by chat message UUID" }, { "name": "chat_id", "required": false, "schema": { "type": "string", "format": "uuid" }, "description": "Filter by chat UUID" }], "tags": ["llm-turns"], "summary": "LLM Turns: List", "responses": [{ "code": "200", "description": "OK", "schemaRef": "LlmTurnList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listLookingForCrewTasks", "method": "get", "path": "/tasks/looking-for-crew", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }], "tags": ["Tasks"], "summary": "Tasks: Crew-search pool (paginated, company-wide)", "responses": [{ "code": "200", "description": "Paginated crew-search pool", "schemaRef": "TaskList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listLookingForOwnerTasks", "method": "get", "path": "/tasks/looking-for-owner", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }], "tags": ["Tasks"], "summary": "Tasks: Owner-search pool (paginated, company-wide)", "responses": [{ "code": "200", "description": "Paginated owner-search pool", "schemaRef": "TaskList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listMcpAccessTokens", "method": "get", "path": "/me/mcp-tokens", "pathParams": [], "queryParams": [], "tags": ["MCP"], "summary": "Me: List MCP access tokens", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpAccessTokenList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listMemoryEntities", "method": "get", "path": "/memory/entities", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "entity_type", "required": false, "schema": {}, "description": "Filter to entities or nodes of this wiki-graph type" }, { "name": "edge_origin", "required": false, "schema": {}, "description": "Filter edges by provenance origin (knowledge graph vs mirrored operational links)" }, { "name": "fact_layer", "required": false, "schema": {}, "description": "Filter edges by fact layer" }, { "name": "include_candidates", "required": false, "schema": { "type": "boolean", "default": false }, "description": "When true, include entities only reachable via candidate edges" }, { "name": "include_superseded", "required": false, "schema": { "type": "boolean", "default": false }, "description": "When true, include entities only reachable via superseded edges" }, { "name": "confidence_min", "required": false, "schema": {}, "description": "Minimum confidence threshold for edges" }, { "name": "status", "required": false, "schema": {}, "description": "Filter edges by trust status" }, { "name": "sensitivity", "required": false, "schema": {}, "description": "Filter edges or entities by memory sensitivity label" }, { "name": "predicate", "required": false, "schema": { "type": "string" }, "description": "Filter to entities linked by this predicate" }], "tags": ["Memory"], "summary": "Memory: Entity list (faceted, paginated)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "MemoryEntityList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listMentionCandidates", "method": "get", "path": "/comments/mention-candidates", "pathParams": [], "queryParams": [{ "name": "entity_type", "required": true, "schema": {} }, { "name": "entity_id", "required": true, "schema": { "type": "string", "format": "uuid" } }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }], "tags": ["Comments"], "summary": "Comments: Mention candidates", "responses": [{ "code": "200", "description": "OK" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listNotifications", "method": "get", "path": "/notifications", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }], "tags": ["Notifications"], "summary": "Notifications: List (paginated)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "NotificationList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listOntologyProposals", "method": "get", "path": "/ontology-proposals", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "status", "required": false, "schema": {} }], "tags": ["OntologyProposals"], "summary": "Ontology: List proposals (admin)", "responses": [{ "code": "200", "description": "Paginated ontology proposals", "schemaRef": "OntologyProposalList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listPendingGlossaryEntries", "method": "get", "path": "/glossary/pending", "pathParams": [], "queryParams": [], "tags": ["Glossary"], "summary": "Glossary: List pending proposals (admin-only)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "GlossaryPendingList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listProcesses", "method": "get", "path": "/processes", "pathParams": [], "queryParams": [], "tags": ["Processes"], "summary": "Processes: List registered processes (admin)", "responses": [{ "code": "200", "description": "Process catalog", "schemaRef": "ProcessCatalogList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listProjects", "method": "get", "path": "/projects", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "archived", "required": false, "schema": { "type": "string", "enum": ["false", "true", "all"], "default": "false" }, "description": "Archive filter. `false` (default) = non-archived only; `true` = archived only; `all` = both.\n" }], "tags": ["Projects"], "summary": "Projects: List (paginated)", "responses": [{ "code": "200", "description": "Paginated project list", "schemaRef": "ProjectList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listRepositories", "method": "get", "path": "/repositories", "pathParams": [], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: List all", "responses": [{ "code": "200", "description": "OK", "schemaRef": "RepositoryList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listRepositoryDocRuns", "method": "get", "path": "/repositories/{source}/{workspace}/{slug}/doc-runs", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: List documentation runs", "responses": [{ "code": "200", "description": "OK", "schemaRef": "DocRunList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listRouterMisses", "method": "get", "path": "/router-misses", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "status", "required": false, "schema": { "type": "string", "enum": ["NEW", "REVIEWED", "DISMISSED"] }, "description": "Filter by intent status" }], "tags": ["RouterMisses"], "summary": "Router Misses: List (paginated, admin-only)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "RouterMissList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listRuns", "method": "get", "path": "/runs", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "status", "required": false, "schema": {}, "description": "Filter by run status" }, { "name": "kind", "required": false, "schema": { "type": "string" }, "description": "Filter by run kind (e.g. DOC_RUN, DOC_INGEST, SKILL_IMPORT)" }, { "name": "category", "required": false, "schema": {}, "description": "Filter by run category (AGENT or SCRIPT)" }, { "name": "repository_id", "required": false, "schema": { "type": "integer" }, "description": "Filter by repository ID" }, { "name": "trigger", "required": false, "schema": {}, "description": "Filter by trigger type" }], "tags": ["Runs"], "summary": "Runs: List all runs (admin)", "responses": [{ "code": "200", "description": "Paginated list of runs", "schemaRef": "RunOverviewList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listSignals", "method": "get", "path": "/signals", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "status", "required": false, "schema": {}, "description": "Filter by signal status" }], "tags": ["Signals"], "summary": "Signals: List inbox (paginated)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "SignalList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listSkillAssets", "method": "get", "path": "/skills/{uuid}/assets", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Skills"], "summary": "List assets attached to a skill", "responses": [{ "code": "200", "description": "Asset list", "schemaRef": "SkillAssetList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listSkillPlugins", "method": "get", "path": "/skills/plugins", "pathParams": [], "queryParams": [], "tags": ["Skills"], "summary": "List skill plugins", "responses": [{ "code": "200", "description": "List of skill plugins", "schemaRef": "SkillPluginList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listSkills", "method": "get", "path": "/skills", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Exact text search on skill name/description" }, { "name": "visibility", "required": false, "schema": { "type": "string", "enum": ["PERSONAL", "PUBLIC", "ALL"] }, "description": "Filter by visibility scope" }, { "name": "plugin_id", "required": false, "schema": { "type": "string", "format": "uuid" }, "description": "Filter by parent plugin folder UUID" }, { "name": "sort_by", "required": false, "schema": { "type": "string", "enum": ["name", "created_at", "updated_at"], "default": "updated_at" } }, { "name": "sort_dir", "required": false, "schema": { "type": "string", "enum": ["asc", "desc"], "default": "desc" } }], "tags": ["Skills"], "summary": "List skills", "responses": [{ "code": "200", "description": "Paginated list of skills", "schemaRef": "SkillList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listTags", "method": "get", "path": "/tags", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }], "tags": ["Tags"], "summary": "Tags: List (paginated, with usage count)", "responses": [{ "code": "200", "description": "Paginated list of tags with usage counts", "schemaRef": "TagList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listTaskActivity", "method": "get", "path": "/tasks/{uuid}/activity", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 } }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 } }, { "name": "sort_dir", "required": false, "schema": { "type": "string", "enum": ["asc", "desc"], "default": "desc" }, "description": "Sort direction (default desc = newest first)" }, { "name": "type", "required": false, "schema": { "type": "string" }, "description": 'Filter to a single activity type code (e.g. "task.status_changed") to read the status-transition history without a second parallel log.' }], "tags": ["Tasks"], "summary": "Tasks: List activity events", "responses": [{ "code": "200", "description": "Paginated list of activity events", "schemaRef": "ActivityEventList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listTasks", "method": "get", "path": "/tasks", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "status_slug", "required": false, "schema": { "type": "string" }, "description": 'Comma-separated TaskStatus values to filter by (e.g. "OPEN,IN_DEVELOPMENT")' }, { "name": "status_type", "required": false, "schema": { "type": "string" }, "description": 'Filter by status activity class, not by progress. Comma-separated; values: OPEN, WAITING, ACTIVE, TERMINAL. Note that OPEN is the single status OPEN (nobody has picked the task up yet) \u2014 it is not a synonym for "not finished"; for everything that is not finished, pass OPEN,WAITING,ACTIVE. A progress-based cut ("not deployed yet") cannot be expressed here, because the four classes cut across the status series \u2014 use status_slug with an explicit list of statuses for that. There is no value named "open": if a user asks for "the open tasks", ask which of the two readings they mean instead of guessing.' }, { "name": "type", "required": false, "schema": { "type": "string" }, "description": "Comma-separated task types (FEATURE, BUG, IDEA, CHORE, DISCOVERY). Multiple values are OR." }, { "name": "archived", "required": false, "schema": { "type": "string", "enum": ["false", "true", "all"] }, "description": "Archived visibility (orthogonal to status): false (default) hides archived, true only archived, all both" }, { "name": "view", "required": false, "schema": { "type": "string", "enum": ["all", "no_role", "mine"], "default": "all" }, "description": "Tab filter: all member tasks (default), tasks where the user has no role (no_role), or tasks created by the current user (mine)" }, { "name": "role", "required": false, "schema": {}, "description": "A TaskRole enum value \u2014 returns only tasks where the current user is a member with this role. Takes precedence over view when both are set." }, { "name": "tags", "required": false, "schema": { "type": "string" }, "description": "Comma-separated tag slugs to filter by" }, { "name": "tag_match", "required": false, "schema": { "type": "string", "enum": ["all", "any"], "default": "all" }, "description": "Whether all (AND) or any (OR) of the given tag slugs must match (default all)" }, { "name": "level", "required": false, "schema": {}, "description": "Filter by hierarchy level (SAGA, EPIC, STORY, SUBTASK)" }, { "name": "related_to", "required": false, "schema": { "type": "string", "format": "uuid" }, "description": "Return tasks that are 1-hop neighbours of the task with this UUID (member-scoped)" }, { "name": "relation_type", "required": false, "schema": {}, "description": "Restrict the related_to query to a specific relation type" }, { "name": "parent_task_id", "required": false, "schema": { "type": "string", "format": "uuid" }, "description": "Return only direct children of the task with this UUID (member-scoped, other filters apply)" }, { "name": "parent_eligible", "required": false, "schema": { "type": "boolean" }, "description": "When true, return only tasks that can act as a parent (have a level assigned and are not SUBTASK). Useful for parent-picker search in the create form." }, { "name": "parent_eligible_for_level", "required": false, "schema": {}, "description": "Level-dependent successor of parent_eligible (AURA-1226): keep only tasks whose level may act as parent for a task at this target level \u2014 SUBTASK yields STORY only, STORY yields EPIC/SAGA, EPIC yields SAGA only, SAGA yields no candidates at all. Takes precedence over parent_eligible when both are given. Used by the guided level-change dialog's candidate list." }], "tags": ["Tasks"], "summary": "Tasks: List (paginated)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "TaskList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listTaskStoryPointEstimates", "method": "get", "path": "/tasks/{uuid}/story-points", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [{ "name": "limit", "required": false, "schema": { "type": "integer", "default": 100, "minimum": 1, "maximum": 200 }, "description": "Maximum number of history rows to return." }], "tags": ["Tasks"], "summary": "Tasks: List story-point history", "responses": [{ "code": "200", "description": "History listed", "schemaRef": "StoryPointEstimateList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listUserGroups", "method": "get", "path": "/user-groups", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }], "tags": ["UserGroups"], "summary": "UserGroups: List (paginated)", "responses": [{ "code": "200", "description": "Paginated list of user groups", "schemaRef": "UserGroupList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "listUsers", "method": "get", "path": "/users", "pathParams": [], "queryParams": [{ "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Number of items per page" }, { "name": "q", "required": false, "schema": { "type": "string" }, "description": "Search query (full-text filter across relevant fields)" }, { "name": "sort_by", "required": false, "schema": {}, "description": "Field to sort by" }, { "name": "sort_dir", "required": false, "schema": {}, "description": "Sort direction" }, { "name": "role", "required": false, "schema": {}, "description": "Filter by user role" }], "tags": ["Users"], "summary": "Users: List all", "responses": [{ "code": "200", "description": "OK", "schemaRef": "UserList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "markAllNotificationsRead", "method": "post", "path": "/notifications/read-all", "pathParams": [], "queryParams": [], "tags": ["Notifications"], "summary": "Notifications: Mark all as read", "responses": [{ "code": "200", "description": "OK \u2014 returns updated unread count (always 0)", "schemaRef": "NotificationReadResult" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "markNotificationRead", "method": "post", "path": "/notifications/{id}/read", "pathParams": [{ "name": "id", "required": true, "schema": {} }], "queryParams": [], "tags": ["Notifications"], "summary": "Notifications: Mark one as read", "responses": [{ "code": "200", "description": "OK", "schemaRef": "NotificationReadResult" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "markTaskCommentsRead", "method": "post", "path": "/tasks/{uuid}/comments/read", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "MarkTaskCommentsReadRequest", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Mark comments as read", "responses": [{ "code": "204", "description": "Watermark advanced (or already at/past the given timestamp)." }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "markTaskRead", "method": "post", "path": "/tasks/{uuid}/read", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Mark as read", "responses": [{ "code": "204", "description": "Marked as read (or already was read)." }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpAnswerQuestion", "method": "post", "path": "/mcp/questions/{id}/answer", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "McpAnswerQuestionRequest", "required": true }, "tags": ["MCP"], "summary": "MCP: Answer question", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpQuestionDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpCreateArtifact", "method": "post", "path": "/mcp/artifacts", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "McpCreateArtifactRequest", "required": true }, "tags": ["MCP"], "summary": "MCP: Create artifact", "responses": [{ "code": "201", "description": "Created", "schemaRef": "ArtifactDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpCreateTask", "method": "post", "path": "/mcp/tasks", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "McpCreateTaskRequest", "required": true }, "tags": ["MCP"], "summary": "MCP: Create task", "responses": [{ "code": "201", "description": "Created", "schemaRef": "McpTaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpCreateUploadDocument", "method": "post", "path": "/mcp/upload-documents", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "McpCreateUploadDocumentRequest", "required": true }, "tags": ["MCP"], "summary": "MCP: Upload document (base64)", "responses": [{ "code": "201", "description": "Created", "schemaRef": "McpUploadDocumentDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "413", "description": "Payload exceeds 10 MB MCP limit", "schemaRef": "ProblemDetail" }, { "code": "415", "description": "Unsupported media type", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpExpandGraph", "method": "post", "path": "/mcp/graph/expand", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "McpGraphExpandRequest", "required": true }, "tags": ["MCP"], "summary": "MCP: Expand knowledge graph", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpGraphExpandResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpGetArtifact", "method": "get", "path": "/mcp/artifacts/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["MCP"], "summary": "MCP: Get artifact", "responses": [{ "code": "200", "description": "OK", "schemaRef": "ArtifactDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpGetKnowledgeDocument", "method": "get", "path": "/mcp/knowledge/documents/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["MCP"], "summary": "MCP: Get knowledge document", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpKnowledgeDocument" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpGetQuestion", "method": "get", "path": "/mcp/questions/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["MCP"], "summary": "MCP: Get question", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpQuestionDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpGetRepoDocument", "method": "get", "path": "/mcp/repo-documents", "pathParams": [], "queryParams": [{ "name": "repo_slug", "required": true, "schema": { "type": "string" } }, { "name": "path", "required": true, "schema": { "type": "string" } }], "tags": ["MCP"], "summary": "MCP: Get repository document", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpRepoDocument" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpGetSkill", "method": "get", "path": "/mcp/skills/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["MCP"], "summary": "MCP: Get skill", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpSkillDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpGetUploadDocument", "method": "get", "path": "/mcp/upload-documents/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["MCP"], "summary": "MCP: Get upload document", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpUploadDocumentDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpLinkArtifactToTask", "method": "post", "path": "/mcp/tasks/{id}/artifacts", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "McpLinkArtifactRequest", "required": true }, "tags": ["MCP"], "summary": "MCP: Link artifact to task", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpLinkArtifactResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpLinkUploadToTask", "method": "post", "path": "/mcp/tasks/{id}/uploads", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "McpLinkUploadRequest", "required": true }, "tags": ["MCP"], "summary": "MCP: Link upload to task", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpLinkUploadResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpListCodeRepositories", "method": "get", "path": "/mcp/code-repositories", "pathParams": [], "queryParams": [], "tags": ["MCP"], "summary": "MCP: List code-search-enabled repositories", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpCodeRepositoryList" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpUnifiedSearch", "method": "post", "path": "/mcp/search", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "UnifiedSearchRequest", "required": true }, "tags": ["MCP"], "summary": "MCP: Unified semantic search", "responses": [{ "code": "200", "description": "OK", "schemaRef": "UnifiedSearchResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }, { "code": "503", "description": "Embedding provider unavailable", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpUpdateArtifact", "method": "patch", "path": "/mcp/artifacts/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "McpUpdateArtifactRequest", "required": true }, "tags": ["MCP"], "summary": "MCP: Update artifact", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpUpdateArtifactResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "mcpWikiSearch", "method": "get", "path": "/mcp/wiki-search", "pathParams": [], "queryParams": [{ "name": "query", "required": true, "schema": { "type": "string" } }, { "name": "space_slug", "required": false, "schema": { "type": "string" } }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 50 } }], "tags": ["MCP"], "summary": "MCP: Search the wiki (literal + semantic)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpWikiSearchResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }] }, { "operationId": "overrideArtifactReview", "method": "post", "path": "/artifacts/{id}/review-override", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ArtifactReviewVersionRequest", "required": true }, "tags": ["Artifacts"], "summary": "Artifacts: Override review (force approved)", "responses": [{ "code": "204", "description": "No Content" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "overrideCrewRemoval", "method": "post", "path": "/tasks/{uuid}/crew-search/removal/override", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskCrewRemovalAction", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Override crew removal", "responses": [{ "code": "200", "description": "Crew removal overridden", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Target user is not an active crew member.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "previewTaskLevelCascade", "method": "get", "path": "/tasks/{uuid}/level-cascade-preview", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [{ "name": "level", "required": true, "schema": {}, "description": "The level to preview moving this task to." }, { "name": "parent_task_id", "required": false, "schema": { "type": "string" }, "description": "New parent UUID to validate together with the level. Omit to keep the current parent; pass an empty string to explicitly clear it (e.g. promoting to SAGA, which takes no parent) \u2014 a query string cannot carry a real `null` the way the PATCH body can." }], "tags": ["Tasks"], "summary": "Tasks: Preview a level-change cascade", "responses": [{ "code": "200", "description": "The cascade this level change would produce", "schemaRef": "TaskLevelCascadePreview" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "proposeCrewRemoval", "method": "post", "path": "/tasks/{uuid}/crew-search/removal/propose", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskCrewRemovalAction", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Propose crew removal", "responses": [{ "code": "200", "description": "Crew removal proposed", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Target user is not an active crew member.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "proposeTaskStoryPointEstimate", "method": "post", "path": "/tasks/{uuid}/story-points/propose", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Propose a story-point size without recording it", "responses": [{ "code": "200", "description": "The proposed size, unrecorded", "schemaRef": "StoryPointProposal" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }, { "code": "502", "description": "The estimate could not be generated.", "schemaRef": "ProblemDetail" }] }, { "operationId": "readCapacity", "method": "get", "path": "/capacity/read", "pathParams": [], "queryParams": [{ "name": "scope", "required": true, "schema": { "type": "string", "enum": ["me", "person", "group", "company"] }, "description": `Whose capacity to read \u2014 "me" for the caller's own row, "person" for one person (pass person_uuid), "group" for a group the caller leads (pass group_uuid, or omit for "my team"), "company" for the firm-wide overview (Leadership/Admin).` }, { "name": "person_uuid", "required": false, "schema": { "type": "string", "format": "uuid" }, "description": "Target person UUID \u2014 required for scope=person, ignored otherwise." }, { "name": "group_uuid", "required": false, "schema": { "type": "string", "format": "uuid" }, "description": 'Target group UUID for scope=group. Omit for "my team" \u2014 every group where the caller is LEAD. Ignored for other scopes.' }, { "name": "page", "required": false, "schema": { "type": "integer", "default": 1, "minimum": 1 }, "description": "Page number (1-based)" }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }, "description": "Items per page for scope=company (default 20, max 100). Ignored for other scopes." }], "tags": ["Capacity"], "summary": "Capacity: Read capacity with a scope (me, person, group, or company)", "responses": [{ "code": "200", "description": "A scoped capacity read \u2014 a one-row list for scope=me/person, the roster for scope=group, a paginated overview for scope=company.", "schemaRef": "CapacityReadResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "recordTaskProgress", "method": "post", "path": "/tasks/{uuid}/activity", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaInline": { "type": "object", "required": ["note", "phase"], "properties": { "note": { "type": "string", "minLength": 1, "maxLength": 2e3, "description": "Short, AI-written sentence describing what is happening." }, "phase": { "type": "string", "minLength": 1, "maxLength": 60, "description": 'Short skill-phase label (e.g. "implement", "refine"), finer-grained than the Aura status.' }, "step": { "type": "string", "minLength": 1, "maxLength": 60, "description": 'Optional finer-grained step within the phase (e.g. "wave 2/3").' } } }, "required": true }, "tags": ["Tasks"], "summary": "Tasks: Record a progress activity event", "responses": [{ "code": "200", "description": "Progress activity event created" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "rejectGlossaryEntry", "method": "post", "path": "/glossary/{uuid}/reject", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Glossary"], "summary": "Glossary: Reject a pending proposal (admin-only)", "responses": [{ "code": "204", "description": "Rejected and deleted" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Entry is not pending", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "rejectOntologyProposal", "method": "post", "path": "/ontology-proposals/{uuid}/reject", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["OntologyProposals"], "summary": "Ontology: Reject proposal (admin)", "responses": [{ "code": "200", "description": "Proposal rejected", "schemaRef": "OntologyProposalRejectResult" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "removeArtifactReviewer", "method": "delete", "path": "/artifacts/{id}/review-reviewers/{userId}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }, { "name": "userId", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "UUID of the user to remove" }], "queryParams": [{ "name": "version", "required": true, "schema": { "type": "integer", "minimum": 1 }, "description": "Version number of the review run" }], "tags": ["Artifacts"], "summary": "Artifacts: Remove reviewer mid-run", "responses": [{ "code": "204", "description": "No Content" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "removeTaskMember", "method": "delete", "path": "/tasks/{uuid}/members/{userIdOrUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "userIdOrUuid", "required": true, "schema": { "type": "string" }, "description": "User integer ID or UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Remove member", "responses": [{ "code": "200", "description": "Member removed; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "removeUserGroupMember", "method": "delete", "path": "/user-groups/{uuid}/members/{userUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }, { "name": "userUuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["UserGroups"], "summary": "UserGroups: Remove member", "responses": [{ "code": "204", "description": "Removed" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "reopenArtifactReview", "method": "post", "path": "/artifacts/{id}/review-reopen", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ArtifactReviewVersionRequest", "required": true }, "tags": ["Artifacts"], "summary": "Artifacts: Reopen approved review", "responses": [{ "code": "204", "description": "No Content" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "reopenTask", "method": "post", "path": "/tasks/{uuid}/reopen", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskReopen", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Reopen", "responses": [{ "code": "200", "description": "Task reopened", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is not in a reopenable status.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "reorderTaskRankContext", "method": "put", "path": "/tasks/{uuid}/rank-context", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "UUID of a task in the context being reordered" }], "queryParams": [{ "name": "scope", "required": false, "schema": { "type": "string", "enum": ["siblings", "children"], "default": "siblings" }, "description": "Which priority-ordering context to address (AURA-930). `siblings` (default) is the context the named task itself sits in; `children` is the context of its direct children (`task:<this>`).\n" }], "body": { "contentType": "application/json", "schemaRef": "TaskRankContextOrder", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Apply a new order to the context", "responses": [{ "code": "200", "description": "Order applied; the new context state", "schemaRef": "TaskRankContext" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "The ordering changed since the client read it. `meta.context` holds the state that actually applies.\n", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "reportMemoryEntityQuestion", "method": "post", "path": "/memory/entities/{stable_id}/report-question", "pathParams": [{ "name": "stable_id", "required": true, "schema": { "type": "string" }, "description": "Entity stable ID to flag as questionable" }], "queryParams": [], "tags": ["Memory"], "summary": "Memory: Report entity as questionable", "responses": [{ "code": "200", "description": "Existing open question reused for this user and entity", "schemaRef": "MemoryReportedQuestion" }, { "code": "201", "description": "New open question created", "schemaRef": "MemoryReportedQuestion" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "requestArtifactReview", "method": "post", "path": "/artifacts/{id}/review-request", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Artifacts"], "summary": "Artifacts: Request review", "responses": [{ "code": "204", "description": "No Content" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "422", "description": "Unprocessable Entity \u2014 request is well-formed but semantically invalid.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "respondCrewRequest", "method": "post", "path": "/tasks/{uuid}/crew-search/respond", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskCrewRespond", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Respond to crew request", "responses": [{ "code": "200", "description": "Crew request answered", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "No matching pending crew request exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "restoreKnowledgeNodeVersion", "method": "post", "path": "/knowledge/nodes/{uuid}/versions/{version}/restore", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }, { "name": "version", "required": true, "schema": {} }], "queryParams": [], "tags": ["knowledge"], "summary": "Restore a document node to a previous version (creates new version)", "responses": [{ "code": "200", "description": "Node after restore", "schemaRef": "KnowledgeNode" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "retryRun", "method": "post", "path": "/runs/{uuid}/retry", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "tags": ["Runs"], "summary": "Runs: Retry a failed run (admin)", "responses": [{ "code": "200", "description": "Retry accepted \u2014 run reset to PENDING and job re-queued", "schemaRef": "RetryRunResult" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Run is not FAILED, or the job could not be re-queued", "schemaRef": "ProblemDetail" }] }, { "operationId": "reviewSignal", "method": "post", "path": "/signals/{uuid}/review", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "SignalReviewRequest", "required": true }, "tags": ["Signals"], "summary": "Signals: Review (acknowledge, dismiss, snooze)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "SignalDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "revokeArtifactAccess", "method": "delete", "path": "/artifacts/{id}/grants", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ArtifactGrantRevokeRequest", "required": true }, "tags": ["Artifacts"], "summary": "Artifacts: Revoke access", "responses": [{ "code": "200", "description": "OK \u2014 updated access overview", "schemaRef": "ArtifactAccessOverview" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "422", "description": "Unprocessable Entity \u2014 request is well-formed but semantically invalid.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "revokeMcpAccessToken", "method": "delete", "path": "/me/mcp-tokens/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["MCP"], "summary": "Me: Revoke MCP access token", "responses": [{ "code": "200", "description": "OK", "schemaRef": "McpAccessTokenRevokeResponse" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "saveKnowledgeNodeBody", "method": "put", "path": "/knowledge/nodes/{uuid}/body", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "KnowledgeNodeBodySave", "required": true }, "tags": ["knowledge"], "summary": "Save document body (creates a new version)", "responses": [{ "code": "200", "description": "Updated node", "schemaRef": "KnowledgeNode" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "saveKnowledgeNodeFrontmatter", "method": "put", "path": "/knowledge/nodes/{uuid}/frontmatter", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaInline": { "type": "object", "required": ["raw"], "properties": { "raw": { "type": "string", "nullable": true, "description": "YAML string. Null or empty string clears the front matter." } } }, "required": true }, "tags": ["Knowledge"], "summary": "Save (replace) the front matter of a wiki page", "responses": [{ "code": "200", "description": "Updated node with new front matter.", "schemaRef": "KnowledgeNode" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "saveSkillBody", "method": "put", "path": "/skills/{uuid}/body", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "SkillBodySave", "required": true }, "tags": ["Skills"], "summary": "Save skill body (owner only)", "responses": [{ "code": "200", "description": "Updated skill", "schemaRef": "Skill" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "saveTaskBoardLayout", "method": "put", "path": "/tasks/board/layout", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskBoardLayoutWrite", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Save board card positions and viewport (bulk)", "responses": [{ "code": "200", "description": "OK", "schemaRef": "TaskBoardLayoutWriteResult" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "searchKnowledge", "method": "get", "path": "/knowledge/search", "pathParams": [], "queryParams": [{ "name": "query", "required": true, "schema": { "type": "string" } }, { "name": "space_slug", "required": false, "schema": { "type": "string" }, "description": "Restrict the search to one knowledge space. Omit to search every space the caller may read." }, { "name": "limit", "required": false, "schema": { "type": "integer", "default": 20, "minimum": 1, "maximum": 50 } }], "tags": ["Knowledge"], "summary": "Search wiki, repository and skill knowledge spaces", "responses": [{ "code": "200", "description": "Matching knowledge pages", "schemaRef": "KnowledgeSearchList" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }] }, { "operationId": "searchUsers", "method": "get", "path": "/users/search", "pathParams": [], "queryParams": [{ "name": "q", "required": true, "schema": { "type": "string" }, "description": "Search query (minimum 2 characters)" }], "tags": ["Users"], "summary": "Users: Search (picker)", "responses": [{ "code": "200", "description": "OK" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "setChatVisibility", "method": "put", "path": "/chats/{id}/visibility", "pathParams": [{ "name": "id", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ChatVisibilityUpdate", "required": true }, "tags": ["Chats"], "summary": "Chats: Set visibility", "responses": [{ "code": "200", "description": "Updated chat", "schemaRef": "Chat" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "setSkillVisibility", "method": "put", "path": "/skills/{uuid}/visibility", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "SkillVisibilityUpdate", "required": true }, "tags": ["Skills"], "summary": "Publish or retract a skill (owner only)", "responses": [{ "code": "200", "description": "Updated skill", "schemaRef": "Skill" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "setTaskAsap", "method": "put", "path": "/tasks/{uuid}/asap", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Mark ASAP", "responses": [{ "code": "200", "description": "ASAP set; the current stock", "schemaRef": "TaskAsapState" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "setTaskMemberRoles", "method": "put", "path": "/tasks/{uuid}/members/{userIdOrUuid}/roles", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "userIdOrUuid", "required": true, "schema": { "type": "string" }, "description": "User integer ID or UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskMemberRolesReplaceRequest", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Set member roles", "responses": [{ "code": "200", "description": "Roles replaced; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "setTaskRankLock", "method": "put", "path": "/tasks/{uuid}/rank-lock", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "UUID of a task in the context to lock or unlock" }], "queryParams": [{ "name": "scope", "required": false, "schema": { "type": "string", "enum": ["siblings", "children"], "default": "siblings" }, "description": "Which priority-ordering context to address (AURA-930). `siblings` (default) is the context the named task itself sits in; `children` is the context of its direct children (`task:<this>`).\n" }], "body": { "contentType": "application/json", "schemaInline": { "type": "object", "required": ["locked"], "properties": { "locked": { "type": "boolean", "description": "Target lock state." } } }, "required": true }, "tags": ["Tasks"], "summary": "Tasks: Lock or unlock a priority-ordering context", "responses": [{ "code": "200", "description": "Lock state applied; the current context state", "schemaRef": "TaskRankContext" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "setTaskRankReason", "method": "put", "path": "/tasks/{uuid}/rank-reason", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskRankReasonInput", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Publish the ordering rationale", "responses": [{ "code": "200", "description": "Rationale saved", "schemaRef": "TaskRankReasonState" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "setTaskStoryPoints", "method": "post", "path": "/tasks/{uuid}/story-points", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "StoryPointWriteInput", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Set or withdraw a human story-point correction", "responses": [{ "code": "200", "description": "Task detail with the new effective value", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "startArtifactReview", "method": "post", "path": "/artifacts/{id}/review-start", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ArtifactReviewStartRequest", "required": true }, "tags": ["Artifacts"], "summary": "Artifacts: Start review", "responses": [{ "code": "201", "description": "Created \u2014 review run started" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "422", "description": "Unprocessable Entity \u2014 request is well-formed but semantically invalid.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "startCrewSearch", "method": "post", "path": "/tasks/{uuid}/crew-search", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "CrewSearchRelease", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Start crew search", "responses": [{ "code": "200", "description": "Crew search started", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "422", "description": "Crew need missing or invalid.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "startOwnerSearch", "method": "post", "path": "/tasks/{uuid}/owner-search", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "OwnerSearchRelease", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Start owner search", "responses": [{ "code": "200", "description": "Owner search started", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "422", "description": "Owner goal or due date missing.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "submitArtifactDecision", "method": "post", "path": "/artifacts/{id}/decisions", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ArtifactDecisionRequest", "required": true }, "tags": ["Artifacts"], "summary": "Artifacts: Submit approval/rejection decision", "responses": [{ "code": "204", "description": "No Content" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "suggestOwnerGoal", "method": "post", "path": "/tasks/{uuid}/owner-goal", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Suggest owner goal (AI)", "responses": [{ "code": "200", "description": "Suggested one-sentence owner goal", "schemaRef": "OwnerGoalSuggestion" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "syncRepository", "method": "post", "path": "/repositories/{source}/{workspace}/{slug}/sync", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "SyncPayload", "required": true }, "tags": ["Repositories"], "summary": "Repositories: Sync document tree", "responses": [{ "code": "200", "description": "OK", "schemaRef": "SyncResult" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "systemHealth", "method": "get", "path": "/system/health", "pathParams": [], "queryParams": [], "tags": ["Health"], "summary": "System: Health and build identity", "responses": [{ "code": "200", "description": "Health status, uptime in seconds, and optional build block" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "triggerAsanaSync", "method": "post", "path": "/asana-tasks/sync", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaInline": { "type": "object", "required": ["project_gid"], "properties": { "project_gid": { "type": "string", "description": "Asana project gid to sync" } } }, "required": true }, "tags": ["Asana"], "summary": "Asana: Trigger project sync (admin)", "responses": [{ "code": "202", "description": "Sync enqueued" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "A sync for this project is already running", "schemaRef": "ProblemDetail" }] }, { "operationId": "triggerJiraSync", "method": "post", "path": "/jira-issues/sync", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaInline": { "type": "object", "required": ["team_id"], "properties": { "team_id": { "type": "string", "format": "uuid", "description": "Team UUID to sync (from JiraTeam / customfield_10001)" } } }, "required": true }, "tags": ["JiraIssues"], "summary": "Jira Issues: Trigger topic sync (admin)", "responses": [{ "code": "202", "description": "Sync enqueued" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "A sync for this topic is already running", "schemaRef": "ProblemDetail" }] }, { "operationId": "triggerRepositoryCodeSync", "method": "post", "path": "/repositories/{source}/{workspace}/{slug}/code-sync", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: Trigger code sync", "responses": [{ "code": "202", "description": "Sync triggered; status visible via GET /repositories" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Code search not enabled for this repository" }] }, { "operationId": "triggerRepositoryDocRun", "method": "post", "path": "/repositories/{source}/{workspace}/{slug}/document", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "DocRunTriggerRequest", "required": false }, "tags": ["Repositories"], "summary": "Repositories: Trigger a documentation run", "responses": [{ "code": "202", "description": "Accepted \u2014 the run was created and is processing.", "schemaRef": "DocRunTriggerResponse" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "triggerRepositoryIngestFromPr", "method": "post", "path": "/repositories/{source}/{workspace}/{slug}/ingest-from-pr", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "tags": ["Repositories"], "summary": "Repositories: Trigger a manual PR ingest", "responses": [{ "code": "202", "description": "Accepted \u2014 the ingest run was created and is processing.", "schemaRef": "IngestRunTriggerResponse" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "unassignTaskFromProject", "method": "delete", "path": "/projects/{uuid}/tasks/{taskUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Project UUID" }, { "name": "taskUuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Projects"], "summary": "Projects: Unassign task", "responses": [{ "code": "204", "description": "Unassigned" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "unifiedSearch", "method": "post", "path": "/search", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "UnifiedSearchRequest", "required": true }, "tags": ["Search"], "summary": "Search: Unified semantic search", "responses": [{ "code": "200", "description": "OK", "schemaRef": "UnifiedSearchResponse" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }, { "code": "503", "description": "Embedding provider unavailable", "schemaRef": "ProblemDetail" }] }, { "operationId": "unlinkArtifactFromTask", "method": "delete", "path": "/tasks/{uuid}/artifacts/{artifactUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "artifactUuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Artifact UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Unlink an artifact", "responses": [{ "code": "200", "description": "Artifact unlinked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "unlinkAsanaTaskFromTask", "method": "delete", "path": "/tasks/{uuid}/asana-tasks/{asanaTaskUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "asanaTaskUuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "AsanaTask UUID (the mirrored record's id, returned in asana_tasks[].id)" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Unlink an Asana object", "responses": [{ "code": "200", "description": "Asana object unlinked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access.", "schemaRef": "AccessDeniedProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "unlinkChatFromTask", "method": "delete", "path": "/tasks/{uuid}/chats/{chatUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "chatUuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Chat UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Unlink a chat", "responses": [{ "code": "200", "description": "Chat unlinked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "unlinkFeedbackTask", "method": "delete", "path": "/feedback/{uuid}/tasks", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Feedback UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "FeedbackTaskLink", "required": true }, "tags": ["Feedback"], "summary": "Feedback: Unlink a task", "responses": [{ "code": "200", "description": "Unlinked", "schemaRef": "FeedbackDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "unlinkJiraIssueFromTask", "method": "delete", "path": "/tasks/{uuid}/jira-issues/{jiraIssueUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "jiraIssueUuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "JiraIssue UUID (the mirrored record's id, returned in jira_issues[].id)" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Unlink a Jira issue", "responses": [{ "code": "200", "description": "Jira issue unlinked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "unlinkRelatedFeedback", "method": "delete", "path": "/feedback/{uuid}/related", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Feedback UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "FeedbackRelatedLink", "required": true }, "tags": ["Feedback"], "summary": "Feedback: Unlink a related entry", "responses": [{ "code": "200", "description": "Unlinked", "schemaRef": "FeedbackDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "unlinkRepositoryFromProject", "method": "delete", "path": "/projects/{uuid}/repositories/{repositoryUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }, { "name": "repositoryUuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "tags": ["Projects"], "summary": "Projects: Unlink repository", "responses": [{ "code": "200", "description": "Project detail after unlink", "schemaRef": "ProjectDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "unlinkRepositoryFromTask", "method": "delete", "path": "/tasks/{uuid}/repositories/{repositoryUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "repositoryUuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Repository UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Unlink a repository", "responses": [{ "code": "200", "description": "Repository unlinked; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateCapacitySettings", "method": "patch", "path": "/capacity/settings", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaInline": { "type": "object", "required": ["base_capacity_percent"], "properties": { "base_capacity_percent": { "type": "integer", "enum": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] }, "base_capacity_note": { "type": "string", "nullable": true, "description": "Empty string or null clears the override (falls back to localized default)." } } }, "required": true }, "tags": ["Capacity"], "summary": "Capacity: Update company base capacity setting", "responses": [{ "code": "200", "description": "Updated company capacity settings", "schemaRef": "CapacitySettings" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateComment", "method": "patch", "path": "/comments/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "PatchCommentRequest", "required": true }, "tags": ["Comments"], "summary": "Comments: Update", "responses": [{ "code": "200", "description": "Updated comment", "schemaRef": "Comment" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateCrewSearch", "method": "patch", "path": "/tasks/{uuid}/crew-search", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "CrewSearchUpdate", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Update crew search", "responses": [{ "code": "200", "description": "Crew search updated", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is not in crew search.", "schemaRef": "ProblemDetail" }, { "code": "422", "description": "Neither field provided, or invalid due date.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateGlossaryEntry", "method": "patch", "path": "/glossary/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "GlossaryEntryUpdate", "required": true }, "tags": ["Glossary"], "summary": "Glossary: Update", "responses": [{ "code": "200", "description": "OK", "schemaRef": "GlossaryEntry" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Term already exists", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateKnowledgeNode", "method": "patch", "path": "/knowledge/nodes/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "KnowledgeNodeUpdate", "required": true }, "tags": ["knowledge"], "summary": "Rename, move or reorder a node", "responses": [{ "code": "200", "description": "Updated node", "schemaRef": "KnowledgeNode" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateKnowledgeSpace", "method": "patch", "path": "/knowledge/spaces/{slug}", "pathParams": [{ "name": "slug", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "KnowledgeSpaceUpdate", "required": true }, "tags": ["knowledge"], "summary": "Update a knowledge space", "responses": [{ "code": "200", "description": "Updated knowledge space", "schemaRef": "KnowledgeSpace" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateNotificationPreferences", "method": "put", "path": "/notifications/preferences", "pathParams": [], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "NotificationPreferencesUpdate", "required": true }, "tags": ["Notifications"], "summary": "Notifications: Update preferences", "responses": [{ "code": "200", "description": "OK \u2014 returns the updated effective preference matrix", "schemaRef": "NotificationPreferencesMatrix" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateOwnerSearch", "method": "patch", "path": "/tasks/{uuid}/owner-search", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "OwnerSearchUpdate", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Update owner search", "responses": [{ "code": "200", "description": "Owner search updated", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Task is not in owner search.", "schemaRef": "ProblemDetail" }, { "code": "422", "description": "Neither field provided, or due date cleared.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateProject", "method": "patch", "path": "/projects/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "ProjectUpdate", "required": true }, "tags": ["Projects"], "summary": "Projects: Update", "responses": [{ "code": "200", "description": "Updated", "schemaRef": "ProjectDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateRepository", "method": "patch", "path": "/repositories/{source}/{workspace}/{slug}", "pathParams": [{ "name": "source", "required": true, "schema": {}, "description": "Repository source" }, { "name": "workspace", "required": true, "schema": { "type": "string" }, "description": "Repository workspace" }, { "name": "slug", "required": true, "schema": { "type": "string" }, "description": "Repository slug" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "RepositoryPatch", "required": true }, "tags": ["Repositories"], "summary": "Repositories: Update", "responses": [{ "code": "200", "description": "OK", "schemaRef": "Repository" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateSkill", "method": "patch", "path": "/skills/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "SkillUpdate", "required": true }, "tags": ["Skills"], "summary": "Update skill metadata (title, frontmatter)", "responses": [{ "code": "200", "description": "Updated skill", "schemaRef": "Skill" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateTask", "method": "patch", "path": "/tasks/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskPatch", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Update", "responses": [{ "code": "200", "description": "Task updated", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateTaskMemberCapacity", "method": "patch", "path": "/tasks/{uuid}/members/{userIdOrUuid}/capacity", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "userIdOrUuid", "required": true, "schema": { "type": "string" }, "description": "User integer ID or UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskMemberCapacityUpdate", "required": true }, "tags": ["Capacity"], "summary": "Tasks: Set member capacity commitment", "responses": [{ "code": "200", "description": "Capacity updated; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateTaskMemberParticipation", "method": "patch", "path": "/tasks/{uuid}/members/{userIdOrUuid}/participation", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }, { "name": "userIdOrUuid", "required": true, "schema": { "type": "string" }, "description": "User integer ID or UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskMemberParticipationUpdate", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Update member participation", "responses": [{ "code": "200", "description": "Participation updated; returns updated task detail", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateUser", "method": "patch", "path": "/users/{id}", "pathParams": [{ "name": "id", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "User UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "UserUpdateInput", "required": true }, "tags": ["Users"], "summary": "Users: Update role", "responses": [{ "code": "200", "description": "OK", "schemaRef": "User" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateUserGroup", "method": "patch", "path": "/user-groups/{uuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "UserGroupUpdateInput", "required": true }, "tags": ["UserGroups"], "summary": "UserGroups: Update name/description", "responses": [{ "code": "200", "description": "The updated user group with its members", "schemaRef": "UserGroupDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "updateUserGroupMemberRole", "method": "patch", "path": "/user-groups/{uuid}/members/{userUuid}", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }, { "name": "userUuid", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "UserGroupMemberRoleInput", "required": true }, "tags": ["UserGroups"], "summary": "UserGroups: Change member role", "responses": [{ "code": "200", "description": "The updated user group with its members", "schemaRef": "UserGroupDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "uploadCommentImage", "method": "post", "path": "/comments/images", "pathParams": [], "queryParams": [{ "name": "entity_type", "required": true, "schema": {} }, { "name": "entity_id", "required": true, "schema": { "type": "string", "format": "uuid" } }], "body": { "contentType": "multipart/form-data", "schemaInline": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string", "format": "binary" } } }, "required": true }, "tags": ["Comments"], "summary": "Comments: Upload image", "responses": [{ "code": "201", "description": "Uploaded image", "schemaRef": "CommentImageResponse" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "413", "description": "Payload too large (exceeds 10 MB)" }, { "code": "415", "description": "Unsupported media type (only JPEG, PNG, WebP allowed)" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "uploadKnowledgeFile", "method": "post", "path": "/knowledge/spaces/{slug}/files", "pathParams": [{ "name": "slug", "required": true, "schema": { "type": "string" } }], "queryParams": [{ "name": "parent_id", "required": false, "schema": { "type": "string", "format": "uuid" }, "description": "Folder node to upload into. Omit for the space root." }], "body": { "contentType": "multipart/form-data", "schemaInline": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string", "format": "binary" } } }, "required": true }, "tags": ["knowledge"], "summary": "Upload a file into a space (creates or replaces a FILE node)", "responses": [{ "code": "200", "description": "Existing file replaced", "schemaRef": "KnowledgeFile" }, { "code": "201", "description": "File created", "schemaRef": "KnowledgeFile" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "Conflict \u2014 resource already exists.", "schemaRef": "ProblemDetail" }, { "code": "413", "description": "Payload too large (exceeds 50 MB)" }] }, { "operationId": "uploadKnowledgeNodeImage", "method": "post", "path": "/knowledge/nodes/{uuid}/images", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" } }], "queryParams": [], "body": { "contentType": "multipart/form-data", "schemaInline": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string", "format": "binary" } } }, "required": true }, "tags": ["knowledge"], "summary": "Upload an image for a knowledge node", "responses": [{ "code": "201", "description": "Image uploaded successfully", "schemaRef": "KnowledgeNodeImage" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "413", "description": "Payload too large (exceeds 10 MB)" }, { "code": "415", "description": "Unsupported media type" }] }, { "operationId": "uploadSkillAsset", "method": "post", "path": "/skills/{uuid}/assets", "pathParams": [{ "name": "uuid", "required": true, "schema": {} }], "queryParams": [], "body": { "contentType": "multipart/form-data", "schemaInline": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string", "format": "binary" } } }, "required": true }, "tags": ["Skills"], "summary": "Upload an asset to a skill (owner only)", "responses": [{ "code": "201", "description": "Created asset", "schemaRef": "SkillAsset" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }] }, { "operationId": "validateSkillImport", "method": "post", "path": "/skills/import/validate", "pathParams": [], "queryParams": [], "body": { "contentType": "multipart/form-data", "schemaInline": { "type": "object", "required": ["file"], "properties": { "file": { "type": "string", "format": "binary" } } }, "required": true }, "tags": ["Skills"], "summary": "Upload a plugin ZIP and receive a validation preview", "responses": [{ "code": "200", "description": "Preview of the ZIP contents", "schemaRef": "PluginZipPreview" }, { "code": "400", "description": "Bad request - the request payload is malformed or invalid.", "schemaRef": "ProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "413", "description": "ZIP too large" }] }, { "operationId": "withdrawCrewRequest", "method": "post", "path": "/tasks/{uuid}/crew-search/withdraw", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "body": { "contentType": "application/json", "schemaRef": "TaskCrewWithdrawal", "required": true }, "tags": ["Tasks"], "summary": "Tasks: Withdraw crew request", "responses": [{ "code": "200", "description": "Crew request withdrawn", "schemaRef": "TaskDetail" }, { "code": "400", "description": "Validation error - query parameters or body failed validation.", "schemaRef": "ValidationProblemDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "No matching pending crew request exists.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }, { "operationId": "withdrawOwnerApplication", "method": "delete", "path": "/tasks/{uuid}/owner-search/applications", "pathParams": [{ "name": "uuid", "required": true, "schema": { "type": "string", "format": "uuid" }, "description": "Task UUID" }], "queryParams": [], "tags": ["Tasks"], "summary": "Tasks: Withdraw own owner application", "responses": [{ "code": "200", "description": "Application withdrawn", "schemaRef": "TaskDetail" }, { "code": "401", "description": "Unauthorized - missing or invalid session.", "schemaRef": "ProblemDetail" }, { "code": "403", "description": "Forbidden - insufficient permissions.", "schemaRef": "ProblemDetail" }, { "code": "404", "description": "Resource not found.", "schemaRef": "ProblemDetail" }, { "code": "409", "description": "No active application to withdraw.", "schemaRef": "ProblemDetail" }, { "code": "500", "description": "Internal server error.", "schemaRef": "ProblemDetail" }] }], "fts": { "docs": [{ "operationId": "abortOwnerSearch", "terms": { "7748": 1, "abortownersearch": 1, "tasks": 2, "abort": 2, "owner": 4, "search": 1, "clears": 1, "looking": 1, "for": 1, "at": 1, "rejects": 1, "open": 1, "applications": 1, "and": 1, "sets": 1, "the": 1, "given": 1, "user": 1, "as": 1, "sole": 1, "t18": 1, "s10": 1, "anw": 1, "leadership": 1, "gated": 1, "without": 1, "an": 1, "is": 1, "not": 1, "allowed": 1 }, "length": 35 }, { "operationId": "acceptArtifactMemory", "terms": { "acceptartifactmemory": 1, "artifacts": 2, "accept": 1, "into": 1, "memory": 2, "explicit": 1, "validation": 1, "signal": 1, "d9": 1, "for": 2, "aura": 1, "native": 1, "ingest": 1, "enqueues": 1, "lane": 1, "a": 1, "embed": 1, "optional": 1, "kg": 1, "extract": 1, "the": 1, "artifact": 1, "s": 1, "latest": 1, "version": 1, "body": 1, "owner": 1, "only": 1, "idempotent": 1, "when": 1, "content": 1, "hash": 1, "is": 1, "unchanged": 1 }, "length": 37 }, { "operationId": "acceptTaskStoryPointEstimate", "terms": { "409": 1, "accepttaskstorypointestimate": 1, "tasks": 2, "accept": 1, "a": 2, "chat": 2, "proposed": 2, "story": 2, "point": 1, "estimate": 3, "writes": 1, "the": 1, "ai": 1, "that": 1, "task": 2, "points": 1, "trigger": 1, "answers": 1, "human": 2, "override": 1, "when": 1, "correction": 1, "is": 1, "in": 1, "effect": 1, "requires": 1, "edit": 1, "access": 1 }, "length": 37 }, { "operationId": "addArtifactReviewer", "terms": { "addartifactreviewer": 1, "artifacts": 2, "add": 1, "reviewer": 3, "mid": 1, "run": 1, "adds": 1, "a": 3, "to": 1, "running": 1, "review": 1, "creates": 1, "new": 1, "artifactreviewassignment": 1, "row": 1, "for": 1, "artifactid": 1, "version": 1, "userid": 1, "if": 1, "not": 1, "already": 1, "present": 1, "notifies": 1, "the": 1, "newly": 1, "added": 1, "requires": 1, "edit": 1, "permission": 1 }, "length": 35 }, { "operationId": "addTaskMember", "terms": { "addtaskmember": 1, "tasks": 2, "add": 1, "member": 2, "adds": 1, "a": 3, "user": 1, "as": 1, "of": 1, "task": 1, "accepts": 1, "userid": 1, "integer": 1, "or": 1, "useruuid": 1, "uuid": 1, "string": 1 }, "length": 21 }, { "operationId": "addUserGroupMember", "terms": { "409": 1, "addusergroupmember": 1, "usergroups": 2, "add": 1, "member": 2, "adds": 1, "a": 3, "user": 1, "to": 1, "group": 1, "with": 2, "lead": 1, "or": 1, "role": 1, "rejects": 1, "duplicates": 1, "leadership": 1, "admin": 1, "only": 1 }, "length": 24 }, { "operationId": "aiSetup", "terms": { "aisetup": 1, "bootstrap": 1, "an": 2, "empty": 1, "house": 1, "repository": 2, "from": 1, "the": 4, "wiki": 1, "blueprint": 2, "call": 2, "this": 2, "when": 1, "current": 3, "has": 1, "no": 4, "aura": 1, "control": 1, "layer": 1, "yet": 1, "agents": 2, "md": 1, "skills": 1, "cursor": 1, "rules": 1, "anwaltde": 1, "and": 2, "you": 1, "need": 1, "to": 4, "set": 2, "it": 1, "up": 3, "returns": 1, "ai": 2, "setup": 1, "skill": 1, "text": 1, "manifest": 1, "a": 1, "short": 1, "instruction": 1, "fetch": 1, "missing": 1, "blocks": 1, "via": 1, "getblueprintfiles": 1, "does": 1, "not": 2, "write": 1, "any": 1, "files": 1, "do": 1, "check": 1, "whether": 1, "already": 1, "repo": 1, "is": 2, "date": 1, "that": 1, "sync": 1, "mcp": 1 }, "length": 86 }, { "operationId": "applyAsCrew", "terms": { "7759": 1, "applyascrew": 1, "tasks": 2, "apply": 1, "as": 1, "crew": 3, "creates": 1, "or": 1, "refreshes": 1, "a": 1, "user": 2, "to": 2, "owner": 1, "request": 1, "while": 1, "looking": 1, "for": 1, "at": 1, "is": 1, "set": 1, "t18": 1, "s11": 1, "anw": 1, "open": 1, "any": 1, "logged": 1, "in": 1, "the": 2, "company": 1, "wide": 1, "access": 1, "exception": 1, "makes": 1, "marketplace": 1, "transparent": 1 }, "length": 41 }, { "operationId": "applyForOwner", "terms": { "7748": 1, "applyforowner": 1, "tasks": 2, "apply": 1, "as": 2, "owner": 3, "applies": 2, "or": 1, "re": 1, "after": 1, "withdrawal": 1, "while": 1, "looking": 1, "for": 1, "at": 1, "is": 1, "set": 1, "t18": 1, "s10": 1, "anw": 1, "open": 1, "to": 1, "any": 1, "logged": 1, "in": 1, "user": 1, "the": 2, "company": 1, "wide": 1, "access": 1, "exception": 1, "makes": 1, "marketplace": 1, "transparent": 1 }, "length": 40 }, { "operationId": "approveGlossaryEntry", "terms": { "approveglossaryentry": 1, "glossary": 3, "approve": 1, "a": 2, "pending": 2, "proposal": 1, "admin": 2, "only": 2, "transitions": 1, "entry": 2, "to": 1, "approved": 2, "and": 1, "triggers": 1, "embedding": 1, "idempotent": 1, "when": 1, "the": 1, "is": 1, "already": 1, "requires": 1, "manage": 1, "capability": 1 }, "length": 31 }, { "operationId": "approveOntologyProposal", "terms": { "approveontologyproposal": 1, "ontology": 2, "approve": 1, "proposal": 2, "admin": 2, "enqueues": 1, "kg": 1, "apply": 1, "for": 1, "a": 1, "pending": 1, "requires": 1, "role": 1, "ontologyproposals": 1 }, "length": 17 }, { "operationId": "assignOwnerFromSearch", "terms": { "7748": 1, "assignownerfromsearch": 1, "tasks": 2, "assign": 1, "owner": 6, "during": 1, "search": 1, "leadership": 1, "manually": 1, "sets": 1, "the": 5, "task": 1, "while": 1, "looking": 2, "for": 2, "at": 2, "is": 1, "set": 1, "t18": 1, "s10": 1, "anw": 1, "an": 2, "applicant": 3, "application": 1, "consent": 1, "or": 1, "audited": 1, "override": 1, "of": 1, "a": 1, "non": 1, "accepts": 1, "chosen": 2, "rejects": 1, "rest": 1, "clears": 1, "notifies": 1, "only": 1, "does": 1, "not": 1, "change": 1, "workflow": 1, "status": 1 }, "length": 60 }, { "operationId": "assignTaskToProject", "terms": { "assigntasktoproject": 1, "projects": 2, "assign": 1, "task": 5, "assigns": 1, "a": 1, "to": 2, "the": 5, "project": 3, "requires": 1, "edit": 1, "on": 1, "manage": 1, "links": 1, "tier": 1, "idempotent": 1, "rejects": 2, "if": 1, "already": 1, "inherits": 1, "from": 1, "an": 3, "ancestor": 2, "when": 1, "assigning": 2, "absorbs": 1, "redundant": 1, "descendant": 1, "assignments": 1, "in": 1, "same": 1, "transaction": 1, "archived": 1 }, "length": 50 }, { "operationId": "attachTagToTask", "terms": { "attachtagtotask": 1, "tasks": 2, "attach": 1, "a": 3, "tag": 3, "attaches": 1, "to": 1, "task": 2, "by": 3, "slug": 2, "creates": 1, "the": 2, "if": 1, "it": 1, "does": 1, "not": 1, "exist": 1, "yet": 1, "upsert": 1, "idempotent": 1, "must": 1, "be": 1, "owned": 1, "current": 1, "user": 1 }, "length": 35 }, { "operationId": "batchUpsertTaskPhaseGoals", "terms": { "400": 1, "7516": 1, "batchupserttaskphasegoals": 1, "tasks": 2, "batch": 1, "save": 1, "phase": 3, "goals": 2, "deadline": 2, "text": 1, "for": 2, "intermediate": 1, "atomically": 1, "upserts": 1, "or": 2, "a": 2, "cleared": 1, "row": 3, "deletes": 2, "one": 1, "more": 1, "goal": 3, "rows": 1, "t18": 1, "s28": 1, "anw": 1, "frontend": 1, "redesign": 1, "each": 1, "s": 3, "target": 1, "status": 3, "must": 3, "be": 2, "part": 1, "of": 2, "the": 3, "task": 2, "resolved": 1, "series": 2, "and": 2, "not": 1, "already": 1, "have": 1, "been": 1, "reached": 1, "i": 1, "e": 1, "its": 1, "index": 1, "in": 1, "current": 1, "otherwise": 1, "with": 1, "null": 1, "an": 1, "empty": 1, "description": 1, "that": 1, "instead": 1, "upserting": 1, "it": 1, "requires": 1, "edit": 1, "access": 1 }, "length": 91 }, { "operationId": "cancelArtifactReview", "terms": { "cancelartifactreview": 1, "artifacts": 2, "cancel": 1, "review": 2, "cancels": 1, "the": 1, "running": 1, "for": 2, "a": 2, "specific": 1, "version": 2, "deletes": 1, "all": 2, "artifactreviewassignment": 1, "and": 2, "artifactapproval": 1, "rows": 1, "artifactid": 1, "sets": 1, "reviewstate": 1, "back": 1, "to": 1, "unchecked": 1, "notifies": 1, "still": 1, "pending": 1, "reviewers": 1, "those": 1, "without": 1, "decision": 1, "requires": 1, "edit": 1, "permission": 1 }, "length": 40 }, { "operationId": "cancelRun", "terms": { "cancelrun": 1, "runs": 2, "cancel": 1, "a": 1, "running": 1, "run": 2, "admin": 2, "sets": 2, "the": 4, "status": 1, "to": 2, "cancelling": 1, "and": 1, "signals": 1, "pg": 1, "boss": 1, "job": 1, "abort": 1, "cooperatively": 1, "worker": 1, "cancelled": 1, "once": 1, "process": 1, "exits": 1, "requires": 1, "role": 1 }, "length": 34 }, { "operationId": "changeFeedbackStatus", "terms": { "changefeedbackstatus": 1, "feedback": 4, "change": 1, "status": 1, "triage": 1, "a": 1, "entry": 1, "discarded": 1, "requires": 2, "discard": 1, "reason": 1, "view": 1 }, "length": 16 }, { "operationId": "clearTaskAsap", "terms": { "930": 1, "1147": 1, "cleartaskasap": 1, "tasks": 2, "clear": 1, "asap": 4, "owner": 1, "only": 1, "aura": 2, "d": 2, "017": 1, "removes": 1, "the": 3, "mark": 1, "task": 3, "keeps": 1, "its": 1, "rank": 1, "untouched": 1, "012": 1, "writes": 1, "cleared": 1, "when": 1, "was": 1, "a": 1, "no": 1, "op": 1, "otherwise": 1 }, "length": 38 }, { "operationId": "confirmAsanaLink", "terms": { "409": 1, "confirmasanalink": 1, "asana": 5, "confirm": 1, "a": 2, "proposed": 1, "link": 4, "confirms": 1, "an": 1, "propose": 1, "chat": 1, "tool": 1, "proposal": 3, "identified": 1, "by": 1, "toolcallid": 1, "sets": 1, "the": 6, "on": 1, "task": 2, "targeted": 1, "idempotent": 1, "confirming": 1, "same": 1, "twice": 1, "returns": 2, "existing": 1, "instead": 1, "of": 1, "erroring": 1, "when": 1, "object": 1, "is": 1, "already": 1, "linked": 1, "to": 1, "different": 1 }, "length": 54 }, { "operationId": "confirmCrewRemoval", "terms": { "7759": 1, "confirmcrewremoval": 1, "tasks": 2, "confirm": 1, "crew": 3, "removal": 2, "confirms": 1, "a": 1, "pending": 1, "proposal": 1, "and": 1, "removes": 1, "the": 1, "member": 1, "s": 1, "granted": 1, "role": 1, "t18": 1, "s11": 1, "anw": 1 }, "length": 24 }, { "operationId": "confirmFeedback", "terms": { "confirmfeedback": 1, "feedback": 5, "confirm": 1, "a": 2, "chat": 1, "proposal": 1, "creates": 1, "the": 2, "row": 1, "for": 1, "propose": 1, "tool": 1, "call": 1, "owned": 1, "by": 1, "caller": 1, "idempotent": 1, "on": 1, "toolcallid": 1, "requires": 1, "submit": 1 }, "length": 27 }, { "operationId": "confirmSkillImport", "terms": { "confirmskillimport": 1, "confirm": 1, "import": 1, "of": 1, "selected": 1, "skills": 2, "and": 1, "start": 1, "background": 1, "indexing": 1 }, "length": 11 }, { "operationId": "createAsanaTaskForTask", "terms": { "409": 1, "422": 1, "502": 1, "1423": 1, "createasanataskfortask": 1, "tasks": 2, "create": 1, "the": 11, "asana": 6, "counterpart": 1, "creates": 1, "object": 3, "for": 1, "a": 5, "task": 3, "and": 1, "links": 1, "it": 5, "in": 3, "same": 1, "step": 1, "s6": 1, "aura": 1, "where": 2, "is": 7, "created": 5, "follows": 1, "nearest": 1, "ancestor": 1, "that": 2, "already": 3, "linked": 4, "to": 1, "under": 2, "parent": 1, "becomes": 1, "subtask": 1, "project": 2, "caller": 1, "s": 1, "own": 1, "connected": 3, "account": 3, "used": 1, "settings": 1, "integrations": 1, "there": 1, "no": 5, "service": 1, "error": 3, "responses": 1, "carry": 1, "type": 1, "discriminator": 1, "when": 2, "not": 1, "stored": 1, "token": 2, "unusable": 1, "invalid": 1, "or": 2, "has": 1, "an": 2, "target": 2, "could": 1, "be": 1, "derived": 1, "nothing": 1, "was": 2, "on": 1, "upstream": 1, "including": 1, "case": 2, "but": 1, "linking": 1, "failed": 1, "which": 1, "message": 1, "names": 1, "gid": 1, "chat": 1, "free": 1, "by": 1, "design": 1, "mcp": 1, "agent": 1, "tool": 1, "exposes": 1, "this": 1 }, "length": 155 }, { "operationId": "createComment", "terms": { "createcomment": 1, "comments": 2, "create": 1, "creates": 1, "a": 1, "new": 1, "comment": 1, "on": 1, "an": 1, "entity": 1, "caller": 1, "must": 1, "have": 1, "at": 1, "least": 1, "read": 1, "access": 1 }, "length": 18 }, { "operationId": "createFeedback", "terms": { "createfeedback": 1, "feedback": 4, "create": 1, "submits": 1, "a": 1, "entry": 1, "requires": 1, "submit": 1, "anonymous": 1, "submissions": 1, "store": 1, "no": 1, "authorid": 1 }, "length": 16 }, { "operationId": "createGlossaryEntry", "terms": { "createglossaryentry": 1, "glossary": 3, "create": 1, "creates": 1, "a": 1, "new": 1, "entry": 1, "and": 1, "triggers": 1, "embedding": 1 }, "length": 12 }, { "operationId": "createKnowledgeNode", "terms": { "createknowledgenode": 1, "create": 1, "a": 1, "folder": 1, "or": 1, "document": 1, "node": 1, "knowledge": 1 }, "length": 8 }, { "operationId": "createKnowledgeSpace", "terms": { "createknowledgespace": 1, "create": 1, "a": 1, "knowledge": 2, "space": 1 }, "length": 6 }, { "operationId": "createMcpAccessToken", "terms": { "createmcpaccesstoken": 1, "me": 1, "create": 1, "mcp": 3, "access": 2, "token": 3, "creates": 1, "a": 1, "new": 1, "the": 2, "plaintext": 1, "is": 1, "returned": 1, "once": 1, "in": 1, "response": 1, "and": 1, "cannot": 1, "be": 1, "retrieved": 1, "again": 1 }, "length": 27 }, { "operationId": "createProject", "terms": { "createproject": 1, "projects": 2, "create": 1, "creates": 1, "a": 1, "project": 1, "leadership": 1, "admin": 1, "only": 1, "title": 1, "is": 1, "case": 1, "insensitive": 1, "unique": 1 }, "length": 15 }, { "operationId": "createRepository", "terms": { "createrepository": 1, "repositories": 2, "create": 1, "creates": 1, "a": 1, "new": 1, "repository": 1, "entry": 1, "admin": 1, "only": 1 }, "length": 11 }, { "operationId": "createSkill", "terms": { "createskill": 1, "create": 1, "a": 2, "skill": 2, "creates": 1, "new": 1, "document": 1, "in": 1, "the": 1, "canonical": 1, "skills": 2, "space": 1, "visibility": 1, "defaults": 1, "to": 1, "personal": 1 }, "length": 19 }, { "operationId": "createTask", "terms": { "createtask": 1, "tasks": 2, "create": 1, "creates": 1, "a": 1, "new": 1, "task": 1, "the": 2, "authenticated": 1, "user": 1, "is": 1, "automatically": 1, "set": 1, "as": 1, "creator": 1, "and": 1, "first": 1, "owner": 1 }, "length": 20 }, { "operationId": "createTaskFromSignal", "terms": { "createtaskfromsignal": 1, "signals": 2, "create": 1, "task": 3, "from": 2, "signal": 2, "creates": 1, "an": 1, "aura": 1, "prefilled": 1, "the": 1, "summary": 1, "evidence": 1, "idempotent": 1, "when": 1, "a": 1, "primary": 1, "link": 1, "already": 1, "exists": 1 }, "length": 25 }, { "operationId": "createTaskJiraIssue", "terms": { "200": 1, "201": 1, "1239": 1, "createtaskjiraissue": 1, "tasks": 2, "create": 3, "and": 2, "link": 3, "a": 5, "jira": 3, "issue": 3, "creates": 1, "from": 1, "the": 7, "task": 2, "s": 1, "derived": 1, "fields": 1, "mirrors": 1, "it": 3, "locally": 1, "links": 1, "to": 1, "same": 1, "mirror": 1, "chain": 1, "chat": 1, "confirmation": 1, "uses": 1, "guarded": 1, "by": 1, "row": 1, "lock": 1, "so": 1, "two": 2, "concurrent": 1, "clicks": 1, "cannot": 1, "issues": 1, "aura": 1, "on": 1, "race": 1, "returns": 2, "with": 2, "already": 1, "linked": 1, "true": 1, "instead": 1, "of": 1, "duplicate": 1, "if": 1, "was": 1, "created": 1, "in": 1, "but": 1, "local": 1, "failed": 1, "still": 1, "linking": 1, "warning": 1, "set": 1, "next": 1, "sync": 1, "repairs": 1 }, "length": 90 }, { "operationId": "createTaskRelation", "terms": { "409": 1, "createtaskrelation": 1, "tasks": 2, "create": 1, "a": 2, "relation": 2, "creates": 1, "typed": 1, "directed": 1, "from": 3, "this": 1, "task": 2, "to": 3, "another": 1, "self": 1, "edges": 1, "are": 2, "rejected": 2, "duplicate": 1, "type": 1, "triples": 1, "with": 1 }, "length": 32 }, { "operationId": "createUserGroup", "terms": { "createusergroup": 1, "usergroups": 2, "create": 1, "creates": 1, "a": 1, "new": 1, "user": 2, "group": 2, "leadership": 1, "admin": 1, "only": 1, "manage": 1, "groups": 1, "the": 1, "grants": 1, "no": 1, "permissions": 1 }, "length": 20 }, { "operationId": "debugTriggerTaskActivity", "terms": { "7056": 1, "debugtriggertaskactivity": 1, "tasks": 2, "debug": 2, "fire": 1, "sample": 2, "activity": 2, "event": 2, "only": 1, "fires": 1, "a": 1, "task": 1, "status": 1, "changed": 1, "for": 1, "human": 1, "test": 1, "verification": 1, "will": 1, "be": 1, "removed": 1, "when": 1, "the": 1, "timeline": 1, "ui": 1, "anw": 1, "is": 1, "delivered": 1 }, "length": 33 }, { "operationId": "declineCrewRemoval", "terms": { "7759": 1, "declinecrewremoval": 1, "tasks": 2, "decline": 1, "crew": 3, "removal": 2, "declines": 1, "a": 1, "pending": 1, "proposal": 1, "and": 1, "keeps": 1, "the": 1, "member": 1, "s": 1, "granted": 1, "role": 1, "in": 1, "place": 1, "t18": 1, "s11": 1, "anw": 1 }, "length": 26 }, { "operationId": "deleteArtifact", "terms": { "404": 2, "deleteartifact": 1, "artifacts": 2, "delete": 2, "soft": 2, "owner": 2, "only": 2, "deletes": 1, "an": 1, "artifact": 2, "by": 2, "setting": 1, "status": 1, "to": 1, "deleted": 2, "no": 1, "data": 1, "is": 3, "removed": 1, "permission": 1, "manage": 1, "a": 1, "task": 1, "member": 1, "with": 1, "edit": 1, "access": 1, "gets": 1, "if": 1, "the": 2, "does": 1, "not": 2, "exist": 1, "already": 1, "or": 1, "owned": 1, "current": 1, "user": 1 }, "length": 51 }, { "operationId": "deleteComment", "terms": { "deletecomment": 1, "comments": 2, "delete": 1, "hard": 1, "deletes": 1, "a": 2, "comment": 2, "allowed": 1, "for": 1, "the": 2, "author": 1, "or": 1, "user": 1, "with": 1, "manage": 1, "permission": 1, "on": 1, "entity": 1, "mentions": 1, "are": 1, "cascade": 1, "deleted": 1 }, "length": 26 }, { "operationId": "deleteGlossaryEntry", "terms": { "deleteglossaryentry": 1, "glossary": 3, "delete": 1, "deletes": 1, "a": 1, "entry": 1, "and": 1, "removes": 1, "its": 1, "embeddings": 1 }, "length": 12 }, { "operationId": "deleteKnowledgeNode", "terms": { "deleteknowledgenode": 1, "delete": 1, "a": 2, "node": 2, "cascades": 1, "to": 1, "children": 1, "versions": 1, "and": 2, "file": 2, "assets": 2, "deletes": 1, "the": 3, "for": 1, "folder": 1, "its": 1, "whole": 1, "subtree": 2, "in": 1, "that": 1, "lose": 1, "their": 1, "stored": 1, "objects": 1, "too": 1, "db": 1, "cascade": 1, "alone": 1, "would": 1, "leave": 1, "blobs": 1, "behind": 1, "knowledge": 1 }, "length": 41 }, { "operationId": "deleteKnowledgeSpace", "terms": { "deleteknowledgespace": 1, "delete": 1, "a": 1, "knowledge": 2, "space": 1, "cascades": 1, "to": 1, "all": 1, "nodes": 1 }, "length": 10 }, { "operationId": "deleteProject", "terms": { "deleteproject": 1, "projects": 2, "hard": 1, "delete": 1, "permanently": 1, "deletes": 1, "the": 1, "project": 1, "and": 1, "all": 1, "its": 1, "link": 1, "rows": 1, "cascade": 1, "leadership": 1, "admin": 1, "only": 1 }, "length": 18 }, { "operationId": "deleteRepository", "terms": { "deleterepository": 1, "repositories": 2, "delete": 1, "deletes": 1, "a": 1, "repository": 1, "entry": 1, "admin": 1, "only": 1 }, "length": 10 }, { "operationId": "deleteSkill", "terms": { "deleteskill": 1, "delete": 1, "a": 1, "skill": 1, "owner": 1, "only": 1, "skills": 1 }, "length": 7 }, { "operationId": "deleteSkillAsset", "terms": { "deleteskillasset": 1, "delete": 1, "a": 1, "skill": 1, "asset": 1, "owner": 1, "only": 1, "skills": 1 }, "length": 8 }, { "operationId": "deleteSkillPlugin", "terms": { "deleteskillplugin": 1, "delete": 1, "a": 1, "skill": 2, "plugin": 2, "admin": 1, "only": 1, "deletes": 1, "the": 2, "folder": 1, "and": 2, "every": 1, "reference": 1, "document": 1, "embedding": 1, "chunk": 1, "stored": 1, "asset": 1, "below": 1, "it": 1, "requires": 1, "manage": 1, "skills": 2, "capability": 1 }, "length": 29 }, { "operationId": "deleteTaskRelation", "terms": { "deletetaskrelation": 1, "tasks": 2, "delete": 1, "a": 2, "relation": 3, "removes": 1, "typed": 1, "by": 2, "its": 1, "uuid": 2, "the": 2, "must": 1, "belong": 1, "to": 1, "task": 1, "identified": 1 }, "length": 23 }, { "operationId": "deleteUserGroup", "terms": { "deleteusergroup": 1, "usergroups": 2, "delete": 1, "deletes": 1, "a": 1, "user": 1, "group": 1, "and": 1, "cascades": 1, "its": 1, "memberships": 1, "users": 1, "are": 1, "not": 1, "affected": 1, "leadership": 1, "admin": 1, "only": 1 }, "length": 19 }, { "operationId": "detachTagFromTask", "terms": { "detachtagfromtask": 1, "tasks": 2, "detach": 1, "a": 1, "tag": 3, "removes": 1, "the": 2, "task": 1, "link": 1, "itself": 1, "is": 1, "not": 1, "deleted": 1, "idempotent": 1 }, "length": 18 }, { "operationId": "disableRepositoryCodeSearch", "terms": { "disablerepositorycodesearch": 1, "repositories": 3, "disable": 1, "code": 2, "search": 2, "disables": 1, "for": 2, "the": 2, "repository": 2, "sets": 1, "codesearchenabled": 1, "false": 1, "and": 1, "deletes": 1, "all": 1, "repositorycodecheckout": 1, "rows": 1, "this": 1, "requires": 1, "manage": 1, "capability": 1 }, "length": 28 }, { "operationId": "discardTask", "terms": { "16": 1, "7525": 1, "discardtask": 1, "tasks": 2, "discard": 1, "aborts": 1, "a": 1, "task": 1, "to": 1, "discarded": 1, "from": 1, "any": 1, "non": 1, "terminal": 1, "status": 1, "t18": 1, "s05": 1, "anw": 1, "matrix": 1, "owner": 1, "only": 1, "reversible": 1, "via": 1, "the": 1, "reopen": 1, "endpoint": 1, "ends": 1, "crew": 1, "stakeholder": 1, "membership": 1, "roles": 1, "cleared": 1, "member": 1, "row": 1, "kept": 1 }, "length": 36 }, { "operationId": "downloadKnowledgeFile", "terms": { "downloadknowledgefile": 1, "download": 1, "the": 2, "bytes": 2, "of": 1, "a": 1, "file": 1, "node": 1, "streams": 1, "stored": 1, "byte": 1, "identically": 1, "responds": 1, "with": 1, "content": 1, "disposition": 1, "attachment": 1, "unless": 1, "inline": 1, "true": 1, "is": 1, "requested": 1, "knowledge": 1 }, "length": 25 }, { "operationId": "downloadSkillAsset", "terms": { "downloadskillasset": 1, "download": 1, "a": 1, "skill": 1, "asset": 1, "skills": 1 }, "length": 6 }, { "operationId": "draftTaskRankReason", "terms": { "930": 1, "1147": 1, "drafttaskrankreason": 1, "tasks": 2, "draft": 2, "an": 1, "ordering": 1, "rationale": 2, "owner": 2, "only": 1, "aura": 2, "d": 1, "015": 1, "generates": 1, "a": 1, "short": 1, "from": 1, "the": 3, "task": 1, "s": 1, "content": 1, "via": 2, "utility": 1, "model": 1, "never": 1, "persisted": 1, "edits": 1, "it": 1, "and": 1, "publishes": 1, "put": 1, "rank": 1, "reason": 1 }, "length": 41 }, { "operationId": "enableRepositoryCodeSearch", "terms": { "enablerepositorycodesearch": 1, "repositories": 3, "enable": 1, "code": 2, "search": 2, "enables": 1, "for": 2, "the": 3, "repository": 1, "sets": 1, "codesearchenabled": 1, "true": 1, "and": 1, "creates": 1, "a": 1, "repositorycodecheckout": 1, "row": 1, "default": 1, "branch": 1, "with": 1, "status": 1, "not": 1, "cloned": 1, "requires": 1, "manage": 1, "capability": 1 }, "length": 33 }, { "operationId": "endCrewSearch", "terms": { "7759": 1, "endcrewsearch": 1, "tasks": 2, "end": 1, "crew": 3, "search": 1, "clears": 1, "looking": 1, "for": 1, "at": 1, "and": 1, "closes": 1, "open": 1, "requests": 1, "while": 1, "keeping": 1, "the": 1, "task": 2, "in": 1, "its": 1, "current": 1, "workflow": 1, "status": 1, "t18": 1, "s11": 1, "anw": 1, "requires": 1, "level": 1, "manage": 1, "access": 1, "or": 1, "a": 1, "leadership": 1, "admin": 1, "system": 1, "override": 1 }, "length": 40 }, { "operationId": "estimateTaskStoryPoints", "terms": { "estimatetaskstorypoints": 1, "tasks": 3, "run": 1, "the": 2, "ai": 2, "story": 2, "point": 2, "estimator": 1, "runs": 1, "estimate": 1, "agent": 1, "once": 1, "and": 2, "appends": 1, "an": 1, "history": 1, "row": 2, "including": 1, "a": 2, "reasoned": 1, "refusal": 1, "technical": 1, "abort": 1, "writes": 1, "no": 1, "requires": 1, "task": 1, "edit": 1, "access": 1, "only": 1, "stories": 1, "sub": 1, "are": 1, "eligible": 1 }, "length": 43 }, { "operationId": "getActiveSkillImportRun", "terms": { "getactiveskillimportrun": 1, "get": 1, "the": 4, "active": 2, "skill": 2, "import": 2, "run": 3, "for": 1, "current": 2, "user": 2, "returns": 1, "most": 1, "recent": 1, "pending": 1, "or": 2, "running": 1, "triggered": 1, "by": 1, "null": 1, "if": 1, "no": 1, "exists": 1, "skills": 1 }, "length": 34 }, { "operationId": "getArtifact", "terms": { "403": 1, "404": 1, "7662": 1, "getartifact": 1, "artifacts": 2, "get": 1, "detail": 2, "returns": 1, "the": 4, "of": 1, "an": 1, "artifact": 2, "including": 1, "its": 1, "latest": 1, "version": 1, "body": 1, "when": 2, "does": 1, "not": 1, "exist": 1, "or": 1, "is": 1, "inactive": 1, "deleted": 1, "anw": 1, "it": 1, "exists": 1, "but": 1, "caller": 1, "lacks": 1, "access": 1, "naming": 1, "owner": 1, "in": 1, "meta": 1 }, "length": 43 }, { "operationId": "getArtifactAccessOverview", "terms": { "7754": 1, "getartifactaccessoverview": 1, "artifacts": 2, "access": 3, "overview": 1, "flat": 2, "returns": 1, "a": 1, "deduplicated": 1, "list": 1, "of": 2, "users": 1, "who": 1, "have": 1, "to": 1, "this": 1, "artifact": 2, "owner": 1, "direct": 1, "members": 1, "linked": 1, "tasks": 1, "for": 1, "the": 2, "share": 1, "modal": 1, "anw": 1, "requires": 1, "read": 1, "on": 1, "purely": 1, "informational": 1, "no": 1, "mutation": 1, "affordances": 1 }, "length": 42 }, { "operationId": "getArtifactApprovals", "terms": { "getartifactapprovals": 1, "artifacts": 2, "get": 1, "approval": 2, "status": 2, "returns": 1, "the": 1, "review": 1, "for": 1, "a": 1, "specific": 1, "version": 2, "of": 2, "an": 1, "artifact": 1, "includes": 1, "x": 1, "y": 1, "count": 1, "list": 1, "deciders": 1, "and": 1, "pending": 1, "reviewers": 1, "defaults": 1, "to": 1, "latest": 1 }, "length": 32 }, { "operationId": "getArtifactReview", "terms": { "getartifactreview": 1, "artifacts": 3, "get": 1, "review": 5, "overview": 1, "returns": 1, "the": 3, "current": 1, "state": 1, "version": 1, "under": 1, "in": 1, "or": 1, "latest": 1, "per": 1, "person": 1, "status": 1, "for": 2, "each": 1, "assigned": 1, "reviewer": 1, "and": 1, "list": 1, "of": 1, "linked": 1, "via": 1, "reviewof": 1, "this": 1, "run": 1, "requires": 1, "at": 1, "minimum": 1, "read": 1, "access": 1 }, "length": 43 }, { "operationId": "getArtifactReviewPreview", "terms": { "getartifactreviewpreview": 1, "artifacts": 2, "preview": 1, "review": 1, "recipients": 1, "returns": 1, "the": 5, "deduplicated": 1, "list": 2, "of": 1, "users": 2, "who": 1, "would": 1, "be": 1, "notified": 1, "and": 2, "linked": 1, "tasks": 1, "affected": 1, "for": 1, "given": 1, "roles": 1, "explicitly": 1, "added": 1, "read": 1, "only": 1, "no": 1, "notifications": 1, "sent": 1, "calling": 1, "user": 1, "is": 1, "excluded": 1, "from": 1, "reviewers": 1, "matching": 1, "actual": 1, "dispatch": 1, "behaviour": 1 }, "length": 47 }, { "operationId": "getArtifactReviseContext", "terms": { "7116": 1, "getartifactrevisecontext": 1, "artifacts": 3, "get": 1, "revisebot": 2, "context": 1, "returns": 1, "the": 3, "review": 2, "linked": 1, "to": 1, "current": 1, "in": 1, "run": 1, "of": 1, "this": 1, "artifact": 1, "via": 1, "reviewofartifactid": 1, "reviewofversion": 1, "read": 2, "only": 1, "data": 1, "contract": 1, "for": 1, "anw": 1, "requires": 1, "at": 1, "minimum": 1, "access": 1 }, "length": 37 }, { "operationId": "getArtifactVersion", "terms": { "400": 1, "404": 1, "getartifactversion": 1, "artifacts": 2, "get": 1, "version": 4, "detail": 1, "returns": 1, "the": 1, "full": 1, "body": 1, "and": 1, "metadata": 1, "of": 1, "a": 1, "specific": 1, "artifact": 2, "for": 2, "non": 1, "numeric": 1, "unknown": 1, "uuid": 1, "or": 1, "number": 1 }, "length": 30 }, { "operationId": "getAsanaCreateTargetForTask", "terms": { "409": 1, "422": 1, "1423": 1, "getasanacreatetargetfortask": 1, "tasks": 2, "resolve": 1, "where": 1, "the": 8, "asana": 3, "counterpart": 2, "would": 2, "be": 1, "created": 1, "names": 1, "target": 2, "create": 1, "dialog": 1, "write": 3, "into": 1, "s6": 1, "aura": 2, "derived": 1, "from": 1, "nearest": 1, "ancestor": 3, "that": 1, "is": 2, "already": 3, "linked": 4, "to": 2, "same": 1, "resolution": 1, "path": 1, "runs": 1, "so": 1, "preview": 1, "and": 1, "cannot": 1, "disagree": 1, "reads": 1, "only": 1, "s": 1, "mirror": 1, "no": 5, "call": 1, "connected": 1, "account": 1, "required": 1, "when": 2, "task": 1, "has": 1, "a": 1, "or": 1, "belongs": 1, "project": 1 }, "length": 85 }, { "operationId": "getAsanaStatus", "terms": { "getasanastatus": 1, "asana": 4, "connection": 1, "status": 1, "returns": 1, "whether": 1, "the": 1, "authenticated": 1, "user": 1, "has": 1, "a": 2, "connected": 2, "account": 1, "when": 1, "pat": 1, "is": 2, "stored": 1, "validates": 1, "it": 1, "against": 1, "s": 1, "get": 1, "users": 1, "me": 1, "so": 1, "token": 1, "invalid": 1, "distinguishable": 1, "from": 1, "not": 1 }, "length": 36 }, { "operationId": "getAsanaTask", "terms": { "404": 1, "getasanatask": 1, "asana": 4, "tasks": 1, "get": 1, "locally": 2, "mirrored": 2, "detail": 2, "returns": 1, "the": 1, "full": 1, "of": 1, "a": 1, "single": 1, "task": 1, "addressed": 1, "by": 1, "gid": 1, "project": 1, "rows": 1, "sagas": 1, "are": 1, "not": 1, "exposed": 1, "no": 1, "account": 1, "is": 1, "required": 1 }, "length": 34 }, { "operationId": "getBlueprintFiles", "terms": { "getblueprintfiles": 1, "fetch": 2, "house": 2, "blueprint": 4, "files": 1, "by": 3, "path": 2, "one": 1, "file": 3, "or": 4, "every": 1, "in": 1, "a": 4, "skill": 1, "directory": 2, "from": 1, "the": 3, "engineering": 1, "foundation": 1, "under": 1, "only": 1, "vs": 1, "is": 1, "decided": 1, "node": 1, "not": 2, "flag": 1, "pass": 1, "an": 1, "optional": 1, "version": 2, "stamp": 1, "sha256": 1, "checksum": 1, "integer": 1, "to": 1, "pin": 1, "specific": 1, "revision": 1, "omit": 1, "it": 1, "for": 3, "current": 1, "use": 2, "when": 1, "ai": 2, "setup": 1, "sync": 1, "needs": 1, "bytes": 1, "of": 1, "named": 1, "building": 1, "block": 1, "do": 1, "this": 1, "aura": 1, "product": 1, "skills": 1, "mcpgetskill": 1, "wiki": 1, "pages": 1, "outside": 1, "mcp": 1 }, "length": 89 }, { "operationId": "getBoardBriefing", "terms": { "getboardbriefing": 1, "boards": 2, "ai": 2, "generated": 2, "personal": 2, "briefing": 1, "returns": 2, "a": 2, "short": 1, "situation": 2, "report": 1, "for": 1, "the": 2, "authenticated": 1, "user": 2, "s": 2, "board": 1, "cached": 1, "with": 1, "content": 1, "hash": 1, "signature": 1, "stored": 1, "text": 1, "without": 1, "an": 1, "llm": 1, "call": 1, "when": 1, "has": 1, "not": 1, "changed": 1 }, "length": 42 }, { "operationId": "getBoardSummary", "terms": { "getboardsummary": 1, "boards": 2, "personal": 2, "attention": 2, "summary": 1, "aggregates": 1, "projections": 1, "for": 1, "the": 1, "authenticated": 1, "user": 1, "waiting": 2, "on": 2, "me": 1, "others": 1, "and": 1, "overdue": 1, "yellow": 1, "red": 1, "traffic": 1, "light": 1, "against": 1, "taskphasegoal": 1, "deadlines": 1, "notifications": 2, "are": 1, "not": 1, "included": 1, "use": 1, "get": 1, "no": 1, "new": 1, "db": 1, "model": 1, "pure": 1, "reads": 1, "over": 1, "existing": 1, "tables": 1 }, "length": 45 }, { "operationId": "getCapacitySettings", "terms": { "7772": 1, "getcapacitysettings": 1, "capacity": 5, "get": 1, "company": 1, "base": 2, "setting": 1, "t18": 1, "s27": 1, "anw": 1, "read": 1, "the": 1, "firm": 1, "wide": 1, "percentage": 1, "and": 1, "optional": 1, "explanation": 1, "note": 1, "leadership": 1, "admin": 1 }, "length": 26 }, { "operationId": "getCommentImage", "terms": { "getcommentimage": 1, "comments": 2, "get": 1, "image": 2, "returns": 1, "the": 2, "binary": 1, "requires": 1, "read": 1, "access": 1, "on": 1, "parent": 1, "entity": 1 }, "length": 16 }, { "operationId": "getFeedback", "terms": { "getfeedback": 1, "feedback": 4, "get": 1, "detail": 1, "returns": 1, "one": 1, "entry": 1, "requires": 1, "view": 1 }, "length": 12 }, { "operationId": "getGlossaryEntry", "terms": { "getglossaryentry": 1, "glossary": 2, "get": 1, "detail": 1 }, "length": 5 }, { "operationId": "getHealth", "terms": { "gethealth": 1, "health": 2, "status": 1, "check": 1 }, "length": 5 }, { "operationId": "getJiraIssue", "terms": { "getjiraissue": 1, "jira": 2, "issues": 1, "get": 1, "locally": 2, "mirrored": 2, "detail": 2, "admin": 2, "returns": 1, "the": 1, "full": 1, "of": 1, "a": 1, "single": 1, "issue": 1, "addressed": 1, "by": 1, "cloudid": 1, "issuekey": 1, "requires": 1, "role": 1, "jiraissues": 1 }, "length": 27 }, { "operationId": "getKnowledgeNode", "terms": { "getknowledgenode": 1, "get": 1, "a": 1, "single": 1, "node": 1, "includes": 1, "body": 1, "for": 1, "documents": 1, "knowledge": 1 }, "length": 10 }, { "operationId": "getKnowledgeNodeByPath", "terms": { "getknowledgenodebypath": 1, "get": 1, "a": 3, "knowledge": 2, "node": 3, "by": 2, "its": 1, "slug": 2, "path": 1, "within": 1, "space": 1, "resolves": 1, "document": 2, "traversing": 1, "the": 3, "hierarchy": 1, "returns": 1, "full": 1, "including": 1, "body": 1, "suitable": 1, "for": 1, "rendering": 1, "view": 1 }, "length": 34 }, { "operationId": "getKnowledgeNodeImage", "terms": { "getknowledgenodeimage": 1, "serve": 1, "an": 1, "image": 1, "for": 1, "a": 1, "knowledge": 2, "node": 1 }, "length": 9 }, { "operationId": "getKnowledgeNodeVersion", "terms": { "getknowledgenodeversion": 1, "get": 1, "a": 2, "specific": 1, "version": 1, "of": 1, "document": 1, "node": 1, "knowledge": 1 }, "length": 10 }, { "operationId": "getKnowledgeSpace", "terms": { "getknowledgespace": 1, "get": 1, "a": 1, "knowledge": 2, "space": 1, "by": 1, "slug": 1 }, "length": 8 }, { "operationId": "getKnowledgeTree", "terms": { "getknowledgetree": 1, "get": 2, "the": 5, "full": 1, "node": 1, "tree": 3, "for": 1, "a": 1, "space": 1, "returns": 1, "complete": 1, "of": 1, "folders": 1, "and": 2, "documents": 1, "body": 1, "omitted": 2, "load": 1, "via": 1, "knowledge": 2, "nodes": 2, "uuid": 1, "optional": 1, "depth": 1, "max": 1, "bound": 1, "answer": 1, "whole": 1, "comes": 1, "back": 1 }, "length": 41 }, { "operationId": "getLlmTurnPayload", "terms": { "404": 1, "getllmturnpayload": 1, "llm": 2, "turns": 3, "get": 1, "payload": 3, "loads": 1, "the": 2, "full": 1, "system": 1, "prompt": 1, "messages": 1, "raw": 1, "response": 1, "of": 1, "a": 2, "single": 1, "turn": 2, "from": 1, "s3": 2, "owner": 1, "sees": 2, "their": 1, "own": 1, "admin": 1, "all": 1, "returns": 1, "if": 1, "has": 1, "no": 1, "old": 1, "row": 1, "or": 1, "write": 1, "time": 1, "failure": 1 }, "length": 46 }, { "operationId": "getMemoryEntitySource", "terms": { "getmemoryentitysource": 1, "memory": 3, "resolve": 1, "navigable": 1, "source": 2, "for": 2, "an": 2, "entity": 1, "returns": 1, "internal": 1, "route": 1, "or": 2, "external": 1, "url": 1, "jumping": 1, "to": 1, "the": 1, "operative": 1, "behind": 1, "a": 1, "graph": 1, "node": 1, "task": 1, "jira": 1, "issue": 1, "related": 1, "doc": 1 }, "length": 33 }, { "operationId": "getMemoryGraph", "terms": { "getmemorygraph": 1, "memory": 2, "graph": 2, "expansion": 1, "from": 1, "anchor": 2, "returns": 1, "access": 1, "filtered": 1, "nodes": 1, "and": 1, "edges": 3, "for": 1, "a": 1, "knowledge": 1, "default": 1, "trust": 1, "filter": 1, "includes": 1, "only": 1, "confirmed": 1, "set": 1, "include": 1, "candidates": 1, "to": 1, "also": 1, "return": 1, "candidate": 2, "edge": 1, "line": 1, "style": 1, "distinguishes": 1, "provenance": 1, "solid": 1, "structural": 1, "source": 1, "dashed": 1, "inferred": 1 }, "length": 44 }, { "operationId": "getMemoryMap", "terms": { "25": 1, "getmemorymap": 1, "memory": 3, "cluster": 3, "map": 2, "overview": 2, "returns": 1, "an": 1, "aggregated": 2, "of": 1, "the": 2, "knowledge": 1, "graph": 1, "for": 1, "explorer": 2, "mode": 1, "entities": 1, "must": 1, "have": 1, "at": 2, "least": 1, "one": 1, "confirmed": 2, "edge": 1, "trust": 1, "default": 1, "connected": 1, "components": 2, "become": 1, "clusters": 2, "cross": 1, "edges": 2, "are": 1, "as": 1, "meta": 1, "top": 1, "level": 1, "responses": 1, "cap": 1, "additional": 1, "contribute": 1, "to": 1, "hidden": 1, "count": 1 }, "length": 58 }, { "operationId": "getMyCapacity", "terms": { "7772": 1, "getmycapacity": 1, "capacity": 5, "my": 1, "own": 2, "t18": 1, "s27": 1, "anw": 1, "the": 1, "logged": 1, "in": 1, "user": 1, "s": 1, "kpi": 1, "values": 1, "committed": 1, "free": 1, "utilization": 1, "plus": 1, "their": 1, "active": 1, "tasks": 1, "and": 1, "commitments": 1, "self": 1, "serve": 1 }, "length": 31 }, { "operationId": "getMyPriorityQueue", "terms": { "930": 1, "1146": 1, "getmypriorityqueue": 1, "tasks": 4, "my": 1, "derived": 2, "priority": 1, "order": 2, "aura": 2, "the": 12, "caller": 2, "s": 2, "work": 1, "in": 1, "one": 1, "from": 1, "every": 1, "context": 2, "ordering": 1, "asap": 1, "first": 2, "then": 4, "depth": 1, "walk": 1, "of": 2, "ranked": 1, "tree": 1, "sagas": 1, "root": 1, "unparented": 1, "pseudo": 1, "freely": 1, "choosable": 1, "below": 1, "a": 2, "deliberately": 1, "unordered": 1, "level": 1, "everything": 1, "without": 1, "rank": 1, "set": 1, "is": 2, "active": 1, "core": 1, "role": 1, "memberships": 1, "on": 1, "living": 1, "not": 1, "paginated": 1, "whole": 2, "queue": 2, "computed": 1, "once": 1, "and": 2, "shared": 1, "by": 1, "dashboard": 1, "panel": 1, "capped": 1, "at": 1, "ten": 1, "client": 1, "side": 1, "person": 1, "slideover": 1, "which": 1, "shows": 1, "all": 1, "it": 1, "an": 1, "optional": 1, "limit": 1, "bounds": 1, "items": 1, "omitted": 1, "comes": 1, "back": 1 }, "length": 109 }, { "operationId": "getNotificationPreferences", "terms": { "getnotificationpreferences": 1, "notifications": 3, "get": 1, "preference": 2, "matrix": 2, "returns": 1, "the": 2, "effective": 1, "all": 1, "registered": 1, "types": 1, "channels": 1, "merging": 1, "registry": 2, "defaults": 1, "with": 1, "stored": 2, "user": 1, "rows": 1, "absence": 1, "of": 1, "a": 1, "row": 1, "means": 1, "default": 1, "applies": 1 }, "length": 33 }, { "operationId": "getPersonPriorityQueue", "terms": { "930": 1, "1148": 1, "getpersonpriorityqueue": 1, "tasks": 2, "a": 1, "person": 2, "s": 4, "derived": 2, "priority": 2, "order": 2, "filtered": 1, "to": 1, "the": 7, "caller": 2, "access": 1, "aura": 2, "target": 1, "complete": 2, "same": 1, "computation": 1, "as": 1, "getmypriorityqueue": 1, "opened": 1, "from": 1, "assignee": 1, "name": 1, "in": 1, "ordering": 1, "dialog": 1, "card": 1, "footer": 1, "every": 1, "task": 1, "may": 1, "not": 1, "read": 1, "d": 1, "022": 1, "is": 2, "folded": 1, "into": 1, "an": 1, "anonymous": 1, "placeholder": 1, "its": 1, "block": 1, "and": 3, "rank": 1, "stay": 1, "so": 1, "sequence": 1, "countable": 1, "but": 1, "title": 1, "key": 1, "status": 1, "deadline": 1, "never": 1, "leave": 1, "server": 1 }, "length": 80 }, { "operationId": "getProject", "terms": { "getproject": 1, "projects": 2, "get": 1, "detail": 2, "returns": 1, "project": 1, "including": 1, "linked": 1, "repositories": 1 }, "length": 11 }, { "operationId": "getProjectTaskTree", "terms": { "getprojecttasktree": 1, "projects": 2, "task": 2, "tree": 2, "nested": 1, "for": 1, "a": 1, "project": 2, "roots": 1, "are": 3, "directly": 1, "assigned": 2, "tasks": 4, "with": 1, "no": 1, "ancestor": 1, "in": 1, "the": 1, "same": 1, "after": 1, "viewer": 1, "visibility": 1, "filtering": 1, "leadership": 1, "admin": 1, "see": 2, "all": 1, "others": 1, "only": 1, "from": 1, "taskvieweraccesswhere": 1, "archived": 1, "excluded": 1, "done": 1, "included": 1 }, "length": 46 }, { "operationId": "getRepository", "terms": { "getrepository": 1, "repositories": 2, "get": 1, "detail": 2, "returns": 1, "the": 1, "repository": 1, "available": 1, "to": 1, "all": 1, "authenticated": 1, "users": 1 }, "length": 14 }, { "operationId": "getRepositoryRunStatus", "terms": { "getrepositoryrunstatus": 1, "repositories": 3, "get": 1, "current": 1, "run": 3, "status": 1, "returns": 1, "only": 1, "the": 2, "latest": 1, "summaries": 1, "doc": 1, "ingest": 1, "code": 1, "checkout": 1, "for": 2, "a": 2, "single": 1, "repository": 1, "intended": 1, "focused": 1, "polling": 1, "while": 1, "is": 1, "active": 1, "avoids": 1, "reloading": 1, "full": 1, "list": 1, "available": 1, "to": 1, "all": 1, "authenticated": 1, "users": 1, "with": 1, "view": 1, "capability": 1 }, "length": 44 }, { "operationId": "getRepositorySyncHistory", "terms": { "10": 1, "getrepositorysynchistory": 1, "repositories": 3, "get": 1, "recent": 1, "sync": 2, "runs": 1, "returns": 1, "the": 1, "last": 1, "run": 1, "timestamps": 1, "for": 1, "a": 1, "repository": 1, "requires": 1, "view": 1, "capability": 1 }, "length": 21 }, { "operationId": "getRun", "terms": { "getrun": 1, "runs": 2, "get": 1, "run": 2, "detail": 2, "admin": 2, "returns": 1, "the": 1, "full": 1, "of": 1, "a": 1, "single": 1, "agentrun": 1, "or": 1, "scriptrun": 1, "requires": 1, "role": 1 }, "length": 21 }, { "operationId": "getSignal", "terms": { "getsignal": 1, "signals": 2, "get": 1, "detail": 1, "returns": 1, "a": 1, "signal": 1, "with": 1, "evidence": 1, "and": 1, "review": 1, "history": 1 }, "length": 13 }, { "operationId": "getSkill", "terms": { "getskill": 1, "get": 1, "a": 1, "skill": 1, "skills": 1 }, "length": 5 }, { "operationId": "getSkillImportRun", "terms": { "getskillimportrun": 1, "poll": 1, "the": 1, "status": 1, "of": 1, "a": 1, "skill": 1, "import": 1, "run": 1, "skills": 1 }, "length": 10 }, { "operationId": "getTask", "terms": { "403": 1, "404": 1, "7662": 1, "gettask": 1, "tasks": 2, "get": 1, "detail": 2, "returns": 1, "the": 6, "full": 1, "of": 1, "a": 1, "task": 3, "including": 1, "member": 1, "list": 1, "when": 2, "no": 3, "exists": 2, "for": 2, "uuid": 1, "anw": 1, "but": 1, "caller": 1, "lacks": 1, "sufficient": 1, "access": 3, "meta": 2, "reason": 1, "distinguishes": 1, "relationship": 1, "at": 1, "all": 1, "from": 1, "insufficient": 2, "permission": 2, "action": 1, "and": 1, "owners": 1, "names": 1, "who": 1, "can": 1, "grant": 1, "more": 1 }, "length": 63 }, { "operationId": "getTaskBoard", "terms": { "1": 1, "100": 1, "7802": 1, "7805": 1, "gettaskboard": 1, "tasks": 7, "board": 4, "diagram": 2, "data": 1, "unpaginated": 1, "returns": 1, "every": 3, "task": 1, "the": 14, "caller": 3, "can": 2, "access": 2, "direct": 1, "membership": 2, "ancestor": 1, "inherited": 1, "or": 2, "a": 4, "taskaccessgrant": 1, "i": 2, "e": 2, "same": 2, "scope": 2, "as": 1, "get": 1, "view": 1, "all": 2, "together": 1, "with": 4, "its": 3, "hierarchy": 1, "edges": 2, "and": 7, "typed": 1, "relation": 1, "in": 1, "single": 1, "payload": 4, "deliberately": 1, "not": 5, "paginated": 1, "list": 2, "anw": 2, "renders": 1, "one": 1, "spatial": 1, "whose": 1, "auto": 2, "layout": 3, "only": 3, "be": 1, "computed": 1, "once": 1, "node": 1, "edge": 1, "is": 2, "known": 1, "paging": 1, "would": 2, "either": 1, "produce": 1, "that": 1, "reshuffles": 1, "each": 1, "page": 1, "force": 1, "client": 1, "to": 1, "walk": 1, "pages": 1, "before": 1, "drawing": 1, "anything": 1, "so": 1, "cap": 1, "of": 3, "shared": 1, "query": 1, "schema": 1, "does": 1, "apply": 1, "here": 1, "bounded": 1, "by": 1, "s": 2, "low": 1, "hundreds": 1, "carries": 1, "slim": 1, "fields": 1, "card": 3, "needs": 1, "full": 1, "tasklistitem": 1, "archived": 1, "archivedat": 1, "set": 1, "status": 1, "discarded": 1, "are": 3, "excluded": 1, "both": 1, "filters": 1, "orthogonal": 1, "applied": 1, "separately": 2, "stored": 2, "positions": 2, "viewport": 1, "ship": 1, "fetching": 1, "them": 1, "show": 1, "first": 1, "at": 2, "spot": 1, "then": 1, "position": 1, "make": 1, "whole": 1, "visibly": 1, "jump": 1, "outside": 1, "this": 1, "ignored": 1, "returned": 1, "deleted": 1 }, "length": 210 }, { "operationId": "getTaskByHumanKey", "terms": { "42": 1, "403": 1, "404": 1, "7570": 1, "7662": 1, "7848": 1, "gettaskbyhumankey": 1, "tasks": 3, "get": 2, "by": 2, "human": 2, "readable": 2, "key": 3, "resolves": 1, "a": 3, "task": 3, "via": 1, "its": 1, "identifier": 1, "e": 1, "g": 1, "aura": 1, "anw": 3, "when": 2, "the": 5, "is": 1, "unknown": 1, "or": 1, "malformed": 1, "exists": 1, "but": 1, "caller": 1, "lacks": 1, "access": 1, "naming": 1, "owner": 1, "in": 1, "meta": 1, "returns": 1, "same": 1, "payload": 1, "as": 1, "uuid": 1, "so": 1, "opening": 1, "costs": 1, "single": 1, "request": 1 }, "length": 67 }, { "operationId": "getTaskByJiraKey", "terms": { "403": 1, "404": 1, "7662": 1, "gettaskbyjirakey": 1, "tasks": 3, "get": 2, "by": 1, "jira": 3, "key": 4, "resolves": 1, "a": 2, "task": 3, "via": 1, "its": 1, "linked": 2, "issue": 1, "matches": 1, "the": 8, "jiraissue": 1, "mirror": 1, "for": 1, "against": 1, "current": 1, "user": 1, "s": 1, "connected": 1, "cloud": 2, "site": 2, "when": 2, "is": 1, "unknown": 1, "belongs": 1, "to": 1, "different": 1, "or": 1, "has": 1, "no": 1, "anw": 1, "exists": 1, "but": 1, "caller": 1, "lacks": 1, "access": 1, "naming": 1, "owner": 1, "in": 1, "meta": 1, "returns": 1, "same": 1, "detail": 1, "shape": 1, "as": 1, "mcp": 1, "id": 1 }, "length": 76 }, { "operationId": "getTaskCycleTimes", "terms": { "1654": 1, "gettaskcycletimes": 1, "tasks": 2, "cycle": 2, "times": 1, "stays": 2, "on": 1, "one": 2, "task": 4, "returns": 1, "the": 7, "derived": 1, "of": 2, "for": 1, "time": 3, "display": 1, "aura": 1, "every": 1, "phase": 1, "interval": 1, "in": 1, "order": 1, "with": 1, "duration": 1, "computed": 1, "at": 1, "read": 3, "parallel": 1, "owner": 1, "crew": 1, "search": 1, "strand": 1, "and": 2, "reason": 1, "a": 3, "status": 1, "change": 1, "joined": 1, "from": 1, "activityevent": 1, "not": 1, "list": 1, "endpoint": 1, "typically": 1, "has": 1, "fewer": 1, "than": 1, "twenty": 1, "intervals": 1, "chronology": 1, "needs": 1, "them": 1, "all": 1, "whoever": 1, "can": 2, "durations": 1, "there": 1, "is": 1, "no": 1, "extra": 1, "capability": 1 }, "length": 83 }, { "operationId": "getTaskGraph", "terms": { "gettaskgraph": 1, "tasks": 4, "graph": 2, "nodes": 4, "edges": 3, "owner": 1, "scoped": 1, "returns": 1, "a": 2, "renderer": 1, "agnostic": 1, "for": 2, "the": 3, "authenticated": 1, "user": 1, "s": 1, "are": 2, "and": 2, "tags": 2, "task": 5, "tag": 2, "attachments": 1, "typed": 1, "relations": 1, "honours": 1, "same": 1, "filters": 1, "as": 1, "list": 1, "q": 1, "match": 1, "carry": 1, "server": 1, "computed": 1, "louvain": 1, "community": 1, "cluster": 1, "colouring": 1 }, "length": 59 }, { "operationId": "getTaskHierarchyGraph", "terms": { "gettaskhierarchygraph": 1, "tasks": 4, "hierarchy": 2, "graph": 3, "directed": 3, "tree": 2, "owner": 2, "scoped": 1, "returns": 1, "the": 4, "s": 1, "task": 1, "as": 2, "a": 1, "nodes": 2, "edges": 2, "are": 2, "carrying": 1, "their": 1, "level": 1, "point": 1, "parent": 1, "child": 1, "reuses": 1, "same": 1, "taskgraph": 1, "dto": 1, "tag": 1, "only": 1, "owned": 1, "by": 1, "authenticated": 1, "user": 1, "included": 1 }, "length": 51 }, { "operationId": "getTaskJiraIssueDraft", "terms": { "1239": 1, "1429": 1, "gettaskjiraissuedraft": 1, "tasks": 2, "preview": 1, "the": 9, "jira": 4, "issue": 4, "a": 2, "task": 2, "would": 2, "create": 2, "derives": 1, "type": 1, "project": 1, "summary": 1, "and": 1, "description": 1, "for": 1, "this": 1, "get": 1, "plus": 1, "allowed": 1, "target": 1, "statuses": 1, "so": 1, "in": 2, "dialog": 2, "can": 1, "render": 1, "before": 1, "user": 2, "commits": 1, "aura": 2, "same": 1, "derivation": 1, "chat": 1, "s": 1, "propose": 1, "tool": 1, "uses": 1, "team": 1, "is": 1, "not": 1, "derived": 1, "picks": 1, "it": 1 }, "length": 70 }, { "operationId": "getTaskMemberCapacity", "terms": { "7772": 1, "gettaskmembercapacity": 1, "tasks": 1, "get": 1, "member": 2, "capacity": 4, "cross": 1, "task": 4, "t18": 1, "s27": 1, "anw": 1, "person": 1, "scoped": 1, "for": 1, "a": 2, "kpi": 1, "values": 1, "plus": 1, "all": 1, "active": 1, "commitments": 1, "used": 1, "by": 1, "the": 2, "inline": 1, "edit": 1, "modal": 1, "so": 1, "an": 1, "editor": 1, "can": 1, "preview": 1, "how": 1, "change": 1, "affects": 1, "total": 1, "utilization": 1, "auth": 1, "matches": 1, "patch": 1, "self": 1, "or": 1, "manage": 1, "members": 1, "leadership": 1, "admin": 1, "override": 1 }, "length": 56 }, { "operationId": "getTaskNeighborhood", "terms": { "gettaskneighborhood": 1, "tasks": 2, "hierarchy": 4, "neighbourhood": 3, "scoped": 1, "for": 4, "the": 14, "detail": 1, "view": 1, "mini": 1, "map": 2, "returns": 2, "local": 1, "of": 4, "one": 2, "task": 5, "as": 3, "slim": 1, "card": 2, "shaped": 1, "nodes": 1, "ancestor": 2, "chain": 2, "to": 1, "root": 2, "its": 3, "siblings": 1, "children": 3, "direct": 2, "parent": 4, "and": 2, "each": 1, "node": 1, "carries": 1, "fields": 1, "shared": 1, "renders": 1, "human": 1, "key": 1, "title": 1, "status": 1, "level": 1, "owners": 1, "my": 1, "roles": 1, "looking": 1, "owner": 1, "at": 2, "plus": 1, "id": 1, "layout": 1, "archived": 1, "agent": 1, "consumers": 1, "only": 1, "child": 1, "edges": 2, "are": 1, "included": 1, "no": 1, "semantic": 1, "taskrelation": 1, "an": 2, "empty": 1, "graph": 2, "if": 1, "has": 1, "neither": 1, "a": 1, "nor": 1, "so": 1, "callers": 1, "can": 1, "hide": 1, "mirrored": 1, "mcp": 1, "tool": 1, "same": 1, "name": 1, "agents": 1, "should": 1, "treat": 1, "this": 1, "not": 1, "full": 1, "tenant": 1, "optional": 1, "depth": 1, "bounds": 1, "omitted": 1, "it": 1, "reaches": 1 }, "length": 143 }, { "operationId": "getTaskRankContext", "terms": { "930": 1, "1145": 1, "gettaskrankcontext": 1, "tasks": 2, "read": 1, "the": 9, "priority": 2, "ordering": 2, "context": 4, "both": 1, "zones": 1, "of": 2, "this": 3, "task": 3, "belongs": 1, "to": 1, "aura": 2, "ordered": 1, "zone": 1, "first": 1, "rank": 1, "ascending": 1, "unordered": 1, "set": 1, "behind": 1, "it": 1, "also": 1, "returns": 1, "expected": 1, "state": 1, "fingerprint": 1, "matching": 1, "put": 1, "must": 1, "carry": 1, "and": 1, "whether": 1, "caller": 1, "may": 1, "reorder": 1, "at": 1, "all": 1, "scope": 2, "siblings": 1, "default": 1, "is": 2, "itself": 1, "sits": 1, "in": 1, "children": 2, "its": 1, "direct": 1 }, "length": 75 }, { "operationId": "getUserGroup", "terms": { "getusergroup": 1, "usergroups": 2, "get": 1, "detail": 1, "with": 1, "members": 2, "returns": 1, "one": 1, "user": 2, "group": 1, "including": 1, "its": 1, "uuid": 1, "display": 1, "name": 1, "email": 1, "role": 1, "leadership": 1, "admin": 1, "only": 1 }, "length": 23 }, { "operationId": "grantArtifactAccess", "terms": { "923": 1, "grantartifactaccess": 1, "artifacts": 2, "grant": 1, "or": 2, "update": 1, "access": 3, "upserts": 1, "an": 1, "entry": 1, "in": 1, "the": 5, "artifact": 2, "s": 1, "own": 1, "list": 1, "s3": 1, "aura": 1, "creates": 1, "it": 2, "if": 2, "principal": 1, "has": 1, "none": 1, "yet": 1, "changes": 1, "its": 1, "level": 1, "already": 1, "does": 1, "requires": 1, "manage": 1, "permission": 1, "on": 1, "returns": 1, "updated": 1, "overview": 1, "so": 1, "share": 1, "dialog": 1, "can": 1, "be": 1, "refreshed": 1, "from": 1, "a": 1, "single": 1, "response": 1 }, "length": 58 }, { "operationId": "inviteCrew", "terms": { "7759": 1, "invitecrew": 1, "tasks": 2, "invite": 1, "crew": 3, "creates": 1, "or": 2, "refreshes": 1, "an": 1, "owner": 1, "to": 1, "user": 1, "request": 1, "while": 1, "looking": 1, "for": 1, "at": 1, "is": 1, "set": 1, "t18": 1, "s11": 1, "anw": 1, "requires": 1, "task": 1, "level": 1, "manage": 1, "access": 1, "a": 1, "leadership": 1, "admin": 1, "system": 1, "override": 1 }, "length": 36 }, { "operationId": "linkArtifactToTask", "terms": { "200": 1, "404": 1, "linkartifacttotask": 1, "tasks": 2, "link": 1, "an": 2, "artifact": 3, "links": 1, "to": 2, "a": 1, "task": 2, "via": 1, "the": 4, "taskartifact": 1, "join": 1, "table": 1, "idempotent": 1, "returns": 2, "if": 2, "already": 1, "linked": 1, "does": 1, "not": 2, "belong": 1, "current": 1, "user": 1, "or": 1, "is": 1, "found": 1 }, "length": 41 }, { "operationId": "linkAsanaTaskToTask", "terms": { "200": 1, "403": 1, "404": 1, "409": 1, "502": 1, "1422": 1, "linkasanatasktotask": 1, "tasks": 2, "link": 1, "an": 4, "asana": 6, "object": 7, "links": 1, "existing": 1, "project": 1, "or": 4, "task": 3, "to": 1, "a": 4, "by": 3, "gid": 2, "permalink": 1, "url": 1, "s5": 1, "aura": 1, "idempotent": 1, "returns": 1, "if": 2, "already": 4, "linked": 2, "the": 7, "is": 6, "not": 5, "yet": 1, "mirrored": 3, "it": 1, "fetched": 1, "using": 1, "current": 1, "user": 1, "s": 1, "own": 1, "connected": 3, "account": 2, "settings": 1, "integrations": 1, "never": 1, "requires": 1, "token": 3, "error": 3, "responses": 1, "carry": 1, "type": 1, "discriminator": 1, "when": 4, "no": 3, "and": 2, "stored": 1, "longer": 1, "usable": 1, "invalid": 1, "another": 1, "owns": 1, "does": 1, "exist": 1, "in": 1, "found": 1, "on": 1, "upstream": 1, "comes": 1, "from": 1, "per": 1, "access": 1, "layer": 1, "instead": 1, "discriminated": 1, "meta": 1, "reason": 1, "chat": 1, "free": 1, "design": 1, "mcp": 1, "agent": 1, "tool": 1, "exposes": 1, "this": 1 }, "length": 147 }, { "operationId": "linkChatToTask", "terms": { "200": 1, "404": 1, "linkchattotask": 1, "tasks": 2, "link": 1, "a": 3, "chat": 4, "links": 1, "to": 2, "task": 1, "by": 1, "setting": 1, "taskid": 1, "idempotent": 1, "returns": 2, "if": 2, "already": 1, "linked": 1, "the": 2, "does": 1, "not": 1, "belong": 1, "current": 1, "user": 1 }, "length": 34 }, { "operationId": "linkFeedbackTask", "terms": { "linkfeedbacktask": 1, "feedback": 4, "link": 1, "a": 2, "task": 3, "attaches": 1, "that": 1, "addresses": 1, "this": 1, "linking": 1, "an": 1, "already": 1, "done": 1, "resolves": 1, "the": 1, "entry": 1, "immediately": 1, "requires": 1, "view": 1 }, "length": 25 }, { "operationId": "linkJiraIssueToTask", "terms": { "200": 1, "403": 1, "404": 1, "409": 1, "502": 1, "linkjiraissuetotask": 1, "tasks": 2, "link": 2, "a": 3, "jira": 5, "issue": 4, "fetches": 1, "and": 2, "mirrors": 1, "the": 5, "by": 2, "key": 2, "then": 1, "creates": 1, "an": 2, "idempotent": 2, "taskjiraissue": 1, "returns": 1, "if": 1, "already": 3, "linked": 2, "error": 3, "responses": 1, "carry": 1, "type": 1, "discriminator": 1, "when": 4, "no": 2, "account": 1, "is": 3, "connected": 2, "not": 3, "stored": 1, "token": 2, "longer": 1, "usable": 1, "invalid": 1, "or": 1, "another": 1, "task": 1, "owns": 1, "does": 1, "exist": 1, "in": 1, "found": 1, "on": 1, "upstream": 1, "comes": 1, "from": 1, "per": 1, "object": 1, "access": 1, "layer": 1, "instead": 1, "discriminated": 1, "meta": 1, "reason": 1 }, "length": 97 }, { "operationId": "linkRelatedFeedback", "terms": { "linkrelatedfeedback": 1, "feedback": 3, "link": 1, "a": 2, "related": 1, "entry": 1, "creates": 1, "canonical": 1, "undirected": 1, "relation": 1, "self": 1, "links": 1, "are": 1, "rejected": 1, "requires": 1, "view": 1 }, "length": 19 }, { "operationId": "linkRepositoryToProject", "terms": { "linkrepositorytoproject": 1, "projects": 2, "link": 1, "repository": 2, "links": 1, "a": 2, "to": 1, "project": 1, "informational": 1, "leadership": 1, "admin": 1, "only": 1, "idempotent": 1 }, "length": 16 }, { "operationId": "linkRepositoryToTask", "terms": { "200": 1, "7785": 1, "linkrepositorytotask": 1, "tasks": 2, "link": 2, "a": 3, "repository": 2, "links": 1, "to": 1, "task": 1, "via": 1, "the": 2, "taskrepository": 1, "join": 1, "table": 1, "idempotent": 1, "returns": 1, "if": 1, "already": 1, "linked": 1, "when": 1, "branch": 1, "is": 2, "provided": 1, "it": 1, "stored": 1, "or": 1, "updated": 1, "on": 1, "anw": 1 }, "length": 37 }, { "operationId": "listAgentRunEvents", "terms": { "listagentrunevents": 1, "runs": 3, "list": 1, "structured": 1, "events": 3, "for": 3, "a": 2, "run": 3, "returns": 2, "persisted": 1, "agent": 1, "reasoning": 1, "tool": 1, "calls": 1, "given": 1, "pass": 1, "afterseq": 2, "lossless": 1, "reconnect": 1, "only": 1, "with": 1, "seq": 1, "any": 1, "authenticated": 1, "user": 1, "may": 1, "access": 1, "they": 1, "can": 1, "see": 1 }, "length": 41 }, { "operationId": "listArtifacts", "terms": { "listartifacts": 1, "artifacts": 3, "list": 1, "all": 1, "paginated": 2, "returns": 1, "owned": 1, "by": 1, "or": 1, "shared": 1, "with": 1, "the": 1, "authenticated": 1, "user": 1 }, "length": 17 }, { "operationId": "listArtifactTasks", "terms": { "404": 1, "listartifacttasks": 1, "artifacts": 2, "list": 2, "linked": 2, "tasks": 2, "returns": 1, "the": 2, "non": 1, "paginated": 1, "of": 1, "to": 1, "this": 1, "artifact": 2, "sorted": 1, "by": 2, "updatedat": 1, "desc": 1, "if": 1, "not": 2, "found": 1, "or": 1, "owned": 1, "current": 1, "user": 1 }, "length": 33 }, { "operationId": "listArtifactVersions", "terms": { "404": 1, "listartifactversions": 1, "artifacts": 2, "list": 1, "versions": 2, "returns": 1, "all": 1, "of": 1, "an": 1, "artifact": 1, "sorted": 1, "by": 2, "version": 1, "desc": 1, "without": 1, "body": 1, "user": 2, "scoped": 1, "if": 1, "not": 2, "found": 1, "or": 1, "owned": 1, "the": 1, "current": 1 }, "length": 30 }, { "operationId": "listAsanaMirrorProjects", "terms": { "listasanamirrorprojects": 1, "asana": 7, "list": 1, "mirrored": 1, "projects": 3, "filter": 2, "source": 1, "distinct": 1, "already": 1, "seen": 1, "by": 1, "the": 4, "mirror": 2, "with": 2, "a": 1, "task": 1, "count": 1, "and": 1, "per": 1, "project": 2, "sync": 2, "freshness": 1, "latest": 1, "completed": 1, "run": 1, "success": 1, "failure": 1, "or": 1, "truncated": 1, "reads": 2, "only": 1, "local": 1, "no": 1, "account": 1, "is": 1, "required": 1, "backs": 1, "dropdown": 1, "contrast": 1, "get": 1, "tasks": 1, "which": 1, "live": 1, "from": 1, "for": 1, "trigger": 1, "selection": 1 }, "length": 64 }, { "operationId": "listAsanaProjects", "terms": { "500": 1, "listasanaprojects": 1, "asana": 6, "list": 1, "own": 2, "projects": 2, "sync": 3, "trigger": 2, "selection": 1, "admin": 1, "the": 3, "caller": 1, "s": 1, "read": 1, "live": 1, "from": 1, "api": 1, "for": 1, "project": 1, "picker": 1, "used": 1, "to": 1, "a": 4, "requires": 1, "manage": 1, "and": 1, "connected": 1, "personal": 1, "token": 2, "missing": 1, "or": 1, "invalid": 1, "is": 1, "reported": 1, "as": 1, "status": 1, "never": 1 }, "length": 53 }, { "operationId": "listAsanaTasks", "terms": { "listasanatasks": 1, "asana": 4, "tasks": 1, "list": 3, "locally": 2, "mirrored": 2, "returns": 1, "a": 3, "paginated": 1, "of": 1, "every": 1, "task": 2, "row": 2, "resourcekind": 1, "project": 1, "rows": 1, "sagas": 1, "are": 1, "excluded": 1, "whether": 1, "or": 1, "not": 1, "sync": 1, "has": 1, "touched": 1, "given": 1, "no": 1, "account": 1, "is": 1, "required": 1, "to": 1, "read": 1, "this": 1 }, "length": 44 }, { "operationId": "listChatArtifacts", "terms": { "404": 1, "listchatartifacts": 1, "chats": 1, "list": 2, "artifacts": 3, "returns": 1, "the": 2, "non": 1, "paginated": 1, "of": 1, "linked": 1, "to": 1, "this": 1, "chat": 2, "sorted": 1, "by": 2, "updatedat": 1, "desc": 1, "if": 1, "not": 2, "found": 1, "or": 1, "owned": 1, "current": 1, "user": 1 }, "length": 32 }, { "operationId": "listChats", "terms": { "listchats": 1, "chats": 3, "list": 1, "all": 1, "returns": 1, "paginated": 1, "owned": 1, "by": 1, "or": 1, "shared": 1, "with": 1, "the": 1, "authenticated": 1, "user": 1 }, "length": 16 }, { "operationId": "listComments", "terms": { "listcomments": 1, "comments": 3, "list": 1, "for": 2, "an": 1, "entity": 3, "returns": 1, "paginated": 1, "flat": 1, "a": 1, "given": 1, "ordered": 1, "by": 1, "createdat": 1, "according": 1, "to": 2, "sort": 1, "dir": 1, "default": 1, "desc": 1, "the": 2, "caller": 1, "must": 1, "have": 1, "at": 1, "least": 1, "read": 1, "access": 1 }, "length": 35 }, { "operationId": "listDocRunModels", "terms": { "listdocrunmodels": 1, "repositories": 2, "list": 2, "doc": 2, "run": 1, "models": 2, "returns": 1, "the": 2, "of": 1, "bedrock": 1, "available": 1, "for": 1, "per": 1, "repository": 1, "runs": 1, "plus": 1, "current": 1, "global": 1, "default": 1, "model": 1, "ref": 1 }, "length": 26 }, { "operationId": "listFeedback", "terms": { "403": 1, "listfeedback": 1, "feedback": 4, "list": 2, "paginated": 2, "returns": 1, "default": 1, "hides": 1, "discarded": 1, "entries": 1, "requires": 1, "view": 1, "leadership": 1, "admin": 1, "callers": 1, "without": 1, "the": 1, "capability": 1, "receive": 1, "not": 1, "an": 1, "empty": 1 }, "length": 27 }, { "operationId": "listGlossaryEntries", "terms": { "listglossaryentries": 1, "glossary": 3, "list": 1, "paginated": 2, "returns": 1, "entries": 1, "accessible": 1, "to": 1, "all": 1, "authenticated": 1, "users": 1 }, "length": 14 }, { "operationId": "listJiraIssues", "terms": { "listjiraissues": 1, "jira": 2, "issues": 2, "list": 2, "locally": 2, "mirrored": 2, "admin": 2, "returns": 1, "a": 1, "paginated": 1, "of": 1, "all": 1, "requires": 1, "role": 1, "jiraissues": 1 }, "length": 21 }, { "operationId": "listKnowledgeFiles", "terms": { "listknowledgefiles": 1, "list": 1, "the": 2, "file": 2, "nodes": 2, "of": 2, "a": 3, "space": 2, "returns": 1, "with": 1, "their": 2, "asset": 1, "metadata": 1, "and": 1, "slug": 1, "path": 1, "optionally": 1, "scoped": 1, "to": 1, "single": 1, "folder": 1, "via": 1, "parent": 1, "id": 1, "knowledge": 1 }, "length": 33 }, { "operationId": "listKnowledgeFileVersions", "terms": { "1644": 1, "listknowledgefileversions": 1, "list": 1, "all": 1, "versions": 1, "of": 1, "a": 2, "file": 2, "node": 1, "s": 1, "asset": 1, "newest": 1, "first": 1, "each": 1, "entry": 1, "carries": 1, "its": 1, "own": 1, "checksum": 1, "and": 1, "provenance": 1, "aura": 1, "download": 1, "specific": 1, "one": 1, "via": 1, "get": 1, "knowledge": 2, "nodes": 1, "uuid": 1, "version": 1, "n": 1 }, "length": 35 }, { "operationId": "listKnowledgeNodeVersions", "terms": { "listknowledgenodeversions": 1, "list": 1, "all": 1, "versions": 1, "of": 1, "a": 1, "document": 1, "node": 1, "knowledge": 1 }, "length": 9 }, { "operationId": "listKnowledgeSpaces", "terms": { "listknowledgespaces": 1, "list": 1, "knowledge": 3, "spaces": 2, "returns": 1, "all": 2, "topics": 1, "accessible": 1, "to": 1, "authenticated": 1, "users": 1 }, "length": 15 }, { "operationId": "listLeadershipCapacity", "terms": { "7772": 1, "listleadershipcapacity": 1, "capacity": 4, "leadership": 2, "overview": 2, "paginated": 1, "person": 2, "centric": 2, "t18": 1, "s27": 1, "anw": 1, "company": 1, "wide": 1, "participation": 1, "for": 1, "admin": 1, "shows": 1, "only": 1, "direct": 1, "role": 1, "assignments": 1, "on": 1, "active": 1, "non": 2, "archived": 1, "done": 1, "discarded": 1, "tasks": 1 }, "length": 36 }, { "operationId": "listLlmTurns", "terms": { "listllmturns": 1, "llm": 3, "turns": 4, "list": 1, "returns": 1, "paginated": 1, "filtered": 1, "by": 1, "message": 1, "id": 2, "or": 1, "chat": 1, "owner": 1, "sees": 2, "their": 1, "own": 1, "admin": 1, "all": 1 }, "length": 25 }, { "operationId": "listLookingForCrewTasks", "terms": { "7759": 1, "listlookingforcrewtasks": 1, "tasks": 2, "crew": 6, "search": 1, "pool": 1, "paginated": 1, "company": 2, "wide": 2, "lists": 1, "every": 2, "task": 2, "with": 1, "looking": 1, "for": 1, "at": 1, "set": 1, "t18": 1, "s11": 1, "anw": 1, "read": 2, "visible": 1, "to": 1, "logged": 1, "in": 1, "user": 1, "regardless": 1, "of": 1, "membership": 1, "grant": 1, "only": 1, "entry": 1, "point": 1, "a": 1, "row": 1, "click": 1, "opens": 1, "the": 2, "shared": 1, "detail": 1, "where": 1, "finding": 1, "panel": 1, "lives": 1, "each": 1, "item": 1, "carries": 1, "need": 2, "due": 1, "date": 1, "and": 1, "request": 1, "count": 1 }, "length": 66 }, { "operationId": "listLookingForOwnerTasks", "terms": { "7748": 1, "listlookingforownertasks": 1, "tasks": 2, "owner": 6, "search": 1, "pool": 1, "paginated": 1, "company": 2, "wide": 2, "lists": 1, "every": 2, "task": 2, "with": 1, "looking": 1, "for": 1, "at": 1, "set": 1, "t18": 1, "s10": 1, "anw": 1, "read": 2, "visible": 1, "to": 1, "logged": 1, "in": 1, "user": 1, "regardless": 1, "of": 1, "membership": 1, "grant": 1, "only": 1, "entry": 1, "point": 1, "a": 1, "row": 1, "click": 1, "opens": 1, "the": 2, "shared": 1, "detail": 1, "where": 1, "finding": 1, "panel": 1, "lives": 1, "each": 1, "item": 1, "carries": 1, "goal": 2, "due": 1, "date": 1, "and": 1, "application": 1, "count": 1 }, "length": 66 }, { "operationId": "listMcpAccessTokens", "terms": { "listmcpaccesstokens": 1, "me": 1, "list": 1, "mcp": 3, "access": 2, "tokens": 2, "returns": 1, "active": 1, "for": 1, "the": 1, "authenticated": 1, "user": 1, "token": 1, "secrets": 1, "are": 1, "never": 1, "included": 1 }, "length": 21 }, { "operationId": "listMemoryEntities", "terms": { "listmemoryentities": 1, "memory": 3, "entity": 1, "list": 3, "faceted": 1, "paginated": 2, "returns": 1, "a": 1, "access": 1, "filtered": 1, "of": 1, "knowledge": 1, "graph": 1, "entities": 1, "for": 1, "the": 2, "explorer": 2, "table": 1, "entry": 1, "point": 1, "supports": 1, "shared": 1, "filter": 1, "vocabulary": 1, "plus": 1, "standard": 1, "query": 1, "parameters": 1 }, "length": 35 }, { "operationId": "listMentionCandidates", "terms": { "listmentioncandidates": 1, "comments": 2, "mention": 1, "candidates": 1, "returns": 1, "users": 1, "that": 1, "can": 1, "be": 1, "mentioned": 1, "in": 1, "a": 2, "comment": 1, "with": 1, "has": 1, "access": 1, "flag": 1, "per": 1, "candidate": 1, "relative": 1, "to": 1, "the": 1, "target": 1, "entity": 1 }, "length": 26 }, { "operationId": "listNotifications", "terms": { "listnotifications": 1, "notifications": 4, "list": 1, "paginated": 2, "returns": 1, "for": 1, "the": 1, "authenticated": 1, "user": 1, "newest": 1, "first": 1 }, "length": 15 }, { "operationId": "listOntologyProposals", "terms": { "listontologyproposals": 1, "ontology": 2, "list": 1, "proposals": 2, "admin": 2, "returns": 1, "paginated": 1, "for": 1, "human": 1, "review": 1, "requires": 1, "role": 1, "ontologyproposals": 1 }, "length": 16 }, { "operationId": "listPendingGlossaryEntries", "terms": { "listpendingglossaryentries": 1, "glossary": 4, "list": 1, "pending": 1, "proposals": 1, "admin": 2, "only": 2, "returns": 1, "all": 1, "entries": 1, "awaiting": 1, "review": 1, "requires": 1, "manage": 1, "capability": 1 }, "length": 20 }, { "operationId": "listProcesses", "terms": { "listprocesses": 1, "processes": 4, "list": 1, "registered": 2, "admin": 2, "returns": 1, "the": 1, "catalog": 1, "of": 1, "all": 1, "background": 1, "requires": 1, "role": 1 }, "length": 18 }, { "operationId": "listProjects", "terms": { "listprojects": 1, "projects": 4, "list": 1, "paginated": 2, "returns": 1, "default": 1, "hides": 1, "archived": 2, "false": 1, "task": 1, "count": 1, "is": 1, "viewer": 1, "scoped": 1, "leadership": 1, "admin": 1, "see": 2, "all": 1, "others": 1, "only": 1, "tasks": 1, "reachable": 1, "via": 1, "taskvieweraccesswhere": 1 }, "length": 30 }, { "operationId": "listRepositories", "terms": { "listrepositories": 1, "repositories": 3, "list": 1, "all": 3, "returns": 1, "available": 1, "to": 1, "authenticated": 1, "users": 1 }, "length": 13 }, { "operationId": "listRepositoryDocRuns", "terms": { "20": 1, "listrepositorydocruns": 1, "repositories": 3, "list": 1, "documentation": 2, "runs": 2, "returns": 1, "the": 1, "last": 1, "for": 1, "a": 1, "repository": 1, "ordered": 1, "newest": 1, "first": 1, "requires": 1, "view": 1, "capability": 1 }, "length": 22 }, { "operationId": "listRouterMisses", "terms": { "listroutermisses": 1, "router": 3, "misses": 2, "list": 1, "paginated": 2, "admin": 2, "only": 2, "returns": 1, "unclassified": 1, "intents": 1, "captured": 1, "by": 1, "the": 1, "requires": 1, "view": 1, "capability": 1, "routermisses": 1 }, "length": 23 }, { "operationId": "listRuns", "terms": { "listruns": 1, "runs": 4, "list": 2, "all": 3, "admin": 2, "returns": 1, "a": 1, "paginated": 1, "of": 1, "across": 1, "process": 1, "kinds": 1, "read": 1, "from": 1, "the": 1, "run": 1, "overview": 1, "view": 1, "requires": 1, "role": 1 }, "length": 27 }, { "operationId": "listSignals", "terms": { "listsignals": 1, "signals": 3, "list": 1, "inbox": 1, "paginated": 2, "returns": 1, "planning": 1, "for": 1, "product": 1, "intelligence": 1, "review": 1 }, "length": 14 }, { "operationId": "listSkillAssets", "terms": { "listskillassets": 1, "list": 1, "assets": 1, "attached": 1, "to": 1, "a": 1, "skill": 1, "skills": 1 }, "length": 8 }, { "operationId": "listSkillPlugins", "terms": { "listskillplugins": 1, "list": 1, "skill": 2, "plugins": 1, "returns": 1, "all": 1, "top": 1, "level": 1, "plugin": 1, "folders": 1, "in": 1, "the": 1, "skills": 2, "space": 1, "with": 1, "their": 1, "counts": 1 }, "length": 19 }, { "operationId": "listSkills", "terms": { "listskills": 1, "list": 2, "skills": 3, "returns": 1, "a": 1, "paginated": 1, "of": 1, "visible": 1, "to": 1, "the": 1, "current": 1, "user": 1, "own": 1, "personal": 1, "all": 1, "public": 1 }, "length": 19 }, { "operationId": "listTags", "terms": { "listtags": 1, "tags": 3, "list": 2, "paginated": 3, "with": 2, "usage": 2, "count": 1, "returns": 1, "supports": 1, "full": 1, "text": 1, "search": 1, "via": 1, "q": 1, "prefix": 1, "match": 1, "on": 1, "name": 1, "slug": 1, "for": 1, "autocomplete": 1, "and": 1, "a": 1, "view": 1, "counts": 1 }, "length": 32 }, { "operationId": "listTaskActivity", "terms": { "listtaskactivity": 1, "tasks": 2, "list": 1, "activity": 2, "events": 2, "returns": 1, "paginated": 1, "for": 1, "a": 1, "task": 3, "scoped": 1, "newest": 1, "first": 1, "requires": 1, "membership": 1 }, "length": 20 }, { "operationId": "listTasks", "terms": { "listtasks": 1, "tasks": 4, "list": 1, "paginated": 2, "returns": 1, "the": 1, "caller": 1, "can": 1, "see": 1, "membership": 1, "inherited": 1, "access": 2, "and": 3, "grants": 1, "there": 1, "is": 2, "no": 1, "default": 1, "status": 3, "filter": 1, "archived": 4, "are": 1, "hidden": 1, "unless": 1, "all": 1, "or": 1, "true": 1, "related": 1, "to": 1, "member": 1, "scoped": 1, "only": 1, "then": 1, "applies": 1, "slug": 1, "type": 2 }, "length": 50 }, { "operationId": "listTaskStoryPointEstimates", "terms": { "listtaskstorypointestimates": 1, "tasks": 2, "list": 1, "story": 1, "point": 1, "history": 2, "append": 1, "only": 1, "estimate": 1, "for": 1, "a": 1, "task": 2, "newest": 1, "first": 1, "readable": 1, "with": 1, "read": 1, "access": 1, "does": 1, "not": 1, "change": 1, "the": 1, "effective": 1, "value": 1 }, "length": 27 }, { "operationId": "listUserGroups", "terms": { "listusergroups": 1, "usergroups": 2, "list": 1, "paginated": 2, "returns": 1, "user": 2, "groups": 2, "with": 1, "member": 1, "and": 1, "lead": 1, "counts": 1, "leadership": 1, "admin": 1, "only": 1, "manage": 1 }, "length": 20 }, { "operationId": "listUsers", "terms": { "listusers": 1, "users": 3, "list": 1, "all": 1, "returns": 1, "paginated": 1, "with": 1, "optional": 1, "search": 1, "filter": 1, "and": 1, "sort": 1, "admin": 1, "only": 1 }, "length": 16 }, { "operationId": "markAllNotificationsRead", "terms": { "markallnotificationsread": 1, "notifications": 4, "mark": 1, "all": 2, "as": 2, "read": 2, "marks": 1, "unread": 1, "for": 1, "the": 1, "authenticated": 1, "user": 1, "idempotent": 1 }, "length": 19 }, { "operationId": "markNotificationRead", "terms": { "200": 1, "marknotificationread": 1, "notifications": 3, "mark": 1, "one": 1, "as": 2, "read": 2, "marks": 1, "a": 2, "single": 1, "notification": 1, "idempotent": 1, "calling": 1, "it": 1, "second": 1, "time": 1, "returns": 1, "with": 1, "no": 1, "error": 1 }, "length": 25 }, { "operationId": "markTaskCommentsRead", "terms": { "marktaskcommentsread": 1, "tasks": 2, "mark": 1, "comments": 1, "as": 1, "read": 3, "advances": 1, "the": 6, "viewer": 2, "s": 1, "comment": 2, "watermark": 2, "for": 1, "this": 1, "task": 2, "to": 1, "last": 1, "rendered": 2, "at": 1, "timestamp": 1, "createdat": 1, "of": 1, "newest": 1, "actually": 1, "access": 1, "is": 1, "any": 1, "with": 1, "on": 1, "membership": 1, "not": 1, "required": 1, "only": 1, "moves": 1, "forward": 1 }, "length": 48 }, { "operationId": "markTaskRead", "terms": { "marktaskread": 1, "tasks": 2, "mark": 1, "as": 2, "read": 2, "marks": 1, "the": 2, "task": 1, "for": 1, "current": 1, "user": 1, "idempotent": 1, "sets": 1, "readat": 1, "to": 1, "now": 1, "only": 1, "if": 1, "it": 1, "is": 1, "currently": 1, "null": 1 }, "length": 26 }, { "operationId": "mcpAnswerQuestion", "terms": { "mcpanswerquestion": 1, "mcp": 2, "answer": 2, "question": 2, "saves": 1, "an": 1, "and": 1, "marks": 1, "the": 1, "answered": 1, "requires": 1, "edit": 1, "access": 1, "no": 1, "chatbot": 1, "guard": 1 }, "length": 19 }, { "operationId": "mcpCreateArtifact", "terms": { "200": 1, "mcpcreateartifact": 1, "mcp": 5, "create": 2, "artifact": 2, "creates": 1, "a": 5, "markdown": 1, "without": 1, "an": 2, "aura": 1, "chat": 1, "source": 1, "embedding": 1, "runs": 1, "fire": 1, "and": 3, "forget": 1, "server": 1, "limit": 2, "body": 2, "max": 1, "000": 1, "characters": 1, "large": 2, "has": 1, "to": 2, "be": 1, "emitted": 1, "as": 1, "single": 1, "tool": 1, "argument": 1, "may": 1, "exceed": 1, "the": 2, "calling": 1, "agent": 1, "s": 1, "output": 1, "budget": 1, "long": 1, "before": 1, "that": 1, "for": 1, "content": 1, "short": 1, "seed": 1, "here": 1, "fill": 1, "it": 1, "in": 1, "via": 1, "mcpupdateartifact": 1, "mode": 1, "section": 1, "or": 1, "send": 1, "payload": 1, "from": 1, "file": 1, "patch": 1, "api": 1, "artifacts": 1, "id": 1, "with": 1, "pat": 1 }, "length": 85 }, { "operationId": "mcpCreateTask", "terms": { "mcpcreatetask": 1, "mcp": 2, "create": 1, "task": 2, "creates": 1, "a": 1, "planning": 1, "for": 1, "the": 1, "pat": 1, "owner": 1, "without": 1, "linking": 1, "an": 1, "aura": 1, "chat": 1, "call": 1, "search": 1, "first": 1, "to": 1, "avoid": 1, "duplicates": 1 }, "length": 24 }, { "operationId": "mcpCreateUploadDocument", "terms": { "10": 1, "mcpcreateuploaddocument": 1, "mcp": 2, "upload": 1, "document": 1, "base64": 2, "ingests": 1, "a": 1, "file": 1, "from": 1, "content": 1, "maximum": 1, "mb": 1, "per": 1, "request": 1 }, "length": 17 }, { "operationId": "mcpExpandGraph", "terms": { "mcpexpandgraph": 1, "mcp": 2, "expand": 1, "knowledge": 1, "graph": 1 }, "length": 6 }, { "operationId": "mcpGetArtifact", "terms": { "mcpgetartifact": 1, "mcp": 2, "get": 1, "artifact": 1 }, "length": 5 }, { "operationId": "mcpGetKnowledgeDocument", "terms": { "mcpgetknowledgedocument": 1, "mcp": 2, "get": 1, "knowledge": 1, "document": 1 }, "length": 6 }, { "operationId": "mcpGetQuestion", "terms": { "mcpgetquestion": 1, "mcp": 2, "get": 1, "question": 1 }, "length": 5 }, { "operationId": "mcpGetRepoDocument", "terms": { "mcpgetrepodocument": 1, "mcp": 2, "get": 1, "repository": 1, "document": 1 }, "length": 6 }, { "operationId": "mcpGetSkill", "terms": { "mcpgetskill": 1, "mcp": 2, "get": 1, "skill": 1 }, "length": 5 }, { "operationId": "mcpGetUploadDocument", "terms": { "mcpgetuploaddocument": 1, "mcp": 2, "get": 1, "upload": 1, "document": 1 }, "length": 6 }, { "operationId": "mcpLinkArtifactToTask", "terms": { "mcplinkartifacttotask": 1, "mcp": 2, "link": 1, "artifact": 1, "to": 1, "task": 1 }, "length": 7 }, { "operationId": "mcpLinkUploadToTask", "terms": { "mcplinkuploadtotask": 1, "mcp": 2, "link": 1, "upload": 1, "to": 1, "task": 1 }, "length": 7 }, { "operationId": "mcpListCodeRepositories", "terms": { "mcplistcoderepositories": 1, "mcp": 3, "list": 1, "code": 1, "search": 1, "enabled": 1, "repositories": 2, "returns": 1, "with": 2, "codesearchenabled": 1, "true": 1, "for": 1, "intersection": 1, "repo": 1, "allowlist": 1 }, "length": 19 }, { "operationId": "mcpUnifiedSearch", "terms": { "mcpunifiedsearch": 1, "mcp": 5, "unified": 1, "semantic": 1, "search": 2, "same": 1, "as": 1, "post": 1, "but": 1, "authenticated": 1, "via": 1, "personal": 1, "access": 1, "token": 1, "bearer": 1, "used": 1, "by": 1, "the": 1, "native": 1, "route": 1, "and": 1, "external": 1, "clients": 1 }, "length": 28 }, { "operationId": "mcpUpdateArtifact", "terms": { "50": 1, "200": 1, "mcpupdateartifact": 1, "mcp": 4, "update": 1, "artifact": 2, "updates": 1, "an": 2, "body": 5, "server": 2, "limits": 1, "max": 1, "000": 2, "characters": 1, "in": 2, "mode": 3, "whole": 2, "section": 3, "prefer": 1, "target": 1, "heading": 1, "for": 2, "large": 2, "or": 1, "multi": 1, "part": 1, "edits": 1, "a": 3, "has": 1, "to": 2, "be": 1, "emitted": 1, "as": 1, "single": 1, "tool": 1, "argument": 1, "and": 1, "may": 1, "exceed": 1, "the": 3, "calling": 1, "agent": 1, "s": 1, "output": 1, "budget": 1, "long": 1, "before": 1, "limit": 1, "very": 1, "content": 1, "send": 1, "payload": 1, "from": 1, "file": 1, "patch": 1, "api": 1, "artifacts": 1, "id": 1, "with": 1, "pat": 1, "same": 1, "json": 1 }, "length": 86 }, { "operationId": "mcpWikiSearch", "terms": { "mcpwikisearch": 1, "mcp": 2, "search": 2, "the": 3, "wiki": 2, "literal": 2, "semantic": 2, "searches": 1, "repository": 1, "and": 3, "skill": 1, "knowledge": 1, "spaces": 2, "for": 2, "pages": 1, "matching": 1, "query": 1, "combining": 1, "a": 3, "german": 1, "full": 1, "text": 1, "plus": 1, "trigram": 1, "fallback": 1, "compound": 1, "words": 1, "merging": 1, "both": 1, "into": 1, "one": 1, "ranked": 1, "list": 1, "restricted": 1, "to": 1, "caller": 1, "s": 1, "readable": 1 }, "length": 51 }, { "operationId": "overrideArtifactReview", "terms": { "overrideartifactreview": 1, "artifacts": 2, "override": 1, "review": 3, "force": 1, "approved": 2, "forces": 1, "the": 3, "artifact": 2, "version": 1, "to": 1, "regardless": 1, "of": 1, "current": 1, "state": 1, "keeps": 1, "all": 1, "artifactreviewassignment": 1, "and": 1, "artifactapproval": 1, "rows": 1, "intact": 1, "so": 1, "approval": 1, "can": 1, "be": 1, "reopened": 1, "later": 1, "notifies": 1, "still": 1, "pending": 1, "reviewers": 1, "records": 1, "overridden": 1, "activity": 1, "requires": 1, "edit": 1, "permission": 1 }, "length": 45 }, { "operationId": "overrideCrewRemoval", "terms": { "7759": 1, "overridecrewremoval": 1, "tasks": 2, "override": 2, "crew": 2, "removal": 1, "leadership": 1, "admin": 1, "removes": 1, "a": 1, "member": 1, "directly": 1, "without": 1, "the": 2, "counterpart": 1, "s": 1, "confirmation": 1, "while": 1, "still": 1, "writing": 1, "audit": 1, "trail": 1, "t18": 1, "s11": 1, "anw": 1 }, "length": 29 }, { "operationId": "previewTaskLevelCascade", "terms": { "1226": 1, "previewtasklevelcascade": 1, "tasks": 3, "preview": 2, "a": 2, "level": 4, "change": 3, "cascade": 2, "read": 1, "only": 1, "dry": 1, "run": 1, "of": 2, "the": 7, "aura": 1, "validates": 1, "requested": 1, "optional": 1, "parent": 1, "task": 3, "id": 1, "exactly": 1, "as": 1, "patch": 1, "uuid": 1, "would": 3, "and": 3, "if": 1, "already": 1, "has": 1, "it": 1, "computes": 1, "which": 2, "descendants": 1, "be": 1, "re": 1, "leveled": 1, "per": 1, "simple": 1, "take": 1, "over": 1, "or": 1, "reset": 1, "rule": 1, "whether": 1, "their": 1, "status": 1, "resets": 1, "to": 1, "open": 1, "plus": 1, "them": 1, "caller": 1, "lacks": 1, "edit": 1, "content": 1, "on": 1, "nothing": 1, "is": 1, "persisted": 1, "powers": 1, "guided": 1, "restructure": 1, "dialog": 1, "s": 1, "step": 1, "before": 1, "actual": 1, "submit": 1 }, "length": 93 }, { "operationId": "proposeCrewRemoval", "terms": { "7759": 1, "proposecrewremoval": 1, "tasks": 2, "propose": 1, "crew": 3, "removal": 2, "starts": 1, "a": 2, "consensual": 1, "flow": 1, "for": 1, "single": 1, "member": 2, "may": 1, "be": 1, "initiated": 1, "by": 2, "the": 2, "owner": 1, "manage": 1, "side": 1, "or": 1, "themselves": 1, "t18": 1, "s11": 1, "anw": 1 }, "length": 34 }, { "operationId": "proposeTaskStoryPointEstimate", "terms": { "proposetaskstorypointestimate": 1, "tasks": 3, "propose": 1, "a": 2, "story": 2, "point": 2, "size": 1, "without": 2, "recording": 1, "it": 2, "runs": 1, "the": 3, "estimate": 1, "agent": 1, "once": 1, "and": 2, "returns": 1, "result": 1, "writing": 1, "history": 1, "row": 1, "caller": 1, "decides": 1, "whether": 1, "becomes": 1, "one": 1, "requires": 1, "task": 1, "edit": 1, "access": 1, "only": 1, "stories": 1, "sub": 1, "are": 1, "eligible": 1 }, "length": 45 }, { "operationId": "readCapacity", "terms": { "0": 1, "1722": 1, "readcapacity": 1, "capacity": 6, "read": 2, "with": 3, "a": 7, "scope": 7, "me": 2, "person": 5, "group": 9, "or": 2, "company": 2, "aura": 1, "one": 3, "tool": 1, "for": 3, "returns": 6, "the": 7, "caller": 3, "s": 2, "own": 1, "row": 3, "list": 4, "works": 1, "everyone": 1, "yourself": 1, "always": 1, "foreign": 1, "requires": 1, "lead": 4, "of": 2, "common": 1, "view": 1, "overview": 2, "members": 2, "leads": 1, "omit": 1, "uuid": 2, "my": 1, "team": 1, "every": 1, "where": 1, "is": 3, "member": 1, "no": 4, "active": 1, "task": 2, "appears": 1, "at": 1, "an": 3, "empty": 3, "firm": 1, "wide": 1, "centric": 1, "leadership": 1, "admin": 1, "paginated": 1, "dependent": 1, "capability": 1, "gate": 1, "enforced": 1, "inside": 1, "operation": 1, "refusal": 1, "structured": 1, "error": 1, "never": 1, "role": 2, "without": 1, "distinguishable": 1, "from": 1, "exists": 1, "but": 1, "has": 1, "which": 1 }, "length": 152 }, { "operationId": "recordTaskProgress", "terms": { "2": 1, "3": 1, "recordtaskprogress": 1, "tasks": 2, "record": 1, "a": 3, "progress": 3, "activity": 2, "event": 3, "records": 1, "task": 2, "carrying": 1, "an": 1, "ai": 2, "generated": 2, "free": 1, "text": 1, "note": 1, "plus": 1, "short": 1, "skill": 1, "phase": 1, "label": 1, "e": 1, "g": 1, "implement": 1, "refine": 1, "wave": 1, "used": 1, "by": 1, "the": 5, "local": 2, "lifecycle": 1, "skills": 1, "to": 1, "give": 1, "continuous": 1, "low": 1, "effort": 1, "visibility": 1, "of": 1, "in": 1, "aura": 1, "timeline": 1, "marks": 1, "is": 1, "true": 1, "actor": 1, "stays": 1, "calling": 1, "user": 1, "pat": 1, "owner": 1, "never": 1, "triggers": 1, "notifications": 1 }, "length": 72 }, { "operationId": "rejectGlossaryEntry", "terms": { "rejectglossaryentry": 1, "glossary": 3, "reject": 1, "a": 2, "pending": 2, "proposal": 1, "admin": 2, "only": 2, "deletes": 1, "entry": 1, "it": 1, "was": 1, "never": 1, "embedded": 1, "requires": 1, "manage": 1, "capability": 1 }, "length": 23 }, { "operationId": "rejectOntologyProposal", "terms": { "rejectontologyproposal": 1, "ontology": 1, "reject": 1, "proposal": 2, "admin": 2, "marks": 1, "a": 1, "pending": 1, "as": 1, "rejected": 1, "without": 1, "changing": 1, "the": 1, "graph": 1, "requires": 1, "role": 1, "ontologyproposals": 1 }, "length": 19 }, { "operationId": "removeArtifactReviewer", "terms": { "removeartifactreviewer": 1, "artifacts": 2, "remove": 1, "reviewer": 3, "mid": 1, "run": 1, "removes": 1, "a": 1, "from": 1, "the": 4, "running": 1, "review": 2, "deletes": 1, "artifactreviewassignment": 1, "and": 2, "any": 1, "artifactapproval": 1, "row": 1, "for": 1, "this": 1, "user": 1, "version": 1, "re": 1, "evaluates": 1, "quorum": 1, "immediately": 1, "removing": 1, "last": 1, "pending": 1, "can": 1, "close": 1, "requires": 1, "edit": 1, "permission": 1 }, "length": 42 }, { "operationId": "removeTaskMember", "terms": { "409": 1, "removetaskmember": 1, "tasks": 2, "remove": 2, "member": 3, "removes": 1, "a": 2, "user": 1, "from": 1, "the": 3, "list": 1, "of": 1, "task": 1, "returns": 1, "if": 1, "trying": 1, "to": 1, "last": 2, "or": 2, "owner": 3, "assign": 1, "another": 1, "first": 1, "start": 1, "an": 1, "search": 1 }, "length": 37 }, { "operationId": "removeUserGroupMember", "terms": { "404": 1, "500": 1, "removeusergroupmember": 1, "usergroups": 2, "remove": 1, "member": 2, "removes": 1, "a": 3, "from": 1, "group": 1, "idempotent": 1, "missing": 1, "membership": 1, "returns": 1, "never": 1, "leadership": 1, "admin": 1, "only": 1 }, "length": 22 }, { "operationId": "reopenArtifactReview", "terms": { "reopenartifactreview": 1, "artifacts": 2, "reopen": 1, "approved": 3, "review": 4, "reopens": 1, "an": 1, "run": 1, "for": 1, "a": 1, "specific": 1, "version": 1, "sets": 1, "reviewstate": 1, "from": 1, "back": 1, "to": 1, "in": 1, "while": 1, "keeping": 1, "all": 1, "artifactreviewassignment": 1, "and": 1, "artifactapproval": 1, "rows": 1, "intact": 1, "inverse": 1, "of": 1, "override": 1, "requires": 1, "edit": 1, "permission": 1 }, "length": 38 }, { "operationId": "reopenTask", "terms": { "17": 1, "7525": 1, "reopentask": 1, "tasks": 2, "reopen": 2, "reopens": 1, "a": 1, "done": 2, "or": 1, "discarded": 1, "task": 1, "onto": 1, "an": 1, "owner": 2, "chosen": 1, "active": 1, "status": 1, "of": 1, "its": 1, "series": 1, "t18": 1, "s05": 1, "anw": 1, "matrix": 1, "after": 1, "only": 1 }, "length": 30 }, { "operationId": "reorderTaskRankContext", "terms": { "1": 1, "409": 1, "930": 1, "1145": 1, "reordertaskrankcontext": 1, "tasks": 2, "apply": 1, "a": 1, "new": 1, "order": 4, "to": 1, "the": 13, "context": 8, "writes": 1, "complete": 1, "target": 1, "of": 2, "in": 5, "one": 1, "transaction": 1, "aura": 2, "d": 1, "016": 1, "every": 2, "task": 4, "named": 2, "ordered": 1, "ids": 1, "gets": 1, "its": 1, "position": 1, "n": 1, "that": 1, "other": 1, "living": 1, "becomes": 1, "unordered": 1, "requires": 1, "edit": 1, "permission": 1, "on": 2, "expected": 1, "state": 1, "is": 3, "fingerprint": 1, "was": 1, "computed": 1, "against": 1, "if": 1, "has": 1, "moved": 1, "save": 1, "rejected": 1, "with": 1, "and": 1, "response": 1, "carries": 1, "current": 1, "meta": 1, "scope": 1, "selects": 1, "which": 1, "addressed": 1, "siblings": 1, "default": 1, "or": 1, "children": 1 }, "length": 104 }, { "operationId": "reportMemoryEntityQuestion", "terms": { "reportmemoryentityquestion": 1, "memory": 2, "report": 1, "entity": 2, "as": 1, "questionable": 1, "creates": 1, "or": 1, "reuses": 1, "an": 1, "open": 1, "question": 1, "linked": 1, "to": 1, "the": 1, "knowledge": 1, "does": 1, "not": 1, "modify": 1, "graph": 1, "edges": 1, "corrections": 1, "flow": 1, "through": 1, "openquestion": 1, "only": 1 }, "length": 28 }, { "operationId": "requestArtifactReview", "terms": { "requestartifactreview": 1, "artifacts": 2, "request": 1, "review": 4, "triggers": 1, "the": 3, "obligation": 1, "for": 1, "an": 1, "artifact": 3, "s": 1, "current": 1, "status": 1, "must": 1, "have": 1, "triggersreview": 1, "true": 1, "and": 1, "at": 1, "least": 1, "one": 1, "role": 2, "notifies": 1, "all": 1, "holders": 1, "in": 1, "linked": 1, "tasks": 1, "via": 1, "sse": 1, "excluding": 1, "actor": 1, "records": 1, "requested": 1, "activity": 1 }, "length": 44 }, { "operationId": "respondCrewRequest", "terms": { "7759": 1, "respondcrewrequest": 1, "tasks": 2, "respond": 1, "to": 3, "crew": 2, "request": 2, "confirms": 1, "or": 1, "declines": 1, "a": 1, "pending": 1, "user": 3, "owner": 3, "requests": 2, "are": 2, "answered": 2, "by": 2, "the": 2, "manage": 1, "side": 1, "invited": 1, "t18": 1, "s11": 1, "anw": 1 }, "length": 39 }, { "operationId": "restoreKnowledgeNodeVersion", "terms": { "restoreknowledgenodeversion": 1, "restore": 1, "a": 2, "document": 1, "node": 1, "to": 1, "previous": 1, "version": 2, "creates": 1, "new": 1, "knowledge": 1 }, "length": 13 }, { "operationId": "retryRun", "terms": { "retryrun": 1, "runs": 2, "retry": 1, "a": 2, "failed": 2, "run": 3, "admin": 2, "resets": 1, "to": 1, "pending": 1, "and": 1, "re": 1, "queues": 1, "its": 1, "pg": 1, "boss": 1, "job": 1, "with": 1, "the": 1, "same": 1, "uuid": 1, "requires": 1, "role": 1 }, "length": 29 }, { "operationId": "reviewSignal", "terms": { "reviewsignal": 1, "signals": 2, "review": 2, "acknowledge": 1, "dismiss": 1, "snooze": 1, "records": 1, "a": 1, "human": 1, "action": 1, "and": 1, "updates": 1, "signal": 1, "status": 1 }, "length": 16 }, { "operationId": "revokeArtifactAccess", "terms": { "200": 1, "923": 1, "revokeartifactaccess": 1, "artifacts": 2, "revoke": 1, "access": 3, "removes": 1, "the": 5, "matching": 1, "entry": 2, "from": 1, "artifact": 2, "s": 1, "own": 1, "list": 1, "if": 1, "present": 1, "s3": 1, "aura": 1, "requires": 1, "manage": 1, "permission": 1, "on": 1, "idempotent": 1, "revoking": 1, "an": 1, "that": 1, "does": 1, "not": 1, "exist": 1, "still": 1, "returns": 2, "with": 1, "current": 1, "overview": 2, "updated": 1 }, "length": 47 }, { "operationId": "revokeMcpAccessToken", "terms": { "404": 1, "revokemcpaccesstoken": 1, "me": 1, "revoke": 1, "mcp": 3, "access": 2, "token": 2, "revokes": 1, "an": 1, "owned": 1, "by": 1, "the": 1, "authenticated": 1, "user": 1, "idempotent": 1, "for": 1, "already": 1, "revoked": 1, "tokens": 1, "returns": 1 }, "length": 24 }, { "operationId": "saveKnowledgeNodeBody", "terms": { "saveknowledgenodebody": 1, "save": 1, "document": 1, "body": 1, "creates": 1, "a": 1, "new": 1, "version": 1, "knowledge": 1 }, "length": 9 }, { "operationId": "saveKnowledgeNodeFrontmatter", "terms": { "saveknowledgenodefrontmatter": 1, "save": 1, "replace": 1, "the": 1, "front": 1, "matter": 1, "of": 1, "a": 1, "wiki": 1, "page": 1, "knowledge": 1 }, "length": 11 }, { "operationId": "saveSkillBody", "terms": { "saveskillbody": 1, "save": 1, "skill": 1, "body": 1, "owner": 1, "only": 1, "skills": 1 }, "length": 7 }, { "operationId": "saveTaskBoardLayout", "terms": { "savetaskboardlayout": 1, "tasks": 3, "save": 1, "board": 6, "card": 4, "positions": 8, "and": 5, "viewport": 2, "bulk": 2, "writes": 1, "the": 13, "caller": 2, "s": 3, "own": 1, "layout": 2, "in": 2, "plus": 1, "optionally": 1, "deliberately": 1, "narrow": 1, "read": 2, "path": 1, "is": 2, "get": 1, "this": 1, "endpoint": 1, "only": 2, "persists": 1, "never": 2, "task": 3, "data": 1, "first": 2, "snapshot": 4, "of": 2, "a": 4, "covers": 1, "several": 2, "hundred": 2, "goes": 1, "out": 1, "as": 1, "one": 3, "call": 1, "not": 3, "request": 1, "per": 1, "mode": 1, "decides": 1, "what": 1, "happens": 1, "to": 1, "that": 2, "already": 1, "exist": 1, "upsert": 1, "default": 1, "overwrite": 2, "used": 2, "for": 3, "single": 1, "moved": 1, "reset": 1, "which": 1, "overwrites": 1, "stored": 1, "it": 2, "deletes": 1, "otherwise": 2, "next": 2, "session": 1, "would": 3, "start": 1, "without": 1, "create": 2, "missing": 1, "leave": 1, "existing": 1, "ones": 1, "untouched": 1, "two": 1, "tabs": 1, "opened": 1, "at": 1, "same": 1, "time": 1, "each": 1, "other": 1, "freshly": 1, "written": 2, "cards": 2, "jump": 1, "on": 1, "load": 1, "naming": 1, "cannot": 1, "access": 1, "or": 1, "no": 1, "longer": 1, "exists": 1, "are": 1, "skipped": 1, "rejected": 1, "seconds": 1, "after": 1, "was": 1, "discarded": 1, "between": 1, "must": 1, "fail": 1, "whole": 1, "write": 1 }, "length": 185 }, { "operationId": "searchKnowledge", "terms": { "searchknowledge": 1, "search": 2, "wiki": 1, "repository": 1, "and": 2, "skill": 1, "knowledge": 3, "spaces": 2, "hybrid": 1, "over": 1, "pages": 1, "literal": 1, "german": 1, "full": 1, "text": 1, "plus": 1, "a": 1, "trigram": 1, "fallback": 1, "for": 1, "compound": 1, "words": 1, "semantic": 1, "merged": 1, "into": 1, "one": 1, "ranked": 1, "list": 1, "via": 1, "reciprocal": 1, "rank": 1, "fusion": 1, "restricted": 1, "to": 1, "the": 1, "caller": 1, "s": 1, "readable": 1 }, "length": 43 }, { "operationId": "searchUsers", "terms": { "2": 1, "searchusers": 1, "users": 4, "search": 1, "picker": 1, "searches": 1, "by": 1, "display": 1, "name": 1, "or": 1, "email": 1, "available": 1, "to": 1, "all": 1, "authenticated": 1, "minimum": 1, "characters": 1, "required": 1 }, "length": 21 }, { "operationId": "setChatVisibility", "terms": { "400": 1, "7161": 1, "setchatvisibility": 1, "chats": 2, "set": 1, "visibility": 1, "owner": 1, "only": 1, "toggle": 1, "between": 1, "private": 1, "and": 1, "public": 2, "setting": 1, "is": 1, "rejected": 1, "with": 1, "when": 2, "the": 1, "chat": 1, "has": 1, "no": 1, "task": 2, "link": 2, "not": 1, "reverted": 1, "automatically": 1, "a": 1, "later": 1, "removed": 1, "last": 1, "would": 1, "otherwise": 1, "apply": 1, "see": 1, "anw": 1 }, "length": 41 }, { "operationId": "setSkillVisibility", "terms": { "setskillvisibility": 1, "publish": 1, "or": 1, "retract": 1, "a": 1, "skill": 1, "owner": 1, "only": 1, "skills": 1 }, "length": 9 }, { "operationId": "setTaskAsap", "terms": { "930": 1, "1147": 1, "settaskasap": 1, "tasks": 2, "mark": 1, "asap": 5, "owner": 1, "only": 1, "aura": 2, "d": 1, "017": 1, "marks": 1, "the": 4, "task": 2, "response": 1, "carries": 1, "current": 1, "stock": 1, "sole": 1, "counter": 1, "pressure": 1, "against": 1, "inflation": 1, "since": 1, "there": 1, "is": 1, "no": 2, "cap": 1, "and": 1, "expiry": 1, "writes": 1, "set": 1, "idempotent": 1, "when": 1, "already": 1 }, "length": 46 }, { "operationId": "setTaskMemberRoles", "terms": { "409": 1, "settaskmemberroles": 1, "tasks": 2, "set": 3, "member": 2, "roles": 2, "replaces": 1, "all": 1, "assigned": 1, "to": 1, "a": 2, "task": 1, "idempotent": 1, "replace": 1, "with": 1, "fixed": 1, "of": 1, "taskrole": 1, "enum": 1, "values": 1, "returns": 1, "if": 1, "the": 2, "replacement": 1, "would": 1, "remove": 1, "last": 1, "owner": 3, "assign": 1, "another": 1, "first": 1, "or": 1, "start": 1, "an": 1, "search": 1 }, "length": 44 }, { "operationId": "setTaskRankLock", "terms": { "403": 1, "930": 1, "1150": 1, "settaskranklock": 1, "tasks": 2, "lock": 2, "or": 2, "unlock": 1, "a": 2, "priority": 1, "ordering": 1, "context": 4, "owner": 4, "only": 2, "aura": 2, "d": 1, "019": 1, "locks": 3, "unlocks": 1, "the": 5, "this": 1, "task": 2, "anchors": 1, "against": 1, "reordering": 1, "by": 1, "anyone": 1, "but": 1, "its": 2, "two": 1, "root": 3, "contexts": 1, "sagas": 1, "unparented": 1, "have": 1, "no": 1, "single": 1, "and": 2, "can": 1, "never": 1, "be": 1, "locked": 1, "attempt": 1, "on": 1, "one": 1, "answers": 1, "asap": 1, "is": 1, "unaffected": 1, "stays": 1, "regardless": 1, "s4": 1, "scope": 2, "children": 2, "of": 1, "named": 1, "own": 1, "ranklockedat": 1, "siblings": 1, "default": 1, "it": 1, "sits": 1, "in": 1 }, "length": 88 }, { "operationId": "setTaskRankReason", "terms": { "930": 1, "1147": 1, "settaskrankreason": 1, "tasks": 2, "publish": 1, "the": 4, "ordering": 1, "rationale": 2, "owner": 2, "only": 1, "aura": 2, "d": 1, "004": 1, "publishes": 1, "optional": 1, "always": 2, "visible": 1, "for": 1, "task": 1, "s": 1, "placement": 1, "including": 1, "one": 1, "edited": 1, "from": 1, "an": 1, "llm": 1, "draft": 1, "publishing": 1, "is": 1, "attributed": 1, "to": 1, "acting": 1 }, "length": 41 }, { "operationId": "setTaskStoryPoints", "terms": { "settaskstorypoints": 1, "tasks": 3, "set": 2, "or": 2, "withdraw": 2, "a": 3, "human": 3, "story": 1, "point": 1, "correction": 2, "appends": 1, "history": 1, "row": 1, "and": 2, "rewrites": 1, "the": 3, "cached": 1, "effective": 2, "value": 2, "only": 1, "stories": 1, "sub": 1, "are": 1, "eligible": 1, "requires": 1, "task": 1, "edit": 1, "access": 1, "key": 1, "null": 1, "withdraws": 1, "so": 1, "latest": 1, "ai": 1, "estimate": 1, "with": 1, "becomes": 1, "again": 1 }, "length": 53 }, { "operationId": "startArtifactReview", "terms": { "startartifactreview": 1, "artifacts": 2, "start": 1, "review": 3, "starts": 1, "a": 3, "for": 1, "specific": 1, "version": 2, "of": 1, "an": 1, "artifact": 1, "resolves": 1, "reviewers": 2, "from": 1, "roles": 1, "and": 3, "explicit": 1, "userids": 1, "creates": 1, "artifactreviewassignment": 1, "rows": 1, "sets": 1, "reviewstate": 1, "to": 1, "in": 1, "notifies": 1, "all": 1, "assigned": 1, "except": 1, "the": 3, "actor": 1, "if": 1, "already": 1, "has": 1, "completed": 1, "run": 1, "approved": 1, "or": 1, "needs": 1, "revision": 1, "old": 1, "assignments": 1, "decisions": 1, "are": 1, "cleared": 1, "first": 1, "requires": 1, "edit": 1, "permission": 1 }, "length": 61 }, { "operationId": "startCrewSearch", "terms": { "7759": 1, "startcrewsearch": 1, "tasks": 2, "start": 1, "crew": 4, "search": 1, "sets": 1, "looking": 1, "for": 1, "at": 1, "on": 1, "an": 1, "epic": 1, "story": 1, "phase": 1, "preserving": 1, "stores": 1, "the": 2, "durable": 1, "need": 2, "optional": 1, "due": 1, "date": 1, "and": 1, "leaves": 1, "workflow": 1, "status": 1, "unchanged": 1, "t18": 1, "s11": 1, "anw": 1, "requires": 1, "task": 1, "level": 1, "manage": 1, "access": 1, "or": 1, "a": 1, "leadership": 1, "admin": 1, "system": 1, "override": 1 }, "length": 48 }, { "operationId": "startOwnerSearch", "terms": { "7748": 1, "startownersearch": 1, "tasks": 2, "start": 1, "owner": 7, "search": 2, "sets": 1, "looking": 1, "for": 1, "at": 1, "on": 1, "an": 1, "epic": 1, "story": 1, "phase": 1, "preserving": 1, "stores": 1, "the": 2, "durable": 1, "goal": 3, "due": 2, "date": 2, "and": 2, "strips": 1, "from": 1, "previous": 1, "t18": 1, "s10": 1, "anw": 1, "leadership": 1, "gated": 1, "release": 1, "are": 1, "required": 1 }, "length": 48 }, { "operationId": "submitArtifactDecision", "terms": { "submitartifactdecision": 1, "artifacts": 2, "submit": 1, "approval": 1, "rejection": 1, "decision": 2, "submits": 1, "or": 3, "updates": 1, "an": 1, "approved": 1, "rejected": 1, "for": 1, "a": 1, "specific": 1, "version": 2, "bound": 1, "and": 1, "idempotent": 1, "upsert": 1, "after": 1, "all": 1, "role": 1, "holders": 1, "decide": 1, "the": 2, "artifact": 1, "is": 1, "auto": 1, "transitioned": 1, "to": 1, "isapproved": 1, "isrevision": 1, "status": 1, "bot": 1, "callable": 1 }, "length": 42 }, { "operationId": "suggestOwnerGoal", "terms": { "7748": 1, "suggestownergoal": 1, "tasks": 2, "suggest": 1, "owner": 4, "goal": 1, "ai": 1, "generates": 1, "a": 1, "one": 1, "sentence": 1, "mandate": 1, "via": 2, "claude": 1, "haiku": 1, "from": 1, "the": 2, "task": 1, "s": 1, "title": 1, "description": 1, "scope": 1, "and": 2, "linked": 1, "plan": 1, "body": 1, "when": 1, "present": 1, "t18": 1, "s10": 1, "anw": 1, "leadership": 1, "gated": 1, "release": 1, "search": 2, "does": 1, "not": 1, "persist": 1, "client": 1, "edits": 1, "submits": 1, "start": 1 }, "length": 50 }, { "operationId": "syncRepository", "terms": { "syncrepository": 1, "repositories": 2, "sync": 1, "document": 2, "tree": 2, "accepts": 1, "a": 1, "full": 1, "snapshot": 1, "and": 1, "upserts": 1, "it": 1, "into": 1, "the": 1, "database": 1, "protected": 1, "by": 1, "service": 1, "token": 1, "authorization": 1, "bearer": 1 }, "length": 24 }, { "operationId": "systemHealth", "terms": { "systemhealth": 1, "system": 1, "health": 4, "and": 2, "build": 2, "identity": 2, "authenticated": 1, "check": 1, "with": 1, "process": 1, "uptime": 1, "the": 2, "current": 1, "hash": 1, "tag": 1, "timestamps": 1, "distinct": 1, "from": 1, "unauthenticated": 1, "docker": 1, "probe": 1 }, "length": 28 }, { "operationId": "triggerAsanaSync", "terms": { "409": 1, "triggerasanasync": 1, "asana": 3, "trigger": 1, "project": 3, "sync": 3, "admin": 2, "triggers": 1, "a": 3, "background": 1, "that": 1, "mirrors": 1, "all": 1, "member": 1, "tasks": 1, "of": 1, "given": 1, "returns": 1, "if": 1, "for": 1, "the": 1, "same": 1, "is": 1, "already": 1, "running": 1, "requires": 1, "role": 1 }, "length": 36 }, { "operationId": "triggerJiraSync", "terms": { "409": 1, "triggerjirasync": 1, "jira": 2, "issues": 2, "trigger": 1, "topic": 3, "sync": 3, "admin": 2, "triggers": 1, "a": 3, "background": 1, "that": 1, "mirrors": 1, "all": 1, "for": 2, "given": 1, "team": 1, "returns": 1, "if": 1, "the": 1, "same": 1, "is": 1, "already": 1, "running": 1, "requires": 1, "role": 1, "jiraissues": 1 }, "length": 37 }, { "operationId": "triggerRepositoryCodeSync", "terms": { "202": 1, "triggerrepositorycodesync": 1, "repositories": 4, "trigger": 1, "code": 3, "sync": 3, "triggers": 1, "an": 1, "immediate": 1, "for": 1, "the": 3, "repository": 1, "via": 2, "repo": 2, "mcp": 2, "returns": 1, "immediately": 1, "runs": 1, "asynchronously": 1, "in": 1, "observable": 1, "get": 1, "latest": 1, "checkout": 1, "requires": 1, "manage": 1, "capability": 1 }, "length": 39 }, { "operationId": "triggerRepositoryDocRun", "terms": { "triggerrepositorydocrun": 1, "repositories": 3, "trigger": 1, "a": 2, "documentation": 2, "run": 3, "starts": 1, "fire": 1, "and": 2, "forget": 1, "for": 1, "the": 4, "repository": 1, "returns": 1, "immediately": 1, "with": 1, "new": 1, "id": 1, "progress": 1, "is": 1, "observable": 1, "via": 1, "doc": 1, "runs": 1, "endpoint": 1, "requires": 1, "manage": 1, "capability": 1 }, "length": 38 }, { "operationId": "triggerRepositoryIngestFromPr", "terms": { "triggerrepositoryingestfrompr": 1, "repositories": 5, "trigger": 1, "a": 1, "manual": 1, "pr": 1, "ingest": 3, "starts": 1, "an": 1, "in": 1, "process": 1, "run": 3, "that": 1, "fetches": 1, "aura": 2, "docs": 2, "documents": 1, "from": 1, "the": 5, "branch": 1, "via": 2, "bitbucket": 2, "api": 1, "and": 2, "ingests": 1, "them": 1, "into": 1, "database": 1, "pgvector": 1, "only": 1, "available": 1, "for": 1, "returns": 1, "immediately": 1, "with": 1, "new": 1, "id": 1, "progress": 1, "is": 1, "observable": 1, "get": 1, "latest": 1, "requires": 1, "manage": 1, "capability": 1 }, "length": 62 }, { "operationId": "unassignTaskFromProject", "terms": { "unassigntaskfromproject": 1, "projects": 2, "unassign": 1, "task": 3, "removes": 1, "the": 2, "direct": 1, "project": 1, "assignment": 1, "requires": 1, "edit": 1, "on": 1 }, "length": 16 }, { "operationId": "unifiedSearch", "terms": { "403": 1, "unifiedsearch": 1, "search": 4, "unified": 1, "semantic": 2, "across": 1, "one": 1, "or": 1, "more": 1, "source": 1, "types": 2, "in": 1, "a": 1, "single": 1, "request": 1, "per": 1, "type": 1, "authorization": 1, "is": 1, "enforced": 1, "silently": 1, "unauthorized": 1, "are": 1, "excluded": 1, "from": 1, "results": 1, "without": 1, "returning": 1 }, "length": 33 }, { "operationId": "unlinkArtifactFromTask", "terms": { "unlinkartifactfromtask": 1, "tasks": 2, "unlink": 1, "an": 1, "artifact": 3, "removes": 1, "the": 2, "task": 1, "link": 1, "itself": 1, "is": 1, "not": 1, "deleted": 1 }, "length": 17 }, { "operationId": "unlinkAsanaTaskFromTask", "terms": { "unlinkasanataskfromtask": 1, "tasks": 3, "unlink": 1, "an": 1, "asana": 4, "object": 1, "removes": 1, "the": 3, "link": 1, "from": 1, "a": 1, "task": 1, "mirrored": 1, "asanatask": 1, "record": 1, "itself": 1, "is": 2, "not": 1, "deleted": 1, "it": 1, "survives": 1, "and": 1, "reappears": 1, "unlinked": 1, "in": 1, "nothing": 1, "cleaned": 1, "up": 1, "on": 1, "side": 1 }, "length": 38 }, { "operationId": "unlinkChatFromTask", "terms": { "unlinkchatfromtask": 1, "tasks": 2, "unlink": 1, "a": 1, "chat": 4, "removes": 1, "the": 2, "task": 1, "link": 1, "by": 1, "setting": 1, "taskid": 1, "to": 1, "null": 1, "itself": 1, "is": 1, "not": 1, "deleted": 1 }, "length": 23 }, { "operationId": "unlinkFeedbackTask", "terms": { "unlinkfeedbacktask": 1, "feedback": 4, "unlink": 1, "a": 1, "task": 2, "removes": 1, "the": 1, "link": 1, "requires": 1, "view": 1 }, "length": 14 }, { "operationId": "unlinkJiraIssueFromTask", "terms": { "unlinkjiraissuefromtask": 1, "tasks": 2, "unlink": 1, "a": 2, "jira": 2, "issue": 2, "removes": 1, "the": 2, "link": 1, "from": 1, "task": 1, "mirrored": 1, "jiraissue": 1, "record": 1, "itself": 1, "is": 1, "not": 1, "deleted": 1 }, "length": 23 }, { "operationId": "unlinkRelatedFeedback", "terms": { "unlinkrelatedfeedback": 1, "feedback": 3, "unlink": 1, "a": 1, "related": 1, "entry": 1, "removes": 1, "the": 1, "canonical": 1, "relation": 1, "requires": 1, "view": 1 }, "length": 14 }, { "operationId": "unlinkRepositoryFromProject", "terms": { "unlinkrepositoryfromproject": 1, "projects": 2, "unlink": 1, "repository": 2, "removes": 1, "a": 2, "link": 1, "from": 1, "project": 1, "leadership": 1, "admin": 1, "only": 1 }, "length": 15 }, { "operationId": "unlinkRepositoryFromTask", "terms": { "unlinkrepositoryfromtask": 1, "tasks": 2, "unlink": 1, "a": 1, "repository": 3, "removes": 1, "the": 2, "task": 1, "link": 1, "itself": 1, "is": 1, "not": 1, "deleted": 1 }, "length": 17 }, { "operationId": "updateCapacitySettings", "terms": { "10": 2, "100": 1, "7772": 1, "updatecapacitysettings": 1, "capacity": 6, "update": 1, "company": 1, "base": 2, "setting": 1, "t18": 1, "s27": 1, "anw": 1, "set": 1, "the": 1, "firm": 1, "wide": 1, "steps": 1, "and": 1, "optional": 1, "explanation": 1, "note": 1, "requires": 1, "manage": 1, "settings": 1, "leadership": 1, "admin": 2, "only": 1 }, "length": 35 }, { "operationId": "updateComment", "terms": { "updatecomment": 1, "comments": 2, "update": 2, "updates": 1, "the": 2, "body": 1, "and": 1, "mentions": 1, "of": 1, "an": 1, "existing": 1, "comment": 3, "only": 1, "author": 1, "may": 1, "their": 1, "own": 1 }, "length": 22 }, { "operationId": "updateCrewSearch", "terms": { "1651": 1, "updatecrewsearch": 1, "tasks": 2, "update": 1, "crew": 4, "search": 2, "updates": 1, "need": 2, "and": 2, "or": 2, "due": 2, "date": 2, "on": 1, "a": 3, "running": 1, "aura": 1, "at": 1, "least": 1, "one": 1, "field": 1, "is": 2, "required": 1, "the": 1, "calendar": 1, "day": 1, "may": 1, "be": 1, "cleared": 1, "requires": 1, "task": 1, "level": 1, "manage": 1, "access": 1, "leadership": 1, "admin": 1, "system": 1, "override": 1 }, "length": 50 }, { "operationId": "updateGlossaryEntry", "terms": { "updateglossaryentry": 1, "glossary": 3, "update": 1, "updates": 1, "a": 1, "entry": 1, "and": 1, "re": 1, "embeds": 1, "it": 1 }, "length": 12 }, { "operationId": "updateKnowledgeNode", "terms": { "updateknowledgenode": 1, "rename": 1, "move": 1, "or": 1, "reorder": 1, "a": 1, "node": 1, "knowledge": 1 }, "length": 8 }, { "operationId": "updateKnowledgeSpace", "terms": { "updateknowledgespace": 1, "update": 1, "a": 1, "knowledge": 2, "space": 1 }, "length": 6 }, { "operationId": "updateNotificationPreferences", "terms": { "updatenotificationpreferences": 1, "notifications": 3, "update": 1, "preferences": 1, "saves": 1, "deviations": 1, "from": 2, "defaults": 2, "rows": 2, "matching": 1, "the": 1, "registry": 1, "default": 1, "are": 2, "deleted": 1, "sparse": 1, "storage": 1, "differing": 1, "upserted": 1 }, "length": 25 }, { "operationId": "updateOwnerSearch", "terms": { "1651": 1, "updateownersearch": 1, "tasks": 2, "update": 1, "owner": 5, "search": 3, "updates": 1, "goal": 2, "and": 2, "or": 1, "due": 2, "date": 2, "on": 1, "a": 2, "running": 1, "aura": 1, "at": 1, "least": 1, "one": 1, "field": 1, "is": 2, "required": 1, "the": 1, "calendar": 1, "day": 1, "cannot": 1, "be": 1, "cleared": 1, "leadership": 1, "gated": 1, "release": 1 }, "length": 44 }, { "operationId": "updateProject", "terms": { "updateproject": 1, "projects": 2, "update": 1, "updates": 1, "title": 1, "description": 1, "and": 1, "or": 1, "archive": 1, "flag": 1, "leadership": 1, "admin": 1, "only": 1 }, "length": 14 }, { "operationId": "updateRepository", "terms": { "updaterepository": 1, "repositories": 2, "update": 1, "updates": 1, "displayname": 1, "and": 1, "or": 1, "description": 1, "of": 1, "a": 1, "repository": 1, "admin": 1, "only": 1 }, "length": 14 }, { "operationId": "updateSkill", "terms": { "updateskill": 1, "update": 1, "skill": 1, "metadata": 1, "title": 1, "frontmatter": 1, "skills": 1 }, "length": 7 }, { "operationId": "updateTask", "terms": { "403": 1, "1226": 1, "7864": 1, "updatetask": 1, "tasks": 2, "update": 1, "updates": 1, "title": 1, "description": 1, "level": 7, "parent": 8, "type": 1, "archived": 1, "state": 1, "and": 3, "or": 3, "status": 2, "of": 3, "a": 7, "task": 4, "raising": 1, "to": 2, "saga": 3, "epic": 2, "requires": 1, "the": 12, "matching": 1, "create": 2, "capability": 1, "anw": 1, "otherwise": 2, "responds": 1, "promoting": 2, "demoting": 1, "e": 1, "g": 1, "subtask": 2, "story": 1, "is": 4, "single": 1, "call": 1, "with": 2, "both": 1, "id": 1, "set": 1, "together": 1, "only": 1, "change": 3, "usually": 1, "fails": 1, "hierarchy": 2, "validation": 1, "on": 1, "its": 2, "own": 2, "because": 1, "existing": 2, "no": 1, "longer": 1, "at": 1, "valid": 1, "for": 1, "new": 2, "target": 2, "default": 1, "when": 1, "current": 1, "s": 2, "grandparent": 1, "which": 1, "makes": 1, "promoted": 1, "sibling": 1, "former": 1, "if": 1, "would": 2, "leave": 1, "children": 1, "an": 1, "invalid": 1, "they": 1, "cascade": 1, "one": 1, "in": 1, "same": 1, "direction": 1, "aura": 1, "their": 1, "carried": 1, "over": 1, "where": 1, "series": 1, "still": 1, "has": 1, "it": 1, "reset": 1, "open": 1, "response": 1, "error": 1, "detail": 1, "names": 1, "any": 1, "child": 1, "this": 1, "push": 1, "beyond": 1, "depth": 1, "limits": 1, "instead": 1, "applying": 1, "partial": 1 }, "length": 174 }, { "operationId": "updateTaskMemberCapacity", "terms": { "7772": 1, "updatetaskmembercapacity": 1, "tasks": 1, "set": 4, "member": 4, "capacity": 4, "commitment": 2, "t18": 1, "s27": 1, "anw": 1, "change": 1, "remove": 1, "a": 3, "core": 2, "team": 2, "s": 2, "on": 1, "task": 2, "may": 2, "their": 1, "own": 1, "owners": 1, "and": 1, "leadership": 1, "admin": 1, "system": 1, "override": 1, "any": 1, "returns": 1, "the": 1, "updated": 1, "detail": 1, "self": 1, "serve": 1 }, "length": 51 }, { "operationId": "updateTaskMemberParticipation", "terms": { "updatetaskmemberparticipation": 1, "tasks": 2, "update": 2, "member": 4, "participation": 3, "self": 1, "declared": 1, "of": 1, "a": 1, "task": 1, "s": 2, "sentence": 1, "and": 1, "or": 1, "status": 1, "authorization": 1, "is": 1, "intentionally": 1, "loose": 1, "in": 1, "v1": 1, "matching": 1, "the": 1, "roles": 1, "endpoint": 1, "any": 2, "may": 1, "set": 1 }, "length": 37 }, { "operationId": "updateUser", "terms": { "updateuser": 1, "users": 2, "update": 1, "role": 2, "updates": 1, "the": 1, "of": 1, "a": 1, "user": 1, "admin": 1, "only": 1, "self": 1, "demotion": 1, "is": 1, "not": 1, "allowed": 1 }, "length": 18 }, { "operationId": "updateUserGroup", "terms": { "updateusergroup": 1, "usergroups": 2, "update": 1, "name": 2, "description": 2, "updates": 1, "the": 1, "and": 1, "or": 1, "of": 1, "a": 1, "user": 1, "group": 1, "leadership": 1, "admin": 1, "only": 1 }, "length": 19 }, { "operationId": "updateUserGroupMemberRole", "terms": { "updateusergroupmemberrole": 1, "usergroups": 2, "change": 1, "member": 3, "role": 2, "changes": 1, "a": 1, "s": 1, "to": 1, "lead": 1, "or": 1, "multiple": 1, "leads": 1, "are": 1, "allowed": 1, "leadership": 1, "admin": 1, "only": 1 }, "length": 22 }, { "operationId": "uploadCommentImage", "terms": { "uploadcommentimage": 1, "comments": 3, "upload": 1, "image": 5, "uploads": 2, "an": 2, "for": 4, "use": 1, "in": 1, "a": 5, "comment": 3, "or": 1, "task": 4, "description": 3, "the": 6, "is": 4, "entity": 1, "scoped": 1, "it": 1, "linked": 1, "once": 1, "saved": 1, "commentid": 3, "set": 1, "on": 1, "submit": 1, "entities": 1, "missing": 1, "means": 1, "bound": 1, "to": 1, "not": 1, "orphan": 1, "future": 1, "sweep": 2, "must": 1, "check": 1, "url": 1, "before": 1, "deleting": 1, "that": 1, "stay": 1, "unlinked": 1, "null": 1, "after": 1, "abandon": 1, "may": 1, "still": 1, "be": 1, "cleaned": 1, "by": 1, "periodic": 1 }, "length": 85 }, { "operationId": "uploadKnowledgeFile", "terms": { "409": 1, "uploadknowledgefile": 1, "upload": 1, "a": 9, "file": 6, "into": 1, "space": 1, "creates": 1, "or": 2, "replaces": 1, "node": 5, "uploads": 1, "as": 1, "the": 5, "slug": 2, "is": 3, "normalised": 1, "name": 2, "including": 1, "its": 2, "extension": 1, "title": 1, "and": 1, "asset": 1, "filename": 1, "keep": 1, "verbatim": 1, "when": 1, "with": 2, "same": 3, "already": 1, "exists": 1, "in": 1, "target": 1, "folder": 2, "content": 1, "replaced": 1, "path": 1, "new": 1, "bytes": 1, "no": 1, "version": 1, "collision": 1, "document": 1, "knowledge": 1 }, "length": 76 }, { "operationId": "uploadKnowledgeNodeImage", "terms": { "uploadknowledgenodeimage": 1, "upload": 1, "an": 1, "image": 1, "for": 1, "a": 1, "knowledge": 2, "node": 1 }, "length": 9 }, { "operationId": "uploadSkillAsset", "terms": { "uploadskillasset": 1, "upload": 1, "an": 1, "asset": 1, "to": 1, "a": 1, "skill": 1, "owner": 1, "only": 1, "skills": 1 }, "length": 10 }, { "operationId": "validateSkillImport", "terms": { "validateskillimport": 1, "upload": 1, "a": 2, "plugin": 1, "zip": 1, "and": 1, "receive": 1, "validation": 1, "preview": 1, "skills": 1 }, "length": 11 }, { "operationId": "withdrawCrewRequest", "terms": { "7759": 1, "withdrawcrewrequest": 1, "tasks": 2, "withdraw": 1, "crew": 2, "request": 2, "withdraws": 1, "a": 1, "pending": 1, "user": 2, "to": 2, "owner": 3, "requests": 2, "are": 2, "withdrawn": 2, "by": 2, "the": 2, "applicant": 1, "manage": 1, "side": 1, "t18": 1, "s11": 1, "anw": 1 }, "length": 35 }, { "operationId": "withdrawOwnerApplication", "terms": { "7748": 1, "withdrawownerapplication": 1, "tasks": 2, "withdraw": 1, "own": 2, "owner": 2, "application": 2, "withdraws": 1, "the": 1, "acting": 1, "user": 1, "s": 1, "pending": 1, "t18": 1, "s10": 1, "anw": 1 }, "length": 20 }], "docFreq": { "0": 1, "1": 2, "2": 2, "3": 1, "10": 3, "16": 1, "17": 1, "20": 1, "25": 1, "42": 1, "50": 1, "100": 2, "200": 10, "201": 1, "202": 1, "400": 3, "403": 10, "404": 17, "409": 14, "422": 2, "500": 2, "502": 3, "923": 2, "930": 9, "1145": 2, "1146": 1, "1147": 4, "1148": 1, "1150": 1, "1226": 2, "1239": 2, "1422": 1, "1423": 2, "1429": 1, "1644": 1, "1651": 2, "1654": 1, "1722": 1, "7056": 1, "7116": 1, "7161": 1, "7516": 1, "7525": 2, "7570": 1, "7662": 4, "7748": 7, "7754": 1, "7759": 11, "7772": 6, "7785": 1, "7802": 1, "7805": 1, "7848": 1, "7864": 1, "abortownersearch": 1, "tasks": 91, "abort": 3, "owner": 43, "search": 24, "clears": 3, "looking": 11, "for": 91, "at": 28, "rejects": 4, "open": 7, "applications": 1, "and": 99, "sets": 12, "the": 185, "given": 7, "user": 50, "as": 26, "sole": 2, "t18": 27, "s10": 7, "anw": 38, "leadership": 32, "gated": 4, "without": 14, "an": 60, "is": 71, "not": 46, "allowed": 5, "acceptartifactmemory": 1, "artifacts": 25, "accept": 2, "into": 8, "memory": 6, "explicit": 2, "validation": 3, "signal": 4, "d9": 1, "aura": 32, "native": 2, "ingest": 3, "enqueues": 2, "lane": 1, "a": 192, "embed": 1, "optional": 11, "kg": 2, "extract": 1, "artifact": 21, "s": 40, "latest": 9, "version": 19, "body": 13, "only": 70, "idempotent": 23, "when": 26, "content": 9, "hash": 3, "unchanged": 2, "accepttaskstorypointestimate": 1, "chat": 14, "proposed": 2, "story": 8, "point": 9, "estimate": 5, "writes": 6, "ai": 8, "that": 17, "task": 84, "points": 1, "trigger": 8, "answers": 2, "human": 7, "override": 11, "correction": 2, "in": 50, "effect": 1, "requires": 64, "edit": 18, "access": 41, "addartifactreviewer": 1, "add": 3, "reviewer": 3, "mid": 2, "run": 21, "adds": 3, "to": 87, "running": 9, "review": 16, "creates": 28, "new": 16, "artifactreviewassignment": 6, "row": 16, "artifactid": 2, "userid": 2, "if": 27, "already": 27, "present": 3, "notifies": 6, "newly": 1, "added": 2, "permission": 12, "addtaskmember": 1, "member": 20, "of": 66, "accepts": 3, "integer": 2, "or": 71, "useruuid": 1, "uuid": 11, "string": 1, "addusergroupmember": 1, "usergroups": 8, "group": 7, "with": 46, "lead": 4, "role": 23, "duplicates": 2, "admin": 52, "aisetup": 1, "bootstrap": 1, "empty": 5, "house": 2, "repository": 20, "from": 44, "wiki": 5, "blueprint": 2, "call": 7, "this": 22, "current": 27, "has": 20, "no": 33, "control": 1, "layer": 3, "yet": 4, "agents": 2, "md": 1, "skills": 20, "cursor": 1, "rules": 1, "anwaltde": 1, "you": 1, "need": 4, "set": 22, "it": 30, "up": 2, "returns": 96, "setup": 2, "skill": 20, "text": 7, "manifest": 1, "short": 5, "instruction": 1, "fetch": 2, "missing": 5, "blocks": 1, "via": 22, "getblueprintfiles": 2, "does": 15, "write": 4, "any": 10, "files": 2, "do": 2, "check": 4, "whether": 6, "repo": 3, "date": 7, "sync": 11, "mcp": 27, "applyascrew": 1, "apply": 6, "crew": 14, "refreshes": 2, "request": 10, "while": 8, "s11": 11, "logged": 5, "company": 8, "wide": 8, "exception": 2, "makes": 3, "marketplace": 2, "transparent": 2, "applyforowner": 1, "applies": 3, "re": 5, "after": 6, "withdrawal": 1, "approveglossaryentry": 1, "glossary": 8, "approve": 2, "pending": 16, "proposal": 8, "transitions": 1, "entry": 19, "approved": 5, "triggers": 7, "embedding": 4, "manage": 26, "capability": 17, "approveontologyproposal": 1, "ontology": 3, "ontologyproposals": 3, "assignownerfromsearch": 1, "assign": 4, "during": 1, "manually": 1, "applicant": 2, "application": 3, "consent": 1, "audited": 1, "non": 6, "chosen": 2, "rest": 1, "change": 9, "workflow": 3, "status": 29, "assigntasktoproject": 1, "projects": 12, "assigns": 1, "project": 17, "on": 33, "links": 9, "tier": 1, "inherits": 1, "ancestor": 6, "assigning": 1, "absorbs": 1, "redundant": 1, "descendant": 1, "assignments": 3, "same": 22, "transaction": 2, "archived": 8, "attachtagtotask": 1, "attach": 1, "tag": 5, "attaches": 2, "by": 42, "slug": 7, "exist": 7, "upsert": 3, "must": 10, "be": 19, "owned": 10, "batchupserttaskphasegoals": 1, "batch": 1, "save": 6, "phase": 5, "goals": 1, "deadline": 2, "intermediate": 1, "atomically": 1, "upserts": 3, "cleared": 6, "deletes": 14, "one": 25, "more": 3, "goal": 5, "rows": 11, "s28": 1, "frontend": 1, "redesign": 1, "each": 8, "target": 10, "part": 2, "resolved": 1, "series": 3, "have": 7, "been": 1, "reached": 1, "i": 2, "e": 5, "its": 25, "index": 1, "otherwise": 5, "null": 6, "description": 8, "instead": 6, "upserting": 1, "cancelartifactreview": 1, "cancel": 2, "cancels": 1, "specific": 9, "all": 43, "artifactapproval": 4, "reviewstate": 3, "back": 4, "unchecked": 1, "still": 7, "reviewers": 5, "those": 1, "decision": 2, "cancelrun": 1, "runs": 14, "cancelling": 1, "signals": 5, "pg": 2, "boss": 2, "job": 2, "cooperatively": 1, "worker": 1, "cancelled": 1, "once": 7, "process": 4, "exits": 1, "changefeedbackstatus": 1, "feedback": 9, "triage": 1, "discarded": 7, "discard": 2, "reason": 6, "view": 17, "cleartaskasap": 1, "clear": 1, "asap": 4, "d": 7, "017": 2, "removes": 19, "mark": 6, "keeps": 3, "rank": 6, "untouched": 2, "012": 1, "was": 6, "op": 1, "confirmasanalink": 1, "asana": 11, "confirm": 4, "link": 23, "confirms": 3, "propose": 5, "tool": 10, "identified": 2, "toolcallid": 2, "targeted": 1, "confirming": 1, "twice": 1, "existing": 6, "erroring": 1, "object": 5, "linked": 21, "different": 2, "confirmcrewremoval": 1, "removal": 4, "granted": 2, "confirmfeedback": 1, "caller": 20, "submit": 5, "confirmskillimport": 1, "import": 3, "selected": 1, "start": 8, "background": 4, "indexing": 1, "createasanataskfortask": 1, "create": 21, "counterpart": 3, "step": 2, "s6": 2, "where": 6, "created": 3, "follows": 1, "nearest": 2, "under": 3, "parent": 7, "becomes": 4, "subtask": 2, "own": 17, "connected": 8, "account": 8, "used": 6, "settings": 3, "integrations": 2, "there": 4, "service": 2, "error": 6, "responses": 4, "carry": 5, "type": 8, "discriminator": 3, "stored": 12, "token": 10, "unusable": 1, "invalid": 6, "could": 1, "derived": 7, "nothing": 3, "upstream": 3, "including": 9, "case": 2, "but": 10, "linking": 4, "failed": 3, "which": 8, "message": 2, "names": 4, "gid": 3, "free": 4, "design": 2, "agent": 8, "exposes": 2, "createcomment": 1, "comments": 8, "comment": 6, "entity": 9, "least": 6, "read": 24, "createfeedback": 1, "submits": 3, "anonymous": 2, "submissions": 1, "store": 1, "authorid": 1, "createglossaryentry": 1, "createknowledgenode": 1, "folder": 5, "document": 14, "node": 18, "knowledge": 30, "createknowledgespace": 1, "space": 10, "createmcpaccesstoken": 1, "me": 6, "plaintext": 1, "returned": 2, "response": 6, "cannot": 5, "retrieved": 1, "again": 2, "createproject": 1, "title": 8, "insensitive": 1, "unique": 1, "createrepository": 1, "repositories": 17, "createskill": 1, "canonical": 3, "visibility": 4, "defaults": 4, "personal": 6, "createtask": 1, "authenticated": 21, "automatically": 2, "creator": 1, "first": 14, "createtaskfromsignal": 1, "prefilled": 1, "summary": 3, "evidence": 2, "primary": 1, "exists": 9, "createtaskjiraissue": 1, "jira": 9, "issue": 7, "fields": 3, "mirrors": 4, "locally": 5, "mirror": 4, "chain": 2, "confirmation": 2, "uses": 2, "guarded": 1, "lock": 2, "so": 12, "two": 3, "concurrent": 1, "clicks": 1, "issues": 4, "race": 1, "true": 7, "duplicate": 2, "local": 4, "warning": 1, "next": 2, "repairs": 1, "createtaskrelation": 1, "relation": 5, "typed": 4, "directed": 2, "another": 5, "self": 7, "edges": 8, "are": 26, "rejected": 7, "triples": 1, "createusergroup": 1, "groups": 2, "grants": 2, "permissions": 1, "debugtriggertaskactivity": 1, "debug": 1, "fire": 3, "sample": 1, "activity": 5, "event": 2, "fires": 1, "changed": 2, "test": 1, "verification": 1, "will": 1, "removed": 3, "timeline": 2, "ui": 1, "delivered": 1, "declinecrewremoval": 1, "decline": 1, "declines": 2, "place": 1, "deleteartifact": 1, "delete": 12, "soft": 1, "setting": 6, "deleted": 11, "data": 4, "gets": 2, "deletecomment": 1, "hard": 2, "author": 2, "mentions": 2, "cascade": 5, "deleteglossaryentry": 1, "embeddings": 1, "deleteknowledgenode": 1, "cascades": 3, "children": 6, "versions": 4, "file": 9, "assets": 2, "whole": 6, "subtree": 1, "lose": 1, "their": 11, "objects": 1, "too": 1, "db": 2, "alone": 1, "would": 10, "leave": 4, "blobs": 1, "behind": 3, "deleteknowledgespace": 1, "nodes": 8, "deleteproject": 1, "permanently": 1, "deleterepository": 1, "deleteskill": 1, "deleteskillasset": 1, "asset": 7, "deleteskillplugin": 1, "plugin": 3, "every": 11, "reference": 1, "chunk": 1, "below": 2, "deletetaskrelation": 1, "belong": 3, "deleteusergroup": 1, "memberships": 2, "users": 13, "affected": 2, "detachtagfromtask": 1, "detach": 1, "itself": 7, "disablerepositorycodesearch": 1, "disable": 1, "code": 5, "disables": 1, "codesearchenabled": 3, "false": 2, "repositorycodecheckout": 2, "discardtask": 1, "aborts": 1, "terminal": 1, "s05": 2, "matrix": 3, "reversible": 1, "reopen": 3, "endpoint": 5, "ends": 1, "stakeholder": 1, "membership": 8, "roles": 6, "kept": 1, "downloadknowledgefile": 1, "download": 3, "bytes": 3, "streams": 1, "byte": 1, "identically": 1, "responds": 2, "disposition": 1, "attachment": 1, "unless": 2, "inline": 2, "requested": 3, "downloadskillasset": 1, "drafttaskrankreason": 1, "draft": 2, "ordering": 6, "rationale": 2, "015": 1, "generates": 2, "utility": 1, "model": 3, "never": 11, "persisted": 3, "edits": 3, "publishes": 2, "put": 2, "enablerepositorycodesearch": 1, "enable": 1, "enables": 1, "default": 15, "branch": 3, "cloned": 1, "endcrewsearch": 1, "end": 1, "closes": 1, "requests": 3, "keeping": 2, "level": 12, "system": 7, "estimatetaskstorypoints": 1, "estimator": 1, "appends": 2, "history": 5, "reasoned": 1, "refusal": 2, "technical": 1, "stories": 3, "sub": 3, "eligible": 3, "getactiveskillimportrun": 1, "get": 46, "active": 9, "most": 1, "recent": 2, "triggered": 1, "getartifact": 1, "detail": 18, "inactive": 1, "lacks": 5, "naming": 4, "meta": 8, "getartifactaccessoverview": 1, "overview": 8, "flat": 2, "deduplicated": 2, "list": 56, "who": 3, "direct": 6, "members": 4, "share": 2, "modal": 2, "purely": 1, "informational": 2, "mutation": 1, "affordances": 1, "getartifactapprovals": 1, "approval": 3, "includes": 3, "x": 1, "y": 1, "count": 7, "deciders": 1, "getartifactreview": 1, "state": 5, "per": 10, "person": 6, "assigned": 4, "reviewof": 1, "minimum": 3, "getartifactreviewpreview": 1, "preview": 6, "recipients": 1, "notified": 1, "explicitly": 1, "notifications": 8, "sent": 1, "calling": 5, "excluded": 5, "matching": 7, "actual": 2, "dispatch": 1, "behaviour": 1, "getartifactrevisecontext": 1, "revisebot": 1, "context": 5, "reviewofartifactid": 1, "reviewofversion": 1, "contract": 1, "getartifactversion": 1, "full": 15, "metadata": 3, "numeric": 1, "unknown": 3, "number": 1, "getasanacreatetargetfortask": 1, "resolve": 2, "dialog": 5, "resolution": 1, "path": 6, "disagree": 1, "reads": 3, "required": 9, "belongs": 3, "getasanastatus": 1, "connection": 1, "pat": 5, "validates": 2, "against": 6, "distinguishable": 2, "getasanatask": 1, "mirrored": 9, "single": 18, "addressed": 3, "sagas": 4, "exposed": 1, "directory": 1, "engineering": 1, "foundation": 1, "vs": 1, "decided": 1, "flag": 3, "pass": 2, "stamp": 1, "sha256": 1, "checksum": 2, "pin": 1, "revision": 2, "omit": 2, "use": 3, "needs": 4, "named": 3, "building": 1, "block": 2, "product": 2, "mcpgetskill": 2, "pages": 4, "outside": 2, "getboardbriefing": 1, "boards": 2, "generated": 2, "briefing": 1, "situation": 1, "report": 2, "board": 3, "cached": 2, "signature": 1, "llm": 4, "getboardsummary": 1, "attention": 1, "aggregates": 1, "projections": 1, "waiting": 1, "others": 3, "overdue": 1, "yellow": 1, "red": 1, "traffic": 1, "light": 1, "taskphasegoal": 1, "deadlines": 1, "included": 5, "pure": 1, "over": 4, "tables": 1, "getcapacitysettings": 1, "capacity": 7, "base": 2, "s27": 6, "firm": 3, "percentage": 1, "explanation": 2, "note": 3, "getcommentimage": 1, "image": 4, "binary": 1, "getfeedback": 1, "getglossaryentry": 1, "gethealth": 1, "health": 2, "getjiraissue": 1, "cloudid": 1, "issuekey": 1, "jiraissues": 3, "getknowledgenode": 1, "documents": 3, "getknowledgenodebypath": 1, "within": 1, "resolves": 5, "traversing": 1, "hierarchy": 5, "suitable": 1, "rendering": 1, "getknowledgenodeimage": 1, "serve": 3, "getknowledgenodeversion": 1, "getknowledgespace": 1, "getknowledgetree": 1, "tree": 5, "complete": 3, "folders": 2, "omitted": 3, "load": 2, "depth": 4, "max": 3, "bound": 3, "answer": 2, "comes": 4, "getllmturnpayload": 1, "turns": 2, "payload": 5, "loads": 1, "prompt": 1, "messages": 1, "raw": 1, "turn": 1, "s3": 3, "sees": 2, "old": 2, "time": 4, "failure": 2, "getmemoryentitysource": 1, "navigable": 1, "source": 5, "internal": 1, "route": 2, "external": 2, "url": 3, "jumping": 1, "operative": 1, "graph": 10, "related": 4, "doc": 4, "getmemorygraph": 1, "expansion": 1, "anchor": 1, "filtered": 4, "trust": 2, "filter": 5, "confirmed": 2, "include": 1, "candidates": 2, "also": 2, "return": 1, "candidate": 2, "edge": 3, "line": 1, "style": 1, "distinguishes": 2, "provenance": 2, "solid": 1, "structural": 1, "dashed": 1, "inferred": 1, "getmemorymap": 1, "cluster": 2, "map": 2, "aggregated": 1, "explorer": 2, "mode": 4, "entities": 3, "components": 1, "become": 1, "clusters": 1, "cross": 2, "top": 2, "cap": 3, "additional": 1, "contribute": 1, "hidden": 2, "getmycapacity": 1, "my": 4, "kpi": 2, "values": 3, "committed": 1, "utilization": 2, "plus": 11, "commitments": 2, "getmypriorityqueue": 2, "priority": 4, "order": 4, "work": 1, "then": 4, "walk": 2, "ranked": 3, "root": 3, "unparented": 2, "pseudo": 1, "freely": 1, "choosable": 1, "deliberately": 3, "unordered": 3, "everything": 1, "core": 2, "living": 2, "paginated": 29, "queue": 1, "computed": 5, "shared": 8, "dashboard": 1, "panel": 3, "capped": 1, "ten": 1, "client": 3, "side": 5, "slideover": 1, "shows": 2, "limit": 3, "bounds": 2, "items": 1, "getnotificationpreferences": 1, "preference": 1, "effective": 3, "registered": 2, "types": 2, "channels": 1, "merging": 2, "registry": 2, "absence": 1, "means": 2, "getpersonpriorityqueue": 1, "computation": 1, "opened": 2, "assignee": 1, "name": 7, "card": 4, "footer": 1, "may": 11, "022": 1, "folded": 1, "placeholder": 1, "stay": 2, "sequence": 1, "countable": 1, "key": 6, "server": 4, "getproject": 1, "getprojecttasktree": 1, "nested": 1, "roots": 1, "directly": 2, "viewer": 3, "filtering": 1, "see": 5, "taskvieweraccesswhere": 2, "done": 4, "getrepository": 1, "available": 6, "getrepositoryrunstatus": 1, "summaries": 1, "checkout": 2, "intended": 1, "focused": 1, "polling": 1, "avoids": 1, "reloading": 1, "getrepositorysynchistory": 1, "last": 7, "timestamps": 2, "getrun": 1, "agentrun": 1, "scriptrun": 1, "getsignal": 1, "getskill": 1, "getskillimportrun": 1, "poll": 1, "gettask": 1, "sufficient": 1, "relationship": 1, "insufficient": 1, "action": 2, "owners": 3, "can": 13, "grant": 4, "gettaskboard": 1, "diagram": 1, "unpaginated": 1, "inherited": 2, "taskaccessgrant": 1, "scope": 6, "together": 2, "renders": 2, "spatial": 1, "whose": 1, "auto": 2, "layout": 3, "known": 1, "paging": 1, "either": 1, "produce": 1, "reshuffles": 1, "page": 2, "force": 2, "before": 6, "drawing": 1, "anything": 1, "query": 3, "schema": 1, "here": 2, "bounded": 1, "low": 2, "hundreds": 1, "carries": 7, "slim": 2, "tasklistitem": 1, "archivedat": 1, "both": 4, "filters": 2, "orthogonal": 1, "applied": 1, "separately": 1, "positions": 2, "viewport": 2, "ship": 1, "fetching": 1, "them": 4, "show": 1, "spot": 1, "position": 2, "make": 1, "visibly": 1, "jump": 2, "ignored": 1, "gettaskbyhumankey": 1, "readable": 4, "identifier": 1, "g": 3, "malformed": 1, "opening": 1, "costs": 1, "gettaskbyjirakey": 1, "matches": 2, "jiraissue": 2, "cloud": 1, "site": 1, "shape": 1, "id": 10, "gettaskcycletimes": 1, "cycle": 1, "times": 1, "stays": 3, "display": 3, "interval": 1, "duration": 1, "parallel": 1, "strand": 1, "joined": 1, "activityevent": 1, "typically": 1, "fewer": 1, "than": 1, "twenty": 1, "intervals": 1, "chronology": 1, "whoever": 1, "durations": 1, "extra": 1, "gettaskgraph": 1, "scoped": 10, "renderer": 1, "agnostic": 1, "tags": 2, "attachments": 1, "relations": 1, "honours": 1, "q": 2, "match": 2, "louvain": 1, "community": 1, "colouring": 1, "gettaskhierarchygraph": 1, "carrying": 2, "child": 3, "reuses": 2, "taskgraph": 1, "dto": 1, "gettaskjiraissuedraft": 1, "derives": 1, "statuses": 1, "render": 1, "commits": 1, "derivation": 1, "team": 4, "picks": 1, "gettaskmembercapacity": 1, "editor": 1, "how": 1, "affects": 1, "total": 1, "auth": 1, "patch": 4, "gettaskneighborhood": 1, "neighbourhood": 1, "mini": 1, "shaped": 1, "siblings": 4, "consumers": 1, "semantic": 5, "taskrelation": 1, "neither": 1, "nor": 1, "callers": 2, "hide": 1, "should": 1, "treat": 1, "tenant": 1, "reaches": 1, "gettaskrankcontext": 1, "zones": 1, "ordered": 4, "zone": 1, "ascending": 1, "expected": 2, "fingerprint": 2, "reorder": 2, "sits": 2, "getusergroup": 1, "email": 2, "grantartifactaccess": 1, "update": 16, "principal": 1, "none": 1, "changes": 2, "updated": 4, "refreshed": 1, "invitecrew": 1, "invite": 1, "linkartifacttotask": 1, "taskartifact": 1, "join": 2, "table": 3, "found": 6, "linkasanatasktotask": 1, "permalink": 1, "s5": 1, "fetched": 1, "using": 1, "longer": 4, "usable": 2, "owns": 2, "discriminated": 2, "linkchattotask": 1, "taskid": 2, "linkfeedbacktask": 1, "addresses": 1, "immediately": 5, "linkjiraissuetotask": 1, "fetches": 2, "taskjiraissue": 1, "linkrelatedfeedback": 1, "undirected": 1, "linkrepositorytoproject": 1, "linkrepositorytotask": 1, "taskrepository": 1, "provided": 1, "listagentrunevents": 1, "structured": 2, "events": 2, "reasoning": 1, "calls": 1, "afterseq": 1, "lossless": 1, "reconnect": 1, "seq": 1, "they": 2, "listartifacts": 1, "listartifacttasks": 1, "sorted": 3, "updatedat": 2, "desc": 4, "listartifactversions": 1, "listasanamirrorprojects": 1, "distinct": 2, "seen": 1, "freshness": 1, "completed": 2, "success": 1, "truncated": 1, "backs": 1, "dropdown": 1, "contrast": 1, "live": 2, "selection": 2, "listasanaprojects": 1, "api": 4, "picker": 2, "reported": 1, "listasanatasks": 1, "resourcekind": 1, "touched": 1, "listchatartifacts": 1, "chats": 3, "listchats": 1, "listcomments": 1, "createdat": 2, "according": 1, "sort": 2, "dir": 1, "listdocrunmodels": 1, "models": 1, "bedrock": 1, "global": 1, "ref": 1, "listfeedback": 1, "hides": 2, "entries": 3, "receive": 2, "listglossaryentries": 1, "accessible": 2, "listjiraissues": 1, "listknowledgefiles": 1, "optionally": 2, "listknowledgefileversions": 1, "newest": 6, "n": 2, "listknowledgenodeversions": 1, "listknowledgespaces": 1, "spaces": 3, "topics": 1, "listleadershipcapacity": 1, "centric": 2, "participation": 2, "listllmturns": 1, "listlookingforcrewtasks": 1, "pool": 2, "lists": 2, "visible": 4, "regardless": 4, "click": 2, "opens": 2, "finding": 2, "lives": 2, "item": 2, "due": 6, "listlookingforownertasks": 1, "listmcpaccesstokens": 1, "tokens": 2, "secrets": 1, "listmemoryentities": 1, "faceted": 1, "supports": 2, "vocabulary": 1, "standard": 1, "parameters": 1, "listmentioncandidates": 1, "mention": 1, "mentioned": 1, "relative": 1, "listnotifications": 1, "listontologyproposals": 1, "proposals": 2, "listpendingglossaryentries": 1, "awaiting": 1, "listprocesses": 1, "processes": 1, "catalog": 1, "listprojects": 1, "reachable": 1, "listrepositories": 1, "listrepositorydocruns": 1, "documentation": 2, "listroutermisses": 1, "router": 1, "misses": 1, "unclassified": 1, "intents": 1, "captured": 1, "routermisses": 1, "listruns": 1, "across": 2, "kinds": 1, "listsignals": 1, "inbox": 1, "planning": 2, "intelligence": 1, "listskillassets": 1, "attached": 1, "listskillplugins": 1, "plugins": 1, "counts": 3, "listskills": 1, "public": 2, "listtags": 1, "usage": 1, "prefix": 1, "autocomplete": 1, "listtaskactivity": 1, "listtasks": 1, "listtaskstorypointestimates": 1, "append": 1, "value": 2, "listusergroups": 1, "listusers": 1, "markallnotificationsread": 1, "marks": 7, "unread": 1, "marknotificationread": 1, "notification": 1, "second": 1, "marktaskcommentsread": 1, "advances": 1, "watermark": 1, "rendered": 1, "timestamp": 1, "actually": 1, "moves": 1, "forward": 1, "marktaskread": 1, "readat": 1, "now": 1, "currently": 1, "mcpanswerquestion": 1, "question": 3, "saves": 2, "answered": 2, "chatbot": 1, "guard": 1, "mcpcreateartifact": 1, "markdown": 1, "forget": 2, "000": 2, "characters": 3, "large": 2, "emitted": 2, "argument": 2, "exceed": 2, "output": 2, "budget": 2, "long": 2, "seed": 1, "fill": 1, "mcpupdateartifact": 2, "section": 2, "send": 2, "mcpcreatetask": 1, "avoid": 1, "mcpcreateuploaddocument": 1, "upload": 8, "base64": 1, "ingests": 2, "maximum": 1, "mb": 1, "mcpexpandgraph": 1, "expand": 1, "mcpgetartifact": 1, "mcpgetknowledgedocument": 1, "mcpgetquestion": 1, "mcpgetrepodocument": 1, "mcpgetuploaddocument": 1, "mcplinkartifacttotask": 1, "mcplinkuploadtotask": 1, "mcplistcoderepositories": 1, "enabled": 1, "intersection": 1, "allowlist": 1, "mcpunifiedsearch": 1, "unified": 2, "post": 1, "bearer": 2, "clients": 1, "updates": 12, "limits": 2, "prefer": 1, "heading": 1, "multi": 1, "very": 1, "json": 1, "mcpwikisearch": 1, "literal": 2, "searches": 2, "combining": 1, "german": 2, "trigram": 2, "fallback": 2, "compound": 2, "words": 2, "restricted": 2, "overrideartifactreview": 1, "forces": 1, "intact": 2, "reopened": 1, "later": 2, "records": 4, "overridden": 1, "overridecrewremoval": 1, "writing": 2, "audit": 1, "trail": 1, "previewtasklevelcascade": 1, "dry": 1, "exactly": 1, "computes": 1, "descendants": 1, "leveled": 1, "simple": 1, "take": 1, "reset": 3, "rule": 1, "resets": 2, "powers": 1, "guided": 1, "restructure": 1, "proposecrewremoval": 1, "starts": 4, "consensual": 1, "flow": 2, "initiated": 1, "themselves": 1, "proposetaskstorypointestimate": 1, "size": 1, "recording": 1, "result": 1, "decides": 2, "readcapacity": 1, "works": 1, "everyone": 1, "yourself": 1, "always": 2, "foreign": 1, "common": 1, "leads": 2, "appears": 1, "dependent": 1, "gate": 1, "enforced": 2, "inside": 1, "operation": 1, "recordtaskprogress": 1, "record": 3, "progress": 3, "label": 1, "implement": 1, "refine": 1, "wave": 1, "lifecycle": 1, "give": 1, "continuous": 1, "effort": 1, "actor": 3, "rejectglossaryentry": 1, "reject": 2, "embedded": 1, "rejectontologyproposal": 1, "changing": 1, "removeartifactreviewer": 1, "remove": 5, "evaluates": 1, "quorum": 1, "removing": 1, "close": 1, "removetaskmember": 1, "trying": 1, "removeusergroupmember": 1, "reopenartifactreview": 1, "reopens": 2, "inverse": 1, "reopentask": 1, "onto": 1, "reordertaskrankcontext": 1, "016": 1, "ids": 1, "other": 2, "moved": 2, "selects": 1, "reportmemoryentityquestion": 1, "questionable": 1, "modify": 1, "corrections": 1, "through": 1, "openquestion": 1, "requestartifactreview": 1, "obligation": 1, "triggersreview": 1, "holders": 2, "sse": 1, "excluding": 1, "respondcrewrequest": 1, "respond": 1, "invited": 1, "restoreknowledgenodeversion": 1, "restore": 1, "previous": 2, "retryrun": 1, "retry": 1, "queues": 1, "reviewsignal": 1, "acknowledge": 1, "dismiss": 1, "snooze": 1, "revokeartifactaccess": 1, "revoke": 2, "revoking": 1, "revokemcpaccesstoken": 1, "revokes": 1, "revoked": 1, "saveknowledgenodebody": 1, "saveknowledgenodefrontmatter": 1, "replace": 2, "front": 1, "matter": 1, "saveskillbody": 1, "savetaskboardlayout": 1, "bulk": 1, "narrow": 1, "persists": 1, "snapshot": 2, "covers": 1, "several": 1, "hundred": 1, "goes": 1, "out": 1, "what": 1, "happens": 1, "overwrite": 1, "overwrites": 1, "session": 1, "ones": 1, "tabs": 1, "freshly": 1, "written": 1, "cards": 1, "skipped": 1, "seconds": 1, "between": 2, "fail": 1, "searchknowledge": 1, "hybrid": 1, "merged": 1, "reciprocal": 1, "fusion": 1, "searchusers": 1, "setchatvisibility": 1, "toggle": 1, "private": 1, "reverted": 1, "setskillvisibility": 1, "publish": 2, "retract": 1, "settaskasap": 1, "stock": 1, "counter": 1, "pressure": 1, "inflation": 1, "since": 1, "expiry": 1, "settaskmemberroles": 1, "replaces": 2, "fixed": 1, "taskrole": 1, "enum": 1, "replacement": 1, "settaskranklock": 1, "unlock": 1, "019": 1, "locks": 1, "unlocks": 1, "anchors": 1, "reordering": 1, "anyone": 1, "contexts": 1, "locked": 1, "attempt": 1, "unaffected": 1, "s4": 1, "ranklockedat": 1, "settaskrankreason": 1, "004": 1, "placement": 1, "edited": 1, "publishing": 1, "attributed": 1, "acting": 2, "settaskstorypoints": 1, "withdraw": 3, "rewrites": 1, "withdraws": 3, "startartifactreview": 1, "userids": 1, "except": 1, "decisions": 1, "startcrewsearch": 1, "epic": 3, "preserving": 2, "stores": 2, "durable": 2, "leaves": 1, "startownersearch": 1, "strips": 1, "release": 3, "submitartifactdecision": 1, "rejection": 1, "decide": 1, "transitioned": 1, "isapproved": 1, "isrevision": 1, "bot": 1, "callable": 1, "suggestownergoal": 1, "suggest": 1, "sentence": 2, "mandate": 1, "claude": 1, "haiku": 1, "plan": 1, "persist": 1, "syncrepository": 1, "database": 2, "protected": 1, "authorization": 3, "systemhealth": 1, "build": 1, "identity": 1, "uptime": 1, "unauthenticated": 1, "docker": 1, "probe": 1, "triggerasanasync": 1, "triggerjirasync": 1, "topic": 1, "triggerrepositorycodesync": 1, "immediate": 1, "asynchronously": 1, "observable": 3, "triggerrepositorydocrun": 1, "triggerrepositoryingestfrompr": 1, "manual": 1, "pr": 1, "docs": 1, "bitbucket": 1, "pgvector": 1, "unassigntaskfromproject": 1, "unassign": 1, "assignment": 1, "unifiedsearch": 1, "silently": 1, "unauthorized": 1, "results": 1, "returning": 1, "unlinkartifactfromtask": 1, "unlink": 8, "unlinkasanataskfromtask": 1, "asanatask": 1, "survives": 1, "reappears": 1, "unlinked": 2, "cleaned": 2, "unlinkchatfromtask": 1, "unlinkfeedbacktask": 1, "unlinkjiraissuefromtask": 1, "unlinkrelatedfeedback": 1, "unlinkrepositoryfromproject": 1, "unlinkrepositoryfromtask": 1, "updatecapacitysettings": 1, "steps": 1, "updatecomment": 1, "updatecrewsearch": 1, "field": 2, "calendar": 2, "day": 2, "updateglossaryentry": 1, "embeds": 1, "updateknowledgenode": 1, "rename": 1, "move": 1, "updateknowledgespace": 1, "updatenotificationpreferences": 1, "preferences": 1, "deviations": 1, "sparse": 1, "storage": 1, "differing": 1, "upserted": 1, "updateownersearch": 1, "updateproject": 1, "archive": 1, "updaterepository": 1, "displayname": 1, "updateskill": 1, "frontmatter": 1, "updatetask": 1, "raising": 1, "saga": 1, "promoting": 1, "demoting": 1, "usually": 1, "fails": 1, "because": 1, "valid": 1, "grandparent": 1, "promoted": 1, "sibling": 1, "former": 1, "direction": 1, "carried": 1, "push": 1, "beyond": 1, "applying": 1, "partial": 1, "updatetaskmembercapacity": 1, "commitment": 1, "updatetaskmemberparticipation": 1, "declared": 1, "intentionally": 1, "loose": 1, "v1": 1, "updateuser": 1, "demotion": 1, "updateusergroup": 1, "updateusergroupmemberrole": 1, "multiple": 1, "uploadcommentimage": 1, "uploads": 2, "saved": 1, "commentid": 1, "orphan": 1, "future": 1, "sweep": 1, "deleting": 1, "abandon": 1, "periodic": 1, "uploadknowledgefile": 1, "normalised": 1, "extension": 1, "filename": 1, "keep": 1, "verbatim": 1, "replaced": 1, "collision": 1, "uploadknowledgenodeimage": 1, "uploadskillasset": 1, "validateskillimport": 1, "zip": 1, "withdrawcrewrequest": 1, "withdrawn": 1, "withdrawownerapplication": 1 }, "avgDocLength": 35.776556776556774, "docCount": 273 }, "embedModelId": null, "vectors": null };

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
  node aura.mjs rest describe <operationId>                  print the full shape of one REST operation
  node aura.mjs rest call <operationId> [--param name=val \u2026] [--body-file F] [--body <json>]
                                                            invoke a REST operation by id
  node aura.mjs rest search "<natural-language intent>"     find REST operations by full-text search`;
function fail(msg, usage = false, code = 2) {
  console.error(msg);
  if (usage) console.error(USAGE);
  process.exit(code);
}
var LARGE_BODY_THRESHOLD = 500;
function freshWorkdir(prefix) {
  const dir = join4(tmpdir(), `${prefix}-${randomBytes2(6).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function writeWorkdir(dir, meta, body) {
  writeFileSync(join4(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
  writeFileSync(join4(dir, "body.md"), body, "utf8");
}
function readWorkdirMeta(dir) {
  const p = join4(dir, "meta.json");
  if (!existsSync4(p)) fail(`workdir ${dir} has no meta.json`);
  return JSON.parse(readFileSync5(p, "utf8"));
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
    const p = join4(tmp, name);
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
  const bodyPath = join4(dir, "body.md");
  if (!existsSync4(bodyPath)) fail(`workdir ${dir} has no body.md`);
  const body = readFileSync5(bodyPath, "utf8");
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
    body = readFileSync5(opts.bodyFile, "utf8");
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
  const bodyPath = join4(dir, "body.md");
  if (!existsSync4(bodyPath)) fail(`workdir ${dir} has no body.md`);
  const body = readFileSync5(bodyPath, "utf8");
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
  const buf = readFileSync5(opts.file);
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
    writeFileSync(join4(dir, "parsed.md"), summary, "utf8");
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
function getRestIndex() {
  if (REST_INDEX) {
    const index = {};
    for (const m of REST_INDEX.metadata) {
      index[m.operationId] = {
        operationId: m.operationId,
        method: m.method,
        path: m.path,
        pathParams: m.pathParams,
        queryParams: m.queryParams,
        body: m.body,
        tags: m.tags,
        summary: m.summary,
        // description omitted in slim metadata (stays in FTS text only)
        responses: m.responses
      };
    }
    return index;
  }
  const openApiPath = resolve(process.cwd(), "packages", "shared", "openapi", "openapi.yaml");
  return loadOpenApi(openApiPath);
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
      const index = getRestIndex();
      switch (sub) {
        case "list": {
          restList(index, console);
          return;
        }
        case "describe": {
          const opId = rest[0];
          if (!opId) fail("rest describe: missing <operationId>", true);
          restDescribe(index, opId, console, REST_INDEX.fts);
          return;
        }
        case "call": {
          const opId = rest[0];
          if (!opId) fail("rest call: missing <operationId>", true);
          const callArgs = parseCallArgs(rest.slice(1));
          const body = resolveBody(callArgs);
          const credentials = await resolveAuraCredentials();
          await restCall(index, credentials, {
            operationId: opId,
            params: callArgs.params,
            body
          }, console, { fts: REST_INDEX.fts });
          return;
        }
        case "search": {
          const query = rest[0];
          if (!query) fail("rest search: missing <query>", true);
          const flags = parseFlags(rest.slice(1));
          const { createEmbedProvider: createEmbedProvider2, loadEmbedSettings: loadEmbedSettings2 } = await Promise.resolve().then(() => (init_provider(), provider_exports));
          const embedSettings = loadEmbedSettings2();
          const embedProvider = await createEmbedProvider2(embedSettings);
          await restSearch(REST_INDEX, query, console, {
            limit: flags.limit ? Number(flags.limit) : void 0,
            embedProvider
          });
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
