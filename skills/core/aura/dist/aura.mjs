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

// src/aura.ts
import { mkdirSync, writeFileSync, readFileSync as readFileSync2, rmSync, existsSync as existsSync3, readdirSync, statSync as statSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join3, resolve } from "node:path";
import { randomBytes as randomBytes2 } from "node:crypto";

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
  const repositories = "repositories" in g2 ? g2.repositories ?? [] : [];
  const inherited = "inherited_repositories" in g2 ? g2.inherited_repositories ?? [] : [];
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
    id: g2.id,
    human_key: g2.human_key,
    title: g2.title,
    description: g2.description,
    status: g2.status,
    status_type: g2.status_type,
    level: g2.level,
    jira_issues: jira.map((j2) => ({ issue_key: j2.issue_key, summary: j2.summary })),
    children: children.map((c) => ({ human_key: c.human_key, title: c.title })),
    repositories: repositories.map(mapRepo),
    inherited_repositories: inherited.map(mapRepo),
    suggested_branch: "suggested_branch" in g2 ? g2.suggested_branch ?? null : null
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
