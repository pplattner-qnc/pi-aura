import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_fn } from 'node:path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_fn(__filename);
const require = __createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x2) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x2, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x2)(function(x2) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x2 + '" is not supported');
});
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
      { service: "aura", name: "pat" }
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
  const known = KNOWN_SECRET_KEYS2.find((k2) => `${k2.service}/${k2.name}` === account);
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
      { service: "aura", name: "pat" }
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
      { service: "aura", name: "pat" }
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

// src/engineering-sync.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync3, mkdirSync, readFileSync as readFileSync2, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname as dirname2, join as join3, relative, resolve } from "node:path";

// ../node_modules/js-yaml/dist/js-yaml.mjs
function getDefaultExportFromCjs(x2) {
  return x2 && x2.__esModule && Object.prototype.hasOwnProperty.call(x2, "default") ? x2["default"] : x2;
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

// ../node_modules/@hey-api/client-fetch/dist/index.js
var A = async (s, r) => {
  let e = typeof r == "function" ? await r(s) : r;
  if (e) return s.scheme === "bearer" ? `Bearer ${e}` : s.scheme === "basic" ? `Basic ${btoa(e)}` : e;
};
var O = { bodySerializer: (s) => JSON.stringify(s, (r, e) => typeof e == "bigint" ? e.toString() : e) };
var U = { $body_: "body", $headers_: "headers", $path_: "path", $query_: "query" };
var D = Object.entries(U);
var B = (s) => {
  switch (s) {
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
var N = (s) => {
  switch (s) {
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
var Q = (s) => {
  switch (s) {
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
var S = ({ allowReserved: s, explode: r, name: e, style: a, value: i }) => {
  if (!r) {
    let t = (s ? i : i.map((l) => encodeURIComponent(l))).join(N(a));
    switch (a) {
      case "label":
        return `.${t}`;
      case "matrix":
        return `;${e}=${t}`;
      case "simple":
        return t;
      default:
        return `${e}=${t}`;
    }
  }
  let o = B(a), n = i.map((t) => a === "label" || a === "simple" ? s ? t : encodeURIComponent(t) : m({ allowReserved: s, name: e, value: t })).join(o);
  return a === "label" || a === "matrix" ? o + n : n;
};
var m = ({ allowReserved: s, name: r, value: e }) => {
  if (e == null) return "";
  if (typeof e == "object") throw new Error("Deeply-nested arrays/objects aren\u2019t supported. Provide your own `querySerializer()` to handle these.");
  return `${r}=${s ? e : encodeURIComponent(e)}`;
};
var q = ({ allowReserved: s, explode: r, name: e, style: a, value: i, valueOnly: o }) => {
  if (i instanceof Date) return o ? i.toISOString() : `${e}=${i.toISOString()}`;
  if (a !== "deepObject" && !r) {
    let l = [];
    Object.entries(i).forEach(([p, d]) => {
      l = [...l, p, s ? d : encodeURIComponent(d)];
    });
    let u = l.join(",");
    switch (a) {
      case "form":
        return `${e}=${u}`;
      case "label":
        return `.${u}`;
      case "matrix":
        return `;${e}=${u}`;
      default:
        return u;
    }
  }
  let n = Q(a), t = Object.entries(i).map(([l, u]) => m({ allowReserved: s, name: a === "deepObject" ? `${e}[${l}]` : l, value: u })).join(n);
  return a === "label" || a === "matrix" ? n + t : t;
};
var J = /\{[^{}]+\}/g;
var M = ({ path: s, url: r }) => {
  let e = r, a = r.match(J);
  if (a) for (let i of a) {
    let o = false, n = i.substring(1, i.length - 1), t = "simple";
    n.endsWith("*") && (o = true, n = n.substring(0, n.length - 1)), n.startsWith(".") ? (n = n.substring(1), t = "label") : n.startsWith(";") && (n = n.substring(1), t = "matrix");
    let l = s[n];
    if (l == null) continue;
    if (Array.isArray(l)) {
      e = e.replace(i, S({ explode: o, name: n, style: t, value: l }));
      continue;
    }
    if (typeof l == "object") {
      e = e.replace(i, q({ explode: o, name: n, style: t, value: l, valueOnly: true }));
      continue;
    }
    if (t === "matrix") {
      e = e.replace(i, `;${m({ name: n, value: l })}`);
      continue;
    }
    let u = encodeURIComponent(t === "label" ? `.${l}` : l);
    e = e.replace(i, u);
  }
  return e;
};
var k = ({ allowReserved: s, array: r, object: e } = {}) => (i) => {
  let o = [];
  if (i && typeof i == "object") for (let n in i) {
    let t = i[n];
    if (t != null) if (Array.isArray(t)) {
      let l = S({ allowReserved: s, explode: true, name: n, style: "form", value: t, ...r });
      l && o.push(l);
    } else if (typeof t == "object") {
      let l = q({ allowReserved: s, explode: true, name: n, style: "deepObject", value: t, ...e });
      l && o.push(l);
    } else {
      let l = m({ allowReserved: s, name: n, value: t });
      l && o.push(l);
    }
  }
  return o.join("&");
};
var E = (s) => {
  if (!s) return "stream";
  let r = s.split(";")[0]?.trim();
  if (r) {
    if (r.startsWith("application/json") || r.endsWith("+json")) return "json";
    if (r === "multipart/form-data") return "formData";
    if (["application/", "audio/", "image/", "video/"].some((e) => r.startsWith(e))) return "blob";
    if (r.startsWith("text/")) return "text";
  }
};
var $ = async ({ security: s, ...r }) => {
  for (let e of s) {
    let a = await A(e, r.auth);
    if (!a) continue;
    let i = e.name ?? "Authorization";
    switch (e.in) {
      case "query":
        r.query || (r.query = {}), r.query[i] = a;
        break;
      case "cookie":
        r.headers.append("Cookie", `${i}=${a}`);
        break;
      case "header":
      default:
        r.headers.set(i, a);
        break;
    }
    return;
  }
};
var C = (s) => L({ baseUrl: s.baseUrl, path: s.path, query: s.query, querySerializer: typeof s.querySerializer == "function" ? s.querySerializer : k(s.querySerializer), url: s.url });
var L = ({ baseUrl: s, path: r, query: e, querySerializer: a, url: i }) => {
  let o = i.startsWith("/") ? i : `/${i}`, n = (s ?? "") + o;
  r && (n = M({ path: r, url: n }));
  let t = e ? a(e) : "";
  return t.startsWith("?") && (t = t.substring(1)), t && (n += `?${t}`), n;
};
var x = (s, r) => {
  let e = { ...s, ...r };
  return e.baseUrl?.endsWith("/") && (e.baseUrl = e.baseUrl.substring(0, e.baseUrl.length - 1)), e.headers = j(s.headers, r.headers), e;
};
var j = (...s) => {
  let r = new Headers();
  for (let e of s) {
    if (!e || typeof e != "object") continue;
    let a = e instanceof Headers ? e.entries() : Object.entries(e);
    for (let [i, o] of a) if (o === null) r.delete(i);
    else if (Array.isArray(o)) for (let n of o) r.append(i, n);
    else o !== void 0 && r.set(i, typeof o == "object" ? JSON.stringify(o) : o);
  }
  return r;
};
var g = class {
  _fns;
  constructor() {
    this._fns = [];
  }
  clear() {
    this._fns = [];
  }
  getInterceptorIndex(r) {
    return typeof r == "number" ? this._fns[r] ? r : -1 : this._fns.indexOf(r);
  }
  exists(r) {
    let e = this.getInterceptorIndex(r);
    return !!this._fns[e];
  }
  eject(r) {
    let e = this.getInterceptorIndex(r);
    this._fns[e] && (this._fns[e] = null);
  }
  update(r, e) {
    let a = this.getInterceptorIndex(r);
    return this._fns[a] ? (this._fns[a] = e, r) : false;
  }
  use(r) {
    return this._fns = [...this._fns, r], this._fns.length - 1;
  }
};
var v = () => ({ error: new g(), request: new g(), response: new g() });
var V = k({ allowReserved: false, array: { explode: true, style: "form" }, object: { explode: true, style: "deepObject" } });
var F = { "Content-Type": "application/json" };
var w = (s = {}) => ({ ...O, headers: F, parseAs: "auto", querySerializer: V, ...s });
var G = (s = {}) => {
  let r = x(w(), s), e = () => ({ ...r }), a = (n) => (r = x(r, n), e()), i = v(), o = async (n) => {
    let t = { ...r, ...n, fetch: n.fetch ?? r.fetch ?? globalThis.fetch, headers: j(r.headers, n.headers) };
    t.security && await $({ ...t, security: t.security }), t.body && t.bodySerializer && (t.body = t.bodySerializer(t.body)), (t.body === void 0 || t.body === "") && t.headers.delete("Content-Type");
    let l = C(t), u = { redirect: "follow", ...t }, p = new Request(l, u);
    for (let f of i.request._fns) f && (p = await f(p, t));
    let d = t.fetch, c = await d(p);
    for (let f of i.response._fns) f && (c = await f(c, p, t));
    let b = { request: p, response: c };
    if (c.ok) {
      if (c.status === 204 || c.headers.get("Content-Length") === "0") return t.responseStyle === "data" ? {} : { data: {}, ...b };
      let f = (t.parseAs === "auto" ? E(c.headers.get("Content-Type")) : t.parseAs) ?? "json";
      if (f === "stream") return t.responseStyle === "data" ? c.body : { data: c.body, ...b };
      let h = await c[f]();
      return f === "json" && (t.responseValidator && await t.responseValidator(h), t.responseTransformer && (h = await t.responseTransformer(h))), t.responseStyle === "data" ? h : { data: h, ...b };
    }
    let R = await c.text();
    try {
      R = JSON.parse(R);
    } catch {
    }
    let y = R;
    for (let f of i.error._fns) f && (y = await f(R, c, p, t));
    if (y = y || {}, t.throwOnError) throw y;
    return t.responseStyle === "data" ? void 0 : { error: y, ...b };
  };
  return { buildUrl: C, connect: (n) => o({ ...n, method: "CONNECT" }), delete: (n) => o({ ...n, method: "DELETE" }), get: (n) => o({ ...n, method: "GET" }), getConfig: e, head: (n) => o({ ...n, method: "HEAD" }), interceptors: i, options: (n) => o({ ...n, method: "OPTIONS" }), patch: (n) => o({ ...n, method: "PATCH" }), post: (n) => o({ ...n, method: "POST" }), put: (n) => o({ ...n, method: "PUT" }), request: o, setConfig: a, trace: (n) => o({ ...n, method: "TRACE" }) };
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

// ../packages/shared/src/generated/client.gen.ts
var client = G(w({
  baseUrl: "http://localhost:3000/api"
}));

// ../packages/shared/src/generated/sdk.gen.ts
var getBlueprintFiles = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/mcp/blueprint/files",
    ...options
  });
};
var mcpCreateArtifact = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/mcp/artifacts",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
};
var mcpUpdateArtifact = (options) => {
  return (options.client ?? client).patch({
    security: [
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/mcp/artifacts/{id}",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
};
var mcpCreateUploadDocument = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/mcp/upload-documents",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
};
var mcpGetUploadDocument = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/mcp/upload-documents/{id}",
    ...options
  });
};
var mcpWikiSearch = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/mcp/wiki-search",
    ...options
  });
};
var listTasks = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/tasks",
    ...options
  });
};
var getMyPriorityQueue = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/tasks/my-priority",
    ...options
  });
};
var getTaskByHumanKey = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/tasks/by-key/{key}",
    ...options
  });
};
var getMyCapacity = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/capacity/me",
    ...options
  });
};
var listArtifacts = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/artifacts",
    ...options
  });
};
var getArtifact = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/artifacts/{id}",
    ...options
  });
};
var requestArtifactReview = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/artifacts/{id}/review-request",
    ...options
  });
};
var submitArtifactDecision = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/artifacts/{id}/decisions",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
};
var getArtifactApprovals = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/artifacts/{id}/approvals",
    ...options
  });
};
var startArtifactReview = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/artifacts/{id}/review-start",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
};
var reopenArtifactReview = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/artifacts/{id}/review-reopen",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
};
var getArtifactReview = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/artifacts/{id}/review",
    ...options
  });
};
var getKnowledgeTree = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      }
    ],
    url: "/knowledge/spaces/{slug}/nodes",
    ...options
  });
};
var createKnowledgeNode = (options) => {
  return (options.client ?? client).post({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      }
    ],
    url: "/knowledge/spaces/{slug}/nodes",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
};
var getKnowledgeNodeByPath = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      }
    ],
    url: "/knowledge/spaces/{slug}/nodes/by-path",
    ...options
  });
};
var getKnowledgeNode = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      }
    ],
    url: "/knowledge/nodes/{uuid}",
    ...options
  });
};
var saveKnowledgeNodeBody = (options) => {
  return (options.client ?? client).put({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      }
    ],
    url: "/knowledge/nodes/{uuid}/body",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
};
var getKnowledgeNodeVersion = (options) => {
  return (options.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      }
    ],
    url: "/knowledge/nodes/{uuid}/versions/{version}",
    ...options
  });
};
var getBoardSummary = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/boards",
    ...options
  });
};
var getBoardBriefing = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/boards/briefing",
    ...options
  });
};
var listNotifications = (options) => {
  return (options?.client ?? client).get({
    security: [
      {
        in: "cookie",
        name: "aura-session",
        type: "apiKey"
      },
      {
        scheme: "bearer",
        type: "http"
      }
    ],
    url: "/notifications",
    ...options
  });
};

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
    this.client = G({ baseUrl: opts.baseUrl });
    this.pat = opts.pat ?? null;
    this.client.interceptors.request.use(async (req) => {
      const pat = await this.ensurePat();
      req.headers.set("Authorization", `Bearer ${pat}`);
      return req;
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
      const g2 = d;
      return {
        status: g2.status,
        id: g2.id,
        title: g2.title,
        version: g2.version,
        mode: g2.mode,
        affected_heading: g2.affected_heading
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
      const g2 = d;
      return {
        items: g2.items.map((h) => ({
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
      const g2 = d;
      return {
        space_id: g2.space_id,
        nodes: g2.nodes.map(mapKnowledgeNode)
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
    const g2 = res.data ?? {};
    if (g2.ok === false && g2.error) {
      throw new AuraApiError(0, `${g2.error.code}: ${g2.error.detail}`);
    }
    const files = (g2.files ?? []).map((f) => ({
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
      ok: g2.ok ?? true,
      files,
      error: g2.error
    };
  }
  async getKnowledgeNodeVersion(uuid, version) {
    const res = await getKnowledgeNodeVersion({
      client: this.client,
      path: { uuid, version }
    });
    return unwrap(res, (d) => {
      const g2 = d;
      return {
        id: g2.id,
        node_id: g2.node_id,
        version: g2.version,
        body: g2.body,
        summary: g2.summary ?? null,
        created_by_user_id: g2.created_by_user_id,
        created_at: g2.created_at
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
      const g2 = d;
      return {
        text: g2.text,
        generated_at: g2.generated_at
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
  const g2 = d;
  return {
    id: g2.id,
    title: g2.title,
    latest_version: g2.latest_version,
    version: g2.version,
    body: g2.body,
    summary: g2.summary,
    kind: g2.kind,
    created_at: g2.created_at,
    updated_at: g2.updated_at
  };
}
function mapArtifactListItem(d) {
  const g2 = d;
  return {
    id: g2.id,
    title: g2.title,
    latest_version: g2.latest_version,
    created_at: g2.created_at,
    updated_at: g2.updated_at,
    kind: g2.kind,
    pending_for_me: g2.pending_for_me
  };
}
function mapArtifactList(d) {
  const g2 = d;
  return {
    items: g2.items.map(mapArtifactListItem),
    pagination: mapPagination(g2.pagination)
  };
}
function mapKnowledgeNode(d) {
  const g2 = d;
  return {
    id: g2.id,
    space_id: g2.space_id,
    space_slug: g2.space_slug,
    kind: g2.kind,
    title: g2.title,
    slug: g2.slug,
    latest_version: g2.latest_version,
    body: g2.body,
    // Surface the provenance Aura carries on every node (used by the
    // engineering-sync manifest); kept off the named interface via the index
    // signature so callers opt in explicitly.
    updated_at: g2.updated_at,
    body_hash: g2.body_hash,
    // Preserve the nested `children` the REST tree carries (the wiki tree is
    // recursive: folders contain documents/other folders). The named
    // KnowledgeNode interface hides this behind its index signature so callers
    // opt in explicitly (engineering-sync recurses it; pretty-printers ignore
    // it). Without this the nested docs (guides/*, workflow/*) are invisible.
    children: (g2.children ?? []).map(mapKnowledgeNode)
  };
}
function mapUploadDocument(d) {
  const g2 = d;
  return {
    id: g2.id,
    filename: g2.filename,
    mime_type: g2.mime_type,
    byte_size: g2.byte_size,
    summary: g2.summary,
    page_count: g2.page_count,
    ingest_status: g2.ingest_status,
    portal_url: g2.portal_url,
    pages: g2.pages
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
  const g2 = d;
  return {
    overdue: g2.overdue ? { count: g2.overdue.count, items: g2.overdue.items.map((i) => ({
      // BoardOverdueItem has task + deadline + days, not kind/title/since.
      kind: void 0,
      task: i.task ? { uuid: i.task.uuid, human_key: i.task.human_key, title: i.task.title, status: i.task.status, status_type: i.task.status_type } : void 0,
      title: i.task?.title ?? "",
      since: void 0,
      waiting_days: i.days !== void 0 ? Math.abs(i.days) : void 0,
      link: void 0,
      approvals_pending: void 0
    })) } : void 0,
    waiting_on_me: g2.waiting_on_me ? { count: g2.waiting_on_me.count, items: g2.waiting_on_me.items.map(mapBoardBucketItem) } : void 0,
    waiting_on_others: g2.waiting_on_others ? { count: g2.waiting_on_others.count, items: g2.waiting_on_others.items.map(mapBoardBucketItem) } : void 0
  };
}
function mapNotification(d) {
  const g2 = d;
  return {
    id: g2.id,
    type: g2.type,
    read: g2.read,
    created_at: g2.created_at
  };
}
function mapNotificationList(d) {
  const g2 = d;
  return {
    items: g2.items.map(mapNotification),
    pagination: mapPagination(g2.pagination)
  };
}
function mapHumanKeyRef(d) {
  const g2 = d;
  return { id: g2.id, title: g2.title, level: g2.level ?? "" };
}
function mapPriorityQueueItem(d) {
  const g2 = d;
  return {
    id: g2.id,
    human_key: g2.human_key,
    title: g2.title,
    status: g2.status,
    status_type: g2.status_type,
    level: g2.level,
    block: g2.block,
    rank: g2.rank,
    asap: g2.asap,
    blocked_by: g2.blocked_by.map((b) => b.human_key),
    context_path: g2.context_path.map((c) => mapHumanKeyRef(c)),
    governing_date: g2.governing_date,
    capacity_percent: g2.capacity_percent
  };
}
function mapPriorityQueue(d) {
  const g2 = d;
  return {
    items: g2.items.map(mapPriorityQueueItem),
    total: g2.total,
    unordered_count: g2.unordered_count
  };
}
function mapCapacityTask(d) {
  const g2 = d;
  return {
    task_id: g2.task_id,
    human_key: g2.human_key,
    task_title: g2.task_title,
    task_status: g2.task_status,
    roles: g2.roles,
    capacity_percent: g2.capacity_percent,
    task_level: g2.task_level,
    hierarchy_path: g2.hierarchy_path.map(mapHumanKeyRef)
  };
}
function mapCapacity(d) {
  const g2 = d;
  return {
    base_percent: g2.base_percent,
    committed_percent: g2.committed_percent,
    free_percent: g2.free_percent,
    utilization_percent: g2.utilization_percent,
    over: g2.over,
    base_capacity_note: g2.base_capacity_note,
    tasks: g2.tasks.map(mapCapacityTask)
  };
}
function mapTask(d) {
  const g2 = d;
  const jira = "jira_issues" in g2 ? g2.jira_issues ?? [] : [];
  const children = "children" in g2 ? g2.children ?? [] : [];
  return {
    id: g2.id,
    human_key: g2.human_key,
    title: g2.title,
    description: g2.description,
    status: g2.status,
    status_type: g2.status_type,
    level: g2.level,
    jira_issues: jira.map((j2) => ({ issue_key: j2.issue_key, summary: j2.summary })),
    children: children.map((c) => ({ human_key: c.human_key, title: c.title }))
  };
}
function mapTaskList(d) {
  const g2 = d;
  return {
    items: g2.items.map((t) => mapTask(t)),
    pagination: mapPagination(g2.pagination)
  };
}
function mapArtifactApprovals(d) {
  const g2 = d;
  return {
    version: g2.version,
    latest_version: g2.latest_version,
    decided_count: g2.decided_count,
    total_required: g2.total_required,
    open_reviews: g2.open_reviews.map((r) => ({
      user_id: r.user_id ?? "",
      user_name: r.user_name ?? "",
      decided: r.decided
    })),
    decisions: g2.decisions.map((dec) => ({
      user_name: dec.user_name,
      decision: dec.decision,
      decided: true
    }))
  };
}
function mapArtifactReview(d) {
  const g2 = d;
  return {
    version: g2.version,
    review_state: g2.review_state,
    reviewers: g2.reviewers.map((r) => ({
      user_id: r.user_id,
      user_name: r.user_name,
      status: r.status
    })),
    review_artifacts: g2.review_artifacts.map((a) => ({ title: a.title })),
    initiator: g2.initiator ? { user_id: g2.initiator.user_id, user_name: g2.initiator.user_name } : null,
    review_started_at: g2.review_started_at,
    review_deadline_at: g2.review_deadline_at,
    is_initiator: g2.is_initiator
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

// src/engineering-sync.ts
var SPACE_SLUG = "engineering-foundation";
function resolveRepoRoot() {
  try {
    if (typeof __dirname !== "undefined") {
      return resolve(__dirname, "..", "..", "..", "..");
    }
  } catch {
  }
  try {
    const url = import.meta.url;
    if (url) {
      const { fileURLToPath } = __require("node:url");
      const { dirname: dirname3 } = __require("node:path");
      return resolve(dirname3(fileURLToPath(url)), "..", "..", "..", "..", "..", "src").replace(/\/src$/, "");
    }
  } catch {
  }
  return process.cwd();
}
var REPO_ROOT = resolveRepoRoot();
var MIRROR_ROOT = join3(REPO_ROOT, "skills", "core", "engineering-foundation", "resources");
var MANIFEST_PATH = join3(REPO_ROOT, ".pi", "engineering-foundation.json");
var OLD_REMOTE_SUFFIX = ".OLD_REMOTE";
var NEW_REMOTE_SUFFIX = ".NEW_REMOTE";
var CURRENT_SUFFIX = ".CURRENT";
var IGNORE_SUFFIX = ".IGNORE";
var AUTHORED_ROUTER_PATH = join3(REPO_ROOT, "skills", "core", "engineering-foundation", "SKILL.md");
function fail(msg, code = 2) {
  console.error(`engineering-sync: error: ${msg}`);
  process.exit(code);
}
function info(msg) {
  console.error(`engineering-sync: ${msg}`);
}
function emptyManifest() {
  return { version: 1, space: SPACE_SLUG, entries: {} };
}
function loadManifest() {
  if (!existsSync3(MANIFEST_PATH)) return emptyManifest();
  try {
    const raw = JSON.parse(readFileSync2(MANIFEST_PATH, "utf8"));
    if (typeof raw !== "object" || raw === null || typeof raw.entries !== "object") {
      fail(`manifest at ${MANIFEST_PATH} is not a valid manifest object`);
    }
    return raw;
  } catch (e) {
    fail(`failed to read manifest at ${MANIFEST_PATH}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
function saveManifest(m2) {
  mkdirSync(dirname2(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m2, null, 2) + "\n", "utf8");
  info(`updated ${relative(REPO_ROOT, MANIFEST_PATH)} (${Object.keys(m2.entries).length} entries)`);
}
function sha256(data) {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}
function parseBlueprintManifest(content) {
  const parsed = load(content);
  const list = parsed.entries ?? parsed.files ?? parsed.blocks ?? [];
  if (!Array.isArray(list)) return [];
  return list.filter((e) => e && typeof e.path === "string");
}
async function fetchBlueprintItems(client2, manifest) {
  const items = [];
  const files = /* @__PURE__ */ new Map();
  const manifestRes = await client2.getBlueprintFiles({ path: "blueprint/manifest.yaml" });
  const manifestFile = manifestRes.files.find((f) => f.path === "blueprint/manifest.yaml" || f.filename === "manifest.yaml");
  if (manifestFile) {
    files.set(manifestFile.path, manifestFile);
    items.push({
      key: manifestFile.path,
      source: "blueprint",
      localPath: join3("skills/core/engineering-foundation/resources/blueprint/manifest.yaml"),
      remoteSha256: manifestFile.checksum,
      auraChecksumOrVersion: manifestFile.checksum,
      auraUpdatedAt: manifestFile.provenance.source_commit_sha ?? ""
    });
  }
  if (!manifestFile) {
    info("warning: blueprint/manifest.yaml not found on wiki; skipping blueprint file enumeration");
    return { items, files };
  }
  const manifestEntries = parseBlueprintManifest(manifestFile.content);
  for (const entry of manifestEntries) {
    const rawPath = entry.path.replace(/\/+$/, "");
    const bpPath = rawPath.startsWith("blueprint/") ? rawPath : `blueprint/${rawPath}`;
    let res;
    try {
      res = await client2.getBlueprintFiles({ path: bpPath });
    } catch (e) {
      info(`warning: getBlueprintFiles(${bpPath}) failed: ${e instanceof Error ? e.message : String(e)} \u2014 skipping`);
      continue;
    }
    for (const f of res.files) {
      if (files.has(f.path)) continue;
      const existing = manifest.entries[f.path];
      const ignored = existing?.ignored === true;
      files.set(f.path, f);
      items.push({
        key: f.path,
        source: "blueprint",
        localPath: blueprintPathToLocal(f.path, f.filename),
        remoteSha256: f.checksum,
        auraChecksumOrVersion: f.checksum,
        auraUpdatedAt: f.provenance.source_commit_sha ?? "",
        ignored
      });
    }
  }
  return { items, files };
}
function blueprintPathToLocal(bpPath, filename) {
  const under = bpPath.replace(/^blueprint\//, "");
  const dir = dirname2(under);
  const localName = filename || basename(under);
  if (under.startsWith("rules/")) {
    return join3("skills/core/engineering-foundation/resources/rules", localName);
  }
  if (under.startsWith("skills/")) {
    return join3("skills/engineering-foundation", dir.replace(/^skills\//, ""), localName);
  }
  return join3("skills/core/engineering-foundation/resources/blueprint", under);
}
async function fetchWikiItems(client2, manifest) {
  const tree = await client2.getKnowledgeTree(SPACE_SLUG);
  const items = [];
  const walk = (nodes, parentSlugPath) => {
    for (const node of nodes) {
      const slugPath = [...parentSlugPath, node.slug];
      if (node.kind === "FOLDER") {
        const children = node.children ?? [];
        walk(children, slugPath);
        continue;
      }
      const localPath = wikiNodeToLocalPath(slugPath, node);
      if (!localPath) continue;
      const existing = manifest.entries[node.id];
      const ignored = existing?.ignored === true;
      items.push({
        key: node.id,
        source: "wiki-doc",
        localPath,
        kind: node.kind,
        slug: slugPath.join("/"),
        ignored
      });
    }
  };
  walk(tree.nodes, []);
  return items;
}
function wikiNodeToLocalPath(slugPath, _node) {
  if (slugPath.length === 0) return void 0;
  const top = slugPath[0];
  const rest = slugPath.slice(1).join("/");
  if (slugPath.length === 1 && (top === "index" || top === "log")) {
    return join3("skills/core/engineering-foundation/resources", top === "index" ? "INDEX.md" : "Log.md");
  }
  if (top === "blueprint") return void 0;
  if (top === "guides" || top === "workflow" || top === "rules") {
    return join3("skills/core/engineering-foundation/resources", top, rest + ".md");
  }
  return join3("skills/core/engineering-foundation/resources", slugPath.join("/"));
}
function flattenTreeNodes(nodes, parentSlugPath = []) {
  const out = [];
  for (const node of nodes) {
    const slugPath = [...parentSlugPath, node.slug];
    if (node.kind === "FOLDER") {
      const children = node.children ?? [];
      out.push(...flattenTreeNodes(children, slugPath));
    } else {
      out.push({ node, slugPath });
    }
  }
  return out;
}
function flattenTreeSlugs(nodes, parentSlugPath = []) {
  return flattenTreeNodes(nodes, parentSlugPath).map((f) => f.slugPath.join("/"));
}
function consumeIgnoreTombstones(tombstonePaths, items, _repoRoot) {
  const consumed = [];
  for (const tombstone of tombstonePaths) {
    const reason = readFileSync2(tombstone, "utf8").trim() || "ignored during reconciliation";
    const stem = basename(tombstone).slice(0, -IGNORE_SUFFIX.length);
    const matchingItem = items.find((it) => {
      const b = basename(it.localPath);
      const dot = b.lastIndexOf(".");
      return (dot > 0 ? b.slice(0, dot) : b) === stem;
    });
    if (!matchingItem) continue;
    consumed.push({ tombstonePath: tombstone, item: matchingItem, reason });
  }
  return consumed;
}
function suffixed(localAbs, suffix) {
  const dir = dirname2(localAbs);
  const base = basename(localAbs);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  return join3(dir, stem + suffix + ext);
}
function hasSuffix(localAbs) {
  const b = basename(localAbs);
  if (b.includes(".OLD_REMOTE")) return "OLD_REMOTE";
  if (b.includes(".NEW_REMOTE")) return "NEW_REMOTE";
  if (b.includes(".CURRENT")) return "CURRENT";
  if (b.endsWith(IGNORE_SUFFIX)) return "IGNORE";
  return null;
}
async function fetchCmd() {
  const client2 = await createDefaultAuraClient();
  const manifest = loadManifest();
  info(`mirror root: ${relative(REPO_ROOT, MIRROR_ROOT)}`);
  info(`manifest: ${existsSync3(MANIFEST_PATH) ? relative(REPO_ROOT, MANIFEST_PATH) : "(absent \u2014 initial seeding)"}`);
  const { items: bpItems, files: bpFiles } = await fetchBlueprintItems(client2, manifest);
  const wikiItems = await fetchWikiItems(client2, manifest);
  const remoteItems = /* @__PURE__ */ new Map();
  for (const it of [...bpItems, ...wikiItems]) remoteItems.set(it.key, it);
  const report = {
    added: [],
    edited: [],
    deleted: [],
    unchanged: [],
    ignored: [],
    newHashes: {}
  };
  for (const item of remoteItems.values()) {
    if (item.ignored) {
      report.ignored.push(item.key);
      continue;
    }
    const localAbs = join3(REPO_ROOT, item.localPath);
    const existing = manifest.entries[item.key];
    const remoteSha = item.remoteSha256;
    let remoteBody;
    let remoteShaResolved = remoteSha;
    let auraUpdatedAt = item.auraUpdatedAt ?? "";
    let auraVer = item.auraChecksumOrVersion ?? "";
    if (item.source === "wiki-doc") {
      const node = await client2.getKnowledgeNode(item.key);
      remoteBody = node.body ?? "";
      remoteShaResolved = node.body_hash ? "sha256:" + node.body_hash : sha256(remoteBody);
      auraVer = String(node.latest_version ?? 0);
      const updated = node.updated_at;
      if (updated) auraUpdatedAt = updated;
    }
    if (remoteShaResolved) report.newHashes[item.key] = remoteShaResolved;
    const localExists = existsSync3(localAbs);
    const recordedSha = existing?.sourceSha256;
    if (!localExists && !existing) {
      mkdirSync(dirname2(localAbs), { recursive: true });
      writeSuffixed(localAbs, NEW_REMOTE_SUFFIX, remoteBody ?? readBlueprintContent(bpFiles, item.key));
      report.added.push(item.localPath);
      info(`ADD  ${item.localPath}  -> ${basename(suffixed(localAbs, NEW_REMOTE_SUFFIX))}`);
    } else if (localExists) {
      const isUnchanged = recordedSha && remoteShaResolved && recordedSha === remoteShaResolved;
      if (isUnchanged && !existing?.adaptedSha256) {
        report.unchanged.push(item.localPath);
        continue;
      }
      const currentPath = suffixed(localAbs, CURRENT_SUFFIX);
      if (!existsSync3(currentPath)) {
        renameSyncSafe(localAbs, currentPath);
      } else {
        rmSync(localAbs, { force: true });
      }
      if (existing?.sourceSha256) {
        const oldBody = await fetchOldRemote(client2, item, existing);
        writeSuffixed(localAbs, OLD_REMOTE_SUFFIX, oldBody ?? "");
      }
      writeSuffixed(localAbs, NEW_REMOTE_SUFFIX, remoteBody ?? readBlueprintContent(bpFiles, item.key));
      report.edited.push(item.localPath);
      info(`EDIT ${item.localPath}  -> ${basename(suffixed(localAbs, NEW_REMOTE_SUFFIX))}`);
    } else {
      mkdirSync(dirname2(localAbs), { recursive: true });
      writeSuffixed(localAbs, NEW_REMOTE_SUFFIX, remoteBody ?? readBlueprintContent(bpFiles, item.key));
      report.added.push(item.localPath);
      info(`ADD  ${item.localPath} (local missing, manifest had entry) -> ${basename(suffixed(localAbs, NEW_REMOTE_SUFFIX))}`);
    }
    item.remoteSha256 = remoteShaResolved;
    item.auraChecksumOrVersion = auraVer;
    item.auraUpdatedAt = auraUpdatedAt;
  }
  for (const [key, entry] of Object.entries(manifest.entries)) {
    if (entry.ignored) continue;
    if (entry.authored) continue;
    if (!remoteItems.has(key)) {
      const localAbs = join3(REPO_ROOT, entry.localPath);
      if (existsSync3(localAbs)) {
        rmSync(localAbs, { force: true });
        info(`DELETE ${entry.localPath} (removed on wiki; git history preserves)`);
      }
      for (const suffix of [OLD_REMOTE_SUFFIX, NEW_REMOTE_SUFFIX, CURRENT_SUFFIX]) {
        const p = suffixed(localAbs, suffix);
        if (existsSync3(p)) rmSync(p, { force: true });
      }
      report.deleted.push(entry.localPath);
    }
  }
  await surfaceAuthoredDiff(client2, manifest, report);
  const reportPath = join3(REPO_ROOT, ".pi", "engineering-sync-fetch-report.json");
  mkdirSync(dirname2(reportPath), { recursive: true });
  const enrichedReport = {
    ...report,
    items: Array.from(remoteItems.values()).map((it) => ({
      key: it.key,
      source: it.source,
      localPath: it.localPath,
      remoteSha256: it.remoteSha256,
      auraChecksumOrVersion: it.auraChecksumOrVersion,
      auraUpdatedAt: it.auraUpdatedAt,
      kind: it.kind,
      slug: it.slug
    }))
  };
  writeFileSync(reportPath, JSON.stringify(enrichedReport, null, 2) + "\n", "utf8");
  info(`wrote ${relative(REPO_ROOT, reportPath)}`);
  info("");
  info("summary:");
  info(`  added:    ${report.added.length}`);
  info(`  edited:   ${report.edited.length}`);
  info(`  deleted:   ${report.deleted.length}`);
  info(`  unchanged: ${report.unchanged.length}`);
  info(`  ignored:   ${report.ignored.length}`);
  if (report.added.length + report.edited.length > 0) {
    info("");
    info("next: reconcile the three-way clusters (OLD_REMOTE + NEW_REMOTE + CURRENT),");
    info("      then run `finish`.");
  } else if (report.deleted.length > 0) {
    info("");
    info("next: commit the deletions, then run `finish`.");
  } else {
    info("");
    info("nothing to reconcile; run `finish` to confirm (or stop here).");
  }
}
async function fetchOldRemote(client2, item, entry) {
  if (item.source === "wiki-doc") {
    const ver = Number(entry.auraChecksumOrVersion);
    if (!Number.isFinite(ver) || ver <= 0) return void 0;
    try {
      const v2 = await client2.getKnowledgeNodeVersion(item.key, ver);
      return v2.body;
    } catch {
      return void 0;
    }
  }
  try {
    const res = await client2.getBlueprintFiles({ path: item.key, version: entry.sourceSha256 });
    return res.files.find((f) => f.path === item.key)?.content;
  } catch {
    return void 0;
  }
}
function readBlueprintContent(files, key) {
  return files.get(key)?.content ?? "";
}
async function surfaceAuthoredDiff(client2, manifest, report) {
  if (!existsSync3(AUTHORED_ROUTER_PATH)) return;
  const routerEntry = Object.values(manifest.entries).find((e) => e.authored && e.localPath === relative(REPO_ROOT, AUTHORED_ROUTER_PATH));
  if (!routerEntry) return;
  const tree = await client2.getKnowledgeTree(SPACE_SLUG);
  const structureSlugs = flattenTreeSlugs(tree.nodes).sort().join("\n");
  const structureSha = sha256(structureSlugs);
  if (routerEntry.sourceSha256 === structureSha) return;
  const routerAbs = AUTHORED_ROUTER_PATH;
  const currentPath = suffixed(routerAbs, CURRENT_SUFFIX);
  if (!existsSync3(currentPath)) renameSyncSafe(routerAbs, currentPath);
  const flatNodes = flattenTreeNodes(tree.nodes);
  const digest = `# engineering-foundation wiki structure (NEW_REMOTE)

The wiki's structure has changed since the router was last reconciled.
Reconcile the routing table in the router SKILL.md against the structure below.

## Structural signature

${structureSha}

## Nodes (slug | kind | title)

` + flatNodes.map((n) => `- ${n.slugPath.join("/")} | ${n.node.kind} | ${n.node.title}`).join("\n") + "\n";
  writeSuffixed(routerAbs, NEW_REMOTE_SUFFIX, digest);
  report.edited.push(relative(REPO_ROOT, routerAbs));
  info(`EDIT (authored) ${relative(REPO_ROOT, routerAbs)} -> router reconciliation needed`);
  routerEntry._newStructureSha = structureSha;
}
function scanThreeWay(dir) {
  const found = [];
  if (!existsSync3(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join3(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...scanThreeWay(p));
    } else if (entry.isFile() && hasSuffix(p)) {
      found.push(p);
    }
  }
  return found;
}
async function finishCmd() {
  const tombstoneStems = /* @__PURE__ */ new Set();
  for (const p of scanThreeWay(MIRROR_ROOT)) {
    if (hasSuffix(p) === "IGNORE") {
      const b = basename(p);
      tombstoneStems.add(b.slice(0, -IGNORE_SUFFIX.length));
    }
  }
  const isPairedWithTombstone = (p) => {
    if (hasSuffix(p) !== "NEW_REMOTE") return false;
    const b = basename(p);
    const marker = b.indexOf(".NEW_REMOTE");
    const stem = marker > 0 ? b.slice(0, marker) : b;
    return tombstoneStems.has(stem);
  };
  const mirrorThreeWay = scanThreeWay(MIRROR_ROOT).filter(
    (p) => hasSuffix(p) !== "IGNORE" && !isPairedWithTombstone(p)
  );
  const routerThreeWay = scanThreeWay(dirname2(AUTHORED_ROUTER_PATH)).filter(
    (p) => hasSuffix(p) && p.startsWith(dirname2(AUTHORED_ROUTER_PATH)) && hasSuffix(p) !== "IGNORE" && !isPairedWithTombstone(p)
  );
  const allThreeWay = Array.from(/* @__PURE__ */ new Set([...mirrorThreeWay, ...routerThreeWay])).filter((p) => {
    const s = hasSuffix(p);
    return s === "OLD_REMOTE" || s === "NEW_REMOTE" || s === "CURRENT";
  });
  if (allThreeWay.length > 0) {
    info("refusing: incomplete reconciliation \u2014 unresolved three-way files remain:");
    for (const p of allThreeWay) info(`  ${relative(REPO_ROOT, p)}`);
    fail("run `fetch` again after reconciling all OLD_REMOTE/NEW_REMOTE/CURRENT clusters", 1);
  }
  const manifest = loadManifest();
  const reportPath = join3(REPO_ROOT, ".pi", "engineering-sync-fetch-report.json");
  let report;
  if (existsSync3(reportPath)) {
    report = JSON.parse(readFileSync2(reportPath, "utf8"));
  } else {
    info("no fetch report found; nothing to apply (manifest unchanged)");
    return;
  }
  const tombstones = scanThreeWay(MIRROR_ROOT).filter((p) => hasSuffix(p) === "IGNORE");
  const ignoredKeys = /* @__PURE__ */ new Set();
  const consumed = consumeIgnoreTombstones(tombstones, report.items ?? [], REPO_ROOT);
  for (const c of consumed) {
    const entry = {
      wikiPathOrUuid: c.item.key,
      localPath: c.item.localPath,
      sourceSha256: c.item.remoteSha256 ?? "",
      auraChecksumOrVersion: c.item.auraChecksumOrVersion ?? "",
      auraUpdatedAt: c.item.auraUpdatedAt ?? "",
      kind: c.item.kind,
      slug: c.item.slug,
      ignored: true,
      ignoreReason: c.reason
    };
    manifest.entries[c.item.key] = entry;
    ignoredKeys.add(c.item.key);
    rmSync(c.tombstonePath, { force: true });
    const newRemote = suffixed(join3(REPO_ROOT, c.item.localPath), NEW_REMOTE_SUFFIX);
    if (existsSync3(newRemote)) rmSync(newRemote, { force: true });
    info(`manifest: marked ${c.item.key} ignored (${c.item.localPath})`);
  }
  for (const t of tombstones) {
    if (!consumed.some((c) => c.tombstonePath === t)) {
      info(`warning: ${relative(REPO_ROOT, t)} has no matching staged item \u2014 leaving it`);
    }
  }
  if (report.deleted) {
    for (const localPath of report.deleted) {
      const key = findKeyByLocalPath(manifest, localPath);
      if (key) {
        delete manifest.entries[key];
        info(`manifest: removed ${key} (${localPath})`);
      }
    }
  }
  if (report.items) {
    for (const it of report.items) {
      if (it.ignored) continue;
      if (ignoredKeys.has(it.key)) continue;
      const localAbs = join3(REPO_ROOT, it.localPath);
      if (!existsSync3(localAbs)) {
        info(`manifest: skip ${it.key} \u2014 local file ${it.localPath} missing after reconciliation`);
        continue;
      }
      const body = readFileSync2(localAbs, "utf8");
      const adapted = sha256(body);
      const existing = manifest.entries[it.key];
      const entry = {
        wikiPathOrUuid: it.key,
        localPath: it.localPath,
        sourceSha256: it.remoteSha256 ?? existing?.sourceSha256 ?? "",
        auraChecksumOrVersion: it.auraChecksumOrVersion ?? existing?.auraChecksumOrVersion ?? "",
        auraUpdatedAt: it.auraUpdatedAt ?? existing?.auraUpdatedAt ?? "",
        kind: it.kind,
        slug: it.slug
      };
      if (adapted !== entry.sourceSha256) {
        entry.adaptedSha256 = adapted;
      }
      if (existing?.authored) entry.authored = true;
      manifest.entries[it.key] = entry;
    }
  }
  if (existsSync3(AUTHORED_ROUTER_PATH)) {
    const routerKey = Object.keys(manifest.entries).find(
      (k2) => manifest.entries[k2].authored && manifest.entries[k2].localPath === relative(REPO_ROOT, AUTHORED_ROUTER_PATH)
    );
    if (routerKey) {
      try {
        const client2 = await createDefaultAuraClient();
        const tree = await client2.getKnowledgeTree(SPACE_SLUG);
        const structureSlugs = flattenTreeSlugs(tree.nodes).sort().join("\n");
        manifest.entries[routerKey].sourceSha256 = sha256(structureSlugs);
        manifest.entries[routerKey].auraUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
      } catch {
        info("warning: could not refresh authored router structure signature");
      }
    } else {
      try {
        const client2 = await createDefaultAuraClient();
        const tree = await client2.getKnowledgeTree(SPACE_SLUG);
        const structureSlugs = flattenTreeSlugs(tree.nodes).sort().join("\n");
        const key = relative(REPO_ROOT, AUTHORED_ROUTER_PATH);
        manifest.entries[key] = {
          wikiPathOrUuid: key,
          localPath: key,
          sourceSha256: sha256(structureSlugs),
          auraChecksumOrVersion: "",
          auraUpdatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          authored: true
        };
        info(`manifest: bootstrapped authored router entry (${key})`);
      } catch {
        info("warning: could not bootstrap authored router structure signature");
      }
    }
  }
  saveManifest(manifest);
  rmSync(reportPath, { force: true });
  info("finish: manifest updated; three-way files cleared.");
}
function findKeyByLocalPath(manifest, localPath) {
  for (const [k2, e] of Object.entries(manifest.entries)) {
    if (e.localPath === localPath) return k2;
  }
  return void 0;
}
async function statusCmd() {
  const manifest = loadManifest();
  if (Object.keys(manifest.entries).length === 0) {
    info("manifest is empty or absent (initial seeding not yet run).");
    return;
  }
  const stray = scanThreeWay(MIRROR_ROOT);
  if (stray.length > 0) {
    info(`warning: ${stray.length} unresolved three-way file(s) in mirror \u2014 run \`fetch\` then reconcile, then \`finish\`.`);
    for (const p of stray.slice(0, 10)) info(`  ${relative(REPO_ROOT, p)}`);
  } else {
    info("no unresolved three-way files in mirror.");
  }
  const counts = { verbatim: 0, adapted: 0, ignored: 0, authored: 0 };
  for (const e of Object.values(manifest.entries)) {
    if (e.ignored) counts.ignored++;
    else if (e.authored) counts.authored++;
    else if (e.adaptedSha256) counts.adapted++;
    else counts.verbatim++;
  }
  info(`manifest: ${Object.keys(manifest.entries).length} entries (verbatim ${counts.verbatim}, adapted ${counts.adapted}, authored ${counts.authored}, ignored ${counts.ignored})`);
}
function writeSuffixed(localAbs, suffix, content) {
  const p = suffixed(localAbs, suffix);
  mkdirSync(dirname2(p), { recursive: true });
  writeFileSync(p, content, "utf8");
}
function renameSyncSafe(from, to) {
  mkdirSync(dirname2(to), { recursive: true });
  rmSync(to, { force: true });
  renameSync(from, to);
}
function itemFiles(localAbs) {
  const candidates = [
    localAbs,
    suffixed(localAbs, OLD_REMOTE_SUFFIX),
    suffixed(localAbs, NEW_REMOTE_SUFFIX),
    suffixed(localAbs, CURRENT_SUFFIX),
    // The .IGNORE tombstone has no extension: <stem>.IGNORE
    join3(dirname2(localAbs), basename(localAbs).replace(/\.[^.]+$/, "") + IGNORE_SUFFIX)
  ];
  return candidates.filter((p) => existsSync3(p));
}
async function mvCmd(fromRel, toRel) {
  if (!fromRel || !toRel) fail("mv needs two repo-relative paths: <from> <to>", 2);
  const fromAbs = resolve(REPO_ROOT, fromRel);
  const toAbs = resolve(REPO_ROOT, toRel);
  if (!existsSync3(fromAbs)) fail(`source not found: ${fromRel}`, 1);
  if (hasSuffix(fromAbs)) fail(`source must be the plain name (no .OLD_REMOTE/.NEW_REMOTE/.CURRENT/.IGNORE suffix); got ${fromRel}`, 2);
  if (resolve(dirname2(toAbs)) === resolve(dirname2(fromAbs)) && basename(toAbs) === basename(fromAbs)) {
    fail("source and destination are the same path", 2);
  }
  const moved = itemFiles(fromAbs);
  if (moved.length === 0) fail(`no files found to move for ${fromRel}`, 1);
  for (const f of moved) {
    const isTombstone = f.endsWith(IGNORE_SUFFIX);
    const target = isTombstone ? join3(dirname2(toAbs), basename(toAbs).replace(/\.[^.]+$/, "") + IGNORE_SUFFIX) : suffixed(toAbs, hasSuffix(f) ?? "");
    renameSyncSafe(f, target);
    info(`mv ${relative(REPO_ROOT, f)} -> ${relative(REPO_ROOT, target)}`);
  }
  const reportPath = join3(REPO_ROOT, ".pi", "engineering-sync-fetch-report.json");
  if (!existsSync3(reportPath)) {
    info("warning: no fetch report found; move done on disk but not recorded for finish");
    info("         (run `fetch` first, or finish will not know the new path)");
    return;
  }
  const report = JSON.parse(readFileSync2(reportPath, "utf8"));
  const items = report.items ?? [];
  let matched;
  for (const it of items) {
    if (it.localPath === fromRel) {
      matched = it;
      break;
    }
  }
  if (!matched) {
    info(`warning: no fetch-report item has localPath ${fromRel}; move done on disk but not recorded`);
    info("         (was the path already moved, or not staged by this fetch?)");
    return;
  }
  matched.localPath = toRel;
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  info(`recorded move in ${relative(REPO_ROOT, reportPath)}: ${matched.key} -> ${toRel}`);
}
var USAGE = `Usage:
  node engineering-sync.mjs fetch     stage three-way files + new-hashes report
  node engineering-sync.mjs finish     gate (refuse on unresolved), then update manifest
  node engineering-sync.mjs status     read-only drift summary
  node engineering-sync.mjs mv <from> <to>   move a reconciled file + its diff files + .IGNORE tombstone to a new repo-relative path; records the move in the fetch report for finish`;
async function main() {
  const sub = process.argv[2];
  try {
    switch (sub) {
      case "fetch":
        await fetchCmd();
        return;
      case "finish":
        await finishCmd();
        return;
      case "status":
        await statusCmd();
        return;
      case "mv":
        await mvCmd(process.argv[3], process.argv[4]);
        return;
      default:
        console.error(USAGE);
        fail(sub ? `unknown subcommand "${sub}"` : "missing subcommand", 2);
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e), 1);
  }
}
function isMainEntry() {
  try {
    const url = import.meta.url;
    if (!url) return false;
    const { pathToFileURL } = __require("node:url");
    const entry = pathToFileURL(process.argv[1] ?? "").href;
    return url === entry;
  } catch {
    return false;
  }
}
if (isMainEntry()) {
  main().catch((e) => {
    console.error("engineering-sync failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
export {
  consumeIgnoreTombstones,
  hasSuffix,
  suffixed
};
